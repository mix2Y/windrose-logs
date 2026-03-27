using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using WindroseLogs.API.Services;

namespace WindroseLogs.API.Controllers;

[ApiController]
[Route("api/ingest")]
[Authorize]
public class IngestController(IngestService ingest, IConfiguration config) : ControllerBase
{
    private static readonly Guid BotUserId = Guid.Parse("00000000-0000-0000-0000-000000000001");

    [HttpPost("upload")]
    [RequestSizeLimit(500 * 1024 * 1024)]
    public async Task<IActionResult> Upload(IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0) return BadRequest("File is required");
        var userId = GetUserId();
        var ext    = Path.GetExtension(file.FileName).ToLowerInvariant();

        if (ext == ".zip")
        {
            await using var stream = file.OpenReadStream();
            var results = await ingest.IngestZipAsync(stream, "web_upload", userId, null, ct);
            return Ok(new { imported = results.Count, files = results.Select(ToDto) });
        }
        if (ext == ".log")
        {
            await using var stream = file.OpenReadStream();
            var r = await ingest.IngestAsync(stream, file.FileName, "web_upload", userId, null, ct);
            return Ok(ToDto(r));
        }
        return BadRequest("Only .log and .zip files are accepted");
    }

    [HttpPost("upload-many")]
    [RequestSizeLimit(500 * 1024 * 1024)]
    public async Task<IActionResult> UploadMany(List<IFormFile> files, CancellationToken ct)
    {
        if (files is null || files.Count == 0) return BadRequest("No files provided");
        var userId  = GetUserId();
        var results = new List<object>();
        foreach (var file in files)
        {
            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (ext == ".zip")
            {
                await using var s = file.OpenReadStream();
                var zr = await ingest.IngestZipAsync(s, "web_upload", userId, null, ct);
                results.AddRange(zr.Select(ToDto));
            }
            else if (ext == ".log")
            {
                await using var s = file.OpenReadStream();
                results.Add(ToDto(await ingest.IngestAsync(s, file.FileName, "web_upload", userId, null, ct)));
            }
        }
        return Ok(new { imported = results.Count, files = results });
    }

    [HttpPost("teams")]
    public async Task<IActionResult> TeamsUpload(
        [FromBody] TeamsFileUploadRequest request, CancellationToken ct)
    {
        var bytes = Convert.FromBase64String(request.ContentBase64);
        using var ms = new MemoryStream(bytes);
        var r = await ingest.IngestAsync(ms, request.FileName, "teams_bot", BotUserId, request.UploaderName, ct);
        return Ok(ToDto(r));
    }

    [HttpPost("requeue-pending")]
    public async Task<IActionResult> RequeuePending(CancellationToken ct)
    {
        // delegated to BulkImport key-based endpoint or called from Admin UI
        return Ok(new { message = "Use /api/ingest/requeue-pending-key with X-Api-Key" });
    }

    [HttpPost("requeue-pending-key")]
    [AllowAnonymous]
    public async Task<IActionResult> RequeuePendingByKey(
        [FromHeader(Name = "X-Api-Key")] string? apiKey, CancellationToken ct)
    {
        if (apiKey != config["BulkImport:ApiKey"]) return Unauthorized();
        // re-use ingest service indirectly via direct Hangfire enqueue
        return Ok(new { message = "Use /api/bulk endpoint for requeue" });
    }

    private Guid GetUserId()
    {
        var oid = User.FindFirst("oid")?.Value
               ?? User.FindFirst("http://schemas.microsoft.com/identity/claims/objectidentifier")?.Value;
        return Guid.TryParse(oid, out var id) ? id : Guid.Empty;
    }

    private static object ToDto(IngestResult r) => new {
        fileId = r.FileId, fileName = r.FileName,
        status = r.Status, skipped = r.Skipped, reparsed = r.Reparsed,
    };
}

public record TeamsFileUploadRequest(string FileName, string ContentBase64, string? UploaderName = null);
