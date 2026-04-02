using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Configuration;

namespace WindroseLogs.Infrastructure.Services;

public class SentryService
{
    private readonly HttpClient _http;
    private readonly string _orgSlug;
    private readonly string[] _projectIds;   // e.g. ["2","3"] for dev+prod
    private readonly string _baseUrl;
    private readonly bool _enabled;

    public SentryService(IConfiguration config)
    {
        var token    = config["Sentry:Token"] ?? "";
        _orgSlug     = config["Sentry:Org"]   ?? "sentry";
        _baseUrl     = (config["Sentry:Url"]  ?? "https://sentry.windrose.support").TrimEnd('/');
        _enabled     = !string.IsNullOrEmpty(token);

        // Support comma-separated list in priority order: first = highest priority
        // e.g. "2,3" means dev(2) checked before prod(3)
        var raw      = config["Sentry:ProjectIds"] ?? config["Sentry:ProjectId"] ?? "3";
        _projectIds  = raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        _http = new HttpClient { BaseAddress = new Uri(_baseUrl + "/") };
        _http.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", token);
        _http.Timeout = TimeSpan.FromSeconds(15);
    }

    public bool IsEnabled => _enabled;

    // Builds "&project=2&project=3" query fragment
    private string ProjectsQuery =>
        string.Concat(_projectIds.Select(id => $"&project={id}"));

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
        => await FindByText(crashType, sigFirstSeen, sigLastSeen, ct, requireFR5Culprit: false);

    /// <summary>
    /// Ищет Sentry issue по тексту в указанных проектах.
    /// Фильтры:
    ///   1. culprit = FR5CheckDetails::LogToMonitoringTool
    ///   2. Временной overlap с нашей сигнатурой (если переданы даты)
    ///   3. message содержит "Condition:{text}" (защита от ложных совпадений)
    /// Prod-проект (выше ID) предпочитается при прочих равных.
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
                      $"?query={query}&limit=20{ProjectsQuery}";

            var resp = await _http.GetAsync(url, ct);
            if (!resp.IsSuccessStatusCode) return null;

            var body = await resp.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Array || root.GetArrayLength() == 0)
                return null;

            // Two-pass: prefer higher project ID (prod) over lower (dev)
            // so collect all candidates first, then pick best
            var candidates = new List<(JsonElement issue, int projectId, string issueId)>();

            foreach (var issue in root.EnumerateArray())
            {
                var culprit = issue.TryGetProperty("culprit", out var c) ? c.GetString() ?? "" : "";
                if (requireFR5Culprit && !culprit.Contains("FR5CheckDetails")) continue;

                var issueId = issue.TryGetProperty("id", out var idProp) ? idProp.GetString() ?? "" : "";
                if (string.IsNullOrEmpty(issueId)) continue;

                if (sigFirstSeen.HasValue && !CheckTimeOverlap(issue, sigFirstSeen.Value, sigLastSeen))
                    continue;

                // Extract project ID from issue for sorting
                var projId = issue.TryGetProperty("project", out var proj)
                    ? (int.TryParse(proj.TryGetProperty("id", out var pid) ? pid.GetString() : "", out var n) ? n : 0)
                    : 0;

                candidates.Add((issue, projId, issueId));
            }

            if (candidates.Count == 0) return null;

            // Sort candidates by priority: order in _projectIds config (first = highest priority)
            // Config "2,3" → dev(2) before prod(3)
            var projectPriority = _projectIds
                .Select((id, idx) => (id, idx))
                .ToDictionary(x => x.id, x => x.idx);

            candidates.Sort((a, b) =>
            {
                var pa = projectPriority.TryGetValue(a.projectId.ToString(), out var ia) ? ia : 999;
                var pb = projectPriority.TryGetValue(b.projectId.ToString(), out var ib) ? ib : 999;
                return pa.CompareTo(pb);
            });

            foreach (var (issue, _, issueId) in candidates)
            {
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

    private static bool CheckTimeOverlap(
        JsonElement issue, DateTimeOffset sigFirstSeen, DateTimeOffset? sigLastSeen)
    {
        const int toleranceDays = 90;
        DateTimeOffset sentryFirst = default, sentryLast = default;

        if (issue.TryGetProperty("firstSeen", out var fs) && fs.ValueKind == JsonValueKind.String)
            DateTimeOffset.TryParse(fs.GetString(), out sentryFirst);
        if (issue.TryGetProperty("lastSeen", out var ls) && ls.ValueKind == JsonValueKind.String)
            DateTimeOffset.TryParse(ls.GetString(), out sentryLast);

        if (sentryFirst == default || sentryLast == default) return true;

        var ourStart = sigFirstSeen.AddDays(-toleranceDays);
        var ourEnd   = (sigLastSeen ?? sigFirstSeen).AddDays(toleranceDays);
        return sentryLast >= ourStart && sentryFirst <= ourEnd;
    }

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
            if (root.ValueKind != JsonValueKind.Array || root.GetArrayLength() == 0) return false;

            var message = root[0].TryGetProperty("message", out var m) ? m.GetString() ?? "" : "";
            return message.Contains($"Condition:{conditionText}\n", StringComparison.OrdinalIgnoreCase)
                || message.Contains($"Condition:{conditionText}\r", StringComparison.OrdinalIgnoreCase);
        }
        catch { return false; }
    }
}
