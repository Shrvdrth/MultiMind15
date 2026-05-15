using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MultiMind.API.Data;
using MultiMind.API.DTOs;
using MultiMind.API.Services;

namespace MultiMind.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly AppDbContext _db;

    public AuthController(IAuthService authService, AppDbContext db)
    {
        _authService = authService;
        _db = db;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            return BadRequest(new { message = "Email and password are required." });

        if (request.Password.Length < 8)
            return BadRequest(new { message = "Password must be at least 8 characters." });

        try
        {
            var result = await _authService.RegisterAsync(request);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            return BadRequest(new { message = "Email and password are required." });

        try
        {
            var result = await _authService.LoginAsync(request);
            return Ok(result);
        }
        catch (UnauthorizedAccessException)
        {
            return Unauthorized(new { message = "Invalid credentials." });
        }
    }

    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
            return BadRequest(new { message = "Email is required." });

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == request.Email);
        if (user == null)
            // Return success even if not found to avoid user enumeration
            return Ok(new { message = "If that email exists, a reset token has been generated." });

        // Generate a 6-digit token (no email service needed — token returned in response)
        var token = Random.Shared.Next(100000, 999999).ToString();
        user.ResetToken = BCrypt.Net.BCrypt.HashPassword(token);
        user.ResetTokenExpires = DateTime.UtcNow.AddMinutes(15);
        await _db.SaveChangesAsync();

        // In a production app this would be emailed. For now return it directly.
        return Ok(new { token, message = "Reset token generated. Use it within 15 minutes." });
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Token) || string.IsNullOrWhiteSpace(request.NewPassword))
            return BadRequest(new { message = "Token and new password are required." });

        if (request.NewPassword.Length < 8)
            return BadRequest(new { message = "Password must be at least 8 characters." });

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == request.Email);
        if (user == null || user.ResetToken == null || user.ResetTokenExpires == null)
            return BadRequest(new { message = "Invalid or expired reset token." });

        if (DateTime.UtcNow > user.ResetTokenExpires)
            return BadRequest(new { message = "Reset token has expired. Please request a new one." });

        if (!BCrypt.Net.BCrypt.Verify(request.Token, user.ResetToken))
            return BadRequest(new { message = "Invalid reset token." });

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        user.ResetToken = null;
        user.ResetTokenExpires = null;
        await _db.SaveChangesAsync();

        return Ok(new { message = "Password reset successfully. You can now sign in." });
    }
}
