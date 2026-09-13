using NPOI.SS.UserModel;
using NPOI.XSSF.UserModel;
using SuvidhaPOS.Premium.Data;

namespace SuvidhaPOS.Premium;

public static class PurchaseImportModules
{
    public static void Map(WebApplication app)
    {
        app.MapPost("/api/purchase-import/preview", async (Db db, HttpRequest req) =>
        {
            if (!req.HasFormContentType) return Results.BadRequest(new { message="Upload Excel/CSV file" });
            var form=await req.ReadFormAsync();var file=form.Files.FirstOrDefault();
            if(file is null||file.Length==0) return Results.BadRequest(new {message="Choose purchase import file"});
            if(file.Length>25*1024*1024) return Results.BadRequest(new {message="File is larger than 25 MB"});
            var parsed=await Parse(file);
            if(parsed.Error is not null) return Results.BadRequest(new {message=parsed.Error});
            return await PurchasePostingService.Preview(db,new(null,null,null,null,null,0,0,parsed.Rows,SourceToken:parsed.SourceToken));
        });
        app.MapPost("/api/purchase-import/validate", (Db db,PurchaseImportCommitRequest x)=>PurchasePostingService.Preview(db,x));
        app.MapPost("/api/purchase-import/commit", (Db db,HttpContext ctx,PurchaseImportCommitRequest x)=>PurchasePostingService.Commit(db,x,Actor(ctx)));

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

    internal static string Actor(HttpContext ctx)=>ctx.Items.TryGetValue("User",out var user)?user?.GetType().GetProperty("UserName")?.GetValue(user)?.ToString()??"Unknown":ctx.User.Identity?.Name??"Unknown";

    // Kept reflection-accessible for the synthetic parser checks.
    static Task<PurchaseImportParser.Parsed> Parse(IFormFile file)=>PurchaseImportParser.Parse(file);
    public sealed class PurchaseImportRow
    {
        public int SupplierId{get;set;}public string? SupplierStatus{get;set;}
        public int RowNo{get;set;} public int ProductId{get;set;} public string? InvoiceNo{get;set;} public DateTime? PurchaseDate{get;set;} public string? SupplierName{get;set;}
        public string? ItemName{get;set;} public string? Barcode{get;set;} public string? Group{get;set;} public string? Hsn{get;set;} public decimal GstRate{get;set;} public decimal Mrp{get;set;}
        public decimal Discount{get;set;} public decimal Qty{get;set;} public decimal FreeQuantity{get;set;} public string? Unit{get;set;} public decimal PurchaseRate{get;set;} public decimal SalePrice{get;set;}
        public decimal Amount{get;set;} public string? BatchNo{get;set;} public DateTime? ExpiryDate{get;set;}
        public string? TaxMode{get;set;}="INCLUSIVE";
        public List<string> Errors{get;set;}=new(); public List<string> Warnings{get;set;}=new();
        public string Status{get;set;}="NEW";public string Match{get;set;}="NEW";public bool Conflict{get;set;}public bool NewItem{get;set;}
        public string? SourceBarcode{get;set;}public string? EffectiveBarcode{get;set;}public string GroupKey{get;set;}="";public decimal BaseFactor{get;set;}=1;
    }
    public sealed record PurchaseImportCommitRequest(string? InvoiceNo,int? SupplierId,string? SupplierName,DateTime? PurchaseDate,string? PaymentMode,decimal PaidAmount,decimal Discount,List<PurchaseImportRow> Rows,string? RequestId=null,string? PreviewToken=null,string? SourceToken=null);
}
