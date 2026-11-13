/* Lapisan audio Windows (papan suara).

   Satu proses PowerShell hidup lama memegang COM Windows Media Player
   (WMPlayer.OCX); perintah masuk lewat stdin, balasan satu baris JSON lewat
   stdout. Perangkat output dipilih lewat IPolicyConfig::SetDefaultEndpoint:
   perangkat default dialihkan sementara lalu dipulihkan saat pemutaran
   selesai atau dihentikan. WMPlayer.OCX sendiri tidak bisa memilih perangkat.

   Bila PowerShell tidak tersedia, semua fungsi gagal aman (ok:false). */

import { spawn } from "node:child_process";
import { envPowerShell } from "./ps.js";
import { statSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BATAS_MS = 4000;
const EKSTENSI = new Set([".mp3", ".wav", ".m4a", ".ogg", ".flac"]);
const PREFIKS_SKRIP = "kumideck-audio-";

/* Skrip PowerShell. Ditulis dengan String.raw agar tidak perlu escape.
   Jangan memakai backtick atau ${ di dalamnya: keduanya istimewa bagi
   PowerShell maupun JavaScript. Kode C# sengaja tidak memakai $ agar aman
   di dalam here-string @"..."@. */
const SKRIP = String.raw`
$ErrorActionPreference = "Stop"
try { Add-Type -AssemblyName System.Windows.Forms | Out-Null } catch { }

$kode = @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class KumiAudio {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] public class MMDeviceEnumeratorComObject { }

  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
    [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
    [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr client);
    [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr client);
  }

  [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDeviceCollection {
    [PreserveSig] int GetCount(out int count);
    [PreserveSig] int Item(int index, out IMMDevice device);
  }

  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, uint clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
    [PreserveSig] int OpenPropertyStore(uint access, out IPropertyStore store);
    [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    [PreserveSig] int GetState(out int state);
  }

  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  public struct PROPERTYKEY { public Guid fmtid; public int pid; }

  [StructLayout(LayoutKind.Explicit)]
  public struct PROPVARIANT {
    [FieldOffset(0)] public ushort vt;
    [FieldOffset(8)] public IntPtr pointer;
  }

  [ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPropertyStore {
    [PreserveSig] int GetCount(out int count);
    [PreserveSig] int GetAt(int index, out PROPERTYKEY key);
    [PreserveSig] int GetValue(ref PROPERTYKEY key, out PROPVARIANT value);
    [PreserveSig] int SetValue(ref PROPERTYKEY key, ref PROPVARIANT value);
    [PreserveSig] int Commit();
  }

  [ComImport, Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPolicyConfig {
    [PreserveSig] int GetMixFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceId, out IntPtr format);
    [PreserveSig] int GetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int bDefault, out IntPtr format);
    [PreserveSig] int ResetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceId);
    [PreserveSig] int SetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceId, IntPtr format, IntPtr endpointFormat);
    [PreserveSig] int GetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int bDefault, out long a, out long b);
    [PreserveSig] int SetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string deviceId, ref long period);
    [PreserveSig] int GetShareMode([MarshalAs(UnmanagedType.LPWStr)] string deviceId, out IntPtr mode);
    [PreserveSig] int SetShareMode([MarshalAs(UnmanagedType.LPWStr)] string deviceId, IntPtr mode);
    [PreserveSig] int GetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string deviceId, ref PROPERTYKEY key, out PROPVARIANT value);
    [PreserveSig] int SetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string deviceId, ref PROPERTYKEY key, ref PROPVARIANT value);
    [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int role);
    [PreserveSig] int SetEndpointVisibility([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int visible);
  }

  static IMMDeviceEnumerator En() { return (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject()); }

  public static string Esc(string teks) {
    if (teks == null) return "";
    StringBuilder sb = new StringBuilder(teks.Length + 8);
    foreach (char c in teks) {
      if (c == '\"') sb.Append("\\\"");
      else if (c == '\\') sb.Append("\\\\");
      else if (c == '\n') sb.Append("\\n");
      else if (c == '\r') sb.Append("\\r");
      else if (c == '\t') sb.Append("\\t");
      else if (c < ' ') sb.Append(' ');
      else sb.Append(c);
    }
    return sb.ToString();
  }

  static string NamaDari(IMMDevice dev) {
    string nama = "";
    try {
      IPropertyStore store;
      if (dev.OpenPropertyStore(0, out store) == 0) {
        PROPERTYKEY k = new PROPERTYKEY();
        k.fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0");
        k.pid = 14;
        PROPVARIANT v;
        if (store.GetValue(ref k, out v) == 0 && v.vt == 31) nama = Marshal.PtrToStringUni(v.pointer);
      }
    } catch { }
    return nama == null ? "" : nama;
  }

  public static string Daftar() {
    try {
      var en = En();
      IMMDeviceCollection kumpulan;
      if (en.EnumAudioEndpoints(0, 1, out kumpulan) != 0) {
        return "{\"ok\":false,\"pesan\":\"Perangkat output tidak dapat dibaca.\"}";
      }
      int jumlah;
      kumpulan.GetCount(out jumlah);
      string bawaan = DefaultId();
      string hasil = "";
      for (int i = 0; i < jumlah; i++) {
        IMMDevice dev;
        if (kumpulan.Item(i, out dev) != 0) continue;
        string id;
        dev.GetId(out id);
        if (id == null) id = "";
        if (hasil.Length > 0) hasil += ",";
        hasil += "{\"id\":\"" + Esc(id) + "\",\"nama\":\"" + Esc(NamaDari(dev)) + "\",\"bawaan\":" + (id == bawaan ? "true" : "false") + "}";
      }
      return "{\"ok\":true,\"perangkat\":[" + hasil + "]}";
    } catch {
      return "{\"ok\":false,\"pesan\":\"Perangkat output tidak dapat dibaca.\"}";
    }
  }

  public static string DefaultId() {
    try {
      IMMDevice dev;
      if (En().GetDefaultAudioEndpoint(0, 1, out dev) != 0) return "";
      string id;
      dev.GetId(out id);
      return id == null ? "" : id;
    } catch { return ""; }
  }

  public static string Nama(string id) {
    try {
      if (id == null || id == "") return "";
      IMMDevice dev;
      if (En().GetDevice(id, out dev) != 0) return "";
      return NamaDari(dev);
    } catch { return ""; }
  }

  public static int SetDefault(string id, int role) {
    try {
      Type t = Type.GetTypeFromCLSID(new Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9"));
      var pc = (IPolicyConfig)Activator.CreateInstance(t);
      return pc.SetDefaultEndpoint(id, role);
    } catch { return -1; }
  }
}
"@

Add-Type -TypeDefinition $kode -Language CSharp

$tab = [string][char]9
$nl = [string][char]10

$pemutar = $null
$volume = 50
$sumber = ""
$perangkatId = ""
$memutar = $false
$ruteAktif = $false
$ruteSebelumnya = ""
$mulaiPutar = $null
$cekTerakhir = Get-Date

function BoolStr($nilai) {
  if ($nilai) { return "true" }
  return "false"
}

function DariB64($teks) {
  if ([string]::IsNullOrEmpty($teks)) { return "" }
  try { return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($teks)) } catch { return "" }
}

function PulihkanRute {
  if (-not $script:ruteAktif) { return }
  $id = $script:ruteSebelumnya
  $script:ruteAktif = $false
  $script:ruteSebelumnya = ""
  if ($id -ne "") { [void][KumiAudio]::SetDefault($id, 1) }
}

function BerhentiPutar {
  if ($script:pemutar) {
    try { $script:pemutar.controls.stop() | Out-Null } catch { }
  }
  $script:memutar = $false
  $script:mulaiPutar = $null
  PulihkanRute
}

function CekSelesai {
  if (-not $script:memutar) { return }
  if (-not $script:mulaiPutar) { return }
  $kini = Get-Date
  if (($kini - $script:mulaiPutar).TotalMilliseconds -lt 700) { return }
  if (($kini - $script:cekTerakhir).TotalMilliseconds -lt 200) { return }
  $script:cekTerakhir = $kini
  $state = 0
  try { $state = [int]$script:pemutar.playState } catch { }
  if ($state -eq 1 -or $state -eq 8 -or $state -eq 10) {
    $script:memutar = $false
    $script:mulaiPutar = $null
    PulihkanRute
  }
}

function StatusJson {
  return '{"ok":true,"memutar":' + (BoolStr $script:memutar) + ',"sumber":"' + [KumiAudio]::Esc([string]$script:sumber) + '","volume":' + [int]$script:volume + ',"perangkatId":"' + [KumiAudio]::Esc([string]$script:perangkatId) + '"}'
}

function TanganiPlay($bagian) {
  $sumberBaru = DariB64($bagian[1])
  $volBaru = -1
  if ($bagian.Length -gt 2) { [void][int]::TryParse($bagian[2].Trim(), [ref]$volBaru) }
  $devBaru = ""
  if ($bagian.Length -gt 3) { $devBaru = DariB64($bagian[3]) }
  if ($sumberBaru -eq "") { return '{"ok":false,"pesan":"Sumber suara kosong."}' }

  BerhentiPutar

  if ($volBaru -ge 0) { $script:volume = [Math]::Max(0, [Math]::Min(100, $volBaru)) }
  if (-not $script:pemutar) { $script:pemutar = New-Object -ComObject WMPlayer.OCX }
  try { $script:pemutar.settings.volume = [int]$script:volume } catch { }

  $rute = $false
  $ruteGagal = $false
  $namaDev = ""
  if ($devBaru -ne "") {
    $sekarang = [KumiAudio]::DefaultId()
    if ($sekarang -ne $devBaru) {
      if ([KumiAudio]::SetDefault($devBaru, 1) -eq 0) {
        $script:ruteAktif = $true
        $script:ruteSebelumnya = $sekarang
        $rute = $true
        $namaDev = [KumiAudio]::Nama($devBaru)
        Start-Sleep -Milliseconds 200
      } else {
        $ruteGagal = $true
      }
    }
  }

  try {
    $script:pemutar.URL = $sumberBaru
    $script:pemutar.controls.play() | Out-Null
    # WMPlayer mengatur ulang settings.volume saat URL baru dimuat, jadi volume
    # harus dipasang lagi SESUDAH play — kalau tidak, volume per suara diabaikan.
    $script:pemutar.settings.volume = [int]$script:volume
  } catch {
    if ($rute) { PulihkanRute }
    return '{"ok":false,"pesan":"Suara tidak dapat diputar."}'
  }

  $script:sumber = $sumberBaru
  $script:mulaiPutar = Get-Date
  $state = 9
  $batas = (Get-Date).AddMilliseconds(250)
  while ((Get-Date) -lt $batas) {
    [System.Windows.Forms.Application]::DoEvents()
    Start-Sleep -Milliseconds 30
    $state = [int]$script:pemutar.playState
    if ($state -eq 3 -or $state -eq 6 -or $state -eq 7) { break }
  }
  # Terapkan volume sekali lagi setelah media benar-benar berjalan.
  try { $script:pemutar.settings.volume = [int]$script:volume } catch { }
  $jalan = ($state -eq 2 -or $state -eq 3 -or $state -eq 4 -or $state -eq 5 -or $state -eq 6 -or $state -eq 7 -or $state -eq 9)
  $script:memutar = $jalan
  if (-not $jalan) {
    $script:mulaiPutar = $null
    PulihkanRute
    return '{"ok":false,"pesan":"Suara tidak dapat diputar."}'
  }

  if ($rute) {
    $script:perangkatId = $devBaru
  } else {
    $script:perangkatId = [KumiAudio]::DefaultId()
  }

  if ($rute) {
    if ($namaDev -ne "") {
      $pesan = "Memutar lewat " + $namaDev + "; perangkat default sistem dialihkan sementara."
    } else {
      $pesan = "Memutar lewat perangkat pilihan; perangkat default sistem dialihkan sementara."
    }
  } elseif ($ruteGagal) {
    $pesan = "Perangkat output tidak dapat dipilih; memakai perangkat default."
  } else {
    $pesan = "Memutar lewat perangkat default."
  }

  return '{"ok":true,"memutar":true,"sumber":"' + [KumiAudio]::Esc([string]$script:sumber) + '","volume":' + [int]$script:volume + ',"perangkatId":"' + [KumiAudio]::Esc([string]$script:perangkatId) + '","routeSementara":' + (BoolStr $rute) + ',"pesan":"' + [KumiAudio]::Esc($pesan) + '"}'
}

function TanganiPerintah($perintah) {
  $bagian = $perintah -split $tab
  $nama = $bagian[0].Trim().ToUpperInvariant()

  if ($nama -eq "DAFTAR") { return [KumiAudio]::Daftar() }

  if ($nama -eq "VOL") {
    $nilai = $script:volume
    if ($bagian.Length -gt 1) { [void][int]::TryParse($bagian[1].Trim(), [ref]$nilai) }
    $script:volume = [Math]::Max(0, [Math]::Min(100, $nilai))
    if ($script:pemutar) {
      try { $script:pemutar.settings.volume = [int]$script:volume } catch { }
    }
    return '{"ok":true,"volume":' + [int]$script:volume + '}'
  }

  if ($nama -eq "PLAY") { return TanganiPlay $bagian }

  if ($nama -eq "STOP") {
    $ada = $script:memutar
    BerhentiPutar
    if ($ada) { $pesan = "Pemutaran dihentikan." } else { $pesan = "Tidak ada pemutaran." }
    return '{"ok":true,"memutar":false,"volume":' + [int]$script:volume + ',"pesan":"' + [KumiAudio]::Esc($pesan) + '"}'
  }

  if ($nama -eq "STATUS") { return StatusJson }

  return '{"ok":false,"pesan":"Perintah tidak dikenal."}'
}

try {
  $masukan = [Console]::OpenStandardInput()
  $penyangga = New-Object byte[] 8192
  $sisa = ""
  $berhenti = $false
  while (-not $berhenti) {
    $tugas = $masukan.ReadAsync($penyangga, 0, $penyangga.Length)
    while (-not $tugas.Wait(60)) {
      try { [System.Windows.Forms.Application]::DoEvents() } catch { }
      try { CekSelesai } catch { }
    }
    $baca = $tugas.Result
    if ($baca -le 0) { break }
    $sisa += [Text.Encoding]::UTF8.GetString($penyangga, 0, $baca)
    while ($sisa.Contains($nl)) {
      $i = $sisa.IndexOf($nl)
      $perintah = $sisa.Substring(0, $i).Trim()
      $sisa = $sisa.Substring($i + 1)
      if ($perintah.Length -eq 0) { continue }
      if (($perintah -split $tab)[0].Trim().ToUpperInvariant() -eq "TUTUP") {
        $berhenti = $true
        break
      }
      $keluar = '{"ok":false,"pesan":"Perintah gagal dijalankan."}'
      try { $keluar = TanganiPerintah $perintah } catch { }
      [Console]::Out.WriteLine($keluar)
      [Console]::Out.Flush()
    }
  }
} finally {
  try { BerhentiPutar } catch { }
  if ($pemutar) {
    try { $pemutar.controls.stop() | Out-Null } catch { }
    try { $pemutar.close() | Out-Null } catch { }
    try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($pemutar) } catch { }
    $pemutar = $null
  }
}
`;

let proses = null;
let menunggu = null;
let sisa = "";
let dimatikan = false;
let berkasSkrip = "";
let antrean = Promise.resolve();
let timerStatus = null;

/* Proses anak. */

function jalurSkrip() {
  if (berkasSkrip) return berkasSkrip;
  const acak = Math.random().toString(36).slice(2, 8);
  const jalur = path.join(tmpdir(), PREFIKS_SKRIP + process.pid + "-" + acak + ".ps1");
  let isi = SKRIP;
  if (isi.charCodeAt(0) === 10) isi = isi.slice(1);
  /* BOM UTF-8 wajib: tanpa BOM PowerShell 5.1 membaca berkas sebagai ANSI
     dan blok here-string di dalamnya gagal diurai. */
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
    /* berkas mungkin masih dipakai; dibiarkan di folder sementara */
  }
}

function gagalMenunggu(pesan) {
  if (!menunggu) return;
  clearTimeout(menunggu.timer);
  const selesaikan = menunggu.selesaikan;
  menunggu = null;
  selesaikan({ ok: false, pesan });
}

function mulai() {
  if (proses || dimatikan) return;
  if (process.platform !== "win32") return;
  let anak;
  try {
    anak = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Sta", "-ExecutionPolicy", "Bypass", "-File", jalurSkrip()],
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
        continue; /* baris promosi atau galat PowerShell: abaikan */
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
    gagalMenunggu("Pemutar suara berhenti.");
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

/* Kirim satu perintah; perintah diserialkan agar balasan tidak tertukar. */
function kirim(baris, batasMs = BATAS_MS) {
  const kerja = () =>
    new Promise((selesaikan) => {
      if (dimatikan) {
        selesaikan({ ok: false, pesan: "Pemutar audio sudah dihentikan." });
        return;
      }
      if (process.platform !== "win32") {
        selesaikan({ ok: false, pesan: "Suara hanya tersedia di Windows." });
        return;
      }
      mulai();
      if (!proses) {
        selesaikan({ ok: false, pesan: "PowerShell tidak tersedia untuk audio." });
        return;
      }
      if (menunggu) gagalMenunggu("Perintah audio sebelumnya belum selesai.");
      const timer = setTimeout(() => {
        if (!menunggu) return;
        menunggu = null;
        /* Proses dianggap macet: matikan agar tidak terjadi balasan tertukar. */
        hentikanProses();
        selesaikan({ ok: false, pesan: "Pemutar suara tidak menjawab." });
      }, batasMs);
      menunggu = { selesaikan, timer };
      try {
        proses.stdin.write(baris + "\n");
      } catch {
        clearTimeout(timer);
        menunggu = null;
        selesaikan({ ok: false, pesan: "Perintah audio tidak dapat dikirim." });
      }
    });
  const hasil = antrean.then(kerja, kerja);
  antrean = hasil.then(
    () => undefined,
    () => undefined
  );
  return hasil;
}

/* Pemantau status. */

function hentikanPantau() {
  if (timerStatus) {
    clearInterval(timerStatus);
    timerStatus = null;
  }
}

function mulaiPantau() {
  if (timerStatus || dimatikan) return;
  timerStatus = setInterval(() => {
    kirim("STATUS").then((balas) => {
      if (!balas || !balas.ok || !balas.memutar) hentikanPantau();
    });
  }, 350);
  if (typeof timerStatus.unref === "function") timerStatus.unref();
}

/* Pemeriksaan masukan. */

function periksaSumber(sumber) {
  if (typeof sumber !== "string" || !sumber.trim()) {
    return { ok: false, pesan: "Sumber suara kosong." };
  }
  const nilai = sumber.trim();
  if (/^https?:\/\//i.test(nilai)) {
    let url;
    try {
      url = new URL(nilai);
    } catch {
      return { ok: false, pesan: "Alamat suara tidak valid." };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, pesan: "Hanya alamat http atau https yang didukung." };
    }
    if (!url.hostname) return { ok: false, pesan: "Alamat suara tidak valid." };
    return { ok: true, jalur: url.href };
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(nilai)) {
    return { ok: false, pesan: "Hanya berkas lokal atau alamat http/https." };
  }
  let info;
  try {
    info = statSync(nilai);
  } catch {
    return { ok: false, pesan: "Berkas suara tidak ditemukan." };
  }
  if (!info.isFile()) return { ok: false, pesan: "Sumber suara bukan berkas." };
  const ekstensi = path.extname(nilai).toLowerCase();
  if (!EKSTENSI.has(ekstensi)) {
    return { ok: false, pesan: "Format suara tidak didukung (mp3, wav, m4a, ogg, flac)." };
  }
  return { ok: true, jalur: nilai };
}

function normaVolume(nilai) {
  const angka = Number(nilai);
  if (!Number.isFinite(angka)) return 50;
  return Math.max(0, Math.min(100, Math.round(angka)));
}

/* API publik. */

/* Daftar perangkat output aktif. Setiap perangkat: { id, nama, bawaan }. */
export async function daftarPerangkatOutput() {
  const balas = await kirim("DAFTAR");
  if (!balas || !balas.ok) {
    return {
      ok: false,
      perangkat: [],
      galat: (balas && balas.pesan) || "Perangkat output tidak dapat dibaca.",
    };
  }
  const perangkat = Array.isArray(balas.perangkat) ? balas.perangkat : [];
  return { ok: true, perangkat, galat: "" };
}

/* Putar suara dari berkas lokal atau alamat http(s).
   Bila perangkatId diisi dan berbeda dari perangkat default, perangkat default
   sistem dialihkan sementara (routeSementara: true) sampai suara selesai. */
export async function mainkan({ sumber, volume, perangkatId } = {}) {
  const cek = periksaSumber(sumber);
  if (!cek.ok) return { ok: false, routeSementara: false, pesan: cek.pesan };

  const vol = volume === undefined || volume === null ? -1 : normaVolume(volume);
  const dev = typeof perangkatId === "string" ? perangkatId.trim() : "";
  const baris = [
    "PLAY",
    Buffer.from(cek.jalur, "utf8").toString("base64"),
    String(vol),
    Buffer.from(dev, "utf8").toString("base64"),
  ].join("\t");

  const balas = await kirim(baris);
  if (!balas || !balas.ok) {
    return {
      ok: false,
      routeSementara: false,
      pesan: (balas && balas.pesan) || "Suara tidak dapat diputar.",
    };
  }
  if (!balas.memutar) {
    return { ok: false, routeSementara: false, pesan: "Suara tidak dapat diputar." };
  }
  mulaiPantau();
  return {
    ok: true,
    pesan: String(balas.pesan || "Suara diputar."),
    routeSementara: balas.routeSementara === true,
    perangkatId: String(balas.perangkatId || ""),
    volume: Number(balas.volume) || 0,
  };
}

/* Hentikan pemutaran dan pulihkan perangkat default bila sempat dialihkan. */
export async function hentikan() {
  hentikanPantau();
  const balas = await kirim("STOP");
  if (!balas || !balas.ok) {
    return { ok: false, pesan: (balas && balas.pesan) || "Pemutaran tidak dapat dihentikan." };
  }
  return { ok: true, pesan: String(balas.pesan || "Pemutaran dihentikan.") };
}

/* Keadaan pemutar saat ini. */
export async function statusPemutar() {
  const kosong = { ok: false, memutar: false, sumber: "", volume: 0, perangkatId: "" };
  const balas = await kirim("STATUS");
  if (!balas || !balas.ok) {
    return { ...kosong, pesan: (balas && balas.pesan) || "Keadaan pemutar tidak dapat dibaca." };
  }
  return {
    ok: true,
    memutar: balas.memutar === true,
    sumber: String(balas.sumber || ""),
    volume: Number(balas.volume) || 0,
    perangkatId: String(balas.perangkatId || ""),
  };
}

/* Atur volume pemutar 0-100. */
export async function aturVolume(nilai) {
  const vol = normaVolume(nilai);
  const balas = await kirim("VOL\t" + String(vol));
  if (!balas || !balas.ok) {
    return { ok: false, volume: vol };
  }
  return { ok: true, volume: Number(balas.volume) || 0 };
}

/* Penghentian sinkron untuk penutupan proses. Setelah ini modul tidak akan
   pernah menghidupkan proses PowerShell lagi (lihat penjaga "dimatikan"). */
export function hentikanAudio() {
  dimatikan = true;
  hentikanPantau();
  if (!proses) {
    hapusSkrip();
    return;
  }
  const anak = proses;
  proses = null;
  gagalMenunggu("Pemutar audio dihentikan.");
  try {
    anak.stdin.write("TUTUP\n");
    anak.stdin.end();
  } catch {
    /* diabaikan */
  }
  /* Jaring pengaman bila proses membandel; tidak menghidupkan proses baru. */
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




