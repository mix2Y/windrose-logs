using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using WindroseLogs.Core.Models;

namespace WindroseLogs.Infrastructure.Parsing;

/// <summary>
/// Парсер логов Unreal Engine / R5 формата.
/// Распознаёт пять типов событий:
///   - R5Check   : многострочный блок assertion failure
///   - MemoryLeak: однострочное предупреждение R5LogSystemResources
///   - FatalError: краш / GPU crash / Fatal error (с XML блоком)
///   - R5Ensure  : блок === Error on === с Type 'R5Ensure'
///   - Error     : Crash Stack Trace без XML (серверный краш)
/// </summary>
public partial class R5LogParser
{
    [GeneratedRegex(@"^\[(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}:\d{3})\]\[\s*(\d+)\]([^:\s]+)(?::\s*(Error|Warning|Display|Verbose))?\s*:\s*(.*)$")]
    private static partial Regex LogLineRegex();

    [GeneratedRegex(@"\[([^\]]+\.(?:cpp|h):\d+)\]$")]
    private static partial Regex SourceFileRegex();

    // Memory leak suspected! Avg growth rate 36.85 > 5.00 Mb/s over last +00:01:10.258 (09:00:46->09:01:56). World Клиент -1 (...)
    [GeneratedRegex(@"Memory leak suspected! Avg growth rate ([\d.]+) > ([\d.]+) Mb/s over last [^ ]+ \([^)]+\)\. World (.+)$")]
    private static partial Regex MemoryLeakRegex();

    [GeneratedRegex(@"Session CrashGUID\s*>\s*(UECC-[A-Za-z0-9_-]+)")]
    private static partial Regex CrashGuidRegex();

    [GeneratedRegex(@"<CrashType>([^<]+)</CrashType>")]
    private static partial Regex CrashTypeRegex();

    [GeneratedRegex(@"<ErrorMessage>([^<]*)</ErrorMessage>")]
    private static partial Regex CrashErrorMessageRegex();

    [GeneratedRegex(@"FPlatformMisc::RequestExit\(\d+,\s*([^)]+)\)")]
    private static partial Regex ExitReasonRegex();

    // R5Ensure block field patterns
    [GeneratedRegex(@"^Type '([^']+)'")]
    private static partial Regex EnsureTypeRegex();
    [GeneratedRegex(@"^Function '([^']+)'")]
    private static partial Regex EnsureFunctionRegex();
    [GeneratedRegex(@"^Condition '([^']+)'")]
    private static partial Regex EnsureConditionRegex();
    [GeneratedRegex(@"^UserMessage '(.+)'")]
    private static partial Regex EnsureUserMessageRegex();
    [GeneratedRegex(@"^File '(.+)'")]
    private static partial Regex EnsureFileRegex();

    private enum ParseState { Normal, R5CheckBlock, Callstack, R5EnsureBlock, CrashStackTrace }

    public List<LogEvent> Parse(Stream stream, Guid fileId)
    {
        var results = new List<LogEvent>();
        var state = ParseState.Normal;

        DateTimeOffset blockTimestamp = default;
        int blockFrame = 0;
        string? condition = null;
        string? message  = null;
        string? where    = null;
        string? sourceFile = null;
        var callstack = new List<string>();

        // FatalError tracking
        string? crashGuid = null;
        string? crashType = null;
        string? crashErrorMessage = null;
        string? crashExitReason = null;
        DateTimeOffset crashTimestamp = default;
        bool crashDetected = false;

        // R5Ensure block tracking
        string? ensureType = null;
        string? ensureFunction = null;
        string? ensureCondition = null;
        string? ensureUserMessage = null;
        string? ensureFile = null;
        DateTimeOffset ensureTimestamp = default;

        // CrashStackTrace (server crash without XML)
        bool inCrashStackTrace = false;
        string? crashStackFirstFrame = null;
        DateTimeOffset crashStackTimestamp = default;

        using var reader = new StreamReader(stream, Encoding.UTF8, leaveOpen: true);
        string? line;

        while ((line = reader.ReadLine()) != null)
        {
            line = line.TrimEnd('\r');

            // ── FatalError detection (runs in all states) ─────────────────
            if (!crashDetected)
            {
                var cgm = CrashGuidRegex().Match(line);
                if (cgm.Success) crashGuid = cgm.Groups[1].Value;

                var ctm = CrashTypeRegex().Match(line);
                if (ctm.Success) crashType = ctm.Groups[1].Value;

                var cem = CrashErrorMessageRegex().Match(line);
                if (cem.Success && !string.IsNullOrEmpty(cem.Groups[1].Value))
                    crashErrorMessage = cem.Groups[1].Value;
            }

            // Detect final fatal exit line
            if (!crashDetected && line.Contains("FPlatformMisc::RequestExit"))
            {
                var exm = ExitReasonRegex().Match(line);
                if (exm.Success)
                {
                    crashExitReason = exm.Groups[1].Value.Trim();
                    var lm = LogLineRegex().Match(line);
                    if (lm.Success) crashTimestamp = ParseTimestamp(lm.Groups[1].Value);
                    crashDetected = true;
                }
            }

            switch (state)
            {
                case ParseState.Normal:
                    // ── R5Check trigger ──────────────────────────────────────
                    if (line.Contains("!!! R5Check happens !!!"))
                    {
                        state = ParseState.R5CheckBlock;
                        condition = null; message = null; where = null;
                        sourceFile = null; callstack = [];
                        break;
                    }

                    // ── MemoryLeak (single line) ─────────────────────────────
                    if (line.Contains("Memory leak suspected!"))
                    {
                        var logMatch = LogLineRegex().Match(line);
                        if (logMatch.Success)
                        {
                            var ts    = ParseTimestamp(logMatch.Groups[1].Value);
                            var frame = int.Parse(logMatch.Groups[2].Value.Trim());
                            var body  = logMatch.Groups[5].Value;
                            var mlMatch = MemoryLeakRegex().Match(body);

                            double growthRate = 0;
                            string world = "";
                            if (mlMatch.Success)
                            {
                                growthRate = double.Parse(mlMatch.Groups[1].Value,
                                    System.Globalization.CultureInfo.InvariantCulture);
                                world = mlMatch.Groups[3].Value.Trim();
                            }

                            var sigHash = ComputeMemoryLeakHash(world);
                            results.Add(new LogEvent
                            {
                                FileId    = fileId,
                                SignatureId = GuidFromHash(sigHash),
                                EventType = "MemoryLeak",
                                Timestamp = ts,
                                FrameNumber = frame,
                                MemoryGrowthRate = growthRate,
                                MemoryWorld = world,
                            });
                        }
                        break;
                    }

                    // ── R5Ensure block trigger ───────────────────────────────
                    if (line.Contains("=== Error on"))
                    {
                        state = ParseState.R5EnsureBlock;
                        ensureType = null; ensureFunction = null;
                        ensureCondition = null; ensureUserMessage = null; ensureFile = null;
                        ensureTimestamp = blockTimestamp != default ? blockTimestamp : DateTimeOffset.UtcNow;
                        break;
                    }

                    // ── Crash Stack Trace (server crash without XML) ─────────
                    if (line.Contains("=== Crash Stack Trace: ==="))
                    {
                        state = ParseState.CrashStackTrace;
                        crashStackFirstFrame = null;
                        crashStackTimestamp = blockTimestamp != default ? blockTimestamp : DateTimeOffset.UtcNow;
                        break;
                    }

                    // Track last timestamp for R5Check block attribution
                    {
                        var m = LogLineRegex().Match(line);
                        if (m.Success)
                        {
                            blockTimestamp = ParseTimestamp(m.Groups[1].Value);
                            blockFrame = int.Parse(m.Groups[2].Value.Trim());
                        }
                    }
                    break;

                case ParseState.R5CheckBlock:
                    if (line.TrimStart().StartsWith("Condition:"))
                        condition = ExtractQuotedOrRaw(line, "Condition:");
                    else if (line.TrimStart().StartsWith("Message:"))
                        message = ExtractQuotedOrRaw(line, "Message:");
                    else if (line.TrimStart().StartsWith("Where:"))
                    {
                        where = ExtractRaw(line, "Where:");
                        sourceFile = ExtractSourceFile(where);
                    }
                    else if (line.Contains("FR5CheckDetails::PrintCallstackToLog"))
                        state = ParseState.Callstack;
                    else if (line.Contains("!!! R5Check happens !!!"))
                    {
                        if (condition != null)
                            results.Add(BuildR5CheckEvent(fileId, blockTimestamp, blockFrame,
                                condition, message, where, sourceFile, callstack));
                        condition = null; message = null; where = null;
                        sourceFile = null; callstack = [];
                    }
                    break;

                case ParseState.Callstack:
                    if (line.Contains("[Callstack]"))
                        callstack.Add(line.Trim());
                    else if (IsNewLogLine(line) && !line.Contains("LogOutputDevice"))
                    {
                        if (condition != null)
                            results.Add(BuildR5CheckEvent(fileId, blockTimestamp, blockFrame,
                                condition, message, where, sourceFile, callstack));
                        state = ParseState.Normal;
                        condition = null; message = null; where = null;
                        sourceFile = null; callstack = [];

                        var m = LogLineRegex().Match(line);
                        if (m.Success)
                        {
                            blockTimestamp = ParseTimestamp(m.Groups[1].Value);
                            blockFrame = int.Parse(m.Groups[2].Value.Trim());
                        }
                    }
                    break;

                case ParseState.R5EnsureBlock:
                    var et = EnsureTypeRegex().Match(line);
                    if (et.Success) { ensureType = et.Groups[1].Value; break; }
                    var ef = EnsureFunctionRegex().Match(line);
                    if (ef.Success) { ensureFunction = ef.Groups[1].Value; break; }
                    var ec = EnsureConditionRegex().Match(line);
                    if (ec.Success) { ensureCondition = ec.Groups[1].Value; break; }
                    var eu = EnsureUserMessageRegex().Match(line);
                    if (eu.Success) { ensureUserMessage = eu.Groups[1].Value; break; }
                    var efi = EnsureFileRegex().Match(line);
                    if (efi.Success) { ensureFile = efi.Groups[1].Value; break; }
                    // End of block: empty line or new log line after fields collected
                    if ((string.IsNullOrWhiteSpace(line) || IsNewLogLine(line)) && ensureType != null)
                    {
                        if (ensureType == "R5Ensure")
                            results.Add(BuildEnsureEvent(fileId, ensureTimestamp,
                                ensureFunction, ensureCondition, ensureUserMessage, ensureFile));
                        state = ParseState.Normal;
                        ensureType = null;
                        if (IsNewLogLine(line))
                        {
                            var m = LogLineRegex().Match(line);
                            if (m.Success) { blockTimestamp = ParseTimestamp(m.Groups[1].Value); blockFrame = int.Parse(m.Groups[2].Value.Trim()); }
                        }
                    }
                    break;

                case ParseState.CrashStackTrace:
                    // Grab first callstack frame as crash info
                    if (crashStackFirstFrame == null && line.Contains("[Callstack]"))
                    {
                        var idx = line.IndexOf("exe!");
                        if (idx > 0) crashStackFirstFrame = line[(idx + 4)..].Split('[')[0].Trim();
                        else crashStackFirstFrame = line.Trim();
                    }
                    // End of crash block
                    if (IsNewLogLine(line) && !line.Contains("LogOutputDevice"))
                    {
                        var ct2 = "CrashStackTrace";
                        var sigId2 = GuidFromHash(HexHash($"Error|{ct2}|{crashStackFirstFrame ?? ""}"));
                        results.Add(new LogEvent
                        {
                            FileId = fileId, SignatureId = sigId2, EventType = "Error",
                            Timestamp = crashStackTimestamp, FrameNumber = 0,
                            CheckCondition = ct2,
                            CheckMessage = crashStackFirstFrame ?? "Crash Stack Trace",
                            CheckWhere = null,
                            CheckSourceFile = crashGuid,
                        });
                        state = ParseState.Normal;
                        var m = LogLineRegex().Match(line);
                        if (m.Success) { blockTimestamp = ParseTimestamp(m.Groups[1].Value); blockFrame = int.Parse(m.Groups[2].Value.Trim()); }
                    }
                    break;
            }
        }

        if (state != ParseState.Normal && condition != null)
            results.Add(BuildR5CheckEvent(fileId, blockTimestamp, blockFrame,
                condition, message, where, sourceFile, callstack));

        // Flush pending R5Ensure
        if (state == ParseState.R5EnsureBlock && ensureType == "R5Ensure")
            results.Add(BuildEnsureEvent(fileId, ensureTimestamp,
                ensureFunction, ensureCondition, ensureUserMessage, ensureFile));

        // Add FatalError event if crash was detected
        if (crashDetected && crashGuid != null)
        {
            var ct = crashType ?? "Crash";
            var sigId = GuidFromHash(HexHash($"FatalError|{ct}|{crashExitReason ?? ""}"));
            results.Add(new LogEvent
            {
                FileId      = fileId,
                SignatureId = sigId,
                EventType   = "FatalError",
                Timestamp   = crashTimestamp != default ? crashTimestamp : DateTimeOffset.UtcNow,
                FrameNumber = 0,
                CheckCondition  = ct,
                CheckMessage    = crashErrorMessage ?? "Fatal error",
                CheckWhere      = crashExitReason,
                CheckSourceFile = crashGuid,
            });
        }

        return results;
    }

    private static LogEvent BuildEnsureEvent(Guid fileId, DateTimeOffset ts,
        string? function, string? condition, string? userMessage, string? file)
    {
        var cond = condition ?? function ?? "R5Ensure";
        var where = function ?? "";
        return new LogEvent
        {
            FileId = fileId,
            SignatureId = GuidFromHash(HexHash($"R5Ensure|{cond}|{TrimWhere(where)}")),
            EventType = "R5Ensure",
            Timestamp = ts,
            FrameNumber = 0,
            CheckCondition = cond,
            CheckMessage = userMessage,
            CheckWhere = function,
            CheckSourceFile = file,
        };
    }

    private static LogEvent BuildR5CheckEvent(Guid fileId, DateTimeOffset ts, int frame,
        string condition, string? message, string? where, string? sourceFile, List<string> callstack)
        => new()
        {
            FileId = fileId, SignatureId = ComputeSignatureId(condition, where ?? ""),
            EventType = "R5Check", Timestamp = ts, FrameNumber = frame,
            CheckCondition = condition, CheckMessage = message,
            CheckWhere = where, CheckSourceFile = sourceFile, Callstack = [.. callstack],
        };

    // ── Signature helpers ───────────────────────────────────────────────────

    public static Guid ComputeSignatureId(string condition, string where)
        => GuidFromHash(ComputeSignatureHash(condition, where));

    public static string ComputeSignatureHash(string condition, string where)
    {
        var input = $"R5Check|{condition.Trim()}|{TrimWhere(where)}";
        return HexHash(input);
    }

    public static string ComputeMemoryLeakHash(string world)
    {
        // Normalize world name: strip map instance suffix after last dot
        var normalized = world.Contains('(') ? world[..world.IndexOf('(')] : world;
        return HexHash($"MemoryLeak|{normalized.Trim()}");
    }

    private static string HexHash(string input)
    {
        var hash = MD5.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static Guid GuidFromHash(string hex)
        => new(Convert.FromHexString(hex));

    private static string TrimWhere(string where)
    {
        var idx = where.LastIndexOf('[');
        return idx > 0 ? where[..idx].Trim() : where.Trim();
    }

    private static string? ExtractSourceFile(string? where)
    {
        if (where is null) return null;
        var m = SourceFileRegex().Match(where);
        return m.Success ? m.Groups[1].Value : null;
    }

    private static string ExtractQuotedOrRaw(string line, string prefix)
    {
        var raw = ExtractRaw(line, prefix);
        return raw.StartsWith('\'') && raw.EndsWith('\'') && raw.Length > 2
            ? raw[1..^1] : raw;
    }

    private static string ExtractRaw(string line, string prefix)
    {
        var idx = line.IndexOf(prefix, StringComparison.OrdinalIgnoreCase);
        return idx >= 0 ? line[(idx + prefix.Length)..].Trim() : line.Trim();
    }

    private static bool IsNewLogLine(string line) => LogLineRegex().IsMatch(line);

    private static DateTimeOffset ParseTimestamp(string ts)
    {
        if (DateTimeOffset.TryParseExact(ts, "yyyy.MM.dd-HH.mm.ss:fff",
            null, System.Globalization.DateTimeStyles.AssumeUniversal, out var r))
            return r;
        return DateTimeOffset.UtcNow;
    }
}
