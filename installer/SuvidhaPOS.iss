#define MyAppName "SuvidhaPOS Premium"
#define MyAppVersion "2.9.0"
#define MyAppPublisher "SuvidhaPOS"
#define MyAppExeName "SuvidhaPOS.Desktop.exe"
[Setup]
AppId={{D8C0A9E0-2F5E-4D5A-9B2C-9F1E1D8A77A1}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\SuvidhaPOS Premium
DefaultGroupName=SuvidhaPOS Premium
UsePreviousAppDir=no
OutputDir=installer-output
OutputBaseFilename=SuvidhaPOS-Premium-Windows-Setup
SetupIconFile=..\src\SuvidhaPOS-Premium\suvidha-pos.ico
UninstallDisplayIcon={app}\suvidha-pos.ico
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=lowest
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
[InstallDelete]
Type: filesandordirs; Name: "{app}\wwwroot"
[Dirs]
Name: "{app}"
[Files]
Source: "..\publish\desktop\win-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "Prerequisites\SQL2019-SQLEXPR_x64_ENU.exe"; DestDir: "{app}\Prerequisites"; Flags: ignoreversion
Source: "Ensure-SqlAccess.ps1"; DestDir: "{app}\Prerequisites"; Flags: ignoreversion
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

function OriginalWindowsUser: String;
var
  DomainName, UserName: String;
begin
  DomainName := GetEnv('USERDOMAIN');
  UserName := GetEnv('USERNAME');
  if (DomainName <> '') and (UserName <> '') then
    Result := DomainName + '\' + UserName
  else
    Result := UserName;
end;

function GetSqlInstallParameters: String;
var
  UserAccount: String;
begin
  UserAccount := OriginalWindowsUser;
  Result :=
    '/Q /ACTION=Install /IACCEPTSQLSERVERLICENSETERMS /FEATURES=SQLENGINE ' +
    '/INSTANCENAME=SQLEXPRESS /SQLSVCACCOUNT="NT AUTHORITY\SYSTEM" ' +
    '/SQLSYSADMINACCOUNTS="BUILTIN\ADMINISTRATORS" "' + UserAccount + '" ' +
    '/TCPENABLED=1 /NPENABLED=1 /SQLSVCSTARTUPTYPE=Automatic /UPDATEENABLED=0';
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

function RequestSqlInstallerElevation(SqlInstaller: String): Boolean;
var
  ErrorCode: Integer;
begin
  Log('SQLBOOTSTRAP: Requesting UAC only for SQL Server Express installation.');
  Result := ShellExec(
    'runas',
    SqlInstaller,
    GetSqlInstallParameters,
    ExpandConstant('{app}\Prerequisites'),
    SW_SHOWNORMAL,
    ewWaitUntilTerminated,
    ErrorCode);
  if not Result then
  begin
    if ErrorCode = 1223 then
      MsgBox(
        'Administrator permission for SQL Server Express was cancelled.' + #13#10 + #13#10 +
        'SuvidhaPOS Setup itself does not require Administrator mode, but SQL Server installation does.',
        mbError, MB_OK)
    else
      MsgBox(
        'Could not start SQL Server Express with Administrator permission.' + #13#10 +
        'Windows error: ' + IntToStr(ErrorCode) + ' - ' + SysErrorMessage(ErrorCode),
        mbError, MB_OK);
  end;
end;

function RepairExistingSqlAccess: Boolean;
var
  ErrorCode: Integer;
  PowerShellExe, Helper, Params, TargetUser: String;
begin
  PowerShellExe := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
  Helper := ExpandConstant('{app}\Prerequisites\Ensure-SqlAccess.ps1');
  TargetUser := OriginalWindowsUser;
  Params :=
    '-NoProfile -ExecutionPolicy Bypass -File "' + Helper + '" -TargetUser "' + TargetUser + '"';
  Log('SQLBOOTSTRAP: Requesting UAC only to start/configure SQLEXPRESS for the POS user.');
  Result := ShellExec(
    'runas',
    PowerShellExe,
    Params,
    ExpandConstant('{app}\Prerequisites'),
    SW_SHOWNORMAL,
    ewWaitUntilTerminated,
    ErrorCode);
  if not Result then
  begin
    if ErrorCode = 1223 then
      MsgBox(
        'Administrator permission for SQL Server configuration was cancelled.' + #13#10 + #13#10 +
        'The SuvidhaPOS application remains a normal-user application.',
        mbError, MB_OK)
    else
      MsgBox(
        'Could not configure SQL Server Express.' + #13#10 +
        'Windows error: ' + IntToStr(ErrorCode) + ' - ' + SysErrorMessage(ErrorCode),
        mbError, MB_OK);
  end;
end;

procedure EnsureSqlExpress;
var
  SqlInstaller: String;
begin
  SqlReadyForLaunch := False;
  SqlRestartRequired := False;

  if IsSqlConnectionReady then
  begin
    Log('SQLBOOTSTRAP: .\SQLEXPRESS is already reachable by the current POS user. No UAC required.');
    SqlReadyForLaunch := True;
    exit;
  end;

  if SqlServiceExists then
  begin
    Log('SQLBOOTSTRAP: SQLEXPRESS exists but current user cannot connect or service is stopped.');
    WizardForm.StatusLabel.Caption := 'Preparing SQL Server Express...';

    if not RepairExistingSqlAccess then
      RaiseException('SQL Server Express requires Administrator permission to finish configuration.');

    if WaitForSqlReady(45) then
    begin
      Log('SQLBOOTSTRAP: Existing SQLEXPRESS is ready for the normal POS user.');
      SqlReadyForLaunch := True;
      exit;
    end;

    MsgBox(
      'SQL Server Express is installed but SuvidhaPOS still cannot connect to .\SQLEXPRESS.' + #13#10 + #13#10 +
      'Please repair the existing SQLEXPRESS instance and run Setup again.',
      mbError, MB_OK);
    RaiseException('Existing SQLEXPRESS is not usable by the POS user.');
  end;

  SqlInstaller := ExpandConstant('{app}\Prerequisites\SQL2019-SQLEXPR_x64_ENU.exe');
  if not FileExists(SqlInstaller) then
    RaiseException('Bundled SQL Server 2019 Express installer is missing.');

  WizardForm.StatusLabel.Caption := 'Installing SQL Server 2019 Express...';
  Log('SQLBOOTSTRAP: SQL is missing. Setup remains non-elevated; only SQL installer will request UAC.');

  if not RequestSqlInstallerElevation(SqlInstaller) then
    RaiseException('SQL Server Express installation was not authorized.');

  if WaitForSqlReady(90) then
  begin
    Log('SQLBOOTSTRAP: New SQLEXPRESS installed and verified for the normal POS user.');
    SqlReadyForLaunch := True;
    exit;
  end;

  if SqlServiceExists then
  begin
    Log('SQLBOOTSTRAP: SQL service now exists but current user is not ready; running SQL-only elevated access repair.');
    if RepairExistingSqlAccess and WaitForSqlReady(45) then
    begin
      SqlReadyForLaunch := True;
      Log('SQLBOOTSTRAP: SQL user access verified after repair.');
      exit;
    end;

    SqlRestartRequired := True;
    MsgBox(
      'SQL Server 2019 Express was installed, but Windows/SQL must be restarted before the normal SuvidhaPOS user can connect.' + #13#10 + #13#10 +
      'Restart Windows, then open SuvidhaPOS Premium.',
      mbInformation, MB_OK);
    exit;
  end;

  MsgBox(
    'SQL Server 2019 Express installation did not create a working SQLEXPRESS instance.' + #13#10 + #13#10 +
    'SuvidhaPOS Setup cannot continue without SQL Server.',
    mbError, MB_OK);
  RaiseException('SQL Server 2019 Express installation failed.');
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
