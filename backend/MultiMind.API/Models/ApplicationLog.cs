namespace MultiMind.API.Models;

public class ApplicationLog
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Level { get; set; } = "Info";          // Info | Warning | Error
    public string Category { get; set; } = string.Empty; // HttpRequest | Exception | AiCall
    public string Message { get; set; } = string.Empty;
    public string? Details { get; set; }                  // JSON or stack trace
    public string? UserId { get; set; }
    public string? Path { get; set; }
    public int? StatusCode { get; set; }
    public long? DurationMs { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
