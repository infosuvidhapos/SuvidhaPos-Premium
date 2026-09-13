using System.Data;
using Microsoft.Data.SqlClient;
using SuvidhaPOS.Premium.Data;
using static SuvidhaPOS.Premium.PurchasePostingService;

namespace SuvidhaPOS.Premium;

public static class RetailItemRules
{
    internal static async Task<IResult> Save(Db db,int? id,global::ProductRequest x)
    {
        if(string.IsNullOrWhiteSpace(x.Name))return Results.BadRequest(new{message="Product name is required"});
        if(x.DiscountPer is <0 or >100||x.Mrp<0||x.PurchasePrice<0||x.SalePrice<0||x.GstRate<0||x.GstRate>100)return Results.BadRequest(new{message="Rates must be nonnegative and GST/discount must be between 0 and 100"});
        var mode=string.IsNullOrWhiteSpace(x.TaxMode)?null:PurchaseImportRules.Key(x.TaxMode);
        if(mode!=null&&mode is not ("INCLUSIVE" or "EXCLUSIVE"))return Results.BadRequest(new{message="Tax mode must be INCLUSIVE or EXCLUSIVE"});
        using var c=db.CreateConnection();await c.OpenAsync();using var tx=c.BeginTransaction(IsolationLevel.Serializable);
        try{
            await Lock(c,tx);var data=await PurchaseImportRules.Load(c,tx,true);var old=id.HasValue?data.Masters.SingleOrDefault(m=>m.Id==id):null;
            if(id.HasValue&&old==null)throw new InvalidOperationException("Product does not exist");
            var name=PurchaseImportRules.Name(x.Name);var barcode=string.IsNullOrWhiteSpace(x.Barcode)?null:x.Barcode.Trim();
            if(data.Masters.Any(m=>m.Id!=id&&(PurchaseImportRules.Key(m.Name)==PurchaseImportRules.Key(name)||(barcode!=null&&PurchaseImportRules.Key(m.Barcode)==PurchaseImportRules.Key(barcode)))))throw new InvalidOperationException("Duplicate item name or barcode");
            var unit=PurchaseImportRules.ResolveUnit(x.Uom?.BaseUnit??x.Unit??old?.Unit??"PCS",data.Units)??throw new InvalidOperationException("Base unit is not in active Unit Master");
            if(old!=null)await CheckBaseChange(c,tx,old.Id,old.BaseUnit,unit);
            SpecializedModules.UomRequest? uom=x.Uom==null?null:NormalizeUom(x.Uom,data.Units);
            var sale=x.DiscountPer.HasValue?PurchaseImportRules.Sale(x.Mrp,x.DiscountPer.Value):x.SalePrice;
            using var cmd=Command(c,tx,id.HasValue?@"UPDATE Products SET Name=@n,Barcode=@b,Sku=@sku,CategoryId=@cid,Category=@cat,Unit=@unit,Hsn=@hsn,GstRate=@gst,TaxMode=COALESCE(@mode,TaxMode),Mrp=@mrp,PurchasePrice=@cost,SalePrice=CASE WHEN @disc IS NULL THEN SalePrice ELSE @sale END,Dis_Rate=COALESCE(@disc,Dis_Rate),MinStock=@min,MaxStock=@max,LocationCode=@loc,RackName=@rack,ShelfName=@shelf,TrackBatch=@batch,TrackExpiry=@expiry WHERE Id=@id;SELECT @id":@"INSERT Products(Name,Barcode,Sku,CategoryId,Category,Unit,Hsn,GstRate,TaxMode,Mrp,PurchasePrice,SalePrice,Dis_Rate,MinStock,MaxStock,LocationCode,RackName,ShelfName,TrackBatch,TrackExpiry) OUTPUT INSERTED.Id VALUES(@n,@b,@sku,@cid,@cat,@unit,@hsn,@gst,COALESCE(@mode,'INCLUSIVE'),@mrp,@cost,@sale,COALESCE(@disc,0),@min,@max,@loc,@rack,@shelf,@batch,@expiry)",
                P("@id",id),P("@n",name),P("@b",barcode),P("@sku",string.IsNullOrWhiteSpace(x.Sku)?null:x.Sku.Trim()),P("@cid",x.CategoryId),P("@cat",x.Category),P("@unit",unit),P("@hsn",x.Hsn),P("@gst",x.GstRate),P("@mode",mode),P("@mrp",x.Mrp),P("@cost",x.PurchasePrice),P("@sale",sale),P("@disc",x.DiscountPer),P("@min",x.MinStock),P("@max",x.MaxStock),P("@loc",x.LocationCode),P("@rack",x.RackName),P("@shelf",x.ShelfName),P("@batch",x.TrackBatch),P("@expiry",x.TrackExpiry));
            var productId=Convert.ToInt32(await cmd.ExecuteScalarAsync());
            if(uom!=null)await SaveUom(c,tx,productId,uom);
            if(uom==null&&x.DiscountPer.HasValue)await SyncRates(c,tx,productId,discount:true);
            await tx.CommitAsync();return Results.Ok(new{id=productId,itemCode=productId,updated=id.HasValue});
        }catch(Exception ex)when(ex is InvalidOperationException or SqlException or OverflowException){await tx.RollbackAsync();return Results.BadRequest(new{message=ex.Message});}
    }
    internal static async Task CheckBaseChange(SqlConnection c,SqlTransaction tx,int id,string before,string after)
    {
        if(PurchaseImportRules.UnitKey(before)==PurchaseImportRules.UnitKey(after))return;
        using var cmd=Command(c,tx,"SELECT CASE WHEN EXISTS(SELECT 1 FROM ProductBatches WITH(HOLDLOCK) WHERE ProductId=@id) OR EXISTS(SELECT 1 FROM StockLedger WITH(HOLDLOCK) WHERE ProductId=@id) OR EXISTS(SELECT 1 FROM PurchaseLines WITH(HOLDLOCK) WHERE ProductId=@id) OR EXISTS(SELECT 1 FROM SaleLines WITH(HOLDLOCK) WHERE ProductId=@id) THEN 1 ELSE 0 END",P("@id",id));
        if(Convert.ToInt32(await cmd.ExecuteScalarAsync())!=0)throw new InvalidOperationException("Base unit cannot change after stock or transaction history exists");
    }
    internal static SpecializedModules.UomRequest NormalizeUom(SpecializedModules.UomRequest x,List<PurchaseImportRules.UnitDefinition> units)
    {
        string Resolve(string raw)=>PurchaseImportRules.ResolveUnit(raw,units)??throw new InvalidOperationException("Unit is not in active Unit Master: "+raw);
        var b=Resolve(x.BaseUnit);var p=Resolve(x.PackUnit);var inner=string.IsNullOrWhiteSpace(x.InnerUnit)?null:Resolve(x.InnerUnit);
        if(x.ConversionFactor<=0||x.InnerConversionFactor<=0||x.PackInnerFactor<=0)throw new InvalidOperationException("Unit conversion factors must be greater than zero");
        if(new[]{x.PackPurchaseRate,x.PackMrp,x.PackSalePrice,x.LooseSalePrice,x.InnerPurchaseRate,x.InnerMrp,x.InnerSalePrice}.Any(v=>v<0))throw new InvalidOperationException("Unit rates must be nonnegative");
        var factor=inner==null?(p==b?1:x.ConversionFactor):x.InnerConversionFactor*x.PackInnerFactor;
        if((p==b&&factor!=1)||(inner==b&&x.InnerConversionFactor!=1)||(inner==p&&x.PackInnerFactor!=1))throw new InvalidOperationException("The same unit cannot have different conversion factors");
        return x with{BaseUnit=b,PackUnit=p,InnerUnit=inner,ConversionFactor=factor,InnerConversionFactor=inner==null?1:x.InnerConversionFactor,PackInnerFactor=inner==null?factor:x.PackInnerFactor};
    }
    internal static async Task SaveUom(SqlConnection c,SqlTransaction tx,int id,SpecializedModules.UomRequest x)
    {
        using var cmd=Command(c,tx,@"MERGE ProductUoms WITH(HOLDLOCK) AS t USING(SELECT @id ProductId)s ON t.ProductId=s.ProductId
WHEN MATCHED THEN UPDATE SET BaseUnit=@b,InnerUnit=@iu,PackUnit=@p,ConversionFactor=@f,InnerConversionFactor=@if,PackInnerFactor=@pf,PackPurchaseRate=@cost,PackMrp=@mrp,PackSalePrice=@sale,InnerPurchaseRate=@ic,InnerMrp=@im,InnerSalePrice=@is,LooseSalePrice=@loose,AllowLoose=@allow,UpdatedAt=SYSDATETIME()
WHEN NOT MATCHED THEN INSERT(ProductId,BaseUnit,InnerUnit,PackUnit,ConversionFactor,InnerConversionFactor,PackInnerFactor,PackPurchaseRate,PackMrp,PackSalePrice,InnerPurchaseRate,InnerMrp,InnerSalePrice,LooseSalePrice,AllowLoose) VALUES(@id,@b,@iu,@p,@f,@if,@pf,@cost,@mrp,@sale,@ic,@im,@is,@loose,@allow);",P("@id",id),P("@b",x.BaseUnit),P("@iu",x.InnerUnit),P("@p",x.PackUnit),P("@f",x.ConversionFactor),P("@if",x.InnerConversionFactor),P("@pf",x.PackInnerFactor),P("@cost",x.PackPurchaseRate),P("@mrp",x.PackMrp),P("@sale",x.PackSalePrice),P("@ic",x.InnerPurchaseRate),P("@im",x.InnerMrp),P("@is",x.InnerSalePrice),P("@loose",x.LooseSalePrice),P("@allow",x.AllowLoose));await cmd.ExecuteNonQueryAsync();
    }
    internal static async Task<IResult> UpdateUom(Db db,int id,SpecializedModules.UomRequest x)
    {
        using var c=db.CreateConnection();await c.OpenAsync();using var tx=c.BeginTransaction(IsolationLevel.Serializable);
        try{await Lock(c,tx);var data=await PurchaseImportRules.Load(c,tx,true);var master=data.Masters.SingleOrDefault(m=>m.Id==id)??throw new InvalidOperationException("Product does not exist");var uom=NormalizeUom(x,data.Units);await CheckBaseChange(c,tx,id,master.BaseUnit,uom.BaseUnit);await SaveUom(c,tx,id,uom);using var cmd=Command(c,tx,"UPDATE Products SET Unit=@u WHERE Id=@id",P("@u",uom.BaseUnit),P("@id",id));await cmd.ExecuteNonQueryAsync();await tx.CommitAsync();return Results.Ok(new{saved=true,uom.BaseUnit,uom.InnerUnit,uom.PackUnit,uom.ConversionFactor,uom.InnerConversionFactor,uom.PackInnerFactor});}
        catch(Exception ex)when(ex is InvalidOperationException or SqlException or OverflowException){await tx.RollbackAsync();return Results.BadRequest(new{message=ex.Message});}
    }
    // Rate edits change only explicitly selected columns. A discount uses each unit's own MRP.
    internal static async Task SyncRates(SqlConnection c,SqlTransaction tx,int id,bool purchase=false,bool mrp=false,bool sale=false,bool discount=false)
    {
        using var cmd=Command(c,tx,@"UPDATE u SET
PackPurchaseRate=CASE WHEN @purchase=1 THEN p.PurchasePrice*u.ConversionFactor ELSE u.PackPurchaseRate END,
InnerPurchaseRate=CASE WHEN @purchase=1 THEN p.PurchasePrice*u.InnerConversionFactor ELSE u.InnerPurchaseRate END,
PackMrp=CASE WHEN @mrp=1 THEN p.Mrp*u.ConversionFactor ELSE u.PackMrp END,
InnerMrp=CASE WHEN @mrp=1 THEN p.Mrp*u.InnerConversionFactor ELSE u.InnerMrp END,
PackSalePrice=CASE WHEN @discount=1 THEN ROUND((CASE WHEN @mrp=1 THEN p.Mrp*u.ConversionFactor ELSE u.PackMrp END)*(1-p.Dis_Rate/100.0),2) WHEN @sale=1 THEN p.SalePrice*u.ConversionFactor ELSE u.PackSalePrice END,
InnerSalePrice=CASE WHEN @discount=1 THEN ROUND((CASE WHEN @mrp=1 THEN p.Mrp*u.InnerConversionFactor ELSE u.InnerMrp END)*(1-p.Dis_Rate/100.0),2) WHEN @sale=1 THEN p.SalePrice*u.InnerConversionFactor ELSE u.InnerSalePrice END,
LooseSalePrice=CASE WHEN @sale=1 OR @discount=1 THEN p.SalePrice ELSE u.LooseSalePrice END,UpdatedAt=SYSDATETIME()
FROM ProductUoms u JOIN Products p ON p.Id=u.ProductId WHERE p.Id=@id",P("@id",id),P("@purchase",purchase),P("@mrp",mrp),P("@sale",sale),P("@discount",discount));await cmd.ExecuteNonQueryAsync();
    }
}
