using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WindroseLogs.Infrastructure.Data;

namespace WindroseLogs.API.Controllers;

[ApiController]
[Route("api/memory-leaks")]
[Authorize]
public class MemoryLeaksController(AppDbContext db) : ControllerBase
{
    [HttpGet("summary")]
    public async Task<IActionResult> Summary(CancellationToken ct)
    {
        var result = await db.EventSignatures
            .Where(s => s.EventType == "MemoryLeak")
            .OrderByDescending(s => s.TotalCount)
            .Select(s => new {
                s.Id, s.ConditionText, s.TotalCount,
                s.FileCount, s.FirstSeen, s.LastSeen
            })
            .ToListAsync(ct);
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Details(Guid id,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        var sig = await db.EventSignatures.FindAsync([id], ct);
        if (sig is null) return NotFound();

        var events = await db.LogEvents
            .Where(e => e.SignatureId == id)
            .Include(e => e.File)
            .OrderByDescending(e => e.Timestamp)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(e => new {
                e.Id, e.Timestamp, e.FrameNumber,
                e.MemoryGrowthRate, e.MemoryWorld,
                File = new { e.File!.Id, e.File.FileName, e.File.SessionDate }
            })
            .ToListAsync(ct);

        return Ok(new { signature = sig, events, page, pageSize });
    }

    /// <summary>Timeline: avg growth rate by day</summary>
    [HttpGet("timeline")]
    public async Task<IActionResult> Timeline([FromQuery] int days = 30, CancellationToken ct = default)
    {
        var from = DateTime.UtcNow.AddDays(-days);
        var data = await db.LogEvents
            .Where(e => e.EventType == "MemoryLeak" && e.Timestamp >= from)
            .GroupBy(e => e.Timestamp.Date)
            .Select(g => new {
                Date = g.Key,
                Count = g.Count(),
                AvgGrowthRate = g.Average(e => e.MemoryGrowthRate ?? 0)
            })
            .OrderBy(x => x.Date)
            .ToListAsync(ct);
        return Ok(data);
    }
}
