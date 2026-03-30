using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WindroseLogs.Infrastructure.Data;

namespace WindroseLogs.API.Controllers;

[ApiController]
[Route("api/files")]
[Authorize]
public class FilesController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] DateOnly? dateFrom = null,
        [FromQuery] DateOnly? dateTo = null,
        [FromQuery] string? status = null,
        [FromQuery] string? search = null,
        CancellationToken ct = default)
    {
        var query = db.LogFiles.AsQueryable();
        if (dateFrom.HasValue)
            query = query.Where(f => f.SessionDate == null || f.SessionDate >= dateFrom);
        if (dateTo.HasValue)
            query = query.Where(f => f.SessionDate == null || f.SessionDate <= dateTo);
        if (!string.IsNullOrEmpty(status))
            query = query.Where(f => f.Status == status);
        if (!string.IsNullOrEmpty(search))
            query = query.Where(f => f.FileName.ToLower().Contains(search.ToLower()));

        query = query.OrderByDescending(f => f.UploadedAt);
        var total = await query.CountAsync(ct);
        var items = await query
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(f => new {
                f.Id, f.FileName, f.Source, f.SessionDate,
                f.UploadedAt, f.Status, f.ErrorMessage, f.EventsFound, f.UploaderName
            })
            .ToListAsync(ct);
        return Ok(new { items, total, page, pageSize });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Details(Guid id, CancellationToken ct)
    {
        var file = await db.LogFiles
            .Where(f => f.Id == id)
            .Select(f => new {
                f.Id, f.FileName, f.Source, f.SessionDate,
                f.UploadedAt, f.Status, f.ErrorMessage, f.EventsFound, f.UploaderName
            })
            .FirstOrDefaultAsync(ct);

        if (file is null) return NotFound();

        var eventCounts = await db.LogEvents
            .Where(e => e.FileId == id)
            .GroupBy(e => e.EventType)
            .Select(g => new { EventType = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        // R5Check signatures
        var topSignatures = await db.LogEvents
            .Where(e => e.FileId == id && e.EventType == "R5Check")
            .GroupBy(e => e.SignatureId)
            .Select(g => new { SignatureId = g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .Take(20)
            .Join(db.EventSignatures, x => x.SignatureId, s => s.Id,
                (x, s) => new {
                    s.Id, s.ConditionText, s.WhereText, s.SourceFile,
                    s.TotalCount, FileCount = x.Count
                })
            .ToListAsync(ct);

        // FatalError events
        var fatalErrors = await db.LogEvents
            .Where(e => e.FileId == id && e.EventType == "FatalError")
            .Select(e => new {
                CrashType    = e.CheckCondition,
                ErrorMessage = e.CheckMessage,
                ExitReason   = e.CheckWhere,
                CrashGuid    = e.CheckSourceFile,
                e.Timestamp,
            })
            .ToListAsync(ct);

        // Error events
        var errors = await db.LogEvents
            .Where(e => e.FileId == id && e.EventType == "Error")
            .OrderByDescending(e => e.Timestamp)
            .Select(e => new {
                Channel      = e.CheckCondition,
                ErrorMessage = e.CheckMessage,
                Function     = e.CheckWhere,
                SourceFile   = e.CheckSourceFile,
                e.Timestamp,
            })
            .ToListAsync(ct);

        // R5Ensure events
        var ensures = await db.LogEvents
            .Where(e => e.FileId == id && e.EventType == "R5Ensure")
            .Select(e => new {
                Condition   = e.CheckCondition,
                UserMessage = e.CheckMessage,
                Function    = e.CheckWhere,
                File        = e.CheckSourceFile,
                e.Timestamp,
            })
            .ToListAsync(ct);

        // MemoryLeak summary by world
        var memoryLeaks = await db.LogEvents
            .Where(e => e.FileId == id && e.EventType == "MemoryLeak")
            .GroupBy(e => e.MemoryWorld)
            .Select(g => new {
                World       = g.Key,
                Count       = g.Count(),
                MaxGrowth   = g.Max(e => e.MemoryGrowthRate),
            })
            .OrderByDescending(x => x.Count)
            .ToListAsync(ct);

        return Ok(new { file, eventCounts, topSignatures, fatalErrors, errors, ensures, memoryLeaks });
    }
}
