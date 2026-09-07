$ErrorActionPreference='Stop'
dotnet restore .\SuvidhaPOS.Premium.csproj
dotnet publish .\SuvidhaPOS.Premium.csproj -c Release -o .\publish /p:UseAppHost=false
Write-Host 'Published to .\publish' -ForegroundColor Green
Write-Host 'In IIS, install ASP.NET Core Hosting Bundle and point the site/application to this publish folder.'
