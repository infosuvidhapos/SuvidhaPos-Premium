using Microsoft.Data.SqlClient;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace SuvidhaPOS.Desktop;

public sealed class MainForm : Form
{
    private readonly WebView2 web = new() { Dock = DockStyle.Fill };
    private Process? backend;
    private const int Port = 5177;
    private string BaseUrl => $"http://127.0.0.1:{Port}/";
    private static string InstallDir => AppContext.BaseDirectory;
    private static string ConfigPath => Path.Combine(InstallDir, "Database.config.json");
    private static string RememberedLoginPath => Path.Combine(InstallDir, "RememberedLogin.json");

    public MainForm()
    {
        Text = "SuvidhaPOS Premium";
        Icon = File.Exists(Path.Combine(InstallDir, "suvidha-pos.ico")) ? new Icon(Path.Combine(InstallDir, "suvidha-pos.ico")) : SystemIcons.Application;
        StartPosition = FormStartPosition.CenterScreen;
        WindowState = FormWindowState.Maximized;
        MinimumSize = new Size(1100, 720);
        BackColor = Color.FromArgb(5, 16, 28);
        Controls.Add(web);
        FormClosing += (_, _) => StopBackend();
    }

    protected override async void OnShown(EventArgs e)
    {
        base.OnShown(e);
        try
        {
            await StartBackendAsync();
            await InitializeWebViewAsync();
            web.CoreWebView2!.Navigate(BaseUrl + "?build=670billmaster");
        }
        catch (Exception ex)
        {
            MessageBox.Show(this,
                "SuvidhaPOS Premium could not start.\n\n" + ex.Message +
                "\n\nUse Change Database from the login page after startup.",
                "SuvidhaPOS Premium",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private async Task StartBackendAsync()
    {
        StopBackend();
        var exe = Path.Combine(InstallDir, "SuvidhaPOS.Premium.exe");
        if (!File.Exists(exe))
            throw new FileNotFoundException("SuvidhaPOS backend executable was not found.", exe);

        var cfg = DatabaseConfig.Load(ConfigPath);
        var psi = new ProcessStartInfo(exe)
        {
            WorkingDirectory = InstallDir,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        psi.Environment["ASPNETCORE_URLS"] = BaseUrl;
        psi.Environment["ConnectionStrings__DefaultConnection"] = cfg.BuildConnectionString();
        psi.Environment["ASPNETCORE_ENVIRONMENT"] = "Production";
        backend = Process.Start(psi) ?? throw new InvalidOperationException("Unable to start the local application service.");

        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
        for (var i = 0; i < 30; i++)
        {
            try
            {
                var response = await http.GetAsync(BaseUrl);
                if ((int)response.StatusCode >= 200 && (int)response.StatusCode < 500) return;
            }
            catch { }
            await Task.Delay(250);
        }
    }

    private async Task InitializeWebViewAsync()
    {
        var userData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SuvidhaPOS Premium", "WebView2");
        Directory.CreateDirectory(userData);
        var env = await CoreWebView2Environment.CreateAsync(null, userData);
        await web.EnsureCoreWebView2Async(env);
        web.CoreWebView2!.Settings.AreDefaultContextMenusEnabled = false;
        web.CoreWebView2.Settings.AreDevToolsEnabled = false;
        web.CoreWebView2.Settings.IsStatusBarEnabled = false;
        web.CoreWebView2.NavigationCompleted += async (_, _) => await LoadRememberedLoginAsync();
        web.CoreWebView2.NavigationStarting += (_, args) =>
        {
            if (!args.Uri.StartsWith(BaseUrl, StringComparison.OrdinalIgnoreCase))
            {
                args.Cancel = true;
                try { Process.Start(new ProcessStartInfo(args.Uri) { UseShellExecute = true }); } catch { }
            }
        };
        web.CoreWebView2.WebMessageReceived += OnWebMessage;
    }

    private void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            // Accept both the normal JSON-object WebView2 message and a plain
            // string message so the Exit command remains robust across WebView2
            // versions/hosts.
            var type = string.Empty;
            try
            {
                using var doc = JsonDocument.Parse(e.WebMessageAsJson);
                if (doc.RootElement.ValueKind == JsonValueKind.Object && doc.RootElement.TryGetProperty("type", out var typeElement))
                    type = typeElement.GetString() ?? string.Empty;
                else if (doc.RootElement.ValueKind == JsonValueKind.String)
                    type = doc.RootElement.GetString() ?? string.Empty;
            }
            catch
            {
                type = e.TryGetWebMessageAsString() ?? string.Empty;
            }

            if (string.Equals(type, "database", StringComparison.OrdinalIgnoreCase))
            {
                _ = ShowDatabaseSettingsAsync();
            }
            else if (string.Equals(type, "remember", StringComparison.OrdinalIgnoreCase) ||
                     string.Equals(type, "clearRemembered", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    var msg = JsonSerializer.Deserialize<DesktopMessage>(e.WebMessageAsJson);
                    if (string.Equals(type, "remember", StringComparison.OrdinalIgnoreCase)) SaveRememberedLogin(msg ?? new DesktopMessage(type));
                    else if (File.Exists(RememberedLoginPath)) File.Delete(RememberedLoginPath);
                }
                catch { }
            }
            else if (string.Equals(type, "exit", StringComparison.OrdinalIgnoreCase))
            {
                // Close on the WinForms UI thread after WebView2 finishes the
                // message callback. FormClosing then stops the local backend.
                if (!IsDisposed && IsHandleCreated)
                    BeginInvoke(new Action(() =>
                    {
                        if (!IsDisposed) Close();
                    }));
            }
            else if (string.Equals(type, "support", StringComparison.OrdinalIgnoreCase))
            {
                Process.Start(new ProcessStartInfo("https://wa.me/918271718844") { UseShellExecute = true });
            }
        }
        catch { }
    }

    private void SaveRememberedLogin(DesktopMessage msg)
    {
        try
        {
            if (msg.Enabled != true) { if (File.Exists(RememberedLoginPath)) File.Delete(RememberedLoginPath); return; }
            var data = new RememberedLogin { UserName = msg.UserName ?? "", EncryptedPassword = Protect(msg.Password ?? "") };
            File.WriteAllText(RememberedLoginPath, JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch { }
    }

    private async Task LoadRememberedLoginAsync()
    {
        try
        {
            if (!File.Exists(RememberedLoginPath) || web.CoreWebView2 is null) return;
            var data = JsonSerializer.Deserialize<RememberedLogin>(File.ReadAllText(RememberedLoginPath));
            if (data is null) return;
            var user = JsonSerializer.Serialize(data.UserName ?? "");
            var pass = JsonSerializer.Serialize(Unprotect(data.EncryptedPassword ?? ""));
            await web.CoreWebView2.ExecuteScriptAsync($"document.querySelector('#loginUser').value={user};document.querySelector('#loginPass').value={pass};document.querySelector('#rememberMe').checked=true;");
        }
        catch { }
    }

    private static string Protect(string value)
    {
        var raw = ProtectedData.Protect(Encoding.UTF8.GetBytes(value), null, DataProtectionScope.CurrentUser);
        return Convert.ToBase64String(raw);
    }

    private static string Unprotect(string value)
    {
        try
        {
            var raw = ProtectedData.Unprotect(Convert.FromBase64String(value), null, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(raw);
        }
        catch { return ""; }
    }

    private async Task ShowDatabaseSettingsAsync()
    {
        using var dialog = new DatabaseSettingsForm(DatabaseConfig.Load(ConfigPath));
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        dialog.Config.Save(ConfigPath);
        try
        {
            await StartBackendAsync();
            web.CoreWebView2?.Reload();
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Database configuration", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void StopBackend()
    {
        try
        {
            if (backend is { HasExited: false })
            {
                backend.Kill(entireProcessTree: true);
                backend.WaitForExit(3000);
            }
        }
        catch { }
        finally { backend = null; }
    }

    private sealed record DesktopMessage(string? Type, bool? Enabled = null, string? UserName = null, string? Password = null);
    private sealed class RememberedLogin { public string UserName { get; set; } = ""; public string EncryptedPassword { get; set; } = ""; }
}

public sealed class DatabaseConfig
{
    public string Server { get; set; } = @".\SQLEXPRESS";
    public string Database { get; set; } = "SuvidhaPOS";
    public bool UseSqlAuthentication { get; set; }
    public string UserName { get; set; } = "";
    public string EncryptedPassword { get; set; } = "";

    public static DatabaseConfig Load(string path)
    {
        try
        {
            if (File.Exists(path))
                return JsonSerializer.Deserialize<DatabaseConfig>(File.ReadAllText(path)) ?? new();
        }
        catch { }
        return new();
    }

    public string Password
    {
        get
        {
            if (string.IsNullOrWhiteSpace(EncryptedPassword)) return "";
            try
            {
                var raw = ProtectedData.Unprotect(Convert.FromBase64String(EncryptedPassword), null, DataProtectionScope.LocalMachine);
                return Encoding.UTF8.GetString(raw);
            }
            catch { return ""; }
        }
        set
        {
            var raw = ProtectedData.Protect(Encoding.UTF8.GetBytes(value ?? ""), null, DataProtectionScope.LocalMachine);
            EncryptedPassword = Convert.ToBase64String(raw);
        }
    }

    public string BuildConnectionString()
    {
        var b = new SqlConnectionStringBuilder
        {
            DataSource = Server.Trim(),
            InitialCatalog = Database.Trim(),
            TrustServerCertificate = true,
            MultipleActiveResultSets = true,
            ConnectTimeout = 5
        };
        if (UseSqlAuthentication)
        {
            b.IntegratedSecurity = false;
            b.UserID = UserName.Trim();
            b.Password = Password;
        }
        else
        {
            b.IntegratedSecurity = true;
        }
        return b.ConnectionString;
    }

    public void Save(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var json = JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(path, json);
    }
}

public sealed class DatabaseSettingsForm : Form
{
    private readonly TextBox server = new();
    private readonly TextBox database = new();
    private readonly ComboBox auth = new();
    private readonly TextBox user = new();
    private readonly TextBox password = new() { UseSystemPasswordChar = true };
    private readonly Label hint = new();
    public DatabaseConfig Config { get; }

    public DatabaseSettingsForm(DatabaseConfig config)
    {
        Config = config;
        Text = "SuvidhaPOS - Database Configuration";
        Icon = File.Exists(Path.Combine(AppContext.BaseDirectory, "suvidha-pos.ico")) ? new Icon(Path.Combine(AppContext.BaseDirectory, "suvidha-pos.ico")) : SystemIcons.Application;
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false; MinimizeBox = false;
        ClientSize = new Size(520, 390);
        BackColor = Color.FromArgb(10, 25, 41);
        ForeColor = Color.White;

        server.Text = config.Server;
        database.Text = config.Database;
        auth.Items.AddRange(new object[] { "Windows Authentication", "SQL Server Authentication" });
        auth.SelectedIndex = config.UseSqlAuthentication ? 1 : 0;
        user.Text = config.UserName;
        password.Text = config.Password;

        var title = new Label { Text = "Database Connection", Font = new Font("Segoe UI", 18, FontStyle.Bold), AutoSize = true, Location = new Point(28, 22) };
        var sub = new Label { Text = "Configure this PC for your local/shared SQL Server.", AutoSize = true, ForeColor = Color.LightSteelBlue, Location = new Point(30, 58) };
        AddLabel("SQL Server / Instance", 30, 92);
        Style(server, 30, 114, 460);
        AddLabel("Database Name", 30, 150);
        Style(database, 30, 172, 460);
        AddLabel("Authentication", 30, 208);
        Style(auth, 30, 230, 460);
        AddLabel("SQL User", 30, 266);
        Style(user, 30, 288, 220);
        AddLabel("SQL Password", 270, 266);
        Style(password, 270, 288, 220);

        hint.Text = "Example: SERVER\\SQLEXPRESS   |   Database: SuvidhaPOS";
        hint.AutoSize = true; hint.ForeColor = Color.FromArgb(150, 180, 205); hint.Location = new Point(30, 326);

        var test = Button("Test Connection", 30, 350, 145);
        var save = Button("Save & Restart", 345, 350, 145);
        var cancel = Button("Cancel", 190, 350, 140);
        test.Click += async (_, _) => await TestAsync();
        save.Click += (_, _) => { if (ValidateAndCopy()) DialogResult = DialogResult.OK; };
        cancel.Click += (_, _) => DialogResult = DialogResult.Cancel;

        Controls.AddRange(new Control[] { title, sub, server, database, auth, user, password, hint, test, cancel, save });
        auth.SelectedIndexChanged += (_, _) => ToggleSqlFields();
        ToggleSqlFields();
    }

    private void AddLabel(string text, int x, int y)
    {
        Controls.Add(new Label { Text = text, AutoSize = true, Location = new Point(x, y), ForeColor = Color.Gainsboro });
    }

    private void Style(Control c, int x, int y, int w)
    {
        c.Location = new Point(x, y); c.Width = w; c.Height = 28;
        c.BackColor = Color.FromArgb(18, 43, 66); c.ForeColor = Color.White;
    }

    private Button Button(string text, int x, int y, int w) =>
        new() { Text = text, Location = new Point(x, y), Width = w, Height = 30, FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(24, 112, 220), ForeColor = Color.White };

    private void ToggleSqlFields()
    {
        var sql = auth.SelectedIndex == 1;
        user.Enabled = password.Enabled = sql;
    }

    private bool ValidateAndCopy()
    {
        if (string.IsNullOrWhiteSpace(server.Text) || string.IsNullOrWhiteSpace(database.Text))
        {
            MessageBox.Show(this, "SQL Server and Database Name are required.", "Database configuration", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return false;
        }
        if (auth.SelectedIndex == 1 && string.IsNullOrWhiteSpace(user.Text))
        {
            MessageBox.Show(this, "SQL User is required for SQL Server Authentication.", "Database configuration", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return false;
        }
        Config.Server = server.Text.Trim();
        Config.Database = database.Text.Trim();
        Config.UseSqlAuthentication = auth.SelectedIndex == 1;
        Config.UserName = user.Text.Trim();
        Config.Password = password.Text;
        return true;
    }

    private async Task TestAsync()
    {
        if (!ValidateAndCopy()) return;
        try
        {
            await using var c = new SqlConnection(Config.BuildConnectionString());
            await c.OpenAsync();
            MessageBox.Show(this, $"Connection successful.\n\nServer: {c.DataSource}\nDatabase: {c.Database}", "Database connection", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Database connection failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
