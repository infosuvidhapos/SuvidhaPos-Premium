using System.Data;
using Microsoft.Data.SqlClient;
using SuvidhaPOS.Premium.Data;

namespace SuvidhaPOS.Premium;

public static class InventoryMasterModules
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/api/inventory/purchase-detail", async (Db db, DateTime? from, DateTime? to, string? q) =>
        {
            var f=(from??DateTime.Today.AddDays(-30)).Date;
            var e=(to??DateTime.Today).Date.AddDays(1);
            var term=(q??"").Trim(); var like="%"+term+"%";
            return Results.Ok(await db.QueryAsync(@"SELECT pu.PurchaseDate,pu.InvoiceNo,pu.SupplierName,p.Name ItemName,p.Barcode,p.Category,
 CAST(pl.Quantity AS decimal(18,3)) Quantity,pl.CostPrice,pl.Mrp,pl.SalePrice,pl.TaxRate,pl.TaxAmount,
 b.BatchNo,b.ExpiryDate,pu.PaymentMode,pu.PaidAmount
 FROM PurchaseLines pl
 JOIN Purchases pu ON pu.Id=pl.PurchaseId
 JOIN Products p ON p.Id=pl.ProductId
 JOIN ProductBatches b ON b.Id=pl.BatchId
 WHERE pu.PurchaseDate>=@f AND pu.PurchaseDate<@e
 AND (@q='' OR pu.InvoiceNo LIKE @like OR pu.SupplierName LIKE @like OR p.Name LIKE @like OR ISNULL(p.Barcode,'') LIKE @like)
 ORDER BY pu.PurchaseDate DESC,pu.Id DESC,pl.Id", P("@f",f),P("@e",e),P("@q",term),P("@like",like)));
        });

        app.MapPost("/api/inventory/damage", async (Db db,HttpContext ctx,DamageRequest x) =>
        {
            if(x.ProductId<=0||x.Quantity<=0||x.Quantity!=Math.Round(x.Quantity,3))
                return Results.BadRequest(new{message="Select an item and enter a positive quantity up to 3 decimals"});
            if(string.IsNullOrWhiteSpace(x.Reason))return Results.BadRequest(new{message="Damage reason is required"});
            using var c=db.CreateConnection();await c.OpenAsync();using var tx=c.BeginTransaction(IsolationLevel.Serializable);
            try
            {
                var product=await ProductName(c,tx,x.ProductId);
                var no="DMG-"+DateTime.Now.ToString("yyyyMMddHHmmssfff");
                using var head=Cmd(c,tx,@"INSERT StockDamageEntries(DamageNo,DamageDate,Reason,Notes,CreatedBy)
 OUTPUT INSERTED.Id VALUES(@no,SYSDATETIME(),@r,@n,@u)",P("@no",no),P("@r",x.Reason.Trim()),P("@n",Blank(x.Notes)),P("@u",Actor(ctx)));
                var id=Convert.ToInt32(await head.ExecuteScalarAsync());
                decimal rem=x.Quantity;
                while(rem>0)
                {
                    var batch=await NextBatch(c,tx,x.ProductId,saleableOnly:false);
                    if(batch is null)throw new InvalidOperationException("Damage quantity exceeds available stock for "+product);
                    var take=Math.Min(rem,batch.Value.Qty);
                    using var cmd=Cmd(c,tx,@"UPDATE ProductBatches SET Quantity=Quantity-@q WHERE Id=@b;
 INSERT StockDamageLines(DamageId,ProductId,BatchId,Quantity,CostPrice) VALUES(@d,@p,@b,@q,@c);
 INSERT StockLedger(ProductId,BatchId,MovementType,Quantity,ReferenceType,ReferenceId,Notes)
 VALUES(@p,@b,'DAMAGE',-@q,'DAMAGE',@d,@n);",
                        P("@q",take),P("@b",batch.Value.Id),P("@d",id),P("@p",x.ProductId),P("@c",batch.Value.Cost),P("@n",x.Reason.Trim()));
                    await cmd.ExecuteNonQueryAsync(); rem-=take;
                }
                await Audit(c,tx,Actor(ctx),"STOCK_DAMAGE","StockDamage",id,$"{product}; Qty={x.Quantity}; Reason={x.Reason}");
                await tx.CommitAsync();return Results.Ok(new{id,damageNo=no,quantity=x.Quantity});
            }
            catch(Exception ex){await tx.RollbackAsync();return Results.BadRequest(new{message=ex.Message});}
        });

        app.MapPost("/api/inventory/receive", async (Db db,HttpContext ctx,ReceiveRequest x) =>
        {
            if(x.ProductId<=0||x.Quantity<=0||x.Quantity!=Math.Round(x.Quantity,3))
                return Results.BadRequest(new{message="Select an item and enter a positive quantity up to 3 decimals"});
            using var c=db.CreateConnection();await c.OpenAsync();using var tx=c.BeginTransaction(IsolationLevel.Serializable);
            try
            {
                using var prod=Cmd(c,tx,"SELECT Name,PurchasePrice,SalePrice,Mrp FROM Products WITH(UPDLOCK) WHERE Id=@p AND IsActive=1",P("@p",x.ProductId));
                using var rd=await prod.ExecuteReaderAsync();if(!await rd.ReadAsync())throw new InvalidOperationException("Item is inactive or missing");
                var name=rd.GetString(0);var cost=x.CostPrice>0?x.CostPrice:rd.GetDecimal(1);var sale=x.SalePrice>0?x.SalePrice:rd.GetDecimal(2);var mrp=x.Mrp>0?x.Mrp:rd.GetDecimal(3);await rd.CloseAsync();
                var batchNo=string.IsNullOrWhiteSpace(x.BatchNo)?"REC-"+DateTime.Now.ToString("yyyyMMddHHmmssfff"):x.BatchNo.Trim();
                var expiry=(x.ExpiryDate??new DateTime(9999,12,31)).Date;
                var no="RCV-"+DateTime.Now.ToString("yyyyMMddHHmmssfff");
                using var head=Cmd(c,tx,@"INSERT StockReceipts(ReceiptNo,ReceiptDate,SourceName,ReferenceNo,Notes,CreatedBy)
 OUTPUT INSERTED.Id VALUES(@no,SYSDATETIME(),@s,@r,@n,@u)",P("@no",no),P("@s",Blank(x.SourceName)),P("@r",Blank(x.ReferenceNo)),P("@n",Blank(x.Notes)),P("@u",Actor(ctx)));
                var id=Convert.ToInt32(await head.ExecuteScalarAsync());
                using var find=Cmd(c,tx,@"SELECT TOP 1 Id FROM ProductBatches WITH(UPDLOCK)
 WHERE ProductId=@p AND BatchNo=@b AND ExpiryDate=@e AND CostPrice=@c AND SellingPrice=@s AND Mrp=@m ORDER BY Id DESC",
                    P("@p",x.ProductId),P("@b",batchNo),P("@e",expiry),P("@c",cost),P("@s",sale),P("@m",mrp));
                var found=await find.ExecuteScalarAsync();int bid;
                if(found is null||found is DBNull)
                {
                    using var add=Cmd(c,tx,@"INSERT ProductBatches(ProductId,BatchNo,Quantity,CostPrice,SellingPrice,Mrp,ExpiryDate)
 OUTPUT INSERTED.Id VALUES(@p,@b,@q,@c,@s,@m,@e)",P("@p",x.ProductId),P("@b",batchNo),P("@q",x.Quantity),P("@c",cost),P("@s",sale),P("@m",mrp),P("@e",expiry));
                    bid=Convert.ToInt32(await add.ExecuteScalarAsync());
                }
                else
                {
                    bid=Convert.ToInt32(found);
                    using var inc=Cmd(c,tx,"UPDATE ProductBatches SET Quantity=Quantity+@q WHERE Id=@b",P("@q",x.Quantity),P("@b",bid));await inc.ExecuteNonQueryAsync();
                }
                using(var line=Cmd(c,tx,@"INSERT StockReceiptLines(ReceiptId,ProductId,BatchId,Quantity,CostPrice) VALUES(@r,@p,@b,@q,@c);
 INSERT StockLedger(ProductId,BatchId,MovementType,Quantity,ReferenceType,ReferenceId,Notes)
 VALUES(@p,@b,'STOCK_RECEIVE',@q,'STOCK_RECEIVE',@r,@n);",
                    P("@r",id),P("@p",x.ProductId),P("@b",bid),P("@q",x.Quantity),P("@c",cost),P("@n",Blank(x.ReferenceNo)??Blank(x.SourceName)))) await line.ExecuteNonQueryAsync();
                await Audit(c,tx,Actor(ctx),"STOCK_RECEIVE","StockReceipt",id,$"{name}; Qty={x.Quantity}; Ref={x.ReferenceNo}");
                await tx.CommitAsync();return Results.Ok(new{id,receiptNo=no,batchId=bid,quantity=x.Quantity});
            }
            catch(Exception ex){await tx.RollbackAsync();return Results.BadRequest(new{message=ex.Message});}
        });

        app.MapPost("/api/inventory/transfer", async (Db db,HttpContext ctx,TransferRequest x) =>
        {
            if(x.Lines is null||x.Lines.Count==0)return Results.BadRequest(new{message="Add at least one transfer item"});
            var to=(x.ToOutlet??"").Trim();if(string.IsNullOrWhiteSpace(to))return Results.BadRequest(new{message="Destination outlet is required"});
            using var c=db.CreateConnection();await c.OpenAsync();using var tx=c.BeginTransaction(IsolationLevel.Serializable);
            try
            {
                using var local=Cmd(c,tx,"SELECT TOP 1 OutletName FROM OutletMaster ORDER BY Id");
                var from=(await local.ExecuteScalarAsync())?.ToString()?.Trim()??"Main Outlet";
                if(string.Equals(from,to,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("Source and destination outlet cannot be the same");
                var no="TRF-"+DateTime.Now.ToString("yyyyMMddHHmmssfff");
                using var head=Cmd(c,tx,@"INSERT StockTransfers(TransferNo,TransferDate,FromOutlet,ToOutlet,Status,Notes,CreatedBy)
 OUTPUT INSERTED.Id VALUES(@no,SYSDATETIME(),@f,@t,'IN_TRANSIT',@n,@u)",
                    P("@no",no),P("@f",from),P("@t",to),P("@n",Blank(x.Notes)),P("@u",Actor(ctx)));
                var id=Convert.ToInt32(await head.ExecuteScalarAsync());
                foreach(var l in x.Lines)
                {
                    if(l.ProductId<=0||l.Quantity<=0||l.Quantity!=Math.Round(l.Quantity,3))throw new InvalidOperationException("Every transfer item needs a positive quantity up to 3 decimals");
                    var name=await ProductName(c,tx,l.ProductId);decimal rem=l.Quantity;
                    while(rem>0)
                    {
                        var batch=await NextBatch(c,tx,l.ProductId,saleableOnly:true);
                        if(batch is null)throw new InvalidOperationException("Transfer quantity exceeds saleable stock for "+name);
                        var take=Math.Min(rem,batch.Value.Qty);
                        using var cmd=Cmd(c,tx,@"UPDATE ProductBatches SET Quantity=Quantity-@q WHERE Id=@b;
 INSERT StockTransferLines(TransferId,ProductId,BatchId,Quantity,CostPrice) VALUES(@t,@p,@b,@q,@c);
 INSERT StockLedger(ProductId,BatchId,MovementType,Quantity,ReferenceType,ReferenceId,Notes)
 VALUES(@p,@b,'STOCK_TRANSFER_OUT',-@q,'STOCK_TRANSFER',@t,@n);",
                            P("@q",take),P("@b",batch.Value.Id),P("@t",id),P("@p",l.ProductId),P("@c",batch.Value.Cost),P("@n","To "+to));
                        await cmd.ExecuteNonQueryAsync();rem-=take;
                    }
                }
                await Audit(c,tx,Actor(ctx),"STOCK_TRANSFER","StockTransfer",id,$"{from} -> {to}; Lines={x.Lines.Count}");
                await tx.CommitAsync();return Results.Ok(new{id,transferNo=no,fromOutlet=from,toOutlet=to,status="IN_TRANSIT"});
            }
            catch(Exception ex){await tx.RollbackAsync();return Results.BadRequest(new{message=ex.Message});}
        });

        app.MapGet("/api/inventory/transfers", async (Db db,DateTime? from,DateTime? to,string? q) =>
        {
            var f=(from??DateTime.Today.AddDays(-30)).Date;var e=(to??DateTime.Today).Date.AddDays(1);var term=(q??"").Trim();var like="%"+term+"%";
            return Results.Ok(await db.QueryAsync(@"SELECT t.Id,t.TransferNo,t.TransferDate,t.FromOutlet,t.ToOutlet,t.Status,t.Notes,t.CreatedBy,
 p.Name ItemName,p.Barcode,l.Quantity,l.CostPrice,CAST(l.Quantity*l.CostPrice AS decimal(18,2)) CostValue,b.BatchNo,b.ExpiryDate
 FROM StockTransfers t JOIN StockTransferLines l ON l.TransferId=t.Id JOIN Products p ON p.Id=l.ProductId JOIN ProductBatches b ON b.Id=l.BatchId
 WHERE t.TransferDate>=@f AND t.TransferDate<@e AND (@q='' OR t.TransferNo LIKE @like OR t.FromOutlet LIKE @like OR t.ToOutlet LIKE @like OR p.Name LIKE @like OR ISNULL(p.Barcode,'') LIKE @like)
 ORDER BY t.TransferDate DESC,t.Id DESC,l.Id",P("@f",f),P("@e",e),P("@q",term),P("@like",like)));
        });

        app.MapGet("/api/inventory/stock-date-wise", async (Db db,DateTime? from,DateTime? to,string? q) =>
        {
            var f=(from??DateTime.Today.AddDays(-30)).Date;var e=(to??DateTime.Today).Date.AddDays(1);var term=(q??"").Trim();var like="%"+term+"%";
            return Results.Ok(await db.QueryAsync(@"WITH D AS(
 SELECT CAST(sl.CreatedAt AS date) StockDate,sl.ProductId,
 CAST(SUM(CASE WHEN sl.Quantity>0 THEN sl.Quantity ELSE 0 END) AS decimal(18,3)) InQty,
 CAST(SUM(CASE WHEN sl.Quantity<0 THEN -sl.Quantity ELSE 0 END) AS decimal(18,3)) OutQty,
 CAST(SUM(sl.Quantity) AS decimal(18,3)) NetQty
 FROM StockLedger sl WHERE sl.CreatedAt>=@f AND sl.CreatedAt<@e GROUP BY CAST(sl.CreatedAt AS date),sl.ProductId)
 SELECT d.StockDate,p.Name ItemName,p.Barcode,p.Category,p.Unit,
 CAST(ISNULL((SELECT SUM(s2.Quantity) FROM StockLedger s2 WHERE s2.ProductId=d.ProductId AND s2.CreatedAt<d.StockDate),0) AS decimal(18,3)) OpeningQty,
 d.InQty,d.OutQty,
 CAST(ISNULL((SELECT SUM(s3.Quantity) FROM StockLedger s3 WHERE s3.ProductId=d.ProductId AND s3.CreatedAt<DATEADD(day,1,d.StockDate)),0) AS decimal(18,3)) ClosingQty
 FROM D d JOIN Products p ON p.Id=d.ProductId
 WHERE (@q='' OR p.Name LIKE @like OR ISNULL(p.Barcode,'') LIKE @like OR ISNULL(p.Category,'') LIKE @like)
 ORDER BY d.StockDate DESC,p.Name",P("@f",f),P("@e",e),P("@q",term),P("@like",like)));
        });
    }

    static async Task<string> ProductName(SqlConnection c,SqlTransaction tx,int id)
    {
        using var cmd=Cmd(c,tx,"SELECT Name FROM Products WITH(UPDLOCK) WHERE Id=@p AND IsActive=1",P("@p",id));
        return (await cmd.ExecuteScalarAsync())?.ToString()??throw new InvalidOperationException("Item is inactive or missing");
    }
    static async Task<(int Id,decimal Qty,decimal Cost)?> NextBatch(SqlConnection c,SqlTransaction tx,int productId,bool saleableOnly)
    {
        using var cmd=Cmd(c,tx,@"SELECT TOP 1 Id,Quantity,CostPrice FROM ProductBatches WITH(UPDLOCK,ROWLOCK)
 WHERE ProductId=@p AND Quantity>0 "+(saleableOnly?"AND ExpiryDate>=CAST(GETDATE() AS date) ":"")+@"ORDER BY ExpiryDate,Id",P("@p",productId));
        using var r=await cmd.ExecuteReaderAsync();if(!await r.ReadAsync())return null;return(r.GetInt32(0),r.GetDecimal(1),r.GetDecimal(2));
    }
    static async Task Audit(SqlConnection c,SqlTransaction tx,string user,string action,string entity,int id,string details)
    {
        using var cmd=Cmd(c,tx,"INSERT AuditLogs(UserName,Action,Entity,EntityId,Details) VALUES(@u,@a,@e,@id,@d)",P("@u",user),P("@a",action),P("@e",entity),P("@id",id),P("@d",details));await cmd.ExecuteNonQueryAsync();
    }
    static string Actor(HttpContext ctx)
    {
        var u=ctx.Items["User"];return u?.GetType().GetProperty("UserName")?.GetValue(u)?.ToString()??"System";
    }
    static string? Blank(string? s)=>string.IsNullOrWhiteSpace(s)?null:s.Trim();
    static SqlParameter P(string n,object? v)=>new(n,v??DBNull.Value);
    static SqlCommand Cmd(SqlConnection c,SqlTransaction tx,string sql,params SqlParameter[] p){var cmd=new SqlCommand(sql,c,tx);cmd.Parameters.AddRange(p);return cmd;}

    public sealed record DamageRequest(int ProductId,decimal Quantity,string Reason,string? Notes);
    public sealed record ReceiveRequest(int ProductId,decimal Quantity,string? BatchNo,DateTime? ExpiryDate,decimal CostPrice,decimal SalePrice,decimal Mrp,string? SourceName,string? ReferenceNo,string? Notes);
    public sealed record TransferRequest(string? ToOutlet,string? Notes,List<TransferLine>? Lines);
    public sealed record TransferLine(int ProductId,decimal Quantity);
}
