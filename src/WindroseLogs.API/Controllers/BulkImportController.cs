using Hangfire;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WindroseLogs.API.Services;
using WindroseLogs.Infrastructure.Data;
using WindroseLogs.Infrastructure.Jobs;

namespace WindroseLogs.API.Controllers;

[ApiController]
[Route("api/bulk")]
public class BulkImportController(
    IngestService ingest,
    AppDbContext db,
    IBackgroundJobClient jobs,
    IConfiguration config) : ControllerBase
{
    private static readonly Guid SystemUser = Guid.Parse("00000000-0000-0000-0000-000000000001");

    private bool IsAuthorized() =>
        config["BulkImport:ApiKey"] is { } key && key == Request.Headers["X-Api-Key"].FirstOrDefault();

    [HttpPost("upload")]
    [RequestSizeLimit(500 * 1024 * 1024)]
    public async Task<IActionResult> Upload(
        IFormFile file,
        [FromHeader(Name = "X-Uploader-Name")] string? uploaderName,
        CancellationToken ct)
    {
        if (!IsAuthorized()) return Unauthorized("Invalid or missing X-Api-Key header");
        if (file is null || file.Length == 0) return BadRequest("File is required");

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (ext == ".zip")
        {
            await using var s = file.OpenReadStream();
            var results = await ingest.IngestZipAsync(s, "bulk_import", SystemUser, uploaderName, ct);
            return Ok(new { imported = results.Count, files = results.Select(ToDto) });
        }
        if (ext == ".log")
        {
            await using var s = file.OpenReadStream();
            var r = await ingest.IngestAsync(s, file.FileName, "bulk_import", SystemUser, uploaderName, ct);
            return Ok(ToDto(r));
        }
        return BadRequest("Only .log and .zip files accepted");
    }

    [HttpPost("upload-many")]
    [RequestSizeLimit(500 * 1024 * 1024)]
    public async Task<IActionResult> UploadMany(
        List<IFormFile> files,
        [FromHeader(Name = "X-Uploader-Name")] string? uploaderName,
        CancellationToken ct)
    {
        if (!IsAuthorized()) return Unauthorized("Invalid or missing X-Api-Key header");
        if (files is null || files.Count == 0) return BadRequest("No files provided");

        var results = new List<object>();
        foreach (var file in files)
        {
            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (ext == ".zip")
            {
                await using var s = file.OpenReadStream();
                var zr = await ingest.IngestZipAsync(s, "bulk_import", SystemUser, uploaderName, ct);
                results.AddRange(zr.Select(ToDto));
            }
            else if (ext == ".log")
            {
                await using var s = file.OpenReadStream();
                results.Add(ToDto(await ingest.IngestAsync(s, file.FileName, "bulk_import", SystemUser, uploaderName, ct)));
            }
        }
        return Ok(new { imported = results.Count, files = results });
    }

    [HttpPost("requeue-pending")]
    public async Task<IActionResult> RequeuePending(
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

    private static object ToDto(IngestResult r) => new {
        fileId = r.FileId, fileName = r.FileName,
        status = r.Status, skipped = r.Skipped, reparsed = r.Reparsed,
    };
}
