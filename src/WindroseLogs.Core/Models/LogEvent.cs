namespace WindroseLogs.Core.Models;

public class LogEvent
{
    public long Id { get; set; }
    public Guid FileId { get; set; }
    public Guid SignatureId { get; set; }

    public string EventType { get; set; } = string.Empty;  // 'R5Check' | 'MemoryLeak'
    public DateTimeOffset Timestamp { get; set; }
    public int FrameNumber { get; set; }

    // R5Check specific
    public string? CheckCondition { get; set; }   // 'AttachComponent'
    public string? CheckMessage { get; set; }     // 'No scene component with tag...' (runtime context)
    public string? CheckWhere { get; set; }       // 'UR5ScenarioTask_PlaySoundAttachedToActor::...'
    public string? CheckSourceFile { get; set; } // 'R5ScenarioTask_PlaySoundAttachedToActor.cpp:112'
    public List<string> Callstack { get; set; } = [];

    // MemoryLeak specific
    public double? MemoryGrowthRate { get; set; }
    public string? MemoryWorld { get; set; }

    // Extra fields for future event types
    public Dictionary<string, string> Extra { get; set; } = [];

    public LogFile? File { get; set; }
    public EventSignature? Signature { get; set; }
}
