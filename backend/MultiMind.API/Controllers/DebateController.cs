using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MultiMind.API.Data;
using MultiMind.API.DTOs;
using MultiMind.API.Models;
using MultiMind.API.Services;

namespace MultiMind.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class DebateController : ControllerBase
{
    private readonly IDebateEngine _debateEngine;
    private readonly AppDbContext _db;
    private readonly ILogger<DebateController> _logger;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IDebateEventBus _eventBus;
    private readonly IUserInputWaiter _userInputWaiter;

    public DebateController(IDebateEngine debateEngine, AppDbContext db,
        ILogger<DebateController> logger, IServiceScopeFactory scopeFactory,
        IDebateEventBus eventBus, IUserInputWaiter userInputWaiter)
    {
        _debateEngine = debateEngine;
        _db = db;
        _logger = logger;
        _scopeFactory = scopeFactory;
        _eventBus = eventBus;
        _userInputWaiter = userInputWaiter;
    }

    [HttpPost("start")]
    public async Task<IActionResult> StartDebate([FromBody] StartDebateRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Prompt))
            return BadRequest(new { message = "Prompt cannot be empty." });

        if (request.Prompt.Length > 4000)
            return BadRequest(new { message = "Prompt exceeds maximum length of 4000 characters." });

        if (ContainsInjectionPattern(request.Prompt))
            return BadRequest(new { message = "Input contains disallowed content." });

        var userId = GetUserId();
        if (userId == Guid.Empty)
            return Unauthorized();

        var session = await _debateEngine.CreateSessionAsync(userId, request.Prompt);

        // Only launch background work for brand-new sessions
        if (session.Status == "running" && session.CreatedAt > DateTime.UtcNow.AddSeconds(-5))
        {
            // Create SSE channel before launching background task so stream endpoint can subscribe immediately
            _eventBus.CreateChannel(session.Id);

            _ = Task.Run(async () =>
            {
                using var scope = _scopeFactory.CreateScope();
                var engine = scope.ServiceProvider.GetRequiredService<IDebateEngine>();
                try { await engine.RunDebateAsync(session.Id, userId, request.Prompt); }
                catch (Exception ex) { _logger.LogError(ex, "[DebateController] Background debate {SessionId} threw: {Message}", session.Id, ex.Message); }
            });
        }

        return Ok(new { sessionId = session.Id });
    }

    /// <summary>SSE endpoint — streams live debate events as they happen.</summary>
    [HttpGet("{sessionId}/stream")]
    public async Task StreamDebate(Guid sessionId, CancellationToken ct)
    {
        var userId = GetUserId();

        // Verify ownership
        var session = await _db.DebateSessions.FirstOrDefaultAsync(
            s => s.Id == sessionId && s.UserId == userId, ct);
        if (session == null)
        {
            Response.StatusCode = 404;
            return;
        }

        Response.Headers.Append("Content-Type", "text/event-stream");
        Response.Headers.Append("Cache-Control", "no-cache");
        Response.Headers.Append("X-Accel-Buffering", "no");

        // If debate already complete, return a single DebateComplete event and exit
        if (session.Status == "completed" || session.Status == "failed")
        {
            var payload = await BuildTerminalStreamEventAsync(session, ct);
            await Response.WriteAsync($"data: {payload}\n\n", ct);
            await Response.Body.FlushAsync(ct);
            return;
        }

        // Stream live events from EventBus
        bool sentFinalEvent = false;
        try
        {
            await foreach (var evt in _eventBus.SubscribeAsync(sessionId, ct))
            {
                if (ct.IsCancellationRequested) break;

                var json = JsonSerializer.Serialize(evt, new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                    Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
                });
                var line = $"data: {json}\n\n";
                await Response.WriteAsync(line, Encoding.UTF8, ct);
                await Response.Body.FlushAsync(ct);

                if (evt.EventType == DebateEventType.DebateComplete ||
                    evt.EventType == DebateEventType.Error)
                {
                    sentFinalEvent = true;
                    break;
                }
            }

            // Race condition guard: if the channel was already closed before the client
            // connected (debate finished very fast), SubscribeAsync yields nothing and
            // sentFinalEvent stays false. Re-read the session and send the terminal event.
            // Only send a fallback if the debate has definitively ended (completed or failed).
            if (!sentFinalEvent && !ct.IsCancellationRequested)
            {
                var latest = await _db.DebateSessions.AsNoTracking()
                    .FirstOrDefaultAsync(s => s.Id == sessionId, ct);
                if (latest != null && (latest.Status == "completed" || latest.Status == "failed"))
                {
                    var fallback = await BuildTerminalStreamEventAsync(latest, ct);
                    await Response.WriteAsync($"data: {fallback}\n\n", ct);
                    await Response.Body.FlushAsync(ct);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Client disconnected — normal
        }
    }

    private async Task<string> BuildTerminalStreamEventAsync(DebateSession session, CancellationToken ct)
    {
        string? text = null;

        if (session.Status == "completed")
        {
            var synthesis = session.Synthesis ?? await _db.ModeratorSyntheses.AsNoTracking()
                .FirstOrDefaultAsync(s => s.SessionId == session.Id, ct);

            if (synthesis != null)
            {
                text = JsonSerializer.Serialize(new
                {
                    confidenceScore = synthesis.ConfidenceScore,
                    recommendation = synthesis.Recommendation
                });
            }
        }

        return JsonSerializer.Serialize(new
        {
            eventType = session.Status == "completed" ? "DebateComplete" : "Error",
            sessionId = session.Id,
            text
        });
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
            ),
            session.IsFavourite,
            session.CreatedAt,
            session.UserInput
        );

        return Ok(dto);
    }

    [HttpGet("history")]
    public async Task<IActionResult> GetHistory([FromQuery] string? search, [FromQuery] string? status)
    {
        var userId = GetUserId();

        var query = _db.DebateSessions.Where(s => s.UserId == userId);

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(s => s.OriginalPrompt.ToLower().Contains(search.ToLower()));

        if (!string.IsNullOrWhiteSpace(status) && status != "all")
            query = query.Where(s => s.Status == status);

        var sessions = await query
            .OrderByDescending(s => s.IsFavourite)
            .ThenByDescending(s => s.CreatedAt)
            .Select(s => new
            {
                s.Id,
                s.OriginalPrompt,
                s.Status,
                s.CreatedAt,
                s.IsFavourite
            })
            .ToListAsync();

        return Ok(sessions);
    }

    [HttpPut("{sessionId}/favourite")]
    public async Task<IActionResult> ToggleFavourite(Guid sessionId)
    {
        var userId = GetUserId();
        var session = await _db.DebateSessions
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == userId);
        if (session == null) return NotFound();

        session.IsFavourite = !session.IsFavourite;
        await _db.SaveChangesAsync();
        return Ok(new { isFavourite = session.IsFavourite });
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        var userId = GetUserId();
        var sessions = await _db.DebateSessions
            .Where(s => s.UserId == userId)
            .Include(s => s.Synthesis)
            .ToListAsync();

        var completed = sessions.Where(s => s.Status == "completed").ToList();
        var avgConfidence = completed.Any(s => s.Synthesis != null)
            ? completed.Where(s => s.Synthesis != null).Average(s => s.Synthesis!.ConfidenceScore)
            : 0;

        return Ok(new
        {
            total = sessions.Count,
            completed = completed.Count,
            failed = sessions.Count(s => s.Status == "failed"),
            favourites = sessions.Count(s => s.IsFavourite),
            avgConfidence = Math.Round(avgConfidence, 1)
        });
    }

    private Guid GetUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)
                 ?? User.FindFirst("sub");
        return claim != null && Guid.TryParse(claim.Value, out var id) ? id : Guid.Empty;
    }

    [HttpPost("{sessionId}/user-input")]
    public async Task<IActionResult> SubmitUserInput(Guid sessionId, [FromBody] UserInputRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Message))
            return BadRequest(new { message = "Message cannot be empty." });

        if (request.Message.Length > 4000)
            return BadRequest(new { message = "Message exceeds 4000 characters." });

        var userId = GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var session = await _db.DebateSessions
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == userId);

        if (session == null) return NotFound();

        if (session.Status != "running")
            return BadRequest(new { message = "Debate is not currently running." });

        var accepted = _userInputWaiter.TrySubmit(sessionId, request.Message);
        if (!accepted)
            return BadRequest(new { message = "Debate is not currently waiting for user input." });

        return Ok(new { message = "Input submitted." });
    }

    [HttpPost("{sessionId}/user-input/skip")]
    public async Task<IActionResult> SkipUserInput(Guid sessionId)
    {
        var userId = GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var session = await _db.DebateSessions
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == userId);

        if (session == null) return NotFound();

        if (session.Status != "running")
            return BadRequest(new { message = "Debate is not currently running." });

        _userInputWaiter.Cancel(sessionId);

        return Ok(new { message = "Input skipped." });
    }
}
