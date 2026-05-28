using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using MultiMind.API.Data;
using MultiMind.API.Middleware;
using MultiMind.API.Repositories;
using MultiMind.API.Services;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// ── Database ──
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

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

        // Allow Railway / production frontend URL if configured
        var frontendUrl = builder.Configuration["Frontend:Url"];
        if (!string.IsNullOrEmpty(frontendUrl))
            allowedOrigins.Add(frontendUrl);

        policy.WithOrigins(allowedOrigins.ToArray())
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
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

// ── Auto-migrate on startup ──
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
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

    // Promote earliest registered user to Admin (idempotent)
    var admins = db.Users.IgnoreQueryFilters().Where(u => u.Role == "Admin" && !u.IsDeleted).ToList();
    if (admins.Count == 0)
    {
        var first = db.Users.IgnoreQueryFilters().Where(u => !u.IsDeleted)
            .OrderBy(u => u.CreatedAt).FirstOrDefault();
        if (first != null)
        {
            first.Role = "Admin";
            db.SaveChanges();
            var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
            logger.LogInformation("[Startup] Promoted {Email} to Admin.", first.Email);
        }
    }
}

app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseMiddleware<RequestLoggingMiddleware>();
app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();

// Health check for Railway / Docker
app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));

app.MapControllers();

app.Run();
