# SuvidhaPOS Premium — final GitHub-ready package

1. Create/use the repository `itsamanverse/SuvidhaPOS-Premium`.
2. Remove the old repository files if they are causing conflicting Actions/workflow files.
3. Extract this ZIP and upload **all contents including `.github`** to the repository root.
4. Commit/push to `main`.
5. GitHub Actions will restore, build, validate, publish Windows x64 and create the Inno Setup installer.
6. Download `SuvidhaPOS-Premium-Windows-Installer` from the successful Actions run.

Local requirements for running: Windows + .NET 8 + SQL Server Express. The project initializes the local database from the included schema/seed scripts.

Important: this package is intended to remove repository-layout/Actions consistency problems. A successful GitHub Actions run is still the final build validation because this environment does not have the Windows .NET/SQL Server stack.
