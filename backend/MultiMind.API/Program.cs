using System.Text;
using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using MultiMind.API.Data;
using MultiMind.API.Middleware;
using MultiMind.API.Repositories;
using MultiMind.API.Services;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// ── Port ──
// Render (and most hosts) tell the app which port to use through PORT.
// Without it, keep the container default of 8080 (ASPNETCORE_HTTP_PORTS).
var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrWhiteSpace(port))
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

// ── Database ──
// Accepts "Host=...;" or a postgresql:// URL (Neon), from the setting or DATABASE_URL.
var connectionString = DeploymentSettings.ResolveConnectionString(
    builder.Configuration.GetConnectionString("DefaultConnection"),
    Environment.GetEnvironmentVariable("DATABASE_URL"));
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));

// ── JWT Authentication ──
var jwtKey = builder.Configuration["Jwt:Key"];
if (string.IsNullOrEmpty(jwtKey))
    throw new InvalidOperationException("JWT key (Jwt:Key) is required and cannot be empty.");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", p => p.RequireRole("Admin"));
});

// ── CORS ──
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        var allowedOrigins = new List<string>
        {
            "http://localhost:5173",
            "http://localhost:5174",
            "http://localhost:3000",  // Docker Compose
        };

        // Production frontend URL(s), comma-separated, e.g.
        // Frontend__Url=https://multimind.vercel.app,https://my-domain.com
        allowedOrigins.AddRange(DeploymentSettings.ParseOrigins(builder.Configuration["Frontend:Url"]));

        policy.WithOrigins(allowedOrigins.ToArray())
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// ── Usage limits (protect the OpenRouter free quota) ──
// Daily, database-backed limits on debates and chatbot messages. Override with
// e.g. UsageLimits__DebatesPerUserPerDay=2, UsageLimits__DebatesPerSitePerDay=6.
builder.Services.AddSingleton(
    builder.Configuration.GetSection("UsageLimits").Get<UsageLimitOptions>() ?? new UsageLimitOptions());
builder.Services.AddScoped<IUsageLimitService, UsageLimitService>();

// Short-term, per-IP limits on sign-in endpoints, so nobody can create lots of
// accounts to get around the per-user limits. In memory: resets on restart.
builder.Services.AddRateLimiter(options =>
{
    static string ClientIp(HttpContext ctx) => ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";

    options.AddPolicy("auth", ctx => RateLimitPartition.GetFixedWindowLimiter(ClientIp(ctx),
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    options.AddPolicy("register", ctx => RateLimitPartition.GetFixedWindowLimiter(ClientIp(ctx),
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromHours(1), QueueLimit = 0 }));

    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, ct) =>
    {
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retry))
            context.HttpContext.Response.Headers.RetryAfter = ((int)retry.TotalSeconds).ToString();
        context.HttpContext.Response.ContentType = "application/json";
        await context.HttpContext.Response.WriteAsync(JsonSerializer.Serialize(new
        {
            code = "rate_limited",
            message = "Too many attempts. Please wait a few minutes and try again."
        }), ct);
    };
});

// Render (and nginx in docker-compose) sit in front of the app. Take the client IP
// from the last X-Forwarded-For entry, which the proxy adds and visitors can't fake.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 1;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

// ── Application Services ──
builder.Services.AddScoped<IJwtService, JwtService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IAgentService, AgentService>();
builder.Services.AddScoped<IModeratorService, ModeratorService>();
builder.Services.AddScoped<IDebateEngine, DebateEngine>();
builder.Services.AddScoped<CommentService>();
builder.Services.AddScoped<AdminService>();
builder.Services.AddScoped<AdminActionLogger>();
builder.Services.AddScoped<IChatbotService, ChatbotService>();

// ── Repositories ──
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IDebateRepository, DebateRepository>();
builder.Services.AddScoped<ICommentRepository, CommentRepository>();

// ── SSE Event Bus (singleton — lives for app lifetime) ──
builder.Services.AddSingleton<IDebateEventBus, DebateEventBus>();

// ── In-memory cache (Epic 11.3 — dedup & debounce) ──
builder.Services.AddMemoryCache();

// ── Chat / Input Waiter (singleton — holds TCS per active session) ──
builder.Services.AddSingleton<IUserInputWaiter, UserInputWaiter>();

// ── Application Log Service (scoped — needs AppDbContext) ──
builder.Services.AddScoped<IApplicationLogService, ApplicationLogService>();

builder.Services.AddControllers();
builder.Services.AddOpenApi();

var app = builder.Build();

// Warn loudly if a paid model is configured — every visitor's debate would cost credits.
var configuredModel = app.Configuration["OpenAI:Model"] ?? DeploymentSettings.DefaultFreeModel;
if (!DeploymentSettings.IsFreeModel(configuredModel))
    app.Logger.LogWarning("[Startup] OpenAI:Model '{Model}' is not a free model. Debates will use OpenRouter credits.", configuredModel);

// ── Auto-migrate on startup ──
// Free databases (e.g. Neon) sleep when idle and can refuse the first
// connection, so retry a few times before giving up.
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    const int maxAttempts = 5;
    for (var attempt = 1; ; attempt++)
    {
        try
        {
            db.Database.Migrate();
            break;
        }
        catch (Exception ex) when (attempt < maxAttempts)
        {
            var delay = TimeSpan.FromSeconds(Math.Pow(2, attempt)); // 2, 4, 8, 16s
            logger.LogWarning("[Startup] Database migration attempt {Attempt}/{Max} failed ({Error}). Retrying in {Delay}s.",
                attempt, maxAttempts, ex.GetType().Name, delay.TotalSeconds);
            Thread.Sleep(delay);
        }
    }
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

// ── Cleanup: mark any sessions stuck in "running" state as "failed" ──
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var stuckSessions = db.DebateSessions.Where(s => s.Status == "running").ToList();
    if (stuckSessions.Count > 0)
    {
        foreach (var s in stuckSessions) s.Status = "failed";
        db.SaveChanges();
        var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
        logger.LogWarning("[Startup] Marked {Count} stuck 'running' sessions as 'failed'.", stuckSessions.Count);
    }

    // Promote the user whose email matches Admin:Email (idempotent).
    // Never promote "the first user" — on a public site that could be anyone.
    var adminEmail = app.Configuration["Admin:Email"]?.Trim().ToLower();
    if (!string.IsNullOrEmpty(adminEmail))
    {
        var adminUser = db.Users.IgnoreQueryFilters()
            .FirstOrDefault(u => u.Email == adminEmail && !u.IsDeleted && u.Role != "Admin");
        if (adminUser != null)
        {
            adminUser.Role = "Admin";
            db.SaveChanges();
            var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
            logger.LogInformation("[Startup] Promoted configured admin account to Admin.");
        }
    }
}

app.UseForwardedHeaders();
app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseMiddleware<RequestLoggingMiddleware>();
app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

// Health check for Render / Docker (Render health check path: /health)
app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));

app.MapControllers();

app.Run();
