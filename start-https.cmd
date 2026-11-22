@echo off
rem ===========================================================================
rem  KumiDeck dengan HTTPS lokal (port 4173 dan 4174).
rem
rem  Diperlukan agar Chrome Android mau memasang KumiDeck sebagai aplikasi
rem  (PWA): Android hanya mengizinkan pemasangan pada HTTPS atau localhost,
rem  bukan http://alamat-LAN.
rem
rem  Cara pakai:
rem   1. Jalankan berkas ini.
rem   2. Di Android, buka https://<ip-lan>:4174/ pada Chrome, terima peringatan
rem      sertifikat, atau buka https://<ip-lan>:4174/sertifikat.cer untuk
rem      mengunduh sertifikat lalu pasang lewat
rem      Setelan Android -> Keamanan -> Enkripsi & kredensial ->
rem      Pasang sertifikat -> Sertifikat CA.
rem   3. Buka https://<ip-lan>:4174/remote lalu pilih "Pasang aplikasi".
rem
rem  HTTPS menyala dari Setelan (bawaan 2.4.0: aktif).
rem ===========================================================================
setlocal
cd /d "%~dp0"

set EXE=native-rs\kumideck\target\release\kumideck.exe
if not exist "%EXE%" set EXE=_exe\KumiDeck.exe
if not exist "%EXE%" (
  echo [KumiDeck] KumiDeck.exe belum dibangun. Jalankan scripts\buat-exe.ps1.
  pause
  exit /b 1
)

echo [KumiDeck] Menjalankan dengan HTTPS lokal...
start "" "%EXE%"
