using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using WindroseLogs.Core.Models;

namespace WindroseLogs.Infrastructure.Parsing;

/// <summary>
/// Парсер логов Unreal Engine / R5 формата.
/// Распознаёт два типа событий:
///   - R5Check  : многострочный блок assertion failure
///   - MemoryLeak: однострочное предупреждение R5LogSystemResources
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

    private enum ParseState { Normal, R5CheckBlock, Callstack }

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

        using var reader = new StreamReader(stream, Encoding.UTF8, leaveOpen: true);
        string? line;

        while ((line = reader.ReadLine()) != null)
        {
            line = line.TrimEnd('\r');

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
            }
        }

        if (state != ParseState.Normal && condition != null)
            results.Add(BuildR5CheckEvent(fileId, blockTimestamp, blockFrame,
                condition, message, where, sourceFile, callstack));

        return results;
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
