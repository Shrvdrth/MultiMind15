using MultiMind.API.Models;

namespace MultiMind.API.Repositories;

public interface IDebateRepository : IRepository<DebateSession>
{
    Task<DebateSession?> GetWithRoundsAsync(Guid sessionId);
    Task<IEnumerable<DebateSession>> GetByUserAsync(Guid userId);
    Task SoftDeleteAsync(Guid sessionId);
    Task<(IEnumerable<DebateSession> Sessions, int Total)> SearchAllAsync(string? search, Guid? userId, string? status, int page, int pageSize);
}
