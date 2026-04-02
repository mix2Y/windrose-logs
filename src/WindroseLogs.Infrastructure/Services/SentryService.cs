using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Configuration;

namespace WindroseLogs.Infrastructure.Services;

public class SentryService
{
    private readonly HttpClient _http;
    private readonly string _orgSlug;
    private readonly string _projectId;
    private readonly string _baseUrl;
    private readonly bool _enabled;

    public SentryService(IConfiguration config)
    {
        var token   = config["Sentry:Token"] ?? "";
        _orgSlug    = config["Sentry:Org"]   ?? "sentry";
        _projectId  = config["Sentry:ProjectId"] ?? "3";
        _baseUrl    = (config["Sentry:Url"]  ?? "https://sentry.windrose.support").TrimEnd('/');
        _enabled    = !string.IsNullOrEmpty(token);

        _http = new HttpClient { BaseAddress = new Uri(_baseUrl + "/") };
        _http.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", token);
        _http.Timeout = TimeSpan.FromSeconds(15);
    }

    public bool IsEnabled => _enabled;

    public async Task<(string issueId, string permalink)?> FindByCondition(
        string condition,
        DateTimeOffset? sigFirstSeen = null,
        DateTimeOffset? sigLastSeen  = null,
        CancellationToken ct = default)
        => await FindByText(condition, sigFirstSeen, sigLastSeen, ct);

    public async Task<(string issueId, string permalink)?> FindByCrashType(
        string crashType,
        DateTimeOffset? sigFirstSeen = null,
        DateTimeOffset? sigLastSeen  = null,
        CancellationToken ct = default)
        // FatalError events in Sentry have empty culprit and no Condition: in message
        // so we only apply time overlap check
        => await FindByText(crashType, sigFirstSeen, sigLastSeen, ct, requireFR5Culprit: false);

    /// <summary>
    /// Ищет Sentry issue по тексту.
    /// Фильтры (все должны пройти):
    ///   1. culprit = FR5CheckDetails::LogToMonitoringTool
    ///   2. message содержит "Condition:{text}" — защита от коротких/общих условий
    ///   3. [опционально] временной overlap — Sentry issue был активен в период наших логов
    /// </summary>
    public async Task<(string issueId, string permalink)?> FindByText(
        string text,
        DateTimeOffset? sigFirstSeen = null,
        DateTimeOffset? sigLastSeen  = null,
        CancellationToken ct = default,
        bool requireFR5Culprit = true)
    {
        if (!_enabled || string.IsNullOrWhiteSpace(text)) return null;
        try
        {
            var query = Uri.EscapeDataString(text);
            var url = $"api/0/organizations/{_orgSlug}/issues/" +
                      $"?project={_projectId}&query={query}&limit=20";

            var resp = await _http.GetAsync(url, ct);
            if (!resp.IsSuccessStatusCode) return null;

            var body = await resp.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Array || root.GetArrayLength() == 0)
                return null;

            foreach (var issue in root.EnumerateArray())
            {
                // Filter 1: must be from game client (skip for FatalError crash events)
                var culprit = issue.TryGetProperty("culprit", out var c) ? c.GetString() ?? "" : "";
                if (requireFR5Culprit && !culprit.Contains("FR5CheckDetails")) continue;

                var issueId = issue.GetProperty("id").GetString() ?? "";
                if (string.IsNullOrEmpty(issueId)) continue;

                // Filter 2: time overlap (if signature times are provided)
                if (sigFirstSeen.HasValue && !CheckTimeOverlap(issue, sigFirstSeen.Value, sigLastSeen))
                    continue;

                // Filter 3: verify Condition in message (only for R5Check/R5Ensure)
                if (requireFR5Culprit && !await VerifyConditionInEvent(issueId, text, ct)) continue;

                var permalink = issue.TryGetProperty("permalink", out var p) && p.ValueKind == JsonValueKind.String
                    ? p.GetString()!
                    : $"{_baseUrl}/organizations/{_orgSlug}/issues/{issueId}/";

                return (issueId, permalink);
            }

            return null;
        }
        catch { return null; }
    }

    /// <summary>
    /// Проверяет временной overlap между Sentry issue и нашей сигнатурой.
    /// Условие: Sentry issue должен быть активен в промежутке
    ///   [sigFirstSeen - 90 дней .. sigLastSeen + 90 дней]
    /// Широкий допуск нужен т.к. наши логи могут быть срезом более долгой проблемы.
    /// </summary>
    private static bool CheckTimeOverlap(
        JsonElement issue,
        DateTimeOffset sigFirstSeen,
        DateTimeOffset? sigLastSeen)
    {
        const int toleranceDays = 90;

        // Parse Sentry timestamps
        DateTimeOffset sentryFirst = default;
        DateTimeOffset sentryLast  = default;

        if (issue.TryGetProperty("firstSeen", out var fs) && fs.ValueKind == JsonValueKind.String)
            DateTimeOffset.TryParse(fs.GetString(), out sentryFirst);

        if (issue.TryGetProperty("lastSeen", out var ls) && ls.ValueKind == JsonValueKind.String)
            DateTimeOffset.TryParse(ls.GetString(), out sentryLast);

        if (sentryFirst == default || sentryLast == default) return true; // no data → skip check

        var ourStart = sigFirstSeen.AddDays(-toleranceDays);
        var ourEnd   = (sigLastSeen ?? sigFirstSeen).AddDays(toleranceDays);

        // Overlap: sentryLast >= ourStart AND sentryFirst <= ourEnd
        return sentryLast >= ourStart && sentryFirst <= ourEnd;
    }

    /// <summary>
    /// Проверяет что первое событие issue содержит "Condition:{conditionText}" в message.
    /// </summary>
    private async Task<bool> VerifyConditionInEvent(
        string issueId, string conditionText, CancellationToken ct)
    {
        try
        {
            var resp = await _http.GetAsync($"api/0/issues/{issueId}/events/?limit=1", ct);
            if (!resp.IsSuccessStatusCode) return false;

            var body = await resp.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Array || root.GetArrayLength() == 0)
                return false;

            var message = root[0].TryGetProperty("message", out var m) ? m.GetString() ?? "" : "";
            // Message: "LogCategory:R5LogCheck\nCondition:{text}\nUserMessage:..."
            return message.Contains($"Condition:{conditionText}\n", StringComparison.OrdinalIgnoreCase)
                || message.Contains($"Condition:{conditionText}\r", StringComparison.OrdinalIgnoreCase);
        }
        catch { return false; }
    }
}
