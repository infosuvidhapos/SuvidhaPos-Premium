using Microsoft.Data.SqlClient;
using SuvidhaPOS.Premium.Data;

namespace SuvidhaPOS.Premium;

/// <summary>BTC means Bill To Company. It creates a company-credit invoice with Paid=0,
/// then settles one or more pending invoices later through receipt/knock-off transactions.</summary>
public static class BtcSettlementModules
{
    static SqlParameter P(string n, object? v) => new(n, v ?? DBNull.Value);
    static string UserName(HttpContext ctx)
    {
        var u=ctx.Items["User"];
        return u?.GetType().GetProperty("UserName")?.GetValue(u)?.ToString() ?? "Unknown";
    }

    public static void Map(WebApplication app)
    {
        app.MapGet("/api/btc/companies", async (Db db, string? q) =>
        {
            var term=(q??"").Trim();
            return Results.Ok(await db.QueryAsync(@"
SELECT c.Id,c.CompanyName,c.GstIn,c.Phone,c.Address,c.CreditLimit,c.CreditDays,c.IsActive,
 CAST(ISNULL((SELECT SUM(s.PendingAmount) FROM Sales s WHERE s.BtcCompanyId=c.Id AND s.PaymentMode='BTC' AND s.Status='Completed'),0) AS decimal(18,2)) Outstanding,
 CAST(CASE WHEN c.CreditLimit<=0 THEN 0 ELSE c.CreditLimit-ISNULL((SELECT SUM(s.PendingAmount) FROM Sales s WHERE s.BtcCompanyId=c.Id AND s.PaymentMode='BTC' AND s.Status='Completed'),0) END AS decimal(18,2)) AvailableCredit
FROM BtcCompanies c
WHERE c.IsActive=1 AND (@q='' OR c.CompanyName LIKE @like OR ISNULL(c.GstIn,'') LIKE @like OR ISNULL(c.Phone,'') LIKE @like)
ORDER BY c.CompanyName",P("@q",term),P("@like","%"+term+"%")));
        });

        app.MapPost("/api/btc/companies", async (Db db, BtcCompanyRequest x) =>
        {
            var name=(x.CompanyName??"").Trim();
            if(string.IsNullOrWhiteSpace(name)) return Results.BadRequest(new{message="Company Name is required"});
            var dup=await db.QuerySingleAsync("SELECT TOP 1 Id FROM BtcCompanies WHERE IsActive=1 AND UPPER(LTRIM(RTRIM(CompanyName)))=UPPER(@n)",P("@n",name));
            if(dup.Count>0) return Results.BadRequest(new{message="Company already exists"});
            var id=await db.ScalarAsync(@"INSERT BtcCompanies(CompanyName,GstIn,Phone,Address,CreditLimit,CreditDays)
VALUES(@n,@g,@p,@a,@cl,@cd);SELECT CAST(SCOPE_IDENTITY() AS int)",
                P("@n",name),P("@g",x.GstIn),P("@p",x.Phone),P("@a",x.Address),P("@cl",Math.Max(0,x.CreditLimit)),P("@cd",Math.Max(0,x.CreditDays)));
            return Results.Ok(new{id});
        });

        app.MapPut("/api/btc/companies/{id:int}", async (Db db,int id,BtcCompanyRequest x) =>
        {
            var name=(x.CompanyName??"").Trim();
            if(string.IsNullOrWhiteSpace(name)) return Results.BadRequest(new{message="Company Name is required"});
            await db.ScalarAsync(@"UPDATE BtcCompanies SET CompanyName=@n,GstIn=@g,Phone=@p,Address=@a,CreditLimit=@cl,CreditDays=@cd,UpdatedAt=SYSDATETIME() WHERE Id=@id",
                P("@n",name),P("@g",x.GstIn),P("@p",x.Phone),P("@a",x.Address),P("@cl",Math.Max(0,x.CreditLimit)),P("@cd",Math.Max(0,x.CreditDays)),P("@id",id));
            return Results.Ok(new{updated=true});
        });

        app.MapGet("/api/btc/pending", async (Db db,int? companyId) => Results.Ok(await db.QueryAsync(@"
SELECT s.Id SaleId,s.InvoiceNo,s.BillDate,s.CustomerName CompanyName,s.BtcCompanyId,s.BtcReferenceNo,s.GrandTotal,s.PaidAmount,
 s.PendingAmount,ISNULL(s.PaymentStatus,CASE WHEN s.PendingAmount<=0 THEN 'Paid' WHEN s.PaidAmount>0 THEN 'Partially Paid' ELSE 'Pending' END) PaymentStatus,
 s.BtcDueDate,DATEDIFF(day,s.BtcDueDate,CAST(GETDATE() AS date)) DaysOverdue
FROM Sales s WHERE s.Status='Completed' AND s.PaymentMode='BTC' AND s.PendingAmount>0 AND (@cid IS NULL OR s.BtcCompanyId=@cid)
ORDER BY s.BtcDueDate,s.BillDate,s.Id",P("@cid",companyId))));

        app.MapGet("/api/btc/ledger", async (Db db,int companyId) => Results.Ok(await db.QueryAsync(@"
SELECT l.Id,l.TxnDate,l.EntryType,l.ReferenceType,l.ReferenceId,l.ReferenceNo,l.Debit,l.Credit,l.Notes,
 CAST(SUM(l.Debit-l.Credit) OVER(ORDER BY l.TxnDate,l.Id ROWS UNBOUNDED PRECEDING) AS decimal(18,2)) RunningOutstanding
FROM BtcCompanyLedger l WHERE l.CompanyId=@c ORDER BY l.TxnDate,l.Id",P("@c",companyId))));

        app.MapGet("/api/btc/settlements", async (Db db,int? companyId) => Results.Ok(await db.QueryAsync(@"
SELECT TOP 300 st.Id,st.ReceiptNo,st.SettlementDate,c.CompanyName,st.CompanyId,st.TotalAmount,st.PaymentMode,st.ReferenceNo,st.Notes,st.CreatedBy
FROM BtcSettlements st JOIN BtcCompanies c ON c.Id=st.CompanyId
WHERE (@cid IS NULL OR st.CompanyId=@cid) ORDER BY st.Id DESC",P("@cid",companyId))));

        app.MapPost("/api/btc/invoices", async (Db db,HttpContext ctx,BtcInvoiceRequest x) =>
        {
            if(x.CompanyId<=0) return Results.BadRequest(new{message="Select Company for Bill To Company"});
            if(x.Lines is null || x.Lines.Count==0) return Results.BadRequest(new{message="Add item first"});
            var discountType=string.Equals(x.DiscountType,"PERCENT",StringComparison.OrdinalIgnoreCase)?"PERCENT":"RUPEES";
            var discountValue=Math.Max(0,x.DiscountValue);
            var user=UserName(ctx);
            using var c=db.CreateConnection();await c.OpenAsync();using var tx=c.BeginTransaction();
            try
            {
                string companyName,gstin;decimal creditLimit,outstanding;int creditDays;
                using(var cc=new SqlCommand(@"SELECT c.CompanyName,ISNULL(c.GstIn,''),c.CreditLimit,c.CreditDays,
ISNULL((SELECT SUM(s.PendingAmount) FROM Sales s WHERE s.BtcCompanyId=c.Id AND s.PaymentMode='BTC' AND s.Status='Completed'),0)
FROM BtcCompanies c WITH(UPDLOCK,ROWLOCK) WHERE c.Id=@id AND c.IsActive=1",c,tx))
                {
                    cc.Parameters.Add(P("@id",x.CompanyId));using var rd=await cc.ExecuteReaderAsync();
                    if(!await rd.ReadAsync()) throw new Exception("Selected company is not active");
                    companyName=rd.GetString(0);gstin=rd.GetString(1);creditLimit=rd.GetDecimal(2);creditDays=rd.GetInt32(3);outstanding=rd.GetDecimal(4);
                }

                foreach(var l in x.Lines)
                {
                    var baseQty=l.BaseQty>0?l.BaseQty:l.Qty;
                    if(baseQty<=0) throw new Exception("Quantity must be greater than zero");
                    using var ck=new SqlCommand("SELECT ISNULL(SUM(Quantity),0) FROM ProductBatches WITH(UPDLOCK) WHERE ProductId=@p AND Quantity>0 AND ExpiryDate>=CAST(GETDATE() AS date)",c,tx);
                    ck.Parameters.Add(P("@p",l.ProductId));
                    if(Convert.ToDecimal(await ck.ExecuteScalarAsync())<baseQty) throw new Exception("Insufficient saleable stock for product "+l.ProductId);
                }

                decimal sub=0,tax=0;
                foreach(var l in x.Lines)
                {
                    var qty=l.BaseQty>0?l.BaseQty:l.Qty;var rate=Math.Max(0,l.SalePrice);var amount=qty*rate;var tr=Math.Max(0,l.TaxRate);
                    var inclusive=string.Equals(l.TaxMode,"INCLUSIVE",StringComparison.OrdinalIgnoreCase);
                    var lt=tr<=0?0m:(inclusive?amount*tr/(100m+tr):amount*tr/100m);
                    tax+=lt;sub+=inclusive?amount-lt:amount;
                }
                var beforeDiscount=sub+tax;
                var discount=discountType=="PERCENT"?beforeDiscount*Math.Min(100m,discountValue)/100m:discountValue;
                discount=Math.Min(discount,beforeDiscount);var total=Math.Max(0,beforeDiscount-discount);
                if(creditLimit>0 && outstanding+total>creditLimit+0.01m)
                    throw new Exception($"Company credit limit exceeded. Available credit: ₹{Math.Max(0,creditLimit-outstanding):0.00}");

                var invoiceNo="INV-"+DateTime.Now.ToString("yyyyMMddHHmmssfff");
                using var head=new SqlCommand(@"INSERT Sales(InvoiceNo,BillDate,CustomerId,CustomerName,PaymentMode,SubTotal,Discount,DiscountType,DiscountValue,Tax,GrandTotal,TotalCost,PaidAmount,Notes,CashierName,BtcCompanyId,BtcReferenceNo,PaymentStatus,PendingAmount,BtcDueDate)
VALUES(@i,GETDATE(),NULL,@cn,'BTC',@sub,@d,@dt,@dv,@tax,@g,0,0,@notes,@u,@cid,@ref,'Pending',@g,DATEADD(day,@days,CAST(GETDATE() AS date)));
SELECT CAST(SCOPE_IDENTITY() AS int);",c,tx);
                head.Parameters.AddRange(new[]{P("@i",invoiceNo),P("@cn",companyName),P("@sub",sub),P("@d",discount),P("@dt",discountType),P("@dv",discountValue),P("@tax",tax),P("@g",total),P("@notes",x.Notes),P("@u",user),P("@cid",x.CompanyId),P("@ref",x.ReferenceNo),P("@days",creditDays)});
                var saleId=(int)await head.ExecuteScalarAsync();

                decimal cost=0;
                foreach(var l in x.Lines)
                {
                    var baseQty=l.BaseQty>0?l.BaseQty:l.Qty;var baseRate=Math.Max(0,l.SalePrice);var rem=baseQty;
                    while(rem>0)
                    {
                        using var pick=new SqlCommand("SELECT TOP 1 Id,Quantity,CostPrice FROM ProductBatches WITH(UPDLOCK,ROWLOCK) WHERE ProductId=@p AND Quantity>0 AND ExpiryDate>=CAST(GETDATE() AS date) ORDER BY ExpiryDate,Id",c,tx);
                        pick.Parameters.Add(P("@p",l.ProductId));using var rd=await pick.ExecuteReaderAsync();
                        if(!await rd.ReadAsync()) throw new Exception("Stock changed during BTC billing");
                        var batchId=rd.GetInt32(0);var available=rd.GetDecimal(1);var cp=rd.GetDecimal(2);await rd.CloseAsync();
                        var take=Math.Min(rem,available);cost+=take*cp;
                        var factor=l.SoldQty>0&&baseQty>0?baseQty/l.SoldQty:1m;var soldTake=factor>0?take/factor:take;
                        using var line=new SqlCommand(@"UPDATE ProductBatches SET Quantity=Quantity-@q WHERE Id=@b;
INSERT SaleLines(SaleId,ProductId,BatchId,Quantity,SalePrice,CostPrice,TaxRate,TaxMode,Discount,UnitSold,SoldQuantity,TotalBaseQtyDeducted,RatePerSoldUnit)
VALUES(@s,@p,@b,@q,@sp,@cp,@tr,@tm,0,@us,@sq,@q,@rsu);
INSERT StockLedger(ProductId,BatchId,MovementType,Quantity,ReferenceType,ReferenceId,Notes)
VALUES(@p,@b,'SALE',-@q,'SALE',@s,'BTC - Bill To Company');",c,tx);
                        line.Parameters.AddRange(new[]{P("@q",take),P("@b",batchId),P("@s",saleId),P("@p",l.ProductId),P("@sp",baseRate),P("@cp",cp),P("@tr",l.TaxRate),P("@tm",string.Equals(l.TaxMode,"INCLUSIVE",StringComparison.OrdinalIgnoreCase)?"INCLUSIVE":"EXCLUSIVE"),P("@us",l.UnitSold),P("@sq",soldTake),P("@rsu",l.RatePerSoldUnit>0?l.RatePerSoldUnit:baseRate*factor)});
                        await line.ExecuteNonQueryAsync();rem-=take;
                    }
                }
                using(var fin=new SqlCommand("UPDATE Sales SET TotalCost=@c WHERE Id=@id; INSERT BtcCompanyLedger(CompanyId,EntryType,ReferenceType,ReferenceId,ReferenceNo,Debit,Credit,Notes) VALUES(@cid,'INVOICE','SALE',@id,@inv,@amt,0,@note); INSERT AuditLogs(UserName,Action,Entity,EntityId,Details) VALUES(@u,'BTC_INVOICE_CREATED','Sale',@id,@detail)",c,tx))
                {
                    fin.Parameters.AddRange(new[]{P("@c",cost),P("@id",saleId),P("@cid",x.CompanyId),P("@inv",invoiceNo),P("@amt",total),P("@note",$"Bill To Company; PO/Ref={x.ReferenceNo}"),P("@u",user),P("@detail",$"Company={companyName}; Total={total}; Paid=0; Pending={total}")});await fin.ExecuteNonQueryAsync();
                }
                await tx.CommitAsync();
                return Results.Ok(new{id=saleId,invoiceNo,total,paid=0m,pending=total,paymentMode="BTC",paymentStatus="Pending",companyId=x.CompanyId,companyName,gstin,referenceNo=x.ReferenceNo});
            }
            catch(Exception ex){await tx.RollbackAsync();return Results.BadRequest(new{message=ex.Message});}
        });

        app.MapPost("/api/btc/settle", async (Db db,HttpContext ctx,BtcSettlementRequest x) =>
        {
            var ids=(x.SaleIds??new List<int>()).Where(i=>i>0).Distinct().ToList();
            if(x.CompanyId<=0||ids.Count==0) return Results.BadRequest(new{message="Select company and at least one pending invoice"});
            var amount=Math.Max(0,x.SettlementAmount);if(amount<=0) return Results.BadRequest(new{message="Enter settlement amount"});
            var payments=(x.Payments??new List<BtcPaymentRequest>()).Where(p=>p.Amount>0).ToList();
            if(payments.Count==0) return Results.BadRequest(new{message="Select payment mode"});
            var paymentTotal=payments.Sum(p=>p.Amount);if(Math.Abs(paymentTotal-amount)>0.01m) return Results.BadRequest(new{message="Payment allocation must equal settlement amount"});
            var user=UserName(ctx);using var c=db.CreateConnection();await c.OpenAsync();using var tx=c.BeginTransaction();
            try
            {
                var invoices=new List<(int Id,string InvoiceNo,decimal Pending)>();
                foreach(var id in ids)
                {
                    using var cmd=new SqlCommand("SELECT Id,InvoiceNo,PendingAmount FROM Sales WITH(UPDLOCK,ROWLOCK) WHERE Id=@id AND BtcCompanyId=@c AND PaymentMode='BTC' AND Status='Completed' AND PendingAmount>0",c,tx);
                    cmd.Parameters.AddRange(new[]{P("@id",id),P("@c",x.CompanyId)});using var rd=await cmd.ExecuteReaderAsync();
                    if(await rd.ReadAsync()) invoices.Add((rd.GetInt32(0),rd.GetString(1),rd.GetDecimal(2)));
                }
                if(invoices.Count==0) throw new Exception("Selected invoices are already settled or invalid");
                var selectedPending=invoices.Sum(i=>i.Pending);if(amount>selectedPending+0.01m) throw new Exception("Settlement amount exceeds selected pending amount");
                var receiptNo="BTC-RCPT-"+DateTime.Now.ToString("yyyyMMddHHmmssfff");
                var headerMode=payments.Count>1?"Multi Mode":payments[0].Mode;
                using var h=new SqlCommand("INSERT BtcSettlements(ReceiptNo,CompanyId,TotalAmount,PaymentMode,ReferenceNo,Notes,CreatedBy) VALUES(@r,@c,@a,@m,@ref,@n,@u);SELECT CAST(SCOPE_IDENTITY() AS bigint)",c,tx);
                h.Parameters.AddRange(new[]{P("@r",receiptNo),P("@c",x.CompanyId),P("@a",amount),P("@m",headerMode),P("@ref",x.ReferenceNo),P("@n",x.Notes),P("@u",user)});var settlementId=Convert.ToInt64(await h.ExecuteScalarAsync());
                foreach(var p in payments)
                {
                    using var pc=new SqlCommand("INSERT BtcSettlementPayments(SettlementId,PaymentMode,Amount,ReferenceNo) VALUES(@s,@m,@a,@r)",c,tx);
                    pc.Parameters.AddRange(new[]{P("@s",settlementId),P("@m",p.Mode),P("@a",p.Amount),P("@r",p.ReferenceNo)});await pc.ExecuteNonQueryAsync();
                }
                var remaining=amount;var allocations=new List<object>();
                foreach(var inv in invoices)
                {
                    if(remaining<=0)break;var apply=Math.Min(remaining,inv.Pending);var newPending=inv.Pending-apply;
                    using var ac=new SqlCommand(@"UPDATE Sales SET PaidAmount=PaidAmount+@a,PendingAmount=@p,PaymentStatus=CASE WHEN @p<=0.005 THEN 'Paid' ELSE 'Partially Paid' END WHERE Id=@id;
INSERT BtcSettlementAllocations(SettlementId,SaleId,Amount) VALUES(@s,@id,@a);",c,tx);
                    ac.Parameters.AddRange(new[]{P("@a",apply),P("@p",Math.Max(0,newPending)),P("@id",inv.Id),P("@s",settlementId)});await ac.ExecuteNonQueryAsync();
                    allocations.Add(new{saleId=inv.Id,invoiceNo=inv.InvoiceNo,amount=apply,pending=Math.Max(0,newPending),status=newPending<=0.005m?"Paid":"Partially Paid"});remaining-=apply;
                }
                using(var lc=new SqlCommand("INSERT BtcCompanyLedger(CompanyId,EntryType,ReferenceType,ReferenceId,ReferenceNo,Debit,Credit,Notes) VALUES(@c,'RECEIPT','BTC_SETTLEMENT',@id,@r,0,@a,@n); INSERT AuditLogs(UserName,Action,Entity,Details) VALUES(@u,'BTC_SETTLEMENT','Company',@d)",c,tx))
                {
                    lc.Parameters.AddRange(new[]{P("@c",x.CompanyId),P("@id",settlementId),P("@r",receiptNo),P("@a",amount),P("@n",x.Notes),P("@u",user),P("@d",$"Receipt={receiptNo}; Amount={amount}; Invoices={string.Join(',',ids)}")});await lc.ExecuteNonQueryAsync();
                }
                await tx.CommitAsync();return Results.Ok(new{id=settlementId,receiptNo,amount,paymentMode=headerMode,allocations});
            }
            catch(Exception ex){await tx.RollbackAsync();return Results.BadRequest(new{message=ex.Message});}
        });

        app.MapGet("/api/btc/receipt/{id:long}", async (Db db,long id) =>
        {
            var head=await db.QuerySingleAsync(@"SELECT st.Id,st.ReceiptNo,st.SettlementDate,st.TotalAmount,st.PaymentMode,st.ReferenceNo,st.Notes,st.CreatedBy,c.CompanyName,c.GstIn,c.Phone,c.Address FROM BtcSettlements st JOIN BtcCompanies c ON c.Id=st.CompanyId WHERE st.Id=@id",P("@id",id));
            if(head.Count==0) return Results.NotFound(new{message="Receipt not found"});
            var allocations=await db.QueryAsync(@"SELECT a.SaleId,s.InvoiceNo,s.BillDate,s.GrandTotal,a.Amount SettledAmount,s.PaidAmount,s.PendingAmount,s.PaymentStatus FROM BtcSettlementAllocations a JOIN Sales s ON s.Id=a.SaleId WHERE a.SettlementId=@id ORDER BY a.Id",P("@id",id));
            var payments=await db.QueryAsync("SELECT PaymentMode,Amount,ReferenceNo FROM BtcSettlementPayments WHERE SettlementId=@id ORDER BY Id",P("@id",id));
            return Results.Ok(new{head,allocations,payments});
        });
    }

    public record BtcCompanyRequest(string? CompanyName,string? GstIn,string? Phone,string? Address,decimal CreditLimit,int CreditDays);
    public record BtcSaleLine(int ProductId,decimal Qty,decimal SalePrice,decimal TaxRate,string? TaxMode,string? UnitSold,decimal SoldQty,decimal BaseQty,decimal RatePerSoldUnit);
    public record BtcInvoiceRequest(int CompanyId,string? ReferenceNo,string? DiscountType,decimal DiscountValue,string? Notes,List<BtcSaleLine> Lines);
    public record BtcPaymentRequest(string Mode,decimal Amount,string? ReferenceNo);
    public record BtcSettlementRequest(int CompanyId,List<int>? SaleIds,decimal SettlementAmount,List<BtcPaymentRequest>? Payments,string? ReferenceNo,string? Notes);
}
