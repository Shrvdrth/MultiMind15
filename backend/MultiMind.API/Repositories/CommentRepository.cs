using Microsoft.EntityFrameworkCore;
using MultiMind.API.Data;
using MultiMind.API.Models;

namespace MultiMind.API.Repositories;

public class CommentRepository : ICommentRepository
{
    private readonly AppDbContext _db;
    public CommentRepository(AppDbContext db) => _db = db;

    public async Task<IEnumerable<UserComment>> GetBySessionAsync(Guid sessionId) =>
        await _db.UserComments
            .Where(c => c.SessionId == sessionId && c.ParentCommentId == null)
            .Include(c => c.User)
            .Include(c => c.Replies.Where(r => !r.IsDeleted))
            .OrderByDescending(c => c.CreatedAt)
            .ToListAsync();

    public async Task<IEnumerable<UserComment>> GetRepliesAsync(Guid parentCommentId) =>
        await _db.UserComments
            .Where(c => c.ParentCommentId == parentCommentId)
            .OrderBy(c => c.CreatedAt)
            .ToListAsync();

    public async Task<UserComment?> GetByIdAsync(Guid id) =>
        await _db.UserComments.FindAsync(id);

    public async Task AddAsync(UserComment comment) =>
        await _db.UserComments.AddAsync(comment);

    public async Task SoftDeleteAsync(Guid commentId)
    {
        var comment = await _db.UserComments.FindAsync(commentId);
        if (comment != null)
        {
            comment.IsDeleted = true;
            await _db.SaveChangesAsync();
        }
    }

    public async Task<(IEnumerable<UserComment> Comments, int Total)> GetAllPagedAsync(
        Guid? sessionId, int page, int pageSize)
    {
        var q = _db.UserComments.IgnoreQueryFilters()
                   .Where(c => !c.IsDeleted)
                   .Include(c => c.User)
                   .Include(c => c.Session)
                   .AsQueryable();

        if (sessionId.HasValue)
            q = q.Where(c => c.SessionId == sessionId.Value);

        var total = await q.CountAsync();
        var comments = await q.OrderByDescending(c => c.CreatedAt)
                               .Skip((page - 1) * pageSize)
                               .Take(pageSize)
                               .ToListAsync();
        return (comments, total);
    }

    public async Task SaveChangesAsync() => await _db.SaveChangesAsync();
}
