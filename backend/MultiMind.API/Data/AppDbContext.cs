using Microsoft.EntityFrameworkCore;
using MultiMind.API.Models;

namespace MultiMind.API.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<DebateSession> DebateSessions => Set<DebateSession>();
    public DbSet<DebateRound> DebateRounds => Set<DebateRound>();
    public DbSet<AgentResponse> AgentResponses => Set<AgentResponse>();
    public DbSet<ModeratorSynthesis> ModeratorSyntheses => Set<ModeratorSynthesis>();
    public DbSet<AiCallLog> AiCallLogs => Set<AiCallLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(e =>
        {
            e.HasKey(u => u.Id);
            e.HasIndex(u => u.Email).IsUnique();
            e.Property(u => u.Email).IsRequired().HasMaxLength(256);
            e.Property(u => u.PasswordHash).IsRequired();
            e.Property(u => u.DisplayName).HasMaxLength(100).HasDefaultValue("");
        });

        modelBuilder.Entity<DebateSession>(e =>
        {
            e.HasKey(d => d.Id);
            e.HasOne(d => d.User)
             .WithMany(u => u.DebateSessions)
             .HasForeignKey(d => d.UserId)
             .OnDelete(DeleteBehavior.Cascade);
            e.Property(d => d.OriginalPrompt).IsRequired().HasMaxLength(4000);
            e.Property(d => d.Status).HasMaxLength(20).HasDefaultValue("pending");
        });

        modelBuilder.Entity<DebateRound>(e =>
        {
            e.HasKey(r => r.Id);
            e.HasOne(r => r.Session)
             .WithMany(s => s.Rounds)
             .HasForeignKey(r => r.SessionId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AgentResponse>(e =>
        {
            e.HasKey(a => a.Id);
            e.HasOne(a => a.Round)
             .WithMany(r => r.AgentResponses)
             .HasForeignKey(a => a.RoundId)
             .OnDelete(DeleteBehavior.Cascade);
            e.Property(a => a.AgentType).IsRequired().HasMaxLength(50);
        });

        modelBuilder.Entity<ModeratorSynthesis>(e =>
        {
            e.HasKey(m => m.Id);
            e.HasOne(m => m.Session)
             .WithOne(s => s.Synthesis)
             .HasForeignKey<ModeratorSynthesis>(m => m.SessionId)
             .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
