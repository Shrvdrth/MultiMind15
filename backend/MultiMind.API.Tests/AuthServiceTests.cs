using Microsoft.EntityFrameworkCore;
using Moq;
using MultiMind.API.Data;
using MultiMind.API.DTOs;
using MultiMind.API.Models;
using MultiMind.API.Services;
using Xunit;

namespace MultiMind.API.Tests;

public class AuthServiceTests
{
    // ── Helpers ────────────────────────────────────────────────────────────

    private static AppDbContext CreateDb(string dbName)
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(dbName)
            .Options;
        return new AppDbContext(opts);
    }

    private static AuthService CreateService(AppDbContext db, IJwtService? jwt = null)
    {
        jwt ??= Mock.Of<IJwtService>(j => j.GenerateToken(It.IsAny<User>()) == "fake-jwt-token");
        return new AuthService(db, jwt);
    }

    // ── RegisterAsync ──────────────────────────────────────────────────────

    [Fact]
    public async Task Register_NewUser_ReturnsAuthResponseWithTokenAndEmail()
    {
        using var db = CreateDb(nameof(Register_NewUser_ReturnsAuthResponseWithTokenAndEmail));
        var svc = CreateService(db);

        var result = await svc.RegisterAsync(new RegisterRequest("alice@example.com", "Password1!"));

        Assert.Equal("fake-jwt-token", result.Token);
        Assert.Equal("alice@example.com", result.Email);
        Assert.NotEqual(Guid.Empty, result.UserId);
        Assert.False(string.IsNullOrEmpty(result.RefreshToken));
    }

    [Fact]
    public async Task Register_FirstUser_GetsAdminRole()
    {
        using var db = CreateDb(nameof(Register_FirstUser_GetsAdminRole));
        var svc = CreateService(db);

        var result = await svc.RegisterAsync(new RegisterRequest("first@example.com", "Password1!"));

        Assert.Equal("Admin", result.Role);
        var user = await db.Users.IgnoreQueryFilters().FirstAsync();
        Assert.Equal("Admin", user.Role);
    }

    [Fact]
    public async Task Register_SecondUser_GetsUserRole()
    {
        using var db = CreateDb(nameof(Register_SecondUser_GetsUserRole));
        var svc = CreateService(db);

        await svc.RegisterAsync(new RegisterRequest("first@example.com", "Password1!"));
        var result = await svc.RegisterAsync(new RegisterRequest("second@example.com", "Password2!"));

        Assert.Equal("User", result.Role);
    }

    [Fact]
    public async Task Register_DuplicateEmail_ThrowsInvalidOperationException()
    {
        using var db = CreateDb(nameof(Register_DuplicateEmail_ThrowsInvalidOperationException));
        var svc = CreateService(db);

        await svc.RegisterAsync(new RegisterRequest("dup@example.com", "Password1!"));

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            svc.RegisterAsync(new RegisterRequest("dup@example.com", "AnotherPass1!")));
    }

    [Fact]
    public async Task Register_EmailStoredLowercase()
    {
        using var db = CreateDb(nameof(Register_EmailStoredLowercase));
        var svc = CreateService(db);

        await svc.RegisterAsync(new RegisterRequest("Alice@Example.COM", "Password1!"));

        var user = await db.Users.IgnoreQueryFilters().FirstAsync();
        Assert.Equal("alice@example.com", user.Email);
    }

    [Fact]
    public async Task Register_PasswordIsHashed_NotStoredPlaintext()
    {
        using var db = CreateDb(nameof(Register_PasswordIsHashed_NotStoredPlaintext));
        var svc = CreateService(db);
        const string plainPassword = "MySecretPass1!";

        await svc.RegisterAsync(new RegisterRequest("hash@example.com", plainPassword));

        var user = await db.Users.IgnoreQueryFilters().FirstAsync();
        Assert.NotEqual(plainPassword, user.PasswordHash);
        Assert.True(BCrypt.Net.BCrypt.Verify(plainPassword, user.PasswordHash));
    }

    [Fact]
    public async Task Register_CreatesRefreshTokenInDb()
    {
        using var db = CreateDb(nameof(Register_CreatesRefreshTokenInDb));
        var svc = CreateService(db);

        var result = await svc.RegisterAsync(new RegisterRequest("rt@example.com", "Password1!"));

        var token = await db.RefreshTokens.FirstOrDefaultAsync(rt => rt.Token == result.RefreshToken);
        Assert.NotNull(token);
        Assert.True(token.IsActive);
    }

    // ── LoginAsync ─────────────────────────────────────────────────────────

    [Fact]
    public async Task Login_ValidCredentials_ReturnsAuthResponse()
    {
        using var db = CreateDb(nameof(Login_ValidCredentials_ReturnsAuthResponse));
        var svc = CreateService(db);
        await svc.RegisterAsync(new RegisterRequest("user@example.com", "Password1!"));

        var result = await svc.LoginAsync(new LoginRequest("user@example.com", "Password1!"));

        Assert.Equal("fake-jwt-token", result.Token);
        Assert.Equal("user@example.com", result.Email);
        Assert.False(string.IsNullOrEmpty(result.RefreshToken));
    }

    [Fact]
    public async Task Login_EmailIsCaseInsensitive()
    {
        using var db = CreateDb(nameof(Login_EmailIsCaseInsensitive));
        var svc = CreateService(db);
        await svc.RegisterAsync(new RegisterRequest("user@example.com", "Password1!"));

        var result = await svc.LoginAsync(new LoginRequest("USER@EXAMPLE.COM", "Password1!"));

        Assert.Equal("user@example.com", result.Email);
    }

    [Fact]
    public async Task Login_WrongEmail_ThrowsUnauthorizedAccessException()
    {
        using var db = CreateDb(nameof(Login_WrongEmail_ThrowsUnauthorizedAccessException));
        var svc = CreateService(db);

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            svc.LoginAsync(new LoginRequest("nobody@example.com", "Password1!")));
    }

    [Fact]
    public async Task Login_WrongPassword_ThrowsUnauthorizedAccessException()
    {
        using var db = CreateDb(nameof(Login_WrongPassword_ThrowsUnauthorizedAccessException));
        var svc = CreateService(db);
        await svc.RegisterAsync(new RegisterRequest("user@example.com", "CorrectPass1!"));

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            svc.LoginAsync(new LoginRequest("user@example.com", "WrongPass1!")));
    }

    [Fact]
    public async Task Login_SuspendedAccount_ThrowsUnauthorizedAccessException()
    {
        using var db = CreateDb(nameof(Login_SuspendedAccount_ThrowsUnauthorizedAccessException));
        var svc = CreateService(db);
        await svc.RegisterAsync(new RegisterRequest("suspended@example.com", "Password1!"));

        var user = await db.Users.IgnoreQueryFilters().FirstAsync();
        user.IsActive = false;
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            svc.LoginAsync(new LoginRequest("suspended@example.com", "Password1!")));
    }

    [Fact]
    public async Task Login_UpdatesLastLoginAt()
    {
        using var db = CreateDb(nameof(Login_UpdatesLastLoginAt));
        var svc = CreateService(db);
        await svc.RegisterAsync(new RegisterRequest("user@example.com", "Password1!"));

        var before = DateTime.UtcNow.AddSeconds(-1);
        await svc.LoginAsync(new LoginRequest("user@example.com", "Password1!"));

        var user = await db.Users.IgnoreQueryFilters().FirstAsync();
        Assert.NotNull(user.LastLoginAt);
        Assert.True(user.LastLoginAt >= before);
    }

    [Fact]
    public async Task Login_CreatesNewRefreshTokenInDb()
    {
        using var db = CreateDb(nameof(Login_CreatesNewRefreshTokenInDb));
        var svc = CreateService(db);
        await svc.RegisterAsync(new RegisterRequest("user@example.com", "Password1!"));

        var loginResult = await svc.LoginAsync(new LoginRequest("user@example.com", "Password1!"));

        // 2 refresh tokens: one from Register, one from Login
        Assert.Equal(2, await db.RefreshTokens.CountAsync());
        var loginToken = await db.RefreshTokens.FirstOrDefaultAsync(rt => rt.Token == loginResult.RefreshToken);
        Assert.NotNull(loginToken);
        Assert.True(loginToken.IsActive);
    }

    // ── RefreshTokenAsync ──────────────────────────────────────────────────

    [Fact]
    public async Task Refresh_ValidToken_ReturnsNewAuthResponse()
    {
        using var db = CreateDb(nameof(Refresh_ValidToken_ReturnsNewAuthResponse));
        var svc = CreateService(db);
        var reg = await svc.RegisterAsync(new RegisterRequest("user@example.com", "Password1!"));

        var result = await svc.RefreshTokenAsync(reg.RefreshToken);

        Assert.Equal("fake-jwt-token", result.Token);
        Assert.False(string.IsNullOrEmpty(result.RefreshToken));
        Assert.NotEqual(reg.RefreshToken, result.RefreshToken); // new token issued
    }

    [Fact]
    public async Task Refresh_ValidToken_OldTokenIsRevoked()
    {
        using var db = CreateDb(nameof(Refresh_ValidToken_OldTokenIsRevoked));
        var svc = CreateService(db);
        var reg = await svc.RegisterAsync(new RegisterRequest("user@example.com", "Password1!"));

        await svc.RefreshTokenAsync(reg.RefreshToken);

        var old = await db.RefreshTokens.FirstOrDefaultAsync(rt => rt.Token == reg.RefreshToken);
        Assert.NotNull(old);
        Assert.True(old.IsRevoked);
    }

    [Fact]
    public async Task Refresh_InvalidToken_ThrowsUnauthorizedAccessException()
    {
        using var db = CreateDb(nameof(Refresh_InvalidToken_ThrowsUnauthorizedAccessException));
        var svc = CreateService(db);

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            svc.RefreshTokenAsync("completely-invalid-token"));
    }

    [Fact]
    public async Task Refresh_ExpiredToken_ThrowsUnauthorizedAccessException()
    {
        using var db = CreateDb(nameof(Refresh_ExpiredToken_ThrowsUnauthorizedAccessException));
        var svc = CreateService(db);
        var user = new User
        {
            Email = "user@example.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Password1!"),
            Role = "User"
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var expiredToken = new RefreshToken
        {
            UserId = user.Id,
            Token = "expired-token",
            ExpiresAt = DateTime.UtcNow.AddDays(-1) // already expired
        };
        db.RefreshTokens.Add(expiredToken);
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            svc.RefreshTokenAsync("expired-token"));
    }

    [Fact]
    public async Task Refresh_RevokedToken_ThrowsUnauthorizedAccessException()
    {
        using var db = CreateDb(nameof(Refresh_RevokedToken_ThrowsUnauthorizedAccessException));
        var svc = CreateService(db);
        var reg = await svc.RegisterAsync(new RegisterRequest("user@example.com", "Password1!"));

        // Revoke the token first
        await svc.RevokeRefreshTokenAsync(reg.RefreshToken);

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            svc.RefreshTokenAsync(reg.RefreshToken));
    }

    [Fact]
    public async Task Refresh_SuspendedUser_ThrowsUnauthorizedAccessException()
    {
        using var db = CreateDb(nameof(Refresh_SuspendedUser_ThrowsUnauthorizedAccessException));
        var svc = CreateService(db);
        var reg = await svc.RegisterAsync(new RegisterRequest("user@example.com", "Password1!"));

        var user = await db.Users.IgnoreQueryFilters().FirstAsync();
        user.IsActive = false;
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            svc.RefreshTokenAsync(reg.RefreshToken));
    }

    // ── RevokeRefreshTokenAsync ────────────────────────────────────────────

    [Fact]
    public async Task Revoke_ActiveToken_MarksTokenRevoked()
    {
        using var db = CreateDb(nameof(Revoke_ActiveToken_MarksTokenRevoked));
        var svc = CreateService(db);
        var reg = await svc.RegisterAsync(new RegisterRequest("user@example.com", "Password1!"));

        await svc.RevokeRefreshTokenAsync(reg.RefreshToken);

        var token = await db.RefreshTokens.FirstOrDefaultAsync(rt => rt.Token == reg.RefreshToken);
        Assert.NotNull(token);
        Assert.True(token.IsRevoked);
        Assert.False(token.IsActive);
    }

    [Fact]
    public async Task Revoke_NonExistentToken_DoesNotThrow()
    {
        using var db = CreateDb(nameof(Revoke_NonExistentToken_DoesNotThrow));
        var svc = CreateService(db);

        var ex = await Record.ExceptionAsync(() =>
            svc.RevokeRefreshTokenAsync("token-that-does-not-exist"));

        Assert.Null(ex);
    }

    [Fact]
    public async Task Revoke_AlreadyRevokedToken_DoesNotThrow()
    {
        using var db = CreateDb(nameof(Revoke_AlreadyRevokedToken_DoesNotThrow));
        var svc = CreateService(db);
        var reg = await svc.RegisterAsync(new RegisterRequest("user@example.com", "Password1!"));

        await svc.RevokeRefreshTokenAsync(reg.RefreshToken);
        var ex = await Record.ExceptionAsync(() =>
            svc.RevokeRefreshTokenAsync(reg.RefreshToken)); // second call

        Assert.Null(ex);
    }
}
