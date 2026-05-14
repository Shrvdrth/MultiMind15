namespace MultiMind.API.Models;

public class ModeratorSynthesis
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SessionId { get; set; }
    public string Recommendation { get; set; } = string.Empty;
    public int ConfidenceScore { get; set; } // 0–100, calculated from agreement/contradiction
    public string KeyDissentingViewpoints { get; set; } = string.Empty;
    public string FullSynthesis { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DebateSession Session { get; set; } = null!;
}
