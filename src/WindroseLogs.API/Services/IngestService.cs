using Hangfire;
using Microsoft.EntityFrameworkCore;
using System.IO.Compression;
using System.Security.Cryptography;
using WindroseLogs.Core.Models;
using WindroseLogs.Infrastructure.Data;
using WindroseLogs.Infrastructure.Jobs;

namespace WindroseLogs.API.Services;

public record IngestResult(Guid FileId, string FileName, string Status, bool Skipped, bool Reparsed);

public class IngestService(AppDbContext db, IBackgroundJobClient jobs)
{
    /// <summary>
    /// Принимает поток, вычисляет MD5, решает что делать:
    ///   новый файл      → создаём, парсим
    ///   тот же хэш     → skip
    ///   хэш изменился  → перезаписываем, сбрасываем события, парсим заново
    /// </summary>
    public async Task<IngestResult> IngestAsync(
        Stream stream, string fileName, string source,
        Guid uploadedBy, string? uploaderName, CancellationToken ct)
    {
        using var ms = new MemoryStream();
        await stream.CopyToAsync(ms, ct);
        var bytes = ms.ToArray();
        var hash  = ComputeMd5(bytes);

        var existing = await db.LogFiles
            .Where(f => f.FileName == fileName && f.Status != "error")
            .OrderByDescending(f => f.UploadedAt)
            .FirstOrDefaultAsync(ct);

        // Тот же файл — skip
        if (existing is not null && existing.FileHash == hash)
            return new IngestResult(existing.Id, fileName, existing.Status, Skipped: true, Reparsed: false);

        // Файл изменился — перепарс
        if (existing is not null)
        {
            await db.LogEvents.Where(e => e.FileId == existing.Id).ExecuteDeleteAsync(ct);

            var oldPath = LogParsingJob.GetStoragePath(existing.Id, fileName);
            await File.WriteAllBytesAsync(oldPath, bytes, ct);

            existing.FileHash     = hash;
            existing.Status       = "pending";
            existing.EventsFound  = 0;
            existing.ErrorMessage = null;
            existing.UploaderName = uploaderName ?? existing.UploaderName;
            existing.UploadedAt   = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);

            jobs.Enqueue<LogParsingJob>(j => j.ProcessFileAsync(existing.Id, CancellationToken.None));
            return new IngestResult(existing.Id, fileName, "pending", Skipped: false, Reparsed: true);
        }

        // Новый файл
        var logFile = new LogFile {
            Id = Guid.NewGuid(), FileName = fileName, Source = source,
            SessionDate = TryParseDate(fileName), UploadedBy = uploadedBy,
            UploaderName = uploaderName, FileHash = hash, Status = "pending",
        };
        var path = LogParsingJob.GetStoragePath(logFile.Id, fileName);
        await File.WriteAllBytesAsync(path, bytes, ct);
        db.LogFiles.Add(logFile);
        await db.SaveChangesAsync(ct);
        jobs.Enqueue<LogParsingJob>(j => j.ProcessFileAsync(logFile.Id, CancellationToken.None));
        return new IngestResult(logFile.Id, fileName, "pending", Skipped: false, Reparsed: false);
    }

    public async Task<List<IngestResult>> IngestZipAsync(
        Stream stream, string source, Guid uploadedBy, string? uploaderName, CancellationToken ct)
    {
        var results = new List<IngestResult>();
        using var zip = new ZipArchive(stream, ZipArchiveMode.Read);
        foreach (var entry in zip.Entries)
        {
            if (!entry.Name.EndsWith(".log", StringComparison.OrdinalIgnoreCase)) continue;
            await using var es = entry.Open();
            results.Add(await IngestAsync(es, entry.Name, source, uploadedBy, uploaderName, ct));
        }
        return results;
    }

    private static string ComputeMd5(byte[] data) =>
        Convert.ToHexString(MD5.HashData(data)).ToLowerInvariant();

    private static DateOnly? TryParseDate(string name)
    {
        var m = System.Text.RegularExpressions.Regex.Match(name, @"(\d{4}[-._]\d{2}[-._]\d{2})");
        return m.Success && DateOnly.TryParse(m.Groups[1].Value.Replace('_', '-').Replace('.', '-'), out var d) ? d : null;
    }
}
