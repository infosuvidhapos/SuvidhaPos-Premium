$ErrorActionPreference='Stop'
Write-Host 'SuvidhaPOS Premium - Local SQL setup' -ForegroundColor Cyan
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { throw '.NET 8 SDK/Runtime not found. Install the .NET 8 Hosting Bundle/SDK first.' }
$sql = Get-Service -Name 'MSSQL$SQLEXPRESS' -ErrorAction SilentlyContinue
if (-not $sql) { Write-Warning 'SQL Server Express service was not detected. Install SQL Server Express or change appsettings.json to your SQL instance.' }
else { if ($sql.Status -ne 'Running') { Start-Service $sql.Name } ; Write-Host 'SQL Express service is running.' -ForegroundColor Green }
dotnet restore .\SuvidhaPOS.Premium.csproj
dotnet run --project .\SuvidhaPOS.Premium.csproj
