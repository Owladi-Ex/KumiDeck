/* Pembaca media yang sedang diputar di Windows.

   Memakai satu proses PowerShell yang hidup lama (bukan spawn tiap detik) untuk
   membaca GlobalSystemMediaTransportControlsSessionManager — API yang dipakai
   panel media Windows. Proses menulis satu baris JSON setiap kali keadaan
   berubah, sehingga hemat CPU dan langsung terasa di papan.

   Bila PowerShell atau API WinRT tidak tersedia, modul ini tetap aman:
   melaporkan "tidak ada media" tanpa melempar galat. */

import { spawn } from "node:child_process";

/* Skrip PowerShell. Ditulis dengan String.raw agar tidak perlu escape; jangan
   memakai backtick atau ${ di dalamnya. */
const SKRIP = String.raw`
$ErrorActionPreference = "Stop"
try { Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null } catch { }

$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*'
})[0]

function Await($op, $tipe) {
  $t = $asTask.MakeGenericMethod($tipe).Invoke($null, @($op))
  $t.Wait(1500) | Out-Null
  return $t.Result
}

$tipeManajer = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$manajer = Await ($tipeManajer::RequestAsync()) $tipeManajer

$terakhir = ""
while ($true) {
  try {
    $sesi = $manajer.GetCurrentSession()
    if (-not $sesi) {
      $keluar = '{"ada":false,"status":"tertutup"}'
    } else {
      $properti = Await ($sesi.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime])
      $putar = $sesi.GetPlaybackInfo()
      $keluar = (@{
        ada = $true
        judul = [string]$properti.Title
        artis = [string]$properti.Artist
        album = [string]$properti.AlbumTitle
        status = [string]$putar.PlaybackStatus
        app = [string]$sesi.SourceAppUserModelId
      } | ConvertTo-Json -Compress)
    }
  } catch {
    $keluar = '{"ada":false,"status":"galat"}'
  }
  if ($keluar -ne $terakhir) {
    [Console]::Out.WriteLine($keluar)
    [Console]::Out.Flush()
    $terakhir = $keluar
  }
  Start-Sleep -Milliseconds 1200
}
`;

const KOSONG = Object.freeze({
  ada: false,
  judul: "",
  artis: "",
  album: "",
  status: "tertutup",
  app: "",
});

let keadaan = KOSONG;
let proses = null;
let menungguMati = false;
let dihentikan = false; /* true bila penghentian diminta, bukan crash */

function olahBaris(baris) {
  try {
    const data = JSON.parse(baris);
    if (!data.ada) {
      keadaan = KOSONG;
      return;
    }
    keadaan = {
      ada: true,
      judul: String(data.judul || "").slice(0, 120),
      artis: String(data.artis || "").slice(0, 80),
      album: String(data.album || "").slice(0, 80),
      status: String(data.status || "").toLowerCase(),
      app: String(data.app || "").slice(0, 80),
    };
  } catch (err) {
    /* baris rusak: abaikan */
  }
}

export function mulaiPembacaMedia() {
  if (proses || menungguMati) return;
  dihentikan = false;
  if (process.platform !== "win32") return;

  let anak;
  try {
    anak = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SKRIP],
      { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }
    );
  } catch (err) {
    return;
  }
  proses = anak;

  let sisa = "";
  anak.stdout.setEncoding("utf8");
  anak.stdout.on("data", (potongan) => {
    sisa += potongan;
    const baris = sisa.split(/\r?\n/);
    sisa = baris.pop() || "";
    for (const b of baris) {
      if (b.trim()) olahBaris(b.trim());
    }
  });
  anak.on("error", () => {
    proses = null;
  });
  anak.on("close", () => {
    proses = null;
    keadaan = KOSONG;
    /* Jangan hidupkan lagi bila kita sendiri yang menghentikannya; tanpa cek
       ini hentikanPembacaMedia() justru memicu proses baru 8 dtk kemudian. */
    if (dihentikan) return;
    /* Hidupkan lagi bila mati (mis. setelah pembaruan Windows). */
    menungguMati = true;
    setTimeout(() => {
      menungguMati = false;
      mulaiPembacaMedia();
    }, 8000).unref();
  });
}

export function hentikanPembacaMedia() {
  dihentikan = true;
  if (!proses) return;
  try {
    proses.kill();
  } catch (err) {
    /* diabaikan */
  }
  proses = null;
  keadaan = KOSONG;
}

/* Apakah proses pembaca sedang hidup. */
export function sedangJalan() {
  return !!proses;
}

export function infoMedia() {
  return keadaan;
}

export { KOSONG };

