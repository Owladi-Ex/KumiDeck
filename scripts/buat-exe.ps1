# Membuat KumiDeck.exe portabel (Node.js Single Executable Application).
#   powershell -ExecutionPolicy Bypass -File scripts\buat-exe.ps1
# Hasil:
#   _exe\KumiDeck\KumiDeck.exe  + public\  (folder portabel, bisa di USB)
#   _exe\KumiDeck-<versi>-portable.zip
#
# Catatan: perkakas build (esbuild, postject) hanya dipakai di mesin pengembang.
# Aplikasi hasilnya tetap tanpa dependensi: satu exe + folder public\.

$ErrorActionPreference = "Stop"

$akar = Split-Path -Parent $PSScriptRoot
Set-Location $akar

$versi = (Get-Content (Join-Path $akar "package.json") -Raw | ConvertFrom-Json).version
if (-not $versi) { throw "Versi tidak ditemukan di package.json." }

Write-Host ""
Write-Host "  Membuat KumiDeck $versi - .exe portabel"
Write-Host "  --------------------------------------"

# 1. Perkakas build
if (-not (Test-Path (Join-Path $akar "node_modules\esbuild")) -or
    -not (Test-Path (Join-Path $akar "node_modules\postject"))) {
  Write-Host "  [1/6] Memasang perkakas build (esbuild, postject)..."
  npm install --no-audit --no-fund
} else {
  Write-Host "  [1/6] Perkakas build sudah ada."
}

$esbuild = Join-Path $akar "node_modules\esbuild\bin\esbuild"
$postject = Join-Path $akar "node_modules\postject\dist\cli.js"
$nodeAsli = (node -p "process.execPath").Trim()
if (-not (Test-Path $esbuild)) { throw "esbuild tidak ditemukan di node_modules." }
if (-not (Test-Path $postject)) { throw "postject tidak ditemukan di node_modules." }
if (-not (Test-Path $nodeAsli)) { throw "node.exe tidak ditemukan: $nodeAsli" }

# 2. Gabungkan server menjadi satu berkas CJS
Write-Host "  [2/6] Menggabungkan server..."
New-Item -ItemType Directory -Force (Join-Path $akar "build") | Out-Null
& node $esbuild "server/index.js" `
  --bundle `
  --platform=node `
  --format=cjs `
  --target=node20 `
  --outfile="build/server.bundle.cjs" `
  --inject:"scripts/inject-exe.js" `
  --log-level=warning
if ($LASTEXITCODE -ne 0) { throw "Penggabungan gagal (esbuild)." }

# 3. Blob SEA
Write-Host "  [3/6] Menyiapkan blob SEA..."
& node "--experimental-sea-config" "scripts/sea-config.json"
if ($LASTEXITCODE -ne 0) { throw "Pembuatan blob SEA gagal." }

# 4. Salin node.exe, pasang ikon/info versi, lalu suntikkan blob SEA
Write-Host "  [4/6] Menyiapkan node.exe (ikon, info versi, blob)..."
$exe = Join-Path $akar "build\KumiDeck.exe"
if (Test-Path $exe) { Remove-Item $exe -Force }
Copy-Item $nodeAsli $exe -Force
Set-ItemProperty $exe -Name IsReadOnly -Value $false -ErrorAction SilentlyContinue

# Ikon dan informasi versi dipasang SEBELUM penyuntikan blob: rcedit menolak/
# menggantung pada exe yang sudah berisi blob SEA.
$rcedit = Join-Path $akar "node_modules\rcedit\bin\rcedit-x64.exe"
$ikon = Join-Path $akar "assets\icon.ico"
if ((Test-Path $rcedit) -and (Test-Path $ikon)) {
  Write-Host "         memasang ikon dan informasi versi..."
  & $rcedit $exe `
    --set-icon $ikon `
    --set-version-string ProductName "KumiDeck" `
    --set-version-string FileDescription "Papan tombol KumiDeck" `
    --set-version-string CompanyName "KumiDeck" `
    --set-version-string LegalCopyright "MIT License - 2026" `
    --set-file-version $versi `
    --set-product-version $versi
  if ($LASTEXITCODE -ne 0) { Write-Warning "Ikon/info versi gagal dipasang; exe tetap dibuat." }
} else {
  Write-Host "         rcedit tidak ada; ikon dilewati."
}

$signtool = (Get-Command signtool.exe -ErrorAction SilentlyContinue)
if ($signtool) {
  & $signtool.Source remove /s $exe 2>$null
}

Write-Host "         menyuntikkan blob SEA..."
& node $postject $exe NODE_SEA_BLOB "build/sea-prep.blob" `
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
if ($LASTEXITCODE -ne 0) { throw "Penyuntikan blob gagal (postject)." }

# 5. Susun folder portabel
Write-Host "  [5/6] Menyusun folder portabel..."
$dist = Join-Path $akar "_exe\KumiDeck"
if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Force $dist | Out-Null

Copy-Item $exe (Join-Path $dist "KumiDeck.exe") -Force
Copy-Item (Join-Path $akar "public") (Join-Path $dist "public") -Recurse -Force
if (Test-Path (Join-Path $akar "assets")) {
  Copy-Item (Join-Path $akar "assets") (Join-Path $dist "assets") -Recurse -Force
}
foreach ($berkas in @("README.md", "CHANGELOG.md", "LICENSE", "CONTRACT.md")) {
  $sumber = Join-Path $akar $berkas
  if (Test-Path $sumber) { Copy-Item $sumber $dist -Force }
}

$teksBaca = @"
KumiDeck $versi - versi portabel
================================

1. Letakkan folder ini di mana saja (boleh di USB). Jangan di Program Files
   karena Windows membatasi penulisan di sana.
2. Klik dua kali KumiDeck.exe.
3. Peramban terbuka otomatis di http://localhost:4173
4. Untuk Android: di aplikasi, klik "Pasangkan Android", lalu pindai kode QR.

Folder data dibuat otomatis di samping exe dan menyimpan papan serta kode
pasangan. Salin seluruh folder ini untuk memindahkannya ke komputer lain.

Tutup jendela konsol untuk menghentikan server.
"@
Set-Content (Join-Path $dist "BACA-INI.txt") -Value $teksBaca -Encoding UTF8

# 6. ZIP
Write-Host "  [6/6] Membuat ZIP..."
$zip = Join-Path $akar ("_exe\KumiDeck-" + $versi + "-portable.zip")
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $dist "*") -DestinationPath $zip -CompressionLevel Optimal

$ukuranExe = [math]::Round((Get-Item (Join-Path $dist "KumiDeck.exe")).Length / 1MB, 1)
$ukuranZip = [math]::Round((Get-Item $zip).Length / 1MB, 1)

Write-Host ""
Write-Host "  Selesai."
Write-Host "  Folder : $dist"
Write-Host "  ZIP    : $zip ($ukuranZip MB)"
Write-Host "  Exe    : $ukuranExe MB (berisi runtime Node.js + server)"
Write-Host ""
Write-Host "  Uji cepat: .\KumiDeck.exe  (Ctrl+C untuk berhenti)"
Write-Host ""
