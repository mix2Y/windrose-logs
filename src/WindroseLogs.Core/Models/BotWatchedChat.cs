namespace WindroseLogs.Core.Models;

public class BotWatchedChat
{
    public string ChatId { get; set; } = string.Empty;      // PK
    public string ServiceUrl { get; set; } = string.Empty;
    public string TenantId { get; set; } = string.Empty;
    public string BotId { get; set; } = string.Empty;
    public bool IsChannel { get; set; }
    public DateTimeOffset RegisteredAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset LastCheck { get; set; } = DateTimeOffset.UtcNow;
}
