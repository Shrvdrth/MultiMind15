using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using MultiMind.API.Controllers;
using MultiMind.API.Data;
using MultiMind.API.DTOs;
using MultiMind.API.Middleware;
using MultiMind.API.Models;
using MultiMind.API.Services;
using Npgsql;
using Xunit;

namespace MultiMind.API.Tests;

/// <summary>Tests for the changes that prepare the app for public hosting.</summary>
public class DeploymentPrepTests
{
    private static AppDbContext CreateDb(string name) =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(name).Options);

    // ── CORS origins ───────────────────────────────────────────────────────

    [Fact]
    public void ParseOrigins_SplitsListAndRemovesTrailingSlashes()
    {
        var origins = DeploymentSettings.ParseOrigins(" https://a.vercel.app/ , https://b.com,,https://A.vercel.app");

        Assert.Equal(["https://a.vercel.app", "https://b.com"], origins);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  ")]
    public void ParseOrigins_EmptyValue_ReturnsNothing(string? value) =>
        Assert.Empty(DeploymentSettings.ParseOrigins(value));

    // ── Connection string ──────────────────────────────────────────────────

    [Fact]
    public void ResolveConnectionString_NeonUrl_IsConverted()
    {
        // Fake credentials; the password has characters that must be URL-decoded.
        var url = "postgresql://demo_user:p%40ss%3Aword@ep-test-123.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

        var result = DeploymentSettings.ResolveConnectionString(url, null);

        var cs = new NpgsqlConnectionStringBuilder(result);
        Assert.Equal("ep-test-123.eu-central-1.aws.neon.tech", cs.Host);
        Assert.Equal(5432, cs.Port);
        Assert.Equal("neondb", cs.Database);
        Assert.Equal("demo_user", cs.Username);
        Assert.Equal("p@ss:word", cs.Password);
        Assert.Equal(SslMode.Require, cs.SslMode);
        Assert.Equal(ChannelBinding.Require, cs.ChannelBinding);
    }

    [Fact]
    public void ResolveConnectionString_KeyValueFormat_IsUnchanged()
    {
        const string kv = "Host=db;Port=5432;Database=multimind;Username=postgres;Password=fake";
        Assert.Equal(kv, DeploymentSettings.ResolveConnectionString(kv, "postgres://ignored@x/y"));
    }

    [Fact]
    public void ResolveConnectionString_FallsBackToDatabaseUrl()
    {
        var result = DeploymentSettings.ResolveConnectionString("", "postgres://u:fake@host:6543/app");

        var cs = new NpgsqlConnectionStringBuilder(result);
        Assert.Equal("host", cs.Host);
        Assert.Equal(6543, cs.Port);
        Assert.Equal("app", cs.Database);
    }

    [Fact]
    public void ResolveConnectionString_NothingSet_ReturnsNull() =>
        Assert.Null(DeploymentSettings.ResolveConnectionString(null, null));

    // ── Free model ─────────────────────────────────────────────────────────

    [Theory]
    [InlineData("openrouter/free", true)]
    [InlineData("google/gemma-4-31b-it:free", true)]
    [InlineData("anthropic/claude-sonnet-4.5", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void IsFreeModel_DetectsFreeModels(string? model, bool expected) =>
        Assert.Equal(expected, DeploymentSettings.IsFreeModel(model));

    // ── Debate limits ──────────────────────────────────────────────────────

    private static readonly UsageLimitOptions Limits = new()
    {
        DebatesPerUserPerDay = 2,
        DebatesPerSitePerDay = 6,
        ChatMessagesPerUserPerDay = 5,
        ChatMessagesPerSitePerDay = 8
    };

    private static void AddSessions(AppDbContext db, Guid userId, int count, DateTime? createdAt = null, bool deleted = false)
    {
        for (var i = 0; i < count; i++)
            db.DebateSessions.Add(new DebateSession
            {
                UserId = userId,
                OriginalPrompt = $"q{i}",
                Status = "completed",
                CreatedAt = createdAt ?? DateTime.UtcNow.AddMinutes(-10),
                DeletedAt = deleted ? DateTime.UtcNow : null
            });
        db.SaveChanges();
    }

    [Fact]
    public async Task Debate_UserUnderLimit_IsAllowed()
    {
        using var db = CreateDb(nameof(Debate_UserUnderLimit_IsAllowed));
        var user = Guid.NewGuid();
        AddSessions(db, user, 1);

        await new UsageLimitService(db, Limits).EnsureDebateAllowedAsync(user);
    }

    [Fact]
    public async Task Debate_UserAtLimit_ThrowsUserScope()
    {
        using var db = CreateDb(nameof(Debate_UserAtLimit_ThrowsUserScope));
        var user = Guid.NewGuid();
        AddSessions(db, user, 2);

        var ex = await Assert.ThrowsAsync<UsageLimitExceededException>(
            () => new UsageLimitService(db, Limits).EnsureDebateAllowedAsync(user));

        Assert.Equal("user", ex.Scope);
        Assert.True(ex.RetryAfter > TimeSpan.FromHours(23));
    }

    [Fact]
    public async Task Debate_DeletedSessionsStillCount()
    {
        using var db = CreateDb(nameof(Debate_DeletedSessionsStillCount));
        var user = Guid.NewGuid();
        AddSessions(db, user, 2, deleted: true);

        await Assert.ThrowsAsync<UsageLimitExceededException>(
            () => new UsageLimitService(db, Limits).EnsureDebateAllowedAsync(user));
    }

    [Fact]
    public async Task Debate_OldSessionsDoNotCount()
    {
        using var db = CreateDb(nameof(Debate_OldSessionsDoNotCount));
        var user = Guid.NewGuid();
        AddSessions(db, user, 10, createdAt: DateTime.UtcNow.AddHours(-25));

        await new UsageLimitService(db, Limits).EnsureDebateAllowedAsync(user);
    }

    [Fact]
    public async Task Debate_SiteAtLimit_ThrowsSiteScopeForNewUser()
    {
        using var db = CreateDb(nameof(Debate_SiteAtLimit_ThrowsSiteScopeForNewUser));
        for (var i = 0; i < 3; i++) AddSessions(db, Guid.NewGuid(), 2);

        var ex = await Assert.ThrowsAsync<UsageLimitExceededException>(
            () => new UsageLimitService(db, Limits).EnsureDebateAllowedAsync(Guid.NewGuid()));

        Assert.Equal("site", ex.Scope);
    }

    [Fact]
    public async Task Debate_AdminSkipsUserLimitButNotSiteLimit()
    {
        using var db = CreateDb(nameof(Debate_AdminSkipsUserLimitButNotSiteLimit));
        var admin = new User { Email = "admin@example.com", PasswordHash = "x", Role = "Admin" };
        db.Users.Add(admin);
        db.SaveChanges();
        AddSessions(db, admin.Id, 5);
        var svc = new UsageLimitService(db, Limits);

        await svc.EnsureDebateAllowedAsync(admin.Id); // 5 of 6 site-wide: allowed

        AddSessions(db, admin.Id, 1);
        var ex = await Assert.ThrowsAsync<UsageLimitExceededException>(() => svc.EnsureDebateAllowedAsync(admin.Id));
        Assert.Equal("site", ex.Scope);
    }

    [Fact]
    public async Task DebateEngine_CreateSession_BlockedAtLimit_DoesNotCreateSession()
    {
        using var db = CreateDb(nameof(DebateEngine_CreateSession_BlockedAtLimit_DoesNotCreateSession));
        var user = Guid.NewGuid();
        AddSessions(db, user, 2);
        var engine = new DebateEngine(Mock.Of<IAgentService>(), Mock.Of<IModeratorService>(), db,
            NullLogger<DebateEngine>.Instance, Mock.Of<IDebateEventBus>(), Mock.Of<IUserInputWaiter>(),
            Mock.Of<IApplicationLogService>(), new MemoryCache(new MemoryCacheOptions()),
            new UsageLimitService(db, Limits));

        await Assert.ThrowsAsync<UsageLimitExceededException>(() => engine.CreateSessionAsync(user, "A new question"));

        Assert.Equal(2, db.DebateSessions.IgnoreQueryFilters().Count());
    }

    // ── Chatbot limits ─────────────────────────────────────────────────────

    [Fact]
    public async Task Chat_RecordsMessagesUntilUserLimit()
    {
        using var db = CreateDb(nameof(Chat_RecordsMessagesUntilUserLimit));
        var user = Guid.NewGuid();
        var svc = new UsageLimitService(db, Limits);

        for (var i = 0; i < 5; i++) await svc.RecordChatMessageAsync(user);
        var ex = await Assert.ThrowsAsync<UsageLimitExceededException>(() => svc.RecordChatMessageAsync(user));

        Assert.Equal("user", ex.Scope);
        Assert.Equal(5, db.AiCallLogs.Count(l => l.AgentType == UsageLimitService.ChatbotAgentType));
    }

    [Fact]
    public async Task Chat_SiteLimitAppliesAcrossUsers()
    {
        using var db = CreateDb(nameof(Chat_SiteLimitAppliesAcrossUsers));
        var svc = new UsageLimitService(db, Limits);

        for (var i = 0; i < 8; i++) await svc.RecordChatMessageAsync(Guid.NewGuid());
        var ex = await Assert.ThrowsAsync<UsageLimitExceededException>(() => svc.RecordChatMessageAsync(Guid.NewGuid()));

        Assert.Equal("site", ex.Scope);
    }

    // ── 429 response ───────────────────────────────────────────────────────

    [Fact]
    public async Task WriteUsageLimit_Returns429WithCodeAndRetryAfter()
    {
        var ctx = new DefaultHttpContext();
        ctx.Response.Body = new MemoryStream();

        await ExceptionHandlingMiddleware.WriteUsageLimitAsync(ctx,
            new UsageLimitExceededException("user", "Limit reached.", TimeSpan.FromMinutes(90)));

        Assert.Equal(429, ctx.Response.StatusCode);
        Assert.Equal("5400", ctx.Response.Headers.RetryAfter.ToString());
        ctx.Response.Body.Position = 0;
        using var json = await JsonDocument.ParseAsync(ctx.Response.Body);
        Assert.Equal("usage_limit", json.RootElement.GetProperty("code").GetString());
        Assert.Equal("user", json.RootElement.GetProperty("scope").GetString());
        Assert.Equal(5400, json.RootElement.GetProperty("retryAfterSeconds").GetInt32());
    }

    // ── Forgot password ────────────────────────────────────────────────────

    private static AuthController CreateAuthController(AppDbContext db, string environment)
    {
        var env = Mock.Of<IWebHostEnvironment>(e => e.EnvironmentName == environment);
        return new AuthController(Mock.Of<IAuthService>(), db, env);
    }

    private static AppDbContext DbWithUser(string name)
    {
        var db = CreateDb(name);
        db.Users.Add(new User { Email = "alice@example.com", PasswordHash = "x" });
        db.SaveChanges();
        return db;
    }

    [Fact]
    public async Task ForgotPassword_Production_DoesNotReturnOrStoreToken()
    {
        using var db = DbWithUser(nameof(ForgotPassword_Production_DoesNotReturnOrStoreToken));

        var result = await CreateAuthController(db, Environments.Production)
            .ForgotPassword(new ForgotPasswordRequest("alice@example.com"));

        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Null(ok.Value!.GetType().GetProperty("token"));
        Assert.Null(db.Users.Single().ResetToken);
    }

    [Fact]
    public async Task ForgotPassword_Development_ReturnsToken()
    {
        using var db = DbWithUser(nameof(ForgotPassword_Development_ReturnsToken));

        var result = await CreateAuthController(db, Environments.Development)
            .ForgotPassword(new ForgotPasswordRequest("alice@example.com"));

        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.NotNull(ok.Value!.GetType().GetProperty("token"));
        Assert.NotNull(db.Users.Single().ResetToken);
    }
}
