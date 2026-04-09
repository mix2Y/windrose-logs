namespace WindroseLogs.Core.Models;

public class LogFile
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string FileName { get; set; } = string.Empty;
    public string Source { get; set; } = "web_upload"; // 'web_upload' | 'teams_bot'
    public DateOnly? SessionDate { get; set; }         // Парсится из имени файла
    public Guid UploadedBy { get; set; }
    public string? UploaderName { get; set; }          // Display name (Teams user or email)
    public string? FileHash     { get; set; }          // MD5 of file content for dedup/reparse
    public DateTimeOffset UploadedAt { get; set; } = DateTimeOffset.UtcNow;
    public string Status { get; set; } = "pending";    // pending|processing|done|error
    public string? ErrorMessage { get; set; }
    public int TotalLines { get; set; }
    public int EventsFound { get; set; }

    /// <summary>Sentry event URLs extracted directly from log (LogSentrySdk: ---- SentryUrl ----)</summary>
    public string? SentryUrls { get; set; }  // JSON array: ["https://..."]

    public User? Uploader { get; set; }
    public ICollection<LogEvent> Events { get; set; } = [];
}
