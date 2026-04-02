using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WindroseLogs.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSentryFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SentryIssueId",
                table: "EventSignatures",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SentryPermalink",
                table: "EventSignatures",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SentryIssueId",
                table: "EventSignatures");

            migrationBuilder.DropColumn(
                name: "SentryPermalink",
                table: "EventSignatures");
        }
    }
}
