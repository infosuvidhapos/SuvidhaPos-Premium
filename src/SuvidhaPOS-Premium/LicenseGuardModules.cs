using System.Globalization;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Win32;

namespace SuvidhaPOS.Premium;

public static class LicenseGuardModules
{
    const int WarningWindowDays = 10;
    const string ProductFolder = "SuvidhaPOS Premium";
    const string ManagedRegistry = @"HKEY_CURRENT_USER\Software\SuvidhaPOS Premium\License";
    static readonly object ClockSync = new();
    static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public static void Map(WebApplication app)
    {
        var cfg = app.Configuration;

        app.MapGet("/public/license/status", () => Results.Ok(GetStatus(cfg)));
        app.MapGet("/api/license/status", () => Results.Ok(GetStatus(cfg)));

        app.MapPost("/api/license/activate", async (LicenseActivateRequest request, CancellationToken ct) =>
            await ActivateOnlineAsync(cfg, request, ct));

        app.MapPost("/api/license/check", async (CancellationToken ct) =>
            await CheckOnlineAsync(cfg, ct));
    }

    public static LicenseStatus GetStatus() => GetStatus(null);

    public static LicenseStatus GetStatus(IConfiguration? cfg)
    {
        var nowUtc = DateTime.UtcNow;
        var token = ReadProtectedString(TokenPath());
        var managedBefore = HasManagedMarker();

        if (string.IsNullOrWhiteSpace(token))
            return managedBefore
                ? LicenseStatus.Invalid("Managed license cache is missing. Click CHECK LICENSE to sync with Central.", nowUtc, WarningWindowDays)
                : LicenseStatus.Unmanaged(nowUtc, WarningWindowDays);

        if (!TryValidateToken(cfg, token, nowUtc, out var payload, out var validFrom, out var validTill, out var error))
            return LicenseStatus.Invalid(error, nowUtc, WarningWindowDays);

        MarkManaged();
        SaveOutletCode(payload!.OutletCode);

        var serverBlock = ReadServerBlock();
        if (serverBlock is not null)
            return LicenseStatus.ServerBlocked(serverBlock.Code, serverBlock.Message, payload, validFrom, validTill, nowUtc, WarningWindowDays);

        var lastTrusted = ReadTrustedClock();
        if (lastTrusted.HasValue && nowUtc < lastTrusted.Value.AddMinutes(-5))
            return LicenseStatus.Blocked("System date/time rollback detected. Correct Windows date/time and check the license online.",
                payload, validFrom, validTill, nowUtc, WarningWindowDays, "CLOCK_ROLLBACK");

        var today = DateOnly.FromDateTime(nowUtc);
        var fromDate = DateOnly.FromDateTime(validFrom);
        var tillDate = DateOnly.FromDateTime(validTill);

        if (today < fromDate)
            return LicenseStatus.Blocked($"License becomes active on {fromDate:dd-MMM-yyyy}.",
                payload, validFrom, validTill, nowUtc, WarningWindowDays, "NOT_STARTED");

        var days = tillDate.DayNumber - today.DayNumber;
        if (days < 0)
            return LicenseStatus.CreateExpired(payload, validFrom, validTill, nowUtc, WarningWindowDays);

        PersistTrustedClock(nowUtc);
        return LicenseStatus.CreateActive(payload, validFrom, validTill, days, nowUtc, WarningWindowDays);
    }

    static async Task<IResult> ActivateOnlineAsync(IConfiguration cfg, LicenseActivateRequest request, CancellationToken ct)
    {
        var outletCode = (request.OutletCode ?? "").Trim().ToUpperInvariant();
        var activationCode = (request.ActivationCode ?? "").Trim();

        if (string.IsNullOrWhiteSpace(outletCode) || string.IsNullOrWhiteSpace(activationCode))
            return Results.BadRequest(new { message = "Outlet Code and Activation Code are required." });

        try
        {
            using var http = CreateCentralClient(cfg);

            var keyResult = await EnsureCentralPublicKeyAsync(http, cfg, ct);
            if (!keyResult.Success)
                return Results.Json(new { message = keyResult.Message }, statusCode: 502);

            using var response = await http.PostAsJsonAsync("api/pos/activate", new
            {
                outletCode,
                activationCode,
                deviceFingerprint = CurrentDeviceId(),
                deviceName = Environment.MachineName
            }, JsonOptions, ct);

            var body = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
                return Results.Json(new { message = ReadMessage(body, $"Central activation failed ({(int)response.StatusCode}).") },
                    statusCode: (int)response.StatusCode);

            var central = JsonSerializer.Deserialize<CentralLicenseResponse>(body, JsonOptions);
            if (central is null || string.IsNullOrWhiteSpace(central.Token))
                return Results.Json(new { message = "Central server returned an incomplete license response." }, statusCode: 502);

            if (!TryValidateToken(cfg, central.Token, DateTime.UtcNow, out var payload, out _, out _, out var validationError))
                return Results.Json(new { message = "Central license token validation failed: " + validationError }, statusCode: 502);

            WriteProtectedString(TokenPath(), central.Token);
            SaveOutletCode(payload!.OutletCode);
            ClearServerBlock();
            MarkManaged();

            return Results.Ok(new
            {
                message = "SuvidhaPOS activated successfully.",
                status = GetStatus(cfg)
            });
        }
        catch (TaskCanceledException)
        {
            return Results.Json(new { message = "Central license server timed out. Check internet/DNS and try again." }, statusCode: 504);
        }
        catch (Exception ex)
        {
            return Results.Json(new { message = "Central activation failed: " + ex.Message }, statusCode: 502);
        }
    }

    static async Task<IResult> CheckOnlineAsync(IConfiguration cfg, CancellationToken ct)
    {
        var outletCode = LoadOutletCode();
        if (string.IsNullOrWhiteSpace(outletCode))
        {
            var current = GetStatus(cfg);
            outletCode = current.OutletCode;
        }

        if (string.IsNullOrWhiteSpace(outletCode))
            return Results.Json(new
            {
                message = "This POS is not activated yet. Enter Outlet Code and Activation Code first.",
                status = GetStatus(cfg)
            }, statusCode: 409);

        try
        {
            using var http = CreateCentralClient(cfg);

            var keyResult = await EnsureCentralPublicKeyAsync(http, cfg, ct);
            if (!keyResult.Success)
                return Results.Json(new { message = keyResult.Message, status = GetStatus(cfg) }, statusCode: 502);

            using var response = await http.PostAsJsonAsync("api/pos/check", new
            {
                outletCode = outletCode.Trim().ToUpperInvariant(),
                deviceFingerprint = CurrentDeviceId()
            }, JsonOptions, ct);

            var body = await response.Content.ReadAsStringAsync(ct);
            var central = TryDeserialize<CentralLicenseResponse>(body);
            var statusCode = central?.Status?.Trim().ToLowerInvariant();

            if (!response.IsSuccessStatusCode)
            {
                var message = ReadMessage(body, $"Central license check failed ({(int)response.StatusCode}).");

                if (statusCode is "blocked" or "device_blocked" or "not_activated")
                    SaveServerBlock(statusCode.ToUpperInvariant(), message);

                return Results.Json(new { message, status = GetStatus(cfg) }, statusCode: (int)response.StatusCode);
            }

            if (statusCode == "expired")
            {
                SaveServerBlock("EXPIRED", "License has expired. Renew it from Central Admin and click CHECK LICENSE again.");
                return Results.Ok(new
                {
                    message = "License expired on Central.",
                    status = GetStatus(cfg)
                });
            }

            if (central is null || string.IsNullOrWhiteSpace(central.Token))
                return Results.Json(new { message = "Central server returned an incomplete license response.", status = GetStatus(cfg) },
                    statusCode: 502);

            if (!TryValidateToken(cfg, central.Token, DateTime.UtcNow, out var payload, out _, out _, out var validationError))
                return Results.Json(new { message = "Central license token validation failed: " + validationError, status = GetStatus(cfg) },
                    statusCode: 502);

            WriteProtectedString(TokenPath(), central.Token);
            SaveOutletCode(payload!.OutletCode);
            ClearServerBlock();
            MarkManaged();

            return Results.Ok(new
            {
                message = "License synchronized with Central.",
                status = GetStatus(cfg)
            });
        }
        catch (TaskCanceledException)
        {
            return Results.Json(new { message = "Central license server timed out. Offline cached license remains in use.", status = GetStatus(cfg) },
                statusCode: 504);
        }
        catch (Exception ex)
        {
            return Results.Json(new { message = "Central license check failed: " + ex.Message, status = GetStatus(cfg) }, statusCode: 502);
        }
    }

    static HttpClient CreateCentralClient(IConfiguration cfg)
    {
        var raw = cfg["CentralLicense:BaseUrl"] ?? "http://suvidhapremium.suvidhapos.in/";
        raw = raw.Trim();
        if (!raw.EndsWith('/')) raw += "/";

        if (!Uri.TryCreate(raw, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            throw new InvalidOperationException("CentralLicense:BaseUrl is invalid.");

        return new HttpClient(new HttpClientHandler { AllowAutoRedirect = true })
        {
            BaseAddress = uri,
            Timeout = TimeSpan.FromSeconds(25)
        };
    }

    static async Task<(bool Success, string Message)> EnsureCentralPublicKeyAsync(HttpClient http, IConfiguration cfg, CancellationToken ct)
    {
        using var response = await http.GetAsync("api/pos/public-key", ct);
        var body = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
            return (false, ReadMessage(body, $"Could not download Central public key ({(int)response.StatusCode})."));

        var key = JsonSerializer.Deserialize<PublicKeyResponse>(body, JsonOptions);
        if (key is null || string.IsNullOrWhiteSpace(key.PublicKeyPem))
            return (false, "Central public key response is incomplete.");

        var expectedKeyId = cfg["CentralLicense:KeyId"] ?? "main-v1";
        if (!string.Equals(key.KeyId, expectedKeyId, StringComparison.Ordinal))
            return (false, $"Unexpected Central signing key id '{key.KeyId}'.");

        if (!string.Equals(key.Algorithm, "PS256", StringComparison.OrdinalIgnoreCase))
            return (false, $"Unsupported Central signing algorithm '{key.Algorithm}'.");

        var path = PublicKeyPath();
        if (File.Exists(path))
        {
            var existing = NormalizePem(File.ReadAllText(path));
            var incoming = NormalizePem(key.PublicKeyPem);
            if (!string.Equals(existing, incoming, StringComparison.Ordinal))
                return (false, "Central signing public key has changed. Key rotation must be approved before this POS can continue.");
        }
        else
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, key.PublicKeyPem.Trim() + Environment.NewLine, Encoding.ASCII);
        }

        return (true, "OK");
    }

    static bool TryValidateToken(
        IConfiguration? cfg,
        string token,
        DateTime nowUtc,
        out CentralTokenPayload? payload,
        out DateTime validFromUtc,
        out DateTime validUntilUtc,
        out string error)
    {
        payload = null;
        validFromUtc = default;
        validUntilUtc = default;
        error = "";

        try
        {
            var parts = token.Split('.');
            if (parts.Length != 3)
            {
                error = "License token format is invalid.";
                return false;
            }

            var header = JsonSerializer.Deserialize<CentralTokenHeader>(Base64UrlDecode(parts[0]), JsonOptions);
            payload = JsonSerializer.Deserialize<CentralTokenPayload>(Base64UrlDecode(parts[1]), JsonOptions);

            if (header is null || payload is null)
            {
                error = "License token content is invalid.";
                return false;
            }

            if (!string.Equals(header.Alg, "PS256", StringComparison.OrdinalIgnoreCase))
            {
                error = "Unsupported license signing algorithm.";
                return false;
            }

            var expectedKeyId = cfg?["CentralLicense:KeyId"] ?? "main-v1";
            if (!string.Equals(header.Kid, expectedKeyId, StringComparison.Ordinal))
            {
                error = "License signing key id does not match this installation.";
                return false;
            }

            var expectedIssuer = cfg?["CentralLicense:Issuer"] ?? "SuvidhaPOS-Central";
            if (!string.Equals(payload.Iss, expectedIssuer, StringComparison.Ordinal))
            {
                error = "License issuer is invalid.";
                return false;
            }

            var keyPem = LoadPublicKey();
            if (string.IsNullOrWhiteSpace(keyPem))
            {
                error = "License public key is missing. Activate or check the license online.";
                return false;
            }

            using var rsa = RSA.Create();
            rsa.ImportFromPem(keyPem);
            var signedBytes = Encoding.ASCII.GetBytes(parts[0] + "." + parts[1]);
            var signature = Base64UrlDecode(parts[2]);

            if (!rsa.VerifyData(signedBytes, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pss))
            {
                error = "License signature verification failed.";
                return false;
            }

            var expectedDeviceHash = Convert.ToHexString(
                SHA256.HashData(Encoding.UTF8.GetBytes(CurrentDeviceId())));

            if (string.IsNullOrWhiteSpace(payload.DeviceHash) ||
                !FixedEquals(payload.DeviceHash.Trim().ToUpperInvariant(), expectedDeviceHash))
            {
                error = "This license is not activated for this computer.";
                return false;
            }

            if (!DateTime.TryParse(payload.ValidFromUtc, CultureInfo.InvariantCulture,
                    DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out validFromUtc) ||
                !DateTime.TryParse(payload.ValidUntilUtc, CultureInfo.InvariantCulture,
                    DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out validUntilUtc))
            {
                error = "License validity dates are invalid.";
                return false;
            }

            if (!DateTime.TryParse(payload.IssuedAtUtc, CultureInfo.InvariantCulture,
                    DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var issuedAtUtc))
            {
                error = "License issue time is invalid.";
                return false;
            }

            if (nowUtc < issuedAtUtc.AddMinutes(-5))
            {
                error = "System date/time is earlier than the trusted license issue time.";
                return false;
            }

            if (string.IsNullOrWhiteSpace(payload.OutletCode))
            {
                error = "License outlet code is missing.";
                return false;
            }

            return true;
        }
        catch (Exception ex)
        {
            error = "License validation failed: " + ex.Message;
            return false;
        }
    }

    static string? LoadPublicKey()
    {
        var env = Environment.GetEnvironmentVariable("SUVIDHAPOS_LICENSE_PUBLIC_KEY_PEM");
        if (!string.IsNullOrWhiteSpace(env)) return env;

        var managedPath = PublicKeyPath();
        if (File.Exists(managedPath)) return File.ReadAllText(managedPath);

        var shippedPath = Path.Combine(AppContext.BaseDirectory, "license-public-key.pem");
        return File.Exists(shippedPath) ? File.ReadAllText(shippedPath) : null;
    }

    static string LicenseFolder()
    {
        var root = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var path = Path.Combine(root, ProductFolder, "License");
        Directory.CreateDirectory(path);
        return path;
    }

    static string TokenPath() => Path.Combine(LicenseFolder(), "license-token.bin");
    static string StatePath() => Path.Combine(LicenseFolder(), "license-state.bin");
    static string ServerBlockPath() => Path.Combine(LicenseFolder(), "server-block.bin");
    static string ClockPath() => Path.Combine(LicenseFolder(), "trusted-clock.bin");
    static string ManagedPath() => Path.Combine(LicenseFolder(), "managed-license.bin");
    static string PublicKeyPath() => Path.Combine(LicenseFolder(), "license-public-key.pem");

    static bool HasManagedMarker()
    {
        try { if (File.Exists(ManagedPath())) return true; } catch { }
        try { return string.Equals(Registry.GetValue(ManagedRegistry, "Managed", "")?.ToString(), "1", StringComparison.Ordinal); }
        catch { return false; }
    }

    static void MarkManaged()
    {
        try
        {
            if (!File.Exists(ManagedPath()))
            {
                var plain = Encoding.UTF8.GetBytes("SUVIDHAPOS-MANAGED-LICENSE-V2");
                File.WriteAllBytes(ManagedPath(), ProtectedData.Protect(plain, null, DataProtectionScope.CurrentUser));
            }
        }
        catch { }

        try { Registry.SetValue(ManagedRegistry, "Managed", "1", RegistryValueKind.String); } catch { }
    }

    static string CurrentDeviceId()
    {
        string raw = "";
        try
        {
            raw = Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography", "MachineGuid", "")?.ToString() ?? "";
        }
        catch { }

        if (string.IsNullOrWhiteSpace(raw)) raw = Environment.MachineName;
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes("SUVIDHAPOS|" + raw.Trim() + "|" + Environment.MachineName));
        return Convert.ToHexString(bytes);
    }

    static DateTime? ReadTrustedClock()
    {
        lock (ClockSync)
        {
            try
            {
                var raw = ReadProtectedString(ClockPath());
                if (string.IsNullOrWhiteSpace(raw)) return null;
                return DateTime.TryParse(raw, CultureInfo.InvariantCulture,
                    DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var dt) ? dt : null;
            }
            catch { return null; }
        }
    }

    static void PersistTrustedClock(DateTime nowUtc)
    {
        lock (ClockSync)
        {
            try
            {
                var previous = ReadTrustedClock();
                if (previous.HasValue && previous.Value >= nowUtc) return;
                WriteProtectedString(ClockPath(), nowUtc.ToString("O", CultureInfo.InvariantCulture));
            }
            catch { }
        }
    }

    static void SaveOutletCode(string outletCode)
    {
        if (!string.IsNullOrWhiteSpace(outletCode))
            WriteProtectedString(StatePath(), outletCode.Trim().ToUpperInvariant());
    }

    static string? LoadOutletCode() => ReadProtectedString(StatePath());

    static void SaveServerBlock(string code, string message)
    {
        var value = JsonSerializer.Serialize(new ServerBlockState(code, message, DateTime.UtcNow), JsonOptions);
        WriteProtectedString(ServerBlockPath(), value);
    }

    static ServerBlockState? ReadServerBlock()
    {
        try
        {
            var raw = ReadProtectedString(ServerBlockPath());
            return string.IsNullOrWhiteSpace(raw) ? null : JsonSerializer.Deserialize<ServerBlockState>(raw, JsonOptions);
        }
        catch { return null; }
    }

    static void ClearServerBlock()
    {
        try { if (File.Exists(ServerBlockPath())) File.Delete(ServerBlockPath()); } catch { }
    }

    static void WriteProtectedString(string path, string value)
    {
        var plain = Encoding.UTF8.GetBytes(value);
        var protectedBytes = ProtectedData.Protect(plain, null, DataProtectionScope.CurrentUser);
        File.WriteAllBytes(path, protectedBytes);
    }

    static string? ReadProtectedString(string path)
    {
        try
        {
            if (!File.Exists(path)) return null;
            var protectedBytes = File.ReadAllBytes(path);
            var plain = ProtectedData.Unprotect(protectedBytes, null, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(plain);
        }
        catch { return null; }
    }

    static byte[] Base64UrlDecode(string value)
    {
        var s = value.Replace('-', '+').Replace('_', '/');
        s += new string('=', (4 - s.Length % 4) % 4);
        return Convert.FromBase64String(s);
    }

    static string NormalizePem(string value) =>
        string.Concat(value.Where(c => !char.IsWhiteSpace(c)));

    static bool FixedEquals(string a, string b)
    {
        var left = Encoding.UTF8.GetBytes(a);
        var right = Encoding.UTF8.GetBytes(b);
        return left.Length == right.Length && CryptographicOperations.FixedTimeEquals(left, right);
    }

    static T? TryDeserialize<T>(string json)
    {
        try { return JsonSerializer.Deserialize<T>(json, JsonOptions); }
        catch { return default; }
    }

    static string ReadMessage(string body, string fallback)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String)
                return m.GetString() ?? fallback;
        }
        catch { }
        return fallback;
    }

    public record LicenseActivateRequest(string? OutletCode, string? ActivationCode);
    public record CentralLicenseResponse(string? Status, string? Token, DateTime? ValidUntilUtc, string? StoreType, string? OutletCode, DateTime? ServerTimeUtc, string? KeyId);
    public record PublicKeyResponse(string? Algorithm, string? KeyId, string? PublicKeyPem);
    public record CentralTokenHeader(string? Alg, string? Typ, string? Kid);

    public record CentralTokenPayload(
        string? Iss,
        string? LicenseId,
        string? OutletId,
        string OutletCode,
        string? OutletName,
        string? StoreType,
        string? DeviceHash,
        string IssuedAtUtc,
        string ValidFromUtc,
        string ValidUntilUtc,
        int TokenVersion,
        string? Nonce,
        string? Status,
        string? Plan);

    public record ServerBlockState(string Code, string Message, DateTime CheckedAtUtc);

    public record LicenseStatus(
        bool Managed, bool LoginAllowed, bool Active, bool Expired, bool ShowWarning, string Code, string DisplayText,
        string Message, string? ValidFrom, string? ValidTill, int? DaysRemaining, string? OutletCode, string? OutletName,
        string? StoreType, string? Plan, string DeviceId, int WarningDays, DateTime CheckedAtUtc)
    {
        static string DateText(DateTime value) => value.ToUniversalTime().ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

        public static LicenseStatus Unmanaged(DateTime now, int warn) => new(
            false, false, false, false, false, "NOT_ACTIVATED", "LICENSE • ACTIVATE",
            "This SuvidhaPOS installation is not linked to Central yet. Activate it with the Outlet Code and Activation Code.",
            null, null, null, null, null, null, null, CurrentDeviceId(), warn, now);

        public static LicenseStatus Invalid(string message, DateTime now, int warn) => new(
            true, false, false, false, false, "INVALID", "LICENSE INVALID", message,
            null, null, null, LoadOutletCode(), null, null, null, CurrentDeviceId(), warn, now);

        public static LicenseStatus ServerBlocked(string code, string message, CentralTokenPayload p, DateTime from, DateTime till, DateTime now, int warn) => new(
            true, false, false, string.Equals(code, "EXPIRED", StringComparison.OrdinalIgnoreCase), false,
            code, string.Equals(code, "EXPIRED", StringComparison.OrdinalIgnoreCase) ? "LICENSE EXPIRED" : "LICENSE BLOCKED",
            message, DateText(from), DateText(till), null, p.OutletCode, p.OutletName, p.StoreType, p.Plan ?? "Premium",
            CurrentDeviceId(), warn, now);

        public static LicenseStatus Blocked(string message, CentralTokenPayload p, DateTime from, DateTime till, DateTime now, int warn, string code) => new(
            true, false, false, false, false, code, "LICENSE BLOCKED", message,
            DateText(from), DateText(till), null, p.OutletCode, p.OutletName, p.StoreType, p.Plan ?? "Premium",
            CurrentDeviceId(), warn, now);

        public static LicenseStatus CreateExpired(CentralTokenPayload p, DateTime from, DateTime till, DateTime now, int warn) => new(
            true, false, false, true, false, "EXPIRED", "LICENSE EXPIRED",
            $"SuvidhaPOS validity expired on {till:dd-MMM-yyyy}. Please renew and click CHECK LICENSE.",
            DateText(from), DateText(till), -1, p.OutletCode, p.OutletName, p.StoreType, p.Plan ?? "Premium",
            CurrentDeviceId(), warn, now);

        public static LicenseStatus CreateActive(CentralTokenPayload p, DateTime from, DateTime till, int days, DateTime now, int warn)
        {
            var warning = days >= 0 && days <= warn;
            var text = days == 0 ? "EXPIRES TODAY" :
                warning ? $"EXPIRES IN {days} DAY{(days == 1 ? "" : "S")}" :
                $"VALID TILL {till:dd MMM yyyy}".ToUpperInvariant();

            var msg = days == 0 ? "Your SuvidhaPOS license expires today." :
                warning ? $"Your billing software is going to expire in {days} day{(days == 1 ? "" : "s")}." :
                $"License active till {till:dd-MMM-yyyy}.";

            return new(true, true, true, false, warning, "ACTIVE", text, msg,
                DateText(from), DateText(till), days, p.OutletCode, p.OutletName, p.StoreType, p.Plan ?? "Premium",
                CurrentDeviceId(), warn, now);
        }
    }
}
