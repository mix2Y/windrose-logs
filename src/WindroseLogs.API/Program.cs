using Hangfire;
using Hangfire.PostgreSql;
using Microsoft.EntityFrameworkCore;
using Microsoft.Identity.Web;
using WindroseLogs.Infrastructure.Data;
using WindroseLogs.Infrastructure.Jobs;
using WindroseLogs.Infrastructure.Parsing;
var builder = WebApplication.CreateBuilder(args);

// ── Azure AD Auth ──────────────────────────────────────────────────────────────
builder.Services.AddMicrosoftIdentityWebApiAuthentication(builder.Configuration, "AzureAd");
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("Admin", policy => policy.RequireClaim("role", "Admin"));
    options.AddPolicy("Reader", policy => policy.RequireAuthenticatedUser());
});

// ── Database ───────────────────────────────────────────────────────────────────
var connStr = builder.Configuration.GetConnectionString("DefaultConnection")!;
var dataSourceBuilder = new Npgsql.NpgsqlDataSourceBuilder(connStr);
dataSourceBuilder.EnableDynamicJson();
var dataSource = dataSourceBuilder.Build();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(dataSource));

// ── Hangfire ───────────────────────────────────────────────────────────────────
builder.Services.AddHangfire(config => config
    .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
    .UseSimpleAssemblyNameTypeSerializer()
    .UseRecommendedSerializerSettings()
    .UsePostgreSqlStorage(c =>
        c.UseNpgsqlConnection(connStr)));
builder.Services.AddHangfireServer();

// ── Application Services ───────────────────────────────────────────────────────
builder.Services.AddScoped<R5LogParser>();
builder.Services.AddScoped<LogParsingJob>();

// ── Web ────────────────────────────────────────────────────────────────────────
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
        policy.WithOrigins(builder.Configuration["Frontend:Url"] ?? "http://localhost:5173")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials());
});

var app = builder.Build();

// ── Migrate on startup ─────────────────────────────────────────────────────────
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();

    // Seed system user for bulk imports
    var systemId = Guid.Parse("00000000-0000-0000-0000-000000000001");
    if (!await db.Users.AnyAsync(u => u.Id == systemId))
    {
        db.Users.Add(new WindroseLogs.Core.Models.User
        {
            Id = systemId, Email = "system@windrose.internal",
            DisplayName = "System", Role = "Admin"
        });
        await db.SaveChangesAsync();
    }
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();
app.UseHangfireDashboard("/hangfire");
app.MapControllers();

app.Run();
