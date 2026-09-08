param(
  [Parameter(Mandatory=$true)]
  [string]$TargetUser
)
$ErrorActionPreference='Stop'

$service=Get-Service -Name 'MSSQL$SQLEXPRESS' -ErrorAction Stop
if($service.Status -ne 'Running'){
  Start-Service -Name 'MSSQL$SQLEXPRESS'
  $service.WaitForStatus('Running',[TimeSpan]::FromSeconds(30))
}

$connectionString='Server=.\SQLEXPRESS;Database=master;Integrated Security=True;TrustServerCertificate=True;Connection Timeout=15'
$conn=New-Object System.Data.SqlClient.SqlConnection($connectionString)
$conn.Open()
try{
  $identifier=$TargetUser.Replace(']',']]')
  $literal=$TargetUser.Replace("'","''")
  $cmd=$conn.CreateCommand()
  $cmd.CommandTimeout=30
  $cmd.CommandText=@"
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name=N'$literal')
    CREATE LOGIN [$identifier] FROM WINDOWS;
IF IS_SRVROLEMEMBER(N'sysadmin',N'$literal') <> 1
    ALTER SERVER ROLE [sysadmin] ADD MEMBER [$identifier];
"@
  [void]$cmd.ExecuteNonQuery()
} finally {
  $conn.Close()
  $conn.Dispose()
}
Write-Host "SQLEXPRESS access ready for $TargetUser"
