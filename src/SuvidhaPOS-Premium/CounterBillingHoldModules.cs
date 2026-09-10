using Microsoft.Data.SqlClient;
using SuvidhaPOS.Premium.Data;
using System.Text.Json;

namespace SuvidhaPOS.Premium;

/// <summary>
/// Persistent counter-billing Hold / Unhold queue. Drafts are kept in Local SQL so
/// they survive page changes and application restarts. Exactly 10 active holds are allowed.
/// </summary>
public static class CounterBillingHoldModules
{
    static SqlParameter P(string name, object? value) => new(name, value ?? DBNull.Value);

    static string UserName(HttpContext ctx)
    {
        var u = ctx.Items["User"];
        return u?.GetType().GetProperty("UserName")?.GetValue(u)?.ToString() ?? "Unknown";
    }

    public static void Map(WebApplication app)
    {
        app.MapGet("/api/billing/holds", async (Db db) =>
        {
            var rows = await db.QueryAsync(@"
SELECT TOP 10 Id,HoldNo,HeldAt,CustomerName,CustomerMobile,ItemCount,GrandTotal,DraftJson,CreatedBy
FROM dbo.HeldBills
ORDER BY HeldAt DESC,Id DESC");
            return Results.Ok(rows);
        });

        app.MapPost("/api/billing/holds", async (Db db, HttpContext ctx, HeldBillRequest x) =>
        {
            if (string.IsNullOrWhiteSpace(x.DraftJson))
                return Results.BadRequest(new { message = "Nothing to hold" });
            if (x.ItemCount <= 0)
                return Results.BadRequest(new { message = "Add at least one item before holding the bill" });

            try
            {
                using var doc = JsonDocument.Parse(x.DraftJson);
                if (doc.RootElement.ValueKind != JsonValueKind.Object)
                    return Results.BadRequest(new { message = "Invalid held bill draft" });
            }
            catch (JsonException)
            {
                return Results.BadRequest(new { message = "Invalid held bill draft" });
            }

            using var c = db.CreateConnection();
            await c.OpenAsync();
            using var tx = c.BeginTransaction(System.Data.IsolationLevel.Serializable);
            try
            {
                using (var countCmd = new SqlCommand("SELECT COUNT(*) FROM dbo.HeldBills WITH(UPDLOCK,HOLDLOCK)", c, tx))
                {
                    var count = Convert.ToInt32(await countCmd.ExecuteScalarAsync());
                    if (count >= 10)
                    {
                        await tx.RollbackAsync();
                        return Results.BadRequest(new { message = "Hold Bill limit reached. Unhold or delete one of the 10 held bills first." });
                    }
                }

                int id;
                using (var insert = new SqlCommand(@"
INSERT dbo.HeldBills(HoldNo,CustomerName,CustomerMobile,ItemCount,GrandTotal,DraftJson,CreatedBy)
VALUES('',@name,@mobile,@items,@total,@draft,@user);
SELECT CAST(SCOPE_IDENTITY() AS int);", c, tx))
                {
                    insert.Parameters.AddRange(new[]
                    {
                        P("@name", string.IsNullOrWhiteSpace(x.CustomerName) ? "Walk-in Customer" : x.CustomerName.Trim()),
                        P("@mobile", string.IsNullOrWhiteSpace(x.CustomerMobile) ? null : x.CustomerMobile.Trim()),
                        P("@items", Math.Max(0, x.ItemCount)),
                        P("@total", Math.Max(0, x.GrandTotal)),
                        P("@draft", x.DraftJson),
                        P("@user", UserName(ctx))
                    });
                    id = Convert.ToInt32(await insert.ExecuteScalarAsync());
                }

                var holdNo = $"HOLD-{id:000}";
                using (var update = new SqlCommand("UPDATE dbo.HeldBills SET HoldNo=@no WHERE Id=@id", c, tx))
                {
                    update.Parameters.AddRange(new[] { P("@no", holdNo), P("@id", id) });
                    await update.ExecuteNonQueryAsync();
                }

                await tx.CommitAsync();
                return Results.Ok(new { id, holdNo, held = true });
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync();
                return Results.BadRequest(new { message = ex.Message });
            }
        });

        app.MapDelete("/api/billing/holds/{id:int}", async (Db db, int id) =>
        {
            var affected = Convert.ToInt32(await db.ScalarAsync(
                "DELETE FROM dbo.HeldBills WHERE Id=@id; SELECT @@ROWCOUNT;", P("@id", id)) ?? 0);
            return affected > 0 ? Results.Ok(new { deleted = true }) : Results.NotFound(new { message = "Held bill not found" });
        });
    }

    public record HeldBillRequest(
        string DraftJson,
        string? CustomerName,
        string? CustomerMobile,
        int ItemCount,
        decimal GrandTotal);
}
