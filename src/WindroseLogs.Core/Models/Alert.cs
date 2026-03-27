namespace WindroseLogs.Core.Models;

public class Alert
{
    public Guid   Id          { get; set; } = Guid.NewGuid();
    public Guid   SignatureId { get; set; }
    public Guid   FileId      { get; set; }
    public string EventType   { get; set; } = "";       // "R5Check" | "MemoryLeak"
    public string Summary     { get; set; } = "";       // short human-readable text
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool   IsRead      { get; set; } = false;

    public EventSignature? Signature { get; set; }
    public LogFile?        File      { get; set; }
}
