using System.Diagnostics;
using System.Security.Claims;
using MultiMind.API.Services;

namespace MultiMind.API.Middleware;

public class RequestLoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RequestLoggingMiddleware> _logger;

    public RequestLoggingMiddleware(RequestDelegate next, ILogger<RequestLoggingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context, IApplicationLogService appLog)
    {
        var sw = Stopwatch.StartNew();
        await _next(context);
        sw.Stop();

        var method = context.Request.Method;
        var path   = context.Request.Path.Value ?? "";
        var status = context.Response.StatusCode;
        var ms     = sw.ElapsedMilliseconds;

        _logger.LogInformation("{Method} {Path} → {Status} in {Ms}ms", method, path, status, ms);

        // Skip noisy health / swagger paths
        if (path.StartsWith("/scalar") || path.StartsWith("/openapi") || path.StartsWith("/health"))
            return;

        var userId = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                  ?? context.User.FindFirst("sub")?.Value;

        var level = status >= 500 ? "Error" : status >= 400 ? "Warning" : "Info";

        try
        {
            await appLog.LogAsync(
                level:      level,
                category:   "HttpRequest",
                message:    $"{method} {path} → {status}",
                userId:     userId,
                path:       path,
                statusCode: status,
                durationMs: ms);
        }
        catch
        {
            // Never let logging failures break the request
        }
    }
}
