using Microsoft.EntityFrameworkCore;
using MultiMind.API.Data;
using MultiMind.API.Models;

namespace MultiMind.API.Repositories;

public class DebateRepository : IDebateRepository
{
    private readonly AppDbContext _db;
    public DebateRepository(AppDbContext db) => _db = db;

    public async Task<DebateSession?> GetByIdAsync(Guid id) =>
        await _db.DebateSessions.FindAsync(id);

    public async Task<IEnumerable<DebateSession>> GetAllAsync() =>
        await _db.DebateSessions.ToListAsync();

    public async Task<DebateSession?> GetWithRoundsAsync(Guid sessionId) =>
        await _db.DebateSessions
            .Include(s => s.Rounds).ThenInclude(r => r.AgentResponses)
            .Include(s => s.Synthesis)
            .FirstOrDefaultAsync(s => s.Id == sessionId);

    public async Task<IEnumerable<DebateSession>> GetByUserAsync(Guid userId) =>
        await _db.DebateSessions
            .Where(s => s.UserId == userId)
            .OrderByDescending(s => s.CreatedAt)
            .ToListAsync();

    public async Task SoftDeleteAsync(Guid sessionId)
    {
        var session = await _db.DebateSessions.FindAsync(sessionId);
        if (session != null)
        {
            session.DeletedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
        }
    }

    public async Task<(IEnumerable<DebateSession> Sessions, int Total)> SearchAllAsync(
        string? search, Guid? userId, string? status, int page, int pageSize)
    {
        // Admin queries need to bypass global query filter for soft-deleted items
        var q = _db.DebateSessions.IgnoreQueryFilters()
                   .Where(s => s.DeletedAt == null)
                   .Include(s => s.User)
                   .Include(s => s.Synthesis)
                   .AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var lower = search.ToLower();
            q = q.Where(s => s.OriginalPrompt.ToLower().Contains(lower));
        }
        if (userId.HasValue)
            q = q.Where(s => s.UserId == userId.Value);
        if (!string.IsNullOrWhiteSpace(status))
            q = q.Where(s => s.Status == status);

        var total = await q.CountAsync();
        var sessions = await q.OrderByDescending(s => s.CreatedAt)
                               .Skip((page - 1) * pageSize)
                               .Take(pageSize)
                               .ToListAsync();
        return (sessions, total);
    }

    public async Task AddAsync(DebateSession entity)
    {
        await _db.DebateSessions.AddAsync(entity);
    }

    public Task UpdateAsync(DebateSession entity)
    {
        _db.DebateSessions.Update(entity);
        return Task.CompletedTask;
    }

    public Task DeleteAsync(DebateSession entity)
    {
        _db.DebateSessions.Remove(entity);
        return Task.CompletedTask;
    }

    public async Task SaveChangesAsync() => await _db.SaveChangesAsync();
}
