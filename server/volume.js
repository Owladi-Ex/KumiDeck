/* Kontrol volume sistem (#9) lewat Windows Core Audio (IAudioEndpointVolume).

   Satu skrip PowerShell hidup lama menerima perintah yang dikirim ke stdin dan
   membalas satu baris JSON. Dengan begitu tidak ada proses PowerShell baru tiap
   tombol ditekan (dulu ±300 ms), dan tidak perlu dependensi native.

   Perintah: "baca" | "naik" | "turun" | "set <0-100>" | "mute" | "buka"
   Balasan : { ok, volume, mute } */

import { spawn } from "node:child_process";

const SKRIP = String.raw`
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class KumiAudio {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] public class MMDeviceEnumeratorComObject { }
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
    [PreserveSig] int GetDevice(string id, out IMMDevice device);
    [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr client);
    [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr client);
  }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, uint clsCtx, IntPtr activationParams, out IAudioEndpointVolume iface);
    [PreserveSig] int OpenPropertyStore(uint access, out IntPtr store);
    [PreserveSig] int GetId(out IntPtr id);
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
  static IAudioEndpointVolume Perangkat() {
    var en = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    IMMDevice dev; en.GetDefaultAudioEndpoint(0, 1, out dev);
    Guid iid = typeof(IAudioEndpointVolume).GUID;
    IAudioEndpointVolume vol; dev.Activate(ref iid, 0, IntPtr.Zero, out vol);
    return vol;
  }
  public static string Baca() {
    var vol = Perangkat();
    float level; vol.GetMasterVolumeLevelScalar(out level);
    bool mute; vol.GetMute(out mute);
    return "{\"ok\":true,\"volume\":" + (int)Math.Round(level * 100) + ",\"mute\":" + (mute ? "true" : "false") + "}";
  }
  public static string Naik(int langkah) {
    var vol = Perangkat();
    for (int i = 0; i < langkah; i++) vol.VolumeStepUp(Guid.Empty);
    return Baca();
  }
  public static string Turun(int langkah) {
    var vol = Perangkat();
    for (int i = 0; i < langkah; i++) vol.VolumeStepDown(Guid.Empty);
    return Baca();
  }
  public static string Set(int persen) {
    var vol = Perangkat();
    float nilai = Math.Max(0, Math.Min(100, persen)) / 100f;
    vol.SetMasterVolumeLevelScalar(nilai, Guid.Empty);
    return Baca();
  }
  public static string Mute() {
    var vol = Perangkat();
    bool sekarang; vol.GetMute(out sekarang);
    vol.SetMute(!sekarang, Guid.Empty);
    return Baca();
  }
}
'@

while ($true) {
  $baris = [Console]::In.ReadLine()
  if ($null -eq $baris) { break }
  $baris = $baris.Trim().ToLower()
  $keluar = '{"ok":false}'
  try {
    if ($baris -eq "baca") { $keluar = [KumiAudio]::Baca() }
    elseif ($baris -eq "naik") { $keluar = [KumiAudio]::Naik(2) }
    elseif ($baris -eq "turun") { $keluar = [KumiAudio]::Turun(2) }
    elseif ($baris -eq "mute") { $keluar = [KumiAudio]::Mute() }
    elseif ($baris -like "set *") { $keluar = [KumiAudio]::Set([int]($baris.Substring(4))) }
  } catch {
    $keluar = '{"ok":false}'
  }
  [Console]::Out.WriteLine($keluar)
  [Console]::Out.Flush()
}
`;

let proses = null;
let menunggu = null; /* {resolve, timer} */
let sisa = "";

function mulai() {
  if (proses || process.platform !== "win32") return;
  let anak;
  try {
    anak = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SKRIP],
      { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] }
    );
  } catch (err) {
    return;
  }
  proses = anak;
  anak.stdout.setEncoding("utf8");
  anak.stdout.on("data", (potongan) => {
    sisa += potongan;
    const baris = sisa.split(/\r?\n/);
    sisa = baris.pop() || "";
    for (const b of baris) {
      if (!b.trim() || !menunggu) continue;
      try {
        const data = JSON.parse(b.trim());
        clearTimeout(menunggu.timer);
        const selesaikan = menunggu.resolve;
        menunggu = null;
        selesaikan(data);
      } catch (err) {
        /* baris promosi PowerShell: abaikan */
      }
    }
  });
  anak.on("error", () => {
    proses = null;
  });
  anak.on("close", () => {
    proses = null;
    if (menunggu) {
      clearTimeout(menunggu.timer);
      menunggu.resolve({ ok: false });
      menunggu = null;
    }
  });
}

/* Kirim perintah dan tunggu jawaban (±3 dtk). */
export function perintahVolume(cmd, batasMs = 4000) {
  return new Promise((resolve) => {
    if (process.platform !== "win32") {
      resolve({ ok: false, alasan: "Volume hanya tersedia di Windows." });
      return;
    }
    mulai();
    if (!proses) {
      resolve({ ok: false, alasan: "Kontrol volume tidak dapat dijalankan." });
      return;
    }
    if (menunggu) {
      /* Hanya satu perintah sekaligus; yang baru menimpa yang lama. */
      clearTimeout(menunggu.timer);
      menunggu.resolve({ ok: false });
      menunggu = null;
    }
    const timer = setTimeout(() => {
      if (!menunggu) return;
      menunggu = null;
      resolve({ ok: false, alasan: "Kontrol volume tidak menjawab." });
    }, batasMs);
    menunggu = { resolve, timer };
    try {
      proses.stdin.write(String(cmd).replace(/[\r\n]/g, "") + "\n");
    } catch (err) {
      clearTimeout(timer);
      menunggu = null;
      resolve({ ok: false, alasan: "Kontrol volume tidak dapat dikirim." });
    }
  });
}

export function hentikanKontrolVolume() {
  if (!proses) return;
  try {
    proses.stdin.end();
    proses.kill();
  } catch (err) {
    /* diabaikan */
  }
  proses = null;
}
