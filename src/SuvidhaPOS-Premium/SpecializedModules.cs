using Microsoft.Data.SqlClient;
using SuvidhaPOS.Premium.Data;
using System.IO.Compression;

namespace SuvidhaPOS.Premium;

public static class SpecializedModules
{
    public static void Map(WebApplication app)
    {
        // Read-only outlet specialization is intentionally available before login so the login screen
        // can display the same Outlet Master name/type as the configured database.
        app.MapGet("/public/specialization", async (Db db, HttpContext ctx) =>
        {
            ctx.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
            ctx.Response.Headers.Pragma = "no-cache";
            ctx.Response.Headers.Expires = "0";
            var o = await db.QuerySingleAsync("SELECT TOP 1 OutletName,StoreType,UpdatedAt FROM OutletMaster ORDER BY Id");
            var name = o.GetValueOrDefault("OutletName")?.ToString();
            var type = CanonicalStoreType(o.GetValueOrDefault("StoreType")?.ToString());
            if (string.IsNullOrWhiteSpace(name)) name = "Main Outlet";
            
            return Results.Ok(new {
                OutletName = name,
                StoreType = type,
                IsJewellery = IsJewellery(type),
                IsUom = !IsJewellery(type),
                UpdatedAt = o.GetValueOrDefault("UpdatedAt")
            });
        });

        app.MapGet("/api/specialization", async (Db db) =>
        {
            var o = await db.QuerySingleAsync("SELECT TOP 1 OutletName,StoreType FROM OutletMaster ORDER BY Id");
            var type = CanonicalStoreType(o.GetValueOrDefault("StoreType")?.ToString());
            return Results.Ok(new { OutletName = o.GetValueOrDefault("OutletName")?.ToString() ?? "Main Outlet", StoreType = type, IsJewellery = IsJewellery(type), IsUom = !IsJewellery(type) });
        });

        app.MapGet("/api/products/{id:int}/uom", async (Db db, int id) =>
        {
            var r = await db.QuerySingleAsync(@"SELECT TOP 1 ProductId,BaseUnit,InnerUnit,PackUnit,ConversionFactor,
InnerConversionFactor,PackInnerFactor,PackPurchaseRate,PackMrp,PackSalePrice,
InnerPurchaseRate,InnerMrp,InnerSalePrice,LooseSalePrice,AllowLoose
FROM ProductUoms WHERE ProductId=@id", P("@id", id));
            if (r.Count == 0)
            {
                var p = await db.QuerySingleAsync("SELECT TOP 1 Unit,PurchasePrice,Mrp,SalePrice FROM Products WHERE Id=@id",P("@id",id));
                var unit=p.GetValueOrDefault("Unit")?.ToString()??"PCS";
                var purchase=Convert.ToDecimal(p.GetValueOrDefault("PurchasePrice")??0m);
                var mrp=Convert.ToDecimal(p.GetValueOrDefault("Mrp")??0m);
                var sale=Convert.ToDecimal(p.GetValueOrDefault("SalePrice")??0m);
                return Results.Ok(new { ProductId=id, BaseUnit=unit, InnerUnit=(string?)null, PackUnit=unit, ConversionFactor=1m, InnerConversionFactor=1m, PackInnerFactor=1m, PackPurchaseRate=purchase, PackMrp=mrp, PackSalePrice=sale, InnerPurchaseRate=0m, InnerMrp=0m, InnerSalePrice=0m, LooseSalePrice=sale, AllowLoose=true });
            }
            return Results.Ok(r);
        });
        app.MapPut("/api/products/{id:int}/uom", async (Db db, int id, UomRequest x) =>
        {
            if (string.IsNullOrWhiteSpace(x.BaseUnit) || string.IsNullOrWhiteSpace(x.PackUnit))
                return Results.BadRequest(new { message="Base unit and pack unit are required" });

            var baseUnit=await UnitMasterModules.ResolveActiveNameAsync(db,x.BaseUnit);
            var packUnit=await UnitMasterModules.ResolveActiveNameAsync(db,x.PackUnit);
            var innerUnit=string.IsNullOrWhiteSpace(x.InnerUnit)?null:await UnitMasterModules.ResolveActiveNameAsync(db,x.InnerUnit);
            if(baseUnit is null)return Results.BadRequest(new {message=$"Base Unit '{x.BaseUnit}' is not in active Unit Master. Select/search a predefined unit or add it in Unit Master first."});
            if(packUnit is null)return Results.BadRequest(new {message=$"Pack Unit '{x.PackUnit}' is not in active Unit Master. Select/search a predefined unit or add it in Unit Master first."});
            if(!string.IsNullOrWhiteSpace(x.InnerUnit)&&innerUnit is null)return Results.BadRequest(new {message=$"Inner Unit '{x.InnerUnit}' is not in active Unit Master. Select/search a predefined unit or add it in Unit Master first."});
            var innerFactor=innerUnit is null?1m:Math.Max(1m,x.InnerConversionFactor);
            var packInnerFactor=Math.Max(1m,x.PackInnerFactor);
            var totalFactor=innerUnit is null
                ? Math.Max(1m,x.ConversionFactor>0?x.ConversionFactor:packInnerFactor)
                : innerFactor*packInnerFactor;
            if(packUnit.Equals(baseUnit,StringComparison.OrdinalIgnoreCase) && innerUnit is null) totalFactor=1m;

            await db.ScalarAsync(@"MERGE ProductUoms AS t
USING (SELECT @id ProductId) s ON t.ProductId=s.ProductId
WHEN MATCHED THEN UPDATE SET
 BaseUnit=@b,InnerUnit=@iu,PackUnit=@p,ConversionFactor=@f,
 InnerConversionFactor=@if,PackInnerFactor=@pf,
 PackPurchaseRate=@pp,PackMrp=@m,PackSalePrice=@sp,
 InnerPurchaseRate=@ip,InnerMrp=@im,InnerSalePrice=@is,
 LooseSalePrice=@lp,AllowLoose=@lo,UpdatedAt=SYSDATETIME()
WHEN NOT MATCHED THEN
 INSERT(ProductId,BaseUnit,InnerUnit,PackUnit,ConversionFactor,InnerConversionFactor,PackInnerFactor,PackPurchaseRate,PackMrp,PackSalePrice,InnerPurchaseRate,InnerMrp,InnerSalePrice,LooseSalePrice,AllowLoose)
 VALUES(@id,@b,@iu,@p,@f,@if,@pf,@pp,@m,@sp,@ip,@im,@is,@lp,@lo);",
 P("@id",id),P("@b",baseUnit),P("@iu",innerUnit),P("@p",packUnit),P("@f",totalFactor),
 P("@if",innerFactor),P("@pf",packInnerFactor),
 P("@pp",x.PackPurchaseRate),P("@m",x.PackMrp),P("@sp",x.PackSalePrice),
 P("@ip",x.InnerPurchaseRate),P("@im",x.InnerMrp),P("@is",x.InnerSalePrice),
 P("@lp",x.LooseSalePrice),P("@lo",x.AllowLoose));
            return Results.Ok(new { saved=true, BaseUnit=baseUnit, InnerUnit=innerUnit, PackUnit=packUnit, ConversionFactor=totalFactor, InnerConversionFactor=innerFactor, PackInnerFactor=packInnerFactor });
        });

        app.MapGet("/api/jewellery/metal-rates", async (Db db) => Results.Ok(await db.QueryAsync("SELECT Id,MetalType,Purity,RatePerGram,EffectiveAt FROM JewelleryMetalRates WHERE IsActive=1 ORDER BY MetalType,Purity")));
        app.MapPost("/api/jewellery/metal-rates", async (Db db, MetalRateRequest x) => Results.Ok(new { id=await db.ScalarAsync("INSERT JewelleryMetalRates(MetalType,Purity,RatePerGram,EffectiveAt,IsActive) VALUES(@m,@p,@r,COALESCE(@e,SYSDATETIME()),1);SELECT CAST(SCOPE_IDENTITY() AS int)",P("@m",x.MetalType),P("@p",x.Purity),P("@r",x.RatePerGram),P("@e",x.EffectiveAt)) }));
        app.MapGet("/api/jewellery/catalog", async (Db db, string? q) => Results.Ok(await db.QueryAsync(@"SELECT j.Id,j.TagNo,j.Barcode,j.ItemName,j.Category,j.MetalType,j.Purity,j.PurityPercent,j.Huid,j.GrossWeight,j.NetWeight,j.StoneWeight,j.MakingChargeType,j.MakingValue,j.Status,j.RackName FROM JewelleryItems j WHERE j.Status IN ('IN_STOCK','APPROVAL','KARIGAR_WORK') AND (@q='' OR j.TagNo LIKE @l OR ISNULL(j.Barcode,'') LIKE @l OR j.ItemName LIKE @l OR ISNULL(j.Huid,'') LIKE @l) ORDER BY j.ItemName",P("@q",q??""),P("@l","%"+(q??"")+"%"))));
        app.MapPost("/api/jewellery/items", async (Db db, JewelleryItemRequest x) =>
        {
            if (string.IsNullOrWhiteSpace(x.ItemName) || string.IsNullOrWhiteSpace(x.TagNo)) return Results.BadRequest(new { message="Item name and tag number are required" });
            var id=await db.ScalarAsync(@"INSERT JewelleryItems(TagNo,Barcode,ItemName,Category,MetalType,Purity,PurityPercent,Huid,GrossWeight,NetWeight,StoneWeight,MakingChargeType,MakingValue,Status,RackName) VALUES(@tag,@bc,@name,@cat,@metal,@purity,@pp,@huid,@gross,@net,@stone,@mct,@mv,@status,@rack);SELECT CAST(SCOPE_IDENTITY() AS int)",P("@tag",x.TagNo),P("@bc",x.Barcode),P("@name",x.ItemName),P("@cat",x.Category),P("@metal",x.MetalType),P("@purity",x.Purity),P("@pp",x.PurityPercent),P("@huid",x.Huid),P("@gross",x.GrossWeight),P("@net",x.NetWeight),P("@stone",x.StoneWeight),P("@mct",x.MakingChargeType??"FLAT"),P("@mv",x.MakingValue),P("@status",x.Status??"IN_STOCK"),P("@rack",x.RackName));
            return Results.Ok(new {id});
        });
        app.MapGet("/api/jewellery/sales", async (Db db, string? q, DateTime? from, DateTime? to) =>
        {
            var term=q?.Trim()??"";
            var f=(from??new DateTime(2000,1,1)).Date;
            var e=(to??DateTime.Today).Date.AddDays(1);
            return Results.Ok(await db.QueryAsync(@"SELECT TOP 500 Id,InvoiceNo,BillDate,CustomerName,PaymentMode,GrossAmount,OldMetalCredit,NetPayable,PaidAmount,
CAST(NetPayable-PaidAmount AS decimal(18,2)) Balance,
CASE WHEN PaidAmount>=NetPayable THEN 'paid' ELSE 'unpaid' END [Status],
'retail' [Type]
FROM JewellerySales
WHERE BillDate>=@f AND BillDate<@e AND (@q='' OR InvoiceNo LIKE @like OR CustomerName LIKE @like)
ORDER BY Id DESC",P("@f",f),P("@e",e),P("@q",term),P("@like","%"+term+"%")));
        });

        app.MapPost("/api/jewellery/sales", async (Db db, JewellerySaleRequest x) =>
        {
            if (x.Lines is null || x.Lines.Count==0) return Results.BadRequest(new {message="Add jewellery item"});
            using var c=db.CreateConnection(); await c.OpenAsync(); using var tx=c.BeginTransaction();
            try
            {
                decimal metal=0,stones=0,making=0,gross=0;
                var lines=new List<(JewellerySaleLineRequest r,decimal metalValue,decimal makingValue,decimal total)>();
                foreach(var r in x.Lines)
                {
                    using var cmd=new SqlCommand("SELECT NetWeight,Status FROM JewelleryItems WITH(UPDLOCK,ROWLOCK) WHERE Id=@id",c,tx); cmd.Parameters.Add(P("@id",r.JewelleryItemId)); using var rd=await cmd.ExecuteReaderAsync(); if(!await rd.ReadAsync()) return Results.BadRequest(new{message="Jewellery item not found"}); var nw=rd.IsDBNull(0)?0m:rd.GetDecimal(0); var status=rd.IsDBNull(1)?"":rd.GetString(1); await rd.CloseAsync(); if(status!="IN_STOCK" && status!="APPROVAL") return Results.BadRequest(new{message="Jewellery item is not available"});
                    var metalValue=nw*r.MetalRatePerGram; var makingValue=(r.MakingChargeType??"FLAT").ToUpperInvariant() switch {"PER_GRAM"=>nw*r.MakingValue,"PERCENTAGE"=>metalValue*r.MakingValue/100m,_=>r.MakingValue}; var total=metalValue+makingValue+r.StoneValue; metal+=metalValue;making+=makingValue;stones+=r.StoneValue;gross+=total;lines.Add((r,metalValue,makingValue,total));
                }
                var gstRate=x.GstRate<=0?3m:x.GstRate; var gst=gross*gstRate/100m; var oldCredit=Math.Max(0,x.OldMetalCredit); var net=gross+gst-oldCredit; var inv="JWL-"+DateTime.Now.ToString("yyyyMMddHHmmssfff");
                using var h=new SqlCommand(@"INSERT JewellerySales(InvoiceNo,CustomerId,CustomerName,CustomerPan,MetalAmount,StoneAmount,MakingAmount,GrossAmount,GstRate,Cgst,Sgst,OldMetalCredit,NetPayable,PaymentMode,PaidAmount,Notes) OUTPUT INSERTED.Id VALUES(@inv,@cid,@cn,@pan,@metal,@stone,@making,@gross,@rate,@cg,@sg,@old,@net,@pm,@paid,@notes)",c,tx); h.Parameters.AddRange(new[]{P("@inv",inv),P("@cid",x.CustomerId),P("@cn",x.CustomerName??"Walk-in Customer"),P("@pan",x.CustomerPan),P("@metal",metal),P("@stone",stones),P("@making",making),P("@gross",gross),P("@rate",gstRate),P("@cg",gst/2),P("@sg",gst/2),P("@old",oldCredit),P("@net",net),P("@pm",x.PaymentMode??"Cash"),P("@paid",x.PaidAmount<=0?net:x.PaidAmount),P("@notes",x.Notes)}); int sid=(int)await h.ExecuteScalarAsync();
                foreach(var z in lines){using var l=new SqlCommand("INSERT JewellerySaleLines(SaleId,JewelleryItemId,MetalRate,MetalAmount,StoneAmount,MakingAmount,TotalAmount) VALUES(@s,@i,@r,@m,@st,@mk,@t);UPDATE JewelleryItems SET Status='SOLD' WHERE Id=@i",c,tx);l.Parameters.AddRange(new[]{P("@s",sid),P("@i",z.r.JewelleryItemId),P("@r",z.r.MetalRatePerGram),P("@m",z.metalValue),P("@st",z.r.StoneValue),P("@mk",z.makingValue),P("@t",z.total)});await l.ExecuteNonQueryAsync();}
                await tx.CommitAsync(); return Results.Ok(new{id=sid,invoiceNo=inv,gross,gst,total=gross+gst,oldMetalCredit=oldCredit,netPayable=net});
            }catch(Exception ex){await tx.RollbackAsync();return Results.BadRequest(new{message=ex.Message});}
        });
        app.MapPost("/api/jewellery/old-metal/calculate", (OldMetalRequest x) => { var melt=Math.Max(0,x.GrossWeight-x.StoneWeight-x.WaxDeduction); var pure=melt*(x.AssayedPurityPercent/100m)*(1-x.MeltingLossPercent/100m); return Results.Ok(new{meltWeight=melt,netPureWeight=pure,credit=pure*x.PurchaseRatePerGram}); });
    }
    static string CanonicalStoreType(string? t)
    {
        var v=(t??"").Trim();
        if(v.Equals("Gold & Diamond Jewellery",StringComparison.OrdinalIgnoreCase)||v.Equals("Silver Jewellery",StringComparison.OrdinalIgnoreCase)) return "Jewellery Shop";
        return string.IsNullOrWhiteSpace(v) ? "Retail Shop" : v;
    }
    static bool IsJewellery(string t)=>CanonicalStoreType(t).Equals("Jewellery Shop",StringComparison.OrdinalIgnoreCase);
    static SqlParameter P(string n,object? v)=>new(n,v??DBNull.Value);
    public record UomRequest(string BaseUnit,string PackUnit,decimal ConversionFactor,decimal PackPurchaseRate,decimal PackMrp,decimal PackSalePrice,decimal LooseSalePrice,bool AllowLoose,string? InnerUnit=null,decimal InnerConversionFactor=1m,decimal PackInnerFactor=1m,decimal InnerPurchaseRate=0m,decimal InnerMrp=0m,decimal InnerSalePrice=0m);
    public record MetalRateRequest(string MetalType,string Purity,decimal RatePerGram,DateTime? EffectiveAt);
    public record JewelleryItemRequest(string TagNo,string? Barcode,string ItemName,string? Category,string MetalType,string Purity,decimal PurityPercent,string? Huid,decimal GrossWeight,decimal NetWeight,decimal StoneWeight,string? MakingChargeType,decimal MakingValue,string? Status,string? RackName);
    public record JewellerySaleRequest(string? CustomerName,int? CustomerId,string? CustomerPan,List<JewellerySaleLineRequest> Lines,decimal GstRate,decimal OldMetalCredit,decimal PaidAmount,string? PaymentMode,string? Notes);
    public record JewellerySaleLineRequest(int JewelleryItemId,decimal MetalRatePerGram,decimal StoneValue,string? MakingChargeType,decimal MakingValue);
    public record OldMetalRequest(decimal GrossWeight,decimal StoneWeight,decimal WaxDeduction,decimal AssayedPurityPercent,decimal MeltingLossPercent,decimal PurchaseRatePerGram);
}
