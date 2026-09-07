using Microsoft.Data.SqlClient;
using SuvidhaPOS.Premium.Data;

namespace SuvidhaPOS.Premium;

public static class PremiumFeatureModules
{
    static SqlParameter P(string n, object? v) => new(n, v ?? DBNull.Value);

    public static void Map(WebApplication app)
    {
        app.MapPost("/api/premium/sales", async (Db db, HttpContext ctx, PremiumSaleRequest x) =>
        {
            if (x.Lines is null || x.Lines.Count == 0) return Results.BadRequest(new { message = "Add item first" });

            var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Cash", "Credit/UPI", "BTC", "Multi Mode" };
            var paymentMode = string.IsNullOrWhiteSpace(x.PaymentMode) ? "Cash" : x.PaymentMode.Trim();
            if (!allowed.Contains(paymentMode)) return Results.BadRequest(new { message = "Payment mode must be Cash, Credit/UPI, BTC or Multi Mode" });

            var discountType = string.Equals(x.DiscountType, "PERCENT", StringComparison.OrdinalIgnoreCase) ? "PERCENT" : "RUPEES";
            var discountValue = Math.Max(0, x.DiscountValue);
            var session = ctx.Items["User"];
            var cashier = session?.GetType().GetProperty("UserName")?.GetValue(session)?.ToString() ?? "Unknown";

            using var c = db.CreateConnection();
            await c.OpenAsync();
            using var tx = c.BeginTransaction();
            try
            {
                foreach (var l in x.Lines)
                {
                    if (l.Qty <= 0) return Results.BadRequest(new { message = "Quantity must be greater than zero" });
                    var ck = new SqlCommand("SELECT ISNULL(SUM(Quantity),0) FROM ProductBatches WHERE ProductId=@p AND Quantity>0 AND ExpiryDate>=CAST(GETDATE() AS date)", c, tx);
                    ck.Parameters.Add(P("@p", l.ProductId));
                    if (Convert.ToDecimal(await ck.ExecuteScalarAsync()) < l.Qty)
                        return Results.BadRequest(new { message = "Insufficient saleable stock for product " + l.ProductId });
                }

                decimal sub = x.Lines.Sum(a => a.Qty * a.SalePrice);
                decimal tax = x.Lines.Sum(a => a.Qty * a.SalePrice * a.TaxRate / 100m);
                decimal discount = discountType == "PERCENT" ? sub * Math.Min(100m, discountValue) / 100m : discountValue;
                discount = Math.Min(discount, sub + tax);
                decimal total = Math.Max(0, sub - discount + tax);
                decimal cost = 0;

                var payments = x.Payments ?? new List<PremiumPaymentRequest>();
                decimal paid = x.PaidAmount;
                if (payments.Count > 0)
                    paid = payments.Where(p => !string.Equals(p.Type, "Credit", StringComparison.OrdinalIgnoreCase)).Sum(p => Math.Max(0, p.Amount));
                else if (paymentMode.Equals("Cash", StringComparison.OrdinalIgnoreCase) || paymentMode.Equals("BTC", StringComparison.OrdinalIgnoreCase))
                    paid = total;

                var invoiceNo = "INV-" + DateTime.Now.ToString("yyyyMMddHHmmssfff");
                var cmd = new SqlCommand(@"INSERT Sales(InvoiceNo,BillDate,CustomerId,CustomerName,PaymentMode,SubTotal,Discount,DiscountType,DiscountValue,Tax,GrandTotal,TotalCost,PaidAmount,Notes,CashierName)
VALUES(@i,GETDATE(),@cid,@cn,@pm,@sub,@d,@dt,@dv,@t,@g,0,@paid,@notes,@cashier);
SELECT CAST(SCOPE_IDENTITY() AS int);", c, tx);
                cmd.Parameters.AddRange(new[] {
                    P("@i",invoiceNo),P("@cid",x.CustomerId),P("@cn",x.CustomerName??"Walk-in Customer"),P("@pm",paymentMode),
                    P("@sub",sub),P("@d",discount),P("@dt",discountType),P("@dv",discountValue),P("@t",tax),P("@g",total),
                    P("@paid",Math.Min(total,Math.Max(0,paid))),P("@notes",x.Notes),P("@cashier",cashier)
                });
                int sid = (int)await cmd.ExecuteScalarAsync();

                foreach (var l in x.Lines)
                {
                    decimal rem = l.Qty;
                    while (rem > 0)
                    {
                        cmd = new SqlCommand("SELECT TOP 1 Id,Quantity,CostPrice FROM ProductBatches WITH(UPDLOCK,ROWLOCK) WHERE ProductId=@p AND Quantity>0 AND ExpiryDate>=CAST(GETDATE() AS date) ORDER BY ExpiryDate,Id", c, tx);
                        cmd.Parameters.Add(P("@p", l.ProductId));
                        using var r = await cmd.ExecuteReaderAsync();
                        if (!await r.ReadAsync()) throw new Exception("Stock changed during billing");
                        int bid = r.GetInt32(0);
                        decimal avail = r.GetDecimal(1), cp = r.GetDecimal(2);
                        await r.CloseAsync();
                        decimal take = Math.Min(rem, avail);
                        cost += take * cp;

                        cmd = new SqlCommand(@"UPDATE ProductBatches SET Quantity=Quantity-@q WHERE Id=@b;
INSERT SaleLines(SaleId,ProductId,BatchId,Quantity,SalePrice,CostPrice,TaxRate,Discount) VALUES(@s,@p,@b,@q,@sp,@cp,@tr,@di);
INSERT StockLedger(ProductId,BatchId,MovementType,Quantity,ReferenceType,ReferenceId) VALUES(@p,@b,'SALE',-@q,'SALE',@s)", c, tx);
                        cmd.Parameters.AddRange(new[] { P("@q",take),P("@b",bid),P("@s",sid),P("@p",l.ProductId),P("@sp",l.SalePrice),P("@cp",cp),P("@tr",l.TaxRate),P("@di",l.Discount) });
                        await cmd.ExecuteNonQueryAsync();
                        rem -= take;
                    }
                }

                cmd = new SqlCommand("UPDATE Sales SET TotalCost=@c WHERE Id=@id", c, tx);
                cmd.Parameters.AddRange(new[] { P("@c",cost),P("@id",sid) });
                await cmd.ExecuteNonQueryAsync();

                if (payments.Count == 0)
                    payments.Add(new PremiumPaymentRequest(paymentMode, paymentMode, total, null));

                foreach (var p in payments.Where(p => p.Amount > 0))
                {
                    cmd = new SqlCommand("INSERT SalePayments(SaleId,PaymentMode,PaymentType,Amount,ReferenceNo) VALUES(@s,@m,@t,@a,@r)", c, tx);
                    cmd.Parameters.AddRange(new[] { P("@s",sid),P("@m",p.Mode),P("@t",p.Type),P("@a",p.Amount),P("@r",p.ReferenceNo) });
                    await cmd.ExecuteNonQueryAsync();
                }

                cmd = new SqlCommand("INSERT AuditLogs(UserName,Action,Entity,EntityId,Details) VALUES(@u,'SALE_CREATED','Sale',@id,@d)", c, tx);
                cmd.Parameters.AddRange(new[] { P("@u",cashier),P("@id",sid),P("@d",$"Payment={paymentMode}; Discount={discountType}:{discountValue}; Total={total}") });
                await cmd.ExecuteNonQueryAsync();

                await tx.CommitAsync();
                return Results.Ok(new { id=sid, total, invoiceNo, discount, paymentMode, cashier });
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync();
                return Results.BadRequest(new { message = ex.Message });
            }
        });

        app.MapGet("/api/opening-stock-master", async (Db db, DateTime? from, DateTime? to) =>
        {
            var f=(from??DateTime.Today.AddYears(-10)).Date;
            var e=(to??DateTime.Today).Date.AddDays(1);
            return Results.Ok(await db.QueryAsync(@"SELECT l.Id,l.CreatedAt,p.Name,p.Barcode,p.Category,b.BatchNo,
CAST(l.Quantity AS decimal(18,3)) Quantity,b.CostPrice,b.SellingPrice,b.Mrp,b.ExpiryDate,l.Notes
FROM StockLedger l JOIN Products p ON p.Id=l.ProductId LEFT JOIN ProductBatches b ON b.Id=l.BatchId
WHERE l.MovementType='OPENING' AND l.CreatedAt>=@f AND l.CreatedAt<@e ORDER BY l.Id DESC",P("@f",f),P("@e",e)));
        });

        app.MapPost("/api/opening-stock-master", async (Db db, HttpContext ctx, OpeningStockRequest x) =>
        {
            if (x.Lines is null || x.Lines.Count == 0) return Results.BadRequest(new { message = "Add opening stock items" });
            var session=ctx.Items["User"];
            var user=session?.GetType().GetProperty("UserName")?.GetValue(session)?.ToString()??"Unknown";
            var asOn=(x.AsOnDate??DateTime.Today).Date.AddHours(9);
            using var c=db.CreateConnection(); await c.OpenAsync(); using var tx=c.BeginTransaction();
            try
            {
                foreach(var l in x.Lines)
                {
                    if(l.ProductId<=0 || l.Quantity<=0) throw new Exception("Product and positive quantity are required");
                    var expiry=l.ExpiryDate??new DateTime(2099,12,31);
                    var batch=string.IsNullOrWhiteSpace(l.BatchNo) ? "OPEN-"+DateTime.Now.ToString("yyyyMMddHHmmssfff") : l.BatchNo.Trim();
                    var cmd=new SqlCommand(@"INSERT ProductBatches(ProductId,BatchNo,Quantity,CostPrice,SellingPrice,Mrp,ExpiryDate) OUTPUT INSERTED.Id
VALUES(@p,@b,@q,@c,@s,@m,@e)",c,tx);
                    cmd.Parameters.AddRange(new[]{P("@p",l.ProductId),P("@b",batch),P("@q",l.Quantity),P("@c",l.CostPrice),P("@s",l.SalePrice),P("@m",l.Mrp),P("@e",expiry)});
                    int bid=(int)await cmd.ExecuteScalarAsync();
                    cmd=new SqlCommand(@"INSERT StockLedger(ProductId,BatchId,MovementType,Quantity,ReferenceType,ReferenceId,Notes,CreatedAt)
VALUES(@p,@b,'OPENING',@q,'OPENING',@b,@n,@d)",c,tx);
                    cmd.Parameters.AddRange(new[]{P("@p",l.ProductId),P("@b",bid),P("@q",l.Quantity),P("@n",x.Notes),P("@d",asOn)});
                    await cmd.ExecuteNonQueryAsync();
                }
                var audit=new SqlCommand("INSERT AuditLogs(UserName,Action,Entity,Details) VALUES(@u,'OPENING_STOCK_POSTED','Inventory',@d)",c,tx);
                audit.Parameters.AddRange(new[]{P("@u",user),P("@d",$"{x.Lines.Count} opening stock line(s) as on {asOn:yyyy-MM-dd}")});
                await audit.ExecuteNonQueryAsync();
                await tx.CommitAsync();
                return Results.Ok(new{posted=x.Lines.Count});
            }
            catch(Exception ex){await tx.RollbackAsync();return Results.BadRequest(new{message=ex.Message});}
        });

        app.MapGet("/api/premium-reports/{type}", async (Db db, string type, DateTime? from, DateTime? to, string? q=null) =>
        {
            var f=(from??DateTime.Today).Date; var e=(to??DateTime.Today).Date.AddDays(1);
            if(e<=f)e=f.AddDays(1);
            var term=q?.Trim()??""; var like="%"+term+"%"; var key=type.Trim().ToLowerInvariant();
            string sql;
            switch(key)
            {
                case "account-report":
                    sql=@"SELECT * FROM (
SELECT s.BillDate TxnDate,'SALE' EntryType,s.InvoiceNo ReferenceNo,s.CustomerName Party,CAST(0 AS decimal(18,2)) Debit,s.GrandTotal Credit,s.PaymentMode,ISNULL(s.Notes,'') Narration FROM Sales s WHERE s.Status='Completed'
UNION ALL SELECT p.PurchaseDate,'PURCHASE',p.InvoiceNo,p.SupplierName,p.GrandTotal,0,p.PaymentMode,ISNULL(p.Notes,'') FROM Purchases p
UNION ALL SELECT e.ExpenseDate,'EXPENSE','EXP-'+CAST(e.Id AS varchar(20)),e.Category,e.Amount,0,e.PaymentMode,ISNULL(e.Notes,'') FROM Expenses e
UNION ALL SELECT cp.PaymentDate,'CUSTOMER RECEIPT','CR-'+CAST(cp.Id AS varchar(20)),c.Name,0,cp.Amount,cp.PaymentMode,ISNULL(cp.Notes,'') FROM CustomerPayments cp JOIN Customers c ON c.Id=cp.CustomerId
UNION ALL SELECT sp.PaymentDate,'SUPPLIER PAYMENT','SP-'+CAST(sp.Id AS varchar(20)),s.Name,sp.Amount,0,sp.PaymentMode,ISNULL(sp.Notes,'') FROM SupplierPayments sp JOIN Suppliers s ON s.Id=sp.SupplierId
) x WHERE x.TxnDate>=@f AND x.TxnDate<@e AND (@q='' OR x.ReferenceNo LIKE @like OR x.Party LIKE @like OR x.EntryType LIKE @like) ORDER BY x.TxnDate DESC"; break;
                case "daily-sale-bill-wise":
                    sql=@"SELECT s.BillDate,s.InvoiceNo,s.CustomerName,ISNULL(s.CashierName,'Unknown') Cashier,s.PaymentMode,s.SubTotal,s.Discount,s.DiscountType,s.DiscountValue,s.Tax,s.GrandTotal,s.PaidAmount
FROM Sales s WHERE s.Status='Completed' AND s.BillDate>=@f AND s.BillDate<@e AND (@q='' OR s.InvoiceNo LIKE @like OR s.CustomerName LIKE @like) ORDER BY s.BillDate DESC"; break;
                case "cashier-report":
                    sql=@"SELECT ISNULL(s.CashierName,'Unknown') Cashier,s.PaymentMode,COUNT(*) Bills,CAST(SUM(s.GrandTotal) AS decimal(18,2)) SaleAmount,CAST(SUM(s.PaidAmount) AS decimal(18,2)) Collected,CAST(SUM(s.Discount) AS decimal(18,2)) Discount
FROM Sales s WHERE s.Status='Completed' AND s.BillDate>=@f AND s.BillDate<@e GROUP BY ISNULL(s.CashierName,'Unknown'),s.PaymentMode ORDER BY Cashier,SaleAmount DESC"; break;
                case "date-wise-summary":
                case "date-wise-sale-summary":
                    sql=@"SELECT CAST(s.BillDate AS date) [Date],COUNT(*) Bills,CAST(SUM(s.SubTotal) AS decimal(18,2)) SubTotal,CAST(SUM(s.Discount) AS decimal(18,2)) Discount,CAST(SUM(s.Tax) AS decimal(18,2)) Tax,CAST(SUM(s.GrandTotal) AS decimal(18,2)) Sales,CAST(SUM(s.GrandTotal-s.Tax-s.TotalCost) AS decimal(18,2)) Profit
FROM Sales s WHERE s.Status='Completed' AND s.BillDate>=@f AND s.BillDate<@e GROUP BY CAST(s.BillDate AS date) ORDER BY [Date] DESC"; break;
                case "bill-modification":
                    sql=@"SELECT CreatedAt,UserName,Action,Entity,EntityId,Details FROM AuditLogs WHERE CreatedAt>=@f AND CreatedAt<@e AND (Entity='Sale' OR Action LIKE '%SALE%' OR Action LIKE '%BILL%' OR Action LIKE '%VOID%') AND (@q='' OR ISNULL(UserName,'') LIKE @like OR Action LIKE @like OR ISNULL(Details,'') LIKE @like) ORDER BY CreatedAt DESC"; break;
                case "utility-report":
                    sql=@"SELECT CreatedAt,UserName,Action,Entity,EntityId,Details FROM AuditLogs WHERE CreatedAt>=@f AND CreatedAt<@e AND (Entity IS NULL OR Entity<>'Sale') AND (@q='' OR ISNULL(UserName,'') LIKE @like OR Action LIKE @like OR ISNULL(Entity,'') LIKE @like OR ISNULL(Details,'') LIKE @like) ORDER BY CreatedAt DESC"; break;
                case "item-wise-report":
                    sql=@"SELECT p.Name,p.Barcode,p.Category,p.Hsn,CAST(SUM(sl.Quantity) AS decimal(18,3)) Qty,CAST(SUM(sl.Quantity*sl.SalePrice) AS decimal(18,2)) Sales,CAST(SUM(sl.Discount) AS decimal(18,2)) LineDiscount,CAST(SUM(sl.Quantity*sl.SalePrice*sl.TaxRate/100) AS decimal(18,2)) Tax,CAST(SUM(sl.Quantity*(sl.SalePrice-sl.CostPrice)) AS decimal(18,2)) GrossProfit
FROM SaleLines sl JOIN Sales s ON s.Id=sl.SaleId JOIN Products p ON p.Id=sl.ProductId WHERE s.Status='Completed' AND s.BillDate>=@f AND s.BillDate<@e AND (@q='' OR p.Name LIKE @like OR ISNULL(p.Barcode,'') LIKE @like) GROUP BY p.Name,p.Barcode,p.Category,p.Hsn ORDER BY Sales DESC"; break;
                case "profit-loss":
                    sql=@"SELECT Sales,CostOfSales,SalesReturns,Expenses,CAST(Sales-CostOfSales AS decimal(18,2)) GrossProfit,CAST(Sales-CostOfSales-SalesReturns-Expenses AS decimal(18,2)) NetProfit FROM (
SELECT CAST(ISNULL((SELECT SUM(GrandTotal) FROM Sales WHERE Status='Completed' AND BillDate>=@f AND BillDate<@e),0) AS decimal(18,2)) Sales,
CAST(ISNULL((SELECT SUM(TotalCost) FROM Sales WHERE Status='Completed' AND BillDate>=@f AND BillDate<@e),0) AS decimal(18,2)) CostOfSales,
CAST(ISNULL((SELECT SUM(GrandTotal) FROM SalesReturns WHERE ReturnDate>=@f AND ReturnDate<@e),0) AS decimal(18,2)) SalesReturns,
CAST(ISNULL((SELECT SUM(Amount) FROM Expenses WHERE ExpenseDate>=@f AND ExpenseDate<@e),0) AS decimal(18,2)) Expenses) x"; break;
                case "bill-customer-report":
                    sql=@"SELECT s.BillDate,s.InvoiceNo,s.CustomerName,c.Phone,c.GstIn,s.PaymentMode,s.GrandTotal,s.PaidAmount,CAST(s.GrandTotal-s.PaidAmount AS decimal(18,2)) Balance
FROM Sales s LEFT JOIN Customers c ON c.Id=s.CustomerId WHERE s.Status='Completed' AND s.BillDate>=@f AND s.BillDate<@e AND (@q='' OR s.InvoiceNo LIKE @like OR s.CustomerName LIKE @like OR ISNULL(c.Phone,'') LIKE @like) ORDER BY s.CustomerName,s.BillDate DESC"; break;
                case "category-wise-sale":
                    sql=@"SELECT ISNULL(NULLIF(p.Category,''),'Uncategorised') Category,COUNT(DISTINCT s.Id) Bills,CAST(SUM(sl.Quantity) AS decimal(18,3)) Qty,CAST(SUM(sl.Quantity*sl.SalePrice) AS decimal(18,2)) Sales,CAST(SUM(sl.Quantity*sl.SalePrice*sl.TaxRate/100) AS decimal(18,2)) Tax
FROM SaleLines sl JOIN Sales s ON s.Id=sl.SaleId JOIN Products p ON p.Id=sl.ProductId WHERE s.Status='Completed' AND s.BillDate>=@f AND s.BillDate<@e GROUP BY ISNULL(NULLIF(p.Category,''),'Uncategorised') ORDER BY Sales DESC"; break;
                case "category-wise-monthly-sale":
                    sql=@"SELECT CONVERT(char(7),s.BillDate,120) [Month],ISNULL(NULLIF(p.Category,''),'Uncategorised') Category,CAST(SUM(sl.Quantity) AS decimal(18,3)) Qty,CAST(SUM(sl.Quantity*sl.SalePrice) AS decimal(18,2)) Sales
FROM SaleLines sl JOIN Sales s ON s.Id=sl.SaleId JOIN Products p ON p.Id=sl.ProductId WHERE s.Status='Completed' AND s.BillDate>=@f AND s.BillDate<@e GROUP BY CONVERT(char(7),s.BillDate,120),ISNULL(NULLIF(p.Category,''),'Uncategorised') ORDER BY [Month] DESC,Sales DESC"; break;
                case "hsn-wise-sale":
                    sql=@"SELECT ISNULL(NULLIF(p.Hsn,''),'NO-HSN') HSN,sl.TaxRate GSTPercent,CAST(SUM(sl.Quantity) AS decimal(18,3)) Qty,CAST(SUM(sl.Quantity*sl.SalePrice-sl.Discount) AS decimal(18,2)) TaxableValue,CAST(SUM((sl.Quantity*sl.SalePrice-sl.Discount)*sl.TaxRate/100) AS decimal(18,2)) GSTAmount
FROM SaleLines sl JOIN Sales s ON s.Id=sl.SaleId JOIN Products p ON p.Id=sl.ProductId WHERE s.Status='Completed' AND s.BillDate>=@f AND s.BillDate<@e GROUP BY ISNULL(NULLIF(p.Hsn,''),'NO-HSN'),sl.TaxRate ORDER BY HSN,sl.TaxRate"; break;
                case "purchase-register":
                    sql=@"SELECT p.PurchaseDate,p.InvoiceNo,p.SupplierName,p.PaymentMode,p.SubTotal,p.Discount,p.Tax,p.GrandTotal,p.PaidAmount,CAST(p.GrandTotal-p.PaidAmount AS decimal(18,2)) Balance
FROM Purchases p WHERE p.PurchaseDate>=@f AND p.PurchaseDate<@e AND (@q='' OR p.InvoiceNo LIKE @like OR p.SupplierName LIKE @like) ORDER BY p.PurchaseDate DESC"; break;
                case "bill-detail":
                    sql=@"SELECT s.BillDate,s.InvoiceNo,s.CustomerName,p.Name ItemName,p.Barcode,p.Hsn,p.Category,sl.Quantity,sl.SalePrice,sl.Discount LineDiscount,sl.TaxRate,CAST(sl.Quantity*sl.SalePrice-sl.Discount AS decimal(18,2)) TaxableValue,CAST((sl.Quantity*sl.SalePrice-sl.Discount)*sl.TaxRate/100 AS decimal(18,2)) TaxAmount
FROM SaleLines sl JOIN Sales s ON s.Id=sl.SaleId JOIN Products p ON p.Id=sl.ProductId WHERE s.Status='Completed' AND s.BillDate>=@f AND s.BillDate<@e AND (@q='' OR s.InvoiceNo LIKE @like OR s.CustomerName LIKE @like OR p.Name LIKE @like OR ISNULL(p.Barcode,'') LIKE @like) ORDER BY s.BillDate DESC,s.InvoiceNo,p.Name"; break;
                case "qty-wise-report":
                    sql=@"SELECT p.Name,p.Barcode,p.Category,CAST(ISNULL(SUM(CASE WHEN s.BillDate>=@f AND s.BillDate<@e AND s.Status='Completed' THEN sl.Quantity ELSE 0 END),0) AS decimal(18,3)) SoldQty,CAST(ISNULL((SELECT SUM(b.Quantity) FROM ProductBatches b WHERE b.ProductId=p.Id),0) AS decimal(18,3)) CurrentStock,p.Unit
FROM Products p LEFT JOIN SaleLines sl ON sl.ProductId=p.Id LEFT JOIN Sales s ON s.Id=sl.SaleId WHERE p.IsActive=1 AND (@q='' OR p.Name LIKE @like OR ISNULL(p.Barcode,'') LIKE @like) GROUP BY p.Id,p.Name,p.Barcode,p.Category,p.Unit ORDER BY SoldQty DESC,p.Name"; break;
                case "product-expiry":
                    sql=@"SELECT p.Name,p.Barcode,p.Category,b.BatchNo,b.Quantity,b.CostPrice,b.Mrp,b.ExpiryDate,DATEDIFF(day,CAST(GETDATE() AS date),b.ExpiryDate) DaysLeft,p.LocationCode,p.RackName
FROM ProductBatches b JOIN Products p ON p.Id=b.ProductId WHERE b.Quantity>0 AND (@q='' OR p.Name LIKE @like OR ISNULL(p.Barcode,'') LIKE @like OR ISNULL(b.BatchNo,'') LIKE @like) ORDER BY b.ExpiryDate,p.Name"; break;
                case "gstr1":
                    sql=@"SELECT s.BillDate,s.InvoiceNo,s.CustomerName,ISNULL(c.GstIn,'') CustomerGSTIN,ISNULL(p.Hsn,'') HSN,sl.TaxRate GSTPercent,CAST(sl.Quantity*sl.SalePrice-sl.Discount AS decimal(18,2)) TaxableValue,CAST((sl.Quantity*sl.SalePrice-sl.Discount)*sl.TaxRate/2/100 AS decimal(18,2)) CGST,CAST((sl.Quantity*sl.SalePrice-sl.Discount)*sl.TaxRate/2/100 AS decimal(18,2)) SGST,CAST((sl.Quantity*sl.SalePrice-sl.Discount)*(1+sl.TaxRate/100) AS decimal(18,2)) InvoiceLineValue
FROM SaleLines sl JOIN Sales s ON s.Id=sl.SaleId JOIN Products p ON p.Id=sl.ProductId LEFT JOIN Customers c ON c.Id=s.CustomerId WHERE s.Status='Completed' AND s.BillDate>=@f AND s.BillDate<@e AND (@q='' OR s.InvoiceNo LIKE @like OR s.CustomerName LIKE @like OR ISNULL(c.GstIn,'') LIKE @like) ORDER BY s.BillDate DESC,s.InvoiceNo"; break;
                default: return Results.BadRequest(new { message = "Unknown premium report type" });
            }
            return Results.Ok(await db.QueryAsync(sql,P("@f",f),P("@e",e),P("@q",term),P("@like",like)));
        });
    }

    public record PremiumSaleLine(int ProductId, decimal Qty, decimal SalePrice, decimal TaxRate, decimal Discount);
    public record PremiumPaymentRequest(string Mode, string? Type, decimal Amount, string? ReferenceNo);
    public record PremiumSaleRequest(int? CustomerId,string? CustomerName,string? PaymentMode,decimal PaidAmount,string? DiscountType,decimal DiscountValue,string? Notes,List<PremiumSaleLine> Lines,List<PremiumPaymentRequest>? Payments);
    public record OpeningStockLine(int ProductId,string? BatchNo,decimal Quantity,decimal CostPrice,decimal SalePrice,decimal Mrp,DateTime? ExpiryDate);
    public record OpeningStockRequest(DateTime? AsOnDate,string? Notes,List<OpeningStockLine> Lines);
}
