using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace WindroseLogs.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "EventSignatures",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EventType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    SignatureHash = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ConditionText = table.Column<string>(type: "text", nullable: true),
                    WhereText = table.Column<string>(type: "text", nullable: true),
                    SourceFile = table.Column<string>(type: "text", nullable: true),
                    FirstSeen = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LastSeen = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    TotalCount = table.Column<int>(type: "integer", nullable: false),
                    FileCount = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EventSignatures", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Email = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    DisplayName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Role = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LastLoginAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "LogFiles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    FileName = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Source = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    SessionDate = table.Column<DateOnly>(type: "date", nullable: true),
                    UploadedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    UploadedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ErrorMessage = table.Column<string>(type: "text", nullable: true),
                    TotalLines = table.Column<int>(type: "integer", nullable: false),
                    EventsFound = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LogFiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LogFiles_Users_UploadedBy",
                        column: x => x.UploadedBy,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "LogEvents",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    FileId = table.Column<Guid>(type: "uuid", nullable: false),
                    SignatureId = table.Column<Guid>(type: "uuid", nullable: false),
                    EventType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Timestamp = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    FrameNumber = table.Column<int>(type: "integer", nullable: false),
                    CheckCondition = table.Column<string>(type: "text", nullable: true),
                    CheckMessage = table.Column<string>(type: "text", nullable: true),
                    CheckWhere = table.Column<string>(type: "text", nullable: true),
                    CheckSourceFile = table.Column<string>(type: "text", nullable: true),
                    Callstack = table.Column<List<string>>(type: "text[]", nullable: false),
                    MemoryGrowthRate = table.Column<double>(type: "double precision", nullable: true),
                    MemoryWorld = table.Column<string>(type: "text", nullable: true),
                    Extra = table.Column<Dictionary<string, string>>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LogEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LogEvents_EventSignatures_SignatureId",
                        column: x => x.SignatureId,
                        principalTable: "EventSignatures",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_LogEvents_LogFiles_FileId",
                        column: x => x.FileId,
                        principalTable: "LogFiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EventSignatures_EventType_TotalCount",
                table: "EventSignatures",
                columns: new[] { "EventType", "TotalCount" });

            migrationBuilder.CreateIndex(
                name: "IX_EventSignatures_SignatureHash",
                table: "EventSignatures",
                column: "SignatureHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LogEvents_FileId_EventType",
                table: "LogEvents",
                columns: new[] { "FileId", "EventType" });

            migrationBuilder.CreateIndex(
                name: "IX_LogEvents_SignatureId",
                table: "LogEvents",
                column: "SignatureId");

            migrationBuilder.CreateIndex(
                name: "IX_LogEvents_Timestamp",
                table: "LogEvents",
                column: "Timestamp");

            migrationBuilder.CreateIndex(
                name: "IX_LogFiles_Status",
                table: "LogFiles",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_LogFiles_UploadedAt",
                table: "LogFiles",
                column: "UploadedAt");

            migrationBuilder.CreateIndex(
                name: "IX_LogFiles_UploadedBy",
                table: "LogFiles",
                column: "UploadedBy");

            migrationBuilder.CreateIndex(
                name: "IX_Users_Email",
                table: "Users",
                column: "Email",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LogEvents");

            migrationBuilder.DropTable(
                name: "EventSignatures");

            migrationBuilder.DropTable(
                name: "LogFiles");

            migrationBuilder.DropTable(
                name: "Users");
        }
    }
}
