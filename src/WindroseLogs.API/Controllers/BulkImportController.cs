using Hangfire;
using Microsoft.AspNetCore.Mvc;
using WindroseLogs.Core.Models;
using WindroseLogs.Infrastructure.Data;
using WindroseLogs.Infrastructure.Jobs;

namespace WindroseLogs.API.Controllers;

/// <summary>
/// Bulk import endpoint — принимает файлы по API ключу без Azure AD.
/// Только для локального/CLI использования.
/// </summary>
[ApiController]
[Route("api/bulk")]
public class BulkImportController(
    AppDbContext db,
    IBackgroundJobClient jobs,
    IConfiguration config) : ControllerBase
{
    private bool IsAuthorized()
    {
        var expected = config["BulkImport:ApiKey"];
        var provided = Request.Headers["X-Api-Key"].FirstOrDefault();
        return !string.IsNullOrEmpty(expected) && expected == provided;
    }

    [HttpPost("upload")]
    [RequestSizeLimit(500 * 1024 * 1024)] // 500MB
    public async Task<IActionResult> Upload(IFormFile file, CancellationToken ct)
    {
        if (!IsAuthorized()) return Unauthorized("Invalid or missing X-Api-Key header");
        if (file is null || file.Length == 0) return BadRequest("File is required");
        if (!file.FileName.EndsWith(".log", StringComparison.OrdinalIgnoreCase))
            return BadRequest("Only .log files accepted");

        var logFile = new LogFile
        {
            Id         = Guid.NewGuid(),
            FileName   = file.FileName,
            Source     = "bulk_import",
            SessionDate = TryParseDate(file.FileName),
            UploadedBy = Guid.Parse("00000000-0000-0000-0000-000000000001"), // system user
            Status     = "pending"
        };

        var path = LogParsingJob.GetStoragePath(logFile.Id, file.FileName);
        await using (var stream = System.IO.File.Create(path))
            await file.CopyToAsync(stream, ct);

        db.LogFiles.Add(logFile);
        await db.SaveChangesAsync(ct);

        jobs.Enqueue<LogParsingJob>(j => j.ProcessFileAsync(logFile.Id, CancellationToken.None));

        return Ok(new { fileId = logFile.Id, fileName = file.FileName });
    }

    private static DateOnly? TryParseDate(string name)
    {
        var m = System.Text.RegularExpressions.Regex.Match(name, @"(\d{4}[-._]\d{2}[-._]\d{2})");
        if (m.Success && DateOnly.TryParse(m.Groups[1].Value.Replace('_', '-').Replace('.', '-'), out var d))
            return d;
        return null;
    }
}
