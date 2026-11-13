@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js tidak ditemukan. Pasang Node.js 20+ dari https://nodejs.org
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\buat-exe.ps1"
echo.
pause
