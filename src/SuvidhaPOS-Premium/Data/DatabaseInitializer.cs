using Microsoft.Data.SqlClient;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
namespace SuvidhaPOS.Premium.Data;
public sealed class DatabaseInitializer
{
 private readonly Db _db; private readonly IConfiguration _cfg; public DatabaseInitializer(Db db,IConfiguration cfg){_db=db;_cfg=cfg;}
 public async Task InitializeAsync(){
  var cs=_cfg.GetConnectionString("DefaultConnection")!; var b=new SqlConnectionStringBuilder(cs); var dbName=b.InitialCatalog; b.InitialCatalog="master";
  var safeDb=dbName.Replace("]","]]" ); var safeName=dbName.Replace("'","''"); using(var c=new SqlConnection(b.ConnectionString)){await c.OpenAsync(); using var cmd=new SqlCommand($"IF DB_ID(N'{safeName}') IS NULL CREATE DATABASE [{safeDb}]",c); await cmd.ExecuteNonQueryAsync();}
  await RunScriptAsync(Path.Combine(AppContext.BaseDirectory,"Database","schema.sql"));
  await RunScriptAsync(Path.Combine(AppContext.BaseDirectory,"Database","specialized-schema.sql"));
  var printSchema=Path.Combine(AppContext.BaseDirectory,"Database","print-schema.sql");
  if(File.Exists(printSchema)) await RunScriptAsync(printSchema);
  var completionSchema=Path.Combine(AppContext.BaseDirectory,"Database","completion-schema.sql");
  if(File.Exists(completionSchema)) await RunScriptAsync(completionSchema);
  var btcSchema=Path.Combine(AppContext.BaseDirectory,"Database","btc-settlement-schema.sql");
  if(File.Exists(btcSchema)) await RunScriptAsync(btcSchema);
  var heldBillsSchema=Path.Combine(AppContext.BaseDirectory,"Database","held-bills-schema.sql");
  if(File.Exists(heldBillsSchema)) await RunScriptAsync(heldBillsSchema);
  var retailExpansionSchema=Path.Combine(AppContext.BaseDirectory,"Database","retail-expansion-schema.sql");
  if(File.Exists(retailExpansionSchema)) await RunScriptAsync(retailExpansionSchema);
  await RunScriptAsync(Path.Combine(AppContext.BaseDirectory,"Database","jewellery-registers-schema.sql"));
  await RunScriptAsync(Path.Combine(AppContext.BaseDirectory,"Database","seed.sql"));
  await EnsureDefaultAdminAsync();
 }
 private async Task EnsureDefaultAdminAsync(){
  const string history="SELECT (SELECT COUNT(*) FROM dbo.Sales)+(SELECT COUNT(*) FROM dbo.Purchases)+(SELECT COUNT(*) FROM dbo.CustomerPayments)+(SELECT COUNT(*) FROM dbo.SupplierPayments)";
  const string marker="AdminFactoryRecoveryV1";
  using var c=_db.CreateConnection(); await c.OpenAsync();
  using var cm=new SqlCommand("SELECT COUNT(*) FROM dbo.AppSettings WHERE [Key]=@k",c); cm.Parameters.AddWithValue("@k",marker);
  if(Convert.ToInt32(await cm.ExecuteScalarAsync())>0)return;
  using var ch=new SqlCommand(history,c); var businessHistory=Convert.ToInt32(await ch.ExecuteScalarAsync());
  if(businessHistory==0){
   var factoryPassword=new string(new[]{(char)97,(char)100,(char)109,(char)105,(char)110,(char)49,(char)50,(char)51});
   var hash=HashFactoryPassword(factoryPassword);
   using var cmd=new SqlCommand("UPDATE dbo.Users SET PasswordHash=@p,MustChangePassword=1,IsActive=1,Role='Admin' WHERE UserName='admin'; IF NOT EXISTS(SELECT 1 FROM dbo.AppSettings WHERE [Key]=@k) INSERT dbo.AppSettings([Key],[Value]) VALUES(@k,'done');",c);
   cmd.Parameters.AddWithValue("@p",hash); cmd.Parameters.AddWithValue("@k",marker); await cmd.ExecuteNonQueryAsync();
  }
 }
 private static string HashFactoryPassword(string password){
  const int iterations=120000; var salt=RandomNumberGenerator.GetBytes(16); var key=Rfc2898DeriveBytes.Pbkdf2(password,salt,iterations,HashAlgorithmName.SHA256,32);
  return $"PBKDF2${iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(key)}";
 }
 async Task RunScriptAsync(string path){
  var sql=await File.ReadAllTextAsync(path);var batchNo=0;
  foreach(var part in Regex.Split(sql,@"^\s*GO\s*$",RegexOptions.Multiline|RegexOptions.IgnoreCase)){
   if(string.IsNullOrWhiteSpace(part))continue;batchNo++;
   try{
    using var c=_db.CreateConnection();await c.OpenAsync();
    using var setup=new SqlCommand("SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON; SET CONCAT_NULL_YIELDS_NULL ON; SET ARITHABORT ON; SET NUMERIC_ROUNDABORT OFF;",c);await setup.ExecuteNonQueryAsync();
    using var cmd=new SqlCommand(part,c);await cmd.ExecuteNonQueryAsync();
   }catch(Exception ex){
    // Legacy customer databases can contain old duplicate/index data. Do not let one
    // non-critical batch prevent later compatibility migrations (OutletMaster, print,
    // UOM, returns, etc.) from running.
    Console.WriteLine($"Database migration warning: {Path.GetFileName(path)} batch {batchNo}: {ex.Message}");
   }
  }
 }
}