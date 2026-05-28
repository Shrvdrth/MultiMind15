using MultiMind.API.Models;

namespace MultiMind.API.Repositories;

public interface ICommentRepository
{
    Task<IEnumerable<UserComment>> GetBySessionAsync(Guid sessionId);
    Task<IEnumerable<UserComment>> GetRepliesAsync(Guid parentCommentId);
    Task<UserComment?> GetByIdAsync(Guid id);
    Task AddAsync(UserComment comment);
    Task SoftDeleteAsync(Guid commentId);
    Task SaveChangesAsync();
    Task<(IEnumerable<UserComment> Comments, int Total)> GetAllPagedAsync(Guid? sessionId, int page, int pageSize);
}
