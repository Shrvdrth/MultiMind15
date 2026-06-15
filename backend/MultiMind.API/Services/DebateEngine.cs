using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using MultiMind.API.Data;
using MultiMind.API.Models;
using OpenAI.Chat;

namespace MultiMind.API.Services;

public interface IDebateEngine
{
    Task<DebateSession> CreateSessionAsync(Guid userId, string prompt);
    Task RunDebateAsync(Guid sessionId, Guid userId, string prompt);
}

public class DebateEngine : IDebateEngine
{
    private readonly IAgentService _agentService;
    private readonly IModeratorService _moderatorService;
    private readonly AppDbContext _db;
    private readonly ILogger<DebateEngine> _logger;
    private readonly IDebateEventBus _eventBus;
    private readonly IUserInputWaiter _userInputWaiter;
    private readonly IApplicationLogService _appLog;
    private readonly IMemoryCache _cache;

    // Epic 11.4 — Budget: 3 (R1) + 3 (R2) + 1 (moderator) = 7 max AI calls per session
    private const int MaxAiCallsPerSession = 7;
    // Epic 11.3 — Cache key prefix and TTL for dedup
    private const string DedupPrefix = "dedup:";
    private static readonly TimeSpan DedupTtl = TimeSpan.FromMinutes(5);

    private static readonly string[] Agents = ["Strategist", "RiskAnalyst", "Engineer"];

    public DebateEngine(IAgentService agentService, IModeratorService moderatorService,
        AppDbContext db, ILogger<DebateEngine> logger, IDebateEventBus eventBus,
        IUserInputWaiter userInputWaiter, IApplicationLogService appLog, IMemoryCache cache)
    {
        _agentService = agentService;
        _moderatorService = moderatorService;
        _db = db;
        _logger = logger;
        _eventBus = eventBus;
        _userInputWaiter = userInputWaiter;
        _appLog = appLog;
        _cache = cache;
    }

    // Epic 11.5 — Log every AI call; stream chunks via EventBus if channel exists
    private async Task<string> CallAndLogAsync(Guid userId, Guid sessionId, string agentType,
        List<ChatMessage> history, string userMessage)
    {
        string response;
        int tokensUsed = 0;
        var sw = Stopwatch.StartNew();
        _logger.LogInformation("[DebateEngine] Agent {AgentType} starting for session {SessionId}", agentType, sessionId);

        if (_eventBus.HasChannel(sessionId))
        {
            // Streaming path — publish chunks as they arrive
            await _eventBus.PublishAsync(sessionId, new DebateStreamEvent(
                DebateEventType.AgentStart, sessionId, AgentType: agentType));

            using var callCts = new CancellationTokenSource(TimeSpan.FromSeconds(90));
            var sb = new System.Text.StringBuilder();
            await foreach (var chunk in _agentService.GetResponseStreamingAsync(
                agentType, history, userMessage,
                onTokensUsed: t => tokensUsed = t,
                ct: callCts.Token))
            {
                sb.Append(chunk);
                await _eventBus.PublishAsync(sessionId, new DebateStreamEvent(
                    DebateEventType.AgentChunk, sessionId, AgentType: agentType, Text: chunk));
            }
            response = sb.ToString();

            await _eventBus.PublishAsync(sessionId, new DebateStreamEvent(
                DebateEventType.AgentDone, sessionId, AgentType: agentType, Text: response));
        }
        else
        {
            // Non-streaming path (fallback / tests)
            (response, tokensUsed) = await _agentService.GetResponseAsync(agentType, history, userMessage);
        }

        sw.Stop();

        _db.AiCallLogs.Add(new AiCallLog
        {
            UserId     = userId,
            SessionId  = sessionId,
            AgentType  = agentType,
            TokensUsed = tokensUsed
        });

        // Log to ApplicationLogs for admin visibility
        await _appLog.LogAsync(
            level:     "Info",
            category:  "AiCall",
            message:   $"Agent {agentType} completed for session {sessionId} ({tokensUsed} tokens)",
            details:   null,
            userId:    userId.ToString(),
            path:      $"/debate/{sessionId}",
            durationMs: sw.ElapsedMilliseconds);

        return response;
    }

    public async Task<DebateSession> CreateSessionAsync(Guid userId, string prompt)
    {
        // Epic 11.3 — Check in-memory cache first (avoids DB roundtrip for rapid resubmissions)
        var normalizedPrompt = prompt.Trim();
        var promptHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(normalizedPrompt)));
        var cacheKey = $"{DedupPrefix}{userId}:{promptHash}";

        if (_cache.TryGetValue(cacheKey, out DebateSession? cached) && cached is not null)
        {
            _logger.LogInformation("[DebateEngine] Cache hit — returning session {SessionId}", cached.Id);
            return cached;
        }

        // Cache miss — check DB for recent duplicate (handles multi-instance deployments)
        var recentDuplicate = await _db.DebateSessions
            .Where(s => s.UserId == userId &&
                        s.OriginalPrompt == normalizedPrompt &&
                        s.Status == "running" &&
                        s.CreatedAt > DateTime.UtcNow.AddMinutes(-5))
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync();

        if (recentDuplicate != null)
        {
            _cache.Set(cacheKey, recentDuplicate, DedupTtl);
            _logger.LogInformation("[DebateEngine] DB hit — returning cached session {SessionId}", recentDuplicate.Id);
            return recentDuplicate;
        }

        // Epic 11.4 — Enforce hourly rate limit
        var recentCallCount = await _db.AiCallLogs
            .CountAsync(l => l.UserId == userId &&
                             l.CreatedAt > DateTime.UtcNow.AddHours(-1));
        if (recentCallCount >= MaxAiCallsPerSession * 10)
            throw new InvalidOperationException("Rate limit reached. Please wait before starting a new debate.");

        var session = new DebateSession
        {
            UserId = userId,
            OriginalPrompt = prompt,
            Status = "running"
        };
        _db.DebateSessions.Add(session);
        await _db.SaveChangesAsync();

        // Populate cache so subsequent duplicate requests within 5 min skip the DB
        _cache.Set(cacheKey, session, DedupTtl);

        return session;
    }

    public async Task RunDebateAsync(Guid sessionId, Guid userId, string prompt)
    {
        _logger.LogInformation("[DebateEngine] Starting debate session {SessionId}", sessionId);
        var session = await _db.DebateSessions.FindAsync(sessionId)
            ?? throw new InvalidOperationException("Session not found.");

        // Isolated memory per agent (Epic 5)
        var agentHistories = new Dictionary<string, List<ChatMessage>>
        {
            ["Strategist"] = new(),
            ["RiskAnalyst"] = new(),
            ["Engineer"] = new()
        };

        var transcript = new List<DebateTranscriptEntry>();

        try
        {
            // ── Round 1: Sequential — each agent responds independently ──
            await _eventBus.PublishAsync(sessionId, new DebateStreamEvent(
                DebateEventType.RoundStart, sessionId, Round: 1));

            var round1 = new DebateRound { SessionId = session.Id, RoundNumber = 1 };
            _db.DebateRounds.Add(round1);
            await _db.SaveChangesAsync();

            var isFirstAgent = true;
            foreach (var agent in Agents)
            {
                if (!isFirstAgent) await Task.Delay(TimeSpan.FromSeconds(1));
                isFirstAgent = false;
                var response = await CallAndLogAsync(userId, session.Id, agent, agentHistories[agent], prompt);
                _db.AgentResponses.Add(new AgentResponse
                {
                    RoundId = round1.Id,
                    AgentType = agent,
                    ResponseText = response
                });
                agentHistories[agent].Add(new AssistantChatMessage(response));
                transcript.Add(new DebateTranscriptEntry(1, agent, response));
            }
            await _db.SaveChangesAsync();

            await _eventBus.PublishAsync(sessionId, new DebateStreamEvent(
                DebateEventType.RoundEnd, sessionId, Round: 1));

            // ── Wait for user input (up to 5 minutes) ──
            await _eventBus.PublishAsync(sessionId, new DebateStreamEvent(
                DebateEventType.WaitingForUserInput, sessionId));

            string? userInput = null;
            using (var inputCts = new CancellationTokenSource(TimeSpan.FromMinutes(5)))
            {
                userInput = await _userInputWaiter.WaitAsync(sessionId, inputCts.Token);
            }

            if (!string.IsNullOrWhiteSpace(userInput))
            {
                session.UserInput = userInput;
                session.UserInputSubmittedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();

                await _eventBus.PublishAsync(sessionId, new DebateStreamEvent(
                    DebateEventType.UserInputReceived, sessionId, Text: userInput));
            }

            // ── Round 2: Sequential — agents challenge each other ──
            await _eventBus.PublishAsync(sessionId, new DebateStreamEvent(
                DebateEventType.RoundStart, sessionId, Round: 2));

            var round2 = new DebateRound { SessionId = session.Id, RoundNumber = 2 };
            _db.DebateRounds.Add(round2);
            await _db.SaveChangesAsync();

            // Summarize other agents' Round 1 outputs (Epic 5.2)
            var round1Summary = string.Join("\n\n", transcript
                .Where(t => t.Round == 1)
                .Select(r => $"{r.AgentType} said: {r.Response}"));

            // Append user input context to all Round 2 prompts if provided
            var userContext = !string.IsNullOrWhiteSpace(userInput)
                ? $"\n\nThe user has added their perspective: \"{userInput}\"\nConsider this when forming your response."
                : string.Empty;

            // Strategist goes first
            var strategistR2Prompt = $"""
                The other agents have responded to the same question.
                Here are their perspectives (summarized):
                {round1Summary}

                Based on these, refine or defend your strategic position.
                Directly challenge any points that conflict with your analysis.
                {userContext}
                """;
            var strategistR2 = await CallAndLogAsync(
                userId, session.Id, "Strategist", agentHistories["Strategist"], strategistR2Prompt);
            agentHistories["Strategist"].Add(new AssistantChatMessage(strategistR2));
            transcript.Add(new DebateTranscriptEntry(2, "Strategist", strategistR2));
            _db.AgentResponses.Add(new AgentResponse
            {
                RoundId = round2.Id, AgentType = "Strategist", ResponseText = strategistR2
            });

            await Task.Delay(TimeSpan.FromSeconds(1));

            // Risk Analyst critiques Strategist + Engineer
            var riskR2Prompt = $"""
                Round 1 responses from all agents:
                {round1Summary}

                Strategist has now refined their position:
                {strategistR2}

                Challenge the Strategist's position and the Engineer's assumptions.
                Identify the risks being ignored or downplayed.
                {userContext}
                """;
            var riskR2 = await CallAndLogAsync(
                userId, session.Id, "RiskAnalyst", agentHistories["RiskAnalyst"], riskR2Prompt);
            agentHistories["RiskAnalyst"].Add(new AssistantChatMessage(riskR2));
            transcript.Add(new DebateTranscriptEntry(2, "RiskAnalyst", riskR2));
            _db.AgentResponses.Add(new AgentResponse
            {
                RoundId = round2.Id, AgentType = "RiskAnalyst", ResponseText = riskR2
            });

            await Task.Delay(TimeSpan.FromSeconds(1));

            // Engineer responds with counterpoints
            var engineerR2Prompt = $"""
                Round 1 responses from all agents:
                {round1Summary}

                Risk Analyst's critique:
                {riskR2}

                Respond to the Risk Analyst's concerns from a technical implementation perspective.
                Provide concrete counterpoints or acknowledge valid concerns with solutions.
                {userContext}
                """;
            var engineerR2 = await CallAndLogAsync(
                userId, session.Id, "Engineer", agentHistories["Engineer"], engineerR2Prompt);

            agentHistories["Engineer"].Add(new AssistantChatMessage(engineerR2));
            transcript.Add(new DebateTranscriptEntry(2, "Engineer", engineerR2));
            _db.AgentResponses.Add(new AgentResponse
            {
                RoundId = round2.Id, AgentType = "Engineer", ResponseText = engineerR2
            });
            await _db.SaveChangesAsync();

            await _eventBus.PublishAsync(sessionId, new DebateStreamEvent(
                DebateEventType.RoundEnd, sessionId, Round: 2));

            // ── Moderator Stage: Synthesize full transcript ──
            await _eventBus.PublishAsync(sessionId, new DebateStreamEvent(
                DebateEventType.ModeratorStart, sessionId, AgentType: "Moderator"));

            var swMod = Stopwatch.StartNew();
            var (synthesis, modTokens) = await _moderatorService.SynthesizeAsync(prompt, transcript);
            swMod.Stop();

            _db.AiCallLogs.Add(new AiCallLog
            {
                UserId     = userId,
                SessionId  = sessionId,
                AgentType  = "Moderator",
                TokensUsed = modTokens
            });

            await _appLog.LogAsync(
                level:     "Info",
                category:  "AiCall",
                message:   $"Moderator completed for session {sessionId} ({modTokens} tokens)",
                userId:    userId.ToString(),
                path:      $"/debate/{sessionId}",
                durationMs: swMod.ElapsedMilliseconds);

            var moderatorSynthesis = new ModeratorSynthesis
            {
                SessionId                = session.Id,
                Recommendation           = synthesis.Recommendation,
                ConfidenceScore          = synthesis.ConfidenceScore,
                KeyDissentingViewpoints  = synthesis.KeyDissentingViewpoints,
                FullSynthesis            = synthesis.FullSynthesis
            };
            _db.ModeratorSyntheses.Add(moderatorSynthesis);

            session.Status = "completed";
            await _db.SaveChangesAsync();

            // Stream moderator synthesis prose character by character so the UI types it out live
            const int modChunkSize = 3;
            var synthText = synthesis.FullSynthesis ?? "";
            for (int ci = 0; ci < synthText.Length; ci += modChunkSize)
            {
                var modChunk = synthText.Substring(ci, Math.Min(modChunkSize, synthText.Length - ci));
                await _eventBus.PublishAsync(sessionId, new DebateStreamEvent(
                    DebateEventType.ModeratorChunk, sessionId, Text: modChunk));
                await Task.Delay(8);
            }

            await _eventBus.PublishAsync(sessionId, new DebateStreamEvent(
                DebateEventType.ModeratorDone, sessionId));

            await _eventBus.PublishAsync(sessionId, new DebateStreamEvent(
                DebateEventType.DebateComplete, sessionId,
                Text: System.Text.Json.JsonSerializer.Serialize(new
                {
                    confidenceScore = synthesis.ConfidenceScore,
                    recommendation  = synthesis.Recommendation
                })));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[DebateEngine] Debate session {SessionId} failed: {Message}", sessionId, ex.Message);
            session.Status = "failed";
            await _db.SaveChangesAsync();
            await _eventBus.PublishAsync(sessionId, new DebateStreamEvent(
                DebateEventType.Error, sessionId, Text: "Debate failed: " + ex.Message));
            throw;
        }
        finally
        {
            _userInputWaiter.Cancel(sessionId);
            _eventBus.CloseChannel(sessionId);
        }
    }
}
