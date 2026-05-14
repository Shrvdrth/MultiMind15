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

        // Epic 11.6 — Block prompt injection patterns
        if (ContainsInjectionPattern(request.Prompt))
            return BadRequest(new { message = "Input contains disallowed content." });

        var userId = GetUserId();
        if (userId == Guid.Empty)
            return Unauthorized();

        // Create session immediately and run debate in background so the client can poll
        var session = await _debateEngine.CreateSessionAsync(userId, request.Prompt);

        _ = Task.Run(async () =>
        {
            try { await _debateEngine.RunDebateAsync(session.Id, userId, request.Prompt); }
            catch { /* errors are recorded in session.Status = "failed" */ }
        });

        return Ok(new { sessionId = session.Id });
    }

    // Epic 11.6 — Basic prompt injection safeguard
    private static bool ContainsInjectionPattern(string prompt)
    {
        var lower = prompt.ToLowerInvariant();
        string[] patterns = [
            "ignore previous instructions",
            "ignore all instructions",
            "disregard your",
            "you are now",
            "act as an ai",
            "jailbreak",
            "do anything now",
            "forget your instructions",
            "new personality",
            "override your"
        ];
        return patterns.Any(p => lower.Contains(p));
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
