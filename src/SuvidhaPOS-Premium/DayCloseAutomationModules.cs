using Microsoft.Data.SqlClient;
using SuvidhaPOS.Premium.Data;

namespace SuvidhaPOS.Premium;

public static class DayCloseAutomationModules
{
    static SqlParameter P(string n,object? v)=>new(n,v??DBNull.Value);

    public static void Map(WebApplication app)
    {
        app.MapPost("/api/day-closing/auto-run", async (Db db, HttpContext ctx) =>
        {
            var setting=await db.QuerySingleAsync("SELECT TOP 1 [Value] FROM AppSettings WHERE [Key]='DayClose.Auto'");
            var enabled=setting.Count>0 && (setting.GetValueOrDefault("Value")?.ToString()??"").Equals("true",StringComparison.OrdinalIgnoreCase);
            if(!enabled) return Results.Ok(new{enabled=false,closed=false,message="Auto Day Close is disabled"});

            var target=DateTime.Today.AddDays(-1);
            var exists=Convert.ToInt32(await db.ScalarAsync("SELECT COUNT(*) FROM DayClosings WHERE BusinessDate=@d",P("@d",target))??0);
            if(exists>0) return Results.Ok(new{enabled=true,closed=false,alreadyClosed=true,businessDate=target.ToString("yyyy-MM-dd")});

            decimal D(object? x)=>x is null||x is DBNull?0m:Convert.ToDecimal(x);
            var cashSales=D(await db.ScalarAsync(@"SELECT ISNULL(SUM(GrandTotal),0) FROM Sales
WHERE CAST(BillDate AS date)=@d AND Status='Completed' AND PaymentMode='Cash'",P("@d",target)));
            var cashIn=D(await db.ScalarAsync(@"SELECT ISNULL(SUM(Amount),0) FROM CustomerPayments
WHERE CAST(PaymentDate AS date)=@d AND PaymentMode='Cash'",P("@d",target)));
            var cashOut=D(await db.ScalarAsync(@"SELECT ISNULL(SUM(Amount),0) FROM Expenses
WHERE CAST(ExpenseDate AS date)=@d AND PaymentMode='Cash'",P("@d",target)));
            var opening=D(await db.ScalarAsync(@"SELECT TOP 1 ClosingCash FROM DayClosings
WHERE BusinessDate<@d ORDER BY BusinessDate DESC,Id DESC",P("@d",target)));
            var closing=opening+cashSales+cashIn-cashOut;
            var user=ctx.Items["User"]?.GetType().GetProperty("UserName")?.GetValue(ctx.Items["User"]!)?.ToString()??"AUTO";

            var id=await db.ScalarAsync(@"INSERT DayClosings(BusinessDate,OpeningCash,CashSales,CashIn,CashOut,ClosingCash,ClosedBy,ClosedAt,Notes)
VALUES(@d,@o,@s,@i,@out,@c,@u,SYSDATETIME(),'Automatic day close after midnight/date rollover');
SELECT CAST(SCOPE_IDENTITY() AS int)",P("@d",target),P("@o",opening),P("@s",cashSales),P("@i",cashIn),P("@out",cashOut),P("@c",closing),P("@u","AUTO:"+user));

            return Results.Ok(new{id=Convert.ToInt32(id),enabled=true,closed=true,businessDate=target.ToString("yyyy-MM-dd"),openingCash=opening,cashSales,cashIn,cashOut,closingCash=closing});
        });

        app.MapGet("/api/day-closing/status", async (Db db) =>
        {
            var setting=await db.QuerySingleAsync("SELECT TOP 1 [Value] FROM AppSettings WHERE [Key]='DayClose.Auto'");
            var enabled=setting.Count>0 && (setting.GetValueOrDefault("Value")?.ToString()??"").Equals("true",StringComparison.OrdinalIgnoreCase);
            var last=await db.QuerySingleAsync("SELECT TOP 1 BusinessDate,ClosedBy,ClosedAt FROM DayClosings ORDER BY BusinessDate DESC,Id DESC");
            return Results.Ok(new{autoEnabled=enabled,last});
        });
    }
}
