@echo off
rem Jalankan KumiDeck 2.4.0 dari sumber (inti Rust + WebView2).
setlocal
cd /d "%~dp0"

set EXE=native-rs\kumideck\target\release\kumideck.exe
if not exist "%EXE%" set EXE=_exe\KumiDeck.exe
if not exist "%EXE%" (
  echo.
  echo   KumiDeck.exe belum dibangun.
  echo   Jalankan scripts\buat-exe.ps1 lebih dulu.
  echo.
  pause
  exit /b 1
)

echo.
echo   Menjalankan KumiDeck...
echo.
start "" "%EXE%"
