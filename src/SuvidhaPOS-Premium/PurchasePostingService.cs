using System.Data;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using SuvidhaPOS.Premium.Data;
using Row=SuvidhaPOS.Premium.PurchaseImportModules.PurchaseImportRow;
using Request=SuvidhaPOS.Premium.PurchaseImportModules.PurchaseImportCommitRequest;

namespace SuvidhaPOS.Premium;

/// <summary>Revalidates under database locks, then posts every source line in one transaction.</summary>
public static class PurchasePostingService
{
    internal static readonly DateTime NoExpiry=new(9999,12,31);
    internal static SqlParameter P(string name,object? value)=>new(name,value??DBNull.Value);
    internal static SqlCommand Command(SqlConnection c,SqlTransaction? tx,string sql,params SqlParameter[] values){var cmd=new SqlCommand(sql,c,tx);cmd.Parameters.AddRange(values);return cmd;}
    internal static async Task Lock(SqlConnection c,SqlTransaction tx)
    {
        using var cmd=Command(c,tx,"DECLARE @r int;EXEC @r=sys.sp_getapplock @Resource='RetailMasterPurchase',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=30000;IF @r<0 THROW 50001,'Another retail save is in progress. Retry shortly.',1;");
        await cmd.ExecuteNonQueryAsync();
    }
    static string? RequestError(Request x)=>x.Rows is null||x.Rows.Count==0?"No purchase rows supplied":x.Rows.Count>20000?"Maximum 20,000 purchase rows":x.Discount<0||x.PaidAmount<0?"Discount and paid amount must be nonnegative":(x.RequestId?.Length??0)>100?"Request ID is too long":null;
    public static async Task<IResult> Preview(Db db,Request x)
    {
        var error=RequestError(x);if(error!=null)return Results.BadRequest(new{message=error});
        using var c=db.CreateConnection();await c.OpenAsync();
        if(x.SupplierId.HasValue&&string.IsNullOrWhiteSpace(x.SupplierName)){
            using var supplier=Command(c,null,"SELECT Name FROM Suppliers WHERE Id=@id AND IsActive=1",P("@id",x.SupplierId));x=x with{SupplierName=(await supplier.ExecuteScalarAsync())?.ToString()};
        }
        var data=await PurchaseImportRules.Load(c,null,false);var suppliers=await PurchaseImportRules.LoadSuppliers(c,null,false);var v=PurchaseImportRules.Validate(x,data.Masters,data.Units,data.Batch,data.Expiry,suppliers);
        return Results.Ok(new{requestId=string.IsNullOrWhiteSpace(x.RequestId)?Guid.NewGuid().ToString("N"):x.RequestId,previewToken=v.PreviewToken,sourceToken=x.SourceToken,rows=v.Rows,
            summary=new{total=v.Rows.Count,matched=v.Rows.Count(r=>r.ProductId>0),newItems=v.Groups.Count(g=>g.NewItem),conflicts=v.Rows.Count(r=>r.Conflict),errors=v.Rows.Count(r=>r.Errors.Count>0),warnings=v.Rows.Count(r=>r.Warnings.Count>0)},totals=v.Totals,groups=v.Groups});
    }
    public static async Task<IResult> Commit(Db db,Request x,string user)
    {
        var error=RequestError(x);if(error!=null)return Results.BadRequest(new{message=error});
        var requestId=string.IsNullOrWhiteSpace(x.RequestId)?Guid.NewGuid().ToString("N"):x.RequestId.Trim();var digest=PurchaseImportRules.Payload(x);
        using var c=db.CreateConnection();await c.OpenAsync();using var tx=c.BeginTransaction(IsolationLevel.Serializable);
        try{
            await Lock(c,tx);
            var replay=await Replay(c,tx,requestId,digest);if(replay!=null){await tx.CommitAsync();return replay;}
            if(!string.IsNullOrWhiteSpace(x.SourceToken)){if(!System.Text.RegularExpressions.Regex.IsMatch(x.SourceToken,"^[A-Fa-f0-9]{64}$"))throw new InvalidOperationException("Invalid source file fingerprint");using var source=Command(c,tx,"SELECT COUNT(*) FROM RetailPurchaseSources WITH(UPDLOCK,HOLDLOCK) WHERE SourceDigest=@d",P("@d",x.SourceToken.ToUpperInvariant()));if(Convert.ToInt32(await source.ExecuteScalarAsync())>0)throw new InvalidOperationException("This source file is already imported. Open the existing purchase instead of posting stock again.");}
            if(x.SupplierId.HasValue){using var supplier=Command(c,tx,"SELECT Name FROM Suppliers WITH(HOLDLOCK) WHERE Id=@id AND IsActive=1",P("@id",x.SupplierId));var name=(await supplier.ExecuteScalarAsync())?.ToString();if(name==null)throw new InvalidOperationException("Supplier is inactive or missing");if(!string.IsNullOrWhiteSpace(x.SupplierName)&&PurchaseImportRules.Key(x.SupplierName)!=PurchaseImportRules.Key(name))throw new InvalidOperationException("Selected supplier does not match the supplied supplier name");x=x with{SupplierName=name};}
            var data=await PurchaseImportRules.Load(c,tx,true);var suppliers=await PurchaseImportRules.LoadSuppliers(c,tx,true);var v=PurchaseImportRules.Validate(x,data.Masters,data.Units,data.Batch,data.Expiry,suppliers);
            if(v.Rows.Any(r=>r.Errors.Count>0))throw new InvalidOperationException("Correct purchase import errors: "+string.Join("; ",v.Rows.Where(r=>r.Errors.Count>0).Take(5).Select(r=>$"Row {r.RowNo}: {string.Join(", ",r.Errors)}")));
            if(!string.IsNullOrWhiteSpace(x.PreviewToken)&&x.PreviewToken!=v.PreviewToken)throw new InvalidOperationException("Item matches changed since preview. Validate and review the import again.");
            if(v.Totals.Total<0||x.PaidAmount>v.Totals.Total)throw new InvalidOperationException("Bill discount or paid amount exceeds the purchase total");
            var invoices=v.Rows.GroupBy(r=>PurchaseImportRules.Hash(new{Supplier=PurchaseImportRules.Key(r.SupplierName),Invoice=PurchaseImportRules.Key(r.InvoiceNo),Date=r.PurchaseDate!.Value.Date})).ToList();
            foreach(var invoice in invoices)await CheckInvoice(c,tx,invoice.Key,invoice.First().SupplierName!,invoice.First().InvoiceNo!,invoice.First().PurchaseDate!.Value);
            await SaveRequest(c,tx,requestId,digest,"{}");
            if(!string.IsNullOrWhiteSpace(x.SourceToken)){using var source=Command(c,tx,"INSERT RetailPurchaseSources(SourceDigest,RequestId) VALUES(@d,@r)",P("@d",x.SourceToken.ToUpperInvariant()),P("@r",requestId));await source.ExecuteNonQueryAsync();}
            var supplierIds=new Dictionary<string,int>();
            foreach(var group in v.Rows.GroupBy(r=>PurchaseImportRules.Key(r.SupplierName))){
                var first=group.First();int id=first.SupplierId;
                if(id==0){using var supplier=Command(c,tx,"INSERT Suppliers(Name) OUTPUT INSERTED.Id VALUES(@n)",P("@n",first.SupplierName));id=Convert.ToInt32(await supplier.ExecuteScalarAsync());}
                supplierIds[group.Key]=id;
            }
            var ids=new Dictionary<string,int>();
            foreach(var g in v.Groups){
                if(!g.NewItem){ids[g.GroupKey]=g.ProductId;continue;}
                var first=v.Rows.First(r=>r.GroupKey==g.GroupKey);
                using var cmd=Command(c,tx,@"INSERT Products(Name,Barcode,Category,Unit,Hsn,GstRate,TaxMode,Mrp,PurchasePrice,SalePrice,Dis_Rate,TrackBatch,TrackExpiry)
OUTPUT INSERTED.Id VALUES(@n,@b,@cat,@u,@h,@gst,@tm,@m,@cost,@sale,@disc,@batch,@expiry)",P("@n",first.ItemName),P("@b",first.EffectiveBarcode),P("@cat",first.Group),P("@u",first.Unit),P("@h",first.Hsn),P("@gst",first.GstRate),P("@tm",first.TaxMode),P("@m",g.Mrp),P("@cost",g.PurchasePrice),P("@sale",g.SalePrice),P("@disc",g.Discount),P("@batch",data.Batch),P("@expiry",data.Expiry));
                ids[g.GroupKey]=Convert.ToInt32(await cmd.ExecuteScalarAsync());
            }
            var purchaseIds=new List<int>();decimal remainingDiscount=x.Discount,remainingPaid=x.PaidAmount;
            foreach(var invoice in invoices){
                var first=invoice.First();decimal tax=0,sub=0;
                foreach(var r in invoice){var amount=Math.Round(r.Qty*r.PurchaseRate,2,MidpointRounding.AwayFromZero);var t=PurchaseImportRules.Tax(amount,r.GstRate,r.TaxMode);tax+=t;sub+=r.TaxMode=="INCLUSIVE"?amount-t:amount;}
                var discount=Math.Min(remainingDiscount,sub+tax);remainingDiscount-=discount;var total=sub+tax-discount;var paid=Math.Min(remainingPaid,total);remainingPaid-=paid;
                int purchaseId=await Head(c,tx,first.InvoiceNo!,supplierIds[PurchaseImportRules.Key(first.SupplierName)],first.SupplierName!,first.PurchaseDate!.Value,sub,discount,tax,total,x.PaymentMode,paid,"Purchase bill import");purchaseIds.Add(purchaseId);
                foreach(var r in invoice)await Line(c,tx,purchaseId,ids[r.GroupKey],r.BatchNo,(r.Qty+r.FreeQuantity)*r.BaseFactor,r.Qty*r.BaseFactor,r.FreeQuantity*r.BaseFactor,r.PurchaseRate/r.BaseFactor,r.Mrp/r.BaseFactor,PurchaseImportRules.Sale(r.Mrp,r.Discount)/r.BaseFactor,r.GstRate,PurchaseImportRules.Tax(Math.Round(r.Qty*r.PurchaseRate,2,MidpointRounding.AwayFromZero),r.GstRate,r.TaxMode),r.Discount,r.TaxMode!,null,r.ExpiryDate,r.Unit,r.Qty,r.PurchaseRate);
                await Invoice(c,tx,invoice.Key,PurchaseImportRules.Hash(invoice.Select(r=>new{r.ItemName,r.Qty,r.PurchaseRate,r.Barcode,r.GstRate,r.Mrp,r.Discount})),purchaseId,requestId);
            }
            var result=new{purchaseIds,id=purchaseIds[0],invoiceNo=string.Join(", ",invoices.Select(g=>g.First().InvoiceNo)),total=v.Totals.Total,newItems=v.Groups.Count(g=>g.NewItem),existingItems=v.Groups.Count(g=>!g.NewItem),alreadyImported=false,requestId};
            await Finish(c,tx,requestId,result,user,"PURCHASE_IMPORT",purchaseIds[0]);await tx.CommitAsync();return Results.Ok(result);
        }catch(Exception ex)when(ex is InvalidOperationException or SqlException or OverflowException){await tx.RollbackAsync();return Results.BadRequest(new{message=ex.Message});}
    }
    internal static async Task<IResult?> Replay(SqlConnection c,SqlTransaction tx,string id,string digest)
    {
        using var cmd=Command(c,tx,"SELECT PayloadDigest,ResultJson FROM RetailPurchaseRequests WITH(UPDLOCK,HOLDLOCK) WHERE RequestId=@id",P("@id",id));using var r=await cmd.ExecuteReaderAsync();if(!await r.ReadAsync())return null;
        if(r.GetString(0)!=digest)throw new InvalidOperationException("Request ID already used with a different payload");
        var result=JsonSerializer.Deserialize<Dictionary<string,JsonElement>>(r.GetString(1))!;result["alreadyImported"]=JsonSerializer.SerializeToElement(true);return Results.Ok(result);
    }
    internal static async Task CheckInvoice(SqlConnection c,SqlTransaction tx,string key,string supplier,string invoice,DateTime date)
    {
        using var cmd=Command(c,tx,@"SELECT CASE WHEN EXISTS(SELECT 1 FROM RetailPurchaseInvoices WITH(UPDLOCK,HOLDLOCK) WHERE InvoiceKey=@k) OR EXISTS(SELECT 1 FROM Purchases WITH(UPDLOCK,HOLDLOCK) WHERE UPPER(LTRIM(RTRIM(SupplierName)))=UPPER(@s) AND UPPER(LTRIM(RTRIM(InvoiceNo)))=UPPER(@i) AND CAST(PurchaseDate AS date)=@d) THEN 1 ELSE 0 END",P("@k",key),P("@s",supplier),P("@i",invoice),P("@d",date.Date));if(Convert.ToInt32(await cmd.ExecuteScalarAsync())!=0)throw new InvalidOperationException("Supplier invoice is already imported: "+invoice);
    }
    internal static async Task SaveRequest(SqlConnection c,SqlTransaction tx,string id,string digest,string result){using var cmd=Command(c,tx,"INSERT RetailPurchaseRequests(RequestId,PayloadDigest,ResultJson) VALUES(@id,@d,@r)",P("@id",id),P("@d",digest),P("@r",result));await cmd.ExecuteNonQueryAsync();}
    internal static async Task Finish(SqlConnection c,SqlTransaction tx,string requestId,object result,string user,string action,int id){using var cmd=Command(c,tx,"UPDATE RetailPurchaseRequests SET ResultJson=@r WHERE RequestId=@id;INSERT AuditLogs(UserName,Action,Entity,EntityId,Details) VALUES(@u,@a,'Purchases',@p,@details)",P("@r",JsonSerializer.Serialize(result)),P("@id",requestId),P("@u",user.Length>80?user[..80]:user),P("@a",action),P("@p",id),P("@details","Request "+requestId));await cmd.ExecuteNonQueryAsync();}
    internal static async Task Invoice(SqlConnection c,SqlTransaction tx,string key,string digest,int id,string request){using var cmd=Command(c,tx,"INSERT RetailPurchaseInvoices(InvoiceKey,ContentDigest,PurchaseId,RequestId) VALUES(@k,@d,@p,@r)",P("@k",key),P("@d",digest),P("@p",id),P("@r",request));await cmd.ExecuteNonQueryAsync();}
    internal static async Task<int> Head(SqlConnection c,SqlTransaction tx,string invoice,int? supplierId,string supplier,DateTime date,decimal sub,decimal discount,decimal tax,decimal total,string? mode,decimal paid,string? notes){using var cmd=Command(c,tx,@"INSERT Purchases(InvoiceNo,SupplierId,SupplierName,PurchaseDate,SubTotal,Discount,Tax,GrandTotal,PaymentMode,PaidAmount,Notes) OUTPUT INSERTED.Id VALUES(@i,@sid,@s,@date,@sub,@d,@tax,@total,@mode,@paid,@notes)",P("@i",invoice),P("@sid",supplierId),P("@s",supplier),P("@date",date),P("@sub",sub),P("@d",discount),P("@tax",tax),P("@total",total),P("@mode",mode??"Credit"),P("@paid",paid),P("@notes",notes));return Convert.ToInt32(await cmd.ExecuteScalarAsync());}
    internal static async Task Line(SqlConnection c,SqlTransaction tx,int purchase,int product,string? batch,decimal stock,decimal qty,decimal free,decimal cost,decimal mrp,decimal sale,decimal gst,decimal tax,decimal? discount,string mode,DateTime? manufacture,DateTime? expiry,string? unit,decimal purchasedQty,decimal purchasedRate)
    {
        using var cmd=Command(c,tx,@"INSERT ProductBatches(ProductId,BatchNo,Quantity,CostPrice,SellingPrice,Mrp,ManufactureDate,ExpiryDate,Dis_Rate,TaxMode) VALUES(@p,@batch,@stock,@cost,@sale,@mrp,@md,@ed,@disc,@mode);
DECLARE @b int=CAST(SCOPE_IDENTITY() AS int);
INSERT PurchaseLines(PurchaseId,ProductId,BatchId,Quantity,FreeQuantity,CostPrice,Mrp,SalePrice,TaxRate,TaxAmount,UnitPurchased,PurchasedQty,TotalBaseQty,RatePerPurchasedUnit,Dis_Rate,TaxMode) VALUES(@id,@p,@b,@q,@free,@cost,@mrp,@sale,@gst,@tax,@u,@pq,@q,@rate,@disc,@mode);
INSERT StockLedger(ProductId,BatchId,MovementType,Quantity,ReferenceType,ReferenceId) VALUES(@p,@b,'PURCHASE',@stock,'PURCHASE',@id)",P("@p",product),P("@batch",string.IsNullOrWhiteSpace(batch)?"B-"+Guid.NewGuid().ToString("N")[..12]:batch),P("@stock",stock),P("@cost",cost),P("@sale",sale),P("@mrp",mrp),P("@md",manufacture),P("@ed",expiry??NoExpiry),P("@disc",discount),P("@mode",mode),P("@id",purchase),P("@q",qty),P("@free",free),P("@gst",gst),P("@tax",tax),P("@u",unit),P("@pq",purchasedQty),P("@rate",purchasedRate));await cmd.ExecuteNonQueryAsync();
    }
}
