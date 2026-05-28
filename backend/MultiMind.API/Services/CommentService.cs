using Microsoft.EntityFrameworkCore;
using MultiMind.API.Data;
using MultiMind.API.Models;
using OpenAI.Chat;

namespace MultiMind.API.Services;

public class CommentService
{
    private readonly AppDbContext _db;
    private readonly IAgentService _agentService;
    private readonly ILogger<CommentService> _logger;

    private static readonly string[] Agents = ["Strategist", "RiskAnalyst", "Engineer"];

    public CommentService(AppDbContext db, IAgentService agentService, ILogger<CommentService> logger)
    {
        _db = db;
        _agentService = agentService;
        _logger = logger;
    }

    public async Task TriggerAiRepliesAsync(Guid sessionId, Guid parentCommentId, string userContent)
    {
        // Load the debate context for richer agent responses
        var session = await _db.DebateSessions
            .Include(s => s.Rounds).ThenInclude(r => r.AgentResponses)
            .FirstOrDefaultAsync(s => s.Id == sessionId);

        if (session == null) return;

        // Build a brief transcript summary for context
        var contextSummary = string.Join("\n", session.Rounds
            .OrderBy(r => r.RoundNumber)
            .SelectMany(r => r.AgentResponses)
            .Select(a => $"[Round {session.Rounds.First(r => r.Id == a.RoundId).RoundNumber} - {a.AgentType}]: {a.ResponseText[..Math.Min(300, a.ResponseText.Length)]}..."));

        foreach (var agentType in Agents)
        {
            try
            {
                var prompt = $"""
                    You are participating in a multi-agent debate about: "{session.OriginalPrompt}"
                    
                    Debate context (abbreviated):
                    {contextSummary}
                    
                    A user has added the following comment to the debate:
                    "{userContent}"
                    
                    Respond to this comment from your perspective as {agentType}. Be direct and concise (2-4 sentences).
                    """;

                var (response, _) = await _agentService.GetResponseAsync(
                    agentType, new List<ChatMessage>(), prompt);

                _db.UserComments.Add(new UserComment
                {
                    SessionId = sessionId,
                    UserId = null,
                    AgentType = agentType,
                    Content = response,
                    IsAiGenerated = true,
                    ParentCommentId = parentCommentId
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[CommentService] AI reply from {Agent} failed for comment {CommentId}", agentType, parentCommentId);
            }
        }

        await _db.SaveChangesAsync();
    }
}
