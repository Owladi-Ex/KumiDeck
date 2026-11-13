@echo off
rem ===========================================================================
rem  KumiDeck dalam mode HTTPS lokal.
rem
rem  Diperlukan agar Chrome Android mau memasang KumiDeck sebagai aplikasi
rem  (PWA): Android hanya mengizinkan pemasangan pada HTTPS atau localhost,
rem  bukan http://alamat-LAN.
rem
rem  Cara pakai:
rem   1. Jalankan berkas ini (jendela konsol akan terbuka).
rem   2. Di Android, buka http://<ip-lan>:<port>/sertifikat.cer  (http, port+1)
rem      atau salin berkas data\tls\kumideck.cer ke ponsel.
rem   3. Setelan Android -> Keamanan -> Enkripsi & kredensial ->
rem      Pasang sertifikat -> Sertifikat CA -> pilih berkas tadi.
rem   4. Buka tautan https://<ip-lan>:<port>/remote?kode=... lalu pilih
rem      "Pasang aplikasi" di menu Chrome.
rem ===========================================================================
setlocal
cd /d "%~dp0"

if "%KD_TRAY%"=="" set KD_TRAY=1
set KD_HTTPS=1

where node >nul 2>nul
if errorlevel 1 (
  echo [KumiDeck] Node.js tidak ditemukan. Pasang Node.js LTS lalu jalankan lagi.
  pause
  exit /b 1
)

echo [KumiDeck] Menyiapkan sertifikat HTTPS lokal...
node server\index.js
