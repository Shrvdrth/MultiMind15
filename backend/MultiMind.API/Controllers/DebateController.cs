using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MultiMind.API.Data;
using MultiMind.API.DTOs;
using MultiMind.API.Services;

namespace MultiMind.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class DebateController : ControllerBase
{
    private readonly IDebateEngine _debateEngine;
    private readonly AppDbContext _db;

    public DebateController(IDebateEngine debateEngine, AppDbContext db)
    {
        _debateEngine = debateEngine;
        _db = db;
    }

    [HttpPost("start")]
    public async Task<IActionResult> StartDebate([FromBody] StartDebateRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Prompt))
            return BadRequest(new { message = "Prompt cannot be empty." });

        if (request.Prompt.Length > 4000)
            return BadRequest(new { message = "Prompt exceeds maximum length of 4000 characters." });

        var userId = GetUserId();
        if (userId == Guid.Empty)
            return Unauthorized();

        var session = await _debateEngine.RunDebateAsync(userId, request.Prompt);
        return Ok(new { sessionId = session.Id });
    }

    [HttpGet("{sessionId}")]
    public async Task<IActionResult> GetSession(Guid sessionId)
    {
        var userId = GetUserId();

        var session = await _db.DebateSessions
            .Include(s => s.Rounds)
                .ThenInclude(r => r.AgentResponses)
            .Include(s => s.Synthesis)
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == userId);

        if (session == null)
            return NotFound();

        var dto = new DebateSessionDto(
            session.Id,
            session.OriginalPrompt,
            session.Status,
            session.Rounds
                .OrderBy(r => r.RoundNumber)
                .Select(r => new DebateRoundDto(
                    r.RoundNumber,
                    r.AgentResponses
                        .Select(a => new AgentResponseDto(a.AgentType, a.ResponseText))
                        .ToList()
                ))
                .ToList(),
            session.Synthesis == null ? null : new ModeratorSynthesisDto(
                session.Synthesis.Recommendation,
                session.Synthesis.ConfidenceScore,
                session.Synthesis.KeyDissentingViewpoints,
                session.Synthesis.FullSynthesis
            )
        );

        return Ok(dto);
    }

    [HttpGet("history")]
    public async Task<IActionResult> GetHistory()
    {
        var userId = GetUserId();

        var sessions = await _db.DebateSessions
            .Where(s => s.UserId == userId)
            .OrderByDescending(s => s.CreatedAt)
            .Select(s => new
            {
                s.Id,
                s.OriginalPrompt,
                s.Status,
                s.CreatedAt
            })
            .ToListAsync();

        return Ok(sessions);
    }

    private Guid GetUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)
                 ?? User.FindFirst("sub");
        return claim != null && Guid.TryParse(claim.Value, out var id) ? id : Guid.Empty;
    }
}
