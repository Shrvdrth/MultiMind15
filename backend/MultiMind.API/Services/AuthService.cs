using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using MultiMind.API.Data;
using MultiMind.API.DTOs;
using MultiMind.API.Models;

namespace MultiMind.API.Services;

public interface IAuthService
{
    Task<AuthResponse> RegisterAsync(RegisterRequest request);
    Task<AuthResponse> LoginAsync(LoginRequest request);
    Task<AuthResponse> RefreshTokenAsync(string refreshToken);
    Task RevokeRefreshTokenAsync(string refreshToken);
}

public class AuthService : IAuthService
{
    private readonly AppDbContext _db;
    private readonly IJwtService _jwt;
    private readonly IConfiguration? _config;

    public AuthService(AppDbContext db, IJwtService jwt, IConfiguration? config = null)
    {
        _db = db;
        _jwt = jwt;
        _config = config;
    }

    /// <summary>
    /// True when the email matches the configured Admin:Email (case-insensitive).
    /// Nobody becomes Admin automatically when it isn't set.
    /// </summary>
    public static bool IsConfiguredAdmin(IConfiguration? config, string email)
    {
        var adminEmail = config?["Admin:Email"]?.Trim();
        return !string.IsNullOrEmpty(adminEmail)
            && string.Equals(adminEmail, email.Trim(), StringComparison.OrdinalIgnoreCase);
    }

    public async Task<AuthResponse> RegisterAsync(RegisterRequest request)
    {
        if (await _db.Users.AnyAsync(u => u.Email == request.Email.ToLower()))
            throw new InvalidOperationException("Email already registered.");

        var user = new User
        {
            Email = request.Email.ToLower(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            Role = IsConfiguredAdmin(_config, request.Email) ? "Admin" : "User"
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var refreshToken = await CreateRefreshTokenAsync(user.Id);
        return new AuthResponse(_jwt.GenerateToken(user), user.Email, user.Id, user.Role, refreshToken.Token);
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == request.Email.ToLower())
            ?? throw new UnauthorizedAccessException("Invalid credentials.");

        if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            throw new UnauthorizedAccessException("Invalid credentials.");

        if (!user.IsActive)
            throw new UnauthorizedAccessException("Account suspended. Contact support.");

        user.LastLoginAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var refreshToken = await CreateRefreshTokenAsync(user.Id);
        return new AuthResponse(_jwt.GenerateToken(user), user.Email, user.Id, user.Role, refreshToken.Token);
    }

    public async Task<AuthResponse> RefreshTokenAsync(string refreshToken)
    {
        var stored = await _db.RefreshTokens
            .Include(rt => rt.User)
            .FirstOrDefaultAsync(rt => rt.Token == refreshToken)
            ?? throw new UnauthorizedAccessException("Invalid refresh token.");

        if (!stored.IsActive)
            throw new UnauthorizedAccessException("Refresh token has expired or been revoked.");

        if (!stored.User.IsActive)
            throw new UnauthorizedAccessException("Account suspended.");

        // Rotate — revoke old, issue new
        stored.RevokedAt = DateTime.UtcNow;
        var newRefreshToken = await CreateRefreshTokenAsync(stored.UserId);
        await _db.SaveChangesAsync();

        return new AuthResponse(_jwt.GenerateToken(stored.User), stored.User.Email, stored.User.Id, stored.User.Role, newRefreshToken.Token);
    }

    public async Task RevokeRefreshTokenAsync(string refreshToken)
    {
        var stored = await _db.RefreshTokens.FirstOrDefaultAsync(rt => rt.Token == refreshToken);
        if (stored != null && stored.IsActive)
        {
            stored.RevokedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
        }
    }

    private async Task<RefreshToken> CreateRefreshTokenAsync(Guid userId)
    {
        var token = new RefreshToken
        {
            UserId = userId,
            Token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64)),
            ExpiresAt = DateTime.UtcNow.AddDays(30)
        };
        _db.RefreshTokens.Add(token);
        await _db.SaveChangesAsync();
        return token;
    }
}
