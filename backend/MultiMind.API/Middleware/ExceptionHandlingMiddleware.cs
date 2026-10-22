using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using MultiMind.API.Services;

namespace MultiMind.API.Middleware;

public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context, IApplicationLogService appLog)
    {
        try
        {
            await _next(context);
        }
        catch (UsageLimitExceededException ex)
        {
            // Expected when the free daily quota runs out — not an error.
            _logger.LogInformation("Usage limit ({Scope}) reached for {Path}", ex.Scope, context.Request.Path);
            await WriteUsageLimitAsync(context, ex);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception for {Method} {Path}",
                context.Request.Method, context.Request.Path);

            var userId = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                      ?? context.User.FindFirst("sub")?.Value;

            try
            {
                await appLog.LogAsync(
                    level:    "Error",
                    category: "Exception",
                    message:  $"{ex.GetType().Name}: {ex.Message}",
                    details:  ex.ToString(),
                    userId:   userId,
                    path:     context.Request.Path.Value);
            }
            catch
            {
                // Never let logging failures mask the original exception
            }

            await HandleExceptionAsync(context, ex);
        }
    }

    /// <summary>
    /// Writes a 429 response the frontend recognises by <c>code = "usage_limit"</c>.
    /// </summary>
    public static async Task WriteUsageLimitAsync(HttpContext context, UsageLimitExceededException ex)
    {
        var retrySeconds = (int)Math.Ceiling(ex.RetryAfter.TotalSeconds);
        context.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        context.Response.ContentType = "application/json";
        context.Response.Headers.RetryAfter = retrySeconds.ToString();

        var json = JsonSerializer.Serialize(new
        {
            code = "usage_limit",
            scope = ex.Scope,
            message = ex.Message,
            retryAfterSeconds = retrySeconds
        });
        await context.Response.WriteAsync(json);
    }

    private static async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        context.Response.ContentType = "application/problem+json";

        var (status, title) = exception switch
        {
            UnauthorizedAccessException => (StatusCodes.Status401Unauthorized, "Unauthorized"),
            InvalidOperationException   => (StatusCodes.Status400BadRequest,   "Bad Request"),
            KeyNotFoundException        => (StatusCodes.Status404NotFound,     "Not Found"),
            ArgumentException           => (StatusCodes.Status400BadRequest,   "Validation Error"),
            _                           => (StatusCodes.Status500InternalServerError, "An unexpected error occurred")
        };

        context.Response.StatusCode = status;

        var problem = new ProblemDetails
        {
            Status   = status,
            Title    = title,
            Detail   = exception.Message,
            Instance = context.Request.Path
        };

        var json = JsonSerializer.Serialize(problem, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        });

        await context.Response.WriteAsync(json);
    }
}
