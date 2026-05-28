namespace MultiMind.API.Models;

public class AdminLog
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AdminId { get; set; }
    public string Action { get; set; } = string.Empty;       // e.g. "SuspendUser", "DeleteDebate"
    public string TargetType { get; set; } = string.Empty;   // e.g. "User", "DebateSession", "Comment"
    public Guid? TargetId { get; set; }
    public string? Details { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User Admin { get; set; } = null!;
}
