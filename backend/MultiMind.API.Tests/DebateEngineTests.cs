using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using MultiMind.API.Data;
using MultiMind.API.Models;
using MultiMind.API.Services;
using Xunit;

namespace MultiMind.API.Tests;

public class DebateEngineTests
{
    private static AppDbContext CreateDb(string dbName)
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(dbName)
            .Options;
        return new AppDbContext(opts);
    }

    private static DebateEngine CreateEngine(AppDbContext db,
        IAgentService? agent = null, IModeratorService? mod = null)
    {
        agent ??= Mock.Of<IAgentService>();
        mod   ??= Mock.Of<IModeratorService>();

        var eventBus = Mock.Of<IDebateEventBus>();
        var waiter   = Mock.Of<IUserInputWaiter>();
        var appLog   = Mock.Of<IApplicationLogService>();
        var cache    = new MemoryCache(new MemoryCacheOptions());

        return new DebateEngine(agent, mod, db,
            NullLogger<DebateEngine>.Instance, eventBus, waiter, appLog, cache);
    }

    // ── CreateSessionAsync ─────────────────────────────────────────────────

    [Fact]
    public async Task CreateSessionAsync_NewPrompt_CreatesAndPersistsSession()
    {
        using var db = CreateDb(nameof(CreateSessionAsync_NewPrompt_CreatesAndPersistsSession));
        var engine = CreateEngine(db);
        var userId = Guid.NewGuid();

        var session = await engine.CreateSessionAsync(userId, "Should we migrate to microservices?");

        Assert.NotEqual(Guid.Empty, session.Id);
        Assert.Equal("running", session.Status);
        Assert.Equal("Should we migrate to microservices?", session.OriginalPrompt);
        Assert.Equal(1, await db.DebateSessions.CountAsync());
    }

    [Fact]
    public async Task CreateSessionAsync_DuplicatePromptWithinFiveMinutes_ReturnsCachedSession()
    {
        using var db = CreateDb(nameof(CreateSessionAsync_DuplicatePromptWithinFiveMinutes_ReturnsCachedSession));
        var engine = CreateEngine(db);
        var userId = Guid.NewGuid();
        const string prompt = "How do we reduce cloud costs?";

        // Seed an existing running session created 2 minutes ago
        var existing = new DebateSession
        {
            UserId = userId,
            OriginalPrompt = prompt,
            Status = "running",
            CreatedAt = DateTime.UtcNow.AddMinutes(-2)
        };
        db.DebateSessions.Add(existing);
        await db.SaveChangesAsync();

        var returned = await engine.CreateSessionAsync(userId, prompt);

        Assert.Equal(existing.Id, returned.Id);
        Assert.Equal(1, await db.DebateSessions.CountAsync()); // no new row
    }

    [Fact]
    public async Task CreateSessionAsync_DuplicatePromptOlderThanFiveMinutes_CreatesNewSession()
    {
        using var db = CreateDb(nameof(CreateSessionAsync_DuplicatePromptOlderThanFiveMinutes_CreatesNewSession));
        var engine = CreateEngine(db);
        var userId = Guid.NewGuid();
        const string prompt = "Adopt GraphQL or REST?";

        db.DebateSessions.Add(new DebateSession
        {
            UserId = userId,
            OriginalPrompt = prompt,
            Status = "completed",
            CreatedAt = DateTime.UtcNow.AddMinutes(-10) // expired cache
        });
        await db.SaveChangesAsync();

        var session = await engine.CreateSessionAsync(userId, prompt);

        Assert.Equal(2, await db.DebateSessions.CountAsync());
        Assert.Equal("running", session.Status);
    }

    [Fact]
    public async Task CreateSessionAsync_PromptWithLeadingWhitespace_NormalizesBeforeComparison()
    {
        using var db = CreateDb(nameof(CreateSessionAsync_PromptWithLeadingWhitespace_NormalizesBeforeComparison));
        var engine = CreateEngine(db);
        var userId = Guid.NewGuid();
        const string prompt = "Build vs buy?";

        db.DebateSessions.Add(new DebateSession
        {
            UserId = userId,
            OriginalPrompt = prompt,
            Status = "running",
            CreatedAt = DateTime.UtcNow.AddMinutes(-1)
        });
        await db.SaveChangesAsync();

        // Submit with surrounding whitespace — should be deduplicated
        var returned = await engine.CreateSessionAsync(userId, "  Build vs buy?  ");

        Assert.Equal(1, await db.DebateSessions.CountAsync());
    }

    [Fact]
    public async Task CreateSessionAsync_RateLimitExceeded_ThrowsInvalidOperationException()
    {
        using var db = CreateDb(nameof(CreateSessionAsync_RateLimitExceeded_ThrowsInvalidOperationException));
        var engine = CreateEngine(db);
        var userId = Guid.NewGuid();

        // Seed 70 AI call logs in the last hour (MaxAiCallsPerSession * 10 = 70)
        for (var i = 0; i < 70; i++)
        {
            db.AiCallLogs.Add(new AiCallLog
            {
                UserId = userId,
                SessionId = Guid.NewGuid(),
                AgentType = "Strategist",
                CreatedAt = DateTime.UtcNow.AddMinutes(-30)
            });
        }
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            engine.CreateSessionAsync(userId, "Any prompt"));
    }

    [Fact]
    public async Task CreateSessionAsync_DuplicatePromptDifferentUser_CreatesNewSession()
    {
        using var db = CreateDb(nameof(CreateSessionAsync_DuplicatePromptDifferentUser_CreatesNewSession));
        var engine = CreateEngine(db);
        var userId1 = Guid.NewGuid();
        var userId2 = Guid.NewGuid();
        const string prompt = "Shared prompt";

        db.DebateSessions.Add(new DebateSession
        {
            UserId = userId1,
            OriginalPrompt = prompt,
            Status = "running",
            CreatedAt = DateTime.UtcNow.AddMinutes(-1)
        });
        await db.SaveChangesAsync();

        // Different user submitting same prompt — should create a new session
        var session = await engine.CreateSessionAsync(userId2, prompt);

        Assert.Equal(2, await db.DebateSessions.CountAsync());
        Assert.Equal(userId2, session.UserId);
    }
}
