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
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<UserComment> UserComments => Set<UserComment>();
    public DbSet<AdminLog> AdminLogs => Set<AdminLog>();
    public DbSet<ApplicationLog> ApplicationLogs => Set<ApplicationLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(e =>
        {
            e.HasKey(u => u.Id);
            e.HasIndex(u => u.Email).IsUnique();
            e.Property(u => u.Email).IsRequired().HasMaxLength(256);
            e.Property(u => u.PasswordHash).IsRequired();
            e.Property(u => u.DisplayName).HasMaxLength(100).HasDefaultValue("");
            e.Property(u => u.Role).HasMaxLength(20).HasDefaultValue("User");
            e.Property(u => u.IsActive).HasDefaultValue(true);
            e.Property(u => u.IsEmailVerified).HasDefaultValue(true);
            e.Property(u => u.IsDeleted).HasDefaultValue(false);
            e.HasQueryFilter(u => !u.IsDeleted);
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
            e.Property(d => d.UserInput).HasMaxLength(4000);
            e.HasQueryFilter(d => d.DeletedAt == null);
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

        modelBuilder.Entity<RefreshToken>(e =>
        {
            e.HasKey(r => r.Id);
            e.HasIndex(r => r.Token).IsUnique();
            e.HasOne(r => r.User)
             .WithMany(u => u.RefreshTokens)
             .HasForeignKey(r => r.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<UserComment>(e =>
        {
            e.HasKey(c => c.Id);
            e.HasOne(c => c.Session)
             .WithMany(s => s.UserComments)
             .HasForeignKey(c => c.SessionId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(c => c.User)
             .WithMany(u => u.UserComments)
             .HasForeignKey(c => c.UserId)
             .OnDelete(DeleteBehavior.SetNull)
             .IsRequired(false);
            e.HasOne(c => c.ParentComment)
             .WithMany(c => c.Replies)
             .HasForeignKey(c => c.ParentCommentId)
             .OnDelete(DeleteBehavior.Restrict)
             .IsRequired(false);
            e.HasQueryFilter(c => !c.IsDeleted);
        });

        modelBuilder.Entity<AdminLog>(e =>
        {
            e.HasKey(a => a.Id);
            e.HasOne(a => a.Admin)
             .WithMany(u => u.AdminLogs)
             .HasForeignKey(a => a.AdminId)
             .OnDelete(DeleteBehavior.Cascade);
            e.Property(a => a.Action).IsRequired().HasMaxLength(50);
            e.Property(a => a.TargetType).IsRequired().HasMaxLength(30);
        });

        modelBuilder.Entity<ApplicationLog>(e =>
        {
            e.HasKey(a => a.Id);
            e.Property(a => a.Level).IsRequired().HasMaxLength(20);
            e.Property(a => a.Category).IsRequired().HasMaxLength(30);
            e.Property(a => a.Message).IsRequired();
            e.Property(a => a.Path).HasMaxLength(500);
            e.Property(a => a.UserId).HasMaxLength(100);
            e.HasIndex(a => a.CreatedAt);
            e.HasIndex(a => a.Category);
        });
    }
}
