using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WindroseLogs.Infrastructure.Data;
using WindroseLogs.Core.Models;

namespace WindroseLogs.API.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(Policy = "Admin")]
public class AdminController(AppDbContext db) : ControllerBase
{
    // ── Users ────────────────────────────────────────────────────────────────

    [HttpGet("users")]
    public async Task<IActionResult> ListUsers(CancellationToken ct)
    {
        var users = await db.Users
            .OrderBy(u => u.DisplayName)
            .Select(u => new {
                u.Id, u.Email, u.DisplayName, u.Role,
                u.CreatedAt, u.LastLoginAt
            })
            .ToListAsync(ct);
        return Ok(users);
    }

    [HttpPatch("users/{id:guid}/role")]
    public async Task<IActionResult> SetRole(Guid id, [FromBody] SetRoleRequest req, CancellationToken ct)
    {
        if (req.Role is not ("Admin" or "Reader"))
            return BadRequest("Role must be 'Admin' or 'Reader'");

        var user = await db.Users.FindAsync([id], ct);
        if (user is null) return NotFound();

        user.Role = req.Role;
        await db.SaveChangesAsync(ct);
        return Ok(new { user.Id, user.Role });
    }

    [HttpDelete("users/{id:guid}")]
    public async Task<IActionResult> DeleteUser(Guid id, CancellationToken ct)
    {
        var user = await db.Users.FindAsync([id], ct);
        if (user is null) return NotFound();

        // Prevent self-deletion
        var callerId = GetCallerId();
        if (callerId == id) return BadRequest("Cannot delete your own account");

        db.Users.Remove(user);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ── Stats ────────────────────────────────────────────────────────────────

    [HttpGet("stats")]
    public async Task<IActionResult> Stats(CancellationToken ct)
    {
        var filesTotal      = await db.LogFiles.CountAsync(ct);
        var filesDone       = await db.LogFiles.CountAsync(f => f.Status == "done", ct);
        var filesError      = await db.LogFiles.CountAsync(f => f.Status == "error", ct);
        var eventsTotal     = await db.LogEvents.CountAsync(ct);
        var signaturesTotal = await db.EventSignatures.CountAsync(ct);
        var usersTotal      = await db.Users.CountAsync(ct);

        var byEventType = await db.LogEvents
            .GroupBy(e => e.EventType)
            .Select(g => new { EventType = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        return Ok(new {
            filesTotal, filesDone, filesError,
            eventsTotal, signaturesTotal, usersTotal,
            byEventType
        });
    }

    private Guid GetCallerId()
    {
        var oid = User.FindFirst("oid")?.Value
               ?? User.FindFirst("http://schemas.microsoft.com/identity/claims/objectidentifier")?.Value;
        return Guid.TryParse(oid, out var id) ? id : Guid.Empty;
    }
}

public record SetRoleRequest(string Role);
