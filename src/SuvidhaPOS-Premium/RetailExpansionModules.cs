using Microsoft.Data.SqlClient;
using NPOI.SS.UserModel;
using SuvidhaPOS.Premium.Data;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using UglyToad.PdfPig;
using UglyToad.PdfPig.DocumentLayoutAnalysis.TextExtractor;

namespace SuvidhaPOS.Premium;

/// <summary>
/// Retail master expansion endpoints kept separate from Program.cs so each feature can
/// evolve without disturbing the stable billing endpoints.
/// </summary>
public static class RetailExpansionModules
{
    static SqlParameter P(string n, object? v) => new(n, v ?? DBNull.Value);
    static string UserName(HttpContext ctx)
    {
        var u = ctx.Items["User"];
        return u?.GetType().GetProperty("UserName")?.GetValue(u)?.ToString() ?? "Unknown";
    }

    public static void Map(WebApplication app)
    {
        BtcPartyBridgeModules.Map(app);
        BtcBillPaymentBridgeModules.Map(app);
        app.MapPost("/api/retail/opening-stock/preview", async (HttpRequest req, Db db) =>
        {
            var parsed = await ParseUploadAsync(req);
            if (parsed.Error is not null) return Results.BadRequest(new { message = parsed.Error });
            var products = await LoadProductsAsync(db);
            var rows = parsed.Rows.Select((r, i) => BuildOpeningPreview(r, i + 1, products)).ToList();
            return Results.Ok(new { rows, total = rows.Count, matched = rows.Count(x => x.ProductId > 0), source = parsed.FileName });
        });

        app.MapPost("/api/retail/item-rates/preview", async (HttpRequest req, Db db) =>
        {
            var parsed = await ParseUploadAsync(req);
            if (parsed.Error is not null) return Results.BadRequest(new { message = parsed.Error });
            var products = await LoadProductsAsync(db);
            var rows = parsed.Rows.Select((r, i) => BuildRatePreview(r, i + 1, products)).ToList();
            return Results.Ok(new { rows, total = rows.Count, matched = rows.Count(x => x.ProductId > 0), source = parsed.FileName });
        });

        app.MapPost("/api/retail/item-rates/apply", async (Db db, HttpContext ctx, RateApplyRequest x) =>
        {
            if (x.Rows is null || x.Rows.Count == 0) return Results.BadRequest(new { message = "Select at least one item rate row" });
            using var c = db.CreateConnection();
            await c.OpenAsync();
            using var tx = c.BeginTransaction();
            try
            {
                var updated = 0;
                foreach (var r in x.Rows.Where(z => z.ProductId > 0))
                {
                    using var cmd = new SqlCommand(@"UPDATE Products SET
Mrp=COALESCE(@m,Mrp),PurchasePrice=COALESCE(@p,PurchasePrice),SalePrice=COALESCE(@s,SalePrice)
WHERE Id=@id AND IsActive=1", c, tx);
                    cmd.Parameters.AddRange(new[] { P("@m", r.Mrp), P("@p", r.PurchasePrice), P("@s", r.SalePrice), P("@id", r.ProductId) });
                    updated += await cmd.ExecuteNonQueryAsync();

                    using var uom = new SqlCommand(@"UPDATE ProductUoms SET
LooseSalePrice=COALESCE(@s,LooseSalePrice),
PackSalePrice=CASE WHEN @s IS NULL THEN PackSalePrice ELSE @s*CASE WHEN ConversionFactor>0 THEN ConversionFactor ELSE 1 END END,
InnerSalePrice=CASE WHEN @s IS NULL THEN InnerSalePrice ELSE @s*CASE WHEN InnerConversionFactor>0 THEN InnerConversionFactor ELSE 1 END END,
PackPurchaseRate=CASE WHEN @p IS NULL THEN PackPurchaseRate ELSE @p*CASE WHEN ConversionFactor>0 THEN ConversionFactor ELSE 1 END END,
InnerPurchaseRate=CASE WHEN @p IS NULL THEN InnerPurchaseRate ELSE @p*CASE WHEN InnerConversionFactor>0 THEN InnerConversionFactor ELSE 1 END END,
PackMrp=CASE WHEN @m IS NULL THEN PackMrp ELSE @m*CASE WHEN ConversionFactor>0 THEN ConversionFactor ELSE 1 END END,
InnerMrp=CASE WHEN @m IS NULL THEN InnerMrp ELSE @m*CASE WHEN InnerConversionFactor>0 THEN InnerConversionFactor ELSE 1 END END,
UpdatedAt=SYSDATETIME()
WHERE ProductId=@id", c, tx);
                    uom.Parameters.AddRange(new[] { P("@m", r.Mrp), P("@p", r.PurchasePrice), P("@s", r.SalePrice), P("@id", r.ProductId) });
                    await uom.ExecuteNonQueryAsync();
                }
                using (var audit = new SqlCommand("INSERT AuditLogs(UserName,Action,Entity,Details) VALUES(@u,'ITEM_RATE_BULK_UPDATE','Product',@d)", c, tx))
                {
                    audit.Parameters.AddRange(new[] { P("@u", UserName(ctx)), P("@d", $"Updated rates for {updated} item(s) through Excel/PDF master") });
                    await audit.ExecuteNonQueryAsync();
                }
                await tx.CommitAsync();
                return Results.Ok(new { updated });
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync();
                return Results.BadRequest(new { message = ex.Message });
            }
        });

        app.MapPost("/api/retail/categories", async (Db db, CategoryEditRequest x) =>
        {
            var name = (x.Name ?? "").Trim();
            if (string.IsNullOrWhiteSpace(name)) return Results.BadRequest(new { message = "Category name is required" });
            var dup = await db.QuerySingleAsync("SELECT TOP 1 Id FROM Categories WHERE IsActive=1 AND UPPER(LTRIM(RTRIM(Name)))=UPPER(@n)", P("@n", name));
            if (dup.Count > 0) return Results.BadRequest(new { message = "Category already exists" });
            var id = await db.ScalarAsync("INSERT Categories(Name,IsActive) VALUES(@n,1);SELECT CAST(SCOPE_IDENTITY() AS int)", P("@n", name));
            return Results.Ok(new { id, name });
        });

        app.MapPut("/api/retail/categories/{id:int}", async (Db db, int id, CategoryEditRequest x) =>
        {
            var name = (x.Name ?? "").Trim();
            if (id <= 0 || string.IsNullOrWhiteSpace(name)) return Results.BadRequest(new { message = "Category name is required" });
            var dup = await db.QuerySingleAsync("SELECT TOP 1 Id FROM Categories WHERE IsActive=1 AND Id<>@id AND UPPER(LTRIM(RTRIM(Name)))=UPPER(@n)", P("@id", id), P("@n", name));
            if (dup.Count > 0) return Results.BadRequest(new { message = "Category already exists" });
            await db.ScalarAsync("UPDATE Categories SET Name=@n WHERE Id=@id; UPDATE Products SET Category=@n WHERE CategoryId=@id OR UPPER(LTRIM(RTRIM(ISNULL(Category,''))))=UPPER(@old)", P("@n", name), P("@id", id), P("@old", x.OldName ?? ""));
            return Results.Ok(new { saved = true, id, name });
        });

        app.MapDelete("/api/retail/categories/{id:int}", async (Db db, int id) =>
        {
            if (id <= 0) return Results.BadRequest(new { message = "Invalid category" });
            var cat = await db.QuerySingleAsync("SELECT TOP 1 Name FROM Categories WHERE Id=@id AND IsActive=1", P("@id", id));
            if (cat.Count == 0) return Results.NotFound(new { message = "Category not found" });
            var name = cat.GetValueOrDefault("Name")?.ToString() ?? "";
            var used = Convert.ToInt32(await db.ScalarAsync(@"SELECT COUNT(*) FROM Products
WHERE IsActive=1 AND (CategoryId=@id OR UPPER(LTRIM(RTRIM(ISNULL(Category,''))))=UPPER(@n))", P("@id", id), P("@n", name)) ?? 0);
            if (used > 0) return Results.BadRequest(new { message = $"Category is used by {used} active item(s). Reassign items first." });
            await db.ScalarAsync("UPDATE Categories SET IsActive=0 WHERE Id=@id", P("@id", id));
            return Results.Ok(new { deleted = true });
        });

        app.MapGet("/api/retail/customer-company", async (Db db, string? q) =>
        {
            var term = (q ?? "").Trim();
            var like = "%" + term + "%";
            var rows = await db.QueryAsync(@"
SELECT 'Customer' PartyType,c.Id,c.Name,c.Phone,c.GstIn,c.Address,
 CAST(c.OpeningBalance+ISNULL((SELECT SUM(GrandTotal-PaidAmount) FROM Sales s WHERE s.CustomerId=c.Id AND s.Status='Completed'),0)
 -ISNULL((SELECT SUM(Amount) FROM CustomerPayments cp WHERE cp.CustomerId=c.Id),0) AS decimal(18,2)) Balance,
 CAST(0 AS decimal(18,2)) AdvanceBalance,c.OpeningBalance,
 CAST(0 AS decimal(18,2)) CreditLimit,CAST(0 AS int) CreditDays
FROM Customers c
WHERE c.IsActive=1 AND (@q='' OR c.Name LIKE @l OR ISNULL(c.Phone,'') LIKE @l OR ISNULL(c.GstIn,'') LIKE @l)
UNION ALL
SELECT 'Company',b.Id,b.CompanyName,b.Phone,b.GstIn,b.Address,
 CAST(ISNULL((SELECT SUM(s.PendingAmount) FROM Sales s WHERE s.BtcCompanyId=b.Id AND s.PaymentMode='BTC' AND s.Status='Completed'),0) AS decimal(18,2)),
 CAST(ISNULL((SELECT SUM(a.Amount) FROM BtcAdvances a WHERE a.CompanyId=b.Id),0) AS decimal(18,2)),
 CAST(0 AS decimal(18,2)),b.CreditLimit,b.CreditDays
FROM BtcCompanies b
WHERE b.IsActive=1 AND (@q='' OR b.CompanyName LIKE @l OR ISNULL(b.Phone,'') LIKE @l OR ISNULL(b.GstIn,'') LIKE @l)
ORDER BY Name", P("@q", term), P("@l", like));
            return Results.Ok(rows);
        });

        app.MapPut("/api/retail/customers/{id:int}", async (Db db, int id, CustomerEditRequest x) =>
        {
            var name = (x.Name ?? "").Trim();
            if (id <= 0 || string.IsNullOrWhiteSpace(name)) return Results.BadRequest(new { message = "Customer name is required" });
            await db.ScalarAsync(@"UPDATE Customers SET Name=@n,Phone=@p,Address=@a,GstIn=@g,OpeningBalance=@o WHERE Id=@id AND IsActive=1",
                P("@n", name), P("@p", x.Phone), P("@a", x.Address), P("@g", x.GstIn), P("@o", x.OpeningBalance), P("@id", id));
            return Results.Ok(new { saved = true });
        });

        app.MapDelete("/api/retail/customers/{id:int}", async (Db db, int id) =>
        {
            await db.ScalarAsync("UPDATE Customers SET IsActive=0 WHERE Id=@id", P("@id", id));
            return Results.Ok(new { deleted = true });
        });

        app.MapDelete("/api/retail/btc-companies/{id:int}", async (Db db, int id) =>
        {
            var pending = Convert.ToDecimal(await db.ScalarAsync("SELECT ISNULL(SUM(PendingAmount),0) FROM Sales WHERE BtcCompanyId=@id AND PaymentMode='BTC' AND Status='Completed'", P("@id", id)) ?? 0m);
            if (pending > 0.005m) return Results.BadRequest(new { message = $"Company has pending BTC amount ₹{pending:0.00}. Settle it before delete." });
            var advance = Convert.ToDecimal(await db.ScalarAsync("SELECT ISNULL(SUM(Amount),0) FROM BtcAdvances WHERE CompanyId=@id", P("@id", id)) ?? 0m);
            if (advance > 0.005m) return Results.BadRequest(new { message = $"Company has recorded advance ₹{advance:0.00}. Keep the company active so advance history remains available." });
            await db.ScalarAsync("UPDATE BtcCompanies SET IsActive=0,UpdatedAt=SYSDATETIME() WHERE Id=@id", P("@id", id));
            return Results.Ok(new { deleted = true });
        });

        app.MapPost("/api/btc/advance", async (Db db, HttpContext ctx, BtcAdvanceRequest x) =>
        {
            if (x.CompanyId <= 0) return Results.BadRequest(new { message = "Select company" });
            var amount = Math.Max(0, x.Amount);
            if (amount <= 0) return Results.BadRequest(new { message = "Enter advance amount" });
            var mode = (x.PaymentMode ?? "").Trim();
            if (!mode.Equals("Cash", StringComparison.OrdinalIgnoreCase) &&
                !mode.Equals("Credit/UPI", StringComparison.OrdinalIgnoreCase) &&
                !mode.Equals("Card / UPI", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { message = "Advance payment mode must be Cash or Credit/UPI" });

            using var c = db.CreateConnection();
            await c.OpenAsync();
            using var tx = c.BeginTransaction();
            try
            {
                using (var ck = new SqlCommand("SELECT COUNT(*) FROM BtcCompanies WHERE Id=@id AND IsActive=1", c, tx))
                {
                    ck.Parameters.Add(P("@id", x.CompanyId));
                    if (Convert.ToInt32(await ck.ExecuteScalarAsync()) == 0) throw new Exception("Company not found");
                }
                var receiptNo = "BTC-ADV-" + DateTime.Now.ToString("yyyyMMddHHmmssfff");
                long id;
                using (var cmd = new SqlCommand(@"INSERT BtcAdvances(ReceiptNo,CompanyId,Amount,PaymentMode,ReferenceNo,Notes,CreatedBy)
VALUES(@r,@c,@a,@m,@ref,@n,@u);SELECT CAST(SCOPE_IDENTITY() AS bigint)", c, tx))
                {
                    cmd.Parameters.AddRange(new[] { P("@r", receiptNo), P("@c", x.CompanyId), P("@a", amount), P("@m", mode), P("@ref", x.ReferenceNo), P("@n", x.Notes), P("@u", UserName(ctx)) });
                    id = Convert.ToInt64(await cmd.ExecuteScalarAsync());
                }
                using (var ledger = new SqlCommand(@"INSERT BtcCompanyLedger(CompanyId,EntryType,ReferenceType,ReferenceId,ReferenceNo,Debit,Credit,Notes)
VALUES(@c,'ADVANCE','BTC_ADVANCE',@id,@r,0,@a,@n);
INSERT AuditLogs(UserName,Action,Entity,EntityId,Details) VALUES(@u,'BTC_ADVANCE_RECEIVED','Company',@c,@d)", c, tx))
                {
                    ledger.Parameters.AddRange(new[] { P("@c", x.CompanyId), P("@id", id), P("@r", receiptNo), P("@a", amount), P("@n", x.Notes), P("@u", UserName(ctx)), P("@d", $"Advance={amount:0.00}; Mode={mode}") });
                    await ledger.ExecuteNonQueryAsync();
                }
                await tx.CommitAsync();
                return Results.Ok(new { id, receiptNo, amount, paymentMode = mode });
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync();
                return Results.BadRequest(new { message = ex.Message });
            }
        });

        app.MapGet("/api/btc/advances", async (Db db, int? companyId) =>
        {
            var rows = await db.QueryAsync(@"SELECT a.Id,a.ReceiptNo,a.CompanyId,c.CompanyName,a.Amount,a.PaymentMode,a.ReferenceNo,a.Notes,a.CreatedAt,a.CreatedBy
FROM BtcAdvances a JOIN BtcCompanies c ON c.Id=a.CompanyId
WHERE (@cid IS NULL OR a.CompanyId=@cid) ORDER BY a.Id DESC", P("@cid", companyId));
            return Results.Ok(rows);
        });

        app.MapGet("/api/reports/btc-payments", async (Db db, string? from, string? to, string? q, string? type, string? mode) =>
        {
            var f = DateTime.TryParse(from, out var fd) ? fd.Date : DateTime.Today.AddDays(-30);
            var e = DateTime.TryParse(to, out var td) ? td.Date.AddDays(1) : DateTime.Today.AddDays(1);
            var term = (q ?? "").Trim();
            var like = "%" + term + "%";
            var kind = (type ?? "ALL").Trim().ToUpperInvariant();
            var payMode = (mode ?? "ALL").Trim().ToUpperInvariant();
            var rows = await db.QueryAsync(@"
SELECT * FROM (
 SELECT st.SettlementDate TxnDate,'SETTLEMENT' TxnType,st.ReceiptNo,c.CompanyName,c.Phone,c.GstIn,
        st.TotalAmount Amount,st.PaymentMode,st.ReferenceNo,st.Notes,st.CreatedBy
 FROM BtcSettlements st JOIN BtcCompanies c ON c.Id=st.CompanyId
 UNION ALL
 SELECT a.CreatedAt,'ADVANCE',a.ReceiptNo,c.CompanyName,c.Phone,c.GstIn,
        a.Amount,a.PaymentMode,a.ReferenceNo,a.Notes,a.CreatedBy
 FROM BtcAdvances a JOIN BtcCompanies c ON c.Id=a.CompanyId
) x
WHERE x.TxnDate>=@f AND x.TxnDate<@e
  AND (@q='' OR x.CompanyName LIKE @l OR ISNULL(x.Phone,'') LIKE @l OR ISNULL(x.GstIn,'') LIKE @l OR x.ReceiptNo LIKE @l)
  AND (@type='ALL' OR x.TxnType=@type)
  AND (@mode='ALL' OR UPPER(ISNULL(x.PaymentMode,''))=@mode)
ORDER BY x.TxnDate DESC", P("@f", f), P("@e", e), P("@q", term), P("@l", like), P("@type", kind), P("@mode", payMode));
            return Results.Ok(rows);
        });

        app.MapGet("/api/reports/audit-summary", async (Db db, DateTime? from, DateTime? to, string? cashier) =>
        {
            var f=(from??DateTime.Today).Date;
            var t=(to??DateTime.Today).Date;
            if(t<f)(f,t)=(t,f);
            var end=t.AddDays(1);
            var cashierName=(cashier??"").Trim();

            var outlet=await db.QuerySingleAsync(@"SELECT TOP 1 OutletName,Address,Phone,Gstin,State,City FROM OutletMaster ORDER BY Id");
            var summary=await db.QuerySingleAsync(@"
SELECT
 COUNT(*) TicketCount,
 CAST(ISNULL(SUM(SubTotal),0) AS decimal(18,2)) TotalSales,
 CAST(ISNULL(SUM(Discount),0) AS decimal(18,2)) TotalDiscount,
 CAST(ISNULL(SUM(SubTotal-Discount),0) AS decimal(18,2)) NetSales,
 CAST(ISNULL(SUM(Tax),0) AS decimal(18,2)) TotalTax,
 CAST(ISNULL(SUM(RoundOff),0) AS decimal(18,2)) TotalRoundOff,
 CAST(ISNULL(SUM(GrandTotal),0) AS decimal(18,2)) GrandTotal,
 SUM(CASE WHEN Discount>0 THEN 1 ELSE 0 END) DiscountTickets,
 CAST(ISNULL(SUM(CASE WHEN PaymentMode='BTC' THEN PendingAmount ELSE 0 END),0) AS decimal(18,2)) UnsettledAmount,
 (SELECT TOP 1 InvoiceNo FROM Sales s1 WHERE s1.Status='Completed' AND s1.BillDate>=@f AND s1.BillDate<@e AND (@cashier='' OR ISNULL(s1.CashierName,'')=@cashier) ORDER BY s1.BillDate,s1.Id) FirstBillNo,
 (SELECT TOP 1 InvoiceNo FROM Sales s2 WHERE s2.Status='Completed' AND s2.BillDate>=@f AND s2.BillDate<@e AND (@cashier='' OR ISNULL(s2.CashierName,'')=@cashier) ORDER BY s2.BillDate DESC,s2.Id DESC) LastBillNo
FROM Sales s
WHERE s.Status='Completed' AND s.BillDate>=@f AND s.BillDate<@e
 AND (@cashier='' OR ISNULL(s.CashierName,'')=@cashier)",
                P("@f",f),P("@e",end),P("@cashier",cashierName));

            var payments=await db.QueryAsync(@"
WITH PayRows AS(
 SELECT
  CASE
   WHEN UPPER(ISNULL(sp.PaymentMode,''))='BTC' THEN 'Credit Bill'
   WHEN UPPER(ISNULL(sp.PaymentMode,'')) IN ('CREDIT/UPI','CARD / UPI','UPI') THEN ISNULL(NULLIF(sp.PaymentType,''),sp.PaymentMode)
   ELSE ISNULL(NULLIF(sp.PaymentType,''),sp.PaymentMode)
  END PaymentMode,
  sp.Amount
 FROM SalePayments sp
 JOIN Sales s ON s.Id=sp.SaleId
 WHERE s.Status='Completed' AND s.BillDate>=@f AND s.BillDate<@e
  AND (@cashier='' OR ISNULL(s.CashierName,'')=@cashier)
 UNION ALL
 SELECT
  CASE WHEN UPPER(ISNULL(s.PaymentMode,''))='BTC' THEN 'Credit Bill'
       WHEN UPPER(ISNULL(s.PaymentMode,''))='CREDIT/UPI' THEN 'Credit / UPI'
       ELSE ISNULL(NULLIF(s.PaymentMode,''),'Cash') END,
  CASE WHEN UPPER(ISNULL(s.PaymentMode,''))='BTC' THEN s.GrandTotal
       WHEN s.PaidAmount>0 THEN s.PaidAmount ELSE s.GrandTotal END
 FROM Sales s
 WHERE s.Status='Completed' AND s.BillDate>=@f AND s.BillDate<@e
  AND (@cashier='' OR ISNULL(s.CashierName,'')=@cashier)
  AND NOT EXISTS(SELECT 1 FROM SalePayments sp WHERE sp.SaleId=s.Id)
)
SELECT PaymentMode,CAST(SUM(Amount) AS decimal(18,2)) Amount
FROM PayRows
GROUP BY PaymentMode
ORDER BY CASE WHEN PaymentMode='Cash' THEN 0 WHEN PaymentMode='Credit Bill' THEN 1 ELSE 2 END,PaymentMode",
                P("@f",f),P("@e",end),P("@cashier",cashierName));

            var taxes=await db.QueryAsync(@"
SELECT sl.TaxRate,
 CAST(SUM(CASE WHEN ISNULL(sl.TaxMode,'EXCLUSIVE')='INCLUSIVE' AND sl.TaxRate>0
      THEN (sl.Quantity*sl.SalePrice-sl.Discount)*100/(100+sl.TaxRate)
      ELSE (sl.Quantity*sl.SalePrice-sl.Discount) END) AS decimal(18,2)) TaxableAmount,
 CAST(SUM(CASE WHEN sl.TaxRate<=0 THEN 0
      WHEN ISNULL(sl.TaxMode,'EXCLUSIVE')='INCLUSIVE'
      THEN (sl.Quantity*sl.SalePrice-sl.Discount)*sl.TaxRate/(100+sl.TaxRate)
      ELSE (sl.Quantity*sl.SalePrice-sl.Discount)*sl.TaxRate/100 END) AS decimal(18,2)) TaxAmount
FROM SaleLines sl
JOIN Sales s ON s.Id=sl.SaleId
WHERE s.Status='Completed' AND s.BillDate>=@f AND s.BillDate<@e
 AND (@cashier='' OR ISNULL(s.CashierName,'')=@cashier)
GROUP BY sl.TaxRate
HAVING ABS(SUM(CASE WHEN sl.TaxRate<=0 THEN 0
      WHEN ISNULL(sl.TaxMode,'EXCLUSIVE')='INCLUSIVE'
      THEN (sl.Quantity*sl.SalePrice-sl.Discount)*sl.TaxRate/(100+sl.TaxRate)
      ELSE (sl.Quantity*sl.SalePrice-sl.Discount)*sl.TaxRate/100 END))>0.004
ORDER BY sl.TaxRate",
                P("@f",f),P("@e",end),P("@cashier",cashierName));

            var cashiers=await db.QueryAsync(@"
SELECT ISNULL(NULLIF(CashierName,''),'System') Cashier,
 CAST(SUM(GrandTotal) AS decimal(18,2)) Amount,
 CAST(SUM(CASE WHEN PaymentMode='BTC' THEN GrandTotal ELSE 0 END) AS decimal(18,2)) BtcAmount,
 COUNT(*) Tickets
FROM Sales
WHERE Status='Completed' AND BillDate>=@f AND BillDate<@e
 AND (@cashier='' OR ISNULL(CashierName,'')=@cashier)
GROUP BY ISNULL(NULLIF(CashierName,''),'System')
ORDER BY Amount DESC",
                P("@f",f),P("@e",end),P("@cashier",cashierName));

            var audit=await db.QuerySingleAsync(@"
SELECT
 SUM(CASE WHEN Action LIKE '%CANCEL%' OR Action LIKE '%VOID%' THEN 1 ELSE 0 END) CancelActions,
 SUM(CASE WHEN Action LIKE '%MODIF%' OR Action LIKE '%EDIT%' OR Action LIKE '%UPDATE%' THEN 1 ELSE 0 END) ModifyActions
FROM AuditLogs
WHERE CreatedAt>=@f AND CreatedAt<@e
 AND (@cashier='' OR ISNULL(UserName,'')=@cashier)",
                P("@f",f),P("@e",end),P("@cashier",cashierName));

            decimal D(string key)=>summary.TryGetValue(key,out var v)&&v is not null&&v is not DBNull?Convert.ToDecimal(v):0m;
            int I(string key)=>summary.TryGetValue(key,out var v)&&v is not null&&v is not DBNull?Convert.ToInt32(v):0;
            var tickets=I("TicketCount");
            return Results.Ok(new{
                outlet,
                from=f,
                to=t,
                printDateTime=DateTime.Now,
                cashier=cashierName,
                sales=new{
                    firstBillNo=summary.GetValueOrDefault("FirstBillNo")?.ToString(),
                    lastBillNo=summary.GetValueOrDefault("LastBillNo")?.ToString(),
                    ticketCount=tickets,
                    grossApc=tickets>0?Math.Round(D("TotalSales")/tickets,2):0,
                    netApc=tickets>0?Math.Round(D("NetSales")/tickets,2):0,
                    totalSales=D("TotalSales"),
                    totalDiscount=D("TotalDiscount"),
                    discountTickets=I("DiscountTickets"),
                    netSales=D("NetSales"),
                    totalTax=D("TotalTax"),
                    totalRoundOff=D("TotalRoundOff"),
                    grandTotal=D("GrandTotal"),
                    unsettledAmount=D("UnsettledAmount")
                },
                payments,
                taxes,
                cashiers,
                audit
            });
        });
    }

    static async Task<List<ProductLookup>> LoadProductsAsync(Db db)
    {
        var rows = await db.QueryAsync(@"SELECT p.Id,p.Name,p.Barcode,p.Sku,p.Mrp,p.PurchasePrice,p.SalePrice,
CAST(ISNULL((SELECT SUM(b.Quantity) FROM ProductBatches b WHERE b.ProductId=p.Id),0) AS decimal(18,3)) Stock
FROM Products p WHERE p.IsActive=1");
        return rows.Select(x => new ProductLookup(
            Convert.ToInt32(x["Id"]),
            x["Name"]?.ToString() ?? "",
            x["Barcode"]?.ToString() ?? "",
            x["Sku"]?.ToString() ?? "",
            Convert.ToDecimal(x["Mrp"] ?? 0m),
            Convert.ToDecimal(x["PurchasePrice"] ?? 0m),
            Convert.ToDecimal(x["SalePrice"] ?? 0m),
            Convert.ToDecimal(x["Stock"] ?? 0m))).ToList();
    }

    static ProductLookup? MatchProduct(Dictionary<string, string> row, List<ProductLookup> products)
    {
        var barcode = Get(row, "barcode", "itemcode", "code");
        var sku = Get(row, "sku");
        var name = Get(row, "itemname", "name", "product", "item");
        if (!string.IsNullOrWhiteSpace(barcode))
        {
            var p = products.FirstOrDefault(x => x.Barcode.Equals(barcode, StringComparison.OrdinalIgnoreCase));
            if (p is not null) return p;
        }
        if (!string.IsNullOrWhiteSpace(sku))
        {
            var p = products.FirstOrDefault(x => x.Sku.Equals(sku, StringComparison.OrdinalIgnoreCase));
            if (p is not null) return p;
        }
        if (!string.IsNullOrWhiteSpace(name))
            return products.FirstOrDefault(x => x.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
        return null;
    }

    static OpeningPreviewRow BuildOpeningPreview(Dictionary<string, string> r, int rowNo, List<ProductLookup> products)
    {
        var p = MatchProduct(r, products);
        var qty = Dec(Get(r, "openingqty", "qty", "quantity", "stock", "openingstock"));
        var cost = Dec(Get(r, "costprice", "purchaseprice", "cost", "purchase"));
        var sale = Dec(Get(r, "saleprice", "sellingprice", "sale", "selling"));
        var mrp = Dec(Get(r, "mrp"));
        var expiryText = Get(r, "expirydate", "expiry", "expdate");
        DateTime? expiry = null;
        if (DateTime.TryParse(expiryText, CultureInfo.InvariantCulture, DateTimeStyles.None, out var ed) ||
            DateTime.TryParse(expiryText, CultureInfo.GetCultureInfo("en-IN"), DateTimeStyles.None, out ed)) expiry = ed.Date;
        return new OpeningPreviewRow(rowNo, p?.Id ?? 0, p?.Name ?? Get(r, "itemname", "name", "product", "item"), p?.Barcode ?? Get(r, "barcode", "itemcode", "code"),
            Get(r, "batchno", "batch", "lotno"), qty, cost > 0 ? cost : p?.PurchasePrice ?? 0, sale > 0 ? sale : p?.SalePrice ?? 0, mrp > 0 ? mrp : p?.Mrp ?? 0,
            expiry?.ToString("yyyy-MM-dd"), p?.Stock ?? 0, p is not null && qty > 0, p is null ? "Item not matched" : qty <= 0 ? "Quantity must be greater than 0" : "");
    }

    static RatePreviewRow BuildRatePreview(Dictionary<string, string> r, int rowNo, List<ProductLookup> products)
    {
        var p = MatchProduct(r, products);
        var mrp = NullableDec(Get(r, "mrp"));
        var purchase = NullableDec(Get(r, "purchaseprice", "costprice", "purchase", "cost"));
        var sale = NullableDec(Get(r, "saleprice", "sellingprice", "sale", "selling"));
        var any = (mrp ?? 0) > 0 || (purchase ?? 0) > 0 || (sale ?? 0) > 0;
        return new RatePreviewRow(rowNo, p?.Id ?? 0, p?.Name ?? Get(r, "itemname", "name", "product", "item"), p?.Barcode ?? Get(r, "barcode", "itemcode", "code"),
            p?.Mrp ?? 0, p?.PurchasePrice ?? 0, p?.SalePrice ?? 0, mrp, purchase, sale, p is not null && any,
            p is null ? "Item not matched" : !any ? "No MRP/Purchase/Sale rate found" : "");
    }

    static async Task<ParsedUpload> ParseUploadAsync(HttpRequest req)
    {
        if (!req.HasFormContentType) return new ParsedUpload(null, new(), "Use multipart/form-data");
        var form = await req.ReadFormAsync();
        var file = form.Files.FirstOrDefault();
        if (file is null || file.Length <= 0) return new ParsedUpload(null, new(), "Choose an Excel or CSV file");
        if (file.Length > 15 * 1024 * 1024) return new ParsedUpload(file.FileName, new(), "File is too large. Maximum 15 MB.");

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        try
        {
            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);
            ms.Position = 0;
            if (ext is ".xlsx" or ".xls")
            {
                using var wb = WorkbookFactory.Create(ms);
                var sheet = wb.NumberOfSheets > 0 ? wb.GetSheetAt(0) : null;
                if (sheet is null) return new ParsedUpload(file.FileName, new(), "Workbook has no sheet");
                var formatter = new DataFormatter(CultureInfo.InvariantCulture);
                var headerRow = sheet.GetRow(sheet.FirstRowNum);
                if (headerRow is null) return new ParsedUpload(file.FileName, new(), "Header row not found");
                var headers = new List<string>();
                for (var i = headerRow.FirstCellNum; i < headerRow.LastCellNum; i++)
                    headers.Add(Normalize(formatter.FormatCellValue(headerRow.GetCell(i))));
                var rows = new List<Dictionary<string, string>>();
                for (var rn = sheet.FirstRowNum + 1; rn <= sheet.LastRowNum; rn++)
                {
                    var row = sheet.GetRow(rn);
                    if (row is null) continue;
                    var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    var nonEmpty = false;
                    for (var ci = 0; ci < headers.Count; ci++)
                    {
                        var key = headers[ci];
                        if (string.IsNullOrWhiteSpace(key)) continue;
                        var value = formatter.FormatCellValue(row.GetCell(ci)).Trim();
                        if (!string.IsNullOrWhiteSpace(value)) nonEmpty = true;
                        d[key] = value;
                    }
                    if (nonEmpty) rows.Add(d);
                }
                return new ParsedUpload(file.FileName, rows, null);
            }
            if (ext is ".csv" or ".txt")
            {
                using var sr = new StreamReader(ms, Encoding.UTF8, true);
                var first = await sr.ReadLineAsync();
                if (string.IsNullOrWhiteSpace(first)) return new ParsedUpload(file.FileName, new(), "Header row not found");
                var headers = CsvSplit(first).Select(Normalize).ToList();
                var rows = new List<Dictionary<string, string>>();
                string? line;
                while ((line = await sr.ReadLineAsync()) is not null)
                {
                    if (string.IsNullOrWhiteSpace(line)) continue;
                    var vals = CsvSplit(line);
                    var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    for (var i = 0; i < headers.Count; i++) if (!string.IsNullOrWhiteSpace(headers[i])) d[headers[i]] = i < vals.Count ? vals[i].Trim() : "";
                    rows.Add(d);
                }
                return new ParsedUpload(file.FileName, rows, null);
            }
            if (ext == ".pdf")
            {
                var rows = ParsePdfTable(ms.ToArray());
                if (rows.Count == 0) return new ParsedUpload(file.FileName, new(), "PDF text/table could not be read. Use a searchable text PDF (not a scanned image) or Excel.");
                return new ParsedUpload(file.FileName, rows, null);
            }
            return new ParsedUpload(file.FileName, new(), "Only .xlsx, .xls, .csv and searchable .pdf are supported here");
        }
        catch (Exception ex) { return new ParsedUpload(file.FileName, new(), ex.Message); }
    }

    static List<Dictionary<string, string>> ParsePdfTable(byte[] bytes)
    {
        var lines = new List<string>();
        using (var pdf = PdfDocument.Open(bytes))
        {
            foreach (var page in pdf.GetPages())
            {
                var text = ContentOrderTextExtractor.GetText(page) ?? "";
                lines.AddRange(text.Replace("\r", "\n").Split('\n').Select(x => x.TrimEnd()).Where(x => !string.IsNullOrWhiteSpace(x)));
            }
        }
        if (lines.Count == 0) return new();

        var headerIndex = -1;
        List<string> headers = new();
        for (var i = 0; i < lines.Count; i++)
        {
            var cells = PdfCells(lines[i]);
            var normalized = cells.Select(Normalize).ToList();
            var joined = string.Join(" ", normalized);
            if ((joined.Contains("item") || joined.Contains("name") || joined.Contains("barcode") || joined.Contains("sku")) &&
                (joined.Contains("mrp") || joined.Contains("purchase") || joined.Contains("sale") || joined.Contains("selling")))
            {
                headerIndex = i;
                headers = cells.Select(Normalize).ToList();
                break;
            }
        }

        var result = new List<Dictionary<string, string>>();
        if (headerIndex >= 0 && headers.Count >= 2)
        {
            for (var i = headerIndex + 1; i < lines.Count; i++)
            {
                var cells = PdfCells(lines[i]);
                if (cells.Count < 2) continue;
                var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                for (var j = 0; j < headers.Count; j++)
                {
                    if (string.IsNullOrWhiteSpace(headers[j])) continue;
                    d[headers[j]] = j < cells.Count ? cells[j].Trim() : "";
                }
                if (d.Values.Any(v => !string.IsNullOrWhiteSpace(v))) result.Add(d);
            }
            if (result.Count > 0) return result;
        }

        // Fallback for simple PDF rate sheets: [barcode/item text] [MRP] [purchase] [sale].
        foreach (var line in lines)
        {
            var tokens = Regex.Split(line.Trim(), @"\s+").Where(x => !string.IsNullOrWhiteSpace(x)).ToList();
            if (tokens.Count < 4) continue;
            var numeric = new List<(int Index, string Value)>();
            for (var i = 0; i < tokens.Count; i++)
            {
                var raw = tokens[i].Replace("₹", "").Replace(",", "");
                if (decimal.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out _)) numeric.Add((i, raw));
            }
            if (numeric.Count < 3) continue;
            var tail = numeric.TakeLast(3).ToList();
            if (tail[0].Index < 1) continue;
            var prefix = tokens.Take(tail[0].Index).ToList();
            var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["mrp"] = tail[0].Value,
                ["purchaseprice"] = tail[1].Value,
                ["saleprice"] = tail[2].Value
            };
            if (prefix.Count > 0 && Regex.IsMatch(prefix[0], @"^\d{6,}$"))
            {
                d["barcode"] = prefix[0];
                d["itemname"] = string.Join(" ", prefix.Skip(1));
            }
            else d["itemname"] = string.Join(" ", prefix);
            if (!string.IsNullOrWhiteSpace(d.GetValueOrDefault("itemname")) || !string.IsNullOrWhiteSpace(d.GetValueOrDefault("barcode"))) result.Add(d);
        }
        return result;
    }

    static List<string> PdfCells(string line)
    {
        if (line.Contains('|')) return line.Split('|').Select(x => x.Trim()).Where(x => x.Length > 0).ToList();
        var cells = Regex.Split(line.Trim(), @"\t+|\s{2,}").Select(x => x.Trim()).Where(x => x.Length > 0).ToList();
        return cells.Count > 1 ? cells : Regex.Split(line.Trim(), @"\s+").Where(x => x.Length > 0).ToList();
    }

    static List<string> CsvSplit(string line)
    {
        var list = new List<string>();
        var sb = new StringBuilder();
        var quoted = false;
        for (var i = 0; i < line.Length; i++)
        {
            var ch = line[i];
            if (ch == '"')
            {
                if (quoted && i + 1 < line.Length && line[i + 1] == '"') { sb.Append('"'); i++; }
                else quoted = !quoted;
            }
            else if (ch == ',' && !quoted) { list.Add(sb.ToString()); sb.Clear(); }
            else sb.Append(ch);
        }
        list.Add(sb.ToString());
        return list;
    }

    static string Normalize(string? s) => new string((s ?? "").Trim().ToLowerInvariant().Where(char.IsLetterOrDigit).ToArray());
    static string Get(Dictionary<string, string> r, params string[] keys)
    {
        foreach (var k in keys) if (r.TryGetValue(Normalize(k), out var v) && !string.IsNullOrWhiteSpace(v)) return v.Trim();
        return "";
    }
    static decimal Dec(string? s) => decimal.TryParse((s ?? "").Replace(",", ""), NumberStyles.Any, CultureInfo.InvariantCulture, out var v) ? Math.Max(0, v) : 0;
    static decimal? NullableDec(string? s) => string.IsNullOrWhiteSpace(s) ? null : Dec(s);

    sealed record ProductLookup(int Id, string Name, string Barcode, string Sku, decimal Mrp, decimal PurchasePrice, decimal SalePrice, decimal Stock);
    sealed record ParsedUpload(string? FileName, List<Dictionary<string, string>> Rows, string? Error);
    public record OpeningPreviewRow(int RowNo, int ProductId, string ItemName, string Barcode, string BatchNo, decimal Quantity, decimal CostPrice, decimal SalePrice, decimal Mrp, string? ExpiryDate, decimal CurrentStock, bool Selected, string Error);
    public record RatePreviewRow(int RowNo, int ProductId, string ItemName, string Barcode, decimal CurrentMrp, decimal CurrentPurchase, decimal CurrentSale, decimal? Mrp, decimal? PurchasePrice, decimal? SalePrice, bool Selected, string Error);
    public record RateApplyRow(int ProductId, decimal? Mrp, decimal? PurchasePrice, decimal? SalePrice);
    public record RateApplyRequest(List<RateApplyRow> Rows);
    public record CategoryEditRequest(string? Name, string? OldName);
    public record CustomerEditRequest(string? Name, string? Phone, string? Address, string? GstIn, decimal OpeningBalance);
    public record BtcAdvanceRequest(int CompanyId, decimal Amount, string? PaymentMode, string? ReferenceNo, string? Notes);
}
