using Microsoft.EntityFrameworkCore;
using WindroseLogs.Core.Models;

namespace WindroseLogs.Infrastructure.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<LogFile> LogFiles => Set<LogFile>();
    public DbSet<LogEvent> LogEvents => Set<LogEvent>();
    public DbSet<EventSignature> EventSignatures => Set<EventSignature>();
    public DbSet<User> Users => Set<User>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<LogFile>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.FileName).HasMaxLength(500);
            e.Property(x => x.Source).HasMaxLength(50);
            e.Property(x => x.Status).HasMaxLength(20);
            e.HasOne(x => x.Uploader).WithMany(u => u.UploadedFiles)
             .HasForeignKey(x => x.UploadedBy).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => x.Status);
            e.HasIndex(x => x.UploadedAt);
        });

        modelBuilder.Entity<EventSignature>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.SignatureHash).HasMaxLength(32);
            e.Property(x => x.EventType).HasMaxLength(50);
            e.HasIndex(x => x.SignatureHash).IsUnique();
            e.HasIndex(x => new { x.EventType, x.TotalCount });
        });

        modelBuilder.Entity<LogEvent>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.EventType).HasMaxLength(50);
            e.Property(x => x.Callstack)
             .HasColumnType("text[]");
            e.Property(x => x.Extra)
             .HasColumnType("jsonb");
            e.HasOne(x => x.File).WithMany(f => f.Events)
             .HasForeignKey(x => x.FileId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Signature).WithMany(s => s.Events)
             .HasForeignKey(x => x.SignatureId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.FileId, x.EventType });
            e.HasIndex(x => x.SignatureId);
            e.HasIndex(x => x.Timestamp);
        });

        modelBuilder.Entity<User>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Email).HasMaxLength(200);
            e.Property(x => x.DisplayName).HasMaxLength(200);
            e.Property(x => x.Role).HasMaxLength(20);
            e.HasIndex(x => x.Email).IsUnique();
        });
    }
}
