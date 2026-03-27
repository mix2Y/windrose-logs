namespace WindroseLogs.Core.Models;

public class User
{
    /// <summary>Azure AD Object ID</summary>
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;

    /// <summary>'Admin' | 'Reader'</summary>
    public string Role { get; set; } = "Reader";

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastLoginAt { get; set; }

    public ICollection<LogFile> UploadedFiles { get; set; } = [];
}
