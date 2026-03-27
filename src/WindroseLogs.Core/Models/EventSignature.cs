namespace WindroseLogs.Core.Models;

/// <summary>
/// Уникальная сигнатура события — основа для категоризации.
/// Для R5Check: хэш от (Condition + Where). 
/// Множество LogEvent-ов указывают на одну SignatureId.
/// </summary>
public class EventSignature
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string EventType { get; set; } = string.Empty;   // 'R5Check'

    /// <summary>md5(EventType + ConditionText + WhereText)</summary>
    public string SignatureHash { get; set; } = string.Empty;

    // R5Check
    public string? ConditionText { get; set; }  // 'AttachComponent'
    public string? WhereText { get; set; }      // 'UR5ScenarioTask_PlaySoundAttachedToActor::...'
    public string? SourceFile { get; set; }     // 'R5ScenarioTask_PlaySoundAttachedToActor.cpp:112'

    public DateTimeOffset FirstSeen { get; set; }
    public DateTimeOffset LastSeen { get; set; }

    /// <summary>Денормализованный счётчик — обновляется после каждого ingestion</summary>
    public int TotalCount { get; set; }

    /// <summary>В скольких разных файлах встречалась</summary>
    public int FileCount { get; set; }

    public ICollection<LogEvent> Events { get; set; } = [];
}
