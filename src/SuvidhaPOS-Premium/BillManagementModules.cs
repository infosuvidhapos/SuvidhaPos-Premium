using Microsoft.Data.SqlClient;
using SuvidhaPOS.Premium.Data;

namespace SuvidhaPOS.Premium;

public static class BillManagementModules
{
    static SqlParameter P(string n, object? v) => new(n, v ?? DBNull.Value);
    static string UserName(HttpContext ctx)
    {
        var u=ctx.Items["User"];
        return u?.GetType().GetProperty("UserName")?.GetValue(u)?.ToString()??"Unknown";
    }

    public static void Map(WebApplication app)
    {
        app.MapGet("/api/bill-master", async (Db db, string? from, string? to, string? q, string? status) =>
        {
            var term=(q??"").Trim(); var st=(status??"ALL").Trim();
            return Results.Ok(await db.QueryAsync(@"SELECT TOP 1000 s.Id,s.InvoiceNo,s.BillDate,s.CustomerName,s.PaymentMode,
s.SubTotal,s.Discount,s.Tax,s.GrandTotal,s.PaidAmount,s.Status,s.CancelledAt,s.CancelledBy,
ISNULL(s.ModificationCount,0) ModificationCount,s.ModifiedAt,s.ModifiedBy,
ISNULL((SELECT TOP 1 a.Action FROM AuditLogs a WHERE a.Entity='Sale' AND a.EntityId=s.Id ORDER BY a.Id DESC),'SALE_CREATED') LastAction
FROM Sales s
WHERE (@f='' OR s.BillDate>=CAST(@f AS date))
 AND (@t='' OR s.BillDate<DATEADD(day,1,CAST(@t AS date)))
 AND (@st='ALL' OR s.Status=@st)
 AND (@q='' OR s.InvoiceNo LIKE @like OR ISNULL(s.CustomerName,'') LIKE @like OR ISNULL(s.PaymentMode,'') LIKE @like)
ORDER BY s.Id DESC",
                P("@f",from??""),P("@t",to??""),P("@st",st),P("@q",term),P("@like","%"+term+"%")));
        });

        app.MapGet("/api/sales/{id:int}/edit-model", async (Db db, int id) =>
        {
            var h=await db.QuerySingleAsync(@"SELECT s.*,ISNULL(s.ModificationCount,0) ModificationCount
FROM Sales s WHERE s.Id=@id",P("@id",id));
            if(h.Count==0) return Results.NotFound(new{message="Bill not found"});
            var lines=await db.QueryAsync(@"SELECT sl.Id,sl.ProductId,p.Name,p.Barcode,p.Unit ProductBaseUnit,
sl.BatchId,b.BatchNo,b.ExpiryDate,sl.Quantity,sl.SalePrice,sl.CostPrice,sl.TaxRate,sl.Discount,
sl.UnitSold,sl.SoldQuantity,sl.TotalBaseQtyDeducted,sl.RatePerSoldUnit
FROM SaleLines sl JOIN Products p ON p.Id=sl.ProductId JOIN ProductBatches b ON b.Id=sl.BatchId
WHERE sl.SaleId=@id ORDER BY sl.Id",P("@id",id));
            var payments=await db.QueryAsync("SELECT Id,PaymentMode,PaymentType,Amount,ReferenceNo FROM SalePayments WHERE SaleId=@id ORDER BY Id",P("@id",id));
            return Results.Ok(new{header=h,lines,payments});
        });

        app.MapGet("/api/sales/{id:int}/bill-audit", async (Db db,int id) =>
            Results.Ok(await db.QueryAsync(@"SELECT TOP 200 Id,CreatedAt,UserName,Action,Details
FROM AuditLogs WHERE Entity='Sale' AND EntityId=@id ORDER BY Id DESC",P("@id",id))));

        app.MapPut("/api/sales/{id:int}/bill", async (Db db,HttpContext ctx,int id,BillEditRequest x) =>
        {
            if(x.Lines is null || x.Lines.Count==0) return Results.BadRequest(new{message="Bill must contain at least one item"});
            var action=string.Equals(x.Action,"MODIFY",StringComparison.OrdinalIgnoreCase)?"MODIFY":"EDIT";
            var user=UserName(ctx);
            var resolved=new List<BillResolvedLine>();

            foreach(var l in x.Lines)
            {
                if(l.ProductId<=0 || l.SoldQty<=0) return Results.BadRequest(new{message="Each item must have positive quantity"});
                var u=await db.QuerySingleAsync(@"SELECT TOP 1 BaseUnit,InnerUnit,PackUnit,ConversionFactor,InnerConversionFactor
FROM ProductUoms WHERE ProductId=@p",P("@p",l.ProductId));
                decimal factor=1m;
                var soldUnit=(l.UnitSold??"").Trim();
                if(u.Count>0 && !string.IsNullOrWhiteSpace(soldUnit))
                {
                    var baseUnit=u.GetValueOrDefault("BaseUnit")?.ToString()??"PCS";
                    var innerUnit=u.GetValueOrDefault("InnerUnit")?.ToString();
                    var packUnit=u.GetValueOrDefault("PackUnit")?.ToString();
                    if(soldUnit.Equals(packUnit,StringComparison.OrdinalIgnoreCase))
                        factor=Math.Max(1m,Convert.ToDecimal(u.GetValueOrDefault("ConversionFactor")??1m));
                    else if(!string.IsNullOrWhiteSpace(innerUnit)&&soldUnit.Equals(innerUnit,StringComparison.OrdinalIgnoreCase))
                        factor=Math.Max(1m,Convert.ToDecimal(u.GetValueOrDefault("InnerConversionFactor")??1m));
                    else if(soldUnit.Equals(baseUnit,StringComparison.OrdinalIgnoreCase)) factor=1m;
                }
                var baseQty=l.SoldQty*factor;
                var soldRate=Math.Max(0,l.RatePerSoldUnit);
                var baseRate=factor>0?soldRate/factor:soldRate;
                resolved.Add(new BillResolvedLine(l.ProductId,soldUnit,l.SoldQty,factor,baseQty,soldRate,baseRate,Math.Max(0,l.TaxRate)));
            }

            using var c=db.CreateConnection(); await c.OpenAsync(); using var tx=c.BeginTransaction();
            try
            {
                var cmd=new SqlCommand("SELECT Status,InvoiceNo,PaymentMode,PaidAmount,GrandTotal FROM Sales WITH(UPDLOCK,ROWLOCK) WHERE Id=@id",c,tx);
                cmd.Parameters.Add(P("@id",id));
                string? status=null,invoiceNo=null,paymentMode=null;decimal oldPaid=0,oldTotal=0;
                using(var rd=await cmd.ExecuteReaderAsync())
                {
                    if(!await rd.ReadAsync()) return Results.NotFound(new{message="Bill not found"});
                    status=rd.GetString(0);invoiceNo=rd.GetString(1);paymentMode=rd.GetString(2);
                    oldPaid=rd.GetDecimal(3);oldTotal=rd.GetDecimal(4);
                }
                if(!string.Equals(status,"Completed",StringComparison.OrdinalIgnoreCase))
                    return Results.BadRequest(new{message="Only completed bills can be edited or modified"});

                // Step 1: restore every old batch quantity exactly.
                cmd=new SqlCommand("SELECT ProductId,BatchId,Quantity FROM SaleLines WHERE SaleId=@id",c,tx);
                cmd.Parameters.Add(P("@id",id));
                var oldLines=new List<(int ProductId,int BatchId,decimal Qty)>();
                using(var rd=await cmd.ExecuteReaderAsync())
                    while(await rd.ReadAsync()) oldLines.Add((rd.GetInt32(0),rd.GetInt32(1),rd.GetDecimal(2)));

                foreach(var old in oldLines)
                {
                    cmd=new SqlCommand(@"UPDATE ProductBatches SET Quantity=Quantity+@q WHERE Id=@b;
INSERT StockLedger(ProductId,BatchId,MovementType,Quantity,ReferenceType,ReferenceId,Notes)
VALUES(@p,@b,@m,@q,'SALE',@id,@n)",c,tx);
                    cmd.Parameters.AddRange(new[]{
                        P("@q",old.Qty),P("@b",old.BatchId),P("@p",old.ProductId),P("@id",id),
                        P("@m",action=="MODIFY"?"BILL_MODIFY_RESTORE":"BILL_EDIT_RESTORE"),
                        P("@n",$"{action} bill {invoiceNo}: restore old sale line before recalculation")
                    });
                    await cmd.ExecuteNonQueryAsync();
                }
                cmd=new SqlCommand("DELETE FROM SaleLines WHERE SaleId=@id",c,tx);cmd.Parameters.Add(P("@id",id));await cmd.ExecuteNonQueryAsync();

                // Step 2: validate all requested base quantities after old stock is restored.
                foreach(var group in resolved.GroupBy(z=>z.ProductId))
                {
                    var need=group.Sum(z=>z.BaseQty);
                    cmd=new SqlCommand(@"SELECT ISNULL(SUM(Quantity),0) FROM ProductBatches WITH(UPDLOCK)
WHERE ProductId=@p AND Quantity>0 AND ExpiryDate>=CAST(GETDATE() AS date)",c,tx);
                    cmd.Parameters.Add(P("@p",group.Key));
                    var available=Convert.ToDecimal(await cmd.ExecuteScalarAsync()??0m);
                    if(available<need) throw new Exception($"Insufficient saleable stock for product {group.Key}. Need {need:0.###}, available {available:0.###} base units.");
                }

                decimal sub=resolved.Sum(z=>z.BaseQty*z.BaseRate);
                decimal tax=resolved.Sum(z=>z.BaseQty*z.BaseRate*z.TaxRate/100m);
                var discountType=string.Equals(x.DiscountType,"PERCENT",StringComparison.OrdinalIgnoreCase)?"PERCENT":"RUPEES";
                var discountValue=Math.Max(0,x.DiscountValue);
                decimal discount=discountType=="PERCENT"?sub*Math.Min(100m,discountValue)/100m:discountValue;
                discount=Math.Min(discount,sub+tax);
                decimal total=Math.Max(0,sub-discount+tax);
                decimal cost=0;

                // Step 3: allocate edited bill again using FEFO and deduct new base quantities.
                foreach(var l in resolved)
                {
                    decimal rem=l.BaseQty;
                    while(rem>0)
                    {
                        cmd=new SqlCommand(@"SELECT TOP 1 Id,Quantity,CostPrice FROM ProductBatches WITH(UPDLOCK,ROWLOCK)
WHERE ProductId=@p AND Quantity>0 AND ExpiryDate>=CAST(GETDATE() AS date) ORDER BY ExpiryDate,Id",c,tx);
                        cmd.Parameters.Add(P("@p",l.ProductId));
                        int bid;decimal avail,cp;
                        using(var rd=await cmd.ExecuteReaderAsync())
                        {
                            if(!await rd.ReadAsync()) throw new Exception("Stock changed during bill modification");
                            bid=rd.GetInt32(0);avail=rd.GetDecimal(1);cp=rd.GetDecimal(2);
                        }
                        var take=Math.Min(rem,avail); var soldTake=l.Factor>0?take/l.Factor:take; cost+=take*cp;
                        cmd=new SqlCommand(@"UPDATE ProductBatches SET Quantity=Quantity-@q WHERE Id=@b;
INSERT SaleLines(SaleId,ProductId,BatchId,Quantity,SalePrice,CostPrice,TaxRate,Discount,UnitSold,SoldQuantity,TotalBaseQtyDeducted,RatePerSoldUnit)
VALUES(@s,@p,@b,@q,@sp,@cp,@tr,0,@us,@sq,@tb,@rsu);
INSERT StockLedger(ProductId,BatchId,MovementType,Quantity,ReferenceType,ReferenceId,Notes)
VALUES(@p,@b,@m,-@q,'SALE',@s,@n)",c,tx);
                        cmd.Parameters.AddRange(new[]{
                            P("@q",take),P("@b",bid),P("@s",id),P("@p",l.ProductId),P("@sp",l.BaseRate),P("@cp",cp),
                            P("@tr",l.TaxRate),P("@us",l.UnitSold),P("@sq",soldTake),P("@tb",take),P("@rsu",l.SoldRate),
                            P("@m",action=="MODIFY"?"BILL_MODIFY_SALE":"BILL_EDIT_SALE"),
                            P("@n",$"{action} bill {invoiceNo}: {soldTake:0.###} {l.UnitSold} = {take:0.###} base units")
                        });
                        await cmd.ExecuteNonQueryAsync(); rem-=take;
                    }
                }

                // Keep payment allocation consistent when the total changes.
                var payRows=new List<BillPaymentPart>();
                cmd=new SqlCommand("SELECT PaymentMode,PaymentType,Amount,ReferenceNo FROM SalePayments WHERE SaleId=@id ORDER BY Id",c,tx);
                cmd.Parameters.Add(P("@id",id));
                using(var rd=await cmd.ExecuteReaderAsync())
                    while(await rd.ReadAsync()) payRows.Add(new BillPaymentPart(rd.GetString(0),rd.IsDBNull(1)?null:rd.GetString(1),rd.GetDecimal(2),rd.IsDBNull(3)?null:rd.GetString(3)));
                var synced=SyncExistingPayments(paymentMode??"Cash",total,payRows,oldPaid);

                cmd=new SqlCommand(@"UPDATE Sales SET CustomerId=@cid,CustomerName=@cn,SubTotal=@sub,Discount=@d,DiscountType=@dt,
DiscountValue=@dv,Tax=@tax,GrandTotal=@g,TotalCost=@cost,PaidAmount=@paid,Notes=@notes,
ModifiedAt=SYSDATETIME(),ModifiedBy=@u,ModificationCount=ISNULL(ModificationCount,0)+1,LastModificationType=@act
WHERE Id=@id;
DELETE FROM SalePayments WHERE SaleId=@id;",c,tx);
                cmd.Parameters.AddRange(new[]{
                    P("@cid",x.CustomerId),P("@cn",string.IsNullOrWhiteSpace(x.CustomerName)?"Walk-in Customer":x.CustomerName.Trim()),
                    P("@sub",sub),P("@d",discount),P("@dt",discountType),P("@dv",discountValue),P("@tax",tax),P("@g",total),
                    P("@cost",cost),P("@paid",synced.Paid),P("@notes",x.Notes),P("@u",user),P("@act",action),P("@id",id)
                });
                await cmd.ExecuteNonQueryAsync();

                foreach(var p in synced.Parts)
                {
                    cmd=new SqlCommand("INSERT SalePayments(SaleId,PaymentMode,PaymentType,Amount,ReferenceNo) VALUES(@s,@m,@t,@a,@r)",c,tx);
                    cmd.Parameters.AddRange(new[]{P("@s",id),P("@m",p.Mode),P("@t",p.Type),P("@a",p.Amount),P("@r",p.ReferenceNo)});
                    await cmd.ExecuteNonQueryAsync();
                }

                cmd=new SqlCommand("INSERT AuditLogs(UserName,Action,Entity,EntityId,Details) VALUES(@u,@a,'Sale',@id,@d)",c,tx);
                cmd.Parameters.AddRange(new[]{
                    P("@u",user),P("@a",action=="MODIFY"?"BILL_MODIFIED":"BILL_EDITED"),P("@id",id),
                    P("@d",$"{invoiceNo}; old total={oldTotal:0.00}; new total={total:0.00}; lines={resolved.Count}; stock reversed and reallocated FEFO")
                });
                await cmd.ExecuteNonQueryAsync();
                await tx.CommitAsync();
                return Results.Ok(new{id,invoiceNo,total,discount,tax,action,paidAmount=synced.Paid,stockUpdated=true});
            }
            catch(Exception ex)
            {
                await tx.RollbackAsync();
                return Results.BadRequest(new{message=ex.Message});
            }
        });

        app.MapPut("/api/sales/{id:int}/payment-mode", async (Db db,HttpContext ctx,int id,BillPaymentChangeRequest x) =>
        {
            var allowed=new HashSet<string>(StringComparer.OrdinalIgnoreCase){"Cash","Credit/UPI","BTC","Multi Mode"};
            var mode=(x.PaymentMode??"").Trim();
            if(!allowed.Contains(mode)) return Results.BadRequest(new{message="Payment mode must be Cash, Credit/UPI, BTC or Multi Mode"});
            var user=UserName(ctx);
            using var c=db.CreateConnection();await c.OpenAsync();using var tx=c.BeginTransaction();
            try
            {
                var cmd=new SqlCommand("SELECT Status,GrandTotal,InvoiceNo,PaymentMode,BtcCompanyId FROM Sales WITH(UPDLOCK,ROWLOCK) WHERE Id=@id",c,tx);
                cmd.Parameters.Add(P("@id",id));
                string status,invoice,oldMode;decimal total;int? oldBtc=null;
                using(var rd=await cmd.ExecuteReaderAsync())
                {
                    if(!await rd.ReadAsync()) return Results.NotFound(new{message="Bill not found"});
                    status=rd.GetString(0);total=rd.GetDecimal(1);invoice=rd.GetString(2);oldMode=rd.GetString(3);oldBtc=rd.IsDBNull(4)?null:rd.GetInt32(4);
                }
                if(!status.Equals("Completed",StringComparison.OrdinalIgnoreCase)) return Results.BadRequest(new{message="Payment mode can be changed only on completed bills"});

                decimal settled=0;
                if(oldMode.Equals("BTC",StringComparison.OrdinalIgnoreCase))
                {
                    cmd=new SqlCommand("SELECT ISNULL(SUM(Amount),0) FROM BtcSettlementAllocations WHERE SaleId=@id",c,tx);cmd.Parameters.Add(P("@id",id));
                    settled=Convert.ToDecimal(await cmd.ExecuteScalarAsync()??0m);
                    if(settled>0.005m && (!mode.Equals("BTC",StringComparison.OrdinalIgnoreCase)||oldBtc!=x.BtcCompanyId))
                        return Results.BadRequest(new{message="This BTC invoice already has settlement allocation. Reverse/settle correctly before changing its company or payment mode."});
                }

                var parts=new List<BillPaymentPart>();decimal paid=0;int? btcCompanyId=null;string? btcCompanyName=null;DateTime? btcDue=null;
                if(mode.Equals("Cash",StringComparison.OrdinalIgnoreCase))
                {
                    parts.Add(new("Cash","Cash",total,x.ReferenceNo));paid=total;
                }
                else if(mode.Equals("BTC",StringComparison.OrdinalIgnoreCase))
                {
                    if(!x.BtcCompanyId.HasValue||x.BtcCompanyId.Value<=0) return Results.BadRequest(new{message="Select BTC customer/company first"});
                    btcCompanyId=x.BtcCompanyId.Value;
                    cmd=new SqlCommand("SELECT TOP 1 CompanyName,CreditDays,CreditLimit FROM BtcCompanies WHERE Id=@id AND IsActive=1",c,tx);cmd.Parameters.Add(P("@id",btcCompanyId));
                    int days=0;decimal limit=0;
                    using(var rd=await cmd.ExecuteReaderAsync())
                    {
                        if(!await rd.ReadAsync()) return Results.BadRequest(new{message="BTC customer/company not found or inactive"});
                        btcCompanyName=rd.GetString(0);days=rd.GetInt32(1);limit=rd.GetDecimal(2);
                    }
                    cmd=new SqlCommand("SELECT ISNULL(SUM(PendingAmount),0) FROM Sales WHERE BtcCompanyId=@c AND PaymentMode='BTC' AND Status='Completed' AND Id<>@id",c,tx);
                    cmd.Parameters.AddRange(new[]{P("@c",btcCompanyId),P("@id",id)});var other=Convert.ToDecimal(await cmd.ExecuteScalarAsync()??0m);
                    if(limit>0 && other+total>limit+0.005m) return Results.BadRequest(new{message=$"Credit limit exceeded. Available ₹{Math.Max(0,limit-other):0.00}, bill ₹{total:0.00}"});
                    btcDue=DateTime.Today.AddDays(Math.Max(0,days));paid=0;
                }
                else if(mode.Equals("Credit/UPI",StringComparison.OrdinalIgnoreCase))
                {
                    var type=string.Equals(x.PaymentType,"Credit",StringComparison.OrdinalIgnoreCase)?"Credit":"UPI";
                    parts.Add(new("Credit/UPI",type,total,x.ReferenceNo));paid=type=="Credit"?0:total;
                }
                else
                {
                    parts=(x.Payments??new List<BillPaymentPart>()).Where(p=>p.Amount>0&&!string.Equals(p.Type,"BTC",StringComparison.OrdinalIgnoreCase)).ToList();
                    if(parts.Count==0) return Results.BadRequest(new{message="Add at least one Multi Mode payment part"});
                    var sum=parts.Sum(p=>p.Amount);
                    if(Math.Abs(sum-total)>0.01m) return Results.BadRequest(new{message=$"Multi Mode total must equal bill total ₹{total:0.00}. Entered ₹{sum:0.00}."});
                    paid=parts.Where(p=>!string.Equals(p.Type,"Credit",StringComparison.OrdinalIgnoreCase)).Sum(p=>p.Amount);
                }

                if(oldMode.Equals("BTC",StringComparison.OrdinalIgnoreCase)&&settled<=0.005m)
                {
                    cmd=new SqlCommand("DELETE FROM BtcCompanyLedger WHERE ReferenceType='SALE' AND ReferenceId=@id AND EntryType='INVOICE'",c,tx);cmd.Parameters.Add(P("@id",id));await cmd.ExecuteNonQueryAsync();
                }

                cmd=new SqlCommand(@"DELETE FROM SalePayments WHERE SaleId=@id;
UPDATE Sales SET PaymentMode=@m,PaidAmount=@p,
 BtcCompanyId=@bc,BtcReferenceNo=CASE WHEN @bc IS NULL THEN NULL ELSE @r END,
 BtcDueDate=@due,PendingAmount=CASE WHEN @bc IS NULL THEN 0 ELSE @pending END,
 PaymentStatus=CASE WHEN @bc IS NOT NULL THEN 'Pending' WHEN @p>=GrandTotal THEN 'Paid' ELSE 'Pending' END,
 CustomerName=CASE WHEN @bc IS NULL THEN CustomerName ELSE @cn END,
 ModifiedAt=SYSDATETIME(),ModifiedBy=@u,ModificationCount=ISNULL(ModificationCount,0)+1,LastModificationType='PAYMENT'
WHERE Id=@id",c,tx);
                cmd.Parameters.AddRange(new[]{P("@id",id),P("@m",mode),P("@p",Math.Min(total,Math.Max(0,paid))),P("@u",user),
                    P("@bc",btcCompanyId),P("@r",x.ReferenceNo),P("@due",btcDue),P("@pending",btcCompanyId.HasValue?total:0m),P("@cn",btcCompanyName)});
                await cmd.ExecuteNonQueryAsync();

                foreach(var p in parts)
                {
                    cmd=new SqlCommand("INSERT SalePayments(SaleId,PaymentMode,PaymentType,Amount,ReferenceNo) VALUES(@s,@m,@t,@a,@r)",c,tx);
                    cmd.Parameters.AddRange(new[]{P("@s",id),P("@m",mode),P("@t",p.Type),P("@a",p.Amount),P("@r",p.ReferenceNo)});await cmd.ExecuteNonQueryAsync();
                }
                if(btcCompanyId.HasValue)
                {
                    cmd=new SqlCommand(@"INSERT BtcCompanyLedger(CompanyId,EntryType,ReferenceType,ReferenceId,ReferenceNo,Debit,Credit,Notes)
VALUES(@c,'INVOICE','SALE',@id,@inv,@a,0,@n)",c,tx);
                    cmd.Parameters.AddRange(new[]{P("@c",btcCompanyId),P("@id",id),P("@inv",invoice),P("@a",total),P("@n","BTC invoice assigned from Bill Management")});await cmd.ExecuteNonQueryAsync();
                }

                cmd=new SqlCommand("INSERT AuditLogs(UserName,Action,Entity,EntityId,Details) VALUES(@u,'BILL_PAYMENT_CHANGED','Sale',@id,@d)",c,tx);
                cmd.Parameters.AddRange(new[]{P("@u",user),P("@id",id),P("@d",$"{invoice}: {oldMode} -> {mode}; BTC company={btcCompanyName}; paid={paid:0.00}; reason={x.Reason}")});await cmd.ExecuteNonQueryAsync();
                await tx.CommitAsync();return Results.Ok(new{id,paymentMode=mode,paidAmount=paid,btcCompanyId,btcCompanyName,pending=btcCompanyId.HasValue?total:0m});
            }
            catch(Exception ex){await tx.RollbackAsync();return Results.BadRequest(new{message=ex.Message});}
        });
    }

    static BillPaymentSync SyncExistingPayments(string mode,decimal total,List<BillPaymentPart> existing,decimal oldPaid)
    {
        var parts=new List<BillPaymentPart>();decimal paid=0;
        if(mode.Equals("Cash",StringComparison.OrdinalIgnoreCase)){parts.Add(new("Cash","Cash",total,null));paid=total;}
        else if(mode.Equals("BTC",StringComparison.OrdinalIgnoreCase)){parts.Add(new("BTC","BTC",total,null));paid=total;}
        else if(mode.Equals("Credit/UPI",StringComparison.OrdinalIgnoreCase))
        {
            var credit=existing.Any(p=>string.Equals(p.Type,"Credit",StringComparison.OrdinalIgnoreCase));
            var type=credit?"Credit":"UPI";parts.Add(new("Credit/UPI",type,total,existing.FirstOrDefault()?.ReferenceNo));paid=credit?0:total;
        }
        else
        {
            var nonCredit=existing.Where(p=>!string.Equals(p.Type,"Credit",StringComparison.OrdinalIgnoreCase)&&p.Amount>0).ToList();
            var nonCreditSum=nonCredit.Sum(p=>p.Amount);
            if(nonCreditSum<=0){var p=Math.Min(total,Math.Max(0,oldPaid));if(p>0)parts.Add(new("Multi Mode","Paid",p,null));if(total>p)parts.Add(new("Multi Mode","Credit",total-p,null));paid=p;}
            else if(nonCreditSum<=total)
            {
                parts.AddRange(nonCredit.Select(p=>p with{Mode="Multi Mode"}));paid=nonCreditSum;
                if(total>nonCreditSum)parts.Add(new("Multi Mode","Credit",total-nonCreditSum,null));
            }
            else
            {
                var scale=total/nonCreditSum;
                foreach(var p in nonCredit){var a=Math.Round(p.Amount*scale,2);if(a>0)parts.Add(p with{Mode="Multi Mode",Amount=a});}
                var diff=total-parts.Sum(p=>p.Amount);if(parts.Count>0&&Math.Abs(diff)>0)parts[0]=parts[0] with{Amount=parts[0].Amount+diff};paid=total;
            }
        }
        return new(parts,Math.Min(total,Math.Max(0,paid)));
    }

    public record BillEditRequest(string? Action,int? CustomerId,string? CustomerName,string? DiscountType,decimal DiscountValue,string? Notes,List<BillEditLine> Lines);
    public record BillEditLine(int ProductId,string? UnitSold,decimal SoldQty,decimal RatePerSoldUnit,decimal TaxRate);
    public record BillResolvedLine(int ProductId,string UnitSold,decimal SoldQty,decimal Factor,decimal BaseQty,decimal SoldRate,decimal BaseRate,decimal TaxRate);
    public record BillPaymentPart(string Mode,string? Type,decimal Amount,string? ReferenceNo);
    public record BillPaymentChangeRequest(string PaymentMode,string? PaymentType,string? ReferenceNo,string? Reason,List<BillPaymentPart>? Payments=null,int? BtcCompanyId=null);
    public record BillPaymentSync(List<BillPaymentPart> Parts,decimal Paid);
}
