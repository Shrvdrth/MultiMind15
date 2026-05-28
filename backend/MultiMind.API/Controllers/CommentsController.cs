using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MultiMind.API.Data;
using MultiMind.API.DTOs;
using MultiMind.API.Models;
using MultiMind.API.Services;

namespace MultiMind.API.Controllers;

[ApiController]
[Route("api/debate/{sessionId}/comments")]
[Authorize]
public class CommentsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly CommentService _commentService;
    private readonly IServiceScopeFactory _scopeFactory;

    public CommentsController(AppDbContext db, CommentService commentService, IServiceScopeFactory scopeFactory)
    {
        _db = db;
        _commentService = commentService;
        _scopeFactory = scopeFactory;
    }

    [HttpGet]
    public async Task<IActionResult> GetComments(Guid sessionId)
    {
        // Verify session exists and belongs to user (or user is admin)
        var userId = GetUserId();
        var isAdmin = User.IsInRole("Admin");

        var session = await _db.DebateSessions.FirstOrDefaultAsync(s =>
            s.Id == sessionId && (s.UserId == userId || isAdmin));
        if (session == null) return NotFound();

        var comments = await _db.UserComments
            .Where(c => c.SessionId == sessionId && c.ParentCommentId == null)
            .Include(c => c.User)
            .Include(c => c.Replies.Where(r => !r.IsDeleted))
            .OrderByDescending(c => c.CreatedAt)
            .ToListAsync();

        return Ok(comments.Select(MapToDto));
    }

    [HttpPost]
    public async Task<IActionResult> CreateComment(Guid sessionId, [FromBody] CreateCommentRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Content))
            return BadRequest(new { message = "Comment content cannot be empty." });

        if (request.Content.Length > 2000)
            return BadRequest(new { message = "Comment exceeds 2000 character limit." });

        var userId = GetUserId();
        var isAdmin = User.IsInRole("Admin");

        var session = await _db.DebateSessions.FirstOrDefaultAsync(s =>
            s.Id == sessionId && (s.UserId == userId || isAdmin));
        if (session == null) return NotFound();

        var comment = new UserComment
        {
            SessionId = sessionId,
            UserId = userId,
            Content = request.Content,
            IsAiGenerated = false
        };
        _db.UserComments.Add(comment);
        await _db.SaveChangesAsync();

        // Trigger AI replies in background
        var commentId = comment.Id;
        var content = request.Content;
        _ = Task.Run(async () =>
        {
            using var scope = _scopeFactory.CreateScope();
            var svc = scope.ServiceProvider.GetRequiredService<CommentService>();
            await svc.TriggerAiRepliesAsync(sessionId, commentId, content);
        });

        return CreatedAtAction(nameof(GetComments), new { sessionId }, MapToDto(comment));
    }

    [HttpPut("{commentId}")]
    public async Task<IActionResult> UpdateComment(Guid sessionId, Guid commentId,
        [FromBody] UpdateCommentRequest request)
    {
        var userId = GetUserId();
        var comment = await _db.UserComments.FirstOrDefaultAsync(c =>
            c.Id == commentId && c.SessionId == sessionId && c.UserId == userId && !c.IsAiGenerated);

        if (comment == null) return NotFound();

        comment.Content = request.Content;
        comment.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(MapToDto(comment));
    }

    [HttpDelete("{commentId}")]
    public async Task<IActionResult> DeleteComment(Guid sessionId, Guid commentId)
    {
        var userId = GetUserId();
        var isAdmin = User.IsInRole("Admin");

        var comment = await _db.UserComments.FirstOrDefaultAsync(c =>
            c.Id == commentId && c.SessionId == sessionId &&
            (c.UserId == userId || isAdmin));

        if (comment == null) return NotFound();

        comment.IsDeleted = true;
        await _db.SaveChangesAsync();

        return Ok(new { message = "Comment deleted." });
    }

    private static CommentDto MapToDto(UserComment c) => new(
        c.Id,
        c.SessionId,
        c.UserId,
        c.User?.DisplayName ?? (c.IsAiGenerated ? c.AgentType : "User"),
        c.AgentType,
        c.Content,
        c.IsAiGenerated,
        c.ParentCommentId,
        c.CreatedAt,
        c.UpdatedAt,
        c.Replies
            .Where(r => !r.IsDeleted)
            .OrderBy(r => r.CreatedAt)
            .Select(MapToDto)
            .ToList()
    );

    private Guid GetUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier) ?? User.FindFirst("sub");
        return claim != null && Guid.TryParse(claim.Value, out var id) ? id : Guid.Empty;
    }
}
