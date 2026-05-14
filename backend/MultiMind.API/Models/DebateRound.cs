namespace MultiMind.API.Models;

public class DebateRound
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SessionId { get; set; }
    public int RoundNumber { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DebateSession Session { get; set; } = null!;
    public ICollection<AgentResponse> AgentResponses { get; set; } = new List<AgentResponse>();
}
