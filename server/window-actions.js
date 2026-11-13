/* Tindakan jendela Windows (#8) dan kontrol daya (#10 siap pakai).

   Semua efek memakai PowerShell + Win32 (ShowWindow, SetWindowPos) atau
   keybd_event. Tidak ada masukan pengguna yang disisipkan mentah ke skrip:
   daftar perintah diperiksa dulu dari peta perintah. */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const KODE_WINDOWS = `using System;
using System.Runtime.InteropServices;
public static class KumiWindow {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int perintah);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr sisipkan, int x, int y, int cx, int cy, uint bendera);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT kotak);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint bendera);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);
  [DllImport("user32.dll")] public static extern void keybd_event(byte kode, byte pindai, uint bendera, UIntPtr info);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int kiri, atas, kanan, bawah; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO {
    public int ukuran; public RECT monitor; public RECT kerja; public uint bendera;
  }
}
`;

/* Jalankan skrip lewat berkas sementara UTF-8 (BOM), karena PowerShell 5.1
   gagal membaca here-string Add-Type saat skrip datang dari argumen -Command
   atau stdin. Berkas dihapus setelah proses selesai. */
function jalankan(skrip, batasMs = 5000) {
  const berkas = path.join(os.tmpdir(), "kumideck-jendela-" + crypto.randomBytes(4).toString("hex") + ".ps1");
  try {
    fs.writeFileSync(berkas, "\ufeff" + skrip.replace(/\r\n/g, "\n"), "utf8");
  } catch (err) {
    return Promise.resolve({ ok: false, message: "Skrip jendela tidak dapat disiapkan." });
  }
  return new Promise((resolve) => {
    let selesai = false;
    let anak;
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
        { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
      );
    } catch (err) {
      bersihkan();
      resolve({ ok: false, message: "PowerShell tidak dapat dijalankan." });
      return;
    }
    anak.stderr.setEncoding("utf8");
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
      resolve({ ok: true, message: "Perintah dikirim." });
    }, batasMs);
    anak.on("error", () => {
      if (selesai) return;
      selesai = true;
      clearTimeout(jam);
      bersihkan();
      resolve({ ok: false, message: "PowerShell tidak dapat dijalankan." });
    });
    anak.on("exit", (kode) => {
      if (selesai) return;
      selesai = true;
      clearTimeout(jam);
      bersihkan();
      resolve({
        ok: kode === 0,
        message:
          kode === 0
            ? "Selesai."
            : "Perintah jendela gagal (kode " + kode + "). " + (galat.trim().split(/\r?\n/)[0] || ""),
      });
    });
  });
}

/* Peta perintah jendela. Nilai = potongan skrip PowerShell. */
const PERINTAH = {
  minimize: `
    $h = [KumiWindow]::GetForegroundWindow()
    [void][KumiWindow]::ShowWindow($h, 6)`,
  maximize: `
    $h = [KumiWindow]::GetForegroundWindow()
    [void][KumiWindow]::ShowWindow($h, 3)`,
  restore: `
    $h = [KumiWindow]::GetForegroundWindow()
    [void][KumiWindow]::ShowWindow($h, 9)`,
  kiri: `
    $h = [KumiWindow]::GetForegroundWindow()
    $m = [KumiWindow]::MonitorFromWindow($h, 2)
    $i = New-Object KumiWindow+MONITORINFO
    $i.ukuran = [System.Runtime.InteropServices.Marshal]::SizeOf($i)
    [void][KumiWindow]::GetMonitorInfo($m, [ref]$i)
    $w = $i.kerja.kanan - $i.kerja.kiri
    $t = $i.kerja.bawah - $i.kerja.atas
    [void][KumiWindow]::SetWindowPos($h, [IntPtr]::Zero, $i.kerja.kiri, $i.kerja.atas, [int]($w / 2), $t, 0x0040)`,
  kanan: `
    $h = [KumiWindow]::GetForegroundWindow()
    $m = [KumiWindow]::MonitorFromWindow($h, 2)
    $i = New-Object KumiWindow+MONITORINFO
    $i.ukuran = [System.Runtime.InteropServices.Marshal]::SizeOf($i)
    [void][KumiWindow]::GetMonitorInfo($m, [ref]$i)
    $w = $i.kerja.kanan - $i.kerja.kiri
    $t = $i.kerja.bawah - $i.kerja.atas
    [void][KumiWindow]::SetWindowPos($h, [IntPtr]::Zero, [int]($i.kerja.kiri + $w / 2), $i.kerja.atas, [int]($w / 2), $t, 0x0040)`,
  "monitor-berikut": `
    Add-Type -AssemblyName System.Windows.Forms
    $layar = [System.Windows.Forms.Screen]::AllScreens
    $h = [KumiWindow]::GetForegroundWindow()
    $m = [KumiWindow]::MonitorFromWindow($h, 2)
    $i = New-Object KumiWindow+MONITORINFO
    $i.ukuran = [System.Runtime.InteropServices.Marshal]::SizeOf($i)
    [void][KumiWindow]::GetMonitorInfo($m, [ref]$i)
    $pos = 0
    for ($n = 0; $n -lt $layar.Count; $n++) {
      if ($layar[$n].Bounds.Left -eq $i.monitor.kiri -and $layar[$n].Bounds.Top -eq $i.monitor.atas) { $pos = $n }
    }
    $tujuan = $layar[($pos + 1) % $layar.Count]
    $r = New-Object KumiWindow+RECT
    [void][KumiWindow]::GetWindowRect($h, [ref]$r)
    $lebar = $r.kanan - $r.kiri
    $tinggi = $r.bawah - $r.atas
    [void][KumiWindow]::SetWindowPos($h, [IntPtr]::Zero, $tujuan.Bounds.Left + 40, $tujuan.Bounds.Top + 40, $lebar, $tinggi, 0x0040)`,
  "task-view": `
    [KumiWindow]::keybd_event(0x5B, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 40
    [KumiWindow]::keybd_event(0x09, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 40
    [KumiWindow]::keybd_event(0x09, 0, 2, [UIntPtr]::Zero)
    [KumiWindow]::keybd_event(0x5B, 0, 2, [UIntPtr]::Zero)`,
  "tampilkan-desktop": `
    [KumiWindow]::keybd_event(0x5B, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 40
    [KumiWindow]::keybd_event(0x44, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 40
    [KumiWindow]::keybd_event(0x44, 0, 2, [UIntPtr]::Zero)
    [KumiWindow]::keybd_event(0x5B, 0, 2, [UIntPtr]::Zero)`,
  "tutup-jendela": `
    $h = [KumiWindow]::GetForegroundWindow()
    [void][KumiWindow]::ShowWindow($h, 9)
    Start-Sleep -Milliseconds 80
    [KumiWindow]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 30
    [KumiWindow]::keybd_event(0x73, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 30
    [KumiWindow]::keybd_event(0x73, 0, 2, [UIntPtr]::Zero)
    [KumiWindow]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)`,
};

const NAMA = {
  minimize: "Menyembunyikan jendela",
  maximize: "Memaksimalkan jendela",
  restore: "Mengembalikan jendela",
  kiri: "Snap kiri",
  kanan: "Snap kanan",
  "monitor-berikut": "Pindah monitor",
  "task-view": "Task View",
  "tampilkan-desktop": "Tampilkan desktop",
  "tutup-jendela": "Tutup jendela",
};

const PERINTAH_DAYA = {
  tidur: { skrip: "rundll32.exe powrprof.dll,SetSuspendState Sleep", nama: "Tidur" },
  kunci: { skrip: "rundll32.exe user32.dll,LockWorkStation", nama: "Kunci layar" },
  restart: { skrip: "shutdown.exe /r /t 5", nama: "Mulai ulang dalam 5 detik" },
  matikan: { skrip: "shutdown.exe /s /t 5", nama: "Matikan dalam 5 detik" },
  batal: { skrip: "shutdown.exe /a", nama: "Batalkan timer" },
};

export const AKSI_JENDELA = Object.keys(PERINTAH);
export const AKSI_DAYA = Object.keys(PERINTAH_DAYA);

export async function jalankanJendela(cmd) {
  if (!Object.prototype.hasOwnProperty.call(PERINTAH, cmd)) {
    return { ok: false, message: "Perintah jendela tidak dikenal." };
  }
  if (process.platform !== "win32") {
    return { ok: false, message: "Tindakan jendela hanya tersedia di Windows." };
  }
  /* Skrip lengkap. Kode C# dimasukkan ke here-string ganda yang dipasang ke
     variabel, lalu Add-Type memakai variabel itu. Cara ini terbukti terbaca
     benar oleh PowerShell 5.1 (here-string literal @'...'@ sempat gagal
     karena bangku BOM/escape di berkas sementara). */
  const skrip = '$kodeC = @"\n' + KODE_WINDOWS + '\n"@\nAdd-Type -TypeDefinition $kodeC\n' + PERINTAH[cmd];
  const hasil = await jalankan(skrip);
  return {
    ok: hasil.ok,
    message: hasil.ok ? NAMA[cmd] || "Selesai." : hasil.message,
  };
}

export async function jalankanDaya(cmd) {
  const data = PERINTAH_DAYA[cmd];
  if (!data) return { ok: false, message: "Perintah daya tidak dikenal." };
  if (process.platform !== "win32") {
    return { ok: false, message: "Perintah daya hanya tersedia di Windows." };
  }
  const hasil = await jalankan(data.skrip, 4000);
  return { ok: hasil.ok, message: hasil.ok ? data.nama : hasil.message };
}

