# SuvidhaPOS Premium

Windows-ready ASP.NET Core 8 + SQL Server Express POS foundation with premium dark UI, inventory/rack search, outlet master, jewellery rates, IIS deployment and automated Windows installer.

Core billing/inventory is intended for local operation. Optional integrations such as AI import, Google Drive backup, Windows Hello/WebAuthn and weighing-scale bridges are separate production layers.

## Build
`dotnet build SuvidhaPOS-Premium.sln -c Release`

## Default SQL
`Server=.\\SQLEXPRESS;Database=SuvidhaPOS;Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=True;`

GitHub Actions builds a Windows x64 publish and Inno Setup installer on pushes to main.