using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WindroseLogs.Core.Interfaces;
using WindroseLogs.Core.Models;
using WindroseLogs.Infrastructure.Data;
using WindroseLogs.Infrastructure.Parsing;

namespace WindroseLogs.Infrastructure.Jobs;

public class LogParsingJob(
    AppDbContext db,
    R5LogParser parser,
    ILogger<LogParsingJob> logger) : ILogParsingJob
{
    public async Task ProcessFileAsync(Guid fileId, CancellationToken ct = default)
    {
        var file = await db.LogFiles.FindAsync([fileId], ct);
        if (file is null) { logger.LogWarning("LogFile {Id} not found", fileId); return; }

        file.Status = "processing";
        await db.SaveChangesAsync(ct);

        try
        {
            var path = GetStoragePath(fileId, file.FileName);
            await using var stream = File.OpenRead(path);
            var events = parser.Parse(stream, fileId);
            logger.LogInformation("Parsed {Count} events from {FileId}", events.Count, fileId);

            // Remove old events for this file (idempotent re-parse)
            var oldEvents = db.LogEvents.Where(e => e.FileId == fileId);
            db.LogEvents.RemoveRange(oldEvents);
            await db.SaveChangesAsync(ct);

            // Ensure signatures exist (create if missing, don't update counts yet)
            var r5Groups = events
                .Where(e => e.EventType == "R5Check" && e.CheckCondition != null)
                .GroupBy(e => new { e.CheckCondition, e.CheckWhere });
            foreach (var g in r5Groups)
                await EnsureSignature(db, "R5Check",
                    R5LogParser.ComputeSignatureHash(g.Key.CheckCondition!, g.Key.CheckWhere ?? ""),
                    g.Key.CheckCondition, g.Key.CheckWhere, g.First().CheckSourceFile,
                    g.ToList(), ct);

            var mlGroups = events
                .Where(e => e.EventType == "MemoryLeak")
                .GroupBy(e => e.MemoryWorld ?? "");
            foreach (var g in mlGroups)
                await EnsureSignature(db, "MemoryLeak",
                    R5LogParser.ComputeMemoryLeakHash(g.Key),
                    $"Memory leak in world: {g.Key}", null, null,
                    g.ToList(), ct);

            // Save all events
            db.LogEvents.AddRange(events);
            file.Status      = "done";
            file.EventsFound = events.Count;
            await db.SaveChangesAsync(ct);

            // Recalculate signature stats from actual LogEvents (idempotent, always correct)
            var affectedSigIds = events.Select(e => e.SignatureId).Distinct().ToList();
            await RecalculateSignatureStats(db, affectedSigIds, ct);

            logger.LogInformation("File {FileId} processed OK — {Count} events", fileId, events.Count);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error processing file {FileId}", fileId);
            file.Status       = "error";
            file.ErrorMessage = ex.Message;
            await db.SaveChangesAsync(ct);
        }
    }

    /// <summary>
    /// Creates signature if it doesn't exist yet.
    /// Does NOT touch TotalCount/FileCount — those are recalculated from LogEvents.
    /// </summary>
    private static async Task EnsureSignature(
        AppDbContext db, string eventType, string hash,
        string? conditionText, string? whereText, string? sourceFile,
        List<LogEvent> events, CancellationToken ct)
    {
        var sig = await db.EventSignatures.FirstOrDefaultAsync(s => s.SignatureHash == hash, ct);
        if (sig is null)
        {
            sig = new EventSignature
            {
                Id            = Guid.NewGuid(),
                EventType     = eventType,
                SignatureHash = hash,
                ConditionText = conditionText,
                WhereText     = whereText,
                SourceFile    = sourceFile,
                FirstSeen     = events.Min(e => e.Timestamp),
                LastSeen      = events.Max(e => e.Timestamp),
                TotalCount    = 0,
                FileCount     = 0,
            };
            db.EventSignatures.Add(sig);
            await db.SaveChangesAsync(ct);
        }
        foreach (var ev in events) ev.SignatureId = sig.Id;
    }

    /// <summary>
    /// Recalculates TotalCount, FileCount, FirstSeen, LastSeen
    /// directly from LogEvents — always correct, never double-counts.
    /// </summary>
    private static async Task RecalculateSignatureStats(
        AppDbContext db, List<Guid> sigIds, CancellationToken ct)
    {
        foreach (var sigId in sigIds)
        {
            var sig = await db.EventSignatures.FindAsync([sigId], ct);
            if (sig is null) continue;

            var stats = await db.LogEvents
                .Where(e => e.SignatureId == sigId)
                .GroupBy(_ => 1)
                .Select(g => new
                {
                    TotalCount = g.Count(),
                    FileCount  = g.Select(e => e.FileId).Distinct().Count(),
                    FirstSeen  = g.Min(e => e.Timestamp),
                    LastSeen   = g.Max(e => e.Timestamp),
                })
                .FirstOrDefaultAsync(ct);

            if (stats is not null)
            {
                sig.TotalCount = stats.TotalCount;
                sig.FileCount  = stats.FileCount;
                sig.FirstSeen  = stats.FirstSeen;
                sig.LastSeen   = stats.LastSeen;
            }
        }
        await db.SaveChangesAsync(ct);
    }

    public static string GetStoragePath(Guid fileId, string fileName)
    {
        var dir = Path.Combine("storage", "logs");
        Directory.CreateDirectory(dir);
        return Path.Combine(dir, $"{fileId}_{fileName}");
    }
}
