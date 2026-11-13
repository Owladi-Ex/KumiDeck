/* Bisukan mikrofon Windows lewat Windows Core Audio (IAudioEndpointVolume).

   Endpoint tangkap default (dataFlow 1) dipakai untuk membaca dan mengubah
   mute/volume. Satu proses PowerShell hidup lama menerima perintah lewat
   stdin, sehingga mute tidak memulai proses baru tiap tekan.

   Bila tidak ada mikrofon atau PowerShell hilang, fungsi mengembalikan
   ok:false tanpa melempar galat. */

import { spawn } from "node:child_process";
import { envPowerShell } from "./ps.js";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BATAS_MS = 4000;
const PREFIKS_SKRIP = "kumideck-mic-";

/* Skrip PowerShell. Jangan memakai backtick atau ${ di dalamnya; kode C#
   sengaja tanpa $ agar aman di dalam here-string @"..."@. */
const SKRIP = String.raw`
$ErrorActionPreference = "Stop"

$kode = @"
using System;
using System.Runtime.InteropServices;

public static class KumiMic {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] public class MMDeviceEnumeratorComObject { }

  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
    [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
    [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr client);
    [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr client);
  }

  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, uint clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
    [PreserveSig] int OpenPropertyStore(uint access, out IntPtr store);
    [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    [PreserveSig] int GetState(out int state);
  }

  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IAudioEndpointVolume {
    [PreserveSig] int RegisterControlChangeNotify(IntPtr notify);
    [PreserveSig] int UnregisterControlChangeNotify(IntPtr notify);
    [PreserveSig] int GetChannelCount(out uint count);
    [PreserveSig] int SetMasterVolumeLevel(float level, Guid ctx);
    [PreserveSig] int SetMasterVolumeLevelScalar(float level, Guid ctx);
    [PreserveSig] int GetMasterVolumeLevel(out float level);
    [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
    [PreserveSig] int SetChannelVolumeLevel(uint ch, float level, Guid ctx);
    [PreserveSig] int SetChannelVolumeLevelScalar(uint ch, float level, Guid ctx);
    [PreserveSig] int GetChannelVolumeLevel(uint ch, out float level);
    [PreserveSig] int GetChannelVolumeLevelScalar(uint ch, out float level);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, Guid ctx);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
    [PreserveSig] int GetVolumeStepInfo(out uint step, out uint count);
    [PreserveSig] int VolumeStepUp(Guid ctx);
    [PreserveSig] int VolumeStepDown(Guid ctx);
  }

  const string GALAT = "{\"ok\":false,\"mute\":false,\"volume\":0,\"pesan\":\"Mikrofon tidak tersedia di sistem ini.\"}";

  static IAudioEndpointVolume Vol() {
    var en = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    IMMDevice dev;
    int hr = en.GetDefaultAudioEndpoint(1, 1, out dev);
    if (hr != 0) throw new COMException("endpoint tangkap tidak ada", hr);
    Guid iid = typeof(IAudioEndpointVolume).GUID;
    object o;
    if (dev.Activate(ref iid, 0, IntPtr.Zero, out o) != 0) throw new COMException("aktivasi gagal");
    return (IAudioEndpointVolume)o;
  }

  public static string Baca() {
    try {
      var v = Vol();
      float level;
      v.GetMasterVolumeLevelScalar(out level);
      bool mute;
      v.GetMute(out mute);
      return "{\"ok\":true,\"mute\":" + (mute ? "true" : "false") + ",\"volume\":" + (int)Math.Round(level * 100) + "}";
    } catch { return GALAT; }
  }

  public static string Togel() {
    try {
      var v = Vol();
      bool mute;
      v.GetMute(out mute);
      v.SetMute(!mute, Guid.Empty);
      return Baca();
    } catch { return GALAT; }
  }

  public static string SetMute(bool nilai) {
    try {
      var v = Vol();
      v.SetMute(nilai, Guid.Empty);
      return Baca();
    } catch { return GALAT; }
  }
}
"@

Add-Type -TypeDefinition $kode -Language CSharp

while ($true) {
  $baris = [Console]::In.ReadLine()
  if ($null -eq $baris) { break }
  $perintah = $baris.Trim().ToUpperInvariant()
  if ($perintah -eq "") { continue }
  $keluar = '{"ok":false,"mute":false,"volume":0,"pesan":"Perintah mikrofon tidak dikenal."}'
  try {
    if ($perintah -eq "BACA") { $keluar = [KumiMic]::Baca() }
    elseif ($perintah -eq "TOGEL") { $keluar = [KumiMic]::Togel() }
    elseif ($perintah -eq "SENYAP") { $keluar = [KumiMic]::SetMute($true) }
    elseif ($perintah -eq "NYALA") { $keluar = [KumiMic]::SetMute($false) }
  } catch {
    $keluar = '{"ok":false,"mute":false,"volume":0,"pesan":"Mikrofon tidak dapat dibaca."}'
  }
  [Console]::Out.WriteLine($keluar)
  [Console]::Out.Flush()
}
`;

let proses = null;
let menunggu = null;
let sisa = "";
let dimatikan = false;
let berkasSkrip = "";
let antrean = Promise.resolve();

function jalurSkrip() {
  if (berkasSkrip) return berkasSkrip;
  const acak = Math.random().toString(36).slice(2, 8);
  const jalur = path.join(tmpdir(), PREFIKS_SKRIP + process.pid + "-" + acak + ".ps1");
  let isi = SKRIP;
  if (isi.charCodeAt(0) === 10) isi = isi.slice(1);
  /* BOM UTF-8 wajib agar PowerShell 5.1 membaca berkas sebagai UTF-8. */
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  writeFileSync(jalur, Buffer.concat([bom, Buffer.from(isi, "utf8")]));
  berkasSkrip = jalur;
  return jalur;
}

function hapusSkrip() {
  if (!berkasSkrip) return;
  const jalur = berkasSkrip;
  berkasSkrip = "";
  try {
    unlinkSync(jalur);
  } catch {
    /* dibiarkan di folder sementara */
  }
}

function gagalMenunggu(pesan) {
  if (!menunggu) return;
  clearTimeout(menunggu.timer);
  const selesaikan = menunggu.selesaikan;
  menunggu = null;
  selesaikan({ ok: false, mute: false, volume: 0, pesan });
}

function mulai() {
  if (proses || dimatikan) return;
  if (process.platform !== "win32") return;
  let anak;
  try {
    anak = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", jalurSkrip()],
      { windowsHide: true, stdio: ["pipe", "pipe", "ignore"], env: envPowerShell() }
    );
  } catch {
    return;
  }
  proses = anak;
  anak.stdout.setEncoding("utf8");
  anak.stdout.on("data", (potongan) => {
    sisa += potongan;
    const baris = sisa.split(/\r?\n/);
    sisa = baris.pop() || "";
    for (const b of baris) {
      const teks = b.trim();
      if (!teks || teks[0] !== "{" || !menunggu) continue;
      let data;
      try {
        data = JSON.parse(teks);
      } catch {
        continue;
      }
      const selesaikan = menunggu.selesaikan;
      clearTimeout(menunggu.timer);
      menunggu = null;
      selesaikan(data);
    }
  });
  anak.on("error", () => {
    proses = null;
    gagalMenunggu("PowerShell tidak dapat dijalankan.");
  });
  anak.on("close", () => {
    proses = null;
    sisa = "";
    gagalMenunggu("Kontrol mikrofon berhenti.");
  });
}

function hentikanProses() {
  if (!proses) return;
  const anak = proses;
  proses = null;
  try {
    anak.kill();
  } catch {
    /* diabaikan */
  }
}

function kirim(perintah, batasMs = BATAS_MS) {
  const kerja = () =>
    new Promise((selesaikan) => {
      const gagal = (pesan) => selesaikan({ ok: false, mute: false, volume: 0, pesan });
      if (dimatikan) {
        gagal("Kontrol mikrofon sudah dihentikan.");
        return;
      }
      if (process.platform !== "win32") {
        gagal("Mikrofon hanya tersedia di Windows.");
        return;
      }
      mulai();
      if (!proses) {
        gagal("PowerShell tidak tersedia untuk mikrofon.");
        return;
      }
      if (menunggu) gagalMenunggu("Perintah mikrofon sebelumnya belum selesai.");
      const timer = setTimeout(() => {
        if (!menunggu) return;
        menunggu = null;
        hentikanProses();
        gagal("Kontrol mikrofon tidak menjawab.");
      }, batasMs);
      menunggu = { selesaikan, timer };
      try {
        proses.stdin.write(perintah + "\n");
      } catch {
        clearTimeout(timer);
        menunggu = null;
        gagal("Perintah mikrofon tidak dapat dikirim.");
      }
    });
  const hasil = antrean.then(kerja, kerja);
  antrean = hasil.then(
    () => undefined,
    () => undefined
  );
  return hasil;
}

function rapikan(balasan) {
  if (!balasan || typeof balasan !== "object") {
    return { ok: false, mute: false, volume: 0, pesan: "Mikrofon tidak dapat dibaca." };
  }
  if (!balasan.ok) {
    return {
      ok: false,
      mute: false,
      volume: 0,
      pesan: String(balasan.pesan || "Mikrofon tidak tersedia di sistem ini."),
    };
  }
  return {
    ok: true,
    mute: balasan.mute === true,
    volume: Math.max(0, Math.min(100, Math.round(Number(balasan.volume) || 0))),
  };
}

/* Baca keadaan mikrofon: { ok, mute, volume }. */
export async function bacaMic() {
  const balasan = await kirim("BACA");
  return rapikan(balasan);
}

/* Ubah keadaan mikrofon. mode: "togel" | "senyap" | "nyala".
   Mengembalikan keadaan terbaru: { ok, mute, volume }. */
export async function aturMic(mode) {
  const perintah = String(mode || "").trim().toLowerCase();
  if (perintah !== "togel" && perintah !== "senyap" && perintah !== "nyala") {
    return { ok: false, mute: false, volume: 0, pesan: "Mode mikrofon tidak dikenal." };
  }
  const balasan = await kirim(perintah.toUpperCase());
  return rapikan(balasan);
}

/* Penghentian sinkron untuk penutupan proses. Setelah ini modul tidak akan
   pernah menghidupkan proses PowerShell lagi (lihat penjaga "dimatikan"). */
export function hentikanMic() {
  dimatikan = true;
  if (!proses) {
    hapusSkrip();
    return;
  }
  const anak = proses;
  proses = null;
  gagalMenunggu("Kontrol mikrofon dihentikan.");
  try {
    anak.stdin.end();
  } catch {
    /* diabaikan */
  }
  const paksa = setTimeout(() => {
    try {
      anak.kill();
    } catch {
      /* diabaikan */
    }
    hapusSkrip();
  }, 1500);
  if (typeof paksa.unref === "function") paksa.unref();
}

process.once("exit", hapusSkrip);


