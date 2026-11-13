/* Jendela aplikasi sendiri (tanpa bilah alamat/tab peramban).

   KumiDeck tetap berupa server lokal + UI web, tetapi UI desktop dibuka sebagai
   **jendela aplikasi**: peramban dipanggil dalam mode `--app=<url>` dengan
   profil khusus, sehingga tampil seperti aplikasi Windows biasa (tanpa tab,
   tanpa kotak alamat, ikon & judul sendiri, entri taskbar sendiri).

   Untuk menghindari masalah "Exception Breakpoint 0x80000003" saat peramban
   diluncurkan dari proses yang berada di job object, jendela dibuka lewat
   pintasan (.lnk) yang dijalankan oleh explorer.exe. */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const KANDIDAT_PERAMBAN = [
  { nama: "Chrome", jalur: [path.join(process.env["ProgramFiles"] || "C:\\Program Files", "Google\\Chrome\\Application\\chrome.exe"), path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Google\\Chrome\\Application\\chrome.exe"), path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe")] },
  { nama: "Edge", jalur: [path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft\\Edge\\Application\\msedge.exe"), path.join(process.env["ProgramFiles"] || "C:\\Program Files", "Microsoft\\Edge\\Application\\msedge.exe")] },
  { nama: "Brave", jalur: [path.join(process.env["ProgramFiles"] || "C:\\Program Files", "BraveSoftware\\Brave-Browser\\Application\\brave.exe"), path.join(process.env.LOCALAPPDATA || "", "BraveSoftware\\Brave-Browser\\Application\\brave.exe")] },
];

function cariPeramban() {
  for (const { nama, jalur } of KANDIDAT_PERAMBAN) {
    for (const kandidat of jalur) {
      try {
        if (kandidat && fs.existsSync(kandidat)) return { nama, exe: kandidat };
      } catch (err) {
        /* lanjut */
      }
    }
  }
  return null;
}

/* Buat/perbarui pintasan peluncur. PowerShell dipakai karena WScript.Shell
   adalah cara paling andal membuat .lnk tanpa dependensi npm. */
function buatPintasan({ lnk, exe, argumen, ikon, berkasSementara }) {
  /* Skrip sementara ditulis di folder data aplikasi, bukan %TEMP%: sebagian
     lingkungan membatasi penulisan ke TEMP sehingga pembuatan pintasan gagal. */
  const berkas = berkasSementara || path.join(os.tmpdir(), "kumideck-lnk-" + process.pid + ".ps1");
  const q = (v) => "'" + String(v).replace(/'/g, "''") + "'";
  const skrip = [
    "$ErrorActionPreference = 'Stop'",
    "$ws = New-Object -ComObject WScript.Shell",
    "$s = $ws.CreateShortcut(" + q(lnk) + ")",
    "$s.TargetPath = " + q(exe),
    "$s.Arguments = " + q(argumen),
    "$s.IconLocation = " + q(ikon || exe),
    "$s.WorkingDirectory = " + q(path.dirname(exe)),
    "$s.WindowStyle = 1",
    "$s.Save()",
  ].join("\r\n");
  try {
    fs.writeFileSync(berkas, "\ufeff" + skrip, "utf8");
  } catch (err) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    let anak;
    try {
      anak = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", berkas], {
        windowsHide: true,
        stdio: "ignore",
      });
    } catch (err) {
      try {
        fs.rmSync(berkas, { force: true });
      } catch (e) {
        /* diabaikan */
      }
      resolve(false);
      return;
    }
    const jam = setTimeout(() => {
      try {
        anak.kill();
      } catch (e) {
        /* diabaikan */
      }
      resolve(false);
    }, 12000);
    anak.on("error", (err) => {
      console.log("[kumideck] pintasan gagal (spawn):", err && err.message);
      clearTimeout(jam);
      resolve(false);
    });
    anak.on("close", (kode) => {
      if (kode !== 0) console.log("[kumideck] pintasan: PowerShell keluar dengan kode", kode);
      clearTimeout(jam);
      try {
        fs.rmSync(berkas, { force: true });
      } catch (e) {
        /* diabaikan */
      }
      resolve(true);
    });
  });
}

/* Buka UI desktop sebagai jendela aplikasi. */
export async function bukaJendela(url, opsi = {}) {
  if (process.platform !== "win32") return { ok: false, pesan: "Jendela aplikasi hanya di Windows." };
  const peramban = cariPeramban();
  console.log("[kumideck] peramban terdeteksi:", JSON.stringify(peramban));
  if (!peramban) {
    return { ok: false, pesan: "Chrome/Edge tidak ditemukan; buka manual " + url };
  }
  const dirData = path.resolve(opsi.dirData || path.join(os.homedir(), "AppData", "Local", "KumiDeck"));
  const dirJendela = path.join(dirData, "jendela");
  const dirProfil = path.join(dirJendela, "profil");
  try {
    fs.mkdirSync(dirProfil, { recursive: true });
  } catch (err) {
    /* diabaikan: langsung spawn tanpa profil khusus */
  }
  const lebar = Number(opsi.lebar) || 1280;
  const tinggi = Number(opsi.tinggi) || 860;
  const argumen =
    "--app=" + url +
    " --window-size=" + lebar + "," + tinggi +
    " --user-data-dir=" + dirProfil +
    " --no-first-run --no-default-browser-check --disable-features=TranslateUI";
  const ikon = opsi.ikon && fs.existsSync(opsi.ikon) ? opsi.ikon : peramban.exe;
  const lnk = path.join(dirJendela, "KumiDeck.lnk");

  /* Cara 1 (utama): pintasan dijalankan explorer.exe -> proses tidak mewarisi
     job object induk, sehingga mesin peramban tidak crash saat start. */
  const pintasanSiap = await buatPintasan({
    lnk,
    exe: peramban.exe,
    argumen,
    ikon,
    berkasSementara: path.join(dirJendela, "buat-pintasan.ps1"),
  });
  console.log("[kumideck] pintasan siap:", pintasanSiap, "->", lnk);
  if (pintasanSiap && fs.existsSync(lnk)) {
    /* ShellExecute lewat rundll32: proses peramban diluncurkan oleh shell
       Windows (di luar job/console aplikasi), sehingga tidak terkena batasan
       yang membuat Chrome berhenti dengan Breakpoint 0x80000003. */
    const caraPintasan = [
      () => spawn("rundll32.exe", ["shell32.dll,ShellExec_RunDLL", lnk], { stdio: "ignore", windowsHide: true }),
      () => spawn("explorer.exe", [lnk], { stdio: "ignore", windowsHide: true }),
      () => spawn("cmd.exe", ["/c", "start", "", lnk], { stdio: "ignore", windowsHide: true }),
    ];
    for (const jalankan of caraPintasan) {
      try {
        const anak = jalankan();
        anak.on("error", () => {});
        anak.unref();
        return { ok: true, metode: "pintasan", peramban: peramban.nama };
      } catch (err) {
        /* coba cara berikutnya */
      }
    }
  }

  /* Cara 2: jalankan peramban langsung (cadangan). */
  try {
    const anak = spawn(peramban.exe, argumen.split(" "), {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    anak.on("error", () => {});
    anak.unref();
    return { ok: true, metode: "langsung", peramban: peramban.nama };
  } catch (err) {
    return { ok: false, pesan: "Jendela aplikasi gagal dibuka: " + err.message };
  }
}

export { cariPeramban };





