using MultiMind.API.Data;
using MultiMind.API.Models;

namespace MultiMind.API.Services;

public interface IApplicationLogService
{
    Task LogAsync(
        string level,
        string category,
        string message,
        string? details = null,
        string? userId = null,
        string? path = null,
        int? statusCode = null,
        long? durationMs = null);
}

public class ApplicationLogService : IApplicationLogService
{
    private readonly AppDbContext _db;

    public ApplicationLogService(AppDbContext db)
    {
        _db = db;
    }

    public async Task LogAsync(
        string level,
        string category,
        string message,
        string? details = null,
        string? userId = null,
        string? path = null,
        int? statusCode = null,
        long? durationMs = null)
    {
        _db.ApplicationLogs.Add(new ApplicationLog
        {
            Level      = level,
            Category   = category,
            Message    = message,
            Details    = details,
            UserId     = userId,
            Path       = path,
            StatusCode = statusCode,
            DurationMs = durationMs
        });
        await _db.SaveChangesAsync();
    }
}
