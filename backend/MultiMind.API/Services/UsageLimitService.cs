using Microsoft.EntityFrameworkCore;
using MultiMind.API.Data;
using MultiMind.API.Models;

namespace MultiMind.API.Services;

/// <summary>
/// Daily limits that protect the OpenRouter free-tier quota (about 50 requests a day).
/// One debate uses about 7 AI calls, so the defaults allow 6 debates a day site-wide.
/// Bound from the "UsageLimits" config section, e.g. UsageLimits__DebatesPerSitePerDay=6.
/// </summary>
public class UsageLimitOptions
{
    public int DebatesPerUserPerDay { get; set; } = 2;
    public int DebatesPerSitePerDay { get; set; } = 6;
    public int ChatMessagesPerUserPerDay { get; set; } = 5;
    public int ChatMessagesPerSitePerDay { get; set; } = 8;
}

/// <summary>Thrown when a daily limit is reached. Turned into HTTP 429 by the middleware.</summary>
public class UsageLimitExceededException : Exception
{
    /// <summary>"user" when this visitor hit their own limit, "site" when the whole site did.</summary>
    public string Scope { get; }
    public TimeSpan RetryAfter { get; }

    public UsageLimitExceededException(string scope, string message, TimeSpan retryAfter) : base(message)
    {
        Scope = scope;
        RetryAfter = retryAfter < TimeSpan.Zero ? TimeSpan.Zero : retryAfter;
    }
}

public interface IUsageLimitService
{
    /// <summary>Throws <see cref="UsageLimitExceededException"/> if a new debate isn't allowed.</summary>
    Task EnsureDebateAllowedAsync(Guid userId);

    /// <summary>Checks the chatbot limits and, if allowed, records this message.</summary>
    Task RecordChatMessageAsync(Guid userId);
}

public class UsageLimitService : IUsageLimitService
{
    // Agent type used to record chatbot calls in AiCallLogs (no schema change needed).
    public const string ChatbotAgentType = "Chatbot";

    private static readonly TimeSpan Window = TimeSpan.FromHours(24);

    // The app runs as a single instance, so a process-wide lock is enough to stop
    // two requests at the same moment from both slipping under a limit.
    private static readonly SemaphoreSlim ChatLock = new(1, 1);

    private readonly AppDbContext _db;
    private readonly UsageLimitOptions _options;

    public UsageLimitService(AppDbContext db, UsageLimitOptions options)
    {
        _db = db;
        _options = options;
    }

    public async Task EnsureDebateAllowedAsync(Guid userId)
    {
        var since = DateTime.UtcNow - Window;
        // IgnoreQueryFilters: deleting a debate must not give the quota back.
        var recent = _db.DebateSessions.IgnoreQueryFilters().Where(s => s.CreatedAt > since);

        var siteTimes = await recent.Select(s => s.CreatedAt).ToListAsync();
        if (siteTimes.Count >= _options.DebatesPerSitePerDay)
            throw new UsageLimitExceededException("site",
                "MultiMind has reached its free daily debate limit.",
                RetryAfter(siteTimes, _options.DebatesPerSitePerDay));

        if (await IsAdminAsync(userId)) return;

        var userTimes = await recent.Where(s => s.UserId == userId).Select(s => s.CreatedAt).ToListAsync();
        if (userTimes.Count >= _options.DebatesPerUserPerDay)
            throw new UsageLimitExceededException("user",
                $"You've used your {_options.DebatesPerUserPerDay} free debates for today.",
                RetryAfter(userTimes, _options.DebatesPerUserPerDay));
    }

    public async Task RecordChatMessageAsync(Guid userId)
    {
        await ChatLock.WaitAsync();
        try
        {
            var since = DateTime.UtcNow - Window;
            var recent = _db.AiCallLogs.Where(l => l.AgentType == ChatbotAgentType && l.CreatedAt > since);

            var siteTimes = await recent.Select(l => l.CreatedAt).ToListAsync();
            if (siteTimes.Count >= _options.ChatMessagesPerSitePerDay)
                throw new UsageLimitExceededException("site",
                    "The assistant has reached its free daily message limit.",
                    RetryAfter(siteTimes, _options.ChatMessagesPerSitePerDay));

            if (!await IsAdminAsync(userId))
            {
                var userTimes = await recent.Where(l => l.UserId == userId).Select(l => l.CreatedAt).ToListAsync();
                if (userTimes.Count >= _options.ChatMessagesPerUserPerDay)
                    throw new UsageLimitExceededException("user",
                        $"You've used your {_options.ChatMessagesPerUserPerDay} free assistant messages for today.",
                        RetryAfter(userTimes, _options.ChatMessagesPerUserPerDay));
            }

            _db.AiCallLogs.Add(new AiCallLog { UserId = userId, SessionId = Guid.Empty, AgentType = ChatbotAgentType });
            await _db.SaveChangesAsync();
        }
        finally
        {
            ChatLock.Release();
        }
    }

    private Task<bool> IsAdminAsync(Guid userId) =>
        _db.Users.IgnoreQueryFilters().AnyAsync(u => u.Id == userId && u.Role == "Admin");

    // A slot frees up when the oldest entry that keeps us at the limit leaves the 24h window.
    private static TimeSpan RetryAfter(List<DateTime> times, int limit)
    {
        if (limit <= 0 || times.Count == 0) return Window;
        var sorted = times.OrderByDescending(t => t).ToList();
        var oldestCounted = sorted[Math.Min(limit, sorted.Count) - 1];
        return oldestCounted + Window - DateTime.UtcNow;
    }
}
