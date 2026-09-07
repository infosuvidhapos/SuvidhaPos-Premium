#define MyAppName "SuvidhaPOS Premium"
#define MyAppVersion "2.1.3"
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
Name: "{userstartup}\SuvidhaPOS Premium"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\suvidha-pos.ico"
[Run]
Filename: "{app}\Prerequisites\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "Installing Microsoft WebView2 Runtime..."; Flags: waituntilterminated skipifsilent
Filename: "{app}\Prerequisites\SQL2019-SQLEXPR_x64_ENU.exe"; Parameters: "{code:GetSqlInstallParameters}"; StatusMsg: "Installing SQL Server 2019 Express..."; Flags: waituntilterminated skipifsilent; Check: ShouldInstallSqlExpress
Filename: "{app}\{#MyAppExeName}"; Description: "Launch SuvidhaPOS Premium"; Flags: nowait postinstall skipifsilent
[Code]
function GetSqlInstallParameters(Param: String): String;
begin
  Result := '/Q /ACTION=Install /IACCEPTSQLSERVERLICENSETERMS /FEATURES=SQLENGINE /INSTANCENAME=SQLEXPRESS /SQLSVCACCOUNT="NT AUTHORITY\SYSTEM" /SQLSYSADMINACCOUNTS="BUILTIN\ADMINISTRATORS" /TCPENABLED=1 /NPENABLED=1 /SQLSVCSTARTUPTYPE=Automatic /UPDATEENABLED=0';
end;

function ShouldInstallSqlExpress: Boolean;
begin
  Result := not RegKeyExists(HKLM, 'SYSTEM\CurrentControlSet\Services\MSSQL$SQLEXPRESS');
end;
