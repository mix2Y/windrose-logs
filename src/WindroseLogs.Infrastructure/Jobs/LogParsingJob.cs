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

            // Group by (eventType, key fields) → upsert signatures
            var r5Groups = events
                .Where(e => e.EventType == "R5Check" && e.CheckCondition != null)
                .GroupBy(e => new { e.CheckCondition, e.CheckWhere });

            foreach (var g in r5Groups)
                await UpsertSignature(db,
                    eventType:     "R5Check",
                    hash:          R5LogParser.ComputeSignatureHash(g.Key.CheckCondition!, g.Key.CheckWhere ?? ""),
                    conditionText: g.Key.CheckCondition,
                    whereText:     g.Key.CheckWhere,
                    sourceFile:    g.First().CheckSourceFile,
                    events:        [.. g],
                    ct: ct);

            var mlGroups = events
                .Where(e => e.EventType == "MemoryLeak")
                .GroupBy(e => e.MemoryWorld ?? "");

            foreach (var g in mlGroups)
                await UpsertSignature(db,
                    eventType:     "MemoryLeak",
                    hash:          R5LogParser.ComputeMemoryLeakHash(g.Key),
                    conditionText: $"Memory leak in world: {g.Key}",
                    whereText:     null,
                    sourceFile:    null,
                    events:        [.. g],
                    ct: ct);

            db.LogEvents.AddRange(events);
            file.Status      = "done";
            file.EventsFound = events.Count;
            await db.SaveChangesAsync(ct);
            logger.LogInformation("File {FileId} processed OK", fileId);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error processing file {FileId}", fileId);
            file.Status       = "error";
            file.ErrorMessage = ex.Message;
            await db.SaveChangesAsync(ct);
        }
    }

    private static async Task UpsertSignature(
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
                TotalCount    = events.Count,
                FileCount     = 1
            };
            db.EventSignatures.Add(sig);
        }
        else
        {
            sig.TotalCount += events.Count;
            sig.FileCount  += 1;
            sig.LastSeen    = events.Max(e => e.Timestamp);
        }

        await db.SaveChangesAsync(ct);
        foreach (var ev in events) ev.SignatureId = sig.Id;
    }

    public static string GetStoragePath(Guid fileId, string fileName)
    {
        var dir = Path.Combine("storage", "logs");
        Directory.CreateDirectory(dir);
        return Path.Combine(dir, $"{fileId}_{fileName}");
    }
}
