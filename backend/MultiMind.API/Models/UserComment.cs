namespace MultiMind.API.Models;

public class UserComment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SessionId { get; set; }
    public Guid? UserId { get; set; } // null when AI-generated
    public string? AgentType { get; set; } // "Strategist" | "RiskAnalyst" | "Engineer" — null for user comments
    public string Content { get; set; } = string.Empty;
    public bool IsAiGenerated { get; set; } = false;
    public Guid? ParentCommentId { get; set; } // null = top-level user comment; set = AI reply
    public bool IsDeleted { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public DebateSession Session { get; set; } = null!;
    public User? User { get; set; }
    public UserComment? ParentComment { get; set; }
    public ICollection<UserComment> Replies { get; set; } = new List<UserComment>();
}
