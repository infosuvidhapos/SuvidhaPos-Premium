using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Win32;

namespace SuvidhaPOS.Premium;

public static class LicenseGuardModules
{
    const int WarningWindowDays = 10;
    const string ProductFolder = "SuvidhaPOS Premium";
    static readonly object ClockSync = new();

    public static void Map(WebApplication app)
    {
        app.MapGet("/public/license/status", () => Results.Ok(GetStatus()));
        app.MapGet("/api/license/status", () => Results.Ok(GetStatus()));
    }

    public static LicenseStatus GetStatus()
    {
        var nowUtc=DateTime.UtcNow;
        var tokenPath=TokenPath();
        var keyPem=LoadPublicKey();
        var managedBefore=HasManagedMarker();

        // Backward-compatible only before the first signed central activation.
        // There is deliberately NO SQL fallback for validity or expiry.
        if(!File.Exists(tokenPath))
            return managedBefore
                ? LicenseStatus.Invalid("Managed license cache is missing. Check license online.",nowUtc,WarningWindowDays)
                : LicenseStatus.Unmanaged(nowUtc, WarningWindowDays);
        if(string.IsNullOrWhiteSpace(keyPem))
            return LicenseStatus.Invalid("License public key is missing. Reinstall or repair SuvidhaPOS.",nowUtc,WarningWindowDays);

        try
        {
            var envelope=JsonSerializer.Deserialize<LicenseEnvelope>(File.ReadAllText(tokenPath),JsonOptions);
            if(envelope is null || string.IsNullOrWhiteSpace(envelope.Payload) || string.IsNullOrWhiteSpace(envelope.Signature))
                return LicenseStatus.Invalid("License token is incomplete.",nowUtc,WarningWindowDays);

            var payloadBytes=Base64UrlDecode(envelope.Payload);
            var signature=Base64UrlDecode(envelope.Signature);
            using var rsa=RSA.Create();
            rsa.ImportFromPem(keyPem);
            if(!rsa.VerifyData(payloadBytes,signature,HashAlgorithmName.SHA256,RSASignaturePadding.Pkcs1))
                return LicenseStatus.Invalid("License signature verification failed.",nowUtc,WarningWindowDays);

            MarkManaged();
            var payload=JsonSerializer.Deserialize<LicensePayload>(payloadBytes,JsonOptions);
            if(payload is null || string.IsNullOrWhiteSpace(payload.OutletCode))
                return LicenseStatus.Invalid("License payload is invalid.",nowUtc,WarningWindowDays);

            var machine=CurrentDeviceId();
            if(string.IsNullOrWhiteSpace(payload.DeviceId) || !CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(payload.DeviceId.Trim().ToUpperInvariant()),
                Encoding.UTF8.GetBytes(machine)))
                return LicenseStatus.Blocked("This license is not activated for this computer.",payload,nowUtc,WarningWindowDays,"DEVICE_MISMATCH");

            if(!DateOnly.TryParseExact(payload.ValidTill,"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out var validTill))
                return LicenseStatus.Invalid("License Valid Till date is invalid.",nowUtc,WarningWindowDays);
            if(!DateOnly.TryParseExact(payload.ValidFrom,"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out var validFrom))
                return LicenseStatus.Invalid("License Valid From date is invalid.",nowUtc,WarningWindowDays);

            if(DateTime.TryParse(payload.IssuedAtUtc,CultureInfo.InvariantCulture,DateTimeStyles.AdjustToUniversal|DateTimeStyles.AssumeUniversal,out var issuedAt)
               && nowUtc < issuedAt.AddMinutes(-5))
                return LicenseStatus.Blocked("System date/time is earlier than the trusted license issue time.",payload,nowUtc,WarningWindowDays,"CLOCK_ROLLBACK");

            var lastTrusted=ReadTrustedClock();
            if(lastTrusted.HasValue && nowUtc < lastTrusted.Value.AddMinutes(-5))
                return LicenseStatus.Blocked("System date/time rollback detected. Correct Windows date/time and check the license online.",payload,nowUtc,WarningWindowDays,"CLOCK_ROLLBACK");

            var today=DateOnly.FromDateTime(nowUtc);
            if(today < validFrom)
                return LicenseStatus.Blocked($"License becomes active on {validFrom:dd-MMM-yyyy}.",payload,nowUtc,WarningWindowDays,"NOT_STARTED");

            if(!string.Equals(payload.Status,"Active",StringComparison.OrdinalIgnoreCase))
                return LicenseStatus.Blocked($"License status is {payload.Status}.",payload,nowUtc,WarningWindowDays,"SUSPENDED");

            var days=validTill.DayNumber-today.DayNumber;
            if(days<0)
                return LicenseStatus.CreateExpired(payload,validTill,nowUtc,WarningWindowDays);

            PersistTrustedClock(nowUtc);
            return LicenseStatus.CreateActive(payload,validTill,days,nowUtc,WarningWindowDays);
        }
        catch(Exception ex)
        {
            return LicenseStatus.Invalid("License validation failed: "+ex.Message,nowUtc,WarningWindowDays);
        }
    }

    static string? LoadPublicKey()
    {
        var env=Environment.GetEnvironmentVariable("SUVIDHAPOS_LICENSE_PUBLIC_KEY_PEM");
        if(!string.IsNullOrWhiteSpace(env))return env;
        var path=Path.Combine(AppContext.BaseDirectory,"license-public-key.pem");
        return File.Exists(path)?File.ReadAllText(path):null;
    }

    static string LicenseFolder()
    {
        var root=Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var path=Path.Combine(root,ProductFolder,"License");
        Directory.CreateDirectory(path);
        return path;
    }
    static string TokenPath()=>Path.Combine(LicenseFolder(),"license.token.json");
    static string ClockPath()=>Path.Combine(LicenseFolder(),"trusted-clock.bin");
    static string ManagedPath()=>Path.Combine(LicenseFolder(),"managed-license.bin");
    const string ManagedRegistry=@"HKEY_CURRENT_USER\Software\SuvidhaPOS Premium\License";

    static bool HasManagedMarker()
    {
        try{if(File.Exists(ManagedPath()))return true;}catch{}
        try{return string.Equals(Registry.GetValue(ManagedRegistry,"Managed","")?.ToString(),"1",StringComparison.Ordinal);}catch{return false;}
    }

    static void MarkManaged()
    {
        try
        {
            if(!File.Exists(ManagedPath()))
            {
                var plain=Encoding.UTF8.GetBytes("SUVIDHAPOS-MANAGED-LICENSE-V1");
                File.WriteAllBytes(ManagedPath(),ProtectedData.Protect(plain,null,DataProtectionScope.CurrentUser));
            }
        }catch{}
        try{Registry.SetValue(ManagedRegistry,"Managed","1",RegistryValueKind.String);}catch{}
    }

    static string CurrentDeviceId()
    {
        string raw="";
        try{raw=Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography","MachineGuid","")?.ToString()??"";}catch{}
        if(string.IsNullOrWhiteSpace(raw))raw=Environment.MachineName;
        var bytes=SHA256.HashData(Encoding.UTF8.GetBytes("SUVIDHAPOS|"+raw.Trim()+"|"+Environment.MachineName));
        return Convert.ToHexString(bytes);
    }

    static DateTime? ReadTrustedClock()
    {
        lock(ClockSync)
        {
            try
            {
                var path=ClockPath();if(!File.Exists(path))return null;
                var protectedBytes=File.ReadAllBytes(path);
                var plain=ProtectedData.Unprotect(protectedBytes,null,DataProtectionScope.CurrentUser);
                var raw=Encoding.UTF8.GetString(plain);
                return DateTime.TryParse(raw,CultureInfo.InvariantCulture,DateTimeStyles.AdjustToUniversal|DateTimeStyles.AssumeUniversal,out var dt)?dt:null;
            }
            catch{return null;}
        }
    }

    static void PersistTrustedClock(DateTime nowUtc)
    {
        lock(ClockSync)
        {
            try
            {
                var previous=ReadTrustedClock();
                if(previous.HasValue && previous.Value>=nowUtc)return;
                var plain=Encoding.UTF8.GetBytes(nowUtc.ToString("O",CultureInfo.InvariantCulture));
                var protectedBytes=ProtectedData.Protect(plain,null,DataProtectionScope.CurrentUser);
                File.WriteAllBytes(ClockPath(),protectedBytes);
            }
            catch{}
        }
    }

    static byte[] Base64UrlDecode(string value)
    {
        var s=value.Replace('-','+').Replace('_','/');
        s+=new string('=',(4-s.Length%4)%4);
        return Convert.FromBase64String(s);
    }

    static readonly JsonSerializerOptions JsonOptions=new(){PropertyNameCaseInsensitive=true};

    public record LicenseEnvelope(string Payload,string Signature);
    public record LicensePayload(
        int Version,string OutletId,string OutletCode,string OutletName,string StoreType,string DeviceId,
        string ValidFrom,string ValidTill,string Status,string Plan,string IssuedAtUtc);

    public record LicenseStatus(
        bool Managed,bool LoginAllowed,bool Active,bool Expired,bool ShowWarning,string Code,string DisplayText,
        string Message,string? ValidFrom,string? ValidTill,int? DaysRemaining,string? OutletCode,string? OutletName,
        string? StoreType,string? Plan,string DeviceId,int WarningDays,DateTime CheckedAtUtc)
    {
        public static LicenseStatus Unmanaged(DateTime now,int warn)=>new(
            false,true,true,false,false,"UNMANAGED","LICENSE • NOT LINKED",
            "Central license server is not linked yet. Current installation remains usable until a signed server license is activated.",
            null,null,null,null,null,null,null,CurrentDeviceId(),warn,now);

        public static LicenseStatus Invalid(string message,DateTime now,int warn)=>new(
            true,false,false,false,false,"INVALID","LICENSE INVALID",message,null,null,null,null,null,null,null,CurrentDeviceId(),warn,now);

        public static LicenseStatus Blocked(string message,LicensePayload p,DateTime now,int warn,string code)=>new(
            true,false,false,false,false,code,"LICENSE BLOCKED",message,p.ValidFrom,p.ValidTill,null,p.OutletCode,p.OutletName,p.StoreType,p.Plan,CurrentDeviceId(),warn,now);

        public static LicenseStatus CreateExpired(LicensePayload p,DateOnly validTill,DateTime now,int warn)=>new(
            true,false,false,true,false,"EXPIRED","LICENSE EXPIRED",
            $"SuvidhaPOS validity expired on {validTill:dd-MMM-yyyy}. Please renew and check license.",p.ValidFrom,p.ValidTill,
            -1,p.OutletCode,p.OutletName,p.StoreType,p.Plan,CurrentDeviceId(),warn,now);

        public static LicenseStatus CreateActive(LicensePayload p,DateOnly validTill,int days,DateTime now,int warn)
        {
            var warning=days>=0&&days<=warn;
            var text=days==0?"EXPIRES TODAY":warning?$"EXPIRES IN {days} DAY{(days==1?"":"S")}":$"VALID TILL {validTill:dd MMM yyyy}".ToUpperInvariant();
            var msg=days==0?"Your SuvidhaPOS license expires today.":warning?$"Your billing software is going to expire in {days} day{(days==1?"":"s")}.":$"License active till {validTill:dd-MMM-yyyy}.";
            return new(true,true,true,false,warning,"ACTIVE",text,msg,p.ValidFrom,p.ValidTill,days,p.OutletCode,p.OutletName,p.StoreType,p.Plan,CurrentDeviceId(),warn,now);
        }
    }
}
