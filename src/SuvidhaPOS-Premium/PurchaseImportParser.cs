using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.VisualBasic.FileIO;
using NPOI.SS.UserModel;
using NPOI.HSSF.UserModel;
using NPOI.XSSF.UserModel;
using Row=SuvidhaPOS.Premium.PurchaseImportModules.PurchaseImportRow;

namespace SuvidhaPOS.Premium;

/// <summary>Deterministic local parsing; malformed values survive as invalid sentinels until corrected.</summary>
public static class PurchaseImportParser
{
    public sealed record Parsed(List<Row> Rows,string? Error,string? SourceToken=null);
    static string Key(string value)=>Regex.Replace(value.Trim().ToLowerInvariant(),"[^a-z0-9]","");
    public static async Task<Parsed> Parse(IFormFile file)
    {
        var table=new List<(int Number,List<string> Cells)>();
        try
        {
            using var stream=new MemoryStream();await file.CopyToAsync(stream);stream.Position=0;
            var sourceToken=Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(stream.ToArray()));
            var ext=Path.GetExtension(file.FileName).ToLowerInvariant();
            if(ext is ".xls" or ".xlsx")
            {
                using IWorkbook book=ext==".xls"?new HSSFWorkbook(stream):new XSSFWorkbook(stream);
                if(book.NumberOfSheets==0)return new(new(),"Workbook has no sheet");
                var sheet=book.GetSheetAt(0);
                for(int n=sheet.FirstRowNum;n<=sheet.LastRowNum;n++)
                {
                    var row=sheet.GetRow(n);if(row is null)continue;
                    var cells=new List<string>();for(int i=0;i<row.LastCellNum;i++)cells.Add(Cell(row.GetCell(i)));
                    table.Add((n+1,cells));
                }
            }
            else if(ext is ".csv" or ".txt")
            {
                using var csv=new TextFieldParser(stream);csv.SetDelimiters(",");csv.HasFieldsEnclosedInQuotes=true;
                while(!csv.EndOfData){int number=(int)csv.LineNumber;table.Add((number,(csv.ReadFields()??Array.Empty<string>()).ToList()));}
            }
            else return new(new(),"Supported files: .xls, .xlsx, .csv");
            var header=table.FindIndex(t=>t.Cells.Any(c=>new[]{"itemdetails","itemname","product","description","particulars"}.Contains(Key(c)))&&t.Cells.Any(c=>new[]{"qty","quantity","pcs","mrp","price"}.Contains(Key(c))));
            if(header<0)return new(new(),"Could not find purchase header row");
            var columns=new Dictionary<string,int>();for(int i=0;i<table[header].Cells.Count;i++)columns.TryAdd(Key(table[header].Cells[i]),i);
            bool explicitItem=new[]{"itemdetails","itemname","product","description"}.Any(columns.ContainsKey);
            var result=new List<Row>();string invoice="",supplier="",group="";DateTime? date=null;
            foreach(var line in table.Skip(header+1))
            {
                string Get(params string[] aliases){foreach(var alias in aliases)if(columns.TryGetValue(Key(alias),out int index)&&index<line.Cells.Count&&!string.IsNullOrWhiteSpace(line.Cells[index]))return line.Cells[index].Trim();return "";}
                var v=Get("Vch/Bill No","Bill No","Invoice No","Invoice");if(v!="")invoice=v;
                v=Get("Supplier","Party","Supplier Name");if(v==""&&explicitItem)v=Get("Particulars");if(v!="")supplier=v;
                v=Get("Date","Purchase Date");if(v!="")date=Date(v);
                v=Get("Group","Category");if(v!="")group=v;
                var item=explicitItem?Get("Item Details","Item Name","Product","Description"):Get("Particulars");
                if(new[]{"total","grandtotal","subtotal"}.Contains(Key(item)))continue;
                if(item==""&&Get("BCN","Barcode","Bar Code","EAN")==""&&Get("Qty","Quantity","Pcs","Free Qty","Free","Price","Purchase","Purchase Rate","Rate","MRP","Amount","Sale Price","Selling Price")=="")continue;
                var row=new Row{RowNo=line.Number,InvoiceNo=invoice,PurchaseDate=date,SupplierName=supplier,ItemName=item,Group=group,
                    Barcode=Get("BCN","Barcode","Bar Code","EAN"),Hsn=Get("HSN CODE","HSN","HSN/SAC"),
                    GstRate=Number(Get("TAX RATE","GST","GST %"),true),Mrp=RequiredNumber(Get("MRP")),Discount=Number(Get("Disc","Discount","Discount Per","Discount %")),
                    Qty=RequiredNumber(Get("Qty","Quantity","Pcs")),FreeQuantity=Number(Get("Free Qty","Free")),Unit=Get("Unit","UOM"),
                    PurchaseRate=RequiredNumber(Get("Price","Purchase","Purchase Rate","Rate")),SalePrice=Number(Get("Sale Price","Selling Price")),Amount=Number(Get("Amount")),
                    BatchNo=Get("Batch No","Batch"),ExpiryDate=Date(Get("Expiry Date","Expiry")),TaxMode=Get("Tax Mode","GST Mode")};
                row.SourceBarcode=row.Barcode;if(string.IsNullOrWhiteSpace(row.TaxMode))row.TaxMode="INCLUSIVE";
                PurchaseImportRules.ValidateValues(row);result.Add(row);
            }
            return new(result,null,sourceToken);
        }
        catch(Exception ex){return new(new(),"Could not read purchase file: "+ex.Message);}
    }
    static string Cell(ICell? cell)
    {
        if(cell is null)return "";
        var type=cell.CellType==CellType.Formula?cell.CachedFormulaResultType:cell.CellType;
        if(type==CellType.Numeric)
        {
            var value=cell.NumericCellValue;
            if(DateUtil.IsCellDateFormatted(cell))return DateTime.FromOADate(value).ToString("yyyy-MM-dd",CultureInfo.InvariantCulture);
            if(cell.CellStyle.GetDataFormatString()?.Contains('%')==true)return (value*100).ToString("0.################",CultureInfo.InvariantCulture)+"%";
            return value.ToString("0.################",CultureInfo.InvariantCulture);
        }
        return type switch{CellType.String=>cell.StringCellValue.Trim(),CellType.Blank=>"",_=>"#INVALID"};
    }
    static decimal RequiredNumber(string raw)=>string.IsNullOrWhiteSpace(raw)?-1:Number(raw);
    public static decimal Number(string? raw,bool tax=false)
    {
        var text=(raw??"").Trim();if(text=="")return 0;
        if(tax&&new[]{"exempt","nil","nil rated","non gst","non-gst"}.Contains(text.ToLowerInvariant()))return 0;
        if(tax)text=Regex.Replace(text,@"^(GST|IGST)\s*", "",RegexOptions.IgnoreCase);
        text=Regex.Replace(text,@"^(₹|Rs\.?|INR|\$)\s*", "",RegexOptions.IgnoreCase).Trim();
        if(text.EndsWith('%'))text=text[..^1].Trim();
        // Accept Indian/western grouped numbers, never strip arbitrary text or concatenate numbers.
        if(!Regex.IsMatch(text,@"^[+-]?(?:(?:\d+|\d{1,3}(?:,\d{2,3})+)(?:\.\d*)?|\.\d+)$"))return -1;
        return decimal.TryParse(text.Replace(",",""),NumberStyles.AllowLeadingSign|NumberStyles.AllowDecimalPoint,CultureInfo.InvariantCulture,out var value)?value:-1;
    }
    static DateTime? Date(string raw)
    {
        if(string.IsNullOrWhiteSpace(raw))return null;
        if(DateTime.TryParseExact(raw.Trim(),new[]{"d/M/yyyy","d-M-yyyy","yyyy-MM-dd","yyyy/M/d","d.M.yyyy","d/M/yy","d-M-yy","d-MMM-yyyy","d-MMM-yy","d MMM yyyy","yyyy-MM-ddTHH:mm:ss","yyyy-MM-dd HH:mm:ss"},CultureInfo.GetCultureInfo("en-IN"),DateTimeStyles.None,out var value))return value.Date;
        if(double.TryParse(raw,NumberStyles.AllowDecimalPoint,CultureInfo.InvariantCulture,out var serial)&&serial>=1&&serial<=2958465)return DateTime.FromOADate(serial).Date;
        return DateTime.MinValue;
    }
}
