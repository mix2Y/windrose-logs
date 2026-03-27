using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WindroseLogs.Infrastructure.Data;

namespace WindroseLogs.API.Controllers;

/// <summary>Endpoints для Teams Bot — не требуют JWT, используют API Key</summary>
[ApiController]
[Route("api/bot")]
[AllowAnonymous]
public class BotController(AppDbContext db, IConfiguration config) : ControllerBase
{
    private bool IsAuthorized() =>
        config["BulkImport:ApiKey"] is { } key && key == Request.Headers["X-Api-Key"].FirstOrDefault();

    /// <summary>Краткая статистика для ответа бота</summary>
    [HttpGet("stats")]
    public async Task<IActionResult> Stats(CancellationToken ct)
    {
        if (!IsAuthorized()) return Unauthorized();

        var totalFiles   = await db.LogFiles.CountAsync(ct);
        var doneFiles    = await db.LogFiles.CountAsync(f => f.Status == "done", ct);
        var totalEvents  = await db.LogEvents.CountAsync(ct);
        var r5Total      = await db.LogEvents.CountAsync(e => e.EventType == "R5Check", ct);
        var mlTotal      = await db.LogEvents.CountAsync(e => e.EventType == "MemoryLeak", ct);
        var signatures   = await db.EventSignatures.CountAsync(e => e.EventType == "R5Check", ct);
        var unique       = await db.EventSignatures.CountAsync(e => e.EventType == "R5Check" && e.TotalCount == 1, ct);

        return Ok(new { totalFiles, doneFiles, totalEvents, r5Total, mlTotal, signatures, unique });
    }

    /// <summary>Все R5Check сигнатуры — для команды !r5 all</summary>
    [HttpGet("r5/all")]
    public async Task<IActionResult> R5All(CancellationToken ct)
    {
        if (!IsAuthorized()) return Unauthorized();
        var result = await db.EventSignatures
            .Where(s => s.EventType == "R5Check")
            .OrderByDescending(s => s.TotalCount)
            .Select(s => new { s.Id, s.ConditionText, s.SourceFile, s.TotalCount, s.FileCount, s.LastSeen })
            .ToListAsync(ct);
        return Ok(result);
    }

    /// <summary>Топ популярных — для команды !r5 popular</summary>
    [HttpGet("r5/popular")]
    public async Task<IActionResult> R5Popular([FromQuery] int top = 5, CancellationToken ct = default)
    {
        if (!IsAuthorized()) return Unauthorized();
        var result = await db.EventSignatures
            .Where(s => s.EventType == "R5Check" && s.TotalCount > 1)
            .OrderByDescending(s => s.TotalCount)
            .Take(top)
            .Select(s => new { s.Id, s.ConditionText, s.SourceFile, s.TotalCount, s.FileCount, s.LastSeen })
            .ToListAsync(ct);
        return Ok(result);
    }

    /// <summary>Уникальные (встречались 1 раз) — для команды !r5 unique</summary>
    [HttpGet("r5/unique")]
    public async Task<IActionResult> R5Unique(CancellationToken ct)
    {
        if (!IsAuthorized()) return Unauthorized();
        var result = await db.EventSignatures
            .Where(s => s.EventType == "R5Check" && s.TotalCount == 1)
            .OrderByDescending(s => s.FirstSeen)
            .Select(s => new { s.Id, s.ConditionText, s.SourceFile, s.FirstSeen })
            .ToListAsync(ct);
        return Ok(result);
    }

    /// <summary>Проверить новые уникальные сигнатуры после указанного времени</summary>
    [HttpGet("r5/new-unique")]
    public async Task<IActionResult> NewUnique([FromQuery] DateTime since, CancellationToken ct)
    {
        if (!IsAuthorized()) return Unauthorized();
        var sinceUtc = since.Kind == DateTimeKind.Utc ? since : since.ToUniversalTime();
        var result = await db.EventSignatures
            .Where(s => s.EventType == "R5Check" && s.TotalCount == 1 && s.FirstSeen >= sinceUtc)
            .Select(s => new { s.Id, s.ConditionText, s.SourceFile, s.WhereText, s.FirstSeen })
            .ToListAsync(ct);
        return Ok(result);
    }
}
