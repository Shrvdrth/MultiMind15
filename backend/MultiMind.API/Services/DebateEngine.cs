using Microsoft.EntityFrameworkCore;
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

    // Epic 11.4 — Budget: 3 (R1) + 3 (R2) + 1 (moderator) = 7 max AI calls per session
    private const int MaxAiCallsPerSession = 7;

    private static readonly string[] Agents = ["Strategist", "RiskAnalyst", "Engineer"];

    public DebateEngine(IAgentService agentService, IModeratorService moderatorService, AppDbContext db)
    {
        _agentService = agentService;
        _moderatorService = moderatorService;
        _db = db;
    }

    // Epic 11.5 — Log every AI call
    private async Task<string> CallAndLogAsync(Guid userId, Guid sessionId, string agentType,
        List<ChatMessage> history, string userMessage)
    {
        var response = await _agentService.GetResponseAsync(agentType, history, userMessage);

        _db.AiCallLogs.Add(new AiCallLog
        {
            UserId = userId,
            SessionId = sessionId,
            AgentType = agentType,
            TokensUsed = 0 // approximate — OpenRouter doesn't always return token counts
        });

        return response;
    }

    public async Task<DebateSession> CreateSessionAsync(Guid userId, string prompt)
    {
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
        return session;
    }

    public async Task RunDebateAsync(Guid sessionId, Guid userId, string prompt)
    {
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
            // ── Round 1: Parallel — each agent responds independently ──
            var round1 = new DebateRound { SessionId = session.Id, RoundNumber = 1 };
            _db.DebateRounds.Add(round1);
            await _db.SaveChangesAsync();

            var round1Tasks = Agents.Select(agent =>
                CallAndLogAsync(userId, session.Id, agent, agentHistories[agent], prompt)
                    .ContinueWith(t => (Agent: agent, Response: t.Result))
            );

            var round1Results = await Task.WhenAll(round1Tasks);

            foreach (var (agent, response) in round1Results)
            {
                _db.AgentResponses.Add(new AgentResponse
                {
                    RoundId = round1.Id,
                    AgentType = agent,
                    ResponseText = response
                });

                // Each agent only stores its own history (Epic 5 - isolated memory)
                agentHistories[agent].Add(new AssistantChatMessage(response));
                transcript.Add(new DebateTranscriptEntry(1, agent, response));
            }
            await _db.SaveChangesAsync();

            // ── Round 2: Sequential — agents challenge each other ──
            var round2 = new DebateRound { SessionId = session.Id, RoundNumber = 2 };
            _db.DebateRounds.Add(round2);
            await _db.SaveChangesAsync();

            // Summarize other agents' Round 1 outputs for controlled context (Epic 5.2)
            var round1Summary = string.Join("\n\n", round1Results.Select(r =>
                $"{r.Agent} said: {r.Response}"));

            // Strategist goes first
            var strategistR2Prompt = $"""
                The other agents have responded to the same question.
                Here are their perspectives (summarized):
                {round1Summary}

                Based on these, refine or defend your strategic position. 
                Directly challenge any points that conflict with your analysis.
                """;
            var strategistR2 = await CallAndLogAsync(
                userId, session.Id, "Strategist", agentHistories["Strategist"], strategistR2Prompt);
            agentHistories["Strategist"].Add(new AssistantChatMessage(strategistR2));
            transcript.Add(new DebateTranscriptEntry(2, "Strategist", strategistR2));
            _db.AgentResponses.Add(new AgentResponse
            {
                RoundId = round2.Id, AgentType = "Strategist", ResponseText = strategistR2
            });

            // Risk Analyst critiques Strategist + Engineer
            var riskR2Prompt = $"""
                Round 1 responses from all agents:
                {round1Summary}

                Strategist has now refined their position:
                {strategistR2}

                Challenge the Strategist's position and the Engineer's assumptions.
                Identify the risks being ignored or downplayed.
                """;
            var riskR2 = await CallAndLogAsync(
                userId, session.Id, "RiskAnalyst", agentHistories["RiskAnalyst"], riskR2Prompt);
            agentHistories["RiskAnalyst"].Add(new AssistantChatMessage(riskR2));
            transcript.Add(new DebateTranscriptEntry(2, "RiskAnalyst", riskR2));
            _db.AgentResponses.Add(new AgentResponse
            {
                RoundId = round2.Id, AgentType = "RiskAnalyst", ResponseText = riskR2
            });

            // Engineer responds with counterpoints
            var engineerR2Prompt = $"""
                Round 1 responses from all agents:
                {round1Summary}

                Risk Analyst's critique:
                {riskR2}

                Respond to the Risk Analyst's concerns from a technical implementation perspective.
                Provide concrete counterpoints or acknowledge valid concerns with solutions.
                """;
            var engineerR2 = await CallAndLogAsync(
                userId, session.Id, "Engineer", agentHistories["Engineer"], engineerR2Prompt);

            await _db.SaveChangesAsync(); // flush Round 2 logs
            agentHistories["Engineer"].Add(new AssistantChatMessage(engineerR2));
            transcript.Add(new DebateTranscriptEntry(2, "Engineer", engineerR2));
            _db.AgentResponses.Add(new AgentResponse
            {
                RoundId = round2.Id, AgentType = "Engineer", ResponseText = engineerR2
            });

            await _db.SaveChangesAsync();

            // ── Moderator Stage: Synthesize full transcript ──
            var synthesis = await _moderatorService.SynthesizeAsync(prompt, transcript);

            var moderatorSynthesis = new ModeratorSynthesis
            {
                SessionId = session.Id,
                Recommendation = synthesis.Recommendation,
                ConfidenceScore = synthesis.ConfidenceScore,
                KeyDissentingViewpoints = synthesis.KeyDissentingViewpoints,
                FullSynthesis = synthesis.FullSynthesis
            };
            _db.ModeratorSyntheses.Add(moderatorSynthesis);

            session.Status = "completed";
            await _db.SaveChangesAsync();
        }
        catch
        {
            session.Status = "failed";
            await _db.SaveChangesAsync();
            throw;
        }
    }
}
