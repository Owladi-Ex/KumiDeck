@echo off
setlocal
cd /d "%~dp0"

where powershell >nul 2>nul
if errorlevel 1 (
  echo   PowerShell tidak ditemukan. Jalankan skripnya langsung di mesin Windows.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\rilis.ps1"
echo.
pause
