@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js tidak ditemukan di komputer ini.
  echo   Pasang Node.js versi 20 atau lebih baru dari https://nodejs.org
  echo.
  pause
  exit /b 1
)

echo.
echo   Menjalankan KumiDeck...
echo.

set KD_OPEN=1
REM Tanpa jendela konsol dengan tray (#6): tombol "Keluar" di tray menghentikan server.
node "%~dp0server\index.js"

if errorlevel 1 (
  echo.
  echo   KumiDeck berhenti dengan galat. Periksa pesan di atas.
  pause
)
