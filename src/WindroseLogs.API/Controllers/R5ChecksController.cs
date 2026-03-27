using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WindroseLogs.Infrastructure.Data;

namespace WindroseLogs.API.Controllers;

[ApiController]
[Route("api/r5checks")]
[Authorize]
public class R5ChecksController(AppDbContext db) : ControllerBase
{
    [HttpGet("summary")]
    public async Task<IActionResult> Summary(
        [FromQuery] DateOnly? dateFrom = null,
        [FromQuery] DateOnly? dateTo = null,
        [FromQuery] Guid? fileId = null,
        CancellationToken ct = default)
    {
        // If filtering by file, get signatureIds from that file
        IQueryable<Guid> sigIds = db.EventSignatures
            .Where(s => s.EventType == "R5Check")
            .Select(s => s.Id);

        if (fileId.HasValue)
        {
            sigIds = db.LogEvents
                .Where(e => e.FileId == fileId)
                .Select(e => e.SignatureId)
                .Distinct();
        }

        var query = db.EventSignatures
            .Where(s => s.EventType == "R5Check" && sigIds.Contains(s.Id));

        if (dateFrom.HasValue)
            query = query.Where(s => s.LastSeen >= dateFrom.Value.ToDateTime(TimeOnly.MinValue));
        if (dateTo.HasValue)
            query = query.Where(s => s.FirstSeen <= dateTo.Value.ToDateTime(TimeOnly.MaxValue));

        var summary = await query
            .OrderByDescending(s => s.TotalCount)
            .Select(s => new {
                s.Id, s.ConditionText, s.WhereText, s.SourceFile,
                s.TotalCount, s.FileCount, s.FirstSeen, s.LastSeen
            })
            .ToListAsync(ct);
        return Ok(summary);
    }

    [HttpGet("popular")]
    public async Task<IActionResult> Popular([FromQuery] int top = 5, CancellationToken ct = default)
    {
        var result = await db.EventSignatures
            .Where(s => s.EventType == "R5Check")
            .OrderByDescending(s => s.TotalCount)
            .Take(top)
            .Select(s => new { s.Id, s.ConditionText, s.SourceFile, s.TotalCount, s.LastSeen })
            .ToListAsync(ct);
        return Ok(result);
    }

    [HttpGet("unique")]
    public async Task<IActionResult> Unique(CancellationToken ct)
    {
        var result = await db.EventSignatures
            .Where(s => s.EventType == "R5Check" && s.TotalCount == 1)
            .OrderByDescending(s => s.LastSeen)
            .Select(s => new { s.Id, s.ConditionText, s.SourceFile, s.FirstSeen })
            .ToListAsync(ct);
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Details(Guid id,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        [FromQuery] Guid? fileId = null, CancellationToken ct = default)
    {
        var sig = await db.EventSignatures.FindAsync([id], ct);
        if (sig is null) return NotFound();

        var eventsQuery = db.LogEvents
            .Where(e => e.SignatureId == id)
            .Include(e => e.File)
            .OrderByDescending(e => e.Timestamp);

        var filteredQuery = fileId.HasValue
            ? eventsQuery.Where(e => e.FileId == fileId)
            : eventsQuery;

        var events = await filteredQuery
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(e => new {
                e.Id, e.Timestamp, e.FrameNumber, e.CheckCondition,
                e.CheckMessage, e.CheckWhere, e.CheckSourceFile, e.Callstack,
                File = new { e.File!.Id, e.File.FileName, e.File.SessionDate }
            })
            .ToListAsync(ct);

        return Ok(new { signature = sig, events, page, pageSize });
    }

    [HttpGet("search")]
    public async Task<IActionResult> Search(
        [FromQuery] string q, [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(q)) return BadRequest("Query is required");
        var result = await db.EventSignatures
            .Where(s => s.EventType == "R5Check" && (
                s.ConditionText!.Contains(q) || s.WhereText!.Contains(q) || s.SourceFile!.Contains(q)))
            .OrderByDescending(s => s.TotalCount)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .ToListAsync(ct);
        return Ok(result);
    }

    /// <summary>События по дням для графика на Dashboard</summary>
    [HttpGet("timeline")]
    public async Task<IActionResult> Timeline(
        [FromQuery] int days = 30, CancellationToken ct = default)
    {
        var from = DateTime.UtcNow.AddDays(-days);
        var data = await db.LogEvents
            .Where(e => e.EventType == "R5Check" && e.Timestamp >= from)
            .GroupBy(e => e.Timestamp.Date)
            .Select(g => new { Date = g.Key, Count = g.Count() })
            .OrderBy(x => x.Date)
            .ToListAsync(ct);
        return Ok(data);
    }
}
