/* Jalan otomatis saat Windows menyala (#6).

   Windows tidak mengizinkan aplikasi non-elevasi menulis ke folder Startup
   sistem, jadi "mulai otomatis" memakai daftar "Startup Apps" milik pengguna
   (HKCU\...\Explorer\StartupApproved\StartupFolder). Cara yang paling andal dan
   tidak perlu hak admin: menaruh pintasan .lnk di folder Startup pengguna
   (%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup).

   Modul ini membuat/menghapus pintasan itu dengan WScript.Shell. */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function folderStartup() {
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
}

function berkasPintasan() {
  return path.join(folderStartup(), "KumiDeck.lnk");
}

export function statusMulaiOtomatis() {
  try {
    return fs.existsSync(berkasPintasan());
  } catch (err) {
    return false;
  }
}

/* target: jalur program yang dijalankan (node.exe / KumiDeck.exe), argumen,
   folder kerja. Pintasan memakai `-WindowStyle Hidden` bila berupa node.exe
   supaya tidak muncul jendela konsol saat Windows menyala. */
export function aturMulaiOtomatis(aktif, { target, argumen, folderKerja }) {
  if (process.platform !== "win32") {
    return Promise.resolve({ ok: false, alasan: "Fitur ini hanya tersedia di Windows." });
  }
  const pintasan = berkasPintasan();
  if (!aktif) {
    try {
      fs.rmSync(pintasan, { force: true });
      return Promise.resolve({ ok: true, aktif: false, berkas: pintasan });
    } catch (err) {
      return Promise.resolve({ ok: false, alasan: "Pintasan tidak dapat dihapus: " + err.message });
    }
  }

  try {
    fs.mkdirSync(folderStartup(), { recursive: true });
  } catch (err) {
    return Promise.resolve({ ok: false, alasan: "Folder Startup tidak dapat dibuat: " + err.message });
  }

  const skrip = [
    "$ErrorActionPreference = 'Stop'",
    "$sh = New-Object -ComObject WScript.Shell",
    "$lnk = $sh.CreateShortcut(" + kutip(pintasan) + ")",
    "$lnk.TargetPath = " + kutip(target),
    "$lnk.Arguments = " + kutip(argumen || ""),
    "$lnk.WorkingDirectory = " + kutip(folderKerja || path.dirname(target)),
    "$lnk.WindowStyle = 7",
    "$lnk.Description = 'KumiDeck — papan tombol'",
    "$lnk.Save()",
    "Write-Output 'ok'",
  ].join("\n");

  return new Promise((resolve) => {
    let anak;
    try {
      anak = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", skrip], {
        windowsHide: true,
        stdio: ["ignore", "ignore", "pipe"],
      });
    } catch (err) {
      resolve({ ok: false, alasan: "PowerShell tidak dapat dijalankan." });
      return;
    }
    let galat = "";
    anak.stderr.setEncoding("utf8");
    anak.stderr.on("data", (d) => (galat += d));
    anak.on("error", () => resolve({ ok: false, alasan: "PowerShell tidak dapat dijalankan." }));
    anak.on("exit", (kode) => {
      if (kode === 0 && fs.existsSync(pintasan)) {
        resolve({ ok: true, aktif: true, berkas: pintasan });
      } else {
        resolve({ ok: false, alasan: "Pintasan gagal dibuat. " + (galat.split(/\r?\n/)[0] || "") });
      }
    });
  });
}

function kutip(nilai) {
  return "'" + String(nilai).replace(/'/g, "''") + "'";
}
