$ErrorActionPreference='Stop'
$program='src/SuvidhaPOS-Premium/Program.cs'
$project='src/SuvidhaPOS-Premium/SuvidhaPOS.Premium.csproj'
$indexPath='src/SuvidhaPOS-Premium/wwwroot/index.html'
$desktopPath='src/SuvidhaPOS.Desktop/MainForm.cs'
$text=Get-Content $program -Raw
$proj=Get-Content $project -Raw
$index=Get-Content $indexPath -Raw -Encoding UTF8
$desktop=Get-Content $desktopPath -Raw

# Responses API requires a data URL for input_file file_data.
$old='contentPart = mime.StartsWith("image/") ? new {type="input_image",image_url=dataUrl,detail="high"} : new {type="input_file",filename=filename,file_data=b64};'
$new='contentPart = mime.StartsWith("image/") ? new {type="input_image",image_url=dataUrl,detail="high"} : new {type="input_file",filename=filename,file_data=dataUrl};'
if($text.Contains($old)){$text=$text.Replace($old,$new)}

# Legacy .xls support.
if(-not $proj.Contains('PackageReference Include="NPOI"')){
  $proj=$proj.Replace('<PackageReference Include="Microsoft.Data.SqlClient" Version="5.2.2" />','<PackageReference Include="Microsoft.Data.SqlClient" Version="5.2.2" />' + "`r`n    " + '<PackageReference Include="NPOI" Version="2.7.3" />')
}
if(-not $text.Contains('using NPOI.HSSF.UserModel;')){
  $text=$text.Replace('using System.Xml.Linq;','using System.Xml.Linq;' + "`r`n" + 'using NPOI.HSSF.UserModel;')
}
$xlsOld='if(mime.Contains("spreadsheet")||mime.Contains("excel")||filename!.EndsWith(".xlsx",StringComparison.OrdinalIgnoreCase)) extracted=ExtractXlsx(bytes);'
$xlsNew='if(filename!.EndsWith(".xls",StringComparison.OrdinalIgnoreCase)) extracted=ExtractXls(bytes);' + "`r`n   " + 'else if(mime.Contains("spreadsheet")||mime.Contains("excel")||filename.EndsWith(".xlsx",StringComparison.OrdinalIgnoreCase)) extracted=ExtractXlsx(bytes);'
if($text.Contains($xlsOld)){$text=$text.Replace($xlsOld,$xlsNew)}
if(-not $text.Contains('static string ExtractXls(byte[] bytes)')){
  $marker='static string ExtractXlsx(byte[] bytes)'; $pos=$text.IndexOf($marker); if($pos -lt 0){throw 'ExtractXlsx marker not found'}
  $xlsHelper=@'
static string ExtractXls(byte[] bytes){
 using var ms=new MemoryStream(bytes); var wb=new HSSFWorkbook(ms); var sb=new StringBuilder();
 for(int s=0;s<wb.NumberOfSheets;s++){var sh=wb.GetSheetAt(s); if(sh is null)continue;
  for(int r=sh.FirstRowNum;r<=sh.LastRowNum;r++){var row=sh.GetRow(r); if(row is null)continue; var cells=new List<string>();
   for(int c=row.FirstCellNum;c<row.LastCellNum;c++){if(c<0)continue;var cell=row.GetCell(c);cells.Add(cell?.ToString()?.Trim()??"");}
   if(cells.Any(v=>!string.IsNullOrWhiteSpace(v)))sb.AppendLine(string.Join(" | ",cells));
  }
 }
 return sb.ToString();
}
'@
  $text=$text.Insert($pos,$xlsHelper + "`r`n")
}

# Safe AI configuration status.
if(-not $text.Contains('app.MapGet("/api/ai/config"')){
  $anchor='app.MapPost("/api/ai/import",async(HttpRequest req,Db db,HttpContext ctx)=>{'
  $status=@'
app.MapGet("/api/ai/config",async(Db db)=>{
 var envKey=Environment.GetEnvironmentVariable("OPENAI_API_KEY");
 var saved=(await db.QuerySingleAsync("SELECT [Value] FROM AppSettings WHERE [Key]='OpenAI.ApiKey'")).GetValueOrDefault("Value")?.ToString();
 var key=!string.IsNullOrWhiteSpace(envKey)?envKey:saved;
 var modelSetting=(await db.QuerySingleAsync("SELECT [Value] FROM AppSettings WHERE [Key]='OpenAI.Model'")).GetValueOrDefault("Value")?.ToString();
 var configured=!string.IsNullOrWhiteSpace(key); string masked="";
 if(configured){var k=key!;masked=k.Length<=8?"********":k[..Math.Min(7,k.Length)]+"****"+k[^4..];}
 return Results.Ok(new{configured,maskedKey=masked,source=!string.IsNullOrWhiteSpace(envKey)?"Windows environment":"Settings",model=Environment.GetEnvironmentVariable("OPENAI_MODEL")??modelSetting??"gpt-5.6-luna"});
});

'@
  if(-not $text.Contains($anchor)){throw 'AI import endpoint marker not found'}; $text=$text.Replace($anchor,$status+$anchor)
}

# Authentication cookie must be available to every API route.
$cookieOld='ctx.Response.Cookies.Append("suvidha_session",token,new CookieOptions{HttpOnly=true,SameSite=SameSiteMode.Lax,IsEssential=true});'
$cookieNew='ctx.Response.Cookies.Append("suvidha_session",token,new CookieOptions{HttpOnly=true,SameSite=SameSiteMode.Lax,IsEssential=true,Path="/"});'
if($text.Contains($cookieOld)){$text=$text.Replace($cookieOld,$cookieNew)}

# index.html is now committed directly in UTF-8. Do not rewrite it here.
# This avoids Windows PowerShell 5.1 decoding UTF-8 emoji/symbols as ANSI.

# Keep endpoint mappings deterministic. Source now owns the mappings; only qualify legacy short names.
$text=$text.Replace('SpecializedModules.Map(app);','SuvidhaPOS.Premium.SpecializedModules.Map(app);')
$text=$text.Replace('ReportTaxModules.Map(app);','SuvidhaPOS.Premium.ReportTaxModules.Map(app);')
if(-not $text.Contains('SuvidhaPOS.Premium.SpecializedModules.Map(app);')){throw 'SpecializedModules.Map(app) missing from Program.cs'}
if(-not $text.Contains('SuvidhaPOS.Premium.ReportTaxModules.Map(app);')){throw 'ReportTaxModules.Map(app) missing from Program.cs'}

Set-Content $program $text -Encoding UTF8
Set-Content $project $proj -Encoding UTF8
Set-Content $desktopPath $desktop -Encoding UTF8
Write-Host 'Build fixes applied. index.html remains untouched to preserve UTF-8.'
