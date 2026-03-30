using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WindroseLogs.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddBotWatchedChats : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BotWatchedChats",
                columns: table => new
                {
                    ChatId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ServiceUrl = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    BotId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    IsChannel = table.Column<bool>(type: "boolean", nullable: false),
                    RegisteredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LastCheck = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BotWatchedChats", x => x.ChatId);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BotWatchedChats");
        }
    }
}
