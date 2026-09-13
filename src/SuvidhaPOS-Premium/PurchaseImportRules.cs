using System.Text.RegularExpressions;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Row=SuvidhaPOS.Premium.PurchaseImportModules.PurchaseImportRow;
using Request=SuvidhaPOS.Premium.PurchaseImportModules.PurchaseImportCommitRequest;

namespace SuvidhaPOS.Premium;

public static class PurchaseImportRules
{
    public sealed record Master(int Id,string Name,string? Barcode,bool Active,string Unit,string BaseUnit,string? InnerUnit,string PackUnit,decimal InnerFactor,decimal PackFactor);
    public sealed record Supplier(int Id,string Name,bool Active);
    public sealed record UnitDefinition(string Name,string Code);
    public sealed record Group(string GroupKey,string ItemName,int ProductId,bool NewItem,decimal PurchasePrice,decimal Mrp,decimal Discount,decimal SalePrice,decimal Quantity,int RowCount);
    public sealed record Totals(decimal SubTotal,decimal Tax,decimal Total,decimal SourceAmount,decimal Quantity);
    public sealed record Validation(List<Row> Rows,List<Group> Groups,Totals Totals,string PreviewToken);
    public static string Name(string? value)=>Regex.Replace((value??"").Trim(),@"\s+"," ");
    public static string Key(string? value)=>Name(value).ToUpperInvariant();
    public static string Hash(object value)=>Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value))));
    public static string Payload(Request x)=>Hash(new{x.SourceToken,x.InvoiceNo,x.SupplierId,x.SupplierName,x.PurchaseDate,x.PaymentMode,x.PaidAmount,x.Discount,Rows=x.Rows.Select(r=>new{r.RowNo,r.InvoiceNo,r.PurchaseDate,r.SupplierName,r.ItemName,r.Barcode,r.Group,r.Hsn,r.GstRate,r.Mrp,r.Discount,r.Qty,r.FreeQuantity,r.Unit,r.PurchaseRate,r.SalePrice,r.Amount,r.BatchNo,r.ExpiryDate,r.TaxMode})});
    public static decimal Tax(decimal amount,decimal rate,string? mode)=>Math.Round(mode=="EXCLUSIVE"?amount*rate/100m:amount*rate/(100m+rate),2,MidpointRounding.AwayFromZero);
    public static decimal Sale(decimal mrp,decimal discount)=>Math.Round(mrp*(1-discount/100m),2,MidpointRounding.AwayFromZero);
    public static string UnitKey(string? value)=>Key(value).TrimEnd('.') switch {"PIECE" or "PIECES" or "EACH"=>"PCS","BTL"=>"BOTTLE","PKT"=>"PACKET","LITER" or "LITERS" or "LITRES"=>"LITRE","GMS" or "GRAMS"=>"GRAM","KILOGRAM" or "KILOGRAMS"=>"KG",var other=>other};
    public static string? ResolveUnit(string? value,List<UnitDefinition> units)=>units.FirstOrDefault(u=>UnitKey(u.Name)==UnitKey(value)||UnitKey(u.Code)==UnitKey(value))?.Name;
    public static void ValidateValues(Row row)
    {
        row.Errors=new();row.Warnings=new();
        void Required(string? value,int max,string label){if(string.IsNullOrWhiteSpace(value))row.Errors.Add(label+" is required");else if(value.Length>max)row.Errors.Add(label+" is too long");}
        Required(row.ItemName,200,"Item Name");Required(row.InvoiceNo,80,"Invoice No");Required(row.SupplierName,200,"Supplier");
        if(!row.PurchaseDate.HasValue||row.PurchaseDate.Value.Year<1900)row.Errors.Add("Valid purchase date is required");
        if(row.ExpiryDate.HasValue&&row.ExpiryDate.Value.Year<1900)row.Errors.Add("Invalid expiry date");
        if(row.Qty<=0||row.Qty>999999999)row.Errors.Add("Quantity must be a valid number greater than zero");
        if(row.Qty!=Math.Round(row.Qty,3)||row.FreeQuantity!=Math.Round(row.FreeQuantity,3))row.Errors.Add("Quantity supports up to 3 decimal places");
        if(row.FreeQuantity<0||row.FreeQuantity>999999999)row.Errors.Add("Free quantity must be nonnegative");
        if(row.PurchaseRate<0||row.PurchaseRate>9999999999m)row.Errors.Add("Invalid purchase rate");
        if(row.Mrp<0||row.Mrp>9999999999m)row.Errors.Add("Invalid MRP");
        if(row.Discount<0||row.Discount>100)row.Errors.Add("Discount must be between 0 and 100");
        if(row.GstRate<0||row.GstRate>100)row.Errors.Add("GST must be a valid percentage between 0 and 100");
        if(row.Amount<0||row.Amount>9999999999999999m)row.Errors.Add("Invalid source amount");
        if(row.SalePrice<0||row.SalePrice>9999999999m)row.Errors.Add("Invalid sale price");
        row.TaxMode=string.IsNullOrWhiteSpace(row.TaxMode)?"INCLUSIVE":Key(row.TaxMode);
        if(row.TaxMode is not ("INCLUSIVE" or "EXCLUSIVE"))row.Errors.Add("Tax mode must be INCLUSIVE or EXCLUSIVE");
        if((row.Barcode?.Length??0)>80)row.Errors.Add("Barcode is too long");
        if((row.Group?.Length??0)>100||(row.Hsn?.Length??0)>30||(row.BatchNo?.Length??0)>100)row.Errors.Add("Category, HSN or batch is too long");
        if(row.Amount>0&&row.PurchaseRate>=0&&row.PurchaseRate<=9999999999m&&row.Qty>0&&row.Qty<=999999999&&Math.Abs(row.Amount-Math.Round(row.PurchaseRate*row.Qty,2))>0.05m)row.Warnings.Add("Source amount differs from quantity × purchase rate; verify the bill");
    }
    public static Validation Validate(Request request,List<Master> masters,List<UnitDefinition> units,bool requireBatch=false,bool requireExpiry=false,List<Supplier>? suppliers=null)
    {
        var rows=request.Rows;var groups=new List<Group>();
        var supplierIndex=(suppliers??new()).GroupBy(s=>Key(s.Name)).ToDictionary(g=>g.Key,g=>g.ToList());
        var masterIndex=masters.GroupBy(m=>Key(m.Name)).ToDictionary(g=>g.Key,g=>g.ToList());
        foreach(var r in rows)
        {
            r.ItemName=Name(r.ItemName);r.InvoiceNo=Name(string.IsNullOrWhiteSpace(r.InvoiceNo)?request.InvoiceNo:r.InvoiceNo);
            r.SupplierName=Name(string.IsNullOrWhiteSpace(r.SupplierName)?request.SupplierName:r.SupplierName);r.PurchaseDate??=request.PurchaseDate;
            r.Barcode=string.IsNullOrWhiteSpace(r.Barcode)?null:r.Barcode.Trim();r.SourceBarcode=r.Barcode;
            ValidateValues(r);r.GroupKey=Key(r.ItemName);r.ProductId=0;r.BaseFactor=1;r.NewItem=false;r.Conflict=false;
            var supplierMatches=supplierIndex.GetValueOrDefault(Key(r.SupplierName))??new();r.SupplierId=0;r.SupplierStatus="NEW";
            if(supplierMatches.Count>1)r.Errors.Add("Multiple suppliers have this name; correct the supplier mapping before import");
            else if(supplierMatches.Count==1){var supplier=supplierMatches[0];r.SupplierId=supplier.Id;r.SupplierStatus="EXISTING";if(!supplier.Active)r.Errors.Add("Matching supplier is inactive; reactivate it explicitly");}
            else if(!string.IsNullOrWhiteSpace(r.SupplierName))r.Warnings.Add("New supplier will be added: "+r.SupplierName);
            if(requireBatch&&string.IsNullOrWhiteSpace(r.BatchNo))r.Errors.Add("Batch No is required for this outlet");
            if(requireExpiry&&!r.ExpiryDate.HasValue)r.Errors.Add("Expiry Date is required for this outlet");
        }
        var ownedBarcodes=masters.Where(m=>!string.IsNullOrWhiteSpace(m.Barcode)).Select(m=>Key(m.Barcode)).ToHashSet();
        foreach(var group in rows.GroupBy(r=>r.GroupKey))
        {
            var first=group.First();var hits=masterIndex.GetValueOrDefault(group.Key)??new();var master=hits.Count==1?hits[0]:null;
            var newItem=hits.Count==0;var effective=master!=null?master.Barcode:first.Barcode;bool cleared=false;
            if(newItem&&!string.IsNullOrWhiteSpace(effective)){
                if(!ownedBarcodes.Add(Key(effective))){effective=null;cleared=true;}
            }
            string? firstUnit=null;int index=0;
            foreach(var row in group)
            {
                row.ProductId=master?.Id??0;row.NewItem=newItem;row.Match=newItem?"NEW":"NAME";row.EffectiveBarcode=effective;
                if(hits.Count>1)row.Errors.Add("Multiple existing products have this normalized name; resolve the ambiguity in Item Master");
                if(master is {Active:false})row.Errors.Add("Matching product is inactive; reactivate it explicitly in Item Master");
                var unit=ResolveUnit(string.IsNullOrWhiteSpace(row.Unit)?master?.BaseUnit??"PCS":row.Unit,units);
                if(unit is null)row.Errors.Add("Unit is not in active Unit Master");else row.Unit=unit;
                if(master!=null&&unit!=null){
                    row.BaseFactor=UnitKey(unit)==UnitKey(ResolveUnit(master.BaseUnit,units)??master.BaseUnit)?1:UnitKey(unit)==UnitKey(ResolveUnit(master.PackUnit,units)??master.PackUnit)?master.PackFactor:UnitKey(unit)==UnitKey(ResolveUnit(master.InnerUnit,units)??master.InnerUnit)?master.InnerFactor:0;
                    if(row.BaseFactor<=0||row.BaseFactor>999999999)row.Errors.Add("Purchased unit is incompatible with the existing item conversion");
                }
                if(row.BaseFactor>0&&row.BaseFactor<=999999999&&row.Qty>0&&row.Qty<=999999999&&row.FreeQuantity>=0&&row.FreeQuantity<=999999999){
                    if((row.Qty+row.FreeQuantity)*row.BaseFactor>999999999999999m)row.Errors.Add("Converted stock exceeds storage capacity");
                    if(row.Qty*row.BaseFactor!=Math.Round(row.Qty*row.BaseFactor,3)||row.FreeQuantity*row.BaseFactor!=Math.Round(row.FreeQuantity*row.BaseFactor,3))row.Errors.Add("Converted stock supports up to 3 decimal places");
                }
                if(newItem){firstUnit??=unit;if(unit!=firstUnit)row.Errors.Add("Same-name new items must use the same unit");}
                if(cleared)row.Warnings.Add("Barcode belongs to a different item; this new master will have no barcode");
                if(index>0&&Key(row.Barcode)!=Key(first.Barcode))row.Warnings.Add("Same-name group uses the first row's identity and barcode");
                if(index>0&&(row.GstRate!=first.GstRate||row.TaxMode!=first.TaxMode||Key(row.Group)!=Key(first.Group)||Key(row.Hsn)!=Key(first.Hsn)))row.Warnings.Add("New master identity/tax/category uses first row; purchase line keeps its own tax");
                row.Status=row.Errors.Count>0?"ERROR":cleared?"BARCODE_CLEARED":index>0?"MERGED":newItem?"NEW":"EXISTING";
                row.Conflict=row.Errors.Count>0;index++;
            }
            var valid=group.Where(r=>r.Errors.Count==0).ToList();var mrp=valid.Count==0?0:valid.Max(r=>r.Mrp);var discount=valid.Count==0?0:valid.Max(r=>r.Discount);
            groups.Add(new(group.Key,first.ItemName??"",master?.Id??0,newItem,valid.Count==0?0:valid.Average(r=>r.PurchaseRate),mrp,discount,Sale(mrp,discount),valid.Sum(r=>(r.Qty+r.FreeQuantity)*r.BaseFactor),group.Count()));
        }
        decimal sub=0,tax=0;
        foreach(var r in rows.Where(r=>r.Errors.Count==0)){var amount=Math.Round(r.Qty*r.PurchaseRate,2,MidpointRounding.AwayFromZero);var lineTax=Tax(amount,r.GstRate,r.TaxMode);tax+=lineTax;sub+=r.TaxMode=="INCLUSIVE"?amount-lineTax:amount;}
        if(request.Discount>sub+tax||request.PaidAmount>sub+tax-request.Discount){foreach(var row in rows){row.Errors.Add("Bill discount or paid amount exceeds purchase total");row.Status="ERROR";row.Conflict=true;}}
        var totals=new Totals(sub,tax,sub+tax-request.Discount,rows.Where(r=>r.Amount>=0&&r.Amount<=9999999999999999m).Sum(r=>r.Amount),rows.Where(r=>r.Qty>=0&&r.Qty<=999999999).Sum(r=>r.Qty));
        var token=Hash(rows.Select(r=>new{r.GroupKey,r.ProductId,r.EffectiveBarcode,r.Unit,r.BaseFactor,r.SupplierId,r.SupplierStatus,r.Errors}));
        return new(rows,groups,totals,token);
    }
    public static async Task<List<Supplier>> LoadSuppliers(SqlConnection connection,SqlTransaction? tx,bool locked)
    {
        var suppliers=new List<Supplier>();using var cmd=new SqlCommand("SELECT Id,Name,IsActive FROM Suppliers "+(locked?"WITH(UPDLOCK,HOLDLOCK) ":"")+"ORDER BY Id",connection,tx);
        using var reader=await cmd.ExecuteReaderAsync();while(await reader.ReadAsync())suppliers.Add(new(reader.GetInt32(0),reader.GetString(1),reader.GetBoolean(2)));return suppliers;
    }
    public static async Task<(List<Master> Masters,List<UnitDefinition> Units,bool Batch,bool Expiry)> Load(SqlConnection connection,SqlTransaction? tx,bool locked)
    {
        var masters=new List<Master>();var units=new List<UnitDefinition>();
        using(var cmd=new SqlCommand(@"SELECT p.Id,p.Name,p.Barcode,p.IsActive,p.Unit,ISNULL(u.BaseUnit,p.Unit),u.InnerUnit,ISNULL(u.PackUnit,p.Unit),ISNULL(u.InnerConversionFactor,1),ISNULL(u.ConversionFactor,1)
FROM Products p "+(locked?"WITH(UPDLOCK,HOLDLOCK) ":"")+"LEFT JOIN ProductUoms u "+(locked?"WITH(UPDLOCK,HOLDLOCK) ":"")+"ON u.ProductId=p.Id ORDER BY p.Id",connection,tx))
        using(var reader=await cmd.ExecuteReaderAsync())while(await reader.ReadAsync())masters.Add(new(reader.GetInt32(0),reader.GetString(1),reader.IsDBNull(2)?null:reader.GetString(2),reader.GetBoolean(3),reader.GetString(4),reader.GetString(5),reader.IsDBNull(6)?null:reader.GetString(6),reader.GetString(7),reader.GetDecimal(8),reader.GetDecimal(9)));
        using(var cmd=new SqlCommand("SELECT UnitName,UnitCode FROM UnitMaster "+(locked?"WITH(HOLDLOCK) ":"")+"WHERE IsActive=1",connection,tx))using(var reader=await cmd.ExecuteReaderAsync())while(await reader.ReadAsync())units.Add(new(reader.GetString(0),reader.GetString(1)));
        bool batch=false,expiry=false;
        using(var cmd=new SqlCommand("SELECT TOP 1 StoreType,RequireBatch,RequireExpiry FROM OutletMaster ORDER BY Id",connection,tx))using(var reader=await cmd.ExecuteReaderAsync())if(await reader.ReadAsync()){
            var store=reader.GetString(0);var pharmacy=store.Contains("Pharmacy",StringComparison.OrdinalIgnoreCase)||store.Contains("Medical",StringComparison.OrdinalIgnoreCase);
            batch=pharmacy||reader.GetBoolean(1);expiry=pharmacy||reader.GetBoolean(2);
        }
        return(masters,units,batch,expiry);
    }
}
