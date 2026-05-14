namespace MultiMind.API.Models;

public class AgentResponse
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RoundId { get; set; }
    public string AgentType { get; set; } = string.Empty; // Strategist | RiskAnalyst | Engineer | Moderator
    public string ResponseText { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DebateRound Round { get; set; } = null!;
}
