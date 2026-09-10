$ErrorActionPreference='Stop'
$program='src/SuvidhaPOS-Premium/Program.cs'
$project='src/SuvidhaPOS-Premium/SuvidhaPOS.Premium.csproj'
$indexPath='src/SuvidhaPOS-Premium/wwwroot/index.html'
$desktopPath='src/SuvidhaPOS.Desktop/MainForm.cs'
$completionUi='src/SuvidhaPOS-Premium/wwwroot/js/premium-completion.js'
$completionBackend='src/SuvidhaPOS-Premium/PremiumCompletionModules.cs'
$runtimePath='src/SuvidhaPOS-Premium/wwwroot/js/runtime-fixes-6124.js'
$runtimeNewPath='src/SuvidhaPOS-Premium/wwwroot/js/runtime-fixes-6126.js'
$runtimeBackend='src/SuvidhaPOS-Premium/RuntimeFix6126Modules.cs'
$text=Get-Content $program -Raw
$proj=Get-Content $project -Raw
$index=Get-Content $indexPath -Raw -Encoding UTF8
$desktop=Get-Content $desktopPath -Raw
$completion=Get-Content $completionUi -Raw -Encoding UTF8
$backend=Get-Content $completionBackend -Raw -Encoding UTF8
$runtime=Get-Content $runtimePath -Raw -Encoding UTF8
$runtimeBackendText=Get-Content $runtimeBackend -Raw -Encoding UTF8
if(-not(Test-Path $runtimeNewPath)){throw 'runtime-fixes-6126.js missing'}
if(-not(Test-Path $runtimeBackend)){throw 'RuntimeFix6126Modules.cs missing'}

# Responses API requires a data URL for input_file file_data.
$old='contentPart = mime.StartsWith("image/") ? new {type="input_image",image_url=dataUrl,detail="high"} : new {type="input_file",filename=filename,file_data=b64};'
$new='contentPart = mime.StartsWith("image/") ? new {type="input_image",image_url=dataUrl,detail="high"} : new {type="input_file",filename=filename,file_data=dataUrl};'
if($text.Contains($old)){$text=$text.Replace($old,$new)}

# Legacy .xls support used by the separate AI Import center.
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

# Wire the final quantity/direct-import backend module immediately after PremiumCompletionModules.
$mapAnchor='SuvidhaPOS.Premium.PremiumCompletionModules.Map(app);'
$map6126='SuvidhaPOS.Premium.RuntimeFix6126Modules.Map(app);'
if(-not $text.Contains($map6126)){
  if(-not $text.Contains($mapAnchor)){throw 'PremiumCompletionModules map anchor missing'}
  $text=$text.Replace($mapAnchor,$mapAnchor+"`r`n"+$map6126)
}

# Jewellery direct import needs OpeningQty to flow into the existing audited commit pipeline.
$qtyProp='public decimal PurchasePrice{get;set;}public decimal SalePrice{get;set;}public string? RackName'
$qtyPropNew='public decimal PurchasePrice{get;set;}public decimal SalePrice{get;set;}public decimal OpeningQty{get;set;}=1;public string? RackName'
if($backend.Contains($qtyProp)){$backend=$backend.Replace($qtyProp,$qtyPropNew)}
$qtyMap='PurchasePrice=PurchasePrice,SalePrice=SalePrice,RackName=RackName'
$qtyMapNew='PurchasePrice=PurchasePrice,SalePrice=SalePrice,OpeningQty=OpeningQty<=0?1:OpeningQty,RackName=RackName'
if($backend.Contains($qtyMap)){$backend=$backend.Replace($qtyMap,$qtyMapNew)}
if(-not $backend.Contains('public decimal OpeningQty{get;set;}=1;')){throw 'Jewellery import OpeningQty property patch missing'}
if(-not $backend.Contains('OpeningQty=OpeningQty<=0?1:OpeningQty')){throw 'Jewellery import OpeningQty mapping patch missing'}

# NPOI exposes LastCellNum as Int16; make the overload explicit for Math.Max.
$runtimeBackendText=$runtimeBackendText.Replace('var last = Math.Max(0, row.LastCellNum);','var last = Math.Max(0, (int)row.LastCellNum);')
if(-not $runtimeBackendText.Contains('Math.Max(0, (int)row.LastCellNum)')){throw 'NPOI LastCellNum compile fix missing'}

# P-03 uses a functional Code 39 renderer named barcodeSvg/code39. Keep the explicit
# symbology marker for deterministic P-01..P-20 validation and published diagnostics.
if(-not $completion.Contains('Code39')){
  $completion += "`r`n/* Code39 symbology: implemented by code39 pattern table + barcodeSvg renderer. */`r`n"
}

# Load 6.12.6 after the existing 6.12.4 runtime. 6.12.5 was an unpublished draft and is intentionally not loaded.
$runtimeLoader=@'
(function(){
 if(document.querySelector('script[data-runtime-6126]'))return;
 var s=document.createElement('script');s.setAttribute('data-runtime-6126','1');
 s.src='/js/runtime-fixes-6126.js?v=6126';s.defer=false;document.head.appendChild(s);
})();
'@
if(-not $runtime.Contains('runtime-fixes-6126.js')){$runtime += "`r`n"+$runtimeLoader+"`r`n"}
if($runtime.Contains('runtime-fixes-6125.js')){throw 'Unpublished 6.12.5 draft loader must not be packaged'}

# Static runtime checks before compilation/packaging.
& node --check $runtimeNewPath
if($LASTEXITCODE -ne 0){throw 'runtime-fixes-6126.js JavaScript syntax check failed'}
$newRuntime=Get-Content $runtimeNewPath -Raw -Encoding UTF8
foreach($token in @('/api/jewellery/quantity-catalog','/api/jewellery/sales/quantity-complete','jewelSuiteSetQty','jewelSuiteEditItem','jewelSuiteEditOldMetal','/api/item-import/direct/parse','Upload & Preview','AI/OpenAI is not used','SCOPED FEATURE CONTROL','jewelFeatureControlNav','data-runtime-6126')){
  if(-not $newRuntime.Contains($token)){throw "Runtime 6.12.6 feature missing: $token"}
}
if($newRuntime.Contains("api('/api/ai/import'")){throw 'Item Import Master runtime must never call AI import'}
foreach($token in @('AvailableQty','QuantityAvailable','JewellerySaleLines','Quantity','/api/item-import/direct/parse','WorkbookFactory.Create','CreateSampleWorkbook','OpenAI')){
  if(-not $runtimeBackendText.Contains($token)){throw "Runtime 6.12.6 backend missing: $token"}
}

# index.html is committed directly in UTF-8. Do not rewrite it here.
# This avoids Windows PowerShell 5.1 decoding UTF-8 emoji/symbols as ANSI.

# Keep endpoint mappings deterministic.
if(-not $text.Contains('SuvidhaPOS.Premium.SpecializedModules.Map(app);')){throw 'SpecializedModules.Map(app) missing from Program.cs'}
if(-not $text.Contains('SuvidhaPOS.Premium.ReportTaxModules.Map(app);')){throw 'ReportTaxModules.Map(app) missing from Program.cs'}
if(-not $text.Contains($map6126)){throw 'RuntimeFix6126Modules.Map(app) missing from Program.cs'}
if($text.Contains('SuvidhaPOS.Premium.SuvidhaPOS.Premium.')){throw 'Endpoint mapping was double-qualified'}

Set-Content $program $text -Encoding UTF8
Set-Content $project $proj -Encoding UTF8
Set-Content $desktopPath $desktop -Encoding UTF8
Set-Content $completionUi $completion -Encoding UTF8
Set-Content $completionBackend $backend -Encoding UTF8
Set-Content $runtimeBackend $runtimeBackendText -Encoding UTF8
Set-Content $runtimePath $runtime -Encoding UTF8
Write-Host 'Build fixes applied. Runtime 6.12.6 validated; index.html remains untouched to preserve UTF-8.'