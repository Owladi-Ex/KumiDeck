<#
    build-apk.ps1 - membangun APK KumiDeck Remote tanpa Gradle.

    Alur: aapt2 compile -> aapt2 link -> javac -> d8 -> sisipkan classes.dex
          -> zipalign -> apksigner.

    Contoh:
        .\android\build-apk.ps1
        .\android\build-apk.ps1 -Sdk "C:\Android\Sdk" -Jdk "C:\Java\jdk-17"

    Hasil: _rilis\KumiDeck-<versi>-remote.apk (ditandatangani kunci debug).
    Parameter -TanpaTandaTangan berguna untuk sekadar memeriksa build.
#>
[CmdletBinding()]
param(
    [string]$Sdk = "",
    [string]$Jdk = "",
    [string]$OutDir = "",
    [switch]$TanpaTandaTangan
)

$ErrorActionPreference = "Stop"

$FolderAndroid = $PSScriptRoot
$AkarRepo = Split-Path -Parent $FolderAndroid
$FolderBuild = Join-Path $FolderAndroid "build"
$FolderKelas = Join-Path $FolderBuild "classes"
$FolderDex = Join-Path $FolderBuild "dex"
$FolderRes = Join-Path $FolderBuild "res"
$Manifest = Join-Path $FolderAndroid "AndroidManifest.xml"
$IkonBiasa = Join-Path $AkarRepo "public\icons\icon-512.png"
$IkonMaskable = Join-Path $AkarRepo "public\icons\icon-maskable-512.png"

if (-not $OutDir) { $OutDir = Join-Path $AkarRepo "_rilis" }

function Langkah([string]$teks) {
    Write-Host ""
    Write-Host "==> $teks" -ForegroundColor Cyan
}

function Gagal([string]$teks) {
    throw "Build berhenti: $teks"
}

function Jalankan([string]$berkas, [string[]]$argumen) {
    & $berkas @argumen
    if ($LASTEXITCODE -ne 0) {
        Gagal "$([System.IO.Path]::GetFileName($berkas)) keluar dengan kode $LASTEXITCODE"
    }
}

function Versi-Baru([string]$a, [string]$b) {
    try { return ([version]$a).CompareTo([version]$b) -gt 0 } catch { return $false }
}

# --------------------------------------------------------------- cari SDK ---

function Cari-Sdk([string]$awal) {
    $kandidat = New-Object System.Collections.Generic.List[string]
    if ($awal) { $kandidat.Add($awal) }
    if ($env:ANDROID_HOME) { $kandidat.Add($env:ANDROID_HOME) }
    if ($env:ANDROID_SDK_ROOT) { $kandidat.Add($env:ANDROID_SDK_ROOT) }
    $kandidat.Add((Join-Path $env:LOCALAPPDATA "Android\Sdk"))
    $kandidat.Add((Join-Path $env:USERPROFILE "AppData\Local\Android\Sdk"))
    $kandidat.Add((Join-Path $env:TEMP "opencode\wheelink-toolchain\sdk"))
    $kandidat.Add("C:\Android\Sdk")
    $kandidat.Add("D:\Android\Sdk")

    foreach ($k in $kandidat) {
        if (-not $k) { continue }
        if ((Test-Path (Join-Path $k "build-tools")) -and (Test-Path (Join-Path $k "platforms"))) {
            return (Resolve-Path $k).Path
        }
    }
    Gagal "Android SDK tidak ditemukan. Set ANDROID_HOME atau jalankan: .\android\build-apk.ps1 -Sdk `"C:\path\ke\Sdk`""
}

function Cari-Jdk([string]$awal) {
    $kandidat = New-Object System.Collections.Generic.List[string]
    if ($awal) { $kandidat.Add($awal) }
    if ($env:JAVA_HOME) { $kandidat.Add($env:JAVA_HOME) }
    $toolchainJdk = Join-Path $env:TEMP "opencode\wheelink-toolchain\jdk"
    if (Test-Path $toolchainJdk) {
        Get-ChildItem $toolchainJdk -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name |
            ForEach-Object { $kandidat.Add($_.FullName) }
    }
    foreach ($akar in @("$env:ProgramFiles\Eclipse Adoptium", "$env:ProgramFiles\Java", "$env:ProgramFiles\Microsoft", "$env:USERPROFILE\.jdks")) {
        if (Test-Path $akar) {
            Get-ChildItem $akar -Directory -ErrorAction SilentlyContinue |
                Sort-Object Name -Descending |
                ForEach-Object { $kandidat.Add($_.FullName) }
        }
    }

    foreach ($k in $kandidat) {
        if (-not $k) { continue }
        if (Test-Path (Join-Path $k "bin\javac.exe")) { return (Resolve-Path $k).Path }
    }
    Gagal "JDK 17 tidak ditemukan. Set JAVA_HOME atau jalankan: .\android\build-apk.ps1 -Jdk `"C:\path\ke\jdk-17`""
}

# ------------------------------------------------------------------ ikon ---

function Muat-Gambar([string]$jalur) {
    if (-not (Test-Path $jalur)) { Gagal "Ikon sumber tidak ada: $jalur" }
    return [System.Drawing.Image]::FromFile((Resolve-Path $jalur).Path)
}

function Simpan-Ikon([System.Drawing.Image]$sumber, [int]$ukuran, [string]$tujuan, [bool]$bulat) {
    $bmp = New-Object System.Drawing.Bitmap($ukuran, $ukuran, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        # Sudut ikon lama tetap putih, bukan gelap, supaya tidak tampak terpotong
        # di peluncur yang tidak memasang topeng.
        $g.Clear([System.Drawing.Color]::White)
        if ($bulat) {
            $jalur = New-Object System.Drawing.Drawing2D.GraphicsPath
            $jalur.AddEllipse(0, 0, $ukuran, $ukuran)
            $g.SetClip($jalur)
            $jalur.Dispose()
        }
        $g.DrawImage($sumber, 0, 0, $ukuran, $ukuran)
    } finally {
        $g.Dispose()
    }
    $bmp.Save($tujuan, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

# Lapisan depan adaptive icon: kanvas 108 dp dengan zona aman lingkaran 66 dp.
# Seni diperkecil ke 70% kanvas supaya keempat sudut kotak tidak terpotong
# topeng bulat peluncur (peluncur memotong lingkaran ~66 dp dari tengah).
function Simpan-LapisanDepan([System.Drawing.Image]$sumber, [int]$ukuran, [string]$tujuan) {
    $bmp = New-Object System.Drawing.Bitmap($ukuran, $ukuran, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.Clear([System.Drawing.Color]::Transparent)
        $s = [int][Math]::Round($ukuran * 0.70)
        $o = [int][Math]::Floor(($ukuran - $s) / 2)
        $g.DrawImage($sumber, $o, $o, $s, $s)
    } finally {
        $g.Dispose()
    }
    $bmp.Save($tujuan, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

function Siapkan-Ikon {
    Langkah "Menyiapkan ikon peluncur"
    Add-Type -AssemblyName System.Drawing
    $biasa = Muat-Gambar $IkonBiasa
    $maskable = Muat-Gambar $IkonMaskable
    try {
        # Ikon lama (sebelum Android 8): 48 sampai 192 px.
        $kepadatan = @(
            @{ nama = "mdpi"; ukuran = 48 },
            @{ nama = "hdpi"; ukuran = 72 },
            @{ nama = "xhdpi"; ukuran = 96 },
            @{ nama = "xxhdpi"; ukuran = 144 },
            @{ nama = "xxxhdpi"; ukuran = 192 }
        )
        foreach ($k in $kepadatan) {
            $folder = Join-Path $FolderRes ("mipmap-" + $k.nama)
            New-Item -ItemType Directory -Force $folder | Out-Null
            Simpan-Ikon $biasa $k.ukuran (Join-Path $folder "ic_launcher.png") $false
            Simpan-Ikon $maskable $k.ukuran (Join-Path $folder "ic_launcher_round.png") $true
        }

        # Lapisan depan ikon adaptif (Android 8+): kanvas 108 dp.
        $kepadatanAdaptif = @(
            @{ nama = "mdpi"; ukuran = 108 },
            @{ nama = "hdpi"; ukuran = 162 },
            @{ nama = "xhdpi"; ukuran = 216 },
            @{ nama = "xxhdpi"; ukuran = 324 },
            @{ nama = "xxxhdpi"; ukuran = 432 }
        )
        foreach ($k in $kepadatanAdaptif) {
            $folder = Join-Path $FolderRes ("mipmap-" + $k.nama)
            New-Item -ItemType Directory -Force $folder | Out-Null
            Simpan-LapisanDepan $maskable $k.ukuran (Join-Path $folder "ic_launcher_foreground.png")
        }
    } finally {
        $biasa.Dispose()
        $maskable.Dispose()
    }
}

# --------------------------------------------------------------- keystore ---

function Siapkan-Keystore {
    $tujuan = Join-Path $env:USERPROFILE ".android\debug.keystore"
    if (Test-Path $tujuan) { return $tujuan }

    Langkah "Membuat kunci debug di $tujuan"
    New-Item -ItemType Directory -Force (Split-Path $tujuan) | Out-Null
    Jalankan "keytool" @(
        "-genkeypair",
        "-keystore", $tujuan,
        "-storepass", "android",
        "-keypass", "android",
        "-alias", "androiddebugkey",
        "-keyalg", "RSA",
        "-keysize", "2048",
        "-validity", "10000",
        "-dname", "CN=Android Debug,O=Android,C=US"
    )
    return $tujuan
}

# ------------------------------------------------------------------ mulai ---

$Sdk = Cari-Sdk $Sdk
$Jdk = Cari-Jdk $Jdk

$buildTools = Get-ChildItem (Join-Path $Sdk "build-tools") -Directory |
    Where-Object { Test-Path (Join-Path $_.FullName "aapt2.exe") } |
    Sort-Object { try { [version]$_.Name } catch { [version]"0.0.0" } } -Descending |
    Select-Object -First 1
if (-not $buildTools) { Gagal "build-tools Android tidak ditemukan di $Sdk" }

$platform = Get-ChildItem (Join-Path $Sdk "platforms") -Directory |
    Where-Object { Test-Path (Join-Path $_.FullName "android.jar") } |
    Sort-Object { try { [int]($_.Name -replace "[^0-9]", "") } catch { 0 } } -Descending |
    Select-Object -First 1
if (-not $platform) { Gagal "platform Android (android.jar) tidak ditemukan di $Sdk" }

$aapt2 = Join-Path $buildTools.FullName "aapt2.exe"
$d8 = Join-Path $buildTools.FullName "d8.bat"
$zipalign = Join-Path $buildTools.FullName "zipalign.exe"
$apksigner = Join-Path $buildTools.FullName "apksigner.bat"
$androidJar = Join-Path $platform.FullName "android.jar"

foreach ($alat in @($aapt2, $d8, $zipalign, $apksigner, $androidJar)) {
    if (-not (Test-Path $alat)) { Gagal "Alat build tidak ada: $alat" }
}

$env:JAVA_HOME = $Jdk
$env:PATH = (Join-Path $Jdk "bin") + ";" + $env:PATH

$isiManifest = Get-Content $Manifest -Raw
$versi = "0.0.0"
$kodeVersi = "1"
if ($isiManifest -match 'android:versionName="([^"]+)"') { $versi = $Matches[1] }
if ($isiManifest -match 'android:versionCode="([^"]+)"') { $kodeVersi = $Matches[1] }

Write-Host "KumiDeck Remote $versi ($kodeVersi)"
Write-Host "  SDK        : $Sdk"
Write-Host "  build-tools: $($buildTools.Name)"
Write-Host "  platform   : $($platform.Name)"
Write-Host "  JDK        : $Jdk"

Langkah "Membersihkan folder build"
if (Test-Path $FolderBuild) { Remove-Item $FolderBuild -Recurse -Force }
New-Item -ItemType Directory -Force $FolderRes, $FolderKelas, $FolderDex | Out-Null
Copy-Item -Path (Join-Path (Join-Path $FolderAndroid "res") "*") -Destination $FolderRes -Recurse -Force
Siapkan-Ikon

Langkah "aapt2 compile"
$resZip = Join-Path $FolderBuild "res.zip"
Jalankan $aapt2 @("compile", "--dir", $FolderRes, "-o", $resZip)

Langkah "aapt2 link"
$apkBelum = Join-Path $FolderBuild "belum-tanda-tangan.apk"
Jalankan $aapt2 @(
    "link",
    "-o", $apkBelum,
    "-I", $androidJar,
    "--manifest", $Manifest,
    "-R", $resZip,
    "--auto-add-overlay",
    "--min-sdk-version", "24",
    "--target-sdk-version", "34",
    "--version-code", $kodeVersi,
    "--version-name", $versi
)

Langkah "javac"
$sumber = Get-ChildItem (Join-Path $FolderAndroid "src") -Recurse -Filter *.java |
    ForEach-Object { $_.FullName }
if (-not $sumber) { Gagal "Tidak ada berkas .java di $(Join-Path $FolderAndroid 'src')" }

# Pustaka pihak ketiga (ZXing untuk decoder kode QR), disimpan di android/libs.
$folderLibs = Join-Path $FolderAndroid "libs"
$pustaka = @()
if (Test-Path $folderLibs) {
    $pustaka = Get-ChildItem $folderLibs -Filter *.jar | ForEach-Object { $_.FullName }
}

$argumenJavac = @(
    "-encoding", "UTF-8",
    "-source", "8",
    "-target", "8",
    "-bootclasspath", $androidJar,
    "-Xlint:-options",
    "-d", $FolderKelas
)
if ($pustaka.Count -gt 0) { $argumenJavac += @("-cp", ($pustaka -join ";")) }
Jalankan "javac" ($argumenJavac + $sumber)

Langkah "d8"
$kelas = Get-ChildItem $FolderKelas -Recurse -Filter *.class | ForEach-Object { $_.FullName }
if (-not $kelas) { Gagal "javac tidak menghasilkan berkas .class" }
Jalankan $d8 (@(
    "--release",
    "--min-api", "24",
    "--lib", $androidJar,
    "--output", $FolderDex
) + $pustaka + $kelas)

$dex = Join-Path $FolderDex "classes.dex"
if (-not (Test-Path $dex)) { Gagal "d8 tidak menghasilkan classes.dex" }

Langkah "Menyisipkan classes.dex dan merapikan resources.arsc"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Tulis-Simpan([System.IO.Compression.ZipArchive]$zip, [string]$nama, [byte[]]$isi) {
    $lama = $zip.GetEntry($nama)
    if ($lama) { $lama.Delete() }
    $baru = $zip.CreateEntry($nama, [System.IO.Compression.CompressionLevel]::NoCompression)
    $alir = $baru.Open()
    try { $alir.Write($isi, 0, $isi.Length) } finally { $alir.Dispose() }
}

$zip = [System.IO.Compression.ZipFile]::Open($apkBelum, [System.IO.Compression.ZipArchiveMode]::Update)
try {
    foreach ($nama in @("resources.arsc", "AndroidManifest.xml")) {
        $entri = $zip.GetEntry($nama)
        if ($entri -and $entri.CompressedLength -ne $entri.Length) {
            $penyangga = New-Object System.IO.MemoryStream
            $alirEntri = $entri.Open()
            try { $alirEntri.CopyTo($penyangga) } finally { $alirEntri.Dispose() }
            Tulis-Simpan $zip $nama $penyangga.ToArray()
            $penyangga.Dispose()
        }
    }
    Tulis-Simpan $zip "classes.dex" ([System.IO.File]::ReadAllBytes($dex))
} finally {
    $zip.Dispose()
}

Langkah "zipalign"
$apkRata = Join-Path $FolderBuild "rata.apk"
Jalankan $zipalign @("-f", "-p", "4", $apkBelum, $apkRata)

if ($TanpaTandaTangan) {
    $apkAkhir = $apkRata
} else {
    $keystore = Siapkan-Keystore
    Langkah "apksigner"
    $apkAkhir = Join-Path $FolderBuild "bertanda-tangan.apk"
    Jalankan $apksigner @(
        "sign",
        "--ks", $keystore,
        "--ks-key-alias", "androiddebugkey",
        "--ks-pass", "pass:android",
        "--key-pass", "pass:android",
        "--out", $apkAkhir,
        $apkRata
    )
    Jalankan $apksigner @("verify", "--verbose", "--print-certs", $apkAkhir)
}

Langkah "Menyalin hasil"
New-Item -ItemType Directory -Force $OutDir | Out-Null
$namaHasil = "KumiDeck-$versi-remote.apk"
if ($TanpaTandaTangan) { $namaHasil = "KumiDeck-$versi-remote-tanpa-tanda.apk" }
$hasil = Join-Path $OutDir $namaHasil
Copy-Item $apkAkhir $hasil -Force

$sha = (Get-FileHash $hasil -Algorithm SHA256).Hash.ToLowerInvariant()
$ukuran = [math]::Round((Get-Item $hasil).Length / 1KB, 1)

Write-Host ""
Write-Host "Selesai: $hasil" -ForegroundColor Green
Write-Host "  ukuran : $ukuran KB"
Write-Host "  sha256 : $sha"
