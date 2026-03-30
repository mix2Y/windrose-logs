using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WindroseLogs.Infrastructure.Data;

namespace WindroseLogs.API.Controllers;

[ApiController]
[Route("api/crashes")]
[Authorize]
public class CrashesController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? search = null,
        CancellationToken ct = default)
    {
        var query = db.LogEvents
            .Where(e => e.EventType == "FatalError")
            .AsQueryable();

        if (!string.IsNullOrEmpty(search))
            query = query.Where(e => e.CheckCondition!.ToLower().Contains(search.ToLower())
                || e.CheckMessage!.ToLower().Contains(search.ToLower()));

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(e => e.Timestamp)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(e => new {
                e.Id,
                e.FileId,
                FileName = e.File!.FileName,
                CrashType = e.CheckCondition,
                ErrorMessage = e.CheckMessage,
                ExitReason = e.CheckWhere,
                CrashGuid = e.CheckSourceFile,
                e.Timestamp,
                UploaderName = e.File.UploaderName,
            })
            .ToListAsync(ct);

        return Ok(new { items, total, page, pageSize });
    }

    [HttpGet("stats")]
    public async Task<IActionResult> Stats(CancellationToken ct)
    {
        var total = await db.LogEvents.CountAsync(e => e.EventType == "FatalError", ct);
        var byType = await db.LogEvents
            .Where(e => e.EventType == "FatalError")
            .GroupBy(e => e.CheckCondition)
            .Select(g => new { crashType = g.Key, count = g.Count() })
            .OrderByDescending(x => x.count)
            .ToListAsync(ct);
        var filesAffected = await db.LogEvents
            .Where(e => e.EventType == "FatalError")
            .Select(e => e.FileId).Distinct().CountAsync(ct);

        return Ok(new { total, filesAffected, byType });
    }
}
