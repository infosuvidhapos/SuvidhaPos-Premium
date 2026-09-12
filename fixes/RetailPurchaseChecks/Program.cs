using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.Data.SqlClient;
using NPOI.SS.UserModel;
using NPOI.HSSF.UserModel;
using NPOI.XSSF.UserModel;
using SuvidhaPOS.Premium;
using SuvidhaPOS.Premium.Data;
using Row = SuvidhaPOS.Premium.PurchaseImportModules.PurchaseImportRow;

static void Check(bool condition,string message){if(!condition)throw new Exception(message);}
static async Task<List<Row>> Parse(byte[] bytes,string name){
 using var stream=new MemoryStream(bytes);
 var file=new FormFile(stream,0,bytes.Length,"file",name);
 var method=typeof(PurchaseImportModules).GetMethod("Parse",BindingFlags.Static|BindingFlags.NonPublic)!;
 var task=(Task)method.Invoke(null,new object[]{file})!;await task;
 var result=task.GetType().GetProperty("Result")!.GetValue(task)!;
 Check(result.GetType().GetProperty("Error")!.GetValue(result)==null,"Synthetic fixture should parse");
 return (List<Row>)result.GetType().GetProperty("Rows")!.GetValue(result)!;
}
var headers=new[]{"Date","Vch/Bill No","Particulars","Group","Item Details","TAX RATE","HSN CODE","BCN","MRP","Disc.","Qty.","Unit","Price","Amount"};
foreach(var xls in new[]{true,false}){
 IWorkbook book=xls?new HSSFWorkbook():new XSSFWorkbook();var sheet=book.CreateSheet("Synthetic");
 var header=sheet.CreateRow(0);for(int i=0;i<headers.Length;i++)header.CreateCell(i).SetCellValue(headers[i]);
 var first=sheet.CreateRow(1);var values=new[]{"25/08/2026","SYNTH-001","Synthetic Supplier","General"," Demo  Widget ","Exempt","1234","","12","10%","2","PCS","₹10","20"};
 for(int i=0;i<values.Length;i++)first.CreateCell(i).SetCellValue(values[i]);first.GetCell(7).SetCellValue(8901234567890d);
 var second=sheet.CreateRow(2);second.CreateCell(4).SetCellValue("demo widget");second.CreateCell(8).SetCellValue(14);second.CreateCell(9).SetCellValue(0.05);second.GetCell(9).CellStyle=book.CreateCellStyle();second.GetCell(9).CellStyle.DataFormat=book.CreateDataFormat().GetFormat("0%");second.CreateCell(10).SetCellValue(3);second.CreateCell(11).SetCellValue("PCS");second.CreateCell(12).SetCellValue(9);
 using var ms=new MemoryStream();book.Write(ms,true);var rows=await Parse(ms.ToArray(),xls?"synthetic.xls":"synthetic.xlsx");
 Check(rows.Count==2,"Only two source item rows");Check(rows[0].Barcode=="8901234567890","Numeric Excel barcode must retain plain digits");
 Check(rows[0].Discount==10&&rows[1].Discount==5,"Percent text and percentage cells retain percentage semantics");
 Check(rows.All(r=>r.PurchaseDate==new DateTime(2026,8,25)),"Day-first dates fill down");
 Check(rows.All(r=>r.SupplierName=="Synthetic Supplier"),"Particulars supplier metadata must fill down when Item Details exists");
 Check(rows.All(r=>r.InvoiceNo=="SYNTH-001"),"Invoice metadata fills down");Check(rows[0].GstRate==0,"Exempt means zero GST");
}
var csv=string.Join(',',headers)+"\n25/08/2026,SYNTH-002,Synthetic Supplier,General,CSV Widget,Exempt,1234,00123,14,10%,2,PCS,10,20\n,,,,CSV Widget,Exempt,,,14,5,3,PCS,9,27\n,,,,Bad Quantity,Exempt,,,14,5,abc,PCS,9,27";
var csvRows=await Parse(Encoding.UTF8.GetBytes(csv),"synthetic.csv");
Check(csvRows[1].PurchaseDate==new DateTime(2026,8,25)&&csvRows[1].InvoiceNo=="SYNTH-002","CSV metadata uses same fill-down as Excel");
var errors=typeof(Row).GetProperty("Errors")?.GetValue(csvRows[2]) as System.Collections.IEnumerable;
Check(errors!=null&&errors.Cast<object>().Any(),"Malformed quantity must create a row error, never silently become one");
Console.WriteLine("PASS: XLS/XLSX/CSV typed parser, plain barcode, percentage, Exempt, day-first dates, metadata fill-down, invalid numeric errors");
if(args.Length==0)return;
var cs=new SqlConnectionStringBuilder(args[0]);var database="RetailChecks_"+Guid.NewGuid().ToString("N");cs.InitialCatalog="master";
using var master=new SqlConnection(cs.ConnectionString);await master.OpenAsync();await new SqlCommand("CREATE DATABASE ["+database+"]",master).ExecuteNonQueryAsync();cs.InitialCatalog=database;
WebApplication? server=null;
try{
 using var connection=new SqlConnection(cs.ConnectionString);await connection.OpenAsync();
 foreach(var script in new[]{"schema.sql","specialized-schema.sql","print-schema.sql","completion-schema.sql","btc-settlement-schema.sql","held-bills-schema.sql","retail-expansion-schema.sql","retail-purchase-schema.sql"}){
  var path="src/SuvidhaPOS-Premium/Database/"+script;if(!File.Exists(path))continue;
  foreach(var batch in System.Text.RegularExpressions.Regex.Split(File.ReadAllText(path),@"^\s*GO\s*$",System.Text.RegularExpressions.RegexOptions.Multiline|System.Text.RegularExpressions.RegexOptions.IgnoreCase))if(!string.IsNullOrWhiteSpace(batch)&&!batch.Contains("CREATE DATABASE [SuvidhaPOS]")&&!batch.TrimStart().StartsWith("USE [SuvidhaPOS]",StringComparison.OrdinalIgnoreCase))await new SqlCommand(batch,connection).ExecuteNonQueryAsync();
 }
 await new SqlCommand("IF NOT EXISTS(SELECT 1 FROM UnitMaster WHERE UnitName='PCS') INSERT UnitMaster(UnitName,UnitCode,IsActive) VALUES('PCS','PCS',1)",connection).ExecuteNonQueryAsync();
 var builder=WebApplication.CreateBuilder();builder.Configuration["ConnectionStrings:DefaultConnection"]=cs.ConnectionString;builder.Services.AddSingleton<Db>();server=builder.Build();server.Urls.Add("http://127.0.0.1:0");PurchaseImportModules.Map(server);await server.StartAsync();
 using var http=new HttpClient{BaseAddress=new Uri(server.Urls.Single())};
 Row R(string name,decimal qty,decimal cost,decimal mrp,decimal discount,string barcode="SYNTH-BC")=>new(){RowNo=1,ItemName=name,Qty=qty,PurchaseRate=cost,Mrp=mrp,Discount=discount,Barcode=barcode,Unit="PCS",InvoiceNo="SYNTH-003",SupplierName="Synthetic Supplier",PurchaseDate=new DateTime(2026,8,25),GstRate=0};
 var rows=new[]{R("Demo  Widget",2,10,12,5),R(" demo widget ",3,9,14,10)};
 var requestId=Guid.NewGuid().ToString();var body=new{rows,requestId};
 async Task<JsonElement> Post(object payload){var response=await http.PostAsJsonAsync("/api/purchase-import/commit",payload);var content=await response.Content.ReadAsStringAsync();Check(response.IsSuccessStatusCode,"Commit: "+content);return JsonDocument.Parse(content).RootElement.Clone();}
 var committed=await Post(body);Check(committed.GetProperty("newItems").GetInt32()==1,"Same normalized names create one master");
 using(var command=new SqlCommand("SELECT PurchasePrice,Mrp,Dis_Rate,SalePrice,TaxMode FROM Products",connection))using(var rd=await command.ExecuteReaderAsync()){Check(await rd.ReadAsync(),"New master exists");Check(rd.GetDecimal(0)==9.5m&&rd.GetDecimal(1)==14&&rd.GetDecimal(2)==10&&rd.GetDecimal(3)==12.6m,"New master mean cost/max MRP/max discount");Check(rd.GetString(4)=="INCLUSIVE","New master defaults inclusive");Check(!await rd.ReadAsync(),"No duplicate master");}
 Check(Convert.ToDecimal(await new SqlCommand("SELECT SUM(Quantity) FROM ProductBatches",connection).ExecuteScalarAsync())==5,"Stock equals original quantities");
 Check(Convert.ToInt32(await new SqlCommand("SELECT COUNT(*) FROM ProductBatches WHERE (Quantity=2 AND CostPrice=10) OR (Quantity=3 AND CostPrice=9)",connection).ExecuteScalarAsync())==2,"Original separate batch costs remain unchanged");
 var replay=await Post(body);Check(replay.GetProperty("alreadyImported").GetBoolean(),"Identical request retry is idempotent");
 rows[0].Qty=9;var changed=await http.PostAsJsonAsync("/api/purchase-import/commit",body);Check(changed.StatusCode==HttpStatusCode.BadRequest,"Changed payload under same key rejected");rows[0].Qty=2;
 var duplicate=await http.PostAsJsonAsync("/api/purchase-import/commit",new{rows,requestId=Guid.NewGuid().ToString()});Check(duplicate.StatusCode==HttpStatusCode.BadRequest,"Duplicate invoice across requests rejected");
 var collision=R("Other Widget",1,8,16,20);collision.InvoiceNo="SYNTH-004";await Post(new{rows=new[]{collision},requestId=Guid.NewGuid().ToString()});
 Check(Convert.ToInt32(await new SqlCommand("SELECT COUNT(*) FROM Products WHERE Name='Other Widget' AND Barcode IS NULL",connection).ExecuteScalarAsync())==1,"Different name collision creates separate master with null barcode");
 var existing=R("demo widget",1,99,999,99,"OTHER-CODE");existing.InvoiceNo="SYNTH-005";await Post(new{rows=new[]{existing},requestId=Guid.NewGuid().ToString()});
 Check(Convert.ToDecimal(await new SqlCommand("SELECT PurchasePrice FROM Products WHERE Barcode='SYNTH-BC'",connection).ExecuteScalarAsync())==9.5m,"Existing master cost preserved");
 var invalid=R("Must Roll Back",1,5,10,0,"ROLLBACK");invalid.InvoiceNo="SYNTH-006";var bad=R("Bad Later",-1,5,10,0,"BAD");bad.InvoiceNo="SYNTH-006";
 var failure=await http.PostAsJsonAsync("/api/purchase-import/commit",new{rows=new[]{invalid,bad},requestId=Guid.NewGuid().ToString()});Check(failure.StatusCode==HttpStatusCode.BadRequest,"Invalid later row rejects whole upload");Check(Convert.ToInt32(await new SqlCommand("SELECT COUNT(*) FROM Products WHERE Barcode='ROLLBACK'",connection).ExecuteScalarAsync())==0,"Failed upload leaves no earlier product");
 Console.WriteLine("PASS: transactional routes, aggregation, batches, name-first collision handling, master preservation, retries, changed payload, duplicate invoice, rollback");
}finally{if(server!=null){await server.StopAsync();await server.DisposeAsync();}SqlConnection.ClearAllPools();await new SqlCommand("ALTER DATABASE ["+database+"] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;DROP DATABASE ["+database+"]",master).ExecuteNonQueryAsync();}
