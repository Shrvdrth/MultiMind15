using Microsoft.EntityFrameworkCore;
using MultiMind.API.Data;
using MultiMind.API.DTOs;

namespace MultiMind.API.Services;

public class AdminService
{
    private readonly AppDbContext _db;

    public AdminService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<AdminStatsDto> GetStatsAsync()
    {
        var totalUsers = await _db.Users.IgnoreQueryFilters().CountAsync(u => !u.IsDeleted);
        var activeUsers = await _db.Users.IgnoreQueryFilters().CountAsync(u => !u.IsDeleted && u.IsActive);
        var suspended = await _db.Users.IgnoreQueryFilters().CountAsync(u => !u.IsDeleted && !u.IsActive);
        var totalDebates = await _db.DebateSessions.IgnoreQueryFilters().CountAsync();
        var completedDebates = await _db.DebateSessions.IgnoreQueryFilters().CountAsync(d => d.Status == "completed");
        var totalComments = await _db.UserComments.CountAsync(c => !c.IsDeleted);
        var totalAiCalls = await _db.AiCallLogs.CountAsync();

        return new AdminStatsDto(
            totalUsers, activeUsers, suspended,
            totalDebates, completedDebates,
            totalComments, totalAiCalls,
            DateTime.UtcNow
        );
    }

    public async Task<AdminUserListDto> GetUsersAsync(string? search, int page, int pageSize)
    {
        var query = _db.Users.IgnoreQueryFilters()
            .Where(u => !u.IsDeleted);

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(u =>
                u.Email.ToLower().Contains(search.ToLower()) ||
                u.DisplayName.ToLower().Contains(search.ToLower()));

        var total = await query.CountAsync();

        var users = await query
            .OrderBy(u => u.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(u => new
            {
                u.Id, u.Email, u.DisplayName, u.Role, u.IsActive,
                u.IsEmailVerified, u.CreatedAt, u.LastLoginAt,
                DebateCount = u.DebateSessions.Count
            })
            .ToListAsync();

        var dtos = users.Select(u => new AdminUserDto(
            u.Id, u.Email, u.DisplayName, u.Role, u.IsActive,
            u.IsEmailVerified, u.CreatedAt, u.LastLoginAt, u.DebateCount
        )).ToList();

        return new AdminUserListDto(dtos, total, page, pageSize);
    }

    public async Task<AdminDebateListDto> GetDebatesAsync(string? search, Guid? userId, string? status, int page, int pageSize)
    {
        var query = _db.DebateSessions.IgnoreQueryFilters()
            .Include(d => d.User)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(d => d.OriginalPrompt.ToLower().Contains(search.ToLower()));

        if (userId.HasValue)
            query = query.Where(d => d.UserId == userId.Value);

        if (!string.IsNullOrWhiteSpace(status) && status != "all")
            query = query.Where(d => d.Status == status);

        var total = await query.CountAsync();

        var debates = await query
            .OrderByDescending(d => d.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(d => new AdminDebateDto(
                d.Id,
                d.OriginalPrompt,
                d.Status,
                d.User.Email,
                d.CreatedAt,
                d.DeletedAt != null
            ))
            .ToListAsync();

        return new AdminDebateListDto(debates, total, page, pageSize);
    }

    public async Task<AdminLogListDto> GetLogsAsync(int page, int pageSize)
    {
        var total = await _db.AdminLogs.CountAsync();

        var logs = await _db.AdminLogs
            .Include(l => l.Admin)
            .OrderByDescending(l => l.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(l => new AdminLogDto(
                l.Id,
                l.Admin.Email,
                l.Action,
                l.TargetType,
                l.TargetId,
                l.Details,
                l.CreatedAt
            ))
            .ToListAsync();

        return new AdminLogListDto(logs, total, page, pageSize);
    }

    public async Task<AdminCommentListDto> GetCommentsAsync(Guid? sessionId, int page, int pageSize)
    {
        var query = _db.UserComments.IgnoreQueryFilters()
            .Include(c => c.User)
            .AsQueryable();

        if (sessionId.HasValue)
            query = query.Where(c => c.SessionId == sessionId.Value);

        var total = await query.CountAsync();

        var comments = await query
            .OrderByDescending(c => c.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(c => new AdminCommentDto(
                c.Id,
                c.SessionId,
                c.User != null ? c.User.Email : null,
                c.AgentType,
                c.Content,
                c.IsAiGenerated,
                c.IsDeleted,
                c.CreatedAt
            ))
            .ToListAsync();

        return new AdminCommentListDto(comments, total, page, pageSize);
    }
}
