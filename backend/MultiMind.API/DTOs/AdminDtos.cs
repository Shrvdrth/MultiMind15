namespace MultiMind.API.DTOs;

// ── Stats ──
public record AdminStatsDto(
    int TotalUsers,
    int ActiveUsers,
    int SuspendedUsers,
    int TotalDebates,
    int CompletedDebates,
    int TotalComments,
    int TotalAiCalls,
    DateTime GeneratedAt
);

// ── Users ──
public record AdminUserDto(
    Guid Id,
    string Email,
    string DisplayName,
    string Role,
    bool IsActive,
    bool IsEmailVerified,
    DateTime CreatedAt,
    DateTime? LastLoginAt,
    int DebateCount
);

public record AdminUserListDto(List<AdminUserDto> Users, int Total, int Page, int PageSize);

public record SetRoleRequest(string Role);
public record SetActiveRequest(bool IsActive);

// ── Debates ──
public record AdminDebateDto(
    Guid Id,
    string Prompt,
    string Status,
    string UserEmail,
    DateTime CreatedAt,
    bool IsDeleted
);

public record AdminDebateListDto(List<AdminDebateDto> Debates, int Total, int Page, int PageSize);

// ── Logs ──
public record AdminLogDto(
    Guid Id,
    string AdminEmail,
    string Action,
    string TargetType,
    Guid? TargetId,
    string? Details,
    DateTime CreatedAt
);

public record AdminLogListDto(List<AdminLogDto> Logs, int Total, int Page, int PageSize);

// ── Comments (admin view) ──
public record AdminCommentDto(
    Guid Id,
    Guid SessionId,
    string? UserEmail,
    string? AgentType,
    string Content,
    bool IsAiGenerated,
    bool IsDeleted,
    DateTime CreatedAt
);

public record AdminCommentListDto(List<AdminCommentDto> Comments, int Total, int Page, int PageSize);

// ── Password Reset ──
public record AdminResetPasswordRequest(
    string Mode,        // "direct" | "generate"
    string? NewPassword
);

public record AdminResetPasswordResponse(string Message, string? Token, DateTime? ExpiresAt);

// ── Application Logs ──
public record ApplicationLogDto(
    Guid Id,
    string Level,
    string Category,
    string Message,
    string? Details,
    string? UserId,
    string? Path,
    int? StatusCode,
    long? DurationMs,
    DateTime CreatedAt
);

public record ApplicationLogListDto(List<ApplicationLogDto> Logs, int Total, int Page, int PageSize);
