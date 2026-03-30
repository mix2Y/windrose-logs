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
    /// <summary>Получить все зарегистрированные чаты для polling</summary>
    [HttpGet("chats")]
    public async Task<IActionResult> GetChats(CancellationToken ct)
    {
        if (!IsAuthorized()) return Unauthorized();
        var chats = await db.BotWatchedChats.ToListAsync(ct);
        return Ok(chats);
    }

    /// <summary>Зарегистрировать чат для polling</summary>
    [HttpPost("chats")]
    public async Task<IActionResult> UpsertChat([FromBody] UpsertChatRequest req, CancellationToken ct)
    {
        if (!IsAuthorized()) return Unauthorized();
        var existing = await db.BotWatchedChats.FindAsync([req.ChatId], ct);
        if (existing is null)
        {
            db.BotWatchedChats.Add(new WindroseLogs.Core.Models.BotWatchedChat
            {
                ChatId = req.ChatId, ServiceUrl = req.ServiceUrl,
                TenantId = req.TenantId, BotId = req.BotId, IsChannel = req.IsChannel,
            });
        }
        else
        {
            existing.ServiceUrl = req.ServiceUrl;
            existing.TenantId   = req.TenantId;
            existing.BotId      = req.BotId;
        }
        await db.SaveChangesAsync(ct);
        return Ok();
    }

    /// <summary>Обновить время последнего polling для чата</summary>
    [HttpPatch("chats/{chatId}")]
    public async Task<IActionResult> UpdateLastCheck(string chatId, CancellationToken ct)
    {
        if (!IsAuthorized()) return Unauthorized();
        var chat = await db.BotWatchedChats.FindAsync([chatId], ct);
        if (chat is null) return NotFound();
        chat.LastCheck = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok();
    }

    [HttpGet("stats")]
    public async Task<IActionResult> Stats(CancellationToken ct)
    {
        if (!IsAuthorized()) return Unauthorized();

        var totalFiles   = await db.LogFiles.CountAsync(ct);
        var doneFiles    = await db.LogFiles.CountAsync(f => f.Status == "done", ct);
        var totalEvents  = await db.LogEvents.CountAsync(ct);
        var r5Total      = await db.LogEvents.CountAsync(e => e.EventType == "R5Check", ct);
        var mlTotal      = await db.LogEvents.CountAsync(e => e.EventType == "MemoryLeak", ct);
        var fatalTotal   = await db.LogEvents.CountAsync(e => e.EventType == "FatalError", ct);
        var signatures   = await db.EventSignatures.CountAsync(e => e.EventType == "R5Check", ct);
        var unique       = await db.EventSignatures.CountAsync(e => e.EventType == "R5Check" && e.TotalCount == 1, ct);

        return Ok(new { totalFiles, doneFiles, totalEvents, r5Total, mlTotal, fatalTotal, signatures, unique });
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

    [HttpGet("file/{id:guid}")]
    public async Task<IActionResult> FileStats(Guid id, CancellationToken ct)
    {
        var file = await db.LogFiles
            .Where(f => f.Id == id)
            .Select(f => new { f.Id, f.FileName, f.Status, f.EventsFound, f.UploaderName, f.UploadedAt })
            .FirstOrDefaultAsync(ct);
        if (file is null) return NotFound();

        var eventCounts = await db.LogEvents
            .Where(e => e.FileId == id)
            .GroupBy(e => e.EventType)
            .Select(g => new { eventType = g.Key, count = g.Count() })
            .ToListAsync(ct);

        var topSignatures = await db.LogEvents
            .Where(e => e.FileId == id && e.EventType == "R5Check")
            .GroupBy(e => e.SignatureId)
            .Select(g => new { SignatureId = g.Key, Count = g.Count(),
                SampleMessage = g.Select(e => e.CheckMessage).FirstOrDefault() })
            .OrderByDescending(x => x.Count).Take(10)
            .Join(db.EventSignatures, x => x.SignatureId, s => s.Id,
                (x, s) => new {
                    s.ConditionText, s.WhereText, s.SourceFile,
                    fileCount = x.Count, totalCount = s.TotalCount,
                    sampleMessage = x.SampleMessage
                })
            .ToListAsync(ct);

        var crashEvents = await db.LogEvents
            .Where(e => e.FileId == id && e.EventType == "FatalError")
            .Select(e => new {
                crashType    = e.CheckCondition,
                errorMessage = e.CheckMessage,
                exitReason   = e.CheckWhere,
                crashGuid    = e.CheckSourceFile,
            })
            .ToListAsync(ct);

        return Ok(new { file, eventCounts, topSignatures, crashEvents });
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


public record UpsertChatRequest(string ChatId, string ServiceUrl, string TenantId, string BotId, bool IsChannel);
