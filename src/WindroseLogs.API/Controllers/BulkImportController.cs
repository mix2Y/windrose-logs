using Hangfire;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IO.Compression;
using WindroseLogs.Core.Models;
using WindroseLogs.Infrastructure.Data;
using WindroseLogs.Infrastructure.Jobs;

namespace WindroseLogs.API.Controllers;

[ApiController]
[Route("api/bulk")]
public class BulkImportController(
    AppDbContext db,
    IBackgroundJobClient jobs,
    IConfiguration config) : ControllerBase
{
    private bool IsAuthorized() =>
        config["BulkImport:ApiKey"] is { } key && key == Request.Headers["X-Api-Key"].FirstOrDefault();

    [HttpPost("upload")]
    [RequestSizeLimit(500 * 1024 * 1024)]
    public async Task<IActionResult> Upload(IFormFile file, CancellationToken ct)
    {
        if (!IsAuthorized()) return Unauthorized("Invalid or missing X-Api-Key header");
        if (file is null || file.Length == 0) return BadRequest("File is required");

        var results = new List<object>();
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();

        if (ext == ".zip")
        {
            using var stream = file.OpenReadStream();
            using var zip = new ZipArchive(stream, ZipArchiveMode.Read);
            foreach (var entry in zip.Entries)
            {
                if (!entry.Name.EndsWith(".log", StringComparison.OrdinalIgnoreCase)) continue;
                await using var entryStream = entry.Open();
                var r = await IngestStream(entryStream, entry.Name, ct);
                results.Add(r);
            }
        }
        else if (ext == ".log")
        {
            await using var stream = file.OpenReadStream();
            var r = await IngestStream(stream, file.FileName, ct);
            results.Add(r);
        }
        else return BadRequest("Only .log and .zip files accepted");

        return Ok(new { imported = results.Count, files = results });
    }

    [HttpPost("upload-many")]
    [RequestSizeLimit(500 * 1024 * 1024)]
    public async Task<IActionResult> UploadMany(List<IFormFile> files, CancellationToken ct)
    {
        if (!IsAuthorized()) return Unauthorized("Invalid or missing X-Api-Key header");
        if (files is null || files.Count == 0) return BadRequest("No files provided");

        var results = new List<object>();
        foreach (var file in files)
        {
            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (ext == ".zip")
            {
                using var stream = file.OpenReadStream();
                using var zip = new ZipArchive(stream, ZipArchiveMode.Read);
                foreach (var entry in zip.Entries)
                {
                    if (!entry.Name.EndsWith(".log", StringComparison.OrdinalIgnoreCase)) continue;
                    await using var es = entry.Open();
                    results.Add(await IngestStream(es, entry.Name, ct));
                }
            }
            else if (ext == ".log")
            {
                await using var stream = file.OpenReadStream();
                results.Add(await IngestStream(stream, file.FileName, ct));
            }
        }
        return Ok(new { imported = results.Count, files = results });
    }

    private async Task<object> IngestStream(Stream stream, string fileName, CancellationToken ct)
    {
        // Skip duplicate (same name, not errored)
        var existing = await db.LogFiles
            .Where(f => f.FileName == fileName && f.Status != "error")
            .OrderByDescending(f => f.UploadedAt)
            .FirstOrDefaultAsync(ct);
        if (existing is not null)
            return new { fileId = existing.Id, fileName, skipped = true, status = existing.Status };

        var logFile = new LogFile
        {
            Id          = Guid.NewGuid(),
            FileName    = fileName,
            Source      = "bulk_import",
            SessionDate = TryParseDate(fileName),
            UploadedBy  = Guid.Parse("00000000-0000-0000-0000-000000000001"),
            Status      = "pending",
        };

        var path = LogParsingJob.GetStoragePath(logFile.Id, fileName);
        await using (var dest = System.IO.File.Create(path))
            await stream.CopyToAsync(dest, ct);

        db.LogFiles.Add(logFile);
        await db.SaveChangesAsync(ct);
        jobs.Enqueue<LogParsingJob>(j => j.ProcessFileAsync(logFile.Id, CancellationToken.None));

        return new { fileId = logFile.Id, fileName, skipped = false, status = "pending" };
    }

    private static DateOnly? TryParseDate(string name)
    {
        var m = System.Text.RegularExpressions.Regex.Match(name, @"(\d{4}[-._]\d{2}[-._]\d{2})");
        if (m.Success && DateOnly.TryParse(m.Groups[1].Value.Replace('_', '-').Replace('.', '-'), out var d))
            return d;
        return null;
    }
}
