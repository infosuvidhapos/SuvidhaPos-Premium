using Microsoft.Data.SqlClient;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;
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
            web.CoreWebView2!.Navigate(BaseUrl + "?build=6120complete");
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

    private async void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
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
            else if (string.Equals(type, "browseFolder", StringComparison.OrdinalIgnoreCase))
            {
                var msg=JsonSerializer.Deserialize<DesktopMessage>(e.WebMessageAsJson)??new DesktopMessage(type);
                using var dlg=new FolderBrowserDialog{Description="Select SuvidhaPOS backup folder",ShowNewFolderButton=true};
                if(!string.IsNullOrWhiteSpace(msg.Path)&&Directory.Exists(msg.Path))dlg.SelectedPath=msg.Path;
                if(dlg.ShowDialog(this)==DialogResult.OK)await SendDesktopResultAsync("browseFolder",msg.Target,dlg.SelectedPath);
            }
            else if (string.Equals(type, "browseJson", StringComparison.OrdinalIgnoreCase))
            {
                var msg=JsonSerializer.Deserialize<DesktopMessage>(e.WebMessageAsJson)??new DesktopMessage(type);
                using var dlg=new OpenFileDialog{Title="Select Google Drive credentials JSON",Filter="JSON files (*.json)|*.json|All files (*.*)|*.*",CheckFileExists=true,Multiselect=false};
                if(!string.IsNullOrWhiteSpace(msg.Path)&&File.Exists(msg.Path))dlg.FileName=msg.Path;
                if(dlg.ShowDialog(this)==DialogResult.OK)await SendDesktopResultAsync("browseJson",msg.Target,dlg.FileName);
            }
            else if (string.Equals(type, "backupStartup", StringComparison.OrdinalIgnoreCase))
            {
                var msg=JsonSerializer.Deserialize<DesktopMessage>(e.WebMessageAsJson)??new DesktopMessage(type);
                SetBackupStartup(msg.Enabled==true);
                await SendDesktopResultAsync("backupStartup",null,msg.Enabled==true?"enabled":"disabled");
            }
            else if (string.Equals(type, "openPath", StringComparison.OrdinalIgnoreCase))
            {
                var msg=JsonSerializer.Deserialize<DesktopMessage>(e.WebMessageAsJson)??new DesktopMessage(type);
                if(!string.IsNullOrWhiteSpace(msg.Path))
                {
                    var p=msg.Path!;
                    if(File.Exists(p))Process.Start(new ProcessStartInfo("explorer.exe",$"/select,\"{p}\""){UseShellExecute=true});
                    else if(Directory.Exists(p))Process.Start(new ProcessStartInfo("explorer.exe",$"\"{p}\""){UseShellExecute=true});
                }
            }
            else if (string.Equals(type, "printHtml", StringComparison.OrdinalIgnoreCase))
            {
                var msg=JsonSerializer.Deserialize<DesktopMessage>(e.WebMessageAsJson)??new DesktopMessage(type);
                await HandlePrintHtmlAsync(msg);
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, "Desktop action failed:\n" + ex.Message, "SuvidhaPOS Premium", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private async Task HandlePrintHtmlAsync(DesktopMessage msg)
    {
        if (string.IsNullOrWhiteSpace(msg.Html)) return;
        var mode = (msg.Mode ?? "PREVIEW").Trim().ToUpperInvariant();
        if (mode is not ("DIRECT" or "PDF" or "PREVIEW")) mode = "PREVIEW";

        using var host = new Form
        {
            Text = "SuvidhaPOS Bill Preview",
            Width = 1050,
            Height = 820,
            StartPosition = FormStartPosition.CenterParent,
            ShowInTaskbar = mode == "PREVIEW",
            BackColor = Color.White
        };
        using var viewer = new WebView2 { Dock = DockStyle.Fill };
        host.Controls.Add(viewer);
        if (mode != "PREVIEW")
        {
            host.StartPosition = FormStartPosition.Manual;
            host.Location = new Point(-32000, -32000);
            host.ShowInTaskbar = false;
        }

        host.Show(this);
        await viewer.EnsureCoreWebView2Async();
        viewer.CoreWebView2!.Settings.AreDefaultContextMenusEnabled = false;
        viewer.CoreWebView2.Settings.AreDevToolsEnabled = false;
        viewer.CoreWebView2.Settings.IsStatusBarEnabled = false;

        var loaded = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        void NavigationDone(object? _, CoreWebView2NavigationCompletedEventArgs args)
        {
            viewer.CoreWebView2.NavigationCompleted -= NavigationDone;
            loaded.TrySetResult(args.IsSuccess);
        }
        viewer.CoreWebView2.NavigationCompleted += NavigationDone;
        viewer.NavigateToString(msg.Html);
        if (!await loaded.Task.WaitAsync(TimeSpan.FromSeconds(10)))
            throw new InvalidOperationException("Bill HTML could not be rendered.");

        if (mode == "DIRECT")
        {
            var result = await viewer.CoreWebView2.PrintAsync(null);
            if (result != CoreWebView2PrintStatus.Succeeded)
                throw new InvalidOperationException("Direct print failed: " + result);
            return;
        }

        if (mode == "PDF")
        {
            var safe = string.IsNullOrWhiteSpace(msg.FileName) ? "SuvidhaPOS-Bill" : msg.FileName!;
            foreach (var ch in Path.GetInvalidFileNameChars()) safe = safe.Replace(ch, '_');
            using var dlg = new SaveFileDialog
            {
                Title = "Save SuvidhaPOS Bill as PDF",
                Filter = "PDF files (*.pdf)|*.pdf",
                DefaultExt = "pdf",
                AddExtension = true,
                FileName = safe.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase) ? safe : safe + ".pdf"
            };
            if (dlg.ShowDialog(this) != DialogResult.OK) return;
            if (!await viewer.CoreWebView2.PrintToPdfAsync(dlg.FileName))
                throw new InvalidOperationException("PDF could not be created.");
            MessageBox.Show(this, "PDF saved successfully:\n" + dlg.FileName, "SuvidhaPOS Print", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        viewer.CoreWebView2.ShowPrintUI(CoreWebView2PrintDialogKind.System);
        var closed = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        host.FormClosed += (_, _) => closed.TrySetResult(true);
        await closed.Task;
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

    private async Task SendDesktopResultAsync(string type,string? target,string? path)
    {
        if(web.CoreWebView2 is null)return;
        var detail=JsonSerializer.Serialize(new{type,target,path});
        await web.CoreWebView2.ExecuteScriptAsync($"window.dispatchEvent(new CustomEvent('suvidha:desktop-result',{{detail:{detail}}}));");
    }

    private static void SetBackupStartup(bool enabled)
    {
        const string runKey=@"Software\Microsoft\Windows\CurrentVersion\Run";
        using var key=Registry.CurrentUser.OpenSubKey(runKey,true)??Registry.CurrentUser.CreateSubKey(runKey);
        if(enabled)key.SetValue("SuvidhaPOS Premium",$"\"{Application.ExecutablePath}\"");
        else key.DeleteValue("SuvidhaPOS Premium",false);
        try{
            var legacy=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup),"SuvidhaPOS Premium.lnk");
            if(!enabled&&File.Exists(legacy))File.Delete(legacy);
        }catch{}
    }

    private sealed record DesktopMessage(string? Type, bool? Enabled = null, string? UserName = null, string? Password = null, string? Target = null, string? Path = null, string? Html = null, string? Mode = null, string? FileName = null);
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
            {
                var cfg = JsonSerializer.Deserialize<DatabaseConfig>(File.ReadAllText(path));
                if (cfg is not null) return cfg;
            }
        }
        catch { }
        return new DatabaseConfig();
    }

    public void Save(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
    }

    public string BuildConnectionString()
    {
        var b = new SqlConnectionStringBuilder
        {
            DataSource = string.IsNullOrWhiteSpace(Server) ? @".\SQLEXPRESS" : Server.Trim(),
            InitialCatalog = string.IsNullOrWhiteSpace(Database) ? "SuvidhaPOS" : Database.Trim(),
            TrustServerCertificate = true,
            Encrypt = false,
            MultipleActiveResultSets = true,
            ConnectTimeout = 8
        };
        if (UseSqlAuthentication)
        {
            b.IntegratedSecurity = false;
            b.UserID = UserName ?? "";
            b.Password = string.IsNullOrWhiteSpace(EncryptedPassword) ? "" : Unprotect(EncryptedPassword);
        }
        else b.IntegratedSecurity = true;
        return b.ConnectionString;
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
}

public sealed class DatabaseSettingsForm : Form
{
    private readonly TextBox server = new() { Dock = DockStyle.Fill };
    private readonly TextBox db = new() { Dock = DockStyle.Fill };
    private readonly CheckBox sql = new() { Text = "Use SQL Server authentication", AutoSize = true };
    private readonly TextBox user = new() { Dock = DockStyle.Fill };
    private readonly TextBox pass = new() { Dock = DockStyle.Fill, UseSystemPasswordChar = true };
    public DatabaseConfig Config { get; private set; }

    public DatabaseSettingsForm(DatabaseConfig cfg)
    {
        Config = cfg;
        Text = "SuvidhaPOS Database Settings";
        Width = 520;
        Height = 410;
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;

        server.Text = cfg.Server;
        db.Text = cfg.Database;
        sql.Checked = cfg.UseSqlAuthentication;
        user.Text = cfg.UserName;
        try { pass.Text = string.IsNullOrWhiteSpace(cfg.EncryptedPassword) ? "" : Unprotect(cfg.EncryptedPassword); } catch { }

        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(20), ColumnCount = 2, RowCount = 8 };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.Controls.Add(new Label { Text = "SQL Server", AutoSize = true, Anchor = AnchorStyles.Left }, 0, 0);
        layout.Controls.Add(server, 1, 0);
        layout.Controls.Add(new Label { Text = "Database", AutoSize = true, Anchor = AnchorStyles.Left }, 0, 1);
        layout.Controls.Add(db, 1, 1);
        layout.Controls.Add(sql, 1, 2);
        layout.Controls.Add(new Label { Text = "User name", AutoSize = true, Anchor = AnchorStyles.Left }, 0, 3);
        layout.Controls.Add(user, 1, 3);
        layout.Controls.Add(new Label { Text = "Password", AutoSize = true, Anchor = AnchorStyles.Left }, 0, 4);
        layout.Controls.Add(pass, 1, 4);

        var test = new Button { Text = "Test Connection", AutoSize = true };
        var save = new Button { Text = "Save and Restart", AutoSize = true };
        var cancel = new Button { Text = "Cancel", AutoSize = true };
        var buttons = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true };
        buttons.Controls.Add(test); buttons.Controls.Add(save); buttons.Controls.Add(cancel);
        layout.Controls.Add(buttons, 1, 6);
        Controls.Add(layout);

        test.Click += async (_, _) =>
        {
            try
            {
                var temp = Current();
                using var c = new SqlConnection(temp.BuildConnectionString());
                await c.OpenAsync();
                MessageBox.Show(this, "Connection successful.", "Database", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex) { MessageBox.Show(this, ex.Message, "Connection failed", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        };
        save.Click += (_, _) => { Config = Current(); DialogResult = DialogResult.OK; Close(); };
        cancel.Click += (_, _) => { DialogResult = DialogResult.Cancel; Close(); };
    }

    private DatabaseConfig Current()
    {
        var cfg = new DatabaseConfig { Server = server.Text.Trim(), Database = db.Text.Trim(), UseSqlAuthentication = sql.Checked, UserName = user.Text.Trim() };
        if (sql.Checked && !string.IsNullOrWhiteSpace(pass.Text))
        {
            var raw = ProtectedData.Protect(Encoding.UTF8.GetBytes(pass.Text), null, DataProtectionScope.CurrentUser);
            cfg.EncryptedPassword = Convert.ToBase64String(raw);
        }
        return cfg;
    }
}
