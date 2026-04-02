using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WindroseLogs.Core.Interfaces;
using WindroseLogs.Core.Models;
using WindroseLogs.Infrastructure.Data;
using WindroseLogs.Infrastructure.Parsing;
using WindroseLogs.Infrastructure.Services;

namespace WindroseLogs.Infrastructure.Jobs;

public class LogParsingJob(
    AppDbContext db,
    R5LogParser parser,
    SentryService sentry,
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

            // ── 1. Remove old events for this file (idempotent) ───────────────
            await db.LogEvents.Where(e => e.FileId == fileId).ExecuteDeleteAsync(ct);

            // ── 2. Collect all unique signature hashes from this file ─────────
            var sigGroups = BuildSignatureGroups(events);
            var allHashes = sigGroups.Keys.ToList();

            // ── 3. Load existing signatures in ONE query ──────────────────────
            var existing = await db.EventSignatures
                .Where(s => allHashes.Contains(s.SignatureHash))
                .ToDictionaryAsync(s => s.SignatureHash, ct);

            // ── 4. Create missing signatures in ONE batch ─────────────────────
            var toCreate = new List<EventSignature>();
            foreach (var (hash, info) in sigGroups)
            {
                if (!existing.ContainsKey(hash))
                {
                    var sig = new EventSignature
                    {
                        Id            = Guid.NewGuid(),
                        EventType     = info.EventType,
                        SignatureHash = hash,
                        ConditionText = info.ConditionText,
                        WhereText     = info.WhereText,
                        SourceFile    = info.SourceFile,
                        FirstSeen     = info.Events.Min(e => e.Timestamp),
                        LastSeen      = info.Events.Max(e => e.Timestamp),
                        TotalCount    = 0,
                        FileCount     = 0,
                    };
                    toCreate.Add(sig);
                    existing[hash] = sig;
                }
            }

            if (toCreate.Count > 0)
            {
                db.EventSignatures.AddRange(toCreate);
                await db.SaveChangesAsync(ct);
            }

            // ── 5. Assign SignatureId to events ───────────────────────────────
            foreach (var (hash, info) in sigGroups)
            {
                var sigId = existing[hash].Id;
                foreach (var ev in info.Events)
                    ev.SignatureId = sigId;
            }

            // ── 6. Bulk insert all events + update file status ────────────────
            db.LogEvents.AddRange(events);
            file.Status      = "done";
            file.EventsFound = events.Count;
            await db.SaveChangesAsync(ct);

            // ── 7. Recalculate stats for affected signatures (single query) ───
            var affectedIds = existing.Values.Select(s => s.Id).ToList();
            await RecalculateSignatureStatsBatch(affectedIds, ct);

            // ── 8. Enrich NEW signatures with Sentry links ────────────────────
            if (sentry.IsEnabled && toCreate.Count > 0)
            {
                foreach (var sig in toCreate)
                {
                    string? searchText = sig.EventType switch
                    {
                        "R5Check"   => sig.ConditionText,
                        "R5Ensure"  => sig.ConditionText,
                        "FatalError"=> sig.ConditionText, // crash type e.g. "GPUCrash"
                        _           => null
                    };
                    if (string.IsNullOrEmpty(searchText)) continue;
                    var result = await sentry.FindByText(searchText, sig.FirstSeen, sig.LastSeen, ct);
                    if (result is null) continue;
                    sig.SentryIssueId   = result.Value.issueId;
                    sig.SentryPermalink = result.Value.permalink;
                    logger.LogInformation("Sentry match [{Type}] {Text} → #{Id}",
                        sig.EventType, searchText, result.Value.issueId);
                }
                await db.SaveChangesAsync(ct);
            }

            logger.LogInformation("File {FileId} done — {Count} events, {Sigs} signatures",
                fileId, events.Count, affectedIds.Count);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error processing file {FileId}", fileId);
            file.Status       = "error";
            file.ErrorMessage = ex.Message;
            await db.SaveChangesAsync(ct);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private record SigGroup(
        string EventType, string? ConditionText, string? WhereText,
        string? SourceFile, List<LogEvent> Events);

    private static Dictionary<string, SigGroup> BuildSignatureGroups(List<LogEvent> events)
    {
        var dict = new Dictionary<string, SigGroup>();

        foreach (var g in events
            .Where(e => e.EventType == "R5Check" && e.CheckCondition != null)
            .GroupBy(e => new { e.CheckCondition, e.CheckWhere }))
        {
            var hash = R5LogParser.ComputeSignatureHash(g.Key.CheckCondition!, g.Key.CheckWhere ?? "");
            if (!dict.ContainsKey(hash))
                dict[hash] = new SigGroup("R5Check", g.Key.CheckCondition,
                    g.Key.CheckWhere, g.First().CheckSourceFile, []);
            dict[hash].Events.AddRange(g);
        }

        foreach (var g in events
            .Where(e => e.EventType == "MemoryLeak")
            .GroupBy(e => e.MemoryWorld ?? ""))
        {
            var hash = R5LogParser.ComputeMemoryLeakHash(g.Key);
            if (!dict.ContainsKey(hash))
                dict[hash] = new SigGroup("MemoryLeak",
                    $"Memory leak in world: {g.Key}", null, null, []);
            dict[hash].Events.AddRange(g);
        }

        foreach (var g in events
            .Where(e => e.EventType == "FatalError")
            .GroupBy(e => new { CrashType = e.CheckCondition ?? "Crash", ExitReason = e.CheckWhere ?? "" }))
        {
            var hash = R5LogParser.ComputeSignatureHash(g.Key.CrashType, g.Key.ExitReason);
            if (!dict.ContainsKey(hash))
                dict[hash] = new SigGroup("FatalError", g.Key.CrashType,
                    g.Key.ExitReason, null, []);
            dict[hash].Events.AddRange(g);
        }

        foreach (var g in events
            .Where(e => e.EventType == "R5Ensure")
            .GroupBy(e => new { Cond = e.CheckCondition ?? "", Where = e.CheckWhere ?? "" }))
        {
            var hash = R5LogParser.ComputeSignatureHash(g.Key.Cond, g.Key.Where);
            if (!dict.ContainsKey(hash))
                dict[hash] = new SigGroup("R5Ensure", g.Key.Cond, g.Key.Where,
                    g.First().CheckSourceFile, []);
            dict[hash].Events.AddRange(g);
        }

        foreach (var g in events
            .Where(e => e.EventType == "Error")
            .GroupBy(e => new { Cond = e.CheckCondition ?? "", Msg = TrimMsg(e.CheckMessage ?? "") }))
        {
            var hash = R5LogParser.ComputeSignatureHash(g.Key.Cond, g.Key.Msg);
            if (!dict.ContainsKey(hash))
                dict[hash] = new SigGroup("Error", g.Key.Cond, g.Key.Msg, null, []);
            dict[hash].Events.AddRange(g);
        }

        return dict;
    }

    /// <summary>
    /// Single SQL UPDATE per signature using raw aggregation.
    /// Replaces the old N+1 loop — one round-trip to DB total.
    /// </summary>
    private async Task RecalculateSignatureStatsBatch(List<Guid> sigIds, CancellationToken ct)
    {
        if (sigIds.Count == 0) return;

        // Aggregate all stats in one query
        var stats = await db.LogEvents
            .Where(e => sigIds.Contains(e.SignatureId))
            .GroupBy(e => e.SignatureId)
            .Select(g => new
            {
                SigId      = g.Key,
                Total      = g.Count(),
                Files      = g.Select(e => e.FileId).Distinct().Count(),
                FirstSeen  = g.Min(e => e.Timestamp),
                LastSeen   = g.Max(e => e.Timestamp),
            })
            .ToListAsync(ct);

        // Load all affected signatures in one query
        var sigs = await db.EventSignatures
            .Where(s => sigIds.Contains(s.Id))
            .ToListAsync(ct);

        var statsMap = stats.ToDictionary(s => s.SigId);
        foreach (var sig in sigs)
        {
            if (!statsMap.TryGetValue(sig.Id, out var s)) continue;
            sig.TotalCount = s.Total;
            sig.FileCount  = s.Files;
            sig.FirstSeen  = s.FirstSeen;
            sig.LastSeen   = s.LastSeen;
        }

        await db.SaveChangesAsync(ct);
    }

    public static string GetStoragePath(Guid fileId, string fileName)
    {
        var dir = Path.Combine("storage", "logs");
        Directory.CreateDirectory(dir);
        return Path.Combine(dir, $"{fileId}_{fileName}");
    }

    private static string TrimMsg(string msg)
    {
        var trimmed = msg.Length > 80 ? msg[..80] : msg;
        return System.Text.RegularExpressions.Regex.Replace(trimmed,
            @"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "").Trim();
    }
}
