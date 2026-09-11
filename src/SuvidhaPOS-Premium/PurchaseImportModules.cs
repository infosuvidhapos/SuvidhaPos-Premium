using Microsoft.Data.SqlClient;
using NPOI.SS.UserModel;
using NPOI.XSSF.UserModel;
using NPOI.HSSF.UserModel;
using SuvidhaPOS.Premium.Data;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace SuvidhaPOS.Premium;

public static class PurchaseImportModules
{
    static SqlParameter P(string n, object? v)=>new(n,v??DBNull.Value);
    static readonly DataFormatter Fmt=new(CultureInfo.InvariantCulture);

    public static void Map(WebApplication app)
    {
        app.MapPost("/api/purchase-import/preview", async (Db db, HttpRequest req) =>
        {
            if(!req.HasFormContentType) return Results.BadRequest(new{message="Upload Excel/CSV file"});
            var form=await req.ReadFormAsync(); var file=form.Files.FirstOrDefault();
            if(file is null||file.Length==0) return Results.BadRequest(new{message="Choose purchase import file"});
            if(file.Length>25*1024*1024) return Results.BadRequest(new{message="File is larger than 25 MB"});
            var parsed=await Parse(file);
            if(parsed.Error is not null) return Results.BadRequest(new{message=parsed.Error});
            var rows=new List<object>();
            foreach(var r in parsed.Rows)
            {
                var identity=await ResolveProduct(db,r);
                rows.Add(new{
                    r.RowNo,r.InvoiceNo,r.PurchaseDate,r.SupplierName,r.ItemName,r.Barcode,r.Group,r.Hsn,r.GstRate,r.Mrp,r.Discount,
                    r.Qty,r.Unit,r.PurchaseRate,r.Amount,r.BatchNo,r.ExpiryDate,
                    ProductId=identity.Id,Match=identity.Match,Conflict=identity.Conflict,NewItem=identity.Id==0&&!identity.Conflict
                });
            }
            return Results.Ok(new{file=file.FileName,rows,summary=new{
                total=parsed.Rows.Count,
                matched=rows.Count(x=>Convert.ToInt32(x.GetType().GetProperty("ProductId")!.GetValue(x)??0)>0),
                newItems=rows.Count(x=>Convert.ToBoolean(x.GetType().GetProperty("NewItem")!.GetValue(x)??false)),
                conflicts=rows.Count(x=>Convert.ToBoolean(x.GetType().GetProperty("Conflict")!.GetValue(x)??false))
            }});
        });

        app.MapPost("/api/purchase-import/commit", async (Db db, PurchaseImportCommitRequest x) =>
        {
            if(x.Rows is null||x.Rows.Count==0) return Results.BadRequest(new{message="No purchase rows"});
            var outlet=await db.QuerySingleAsync("SELECT TOP 1 StoreType,RequireBatch,RequireExpiry FROM OutletMaster ORDER BY Id");
            var storeType=outlet.GetValueOrDefault("StoreType")?.ToString()??"Retail Shop";
            var pharmacy=storeType.Contains("Pharmacy",StringComparison.OrdinalIgnoreCase)||storeType.Contains("Medical",StringComparison.OrdinalIgnoreCase);
            var requireBatch=pharmacy||Convert.ToBoolean(outlet.GetValueOrDefault("RequireBatch")??false);
            var requireExpiry=pharmacy||Convert.ToBoolean(outlet.GetValueOrDefault("RequireExpiry")??false);
            foreach(var r in x.Rows){
                if(requireBatch&&string.IsNullOrWhiteSpace(r.BatchNo))return Results.BadRequest(new{message=$"Row {r.RowNo}: Batch No is required for this outlet"});
                if(requireExpiry&&!r.ExpiryDate.HasValue)return Results.BadRequest(new{message=$"Row {r.RowNo}: Expiry Date is required for this outlet"});
            }
            using var c=db.CreateConnection(); await c.OpenAsync(); using var tx=c.BeginTransaction();
            try
            {
                var prepared=new List<(PurchaseImportRow Row,int ProductId)>();
                foreach(var r in x.Rows)
                {
                    var name=(r.ItemName??"").Trim(); var barcode=Clean(r.Barcode);
                    if(string.IsNullOrWhiteSpace(name)) throw new Exception($"Row {r.RowNo}: Item Name is required");
                    int productId=0;
                    var q=new SqlCommand(@"SELECT TOP 2 Id,Name,Barcode FROM Products WITH(UPDLOCK,HOLDLOCK)
WHERE IsActive=1 AND ((@b<>'' AND UPPER(LTRIM(RTRIM(ISNULL(Barcode,''))))=UPPER(@b))
 OR UPPER(LTRIM(RTRIM(Name)))=UPPER(@n))
ORDER BY CASE WHEN @b<>'' AND UPPER(LTRIM(RTRIM(ISNULL(Barcode,''))))=UPPER(@b) THEN 0 ELSE 1 END,Id",c,tx);
                    q.Parameters.AddRange(new[]{P("@b",barcode??""),P("@n",name)});
                    var hits=new List<(int Id,string Name,string Barcode)>();
                    using(var rd=await q.ExecuteReaderAsync()) while(await rd.ReadAsync()) hits.Add((rd.GetInt32(0),rd.GetString(1),rd.IsDBNull(2)?"":rd.GetString(2)));
                    if(hits.Count>1 && hits.Select(z=>z.Id).Distinct().Count()>1)
                    {
                        var barcodeHit=hits.FirstOrDefault(z=>!string.IsNullOrWhiteSpace(barcode)&&z.Barcode.Equals(barcode,StringComparison.OrdinalIgnoreCase));
                        var nameHit=hits.FirstOrDefault(z=>z.Name.Trim().Equals(name,StringComparison.OrdinalIgnoreCase));
                        if(barcodeHit.Id>0&&nameHit.Id>0&&barcodeHit.Id!=nameHit.Id)
                            throw new Exception($"Row {r.RowNo}: barcode and item name match different existing items. Resolve duplicate before import.");
                    }
                    if(hits.Count>0) productId=hits[0].Id;
                    if(productId==0)
                    {
                        var unit=await ResolveUnit(c,tx,r.Unit);
                        var cat=string.IsNullOrWhiteSpace(r.Group)?"General":r.Group!.Trim();
                        var sale=r.SalePrice>0?r.SalePrice:(r.Mrp>0?r.Mrp:r.PurchaseRate);
                        q=new SqlCommand(@"INSERT Products(Name,Barcode,Sku,Category,Unit,Hsn,GstRate,TaxMode,Mrp,PurchasePrice,SalePrice,MinStock,MaxStock,TrackBatch,TrackExpiry,IsActive)
VALUES(@n,@b,NULL,@cat,@u,@h,@g,'EXCLUSIVE',@m,@pp,@sp,0,0,1,1,1);SELECT CAST(SCOPE_IDENTITY() AS int)",c,tx);
                        q.Parameters.AddRange(new[]{P("@n",name),P("@b",barcode),P("@cat",cat),P("@u",unit),P("@h",Clean(r.Hsn)),P("@g",Math.Max(0,r.GstRate)),P("@m",Math.Max(0,r.Mrp)),P("@pp",Math.Max(0,r.PurchaseRate)),P("@sp",Math.Max(0,sale))});
                        try{productId=Convert.ToInt32(await q.ExecuteScalarAsync());}
                        catch(SqlException e) when(e.Number is 2601 or 2627){throw new Exception($"Row {r.RowNo}: duplicate barcode '{barcode}'");}
                        q=new SqlCommand(@"IF NOT EXISTS(SELECT 1 FROM ProductUoms WHERE ProductId=@p)
INSERT ProductUoms(ProductId,BaseUnit,PackUnit,ConversionFactor,AllowLoose,LooseSalePrice,PackSalePrice,PackPurchaseRate,PackMrp)
VALUES(@p,@u,@u,1,1,@sp,@sp,@pp,@m)",c,tx);
                        q.Parameters.AddRange(new[]{P("@p",productId),P("@u",unit),P("@sp",Math.Max(0,sale)),P("@pp",Math.Max(0,r.PurchaseRate)),P("@m",Math.Max(0,r.Mrp))}); await q.ExecuteNonQueryAsync();
                    }
                    prepared.Add((r,productId));
                }

                var invoice=(x.InvoiceNo??prepared.Select(z=>z.Row.InvoiceNo).FirstOrDefault(v=>!string.IsNullOrWhiteSpace(v))??("PUR-IMP-"+DateTime.Now.ToString("yyyyMMddHHmmss"))).Trim();
                var supplier=(x.SupplierName??prepared.Select(z=>z.Row.SupplierName).FirstOrDefault(v=>!string.IsNullOrWhiteSpace(v))??"Imported Supplier").Trim();
                decimal sub=prepared.Sum(z=>Math.Max(0,z.Row.Qty)*Math.Max(0,z.Row.PurchaseRate));
                decimal tax=prepared.Sum(z=>Math.Max(0,z.Row.Qty)*Math.Max(0,z.Row.PurchaseRate)*Math.Max(0,z.Row.GstRate)/100m);
                decimal disc=Math.Max(0,x.Discount);
                decimal total=Math.Max(0,sub-disc+tax);
                var pcmd=new SqlCommand(@"INSERT Purchases(InvoiceNo,SupplierId,SupplierName,PurchaseDate,SubTotal,Discount,Tax,GrandTotal,PaymentMode,PaidAmount,Notes)
OUTPUT INSERTED.Id VALUES(@i,@sid,@sn,COALESCE(@dt,GETDATE()),@sub,@d,@t,@g,@pm,@paid,@notes)",c,tx);
                pcmd.Parameters.AddRange(new[]{P("@i",invoice),P("@sid",x.SupplierId),P("@sn",supplier),P("@dt",x.PurchaseDate),P("@sub",sub),P("@d",disc),P("@t",tax),P("@g",total),P("@pm",x.PaymentMode??"Credit"),P("@paid",Math.Max(0,x.PaidAmount)),P("@notes","Purchase Bill Excel Import")});
                var purchaseId=Convert.ToInt32(await pcmd.ExecuteScalarAsync());

                foreach(var z in prepared)
                {
                    var r=z.Row; var qty=Math.Max(0,r.Qty); if(qty<=0) continue;
                    var free=Math.Max(0,r.FreeQuantity); var batch=string.IsNullOrWhiteSpace(r.BatchNo)?("IMP-"+purchaseId+"-"+r.RowNo):r.BatchNo!.Trim();
                    var exp=r.ExpiryDate ?? DateTime.Today.AddYears(5);
                    var rate=Math.Max(0,r.PurchaseRate); var sale=Math.Max(0,r.SalePrice>0?r.SalePrice:(r.Mrp>0?r.Mrp:rate)); var mrp=Math.Max(0,r.Mrp);
                    var bcmd=new SqlCommand(@"INSERT ProductBatches(ProductId,BatchNo,Quantity,CostPrice,SellingPrice,Mrp,ManufactureDate,ExpiryDate)
OUTPUT INSERTED.Id VALUES(@p,@b,@q,@c,@s,@m,NULL,@ed)",c,tx);
                    bcmd.Parameters.AddRange(new[]{P("@p",z.ProductId),P("@b",batch),P("@q",qty+free),P("@c",rate),P("@s",sale),P("@m",mrp),P("@ed",exp)});
                    var batchId=Convert.ToInt32(await bcmd.ExecuteScalarAsync());
                    var lcmd=new SqlCommand(@"INSERT PurchaseLines(PurchaseId,ProductId,BatchId,Quantity,FreeQuantity,CostPrice,Mrp,SalePrice,TaxRate,TaxAmount,UnitPurchased,PurchasedQty,TotalBaseQty,RatePerPurchasedUnit)
VALUES(@i,@p,@b,@q,@f,@c,@m,@s,@r,@t,@u,@pq,@tb,@rpu);
INSERT StockLedger(ProductId,BatchId,MovementType,Quantity,ReferenceType,ReferenceId,Notes)
VALUES(@p,@b,'PURCHASE',@stock,'PURCHASE',@i,'Purchase Bill Excel Import')",c,tx);
                    lcmd.Parameters.AddRange(new[]{P("@i",purchaseId),P("@p",z.ProductId),P("@b",batchId),P("@q",qty),P("@f",free),P("@c",rate),P("@m",mrp),P("@s",sale),P("@r",Math.Max(0,r.GstRate)),P("@t",qty*rate*Math.Max(0,r.GstRate)/100m),P("@u",string.IsNullOrWhiteSpace(r.Unit)?"PCS":r.Unit),P("@pq",qty),P("@tb",qty),P("@rpu",rate),P("@stock",qty+free)});
                    await lcmd.ExecuteNonQueryAsync();
                }
                await tx.CommitAsync();
                return Results.Ok(new{purchaseId,invoiceNo=invoice,total,newItems=prepared.Count(z=>z.Row.ProductId<=0)});
            }
            catch(Exception ex){await tx.RollbackAsync();return Results.BadRequest(new{message=ex.Message});}
        });

        app.MapGet("/api/purchase-import/template", () =>
        {
            IWorkbook wb=new XSSFWorkbook(); var sh=wb.CreateSheet("Purchase Import");
            var headers=new[]{"Date","Vch/Bill No","Supplier","Particulars","Group","Item Details","TAX RATE","HSN CODE","BCN","MRP","Disc.","Qty.","Free Qty","Unit","Price","Sale Price","Amount","Batch No","Expiry Date"};
            var hr=sh.CreateRow(0); for(int i=0;i<headers.Length;i++){hr.CreateCell(i).SetCellValue(headers[i]);sh.SetColumnWidth(i,Math.Min(7000,Math.Max(2800,headers[i].Length*300)));}
            var r=sh.CreateRow(1); var vals=new[]{"2026-09-12","SUP-001","Demo Supplier","General Purchase","General","Mineral Water 1L","GST 18%","220110","890000000003","25","0","12","0","BTL","20","22","240","BATCH-01","2028-12-31"};
            for(int i=0;i<vals.Length;i++)r.CreateCell(i).SetCellValue(vals[i]);
            using var ms=new MemoryStream();wb.Write(ms,true);return Results.File(ms.ToArray(),"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","SuvidhaPOS-Purchase-Import-Sample.xlsx");
        });

        app.MapGet("/api/purchase-import/bill-template", () =>
        {
            IWorkbook wb=new XSSFWorkbook(); var sh=wb.CreateSheet("Purchase Bill Upload");
            var headers=new[]{"Date","Vch/Bill No","Particulars","Group","Item Details","TAX RATE","HSN CODE","BCN","MRP","Disc.","Qty.","Unit","Price","Amount","Pcs.","Batch No","Expiry Date"};
            var hr=sh.CreateRow(0); for(int i=0;i<headers.Length;i++){hr.CreateCell(i).SetCellValue(headers[i]);sh.SetColumnWidth(i,Math.Min(7000,Math.Max(2800,headers[i].Length*300)));}
            var r=sh.CreateRow(1); var vals=new[]{"25/08/2026","BSCPL/1030/26-27","General Purchase","GST 18%","Bajaj Kettle 1.5 Ltr Stainless Steel","GST 18%","851679","8901234567890","999","0","2","PCS","700","1400","2","KTL-0826","31/08/2028"};
            for(int i=0;i<vals.Length;i++)r.CreateCell(i).SetCellValue(vals[i]);
            using var ms=new MemoryStream();wb.Write(ms,true);return Results.File(ms.ToArray(),"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","SuvidhaPOS-Purchase-Bill-Upload-Sample.xlsx");
        });
    }

    static async Task<string> ResolveUnit(SqlConnection c,SqlTransaction tx,string? unit)
    {
        var u=string.IsNullOrWhiteSpace(unit)?"PCS":unit.Trim();
        var cmd=new SqlCommand("SELECT TOP 1 Name FROM UnitMaster WHERE IsActive=1 AND UPPER(LTRIM(RTRIM(Name)))=UPPER(@u)",c,tx);cmd.Parameters.Add(P("@u",u));
        var x=await cmd.ExecuteScalarAsync();return x is null||x is DBNull?"PCS":x.ToString()!;
    }

    static async Task<(int Id,string Match,bool Conflict)> ResolveProduct(Db db,PurchaseImportRow r)
    {
        var b=Clean(r.Barcode)??"";var n=(r.ItemName??"").Trim();
        var hits=await db.QueryAsync(@"SELECT TOP 3 Id,Name,Barcode FROM Products WHERE IsActive=1 AND
((@b<>'' AND UPPER(LTRIM(RTRIM(ISNULL(Barcode,''))))=UPPER(@b)) OR UPPER(LTRIM(RTRIM(Name)))=UPPER(@n))
ORDER BY CASE WHEN @b<>'' AND UPPER(LTRIM(RTRIM(ISNULL(Barcode,''))))=UPPER(@b) THEN 0 ELSE 1 END,Id",P("@b",b),P("@n",n));
        if(hits.Count==0)return(0,"NEW",false);
        var byB=hits.FirstOrDefault(x=>b!=""&&string.Equals(x.GetValueOrDefault("Barcode")?.ToString()?.Trim(),b,StringComparison.OrdinalIgnoreCase));
        var byN=hits.FirstOrDefault(x=>string.Equals(x.GetValueOrDefault("Name")?.ToString()?.Trim(),n,StringComparison.OrdinalIgnoreCase));
        if(byB is not null&&byN is not null&&Convert.ToInt32(byB["Id"])!=Convert.ToInt32(byN["Id"]))return(0,"CONFLICT",true);
        var hit=byB??byN??hits[0];return(Convert.ToInt32(hit["Id"]),byB is not null?"BARCODE":"NAME",false);
    }

    static string? Clean(string? s)=>string.IsNullOrWhiteSpace(s)?null:s.Trim();

    static async Task<Parsed> Parse(IFormFile file)
    {
        var ext=Path.GetExtension(file.FileName).ToLowerInvariant();
        await using var src=file.OpenReadStream(); using var ms=new MemoryStream(); await src.CopyToAsync(ms); ms.Position=0;
        var rows=new List<PurchaseImportRow>();
        if(ext is ".xls" or ".xlsx")
        {
            IWorkbook wb=ext==".xls"?new HSSFWorkbook(ms):new XSSFWorkbook(ms);var sh=wb.GetSheetAt(0);
            int header=-1;Dictionary<string,int> h=new(StringComparer.OrdinalIgnoreCase);
            for(int ri=sh.FirstRowNum;ri<=Math.Min(sh.LastRowNum,30);ri++){var row=sh.GetRow(ri);if(row is null)continue;var map=HeaderMap(row);if(map.Keys.Any(k=>k.Contains("item")||k.Contains("particular"))&&map.Keys.Any(k=>k.Contains("qty")||k.Contains("mrp")||k.Contains("price"))){header=ri;h=map;break;}}
            if(header<0)return new(rows,"Could not find purchase header row");
            string inv="",supplier="",particular="",group="";DateTime? date=null;
            for(int ri=header+1;ri<=sh.LastRowNum;ri++)
            {
                var row=sh.GetRow(ri);if(row is null)continue;
                string G(params string[] a){foreach(var x in a){var k=N(x);if(h.TryGetValue(k,out var ci)){var v=Fmt.FormatCellValue(row.GetCell(ci)).Trim();if(v!="")return v;}}return "";}
                var v=G("Vch/Bill No","Bill No","Invoice No");if(v!="")inv=v;v=G("Supplier","Party","Particulars");if(v!=""&&h.ContainsKey(N("Supplier")))supplier=v;
                v=G("Particulars");if(v!="")particular=v;v=G("Group","Category");if(v!="")group=v;
                var ds=G("Date","Purchase Date");if(ds!=""){if(DateTime.TryParse(ds,CultureInfo.GetCultureInfo("en-IN"),DateTimeStyles.None,out var dt)||DateTime.TryParse(ds,out dt))date=dt;}
                var item=G("Item Details","Item Name","Product","Description"); if(item==""&&particular!=""&&!LooksHeader(particular)) item=particular;
                var barcode=G("BCN","Barcode","Bar Code","EAN","SKU"); var qty=D(G("Qty.","Qty","Quantity","Pcs.","Pcs"));
                if(string.IsNullOrWhiteSpace(item)&&(string.IsNullOrWhiteSpace(barcode)||qty<=0))continue;
                rows.Add(new PurchaseImportRow{RowNo=ri+1,InvoiceNo=inv,PurchaseDate=date,SupplierName=supplier,ItemName=item,Barcode=barcode,Group=group,Hsn=G("HSN CODE","HSN","HSN/SAC"),GstRate=Tax(G("TAX RATE","GST","GST %")),Mrp=D(G("MRP")),Discount=D(G("Disc.","Discount")),Qty=qty<=0?1:qty,FreeQuantity=D(G("Free Qty","Free")),Unit=G("Unit"),PurchaseRate=D(G("Price","Purchase","Purchase Rate","Rate")),SalePrice=D(G("Sale Price","Selling Price")),Amount=D(G("Amount")),BatchNo=G("Batch No","Batch"),ExpiryDate=Dt(G("Expiry Date","Expiry"))});
            }
        }
        else if(ext is ".csv" or ".txt")
        {
            using var sr=new StreamReader(ms,Encoding.UTF8,true);var first=await sr.ReadLineAsync();if(first is null)return new(rows,"Empty file");
            var hs=Csv(first);var hm=hs.Select((x,i)=>(N(x),i)).ToDictionary(x=>x.Item1,x=>x.i,StringComparer.OrdinalIgnoreCase);
            string? line;int rn=1;while((line=await sr.ReadLineAsync()) is not null){rn++;var v=Csv(line);string G(params string[] a){foreach(var x in a)if(hm.TryGetValue(N(x),out var i)&&i<v.Count&&!string.IsNullOrWhiteSpace(v[i]))return v[i].Trim();return "";}var item=G("Item Details","Item Name","Product");if(item=="")continue;rows.Add(new PurchaseImportRow{RowNo=rn,InvoiceNo=G("Vch/Bill No","Invoice No"),SupplierName=G("Supplier"),ItemName=item,Barcode=G("BCN","Barcode"),Group=G("Group","Category"),Hsn=G("HSN CODE","HSN"),GstRate=Tax(G("TAX RATE","GST %")),Mrp=D(G("MRP")),Discount=D(G("Disc.","Discount")),Qty=Math.Max(1,D(G("Qty.","Qty","Quantity"))),FreeQuantity=D(G("Free Qty")),Unit=G("Unit"),PurchaseRate=D(G("Price","Purchase Rate")),SalePrice=D(G("Sale Price")),Amount=D(G("Amount")),BatchNo=G("Batch No"),ExpiryDate=Dt(G("Expiry Date"))});}
        }
        else return new(rows,"Supported files: .xls, .xlsx, .csv");
        return new(rows,null);
    }

    static Dictionary<string,int> HeaderMap(IRow row){var d=new Dictionary<string,int>(StringComparer.OrdinalIgnoreCase);for(int i=row.FirstCellNum;i<row.LastCellNum;i++){var s=Fmt.FormatCellValue(row.GetCell(i)).Trim();if(s!="")d[N(s)]=i;}return d;}
    static string N(string s)=>Regex.Replace((s??"").Trim().ToLowerInvariant(),@"[^a-z0-9]+","");
    static bool LooksHeader(string s)=>new[]{"date","particulars","group","item details","tax rate","hsn code","bcn","mrp","qty","unit","price","amount"}.Contains(s.Trim().ToLowerInvariant());
    static decimal D(string? s){if(string.IsNullOrWhiteSpace(s))return 0;var x=Regex.Replace(s,@"[₹,% ]","");return decimal.TryParse(x,NumberStyles.Any,CultureInfo.InvariantCulture,out var d)?d:0;}
    static decimal Tax(string? s){if(string.IsNullOrWhiteSpace(s))return 0;var m=Regex.Match(s,@"([0-9]+(?:.[0-9]+)?)");return m.Success?D(m.Groups[1].Value):0;}
    static DateTime? Dt(string? s)=>DateTime.TryParse(s,out var d)?d:null;
    static List<string> Csv(string line){var r=new List<string>();var b=new StringBuilder();bool q=false;foreach(var ch in line){if(ch=='"')q=!q;else if(ch==','&&!q){r.Add(b.ToString());b.Clear();}else b.Append(ch);}r.Add(b.ToString());return r;}

    sealed record Parsed(List<PurchaseImportRow> Rows,string? Error);
    public sealed class PurchaseImportRow
    {
        public int RowNo{get;set;} public int ProductId{get;set;} public string? InvoiceNo{get;set;} public DateTime? PurchaseDate{get;set;} public string? SupplierName{get;set;}
        public string? ItemName{get;set;} public string? Barcode{get;set;} public string? Group{get;set;} public string? Hsn{get;set;} public decimal GstRate{get;set;} public decimal Mrp{get;set;}
        public decimal Discount{get;set;} public decimal Qty{get;set;} public decimal FreeQuantity{get;set;} public string? Unit{get;set;} public decimal PurchaseRate{get;set;} public decimal SalePrice{get;set;}
        public decimal Amount{get;set;} public string? BatchNo{get;set;} public DateTime? ExpiryDate{get;set;}
    }
    public sealed record PurchaseImportCommitRequest(string? InvoiceNo,int? SupplierId,string? SupplierName,DateTime? PurchaseDate,string? PaymentMode,decimal PaidAmount,decimal Discount,List<PurchaseImportRow> Rows);
}
