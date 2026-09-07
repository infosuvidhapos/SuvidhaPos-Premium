@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "ASPNETCORE_URLS=http://127.0.0.1:5177"

REM Use an existing local SQLEXPRESS instance (SQL Server 2019/2022/etc.).
REM Do not install another SQL Server when SQLEXPRESS is already present.
sc query "MSSQL$SQLEXPRESS" >nul 2>&1
if errorlevel 1 (
  if exist "%~dp0Prerequisites\SQL2022-SSEI-Expr.exe" (
    echo SQL Server Express SQLEXPRESS instance was not found.
    echo Starting Microsoft SQL Server Express prerequisite setup...
    start "SQL Server Express Setup" /wait "%~dp0Prerequisites\SQL2022-SSEI-Expr.exe"
  ) else (
    echo ERROR: SQL Server Express SQLEXPRESS instance is not installed.
    echo Please install SQL Server Express or configure the SQLEXPRESS instance.
    pause
    exit /b 2
  )
)

REM Re-check after prerequisite setup. Never start the application without SQL.
sc query "MSSQL$SQLEXPRESS" >nul 2>&1
if errorlevel 1 (
  echo ERROR: SQL Server instance SQLEXPRESS is still unavailable.
  echo SuvidhaPOS cannot start until SQL Server SQLEXPRESS is available.
  pause
  exit /b 3
)

net start "MSSQL$SQLEXPRESS" >nul 2>&1

start "SuvidhaPOS Premium" /min "%~dp0SuvidhaPOS.Premium.exe"
set "URL=http://127.0.0.1:5177/"
for /l %%i in (1,1,30) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -TimeoutSec 1; if ($r.StatusCode -ge 200) { exit 0 } } catch {} ; exit 1" >nul 2>&1
  if not errorlevel 1 goto OPEN
  timeout /t 1 /nobreak >nul
)
:OPEN
start "" "%URL%"
exit /b 0
