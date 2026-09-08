using Google.Apis.Auth.OAuth2;
using Google.Apis.Drive.v3;
using Google.Apis.Http;
using Google.Apis.Services;
using Google.Apis.Util.Store;
using Microsoft.Data.SqlClient;
using SuvidhaPOS.Premium.Data;
using System.IO.Compression;
using System.Text;

namespace SuvidhaPOS.Premium;

public static class BackupMasterModules
{
    static readonly SemaphoreSlim Gate=new(1,1);
    static Timer? Timer;
    static string LogFolder=>Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"SuvidhaPOS Premium","Backup");
    static string LogPath=>Path.Combine(LogFolder,"backup.log");
    static SqlParameter P(string n,object? v)=>new(n,v??DBNull.Value);

    public static void Map(WebApplication app)
    {
        app.MapGet("/api/backup-master/status",async(Db db)=>{
            var server=await db.ScalarAsync("SELECT CAST(SERVERPROPERTY('ServerName') AS nvarchar(256))");
            var database=await db.ScalarAsync("SELECT DB_NAME()");
            var defaultFolder=DefaultBackupFolder();
            return Results.Ok(new{
                server=server?.ToString()??@".\SQLEXPRESS",
                database=database?.ToString()??"SuvidhaPOS",
                defaultFolder,
                lastBackup=await Setting(db,"Backup.LastBackup"),
                lastResult=await Setting(db,"Backup.LastResult"),
                nextBackup=await Setting(db,"Backup.NextRun"),
                schedule=(await Setting(db,"Backup.Schedule"))??"Manual",
                drives=DetectDrives()
            });
        });

        app.MapGet("/api/backup-master/drives",()=>Results.Ok(DetectDrives()));

        app.MapGet("/api/backup-master/log",()=>{
            try{return Results.Text(File.Exists(LogPath)?File.ReadAllText(LogPath):"No backup log yet.","text/plain",Encoding.UTF8);}
            catch(Exception ex){return Results.Text("Unable to read backup log: "+ex.Message,"text/plain",Encoding.UTF8);}
        });

        app.MapPost("/api/backup-master/google/test",async(BackupGoogleTestRequest x)=>{
            if(string.IsNullOrWhiteSpace(x.JsonPath)||!File.Exists(x.JsonPath.Trim()))
                return Results.BadRequest(new{message="Google Drive credentials JSON file not found"});
            try{
                using var drive=await CreateDriveService(x.JsonPath.Trim(),true);
                var req=drive.Files.List();req.PageSize=1;req.Fields="files(id,name)";
                await req.ExecuteAsync();
                return Results.Ok(new{connected=true,message="Google Drive connected",account="OAuth / credential JSON"});
            }catch(Exception ex){return Results.BadRequest(new{message=FriendlyGoogleError(ex)});}
        });

        app.MapPost("/api/backup-master",async(Db db,BackupRunRequest x)=>{
            if(!await Gate.WaitAsync(0))return Results.BadRequest(new{message="Another backup is already running"});
            try{
                var result=await Execute(db,x,false);
                return result.Success?Results.Ok(result):Results.BadRequest(new{message=result.Message,warnings=result.Warnings});
            }finally{Gate.Release();}
        });

        if(Timer is null)
            Timer=new Timer(async _=>await ScheduledTick(app.Services),null,TimeSpan.FromSeconds(20),TimeSpan.FromMinutes(1));
    }

    static async Task ScheduledTick(IServiceProvider services)
    {
        if(!await Gate.WaitAsync(0))return;
        try{
            var db=services.GetRequiredService<Db>();
            var schedule=(await Setting(db,"Backup.Schedule"))??"Manual";
            if(schedule.Equals("Manual",StringComparison.OrdinalIgnoreCase))return;
            var nextRaw=await Setting(db,"Backup.NextRun");
            var now=DateTime.Now;
            if(!DateTime.TryParse(nextRaw,out var next)){next=NextRun(schedule,now);await SaveSetting(db,"Backup.NextRun",next.ToString("O"));return;}
            if(now<next)return;
            var x=new BackupRunRequest(
                await Setting(db,"Backup.Server"),
                await Setting(db,"Backup.Databases"),
                await Setting(db,"Backup.Labels"),
                await Setting(db,"Backup.Folder"),
                schedule,
                Int(await Setting(db,"Backup.RetentionDays"),7),
                Bool(await Setting(db,"Backup.LocalEnabled"),true),
                Bool(await Setting(db,"Backup.ZipEnabled"),true),
                Bool(await Setting(db,"Backup.AutoCleanup"),true),
                await Setting(db,"Backup.ExternalFolder"),
                Bool(await Setting(db,"Backup.ExternalEnabled"),false),
                await Setting(db,"Backup.GoogleDriveJson"),
                Bool(await Setting(db,"Backup.GoogleDriveEnabled"),false)
            );
            await Execute(db,x,true);
            await SaveSetting(db,"Backup.NextRun",NextRun(schedule,DateTime.Now).ToString("O"));
        }catch(Exception ex){WriteLog("SCHEDULER ERROR — "+ex.Message);}
        finally{Gate.Release();}
    }

    static async Task<BackupRunResult> Execute(Db db,BackupRunRequest x,bool scheduled)
    {
        var warnings=new List<string>();var files=new List<string>();var externalFiles=new List<string>();var googleFiles=new List<string>();
        var dbs=(x.Databases??"SuvidhaPOS").Split(',',StringSplitOptions.RemoveEmptyEntries|StringSplitOptions.TrimEntries).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if(dbs.Count==0)dbs.Add("SuvidhaPOS");
        var labels=(x.Labels??"").Split(',',StringSplitOptions.TrimEntries).ToList();
        var folder=string.IsNullOrWhiteSpace(x.Folder)?DefaultBackupFolder():x.Folder.Trim();
        try{Directory.CreateDirectory(folder);}catch(Exception ex){var fallback=DefaultBackupFolder();warnings.Add($"Primary folder '{folder}' unavailable ({ex.Message}). Using '{fallback}'.");folder=fallback;Directory.CreateDirectory(folder);}
        WriteLog($"{(scheduled?"SCHEDULED":"MANUAL")} BACKUP START — {string.Join(", ",dbs)} -> {folder}");

        DriveService? drive=null;
        if(x.GoogleDriveEnabled&&!string.IsNullOrWhiteSpace(x.GoogleDriveJson)){
            try{drive=await CreateDriveService(x.GoogleDriveJson.Trim(),false);}
            catch(Exception ex){warnings.Add("Google Drive offline/not connected: "+FriendlyGoogleError(ex));}
        }

        for(var i=0;i<dbs.Count;i++)
        {
            var dbName=dbs[i];var label=i<labels.Count&&!string.IsNullOrWhiteSpace(labels[i])?labels[i]:dbName;
            var safe=SafeName(label);var stamp=DateTime.Now.ToString("yyyyMMdd_HHmmss");
            var primaryBak=Path.Combine(folder,$"{safe}_{stamp}.bak");
            string? sqlCreated=null;
            try{
                sqlCreated=await CreateSqlBackup(db,dbName,primaryBak,warnings);
                var localBak=primaryBak;
                if(!Path.GetFullPath(sqlCreated).Equals(Path.GetFullPath(primaryBak),StringComparison.OrdinalIgnoreCase)){
                    File.Copy(sqlCreated,primaryBak,true);TryDelete(sqlCreated);
                }
                var output=localBak;
                if(x.Zip){
                    var zip=Path.ChangeExtension(localBak,".zip");if(File.Exists(zip))File.Delete(zip);
                    using(var archive=ZipFile.Open(zip,ZipArchiveMode.Create))archive.CreateEntryFromFile(localBak,Path.GetFileName(localBak),CompressionLevel.Optimal);
                    TryDelete(localBak);output=zip;
                }
                if(x.LocalEnabled)files.Add(output);

                if(x.ExternalEnabled&&!string.IsNullOrWhiteSpace(x.ExternalFolder)){
                    try{
                        if(!DrivePathReady(x.ExternalFolder.Trim()))warnings.Add("External drive offline — local backup completed; external copy will resume next run.");
                        else{Directory.CreateDirectory(x.ExternalFolder.Trim());var t=Path.Combine(x.ExternalFolder.Trim(),Path.GetFileName(output));File.Copy(output,t,true);externalFiles.Add(t);}
                    }catch(Exception ex){warnings.Add("External copy skipped: "+ex.Message);}
                }

                if(drive is not null){
                    try{googleFiles.Add(await UploadGoogle(drive,output));}
                    catch(Exception ex){warnings.Add("Google Drive upload skipped: "+FriendlyGoogleError(ex));}
                }

                if(x.AutoCleanup&&x.RetentionDays>0){
                    Cleanup(folder,safe,x.RetentionDays);
                    if(x.ExternalEnabled&&!string.IsNullOrWhiteSpace(x.ExternalFolder)&&DrivePathReady(x.ExternalFolder.Trim()))Cleanup(x.ExternalFolder.Trim(),safe,x.RetentionDays);
                }

                // If Local Backup is disabled, the file was only a staging artifact after optional copies.
                if(!x.LocalEnabled)TryDelete(output);
                WriteLog($"SUCCESS — {dbName} -> {(x.LocalEnabled?output:"destination copies only")}");
            }catch(Exception ex){
                if(!string.IsNullOrWhiteSpace(sqlCreated))TryDelete(sqlCreated);
                warnings.Add($"{dbName}: {ex.Message}");
                WriteLog($"FAILED — {dbName}: {ex.Message}");
            }
        }
        drive?.Dispose();
        var success=files.Count>0||externalFiles.Count>0||googleFiles.Count>0;
        var now=DateTime.Now;
        if(success){
            await SaveSetting(db,"Backup.LastBackup",now.ToString("O"));
            await SaveSetting(db,"Backup.LastResult",warnings.Count==0?"Success":"Success with warnings");
            var schedule=string.IsNullOrWhiteSpace(x.Schedule)?"Manual":x.Schedule;
            if(!schedule.Equals("Manual",StringComparison.OrdinalIgnoreCase))await SaveSetting(db,"Backup.NextRun",NextRun(schedule,now).ToString("O"));
        }else await SaveSetting(db,"Backup.LastResult","Failed");
        return new BackupRunResult(success,success?(warnings.Count==0?"Backup completed successfully":"Backup completed with warnings"):"Backup failed",files,externalFiles,googleFiles,warnings,now);
    }

    static async Task<string> CreateSqlBackup(Db db,string dbName,string primaryBak,List<string> warnings)
    {
        var exists=Convert.ToInt32(await db.ScalarAsync("SELECT CASE WHEN DB_ID(@d) IS NULL THEN 0 ELSE 1 END",P("@d",dbName))??0);
        if(exists==0)throw new Exception($"Database '{dbName}' not found on configured SQL Server.");
        try{
            await BackupCommand(db,dbName,primaryBak,true);
            return primaryBak;
        }catch(Exception directEx){
            var sqlDefault=(await db.ScalarAsync("SELECT CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS nvarchar(4000))"))?.ToString();
            if(string.IsNullOrWhiteSpace(sqlDefault))throw new Exception("SQL Server cannot write the selected backup folder: "+directEx.Message);
            var stage=Path.Combine(sqlDefault.Trim(),Path.GetFileName(primaryBak));
            warnings.Add("SQL Server service could not write directly to the selected folder; used SQL Server staging folder automatically.");
            try{await BackupCommand(db,dbName,stage,true);}
            catch{await BackupCommand(db,dbName,stage,false);}
            return stage;
        }
    }

    static async Task BackupCommand(Db db,string dbName,string path,bool compression)
    {
        var safeDb=dbName.Replace("]","]]");
        var safePath=path.Replace("'","''");
        var options=compression?",COPY_ONLY,CHECKSUM,COMPRESSION":",COPY_ONLY,CHECKSUM";
        await db.ScalarAsync($"BACKUP DATABASE [{safeDb}] TO DISK=N'{safePath}' WITH INIT{options}");
        await db.ScalarAsync($"RESTORE VERIFYONLY FROM DISK=N'{safePath}' WITH CHECKSUM");
    }

    static async Task<DriveService> CreateDriveService(string jsonPath,bool interactive)
    {
        var raw=await File.ReadAllTextAsync(jsonPath);
        using var doc=System.Text.Json.JsonDocument.Parse(raw);
        var type=doc.RootElement.TryGetProperty("type",out var t)?t.GetString():"";
        IConfigurableHttpClientInitializer credential;
        if(string.Equals(type,"service_account",StringComparison.OrdinalIgnoreCase)){
            credential=GoogleCredential.FromFile(jsonPath).CreateScoped(DriveService.Scope.DriveFile);
        }else{
            using var stream=new FileStream(jsonPath,FileMode.Open,FileAccess.Read);
            var secrets=GoogleClientSecrets.Load(stream).Secrets;
            var tokenFolder=Path.Combine(LogFolder,"GoogleDriveToken");Directory.CreateDirectory(tokenFolder);
            if(!interactive&&!Directory.EnumerateFiles(tokenFolder).Any())throw new Exception("Google Drive is not connected yet. Click CONNECT / TEST GOOGLE DRIVE once.");
            credential=await GoogleWebAuthorizationBroker.AuthorizeAsync(secrets,new[]{DriveService.Scope.DriveFile},"suvidhapos",CancellationToken.None,new FileDataStore(tokenFolder,true));
        }
        return new DriveService(new BaseClientService.Initializer{HttpClientInitializer=credential,ApplicationName="SuvidhaPOS Premium Backup"});
    }

    static async Task<string> UploadGoogle(DriveService drive,string localPath)
    {
        var folderName="SuvidhaPOS Backups";
        var list=drive.Files.List();list.Q=$"mimeType='application/vnd.google-apps.folder' and name='{folderName}' and trashed=false";list.Fields="files(id,name)";list.PageSize=10;
        var found=await list.ExecuteAsync();var folderId=found.Files.FirstOrDefault()?.Id;
        if(string.IsNullOrWhiteSpace(folderId)){
            var meta=new Google.Apis.Drive.v3.Data.File{Name=folderName,MimeType="application/vnd.google-apps.folder"};
            var create=drive.Files.Create(meta);create.Fields="id";folderId=(await create.ExecuteAsync()).Id;
        }
        var fm=new Google.Apis.Drive.v3.Data.File{Name=Path.GetFileName(localPath),Parents=new[]{folderId}};
        await using var fs=new FileStream(localPath,FileMode.Open,FileAccess.Read,FileShare.Read);
        var req=drive.Files.Create(fm,fs,localPath.EndsWith(".zip",StringComparison.OrdinalIgnoreCase)?"application/zip":"application/octet-stream");req.Fields="id,name";
        var progress=await req.UploadAsync();
        if(progress.Status!=Google.Apis.Upload.UploadStatus.Completed)throw progress.Exception??new Exception("Google Drive upload did not complete");
        return Path.GetFileName(localPath);
    }

    static object[] DetectDrives()
    {
        var system=Path.GetPathRoot(Environment.GetFolderPath(Environment.SpecialFolder.System))??"C:\\";
        return DriveInfo.GetDrives().Where(d=>!d.Name.Equals(system,StringComparison.OrdinalIgnoreCase)&&(d.DriveType==DriveType.Removable||d.DriveType==DriveType.Fixed))
            .Select(d=>{try{return (object)new{root=d.Name,label=d.IsReady?d.VolumeLabel:"",ready=d.IsReady,type=d.DriveType.ToString(),freeGb=d.IsReady?Math.Round(d.AvailableFreeSpace/1024d/1024/1024,1):0};}catch{return (object)new{root=d.Name,label="",ready=false,type=d.DriveType.ToString(),freeGb=0d};}}).ToArray();
    }

    static bool DrivePathReady(string path)
    {
        try{var root=Path.GetPathRoot(path);if(string.IsNullOrWhiteSpace(root))return false;var d=new DriveInfo(root);return d.IsReady;}catch{return false;}
    }
    static string DefaultBackupFolder()
    {
        try{var d=new DriveInfo("D:\\");if(d.IsReady)return @"D:\SuvidhaBackup";}catch{}
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),"SuvidhaBackup");
    }
    static void Cleanup(string folder,string prefix,int days)
    {
        try{if(!Directory.Exists(folder))return;var cutoff=DateTime.Now.AddDays(-days);foreach(var f in Directory.EnumerateFiles(folder,$"{prefix}_*.*").Where(f=>f.EndsWith(".bak",StringComparison.OrdinalIgnoreCase)||f.EndsWith(".zip",StringComparison.OrdinalIgnoreCase)))try{if(File.GetLastWriteTime(f)<cutoff)File.Delete(f);}catch{}}catch{}
    }
    static DateTime NextRun(string schedule,DateTime from)
    {
        if(schedule.Contains("1 Hour",StringComparison.OrdinalIgnoreCase))return from.AddHours(1);
        if(schedule.Contains("2 Hour",StringComparison.OrdinalIgnoreCase))return from.AddHours(2);
        if(schedule.Contains("4 Hour",StringComparison.OrdinalIgnoreCase))return from.AddHours(4);
        if(schedule.Contains("6 Hour",StringComparison.OrdinalIgnoreCase))return from.AddHours(6);
        if(schedule.Contains("12 Hour",StringComparison.OrdinalIgnoreCase))return from.AddHours(12);
        if(schedule.Equals("Daily",StringComparison.OrdinalIgnoreCase)){var n=from.Date.AddDays(1).AddHours(1);return n;}
        return from;
    }
    static string SafeName(string s){var t=string.Concat((s??"Backup").Select(c=>Path.GetInvalidFileNameChars().Contains(c)?'_':c));return string.IsNullOrWhiteSpace(t)?"Backup":t;}
    static void TryDelete(string path){try{if(File.Exists(path))File.Delete(path);}catch{}}
    static int Int(string? v,int d)=>int.TryParse(v,out var n)?n:d;
    static bool Bool(string? v,bool d)=>bool.TryParse(v,out var b)?b:d;
    static async Task<string?> Setting(Db db,string key){var r=await db.QuerySingleAsync("SELECT TOP 1 [Value] FROM AppSettings WHERE [Key]=@k",P("@k",key));return r.GetValueOrDefault("Value")?.ToString();}
    static Task SaveSetting(Db db,string key,string value)=>db.ScalarAsync(@"MERGE AppSettings AS t USING(SELECT @k [Key])s ON t.[Key]=s.[Key] WHEN MATCHED THEN UPDATE SET [Value]=@v WHEN NOT MATCHED THEN INSERT([Key],[Value])VALUES(@k,@v);",P("@k",key),P("@v",value));
    static string FriendlyGoogleError(Exception ex)=>ex.Message.Contains("invalid_grant",StringComparison.OrdinalIgnoreCase)?"Google authorization expired or was revoked. Connect again.":ex.Message;
    static void WriteLog(string s){try{Directory.CreateDirectory(LogFolder);File.AppendAllText(LogPath,$"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {s}{Environment.NewLine}");}catch{}}

    public record BackupRunRequest(string? Server,string? Databases,string? Labels,string? Folder,string? Schedule,int RetentionDays,bool LocalEnabled,bool Zip,bool AutoCleanup,string? ExternalFolder,bool ExternalEnabled,string? GoogleDriveJson,bool GoogleDriveEnabled);
    public record BackupGoogleTestRequest(string? JsonPath);
    public record BackupRunResult(bool Success,string Message,List<string> Files,List<string> ExternalFiles,List<string> GoogleFiles,List<string> Warnings,DateTime CompletedAt);
}
