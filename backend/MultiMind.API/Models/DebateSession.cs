namespace MultiMind.API.Models;

public class DebateSession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string OriginalPrompt { get; set; } = string.Empty;
    public string Status { get; set; } = "pending"; // pending | running | completed | failed
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User User { get; set; } = null!;
    public ICollection<DebateRound> Rounds { get; set; } = new List<DebateRound>();
    public ModeratorSynthesis? Synthesis { get; set; }
}
