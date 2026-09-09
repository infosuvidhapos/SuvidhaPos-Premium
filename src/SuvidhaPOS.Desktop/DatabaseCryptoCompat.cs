global using static SuvidhaPOS.Desktop.DatabaseCryptoCompat;

using System.Security.Cryptography;
using System.Text;

namespace SuvidhaPOS.Desktop;

/// <summary>
/// Shared DPAPI compatibility helper for DatabaseSettingsForm.
/// Keeps the database password encrypted for the current Windows user while
/// allowing the settings dialog and DatabaseConfig to use the same decrypt logic.
/// </summary>
public static class DatabaseCryptoCompat
{
    public static string Unprotect(string value)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(value)) return string.Empty;
            var raw = ProtectedData.Unprotect(
                Convert.FromBase64String(value),
                null,
                DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(raw);
        }
        catch
        {
            return string.Empty;
        }
    }
}
