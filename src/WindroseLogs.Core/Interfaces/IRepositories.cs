using WindroseLogs.Core.Models;

namespace WindroseLogs.Core.Interfaces;

public interface ILogIngestionService
{
    /// <summary>Принимает поток файла, сохраняет метаданные, ставит задачу на парсинг</summary>
    Task<LogFile> IngestAsync(Stream fileStream, string fileName, string source, Guid uploadedBy, CancellationToken ct = default);
}

public interface ILogParsingJob
{
    /// <summary>Hangfire job: читает файл, парсит события, сохраняет в БД</summary>
    Task ProcessFileAsync(Guid fileId, CancellationToken ct = default);
}

public interface ILogFileRepository
{
    Task<LogFile?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<List<LogFile>> GetAllAsync(int page, int pageSize, CancellationToken ct = default);
    Task AddAsync(LogFile file, CancellationToken ct = default);
    Task UpdateAsync(LogFile file, CancellationToken ct = default);
}

public interface IEventSignatureRepository
{
    Task<EventSignature?> GetByHashAsync(string hash, CancellationToken ct = default);
    Task<List<EventSignature>> GetAllAsync(string? eventType = null, CancellationToken ct = default);
    Task<List<EventSignature>> GetPopularAsync(string eventType, int topN, CancellationToken ct = default);
    Task UpsertAsync(EventSignature signature, CancellationToken ct = default);

    /// <summary>Для Teams: краткая сводка всех R5Check категорий с количеством</summary>
    Task<List<SignatureSummary>> GetSummaryAsync(string eventType, CancellationToken ct = default);
}

public interface ILogEventRepository
{
    Task AddRangeAsync(IEnumerable<LogEvent> events, CancellationToken ct = default);
    Task<List<LogEvent>> GetBySignatureAsync(Guid signatureId, int page, int pageSize, CancellationToken ct = default);
    Task<List<LogEvent>> SearchAsync(string query, int page, int pageSize, CancellationToken ct = default);
}

public interface IUserRepository
{
    Task<User?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task UpsertAsync(User user, CancellationToken ct = default);
}

/// <summary>DTO для Teams-ответа и дашборда</summary>
public record SignatureSummary(
    Guid SignatureId,
    string ConditionText,
    string WhereText,
    string SourceFile,
    int TotalCount,
    int FileCount,
    DateTimeOffset LastSeen
);
