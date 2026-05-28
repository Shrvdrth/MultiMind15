using MultiMind.API.Data;
using MultiMind.API.Models;

namespace MultiMind.API.Services;

public class AdminActionLogger
{
    private readonly AppDbContext _db;

    public AdminActionLogger(AppDbContext db) => _db = db;

    public async Task LogAsync(Guid adminId, string action, string targetType, Guid? targetId, string? details = null)
    {
        _db.AdminLogs.Add(new AdminLog
        {
            AdminId = adminId,
            Action = action,
            TargetType = targetType,
            TargetId = targetId,
            Details = details
        });
        await _db.SaveChangesAsync();
    }
}
