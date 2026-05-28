namespace MultiMind.API.DTOs;

public record CreateCommentRequest(string Content);
public record UpdateCommentRequest(string Content);

public record CommentDto(
    Guid Id,
    Guid SessionId,
    Guid? UserId,
    string? DisplayName,
    string? AgentType,
    string Content,
    bool IsAiGenerated,
    Guid? ParentCommentId,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    List<CommentDto> Replies
);
