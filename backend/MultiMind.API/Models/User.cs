namespace MultiMind.API.Models;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? ResetToken { get; set; }
    public DateTime? ResetTokenExpires { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // RBAC & account management
    public string Role { get; set; } = "User"; // "User" | "Admin"
    public bool IsActive { get; set; } = true;
    public bool IsEmailVerified { get; set; } = true;
    public DateTime? LastLoginAt { get; set; }
    public bool IsDeleted { get; set; } = false;

    public ICollection<DebateSession> DebateSessions { get; set; } = new List<DebateSession>();
    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
    public ICollection<UserComment> UserComments { get; set; } = new List<UserComment>();
    public ICollection<AdminLog> AdminLogs { get; set; } = new List<AdminLog>();
}
