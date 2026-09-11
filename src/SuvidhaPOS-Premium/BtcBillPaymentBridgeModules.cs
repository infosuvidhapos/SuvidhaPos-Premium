using Microsoft.Data.SqlClient;
using SuvidhaPOS.Premium.Data;

namespace SuvidhaPOS.Premium;

public static class BtcBillPaymentBridgeModules
{
    static SqlParameter P(string n, object? v) => new(n, v ?? DBNull.Value);
    static string UserName(HttpContext ctx)
    {
        var u=ctx.Items["User"];
        return u?.GetType().GetProperty("UserName")?.GetValue(u)?.ToString() ?? "Unknown";
    }

    public static void Map(WebApplication app)
    {
        app.MapPut("/api/btc/bill/{id:int}/payment-mode", async (Db db, HttpContext ctx, int id, BtcBillPaymentModeRequest x) =>
        {
            if (id <= 0) return Results.BadRequest(new { message = "Invalid bill" });
            var mode=(x.PaymentMode??"").Trim();
            if(!mode.Equals("BTC",StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { message = "This endpoint is only for Bill To Company conversion" });
            if(x.CompanyId<=0) return Results.BadRequest(new { message = "Select Customer / Company for BTC" });

            using var c=db.CreateConnection();
            await c.OpenAsync();
            using var tx=c.BeginTransaction();
            try
            {
                string status,invoice,oldMode,companyName;
                decimal total;
                int creditDays;
                using(var cmd=new SqlCommand(@"SELECT Status,InvoiceNo,GrandTotal,PaymentMode FROM Sales WITH(UPDLOCK,ROWLOCK) WHERE Id=@id",c,tx))
                {
                    cmd.Parameters.Add(P("@id",id));
                    using var rd=await cmd.ExecuteReaderAsync();
                    if(!await rd.ReadAsync()) return Results.NotFound(new { message = "Bill not found" });
                    status=rd.GetString(0);invoice=rd.GetString(1);total=rd.GetDecimal(2);oldMode=rd.GetString(3);
                }
                if(!status.Equals("Completed",StringComparison.OrdinalIgnoreCase))
                    return Results.BadRequest(new { message = "Only completed bills can change to BTC" });

                using(var settled=new SqlCommand("SELECT COUNT(*) FROM BtcSettlementAllocations WHERE SaleId=@id",c,tx))
                {
                    settled.Parameters.Add(P("@id",id));
                    if(Convert.ToInt32(await settled.ExecuteScalarAsync())>0)
                        return Results.BadRequest(new { message = "This bill already has BTC settlement history and cannot be reassigned" });
                }

                using(var cmd=new SqlCommand("SELECT CompanyName,CreditDays FROM BtcCompanies WHERE Id=@cid AND IsActive=1",c,tx))
                {
                    cmd.Parameters.Add(P("@cid",x.CompanyId));
                    using var rd=await cmd.ExecuteReaderAsync();
                    if(!await rd.ReadAsync()) return Results.BadRequest(new { message = "Selected Customer / Company is not active" });
                    companyName=rd.GetString(0);creditDays=rd.GetInt32(1);
                }

                using(var cmd=new SqlCommand(@"DELETE FROM SalePayments WHERE SaleId=@id;
DELETE FROM BtcCompanyLedger WHERE ReferenceType='SALE' AND ReferenceId=@id AND EntryType='INVOICE';
UPDATE Sales SET CustomerName=@cn,PaymentMode='BTC',PaidAmount=0,BtcCompanyId=@cid,BtcReferenceNo=@ref,
 PaymentStatus='Pending',PendingAmount=GrandTotal,BtcDueDate=DATEADD(day,@days,CAST(GETDATE() AS date)),
 ModifiedAt=SYSDATETIME(),ModifiedBy=@u,ModificationCount=ISNULL(ModificationCount,0)+1,LastModificationType='PAYMENT'
WHERE Id=@id;
INSERT BtcCompanyLedger(CompanyId,EntryType,ReferenceType,ReferenceId,ReferenceNo,Debit,Credit,Notes)
VALUES(@cid,'INVOICE','SALE',@id,@inv,@amt,0,'Bill payment mode changed to BTC');
INSERT AuditLogs(UserName,Action,Entity,EntityId,Details)
VALUES(@u,'BILL_PAYMENT_CHANGED','Sale',@id,@detail);",c,tx))
                {
                    cmd.Parameters.AddRange(new[]{
                        P("@id",id),P("@cn",companyName),P("@cid",x.CompanyId),P("@ref",x.ReferenceNo),
                        P("@days",creditDays),P("@u",UserName(ctx)),P("@inv",invoice),P("@amt",total),
                        P("@detail",$"{invoice}: {oldMode} -> BTC; Company={companyName}; Pending={total:0.00}; reason={x.Reason}")
                    });
                    await cmd.ExecuteNonQueryAsync();
                }

                await tx.CommitAsync();
                return Results.Ok(new { id, paymentMode="BTC", companyId=x.CompanyId, companyName, paidAmount=0m, pendingAmount=total });
            }
            catch(Exception ex)
            {
                await tx.RollbackAsync();
                return Results.BadRequest(new { message=ex.Message });
            }
        });
    }

    public record BtcBillPaymentModeRequest(string? PaymentMode,int CompanyId,string? ReferenceNo,string? Reason);
}
