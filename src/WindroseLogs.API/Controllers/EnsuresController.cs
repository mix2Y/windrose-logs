using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WindroseLogs.Infrastructure.Data;

namespace WindroseLogs.API.Controllers;

[ApiController]
[Route("api/ensures")]
[Authorize]
public class EnsuresController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? search = null,
        CancellationToken ct = default)
    {
        var query = db.LogEvents.Where(e => e.EventType == "R5Ensure").AsQueryable();
        if (!string.IsNullOrEmpty(search))
            query = query.Where(e =>
                (e.CheckCondition != null && e.CheckCondition.ToLower().Contains(search.ToLower())) ||
                (e.CheckMessage  != null && e.CheckMessage.ToLower().Contains(search.ToLower())));

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(e => e.Timestamp)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(e => new {
                e.Id, e.FileId,
                FileName    = e.File!.FileName,
                Condition   = e.CheckCondition,
                UserMessage = e.CheckMessage,
                Function    = e.CheckWhere,
                File        = e.CheckSourceFile,
                e.Timestamp,
                UploaderName = e.File.UploaderName,
            })
            .ToListAsync(ct);

        return Ok(new { items, total, page, pageSize });
    }

    [HttpGet("stats")]
    public async Task<IActionResult> Stats(CancellationToken ct)
    {
        var total        = await db.LogEvents.CountAsync(e => e.EventType == "R5Ensure", ct);
        var filesAffected = await db.LogEvents.Where(e => e.EventType == "R5Ensure")
            .Select(e => e.FileId).Distinct().CountAsync(ct);
        var unique = await db.EventSignatures.CountAsync(s => s.EventType == "R5Ensure" && s.TotalCount == 1, ct);
        return Ok(new { total, filesAffected, unique });
    }
}
