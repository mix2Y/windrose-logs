using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WindroseLogs.Infrastructure.Data;
using WindroseLogs.Infrastructure.Jobs;

namespace WindroseLogs.API.Controllers;

[ApiController]
[Route("api/files")]
[Authorize]
public class LogViewerController(AppDbContext db) : ControllerBase
{
    private const int PAGE_LINES = 500;

    [HttpGet("{id:guid}/raw")]
    public async Task<IActionResult> RawLog(
        Guid id,
        [FromQuery] int page = 1,
        [FromQuery] string? filter = null,
        CancellationToken ct = default)
    {
        var file = await db.LogFiles
            .Where(f => f.Id == id)
            .Select(f => new { f.Id, f.FileName, f.Status })
            .FirstOrDefaultAsync(ct);

        if (file is null) return NotFound();

        var path = LogParsingJob.GetStoragePath(id, file.FileName);
        if (!System.IO.File.Exists(path))
            return NotFound(new { error = "Log file not found on disk", fileName = file.FileName });

        // Read lines with optional filter
        var allLines = await System.IO.File.ReadAllLinesAsync(path, ct);

        IEnumerable<(int lineNum, string text)> indexed = allLines
            .Select((line, i) => (i + 1, line));

        if (!string.IsNullOrWhiteSpace(filter))
        {
            var q = filter.Trim();
            indexed = indexed.Where(x =>
                x.text.Contains(q, StringComparison.OrdinalIgnoreCase));
        }

        var matched = indexed.ToList();
        var totalLines = matched.Count;
        var totalPages = (int)Math.Ceiling(totalLines / (double)PAGE_LINES);

        var pageLines = matched
            .Skip((page - 1) * PAGE_LINES)
            .Take(PAGE_LINES)
            .Select(x => new { lineNumber = x.lineNum, text = x.text })
            .ToList();

        return Ok(new {
            fileName = file.FileName,
            totalLines,
            totalPages,
            page,
            pageSize = PAGE_LINES,
            lines = pageLines,
            filtered = !string.IsNullOrWhiteSpace(filter),
        });
    }
}
