/* apps.js - pemindai aplikasi terpasang di Windows untuk pemilih aplikasi.

   Sumber data:
   - Aplikasi desktop klasik: pintasan *.lnk di folder Start Menu pengguna dan
     All Users, diselesaikan lewat COM WScript.Shell (TargetPath + Arguments).
   - Aplikasi Store/UWP: keluaran PowerShell Get-StartApps (Name + AppID),
     targetnya "shell:AppsFolder\<AppID>".

   Pemindaian berjalan di proses PowerShell terpisah dengan batas waktu dan
   hasilnya di-cache 5 menit. Fungsi utama tidak pernah melempar galat: bila
   sebagian pemindaian gagal, aplikasi yang berhasil tetap dikembalikan
   bersama pesan `galat`. */

import { spawn } from "node:child_process";
import { envPowerShell } from "./ps.js";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

/* Konstanta. */

const UMUR_CACHE_MS = 5 * 60 * 1000;

/* Batas waktu tiap perintah PowerShell (dua pemindaian berjalan paralel,
   sehingga total pemindaian tetap di bawah 20 detik). */
const BATAS_WAKTU_PS_MS = 15000;

const IKON_DIIZINKAN = new Set([
  "i-play",
  "i-volume",
  "i-gamepad",
  "i-code",
  "i-image",
  "i-globe",
  "i-mail",
  "i-users",
  "i-chart-bar",
  "i-folder",
  "i-file",
  "i-plus",
  "i-settings",
  "i-database",
  "i-bell",
  "i-cloud",
  "i-bolt",
  "i-shield",
  "i-book",
  "i-grid",
]);

const POLA_LEWATI =
  /uninstall|uninst|setup|update|readme|help|license|documentation|website|changelog/i;

/* Pola aplikasi bawaan sistem yang tidak perlu ditampilkan dari Get-StartApps. */
const POLA_SISTEM_STORE =
  /^(settings|cortana|search|security|get help|tips|mixed reality|quick assist|phone link|xbox game bar)/i;

/* Heuristik ikon: diperiksa berurutan, yang pertama cocok menang.
   Pemetaan wajib untuk aplikasi yang sudah dikenal ada di bagian atas. */
const PETUNJUK_IKON = [
  [/spotify/, "i-play"],
  [/discord/, "i-users"],
  [/steam|epic games|gog galaxy|\bgog\b/, "i-gamepad"],
  [
    /visual studio code|vscode|sublime|notepad\+\+|intellij|pycharm|webstorm|android studio|opencode|cursor|\bcode\b/,
    "i-code",
  ],
  [/chrome|edge|brave|firefox|opera|vivaldi|browser/, "i-globe"],
  [/notepad/, "i-file"],
  [/calculator|\bcalc\b/, "i-plus"],
  [
    /paint|photoshop|gimp|figma|blender|affinity|canva|inkscape|krita|\bobs\b|image|photo|camera/,
    "i-image",
  ],
  [/vlc|foobar|itunes|media player|winamp|music|audio player/, "i-play"],
  [
    /terminal|powershell|\bcmd\b|command prompt|windows terminal|\bwt\b/,
    "i-code",
  ],
  [/explorer|file manager/, "i-folder"],
  [/\bword\b|excel|powerpoint|libreoffice|acrobat|pdf/, "i-file"],
  [
    /whatsapp|telegram|signal|zoom|teams|slack|discord|meet\b|chatgpt|claude/,
    "i-users",
  ],
  [/thunderbird|outlook|\bmail\b/, "i-mail"],
  [/onedrive|dropbox|google drive|\bcloud\b/, "i-cloud"],
  [/todoist|notion|obsidian|onenote|evernote|\bbook\b/, "i-book"],
  [/database|\bsql\b|mongodb|redis/, "i-database"],
  [/antivirus|defender|security|vpn|\bshield\b/, "i-shield"],
  [/\bsettings\b|control panel/, "i-settings"],
  [/\bvolume\b|realtek|audio console/, "i-volume"],
  [/chart|statistic|graph/, "i-chart-bar"],
  [/notification|alarm|reminder/, "i-bell"],
  [/game|gaming|roblox|bloxstrap|xbox/, "i-gamepad"],
  [/power|battery|energy|\bbolt\b/, "i-bolt"],
];

/* Aplikasi terkenal dengan protokol URI yang terdaftar di Windows. Alamat
   protokol dipakai karena tahan terhadap pembaruan aplikasi. Hanya tiga
   protokol ini yang ditulis langsung (tanpa membaca registry agar cepat),
   ditambah ms-settings: untuk Settings. */
const PROTOKOL_TERKENAL = [
  [/\bspotify\b/i, "spotify:"],
  [/\bdiscord\b/i, "discord:"],
  [/\bsteam\b/i, "steam:"],
];

/* Cache. */

/* cache = { hasil, kedaluwarsa } atau null bila kosong. */
let cache = null;

let sedangMemindai = null;

/* Kosongkan cache hasil pemindaian, misalnya setelah pengguna memasang
   aplikasi baru lalu meminta daftar ulang. */
export function kosongkanCache() {
  cache = null;
}

/* Utilitas teks. */

/* Kunci pembanding nama aplikasi: huruf kecil, spasi dirapikan. */
function kunciNama(nama) {
  return String(nama || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/* Rapikan nama tampilan: hapus akhiran " - Shortcut", rapikan spasi,
   batasi 40 karakter. */
function bersihkanNama(nama) {
  let hasil = String(nama || "")
    .replace(/\s+/g, " ")
    .trim();
  hasil = hasil.replace(/\s*-\s*shortcut$/i, "").trim();
  if (hasil.length > 40) hasil = hasil.slice(0, 40).trim();
  return hasil;
}

function pilihIkon(nama, target) {
  const teks = `${nama} ${target}`.toLowerCase();
  for (const [pola, ikon] of PETUNJUK_IKON) {
    if (pola.test(teks)) return IKON_DIIZINKAN.has(ikon) ? ikon : "i-grid";
  }
  return "i-grid";
}

/* Target protokol untuk aplikasi terkenal; selain itu pakai target asli. */
function tentukanTarget(nama, target) {
  for (const [pola, protokol] of PROTOKOL_TERKENAL) {
    if (pola.test(nama)) return protokol;
  }
  /* Settings: pakai protokol ms-settings: hanya bila memang aplikasi Settings. */
  if (/^(windows\s+)?settings$/i.test(String(nama).trim())) return "ms-settings:";
  return target;
}

function bentukAplikasi(butir) {
  const nama = bersihkanNama(butir.nama);
  const target = tentukanTarget(nama, String(butir.target || ""));
  const icon = pilihIkon(nama, target);
  const id =
    "a_" + createHash("sha1").update(`${nama}|${target}`, "utf8").digest("hex").slice(0, 8);
  return { id, name: nama, target, icon, sumber: butir.sumber };
}

/* Eksekusi PowerShell. */

/* Pesan galat PowerShell yang ramah dibaca (buang pembungkus CLIXML). */
function pesanGalatPs(stderr) {
  const baris = String(stderr || "")
    .replace(/#< CLIXML[\s\S]*/i, "")
    .split(/\r?\n/)
    .map((teks) => teks.trim())
    .filter(Boolean)[0];
  return baris || "perintah PowerShell tidak memberikan keterangan";
}

/* Ringkas galat tak terduga menjadi satu baris. */
function pesanRamah(err) {
  const teks = err && err.message ? String(err.message) : String(err);
  return teks.replace(/\s+/g, " ").trim().slice(0, 200);
}

/* Pesan khusus bila PowerShell tidak bisa dipanggil sama sekali. */
function pesanSpawn(err) {
  if (err && err.code === "ENOENT") return "powershell.exe tidak ditemukan di PATH";
  return pesanRamah(err);
}

/* Jalankan naskah PowerShell dan urai keluarannya sebagai array JSON.
   Tidak pernah melempar galat; gagal = { data: null, galat: "..." } */
function jalankanPowerShell(naskah, label) {
  return new Promise((resolve) => {
    const argumen = [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      Buffer.from(naskah, "utf16le").toString("base64"),
    ];

    let anak;
    try {
      anak = spawn("powershell.exe", argumen, {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: envPowerShell(),
      });
    } catch (err) {
      resolve({ data: null, galat: `${label} gagal dijalankan: ${pesanSpawn(err)}.` });
      return;
    }

    let stdout = "";
    let stderr = "";
    let selesai = false;
    let batas = null;

    const akhiri = (hasil) => {
      if (selesai) return;
      selesai = true;
      if (batas) clearTimeout(batas);
      resolve(hasil);
    };

    batas = setTimeout(() => {
      try {
        anak.kill();
      } catch {
        /* proses mungkin sudah berhenti; abaikan */
      }
      akhiri({
        data: null,
        galat: `${label} melebihi batas waktu ${BATAS_WAKTU_PS_MS / 1000} detik.`,
      });
    }, BATAS_WAKTU_PS_MS);

    anak.stdout.setEncoding("utf8");
    anak.stdout.on("data", (potongan) => {
      stdout += potongan;
    });
    anak.stderr.setEncoding("utf8");
    anak.stderr.on("data", (potongan) => {
      stderr += potongan;
    });

    anak.on("error", (err) => {
      akhiri({ data: null, galat: `${label} gagal dijalankan: ${pesanSpawn(err)}.` });
    });

    anak.on("close", (kode) => {
      if (kode !== 0) {
        akhiri({ data: null, galat: `${label} gagal: ${pesanGalatPs(stderr)}.` });
        return;
      }
      const teks = stdout.trim();
      if (!teks) {
        akhiri({ data: [], galat: null });
        return;
      }
      try {
        const urai = JSON.parse(teks);
        const data = Array.isArray(urai) ? urai : urai && typeof urai === "object" ? [urai] : [];
        akhiri({ data, galat: null });
      } catch {
        akhiri({ data: null, galat: `${label} menghasilkan keluaran yang tidak dikenali.` });
      }
    });
  });
}

/* Naskah PowerShell. */

/* Naskah pemindaian pintasan Start Menu. Keluaran: array JSON berisi
   { nama, target, skop }. */
function naskahKlasik() {
  return String.raw`$ProgressPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$akar = @(
  [pscustomobject]@{ Skop = 'pengguna'; Jalur = (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs') },
  [pscustomobject]@{ Skop = 'mesin'; Jalur = (Join-Path $env:PROGRAMDATA 'Microsoft\Windows\Start Menu\Programs') }
)

try {
  $ws = New-Object -ComObject WScript.Shell
} catch {
  [Console]::Error.WriteLine('COM WScript.Shell tidak tersedia: ' + $_.Exception.Message)
  exit 1
}

$daftar = New-Object System.Collections.ArrayList
foreach ($item in $akar) {
  if (-not (Test-Path -LiteralPath $item.Jalur -PathType Container)) { continue }
  $berkas = @(Get-ChildItem -LiteralPath $item.Jalur -Recurse -Filter *.lnk -File -ErrorAction SilentlyContinue)
  foreach ($f in $berkas) {
    try {
      $pintasan = $ws.CreateShortcut($f.FullName)
      $target = [string]$pintasan.TargetPath
    } catch { continue }
    if ([string]::IsNullOrWhiteSpace($target)) { continue }
    if (-not $target.ToLowerInvariant().EndsWith('.exe')) { continue }
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { continue }
    [void]$daftar.Add([pscustomobject]@{
      nama = [string]$f.BaseName
      target = $target
      skop = [string]$item.Skop
    })
  }
}

$bagian = @($daftar | ForEach-Object { ConvertTo-Json -InputObject $_ -Compress -Depth 3 })
$teks = '[' + ($bagian -join ',') + ']'
[Console]::Out.WriteLine($teks)`;
}

/* Naskah pemindaian aplikasi Store/UWP lewat Get-StartApps.
   Keluaran: array JSON berisi { nama, appid }. */
function naskahStore() {
  return String.raw`$ProgressPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

try {
  $aplikasi = @(Get-StartApps)
} catch {
  [Console]::Error.WriteLine('Get-StartApps tidak tersedia: ' + $_.Exception.Message)
  exit 1
}

$butir = foreach ($a in $aplikasi) {
  if ([string]::IsNullOrWhiteSpace($a.Name) -or [string]::IsNullOrWhiteSpace($a.AppID)) { continue }
  [pscustomobject]@{ nama = [string]$a.Name; appid = [string]$a.AppID }
}

$bagian = @($butir | ForEach-Object { ConvertTo-Json -InputObject $_ -Compress -Depth 3 })
$teks = '[' + ($bagian -join ',') + ']'
[Console]::Out.WriteLine($teks)`;
}

/* Pemindaian. */

async function pindaiKlasik() {
  const keluaran = await jalankanPowerShell(naskahKlasik(), "Pemindaian pintasan Start Menu");
  if (keluaran.galat) return { aplikasi: [], galat: keluaran.galat };

  const mentah = [];
  for (const butir of keluaran.data) {
    const nama = typeof butir.nama === "string" ? butir.nama : "";
    const target = typeof butir.target === "string" ? butir.target : "";
    if (!nama || !target) continue;
    if (!/\.exe$/i.test(target)) continue;
    if (!existsSync(target)) continue;
    if (POLA_LEWATI.test(nama) || POLA_LEWATI.test(target)) continue;
    mentah.push({
      nama,
      target,
      sumber: "klasik",
      skop: butir.skop === "pengguna" ? 0 : 1,
    });
  }

  /* Utamakan pintasan lingkup pengguna bila ada nama yang sama. */
  mentah.sort((a, b) => a.skop - b.skop);

  const hasil = [];
  const kunci = new Set();
  for (const butir of mentah) {
    const nama = bersihkanNama(butir.nama);
    if (!nama) continue;
    const k = kunciNama(nama);
    if (kunci.has(k)) continue;
    kunci.add(k);
    hasil.push({ nama, target: butir.target, sumber: "klasik" });
  }
  return { aplikasi: hasil, galat: null };
}

async function pindaiStore() {
  const keluaran = await jalankanPowerShell(naskahStore(), "Pemindaian aplikasi Store");
  if (keluaran.galat) return { aplikasi: [], galat: keluaran.galat };

  const hasil = [];
  const kunci = new Set();
  for (const butir of keluaran.data) {
    const nama = bersihkanNama(butir.nama);
    const appid = String(butir.appid || "").trim();
    if (!nama || !appid) continue;
    /* Lewati AppID berbentuk URL (bukan aplikasi sungguhan). */
    if (/^[a-z]+:\/\//i.test(appid)) continue;
    if (POLA_LEWATI.test(nama)) continue;
    if (POLA_SISTEM_STORE.test(nama)) continue;
    const k = kunciNama(nama);
    if (kunci.has(k)) continue;
    kunci.add(k);
    hasil.push({ nama, target: `shell:AppsFolder\\${appid}`, sumber: "store" });
  }
  return { aplikasi: hasil, galat: null };
}

/* Aplikasi terkenal yang dipasang di luar Start Menu. Dipakai sebagai
   cadangan bila pintasan tidak ada; hanya ditambahkan jika berkasnya nyata. */
function kandidatTerkenal() {
  const daftar = [];
  const appData = process.env.APPDATA || "";
  const localAppData = process.env.LOCALAPPDATA || "";
  const programFiles = process.env.ProgramFiles || process.env.PROGRAMFILES || "";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "";

  const tambah = (nama, target, jalurKandidat) => {
    for (const jalur of jalurKandidat) {
      if (!jalur || !path.isAbsolute(jalur)) continue;
      if (!existsSync(jalur)) continue;
      daftar.push({ nama, target, sumber: "klasik" });
      return;
    }
  };

  tambah("Spotify", "spotify:", [path.join(appData, "Spotify", "Spotify.exe")]);
  tambah("Discord", "discord:", [
    path.join(localAppData, "Discord", "Update.exe"),
    path.join(localAppData, "Discord", "Discord.exe"),
  ]);
  tambah("Steam", "steam:", [
    path.join(programFilesX86, "Steam", "steam.exe"),
    path.join(programFiles, "Steam", "steam.exe"),
  ]);

  return daftar;
}

/* Gabungkan kedua sumber, buang duplikat nama, beri ikon dan id, lalu urutkan. */
async function pindaiSemua() {
  const galat = [];
  const [klasik, store] = await Promise.all([pindaiKlasik(), pindaiStore()]);
  if (klasik.galat) galat.push(klasik.galat);
  if (store.galat) galat.push(store.galat);

  /* Aplikasi klasik diutamakan karena targetnya berupa jalur exe/protokol. */
  const mentah = [...klasik.aplikasi];
  const kunci = new Set(mentah.map((butir) => kunciNama(butir.nama)));
  for (const butir of store.aplikasi) {
    const k = kunciNama(butir.nama);
    if (kunci.has(k)) continue;
    kunci.add(k);
    mentah.push(butir);
  }
  for (const butir of kandidatTerkenal()) {
    const k = kunciNama(butir.nama);
    if (kunci.has(k)) continue;
    kunci.add(k);
    mentah.push(butir);
  }

  const aplikasi = mentah.map(bentukAplikasi).filter((butir) => butir.name && butir.target);
  aplikasi.sort((a, b) =>
    a.name.localeCompare(b.name, "id", { numeric: true, sensitivity: "base" })
  );

  return {
    aplikasi,
    diambil: Date.now(),
    galat: galat.length > 0 ? galat.join(" ") : null,
  };
}

/* API publik. */

/* Daftar aplikasi terpasang. Hasil di-cache 5 menit; opsi.paksa = true
   memaksa pemindaian ulang. Fungsi ini tidak pernah melempar galat. */
export async function daftarAplikasi(opsi = {}) {
  try {
    const paksa = opsi && typeof opsi === "object" && opsi.paksa === true;

    if (!paksa && cache && Date.now() < cache.kedaluwarsa) {
      return cache.hasil;
    }

    /* Bila pemindaian sedang berjalan, permintaan kedua menunggu janji yang
       sama. Tanpa ini, dua permintaan serentak memulai dua pemindaian penuh
       (masing-masing beberapa proses PowerShell) dan hasil yang lebih dulu
       selesai bisa menimpa cache dengan data parsial. */
    if (sedangMemindai) return sedangMemindai;

    sedangMemindai = (async () => {
      try {
        const hasil = await pindaiSemua();
        cache = { hasil, kedaluwarsa: Date.now() + UMUR_CACHE_MS };
        return hasil;
      } finally {
        sedangMemindai = null;
      }
    })();

    return await sedangMemindai;
  } catch (err) {
    /* Jaring pengaman terakhir: tetap kembalikan bentuk hasil yang sah. */
    return {
      aplikasi: [],
      diambil: Date.now(),
      galat: `Pemindaian aplikasi gagal: ${pesanRamah(err)}.`,
    };
  }
}

export default daftarAplikasi;

