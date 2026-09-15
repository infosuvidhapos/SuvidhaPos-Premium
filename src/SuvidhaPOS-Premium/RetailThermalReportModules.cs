using Microsoft.Data.SqlClient;
using SuvidhaPOS.Premium.Data;

namespace SuvidhaPOS.Premium;

public static class RetailThermalReportModules
{
    static SqlParameter P(string n,object? v)=>new(n,v??DBNull.Value);
    static decimal D(object? v)=>v is null||v is DBNull?0m:Convert.ToDecimal(v);
    static int I(object? v)=>v is null||v is DBNull?0:Convert.ToInt32(v);
    static string S(object? v)=>v?.ToString()??"";
    static string Actor(HttpContext ctx)=>ctx.Items["User"]?.GetType().GetProperty("UserName")?.GetValue(ctx.Items["User"]!)?.ToString()??"System";

    public static void Map(WebApplication app)
    {
        app.MapGet("/api/reports/thermal/{type}", async (Db db,HttpContext ctx,string type,DateTime? from,DateTime? to,string? cashier,string? q) =>
        {
            var f=(from??DateTime.Today).Date;
            var e=(to??f).Date.AddDays(1);
            var cash=(cashier??"").Trim();
            var term=(q??"").Trim();
            var outlet=await db.QuerySingleAsync("SELECT TOP 1 OutletName,StoreType,Address,Phone,Gstin FROM OutletMaster ORDER BY Id");
            var outletName=S(outlet.GetValueOrDefault("OutletName"));
            if(string.IsNullOrWhiteSpace(outletName))outletName="Main Outlet";
            var meta=new {
                outlet=outletName,
                storeType=S(outlet.GetValueOrDefault("StoreType")),
                address=S(outlet.GetValueOrDefault("Address")),
                phone=S(outlet.GetValueOrDefault("Phone")),
                gstin=S(outlet.GetValueOrDefault("Gstin")),
                from=f.ToString("yyyy-MM-dd"),to=e.AddDays(-1).ToString("yyyy-MM-dd"),
                cashier=string.IsNullOrWhiteSpace(cash)?"All":cash,shift="All",printedBy=Actor(ctx),printedAt=DateTime.Now
            };
            var availableCashiers=await db.QueryAsync(@"SELECT UserName Cashier FROM Users WHERE IsActive=1
UNION SELECT DISTINCT ISNULL(NULLIF(CashierName,''),'Unknown') FROM Sales WHERE BillDate>=@f AND BillDate<@e
ORDER BY Cashier",P("@f",f),P("@e",e));

            switch(type.ToLowerInvariant())
            {
                case "account-report":
                    return Results.Ok(await Account(db,meta,availableCashiers,f,e,cash));
                case "cashier-report":
                    return Results.Ok(await CashierClosing(db,meta,availableCashiers,f,e,cash));
                case "payment-mode-report":
                    return Results.Ok(await PaymentModes(db,meta,availableCashiers,f,e,cash));
                case "expense-report":
                    return Results.Ok(await Expenses(db,meta,availableCashiers,f,e,term));
                case "day-close-report":
                    return Results.Ok(await DayClose(db,meta,availableCashiers,f,e));
                case "audit-trail-report":
                    return Results.Ok(await Audit(db,meta,availableCashiers,f,e,cash,term));
                default:
                    return Results.BadRequest(new{message="Unknown thermal report type"});
            }
        });
    }

    static async Task<object> Account(Db db,object meta,IReadOnlyList<Dictionary<string,object?>> cashiers,DateTime f,DateTime e,string cashier)
    {
        var args=new[]{P("@f",f),P("@e",e),P("@cash",cashier)};
        var s=await db.QuerySingleAsync(@"SELECT
COUNT(*) Bills,
CAST(ISNULL(SUM(GrandTotal),0) AS decimal(18,2)) CompletedTotal,
CAST(ISNULL(SUM(Discount),0) AS decimal(18,2)) BillDiscount,
CAST(ISNULL(SUM(Tax),0) AS decimal(18,2)) Tax,
CAST(ISNULL(SUM(CASE WHEN PaidAmount<GrandTotal THEN GrandTotal-PaidAmount ELSE 0 END),0) AS decimal(18,2)) CreditBalance
FROM Sales WHERE Status='Completed' AND BillDate>=@f AND BillDate<@e
AND (@cash='' OR ISNULL(NULLIF(CashierName,''),'Unknown')=@cash)",args);
        var itemDiscount=D(await db.ScalarAsync(@"SELECT ISNULL(SUM(sl.Discount),0) FROM SaleLines sl JOIN Sales s ON s.Id=sl.SaleId
WHERE s.Status='Completed' AND s.BillDate>=@f AND s.BillDate<@e AND (@cash='' OR ISNULL(NULLIF(s.CashierName,''),'Unknown')=@cash)",args));
        var returns=D(await db.ScalarAsync("SELECT ISNULL(SUM(GrandTotal),0) FROM SalesReturns WHERE ReturnDate>=@f AND ReturnDate<@e",P("@f",f),P("@e",e)));
        var returnBills=I(await db.ScalarAsync("SELECT COUNT(*) FROM SalesReturns WHERE ReturnDate>=@f AND ReturnDate<@e",P("@f",f),P("@e",e)));
        var cancelled=I(await db.ScalarAsync(@"SELECT COUNT(*) FROM Sales WHERE BillDate>=@f AND BillDate<@e AND
(Status<>'Completed' OR CancelledAt IS NOT NULL) AND (@cash='' OR ISNULL(NULLIF(CashierName,''),'Unknown')=@cash)",args));
        var holdBills=I(await db.ScalarAsync("SELECT COUNT(*) FROM HeldBills WHERE HeldAt>=@f AND HeldAt<@e",P("@f",f),P("@e",e)));
        var completed=D(s.GetValueOrDefault("CompletedTotal"));
        var billDiscount=D(s.GetValueOrDefault("BillDiscount"));
        var tax=D(s.GetValueOrDefault("Tax"));
        var gross=completed+billDiscount+itemDiscount;
        var net=Math.Max(0,gross-itemDiscount-billDiscount-returns);
        var taxable=Math.Max(0,net-tax);
        var bills=I(s.GetValueOrDefault("Bills"));

        var payments=await PaymentRows(db,f,e,cashier);
        decimal rawCash=0,upi=0,card=0,credit=0,other=0;
        foreach(var r in payments)
        {
            var mode=Bucket(S(r.GetValueOrDefault("Mode")));
            var amount=D(r.GetValueOrDefault("Amount"));
            if(mode=="Cash")rawCash+=amount; else if(mode=="UPI")upi+=amount; else if(mode=="Card")card+=amount; else if(mode=="Credit")credit+=amount; else other+=amount;
        }
        var cashRefund=returns;
        var cashNet=Math.Max(0,rawCash-cashRefund);
        var totalCollection=Math.Max(0,cashNet+upi+card+credit+other);

        var customerReceived=D(await db.ScalarAsync("SELECT ISNULL(SUM(Amount),0) FROM CustomerPayments WHERE PaymentDate>=@f AND PaymentDate<@e",P("@f",f),P("@e",e)));
        var cashReceived=D(await db.ScalarAsync("SELECT ISNULL(SUM(Amount),0) FROM CustomerPayments WHERE PaymentDate>=@f AND PaymentDate<@e AND UPPER(PaymentMode)='CASH'",P("@f",f),P("@e",e)));
        var supplierPaid=D(await db.ScalarAsync("SELECT ISNULL(SUM(Amount),0) FROM SupplierPayments WHERE PaymentDate>=@f AND PaymentDate<@e",P("@f",f),P("@e",e)));
        var purchase=D(await db.ScalarAsync("SELECT ISNULL(SUM(GrandTotal),0) FROM Purchases WHERE PurchaseDate>=@f AND PurchaseDate<@e",P("@f",f),P("@e",e)));
        var expense=D(await db.ScalarAsync("SELECT ISNULL(SUM(Amount),0) FROM Expenses WHERE ExpenseDate>=@f AND ExpenseDate<@e",P("@f",f),P("@e",e)));
        var cashExpense=D(await db.ScalarAsync("SELECT ISNULL(SUM(Amount),0) FROM Expenses WHERE ExpenseDate>=@f AND ExpenseDate<@e AND UPPER(PaymentMode)='CASH'",P("@f",f),P("@e",e)));

        var day=await db.QuerySingleAsync(@"SELECT TOP 1 OpeningCash,ClosingCash,ClosedBy,ClosedAt,Notes FROM DayClosings
WHERE BusinessDate>=CAST(@f AS date) AND BusinessDate<CAST(@e AS date) ORDER BY BusinessDate DESC,Id DESC",P("@f",f),P("@e",e));
        decimal opening;
        if(day.Count>0) opening=D(day.GetValueOrDefault("OpeningCash"));
        else opening=D(await db.ScalarAsync("SELECT TOP 1 ClosingCash FROM DayClosings WHERE BusinessDate<CAST(@f AS date) ORDER BY BusinessDate DESC,Id DESC",P("@f",f)));
        var cashWithdrawal=0m; // dedicated cash-withdrawal transaction is not yet captured elsewhere; keep explicit zero instead of guessing.
        var expected=opening+rawCash+cashReceived-cashExpense-cashRefund-cashWithdrawal;
        decimal? actual=day.Count>0?D(day.GetValueOrDefault("ClosingCash")):null;
        decimal? shortExcess=actual.HasValue?actual.Value-expected:null;

        return new {
            type="account-report",title="DAILY ACCOUNT REPORT",meta,availableCashiers=cashiers,
            sales=new{grossSales=gross,itemDiscount,billDiscount,returns,netSales=net},
            tax=new{taxableSale=taxable,cgst=tax/2m,sgst=tax/2m,igst=0m,totalTax=tax},
            payments=new{cash=cashNet,upi,card,credit,other,totalCollection},
            cashAccount=new{openingCash=opening,cashSale=rawCash,cashReceived,cashExpense,cashRefund,cashWithdrawal,expectedCash=expected,actualCash=actual,shortExcess,isClosed=day.Count>0},
            other=new{purchase,expenses=expense,customerReceived,supplierPaid,creditSale=credit,returnAmount=returns},
            bills=new{totalBills=bills,cancelledBills=cancelled,holdBills,returnBills,averageBillValue=bills>0?net/bills:0m},
            close=new{closedBy=S(day.GetValueOrDefault("ClosedBy")),closedAt=day.GetValueOrDefault("ClosedAt"),notes=S(day.GetValueOrDefault("Notes"))}
        };
    }

    static async Task<object> CashierClosing(Db db,object meta,IReadOnlyList<Dictionary<string,object?>> cashiers,DateTime f,DateTime e,string cashier)
    {
        var rows=await db.QueryAsync(@"SELECT ISNULL(NULLIF(s.CashierName,''),'Unknown') Cashier,COUNT(*) Bills,
CAST(SUM(s.GrandTotal+s.Discount+ISNULL(x.ItemDiscount,0)) AS decimal(18,2)) GrossSales,
CAST(SUM(ISNULL(x.ItemDiscount,0)) AS decimal(18,2)) ItemDiscount,
CAST(SUM(s.Discount) AS decimal(18,2)) BillDiscount,
CAST(SUM(s.GrandTotal) AS decimal(18,2)) NetSales,
CAST(SUM(s.Tax) AS decimal(18,2)) Tax,
CAST(SUM(s.PaidAmount) AS decimal(18,2)) Paid
FROM Sales s
OUTER APPLY(SELECT SUM(sl.Discount) ItemDiscount FROM SaleLines sl WHERE sl.SaleId=s.Id)x
WHERE s.Status='Completed' AND s.BillDate>=@f AND s.BillDate<@e
AND (@cash='' OR ISNULL(NULLIF(s.CashierName,''),'Unknown')=@cash)
GROUP BY ISNULL(NULLIF(s.CashierName,''),'Unknown') ORDER BY Cashier",P("@f",f),P("@e",e),P("@cash",cashier));
        var payments=await db.QueryAsync(@"SELECT Cashier,Mode,COUNT(*) Txns,CAST(SUM(Amount) AS decimal(18,2)) Amount FROM(
SELECT ISNULL(NULLIF(s.CashierName,''),'Unknown') Cashier,COALESCE(NULLIF(sp.PaymentType,''),NULLIF(sp.PaymentMode,''),'Other') Mode,sp.Amount
FROM SalePayments sp JOIN Sales s ON s.Id=sp.SaleId
WHERE s.Status='Completed' AND s.BillDate>=@f AND s.BillDate<@e
AND (@cash='' OR ISNULL(NULLIF(s.CashierName,''),'Unknown')=@cash)
UNION ALL
SELECT ISNULL(NULLIF(s.CashierName,''),'Unknown'),ISNULL(NULLIF(s.PaymentMode,''),'Other'),s.GrandTotal
FROM Sales s WHERE s.Status='Completed' AND s.BillDate>=@f AND s.BillDate<@e
AND (@cash='' OR ISNULL(NULLIF(s.CashierName,''),'Unknown')=@cash)
AND NOT EXISTS(SELECT 1 FROM SalePayments sp WHERE sp.SaleId=s.Id)
)x GROUP BY Cashier,Mode ORDER BY Cashier,Mode",P("@f",f),P("@e",e),P("@cash",cashier));
        return new{type="cashier-report",title="CASHIER CLOSING REPORT",meta,availableCashiers=cashiers,cashiers=rows,payments};
    }

    static async Task<object> PaymentModes(Db db,object meta,IReadOnlyList<Dictionary<string,object?>> cashiers,DateTime f,DateTime e,string cashier)
    {
        var raw=await PaymentRows(db,f,e,cashier);
        var buckets=new Dictionary<string,(int count,decimal amount)>(StringComparer.OrdinalIgnoreCase);
        foreach(var r in raw)
        {
            var key=Bucket(S(r.GetValueOrDefault("Mode")));var count=I(r.GetValueOrDefault("Txns"));var amount=D(r.GetValueOrDefault("Amount"));
            var old=buckets.GetValueOrDefault(key);buckets[key]=(old.count+count,old.amount+amount);
        }
        var rows=buckets.Select(x=>new{mode=x.Key,transactions=x.Value.count,amount=x.Value.amount}).OrderBy(x=>x.mode).ToList();
        var returns=D(await db.ScalarAsync("SELECT ISNULL(SUM(GrandTotal),0) FROM SalesReturns WHERE ReturnDate>=@f AND ReturnDate<@e",P("@f",f),P("@e",e)));
        return new{type="payment-mode-report",title="PAYMENT MODE REPORT",meta,availableCashiers=cashiers,rows,grossCollection=rows.Sum(x=>x.amount),returnAmount=returns,netCollection=Math.Max(0,rows.Sum(x=>x.amount)-returns)};
    }

    static async Task<object> Expenses(Db db,object meta,IReadOnlyList<Dictionary<string,object?>> cashiers,DateTime f,DateTime e,string q)
    {
        var like="%"+q+"%";
        var rows=await db.QueryAsync(@"SELECT ExpenseDate,Category,Amount,PaymentMode,ISNULL(Notes,'') Notes FROM Expenses
WHERE ExpenseDate>=@f AND ExpenseDate<@e AND (@q='' OR Category LIKE @like OR ISNULL(Notes,'') LIKE @like OR PaymentMode LIKE @like)
ORDER BY ExpenseDate,Id",P("@f",f),P("@e",e),P("@q",q),P("@like",like));
        var cats=await db.QueryAsync(@"SELECT Category,COUNT(*) Transactions,CAST(SUM(Amount) AS decimal(18,2)) Amount FROM Expenses
WHERE ExpenseDate>=@f AND ExpenseDate<@e AND (@q='' OR Category LIKE @like OR ISNULL(Notes,'') LIKE @like OR PaymentMode LIKE @like)
GROUP BY Category ORDER BY Amount DESC",P("@f",f),P("@e",e),P("@q",q),P("@like",like));
        var modes=await db.QueryAsync(@"SELECT PaymentMode,COUNT(*) Transactions,CAST(SUM(Amount) AS decimal(18,2)) Amount FROM Expenses
WHERE ExpenseDate>=@f AND ExpenseDate<@e AND (@q='' OR Category LIKE @like OR ISNULL(Notes,'') LIKE @like OR PaymentMode LIKE @like)
GROUP BY PaymentMode ORDER BY Amount DESC",P("@f",f),P("@e",e),P("@q",q),P("@like",like));
        return new{type="expense-report",title="EXPENSE REPORT",meta,availableCashiers=cashiers,total=rows.Sum(x=>D(x.GetValueOrDefault("Amount"))),categories=cats,paymentModes=modes,rows};
    }

    static async Task<object> DayClose(Db db,object meta,IReadOnlyList<Dictionary<string,object?>> cashiers,DateTime f,DateTime e)
    {
        var rows=await db.QueryAsync(@"SELECT BusinessDate,OpeningCash,CashSales,CashIn,CashOut,
CAST(OpeningCash+CashSales+CashIn-CashOut AS decimal(18,2)) ExpectedCash,ClosingCash ActualCash,
CAST(ClosingCash-(OpeningCash+CashSales+CashIn-CashOut) AS decimal(18,2)) ShortExcess,
ClosedBy,ClosedAt,ISNULL(Notes,'') Notes
FROM DayClosings WHERE BusinessDate>=CAST(@f AS date) AND BusinessDate<CAST(@e AS date)
ORDER BY BusinessDate",P("@f",f),P("@e",e));
        return new{type="day-close-report",title="DAY CLOSE REPORT",meta,availableCashiers=cashiers,rows};
    }

    static async Task<object> Audit(Db db,object meta,IReadOnlyList<Dictionary<string,object?>> cashiers,DateTime f,DateTime e,string user,string q)
    {
        var like="%"+q+"%";
        var rows=await db.QueryAsync(@"SELECT TOP 500 CreatedAt,ISNULL(UserName,'System') UserName,Action,ISNULL(Entity,'') Entity,EntityId,ISNULL(Details,'') Details
FROM AuditLogs WHERE CreatedAt>=@f AND CreatedAt<@e
AND (@u='' OR ISNULL(UserName,'System')=@u)
AND (@q='' OR Action LIKE @like OR ISNULL(Entity,'') LIKE @like OR ISNULL(Details,'') LIKE @like)
ORDER BY CreatedAt,Id",P("@f",f),P("@e",e),P("@u",user),P("@q",q),P("@like",like));
        var actions=await db.QueryAsync(@"SELECT Action,COUNT(*) Transactions FROM AuditLogs WHERE CreatedAt>=@f AND CreatedAt<@e
AND (@u='' OR ISNULL(UserName,'System')=@u)
AND (@q='' OR Action LIKE @like OR ISNULL(Entity,'') LIKE @like OR ISNULL(Details,'') LIKE @like)
GROUP BY Action ORDER BY Transactions DESC,Action",P("@f",f),P("@e",e),P("@u",user),P("@q",q),P("@like",like));
        return new{type="audit-trail-report",title="AUDIT TRAIL REPORT",meta,availableCashiers=cashiers,total=rows.Count,actions,rows};
    }

    static async Task<IReadOnlyList<Dictionary<string,object?>>> PaymentRows(Db db,DateTime f,DateTime e,string cashier)
    {
        return await db.QueryAsync(@"SELECT Mode,COUNT(*) Txns,CAST(SUM(Amount) AS decimal(18,2)) Amount FROM(
SELECT COALESCE(NULLIF(sp.PaymentType,''),NULLIF(sp.PaymentMode,''),'Other') Mode,sp.Amount
FROM SalePayments sp JOIN Sales s ON s.Id=sp.SaleId
WHERE s.Status='Completed' AND s.BillDate>=@f AND s.BillDate<@e
AND (@cash='' OR ISNULL(NULLIF(s.CashierName,''),'Unknown')=@cash)
UNION ALL
SELECT ISNULL(NULLIF(s.PaymentMode,''),'Other'),s.GrandTotal
FROM Sales s WHERE s.Status='Completed' AND s.BillDate>=@f AND s.BillDate<@e
AND (@cash='' OR ISNULL(NULLIF(s.CashierName,''),'Unknown')=@cash)
AND NOT EXISTS(SELECT 1 FROM SalePayments sp WHERE sp.SaleId=s.Id)
)x GROUP BY Mode ORDER BY Mode",P("@f",f),P("@e",e),P("@cash",cashier));
    }

    static string Bucket(string mode)
    {
        var v=(mode??"").Trim().ToUpperInvariant();
        if(v.Contains("CASH"))return "Cash";
        if(v.Contains("UPI")||v.Contains("QR"))return "UPI";
        if(v.Contains("CARD")||v.Contains("POS"))return "Card";
        if(v.Contains("CREDIT")||v.Contains("BTC"))return "Credit";
        return "Other";
    }
}
