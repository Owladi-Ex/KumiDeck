# Membuat ZIP rilis KumiDeck.
#   powershell -ExecutionPolicy Bypass -File scripts\rilis.ps1
# Hasil: _rilis\kumideck-<versi>.zip
# Catatan: folder data\ TIDAK disertakan agar token pasangan tiap pengguna
# dibuat baru saat pertama kali dijalankan.

$ErrorActionPreference = "Stop"

$akar = Split-Path -Parent $PSScriptRoot
Set-Location $akar

$versi = (Get-Content (Join-Path $akar "package.json") -Raw | ConvertFrom-Json).version
if (-not $versi) { throw "Versi tidak ditemukan di package.json." }

$folderRilis = Join-Path $akar "_rilis"
$tujuan = Join-Path $folderRilis ("kumideck-" + $versi + ".zip")
$staging = Join-Path $env:TEMP ("kumideck-rilis-" + $versi)

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Force -Path $staging | Out-Null
New-Item -ItemType Directory -Force -Path $folderRilis | Out-Null

$daftar = @(
  "server",
  "public",
  "assets",
  "start.cmd",
  "package.json",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "CONTRACT.md",
  "rilis.cmd",
  "buat-exe.cmd",
  "scripts"
)

foreach ($item in $daftar) {
  $sumber = Join-Path $akar $item
  if (-not (Test-Path $sumber)) {
    Write-Warning "Lewati (tidak ada): $item"
    continue
  }
  Copy-Item $sumber -Destination $staging -Recurse -Force
}

# Jangan pernah menyertakan data pengguna atau alat pengembangan.
$buang = @("data", "_rilis", ".git", ".preview")
foreach ($b in $buang) {
  $jalur = Join-Path $staging $b
  if (Test-Path $jalur) { Remove-Item $jalur -Recurse -Force }
}
Get-ChildItem $staging -Recurse -Filter "__*.html" -ErrorAction SilentlyContinue |
  Remove-Item -Force -ErrorAction SilentlyContinue

if (Test-Path $tujuan) { Remove-Item $tujuan -Force }
Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $tujuan -CompressionLevel Optimal
Remove-Item $staging -Recurse -Force

$ukuran = [math]::Round((Get-Item $tujuan).Length / 1MB, 2)
Write-Host ""
Write-Host "  Rilis dibuat : $tujuan"
Write-Host "  Versi        : $versi"
Write-Host "  Ukuran       : $ukuran MB"
Write-Host "  Isi          : server, public, scripts, start.cmd, rilis.cmd, package.json, README, CHANGELOG, LICENSE, CONTRACT"
Write-Host "  Tidak berisi : data\\ (token & papan pengguna)"
Write-Host ""
