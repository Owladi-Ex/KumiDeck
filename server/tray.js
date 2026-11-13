/* Tray icon KumiDeck — tanpa dependensi npm.

   Memakai WinForms NotifyIcon lewat PowerShell `-WindowStyle Hidden`: tidak ada
   jendela konsol, ikon di baki sistem dengan menu "Buka papan", "Salin tautan
   Remote", dan "Keluar".

   Keadaan tray disimpan di berkas (bukan hanya variabel memori) supaya statusnya
   tetap benar setelah server dijalankan ulang:
   - data/tray.pid     : PID proses PowerShell tray yang hidup
   - data/tray.on      : penanda tray hidup (dipakai UI & pemantau keluar)
   - data/tray.berjalan: niat pengguna, agar tray dinyalakan lagi saat boot
   - data/tray.log     : catatan ikon yang dipakai (untuk menelusuri masalah) */

import { spawn } from "node:child_process";
import { envPowerShell } from "./ps.js";
import fs from "node:fs";
import path from "node:path";

let proses = null;

function bacaPid(dirData) {
  try {
    const isi = fs.readFileSync(path.join(dirData, "tray.pid"), "utf8").trim();
    const pid = Number(isi);
    return Number.isFinite(pid) && pid > 0 ? pid : 0;
  } catch (err) {
    return 0;
  }
}

function prosesHidup(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return false;
  }
}

function matikanPid(pid) {
  if (!pid) return;
  try {
    process.kill(pid);
  } catch (err) {
    try {
      process.kill(pid, "SIGKILL");
    } catch (err2) {
      /* sudah mati */
    }
  }
}

/* Skrip PowerShell. Efek samping: data/tray.on ada selama tray hidup. */
function skripTray({ ikon, ikonCadangan, tautan, berkasOn, berkasCtl, berkasLog, port }) {
  const kutip = (v) => "'" + String(v).replace(/'/g, "''") + "'";
  return `
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ikonPath = ${kutip(ikon)}
$ikonCadangan = ${kutip(ikonCadangan)}
$tautan = ${kutip(tautan)}
$berkasOn = ${kutip(berkasOn)}
$berkasCtl = ${kutip(berkasCtl)}
$berkasLog = ${kutip(berkasLog)}
$port = ${Number(port)}

[System.IO.File]::WriteAllText($berkasOn, "on")

# Pilih ikon: berkas utama, lalu cadangan, terakhir ikon bawaan Windows.
$dipakai = ""
$ikon = $null
foreach ($calon in @($ikonPath, $ikonCadangan)) {
  if ($calon -and (Test-Path $calon)) {
    try {
      $ikon = New-Object System.Drawing.Icon($calon)
      $dipakai = $calon
      break
    } catch {
      $ikon = $null
    }
  }
}
if (-not $ikon) {
  $ikon = [System.Drawing.SystemIcons]::Application
  $dipakai = "(bawaan Windows)"
}
try {
  $catat = "ikon=" + $dipakai + [char]13 + [char]10 + "ukuran=" + $ikon.Width + "x" + $ikon.Height
  [System.IO.File]::WriteAllText($berkasLog, $catat)
} catch { }

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = $ikon
$notify.Text = "KumiDeck - papan tombol"
$notify.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$buka = $menu.Items.Add("Buka papan")
$buka.Add_Click({ Start-Process ("http://localhost:" + $port) })
$salin = $menu.Items.Add("Salin tautan Remote")
$salin.Add_Click({ [System.Windows.Forms.Clipboard]::SetText($tautan) })
[void]$menu.Items.Add("-")
$keluar = $menu.Items.Add("Keluar KumiDeck")
$keluar.Add_Click({
  [System.IO.File]::WriteAllText($berkasCtl, "keluar")
})
$notify.ContextMenuStrip = $menu
$notify.Add_DoubleClick({ Start-Process ("http://localhost:" + $port) })

$notify.ShowBalloonTip(2500, "KumiDeck berjalan", "Klik dua kali ikon untuk membuka papan.", [System.Windows.Forms.ToolTipIcon]::None)

while ($true) {
  [System.Windows.Forms.Application]::DoEvents()
  Start-Sleep -Milliseconds 120
  if (Test-Path $berkasCtl) {
    $perintah = ([System.IO.File]::ReadAllText($berkasCtl)).Trim().ToLower()
    if ($perintah -eq "keluar") { break }
    if ($perintah -eq "tutup-tray" -or $perintah -eq "matikan") { break }
  }
  if (-not $notify.Visible) { break }
}

$notify.Visible = $false
$notify.Dispose()
Remove-Item $berkasOn -Force -ErrorAction SilentlyContinue
`;
}

export function mulaiTray({ port, lanUrl, dirData, ikon, ikonCadangan }) {
  if (process.platform !== "win32") return false;
  if (proses) return false;

  /* Bersihkan proses tray lama yang masih hidup (mis. setelah server restart). */
  const pidLama = bacaPid(dirData);
  if (pidLama && prosesHidup(pidLama)) return false;
  if (pidLama) matikanPid(pidLama);

  const berkasOn = path.join(dirData, "tray.on");
  const berkasCtl = path.join(dirData, "tray.ctl");
  const berkasLog = path.join(dirData, "tray.log");
  const berkasPid = path.join(dirData, "tray.pid");
  try {
    fs.rmSync(berkasCtl, { force: true });
  } catch (err) {
    /* diabaikan */
  }

  const skrip = skripTray({
    ikon: ikon || "",
    ikonCadangan: ikonCadangan || "",
    tautan: lanUrl || "",
    berkasOn,
    berkasCtl,
    berkasLog,
    port: port || 4173,
  });

  let anak;
  try {
    anak = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-Command", skrip],
      { windowsHide: true, stdio: "ignore", env: envPowerShell() }
    );
  } catch (err) {
    return false;
  }
  proses = anak;

  try {
    fs.writeFileSync(berkasPid, String(anak.pid || ""), "utf8");
    fs.writeFileSync(path.join(dirData, "tray.berjalan"), "on", "utf8");
  } catch (err) {
    /* diabaikan */
  }

  anak.on("error", () => {
    proses = null;
  });
  anak.on("close", () => {
    proses = null;
    try {
      fs.rmSync(berkasOn, { force: true });
      fs.rmSync(berkasPid, { force: true });
      /* JANGAN hapus berkasCtl: server memantau berkas itu untuk tahu bahwa
         pengguna memilih "Keluar" dari menu tray. Server yang membersihkannya. */
    } catch (err) {
      /* diabaikan */
    }
  });
  return true;
}

export function hentikanTray({ dirData } = {}) {
  const dir = dirData;
  if (proses) {
    try {
      proses.kill();
    } catch (err) {
      /* diabaikan */
    }
    proses = null;
  }
  if (dir) {
    const pid = bacaPid(dir);
    if (pid) matikanPid(pid);
    for (const nama of ["tray.on", "tray.pid", "tray.berjalan", "tray.ctl"]) {
      try {
        fs.rmSync(path.join(dir, nama), { force: true });
      } catch (err) {
        /* diabaikan */
      }
    }
  }
}

/* Keadaan nyata (bukan sekadar memori): proses tray hidup atau tidak. */
export function trayAktif(dirData) {
  const dir = dirData || globalThis.__KD_DIR_DATA;
  const pid = dir ? bacaPid(dir) : 0;
  if (pid && prosesHidup(pid)) return true;
  if (proses) return proses.exitCode === null;
  return false;
}

/* Dipakai saat boot: nyalakan lagi bila pengguna terakhir menyalakannya. */
export function trayDiinginkan(dirData) {
  try {
    return fs.existsSync(path.join(dirData, "tray.berjalan"));
  } catch (err) {
    return false;
  }
}

export function logTray(dirData) {
  try {
    return fs.readFileSync(path.join(dirData, "tray.log"), "utf8");
  } catch (err) {
    return "";
  }
}





