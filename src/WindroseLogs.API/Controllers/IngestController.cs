using Hangfire;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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
    [RequestSizeLimit(200 * 1024 * 1024)]
    public async Task<IActionResult> Upload(IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0) return BadRequest("File is required");
        if (!file.FileName.EndsWith(".log", StringComparison.OrdinalIgnoreCase))
            return BadRequest("Only .log files are accepted");

        var logFile = new LogFile {
            Id = Guid.NewGuid(), FileName = file.FileName, Source = "web_upload",
            SessionDate = TryParseSessionDate(file.FileName),
            UploadedBy = GetUserId(), Status = "pending"
        };

        var storagePath = LogParsingJob.GetStoragePath(logFile.Id, file.FileName);
        await using (var stream = System.IO.File.Create(storagePath))
            await file.CopyToAsync(stream, ct);

        db.LogFiles.Add(logFile);
        await db.SaveChangesAsync(ct);

        var jobId = jobs.Enqueue<LogParsingJob>(j =>
            j.ProcessFileAsync(logFile.Id, CancellationToken.None));

        return Ok(new { fileId = logFile.Id, jobId, status = "pending" });
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
