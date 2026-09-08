#define MyAppName "SuvidhaPOS Premium"
#define MyAppVersion "2.8.3"
#define MyAppPublisher "SuvidhaPOS"
#define MyAppExeName "SuvidhaPOS.Desktop.exe"
[Setup]
AppId={{D8C0A9E0-2F5E-4D5A-9B2C-9F1E1D8A77A1}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\SuvidhaPOS Premium
DefaultGroupName=SuvidhaPOS Premium
OutputDir=installer-output
OutputBaseFilename=SuvidhaPOS-Premium-Windows-Setup
SetupIconFile=..\src\SuvidhaPOS-Premium\suvidha-pos.ico
UninstallDisplayIcon={app}\suvidha-pos.ico
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=admin
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
[InstallDelete]
Type: filesandordirs; Name: "{app}\wwwroot"
[Dirs]
Name: "{app}"; Permissions: users-modify
[Files]
Source: "..\publish\desktop\win-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "Prerequisites\SQL2019-SQLEXPR_x64_ENU.exe"; DestDir: "{app}\Prerequisites"; Flags: ignoreversion
Source: "Prerequisites\MicrosoftEdgeWebview2Setup.exe"; DestDir: "{app}\Prerequisites"; Flags: ignoreversion
[Icons]
Name: "{autodesktop}\SuvidhaPOS Premium"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\suvidha-pos.ico"
Name: "{group}\SuvidhaPOS Premium"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\suvidha-pos.ico"
[Run]
Filename: "{app}\Prerequisites\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "Installing Microsoft WebView2 Runtime..."; Flags: waituntilterminated skipifsilent
Filename: "{app}\{#MyAppExeName}"; Description: "Launch SuvidhaPOS Premium"; Flags: nowait postinstall skipifsilent runasoriginaluser; Check: CanLaunchApplication
[Code]
var
  SqlReadyForLaunch: Boolean;
  SqlRestartRequired: Boolean;

function GetSqlInstallParameters: String;
begin
  Result := '/Q /ACTION=Install /IACCEPTSQLSERVERLICENSETERMS /FEATURES=SQLENGINE /INSTANCENAME=SQLEXPRESS /SQLSVCACCOUNT="NT AUTHORITY\SYSTEM" /SQLSYSADMINACCOUNTS="BUILTIN\ADMINISTRATORS" /TCPENABLED=1 /NPENABLED=1 /SQLSVCSTARTUPTYPE=Automatic /UPDATEENABLED=0';
end;

function SqlServiceExists: Boolean;
begin
  Result :=
    RegKeyExists(HKLM64, 'SYSTEM\CurrentControlSet\Services\MSSQL$SQLEXPRESS') or
    RegKeyExists(HKLM, 'SYSTEM\CurrentControlSet\Services\MSSQL$SQLEXPRESS');
end;

function IsSqlConnectionReady: Boolean;
var
  ResultCode: Integer;
  PowerShellExe, Params: String;
begin
  PowerShellExe := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
  Params :=
    '-NoProfile -ExecutionPolicy Bypass -Command "' +
    '$ErrorActionPreference=''Stop'';' +
    '$c=New-Object System.Data.SqlClient.SqlConnection(''Server=.\SQLEXPRESS;Database=master;Integrated Security=True;TrustServerCertificate=True;Connection Timeout=5'');' +
    '$c.Open();$c.Close();exit 0"';
  Result :=
    Exec(PowerShellExe, Params, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and
    (ResultCode = 0);
end;

procedure StartSqlService;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\sc.exe'), 'start "MSSQL$SQLEXPRESS"', '',
    SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

function WaitForSqlReady(SecondsToWait: Integer): Boolean;
var
  I: Integer;
begin
  Result := False;
  for I := 1 to SecondsToWait do
  begin
    if IsSqlConnectionReady then
    begin
      Result := True;
      exit;
    end;
    Sleep(1000);
  end;
end;

procedure EnsureSqlExpress;
var
  SqlInstaller: String;
  ResultCode: Integer;
begin
  SqlReadyForLaunch := False;
  SqlRestartRequired := False;

  if IsSqlConnectionReady then
  begin
    Log('SQLBOOTSTRAP: .\SQLEXPRESS is already reachable.');
    SqlReadyForLaunch := True;
    exit;
  end;

  if SqlServiceExists then
  begin
    Log('SQLBOOTSTRAP: SQLEXPRESS service exists but is not reachable. Attempting to start it.');
    WizardForm.StatusLabel.Caption := 'Starting SQL Server Express...';
    StartSqlService;
    if WaitForSqlReady(30) then
    begin
      Log('SQLBOOTSTRAP: Existing SQLEXPRESS started successfully.');
      SqlReadyForLaunch := True;
      exit;
    end;

    MsgBox(
      'SQL Server Express is installed on this PC but the SQLEXPRESS service could not be started or connected.' + #13#10 + #13#10 +
      'SuvidhaPOS Setup will stop so the application is not installed in a broken database state.' + #13#10 +
      'Please repair/remove the existing SQLEXPRESS instance and run Setup again.',
      mbError, MB_OK);
    RaiseException('Existing SQL Server Express instance is not usable.');
  end;

  SqlInstaller := ExpandConstant('{app}\Prerequisites\SQL2019-SQLEXPR_x64_ENU.exe');
  if not FileExists(SqlInstaller) then
    RaiseException('Bundled SQL Server 2019 Express installer is missing.');

  WizardForm.StatusLabel.Caption := 'Installing SQL Server 2019 Express (SQLEXPRESS)...';
  Log('SQLBOOTSTRAP: No SQLEXPRESS instance found. Starting bundled SQL Server 2019 Express installation.');

  if not Exec(SqlInstaller, GetSqlInstallParameters, ExpandConstant('{app}\Prerequisites'),
    SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    RaiseException('Unable to start SQL Server 2019 Express installer.');

  Log(Format('SQLBOOTSTRAP: SQL installer exit code %d.', [ResultCode]));

  if (ResultCode <> 0) and (ResultCode <> 3010) and (ResultCode <> 1641) then
  begin
    MsgBox(
      'SQL Server 2019 Express installation failed.' + #13#10 + #13#10 +
      'Installer exit code: ' + IntToStr(ResultCode) + #13#10 +
      'SuvidhaPOS Setup cannot continue without a working SQLEXPRESS database engine.',
      mbError, MB_OK);
    RaiseException('SQL Server 2019 Express installation failed with exit code ' + IntToStr(ResultCode) + '.');
  end;

  StartSqlService;
  if WaitForSqlReady(60) then
  begin
    Log('SQLBOOTSTRAP: New SQLEXPRESS instance installed and connection verified.');
    SqlReadyForLaunch := True;
    exit;
  end;

  if (ResultCode = 3010) or (ResultCode = 1641) then
  begin
    SqlRestartRequired := True;
    MsgBox(
      'SQL Server 2019 Express was installed, but Windows must be restarted before SuvidhaPOS can connect.' + #13#10 + #13#10 +
      'Restart Windows, then open SuvidhaPOS Premium.',
      mbInformation, MB_OK);
    exit;
  end;

  MsgBox(
    'SQL Server 2019 Express installation completed, but Setup could not connect to .\SQLEXPRESS.' + #13#10 + #13#10 +
    'SuvidhaPOS will not be launched because the database engine is not ready.',
    mbError, MB_OK);
  RaiseException('SQLEXPRESS connection verification failed after installation.');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    EnsureSqlExpress;
end;

function CanLaunchApplication: Boolean;
begin
  Result := SqlReadyForLaunch;
end;

function NeedRestart: Boolean;
begin
  Result := SqlRestartRequired;
end;
