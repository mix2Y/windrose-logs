using Hangfire;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IO.Compression;
using WindroseLogs.Infrastructure.Data;
using WindroseLogs.Infrastructure.Jobs;
using WindroseLogs.Core.Models;

namespace WindroseLogs.API.Controllers;

[ApiController]
[Route("api/ingest")]
[Authorize]
public class IngestController(
    AppDbContext db,
    IBackgroundJobClient jobs,
    IConfiguration config) : ControllerBase
{
    [HttpPost("upload")]
    [RequestSizeLimit(500 * 1024 * 1024)]
    public async Task<IActionResult> Upload(IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0) return BadRequest("File is required");
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();

        var results = new List<object>();
        var userId  = GetUserId();

        if (ext == ".zip")
        {
            using var stream = file.OpenReadStream();
            using var zip    = new ZipArchive(stream, ZipArchiveMode.Read);
            foreach (var entry in zip.Entries)
            {
                if (!entry.Name.EndsWith(".log", StringComparison.OrdinalIgnoreCase)) continue;
                await using var es = entry.Open();
                results.Add(await IngestLog(es, entry.Name, userId, ct));
            }
        }
        else if (ext == ".log")
        {
            await using var stream = file.OpenReadStream();
            results.Add(await IngestLog(stream, file.FileName, userId, ct));
        }
        else return BadRequest("Only .log and .zip files are accepted");

        return Ok(results.Count == 1 ? results[0] : new { imported = results.Count, files = results });
    }

    [HttpPost("upload-many")]
    [RequestSizeLimit(500 * 1024 * 1024)]
    public async Task<IActionResult> UploadMany(List<IFormFile> files, CancellationToken ct)
    {
        if (files is null || files.Count == 0) return BadRequest("No files provided");
        var results = new List<object>();
        var userId  = GetUserId();
        foreach (var file in files)
        {
            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (ext == ".zip")
            {
                using var stream = file.OpenReadStream();
                using var zip    = new ZipArchive(stream, ZipArchiveMode.Read);
                foreach (var entry in zip.Entries)
                {
                    if (!entry.Name.EndsWith(".log", StringComparison.OrdinalIgnoreCase)) continue;
                    await using var es = entry.Open();
                    results.Add(await IngestLog(es, entry.Name, userId, ct));
                }
            }
            else if (ext == ".log")
            {
                await using var stream = file.OpenReadStream();
                results.Add(await IngestLog(stream, file.FileName, userId, ct));
            }
        }
        return Ok(new { imported = results.Count, files = results });
    }

    private async Task<object> IngestLog(Stream stream, string fileName, Guid userId, CancellationToken ct)
    {
        var logFile = new LogFile {
            Id = Guid.NewGuid(), FileName = fileName, Source = "web_upload",
            SessionDate = TryParseSessionDate(fileName), UploadedBy = userId, Status = "pending"
        };
        var storagePath = LogParsingJob.GetStoragePath(logFile.Id, fileName);
        await using (var dest = System.IO.File.Create(storagePath))
            await stream.CopyToAsync(dest, ct);
        db.LogFiles.Add(logFile);
        await db.SaveChangesAsync(ct);
        var jobId = jobs.Enqueue<LogParsingJob>(j => j.ProcessFileAsync(logFile.Id, CancellationToken.None));
        return new { fileId = logFile.Id, jobId, fileName, status = "pending" };
    }

    [HttpPost("teams")]
    public async Task<IActionResult> TeamsUpload(
        [FromBody] TeamsFileUploadRequest request, CancellationToken ct)
    {
        var bytes = Convert.FromBase64String(request.ContentBase64);
        var logFile = new LogFile {
            Id = Guid.NewGuid(), FileName = request.FileName, Source = "teams_bot",
            SessionDate = TryParseSessionDate(request.FileName),
            UploadedBy = GetBotUserId(), Status = "pending"
        };

        var storagePath = LogParsingJob.GetStoragePath(logFile.Id, request.FileName);
        await System.IO.File.WriteAllBytesAsync(storagePath, bytes, ct);

        db.LogFiles.Add(logFile);
        await db.SaveChangesAsync(ct);
        jobs.Enqueue<LogParsingJob>(j => j.ProcessFileAsync(logFile.Id, CancellationToken.None));

        return Ok(new { fileId = logFile.Id, fileName = request.FileName });
    }

    /// <summary>Requeue pending files — requires Azure AD auth</summary>
    [HttpPost("requeue-pending")]
    public async Task<IActionResult> RequeuePending(CancellationToken ct)
    {
        var pending = await db.LogFiles
            .Where(f => f.Status == "pending")
            .Select(f => f.Id)
            .ToListAsync(ct);

        foreach (var id in pending)
            jobs.Enqueue<LogParsingJob>(j => j.ProcessFileAsync(id, CancellationToken.None));

        return Ok(new { queued = pending.Count });
    }

    /// <summary>Requeue pending files — internal, uses bulk API key (no JWT needed)</summary>
    [HttpPost("requeue-pending-key")]
    [AllowAnonymous]
    public async Task<IActionResult> RequeuePendingByKey(
        [FromHeader(Name = "X-Api-Key")] string? apiKey, CancellationToken ct)
    {
        if (apiKey != config["BulkImport:ApiKey"]) return Unauthorized();

        var pending = await db.LogFiles
            .Where(f => f.Status == "pending")
            .Select(f => f.Id)
            .ToListAsync(ct);

        foreach (var id in pending)
            jobs.Enqueue<LogParsingJob>(j => j.ProcessFileAsync(id, CancellationToken.None));

        return Ok(new { queued = pending.Count });
    }

    private Guid GetUserId()
    {
        var oid = User.FindFirst("oid")?.Value
               ?? User.FindFirst("http://schemas.microsoft.com/identity/claims/objectidentifier")?.Value;
        return Guid.TryParse(oid, out var id) ? id : Guid.Empty;
    }

    private static Guid GetBotUserId() => Guid.Parse("00000000-0000-0000-0000-000000000001");

    private static DateOnly? TryParseSessionDate(string fileName)
    {
        var match = System.Text.RegularExpressions.Regex.Match(fileName, @"(\d{4}-\d{2}-\d{2})");
        return match.Success && DateOnly.TryParse(match.Groups[1].Value, out var d) ? d : null;
    }
}

public record TeamsFileUploadRequest(string FileName, string ContentBase64);
