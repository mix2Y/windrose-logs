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
        _projectId  = config["Sentry:ProjectId"] ?? "3";   // numeric ID
        _baseUrl    = (config["Sentry:Url"]  ?? "https://sentry.windrose.support").TrimEnd('/');
        _enabled    = !string.IsNullOrEmpty(token);

        _http = new HttpClient { BaseAddress = new Uri(_baseUrl + "/") };
        _http.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", token);
        _http.Timeout = TimeSpan.FromSeconds(10);
    }

    public bool IsEnabled => _enabled;

    /// <summary>
    /// Ищет Sentry issue по тексту Condition из R5Check / R5Ensure.
    /// </summary>
    public async Task<(string issueId, string permalink)?> FindByCondition(
        string condition, CancellationToken ct = default)
        => await FindByText(condition, ct);

    /// <summary>
    /// Ищет Sentry issue по типу краша (например, "GPUCrash").
    /// </summary>
    public async Task<(string issueId, string permalink)?> FindByCrashType(
        string crashType, CancellationToken ct = default)
        => await FindByText(crashType, ct);

    /// <summary>Полнотекстовый поиск issue в Sentry.</summary>
    public async Task<(string issueId, string permalink)?> FindByText(
        string text, CancellationToken ct = default)
    {
        if (!_enabled || string.IsNullOrWhiteSpace(text)) return null;
        try
        {
            var query = Uri.EscapeDataString(text);
            var url = $"api/0/organizations/{_orgSlug}/issues/" +
                      $"?project={_projectId}&query={query}&limit=1";

            var resp = await _http.GetAsync(url, ct);
            if (!resp.IsSuccessStatusCode) return null;

            var body = await resp.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Array || root.GetArrayLength() == 0)
                return null;

            var issue = root[0];
            var id = issue.GetProperty("id").GetString() ?? "";
            if (string.IsNullOrEmpty(id)) return null;

            var permalink = issue.TryGetProperty("permalink", out var p) && p.ValueKind == JsonValueKind.String
                ? p.GetString()!
                : $"{_baseUrl}/organizations/{_orgSlug}/issues/{id}/";

            return (id, permalink);
        }
        catch { return null; }
    }
}
