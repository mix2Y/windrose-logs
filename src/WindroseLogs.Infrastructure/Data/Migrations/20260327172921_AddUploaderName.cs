using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WindroseLogs.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddUploaderName : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "UploaderName",
                table: "LogFiles",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "UploaderName",
                table: "LogFiles");
        }
    }
}
