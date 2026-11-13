/* Ikon asli aplikasi terpasang.

   Mengambil ikon dari berkas .exe (atau dari pintasan .lnk yang ditunjuk) lewat
   System.Drawing, lalu menyimpannya sebagai PNG 128×128 di folder ikon aplikasi
   (`data/ikon`) supaya bisa dipakai tombol papan lewat rute `/ikon/<id>`.

   Tanpa dependensi: satu proses PowerShell per ekstraksi, dengan cache memori
   agar aplikasi yang sama tidak diekstrak berulang. */

import { spawn } from "node:child_process";
import { envPowerShell } from "./ps.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const AKAR = (() => {
  if (process.env.KD_ROOT) return path.resolve(process.env.KD_ROOT);
  if (globalThis.__KD_BASE) return path.resolve(globalThis.__KD_BASE);
  try {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  } catch (err) {
    return path.dirname(process.execPath);
  }
})();
const DIR_IKON_BAWAAN = path.join(AKAR, "data", "ikon");

const UMUR_CACHE_MS = 10 * 60 * 1000;
const cache = new Map(); /* target -> { hasil, kedaluwarsa } */

/* Nama berkas ikon harus lolos pola rute /ikon/<id> di server. */
function idUntuk(target) {
  return "kst_" + crypto.createHash("sha1").update(String(target)).digest("hex").slice(0, 8);
}

/* Skrip PowerShell: resolusi target → ekstrak ikon → simpan PNG 128×128. */
function skripEkstrak(jalur, tujuan) {
  const q = (v) => "'" + String(v).replace(/'/g, "''") + "'";
  return `
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$sumber = ${q(jalur)}
$tujuan = ${q(tujuan)}
if (-not (Test-Path $sumber)) { Write-Output '{"ok":false,"alasan":"Berkas aplikasi tidak ditemukan."}'; exit 0 }

$ikon = $null
try {
  $ikon = New-Object System.Drawing.Icon($sumber, 128, 128)
} catch {
  try { $ikon = [System.Drawing.Icon]::ExtractAssociatedIcon($sumber) } catch { $ikon = $null }
}
if (-not $ikon) { Write-Output '{"ok":false,"alasan":"Ikon aplikasi tidak dapat dibaca."}'; exit 0 }

$asli = $ikon.ToBitmap()
$lebar = 128
$tinggi = 128
$bitmap = New-Object System.Drawing.Bitmap($lebar, $tinggi)
$grafis = [System.Drawing.Graphics]::FromImage($bitmap)
$grafis.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$grafis.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$grafis.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$grafis.Clear([System.Drawing.Color]::Transparent)
$grafis.DrawImage($asli, 0, 0, $lebar, $tinggi)
$grafis.Dispose()
$bitmap.Save($tujuan, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()
$asli.Dispose()
$ikon.Dispose()
Write-Output ('{"ok":true,"lebar":' + $lebar + ',"tinggi":' + $tinggi + '}')
`;
}

/* Jalankan skrip lewat berkas sementara ber-BOM (PowerShell 5.1 salah membaca
   here-string/C# tanpa BOM) lalu kembalikan objek JSON baris terakhir. */
function jalankanSkrip(skrip, batasMs = 15000) {
  const berkas = path.join(os.tmpdir(), "kumideck-ikon-" + crypto.randomBytes(4).toString("hex") + ".ps1");
  try {
    fs.writeFileSync(berkas, "\ufeff" + skrip.replace(/\r\n/g, "\n"), "utf8");
  } catch (err) {
    return Promise.resolve({ ok: false, alasan: "Skrip ikon tidak dapat disiapkan." });
  }

  return new Promise((resolve) => {
    let anak;
    let selesai = false;
    let keluaran = "";
    let galat = "";
    const bersihkan = () => {
      try {
        fs.rmSync(berkas, { force: true });
      } catch (err) {
        /* diabaikan */
      }
    };
    try {
      anak = spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", berkas],
        { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: envPowerShell() }
      );
    } catch (err) {
      bersihkan();
      resolve({ ok: false, alasan: "PowerShell tidak dapat dijalankan." });
      return;
    }
    anak.stdout.setEncoding("utf8");
    anak.stderr.setEncoding("utf8");
    anak.stdout.on("data", (d) => {
      keluaran += d;
    });
    anak.stderr.on("data", (d) => {
      galat += d;
    });
    const jam = setTimeout(() => {
      if (selesai) return;
      selesai = true;
      try {
        anak.kill();
      } catch (err) {
        /* diabaikan */
      }
      bersihkan();
      resolve({ ok: false, alasan: "Ekstraksi ikon melebihi waktu tunggu." });
    }, batasMs);
    anak.on("error", () => {
      if (selesai) return;
      selesai = true;
      clearTimeout(jam);
      bersihkan();
      resolve({ ok: false, alasan: "PowerShell tidak dapat dijalankan." });
    });
    anak.on("close", () => {
      if (selesai) return;
      selesai = true;
      clearTimeout(jam);
      bersihkan();
      const baris = keluaran
        .split(/\r?\n/)
        .map((b) => b.trim())
        .filter(Boolean);
      for (let i = baris.length - 1; i >= 0; i -= 1) {
        try {
          resolve(JSON.parse(baris[i]));
          return;
        } catch (err) {
          /* cari baris JSON berikutnya */
        }
      }
      resolve({ ok: false, alasan: "Ikon tidak dapat diekstrak. " + (galat.split(/\r?\n/)[0] || "") });
    });
  });
}

/* Perluas %VAR%, dan resolusi .lnk ke target sebenarnya. */
function perluas(jalur) {
  return String(jalur).replace(/%([^%]+)%/g, (utuh, nama) => process.env[nama] ?? utuh);
}

function resolusiLnk(jalur) {
  const q = (v) => "'" + String(v).replace(/'/g, "''") + "'";
  return jalankanSkrip(
    `
$ErrorActionPreference = "Stop"
$sh = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut(${q(jalur)})
if ($lnk.TargetPath) { Write-Output ('{"ok":true,"target":' + ($lnk.TargetPath | ConvertTo-Json) + '}') }
else { Write-Output '{"ok":false,"alasan":"Pintasan tidak menunjuk berkas."}' }
`,
    8000
  ).then((hasil) => (hasil && hasil.ok ? hasil.target : ""));
}

/* Peta aplikasi terkenal yang targetnya protokol/URI (bukan .exe). */
const PETA_PROTOKOL = {
  "spotify:": ["%APPDATA%\\Spotify\\Spotify.exe"],
  "discord:": ["%LOCALAPPDATA%\\Discord\\Update.exe", "%LOCALAPPDATA%\\Discord\\app-*"],
  "steam:": ["C:\\Program Files (x86)\\Steam\\steam.exe"],
};

async function cariExe(target) {
  if (!target) return "";
  if (/^https?:/i.test(target)) return "";

  if (PETA_PROTOKOL[target]) {
    for (const calon of PETA_PROTOKOL[target]) {
      const panjang = perluas(calon);
      if (panjang.includes("*")) continue;
      if (fs.existsSync(panjang)) return panjang;
    }
  }

  /* UWP / protocol lain: tidak ada exe yang bisa diekstrak. */
  if (/^shell:/i.test(target) || /^[a-z][a-z0-9+.-]*:$/i.test(target)) return "";

  const jalur = perluas(target);
  if (!jalur) return "";
  if (/\.lnk$/i.test(jalur) && fs.existsSync(jalur)) {
    const dituju = await resolusiLnk(jalur);
    if (dituju && fs.existsSync(dituju)) return dituju;
    return "";
  }
  if (jalur.includes("\\") || jalur.includes("/")) {
    return fs.existsSync(jalur) ? jalur : "";
  }

  /* Nama aplikasi di PATH (mis. notepad). */
  const berkasPath = process.env.PATH || "";
  for (const dir of berkasPath.split(";")) {
    if (!dir) continue;
    for (const ext of [".exe", ""]) {
      const calon = path.join(dir, jalur.endsWith(ext) ? jalur : jalur + ext);
      try {
        if (fs.existsSync(calon)) return calon;
      } catch (err) {
        /* lanjut */
      }
    }
  }
  return "";
}

/* --------------------------------------------------------------- publik --- */
/* target: jalur .exe/.lnk, nama di PATH, atau protokol (spotify:, steam:). */
export async function ikonAplikasi(target, opsi = {}) {
  const mentah = String(target || "").trim();
  if (!mentah) return { ok: false, alasan: "Target aplikasi kosong." };

  const tersimpan = cache.get(mentah);
  if (tersimpan && Date.now() < tersimpan.kedaluwarsa) return tersimpan.hasil;

  if (process.platform !== "win32") {
    return { ok: false, alasan: "Ikon aplikasi hanya tersedia di Windows." };
  }

  const exe = await cariExe(mentah);
  if (!exe) {
    const hasil = { ok: false, alasan: "Aplikasi ini tidak punya berkas .exe yang bisa dibaca ikonnya." };
    cache.set(mentah, { hasil, kedaluwarsa: Date.now() + UMUR_CACHE_MS });
    return hasil;
  }

  const id = idUntuk(mentah + "|" + exe);
  const tujuan = path.join(opsi.tujuanDir || DIR_IKON_BAWAAN, id + ".png");
  if (fs.existsSync(tujuan) && fs.statSync(tujuan).size > 0) {
    const hasil = { ok: true, id, berkas: tujuan, lebar: 128, tinggi: 128, sumber: "exe", exe };
    cache.set(mentah, { hasil, kedaluwarsa: Date.now() + UMUR_CACHE_MS });
    return hasil;
  }

  try {
    fs.mkdirSync(path.dirname(tujuan), { recursive: true });
  } catch (err) {
    return { ok: false, alasan: "Folder ikon tidak dapat dibuat." };
  }

  const keluaran = await jalankanSkrip(skripEkstrak(exe, tujuan));
  if (!keluaran || !keluaran.ok) {
    const hasil = { ok: false, alasan: (keluaran && keluaran.alasan) || "Ikon tidak dapat diekstrak." };
    cache.set(mentah, { hasil, kedaluwarsa: Date.now() + UMUR_CACHE_MS });
    return hasil;
  }

  const hasil = {
    ok: true,
    id,
    berkas: tujuan,
    lebar: Number(keluaran.lebar) || 128,
    tinggi: Number(keluaran.tinggi) || 128,
    sumber: "exe",
    exe,
  };
  cache.set(mentah, { hasil, kedaluwarsa: Date.now() + UMUR_CACHE_MS });
  return hasil;
}

export function hapusCache() {
  cache.clear();
}

/* Ekstrak beberapa target berurutan (dibatasi 40 agar tidak membanjiri proses). */
export async function ikonBanyak(daftarTarget) {
  const daftar = Array.isArray(daftarTarget) ? daftarTarget.slice(0, 40) : [];
  const hasil = [];
  for (const target of daftar) {
    const satu = await ikonAplikasi(target);
    hasil.push({ target, ...satu });
  }
  return hasil;
}

export { DIR_IKON_BAWAAN, idUntuk };


