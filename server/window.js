/* Pengamat jendela depan di Windows (#16 auto-profil, #17 aksi kondisional,
   #20 penanda status tombol).

   Satu proses PowerShell hidup lama membaca proses yang memiliki jendela depan
   lewat Win32 (GetForegroundWindow + GetWindowThreadProcessId), lalu mencetak
   satu baris JSON setiap kali keadaan berubah. Tidak butuh dependensi native. */

import { spawn } from "node:child_process";
import { infoMedia } from "./media.js";

const SKRIP = String.raw`
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class KumiWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder teks, int maks);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
}
'@

$terakhir = ""
while ($true) {
  try {
    $hwnd = [KumiWin]::GetForegroundWindow()
    $keluar = '{"ada":false}'
    if ($hwnd -ne [IntPtr]::Zero -and [KumiWin]::IsWindowVisible($hwnd)) {
      $nomor = 0
      [void][KumiWin]::GetWindowThreadProcessId($hwnd, [ref]$nomor)
      $proses = Get-Process -Id $nomor -ErrorAction SilentlyContinue
      $judul = New-Object System.Text.StringBuilder 512
      [void][KumiWin]::GetWindowTextW($hwnd, $judul, 512)
      $keluar = (@{
        ada = $true
        pid = [int]$nomor
        proses = [string]$proses.ProcessName
        judul = [string]$judul.ToString()
      } | ConvertTo-Json -Compress)
    }
  } catch {
    $keluar = '{"ada":false}'
  }
  if ($keluar -ne $terakhir) {
    [Console]::Out.WriteLine($keluar)
    [Console]::Out.Flush()
    $terakhir = $keluar
  }
  Start-Sleep -Milliseconds 1200
}
`;

const KOSONG = Object.freeze({ ada: false, proses: "", judul: "", pid: 0 });

let jendela = KOSONG;
let proses = null;
let menungguMati = false;
let pendengar = new Set();

function olahBaris(baris) {
  let data;
  try {
    data = JSON.parse(baris);
  } catch (err) {
    return;
  }
  const sebelum = jendela;
  jendela = data.ada
    ? {
        ada: true,
        proses: String(data.proses || "").toLowerCase(),
        judul: String(data.judul || ""),
        pid: Number(data.pid) || 0,
      }
    : KOSONG;
  if (sebelum.proses !== jendela.proses || sebelum.judul !== jendela.judul) {
    for (const fn of pendengar) {
      try {
        fn(jendela);
      } catch (err) {
        /* diabaikan */
      }
    }
  }
}

export function mulaiPengamatJendela() {
  if (proses || menungguMati) return;
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
    for (const b of baris) if (b.trim()) olahBaris(b.trim());
  });
  anak.on("error", () => {
    proses = null;
  });
  anak.on("close", () => {
    proses = null;
    jendela = KOSONG;
    menungguMati = true;
    setTimeout(() => {
      menungguMati = false;
      mulaiPengamatJendela();
    }, 8000).unref();
  });
}

export function hentikanPengamatJendela() {
  if (proses) {
    try {
      proses.kill();
    } catch (err) {
      /* diabaikan */
    }
  }
  proses = null;
  jendela = KOSONG;
}

export function infoJendela() {
  return jendela;
}

export function saatJendelaBerubah(fn) {
  pendengar.add(fn);
  return () => pendengar.delete(fn);
}

/* ------------------------------------------------------------- cocok ----- */
/* Cocokkan aturan { proses, jendela } dengan jendela depan. Aturan kosong
   dianggap tidak cocok (jangan sampai selalu menyala). */
export function cocokJendela(aturan, sekarang = jendela) {
  if (!aturan || !sekarang || !sekarang.ada) return false;
  const proses = String(aturan.proses || "").toLowerCase().trim();
  const jendela = String(aturan.jendela || "").toLowerCase().trim();
  if (!proses && !jendela) return false;
  const prosesSekarang = (sekarang.proses || "").replace(/\.exe$/i, "");
  const judulSekarang = String(sekarang.judul || "").toLowerCase();
  if (proses && !prosesSekarang.includes(proses.replace(/\.exe$/i, ""))) return false;
  if (jendela && !judulSekarang.includes(jendela)) return false;
  return true;
}

/* Nilai sebenarnya dari sebuah syarat: jendela cocok ATAU media diputar oleh
   aplikasi tertentu (dua-duanya boleh diisi). */
export function cocokSyarat(syarat, jendelaSekarang = jendela) {
  if (!syarat) return false;
  let cocok = false;
  if (syarat.proses || syarat.jendela) {
    /* Bila hanya "proses" diisi dan media sedang diputar aplikasi tsb.,
       anggap cocok juga (mis. audio Spotify tanpa jendela depan). */
    cocok = cocokJendela(syarat, jendelaSekarang);
    if (!cocok && syarat.proses) {
      const media = infoMedia();
      if (media.ada) {
        const app = String(media.app || "").toLowerCase();
        if (app.includes(String(syarat.proses).toLowerCase().replace(/\.exe$/i, ""))) cocok = true;
      }
    }
  }
  return cocok;
}

export { KOSONG };
