namespace MultiMind.API.Models;

public class DebateSession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string OriginalPrompt { get; set; } = string.Empty;
    public string Status { get; set; } = "pending"; // pending | running | completed | failed
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool IsFavourite { get; set; } = false;
    public DateTime? DeletedAt { get; set; } // soft delete
    public string? UserInput { get; set; }    // optional mid-debate user message
    public DateTime? UserInputSubmittedAt { get; set; }

    public User User { get; set; } = null!;
    public ICollection<DebateRound> Rounds { get; set; } = new List<DebateRound>();
    public ModeratorSynthesis? Synthesis { get; set; }
    public ICollection<UserComment> UserComments { get; set; } = new List<UserComment>();
}
