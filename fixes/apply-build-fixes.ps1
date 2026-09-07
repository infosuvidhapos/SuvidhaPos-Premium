$ErrorActionPreference='Stop'
$program='src/SuvidhaPOS-Premium/Program.cs'
$project='src/SuvidhaPOS-Premium/SuvidhaPOS.Premium.csproj'
$indexPath='src/SuvidhaPOS-Premium/wwwroot/index.html'
$desktopPath='src/SuvidhaPOS.Desktop/MainForm.cs'
$text=Get-Content $program -Raw
$proj=Get-Content $project -Raw
$index=Get-Content $indexPath -Raw
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

# Patch the actual inline login handler. The API can return camelCase and the
# authenticated user can be either payload.user or the payload itself. Once
# authentication succeeds, dashboard/UI errors must never be reported as a
# credential failure.
$inlineOld=@'
      window.currentUser=d.user;
      native(remember?'remember':'clearRemembered',remember?{enabled:true,userName:user,password:pass}:{});
      const s=$('loginScreen');if(s)s.style.display='none';
      const p=$('userPill');if(p&&d.user)p.textContent=(d.user.DisplayName||user)+' · '+(d.user.Role||'User');
      if(d.user&&d.user.MustChangePassword&&typeof window.openChangePassword==='function')window.openChangePassword(true);
      if(typeof window.loadDashboard==='function')await window.loadDashboard();
    }catch(e){console.error('Login failed',e);showError(e.message||'Unable to login')}
'@
$inlineNew=@'
      const u=d.user||d.User||d;
      window.currentUser=u;
      native(remember?'remember':'clearRemembered',remember?{enabled:true,userName:user,password:pass}:{});
      const s=$('loginScreen');if(s)s.style.display='none';
      const p=$('userPill');if(p&&u)p.textContent=(u.DisplayName||u.displayName||u.UserName||u.userName||user)+' · '+(u.Role||u.role||'User');
      try{if(typeof window.loadDashboard==='function')await window.loadDashboard()}catch(e){console.error('Dashboard failed after successful login',e)}
      try{if(u&&(u.MustChangePassword??u.mustChangePassword)&&typeof window.openChangePassword==='function')window.openChangePassword(true)}catch(e){console.error('Password dialog failed after successful login',e)}
    }catch(e){console.error('Login failed',e);if(window.currentUser){const s=$('loginScreen');if(s)s.style.display='none';}else{showError(e.message||'Unable to login')}}
'@
if($index.Contains($inlineOld)){
  $index=$index.Replace($inlineOld,$inlineNew)
}else{
  throw 'Inline login handler marker not found in index.html'
}

# Cache-bust both the login hotfix JS and the root WebView2 navigation. The
# WebView2 profile is persistent across installer upgrades, so navigating to
# the exact same localhost URL can otherwise display stale cached HTML.
$index=$index.Replace('/js/legacy-report-boot.js','/js/legacy-report-boot.js?v=loginfix4')
$index=$index.Replace('Version 6.3.2','Version 6.3.4-loginfix4')
$navOld='web.CoreWebView2!.Navigate(BaseUrl);'
$navNew='web.CoreWebView2!.Navigate(BaseUrl + "?build=loginfix4");'
if($desktop.Contains($navOld)){$desktop=$desktop.Replace($navOld,$navNew)}else{throw 'Desktop navigation marker not found'}

# Keep endpoint mappings deterministic.
if(-not $text.Contains('SuvidhaPOS.Premium.SpecializedModules.Map(app);')){$text=$text.Replace('SpecializedModules.Map(app);','SuvidhaPOS.Premium.SpecializedModules.Map(app);');$text=$text.Replace('ReportTaxModules.Map(app);','SuvidhaPOS.Premium.ReportTaxModules.Map(app);')}
if(-not $text.Contains('SuvidhaPOS.Premium.ReportTaxModules.Map(app);')){$text=$text.Replace("app.Run();","SuvidhaPOS.Premium.SpecializedModules.Map(app);`r`nSuvidhaPOS.Premium.ReportTaxModules.Map(app);`r`n`r`napp.Run();")}

Set-Content $program $text -Encoding UTF8
Set-Content $project $proj -Encoding UTF8
Set-Content $indexPath $index -Encoding UTF8
Set-Content $desktopPath $desktop -Encoding UTF8
Write-Host 'Build fixes applied, including inline login patch and WebView2 cache bust.'
