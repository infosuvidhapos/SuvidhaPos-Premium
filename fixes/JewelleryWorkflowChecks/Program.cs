using SuvidhaPOS.Premium;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using SuvidhaPOS.Premium.Data;

static void Check(bool ok,string message){if(!ok)throw new Exception(message);}
static void Reject(Action action,string message){try{action();}catch(ArgumentException){return;}throw new Exception(message);}
var today=new DateTime(2026,9,12);
JewelleryRegisterData Base()=>new(){PartyName="QA Customer",Title="QA entry",Date=today.AddDays(-365),Amount=1000,Weight=10};
JewelleryRegisterAction Act(string name,decimal amount=0)=>new(){Action=name,Amount=amount,Date=today,Notes="QA",ReferenceNo="QA-REF"};
var quote=Base();quote.Lines=new(){new(){Name="Ring",Quantity=1,Weight=2,Rate=100,Making=10,GstRate=3,TaxMode="EXCLUSIVE"},new(){Name="Chain",Rate=103,GstRate=3,TaxMode="INCLUSIVE"}};
JewelleryRegisterRules.Create("ESTIMATE",quote,today);Check(quote.Amount==319.30m,"Inclusive/exclusive estimate total");
var loan=Base();loan.AnnualRate=10;JewelleryRegisterRules.Create("GIRVI",loan,today);Check(JewelleryRegisterRules.LoanDue(loan,today)==1100,"One year simple interest");
JewelleryRegisterRules.Act("GIRVI",loan,Act("PAYMENT",150),today);Check(loan.PrincipalOutstanding==950&&loan.InterestOutstanding==0,"Interest then principal allocation");
Reject(()=>JewelleryRegisterRules.Act("GIRVI",loan,Act("PAYMENT",951),today),"Overpayment rejected");
Reject(()=>JewelleryRegisterRules.Act("GIRVI",loan,new(){Action="PAYMENT",Amount=1,Date=today.AddDays(-1)},today),"Backdated loan receipt rejected");
JewelleryRegisterRules.Act("GIRVI",loan,Act("PAYMENT",950),today);Check(loan.Status=="CLOSED","Loan close after full settlement");
Reject(()=>JewelleryRegisterRules.Act("GIRVI",loan,Act("PAYMENT",1),today),"Closed loan rejects receipts");
var scheme=Base();scheme.Instalment=100;scheme.Months=12;JewelleryRegisterRules.Create("SCHEME",scheme,today);
Reject(()=>JewelleryRegisterRules.Act("SCHEME",scheme,Act("REDEEM"),today),"Unfunded scheme cannot redeem");
JewelleryRegisterRules.Act("SCHEME",scheme,Act("PAYMENT",1200),today);JewelleryRegisterRules.Act("SCHEME",scheme,Act("REDEEM"),today);Check(scheme.Status=="REDEEMED","Mature funded scheme redeems once");
var repair=Base();JewelleryRegisterRules.Create("REPAIR",repair,today);Reject(()=>JewelleryRegisterRules.Act("REPAIR",repair,Act("DELIVER"),today),"Unready unpaid work cannot deliver");
JewelleryRegisterRules.Act("REPAIR",repair,Act("START"),today);JewelleryRegisterRules.Act("REPAIR",repair,Act("READY"),today);JewelleryRegisterRules.Act("REPAIR",repair,Act("PAYMENT",1000),today);JewelleryRegisterRules.Act("REPAIR",repair,Act("DELIVER"),today);Check(repair.Status=="DELIVERED","Repair lifecycle");
var issue=Base();issue.ItemId=1;issue.KarigarId=1;JewelleryRegisterRules.Create("ISSUE",issue,today);Reject(()=>JewelleryRegisterRules.Act("ISSUE",issue,new(){Action="RETURN",Weight=9,Date=today},today),"Unexplained weight loss rejected");JewelleryRegisterRules.Act("ISSUE",issue,new(){Action="RETURN",Weight=9,Date=today,Notes="Agreed 1g process loss"},today);Check(issue.ReturnedWeight==9,"Return recorded");
var ledger=Base();ledger.CustomerId=1;JewelleryRegisterRules.Create("LEDGER",ledger,today);JewelleryRegisterRules.Act("LEDGER",ledger,Act("REVERSE"),today);Reject(()=>JewelleryRegisterRules.Act("LEDGER",ledger,Act("REVERSE"),today),"Cannot reverse twice");
Console.WriteLine("PASS: estimate tax, loan repayment/interest, scheme redemption, work status, issue return, ledger reversal");
if(args.Length==0)return;
var cs=new SqlConnectionStringBuilder(args[0]);var dbName="JewelleryChecks_"+Guid.NewGuid().ToString("N");cs.InitialCatalog="master";
using var master=new SqlConnection(cs.ConnectionString);await master.OpenAsync();await new SqlCommand("CREATE DATABASE ["+dbName+"]",master).ExecuteNonQueryAsync();cs.InitialCatalog=dbName;
WebApplication? server=null;
try{
 using var connection=new SqlConnection(cs.ConnectionString);await connection.OpenAsync();
 await new SqlCommand(@"CREATE TABLE OutletMaster(Id int,StoreType nvarchar(80));INSERT OutletMaster VALUES(1,'Jewellery Shop');
CREATE TABLE Customers(Id int,Name nvarchar(200));INSERT Customers VALUES(1,'QA Customer');
CREATE TABLE JewelleryItems(Id int,Status nvarchar(30),GrossWeight decimal(18,4),LessWeight decimal(18,4),NetWeight decimal(18,4),FineWeight decimal(18,4),PurityPercent decimal(18,4));INSERT JewelleryItems VALUES(1,'IN_STOCK',10,1,9,8.244,91.6);
CREATE TABLE AuditLogs(Id int IDENTITY,UserName nvarchar(80),Action nvarchar(100),Entity nvarchar(100),EntityId int,Details nvarchar(1000));",connection).ExecuteNonQueryAsync();
 var schema=File.ReadAllText("src/SuvidhaPOS-Premium/Database/jewellery-registers-schema.sql");
 foreach(var batch in System.Text.RegularExpressions.Regex.Split(schema,@"^GO\s*$",System.Text.RegularExpressions.RegexOptions.Multiline|System.Text.RegularExpressions.RegexOptions.IgnoreCase))if(!string.IsNullOrWhiteSpace(batch))await new SqlCommand(batch,connection).ExecuteNonQueryAsync();
 var builder=WebApplication.CreateBuilder();builder.Configuration["ConnectionStrings:DefaultConnection"]=cs.ConnectionString;builder.Services.AddSingleton<Db>();server=builder.Build();server.Urls.Add("http://127.0.0.1:0");JewelleryRegisterModules.Map(server);await server.StartAsync();
 using var http=new HttpClient{BaseAddress=new Uri(server.Urls.Single())};
 async Task<JsonElement> Post(string path,object body){var response=await http.PostAsJsonAsync("/api/jewellery/registers/"+path,body);var text=await response.Content.ReadAsStringAsync();Check(response.IsSuccessStatusCode,path+": "+text);return JsonDocument.Parse(text).RootElement.Clone();}
 var k=await Post("KARIGAR",new{RequestId=Guid.NewGuid(),Data=new JewelleryRegisterData{PartyName="QA Artisan",Title="Gold work"}});var kid=k.GetProperty("id").GetInt32();
 var req=Guid.NewGuid();var payload=new{RequestId=req,Data=new JewelleryRegisterData{PartyName="QA Artisan",Title="Issue Tag 1",ItemId=1,KarigarId=kid,Weight=10}};
 var first=await Post("ISSUE",payload);var iid=first.GetProperty("id").GetInt32();var again=await Post("ISSUE",payload);Check(again.GetProperty("id").GetInt32()==iid,"Create request replay duplicates stock issue");
 Check((await new SqlCommand("SELECT Status FROM JewelleryItems WHERE Id=1",connection).ExecuteScalarAsync())?.ToString()=="WORKSHOP_ISSUED","Issued tag must not be saleable");
 var concurrent=await http.PostAsJsonAsync("/api/jewellery/registers/ISSUE",new{RequestId=Guid.NewGuid(),Data=payload.Data});Check(concurrent.StatusCode==HttpStatusCode.BadRequest,"Second issue of same tag must fail");
 var invalidReturn=await http.PostAsJsonAsync($"/api/jewellery/registers/ISSUE/{iid}/actions",new JewelleryRegisterAction{RequestId=Guid.NewGuid(),Revision=1,Action="RETURN",Weight=0.5m,Notes="bad"});Check(invalidReturn.StatusCode==HttpStatusCode.Conflict,"Return below stone/less weight must rollback");
 var returned=new JewelleryRegisterAction{RequestId=Guid.NewGuid(),Revision=1,Action="RETURN",Weight=9,Notes="Process loss"};await Post($"ISSUE/{iid}/actions",returned);await Post($"ISSUE/{iid}/actions",returned);
 Check(Convert.ToDecimal(await new SqlCommand("SELECT GrossWeight FROM JewelleryItems WHERE Id=1",connection).ExecuteScalarAsync())==9,"Returned tag weight persisted");
 var detail=JsonDocument.Parse(await http.GetStringAsync($"/api/jewellery/registers/ISSUE/{iid}"));Check(detail.RootElement.GetProperty("data").GetProperty("Status").GetString()=="RETURNED","Client data casing and returned status");
 var stale=await http.PostAsJsonAsync($"/api/jewellery/registers/ISSUE/{iid}/actions",new JewelleryRegisterAction{RequestId=Guid.NewGuid(),Revision=1,Action="RETURN",Weight=9,Notes="stale"});Check(stale.StatusCode==HttpStatusCode.Conflict,"Stale action version must fail");
 await new SqlCommand("UPDATE OutletMaster SET StoreType='Retail'",connection).ExecuteNonQueryAsync();Check((await http.GetAsync("/api/jewellery/registers/KARIGAR")).StatusCode==HttpStatusCode.Forbidden,"Normal mode must not access jewellery registers");
 Console.WriteLine("PASS: SQL persistence, idempotency, issue reservation, rollback, return weight, revision conflict and normal-mode guard");
}finally{
 if(server!=null){await server.StopAsync();await server.DisposeAsync();}
 SqlConnection.ClearAllPools();await new SqlCommand("ALTER DATABASE ["+dbName+"] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE ["+dbName+"]",master).ExecuteNonQueryAsync();
}
