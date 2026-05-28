using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MultiMind.API.Data;
using MultiMind.API.DTOs;
using MultiMind.API.Services;

namespace MultiMind.API.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(Policy = "AdminOnly")]
public class AdminController : ControllerBase
{
    private readonly AdminService _adminService;
    private readonly AppDbContext _db;
    private readonly AdminActionLogger _logger;

    public AdminController(AdminService adminService, AppDbContext db, AdminActionLogger logger)
    {
        _adminService = adminService;
        _db = db;
        _logger = logger;
    }

    // ── Stats ──────────────────────────────────────────────────────────────

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats() =>
        Ok(await _adminService.GetStatsAsync());

    // ── Users ──────────────────────────────────────────────────────────────

    [HttpGet("users")]
    public async Task<IActionResult> GetUsers(
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20) =>
        Ok(await _adminService.GetUsersAsync(search, page, pageSize));

    [HttpPut("users/{userId}/role")]
    public async Task<IActionResult> SetRole(Guid userId, [FromBody] SetRoleRequest request)
    {
        if (request.Role is not ("Admin" or "User"))
            return BadRequest(new { message = "Role must be 'Admin' or 'User'." });

        var user = await _db.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Id == userId && !u.IsDeleted);
        if (user == null) return NotFound();

        user.Role = request.Role;
        await _db.SaveChangesAsync();

        var adminId = GetAdminId();
        await _logger.LogAsync(adminId, "SetRole", "User", userId,
            $"Role set to {request.Role} for {user.Email}");

        return Ok(new { message = $"Role updated to {request.Role}." });
    }

    [HttpPut("users/{userId}/status")]
    public async Task<IActionResult> SetStatus(Guid userId, [FromBody] SetActiveRequest request)
    {
        var user = await _db.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Id == userId && !u.IsDeleted);
        if (user == null) return NotFound();

        user.IsActive = request.IsActive;
        await _db.SaveChangesAsync();

        var adminId = GetAdminId();
        var action = request.IsActive ? "ReactivateUser" : "SuspendUser";
        await _logger.LogAsync(adminId, action, "User", userId, user.Email);

        return Ok(new { message = request.IsActive ? "User reactivated." : "User suspended." });
    }

    [HttpDelete("users/{userId}")]
    public async Task<IActionResult> DeleteUser(Guid userId)
    {
        var adminId = GetAdminId();
        if (userId == adminId)
            return BadRequest(new { message = "Cannot delete your own account." });

        var user = await _db.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Id == userId && !u.IsDeleted);
        if (user == null) return NotFound();

        user.IsDeleted = true;
        await _db.SaveChangesAsync();

        await _logger.LogAsync(adminId, "DeleteUser", "User", userId, user.Email);

        return Ok(new { message = "User soft-deleted." });
    }

    // ── Debates ────────────────────────────────────────────────────────────

    [HttpGet("debates")]
    public async Task<IActionResult> GetDebates(
        [FromQuery] string? search,
        [FromQuery] Guid? userId,
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20) =>
        Ok(await _adminService.GetDebatesAsync(search, userId, status, page, pageSize));

    [HttpDelete("debates/{sessionId}")]
    public async Task<IActionResult> DeleteDebate(Guid sessionId)
    {
        var session = await _db.DebateSessions.IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.DeletedAt == null);
        if (session == null) return NotFound();

        session.DeletedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var adminId = GetAdminId();
        await _logger.LogAsync(adminId, "SoftDeleteDebate", "DebateSession", sessionId, null);

        return Ok(new { message = "Debate soft-deleted." });
    }

    // ── Comments ───────────────────────────────────────────────────────────

    [HttpGet("comments")]
    public async Task<IActionResult> GetComments(
        [FromQuery] Guid? sessionId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20) =>
        Ok(await _adminService.GetCommentsAsync(sessionId, page, pageSize));

    [HttpDelete("comments/{commentId}")]
    public async Task<IActionResult> DeleteComment(Guid commentId)
    {
        var comment = await _db.UserComments.IgnoreQueryFilters()
            .FirstOrDefaultAsync(c => c.Id == commentId);
        if (comment == null) return NotFound();

        comment.IsDeleted = true;
        await _db.SaveChangesAsync();

        var adminId = GetAdminId();
        await _logger.LogAsync(adminId, "DeleteComment", "UserComment", commentId, null);

        return Ok(new { message = "Comment deleted." });
    }

    // ── Logs ───────────────────────────────────────────────────────────────

    [HttpGet("logs")]
    public async Task<IActionResult> GetLogs(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 30) =>
        Ok(await _adminService.GetLogsAsync(page, pageSize));

    // ── Password Reset ─────────────────────────────────────────────────────

    [HttpPost("users/{userId}/reset-password")]
    public async Task<IActionResult> ResetUserPassword(Guid userId, [FromBody] AdminResetPasswordRequest request)
    {
        if (request.Mode is not ("direct" or "generate"))
            return BadRequest(new { message = "Mode must be 'direct' or 'generate'." });

        var user = await _db.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Id == userId && !u.IsDeleted);
        if (user == null) return NotFound();

        var adminId = GetAdminId();

        if (request.Mode == "direct")
        {
            if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 8)
                return BadRequest(new { message = "New password must be at least 8 characters." });

            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
            user.ResetToken = null;
            user.ResetTokenExpires = null;
            await _db.SaveChangesAsync();

            await _logger.LogAsync(adminId, "AdminSetPassword", "User", userId, user.Email);
            return Ok(new AdminResetPasswordResponse("Password updated successfully.", null, null));
        }
        else
        {
            // Generate a 6-digit token (same mechanism as ForgotPassword)
            var token = RandomNumberGenerator.GetInt32(100000, 999999).ToString();
            var expires = DateTime.UtcNow.AddMinutes(15);
            user.ResetToken = BCrypt.Net.BCrypt.HashPassword(token);
            user.ResetTokenExpires = expires;
            await _db.SaveChangesAsync();

            await _logger.LogAsync(adminId, "AdminGenerateResetToken", "User", userId, user.Email);
            return Ok(new AdminResetPasswordResponse("Reset token generated.", token, expires));
        }
    }

    // ── Application Logs ───────────────────────────────────────────────────

    [HttpGet("application-logs")]
    public async Task<IActionResult> GetApplicationLogs(
        [FromQuery] string? level,
        [FromQuery] string? category,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        var query = _db.ApplicationLogs.AsQueryable();

        if (!string.IsNullOrWhiteSpace(level))
            query = query.Where(l => l.Level == level);

        if (!string.IsNullOrWhiteSpace(category))
            query = query.Where(l => l.Category == category);

        var total = await query.CountAsync();
        var logs = await query
            .OrderByDescending(l => l.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(l => new ApplicationLogDto(
                l.Id, l.Level, l.Category, l.Message, l.Details,
                l.UserId, l.Path, l.StatusCode, l.DurationMs, l.CreatedAt))
            .ToListAsync();

        return Ok(new ApplicationLogListDto(logs, total, page, pageSize));
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private Guid GetAdminId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier) ?? User.FindFirst("sub");
        return claim != null && Guid.TryParse(claim.Value, out var id) ? id : Guid.Empty;
    }
}
