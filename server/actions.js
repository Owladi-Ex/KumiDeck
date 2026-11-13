/* Pelaksana aksi di komputer host (Windows).

   Jenis aksi: hotkey, teks, buka, http, media, halaman, urutan.
   Semua efek sistem dijalankan lewat PowerShell dengan kode yang dibangun di
   sini dari daftar putih (tidak ada masukan pengguna yang disisipkan mentah ke
   dalam skrip). */

import { spawn } from "node:child_process";
import { jalankanJendela, jalankanDaya, AKSI_JENDELA, AKSI_DAYA } from "./window-actions.js";
import { perintahVolume } from "./volume.js";
import { cocokSyarat, infoJendela } from "./window.js";

/* Kode tombol virtual Windows (VK). */
const VK = {
  ctrl: 0x11,
  control: 0x11,
  shift: 0x10,
  alt: 0x12,
  win: 0x5b,
  windows: 0x5b,
  meta: 0x5b,
  enter: 0x0d,
  return: 0x0d,
  tab: 0x09,
  esc: 0x1b,
  escape: 0x1b,
  space: 0x20,
  backspace: 0x08,
  del: 0x2e,
  delete: 0x2e,
  insert: 0x2d,
  ins: 0x2d,
  home: 0x24,
  end: 0x23,
  pageup: 0x21,
  pagedown: 0x22,
  up: 0x26,
  down: 0x28,
  left: 0x25,
  right: 0x27,
  printscreen: 0x2c,
  capslock: 0x14,
  numlock: 0x90,
  scrolllock: 0x91,
  minus: 0xbd,
  equal: 0xbb,
  plus: 0xbb,
  comma: 0xbc,
  period: 0xbe,
  slash: 0xbf,
  backslash: 0xdc,
  semicolon: 0xba,
  quote: 0xde,
  backtick: 0xc0,
  bracketleft: 0xdb,
  bracketright: 0xdd,
  volumeup: 0xaf,
  volumedown: 0xae,
  volumemute: 0xad,
  playpause: 0xb3,
  nexttrack: 0xb0,
  prevtrack: 0xb1,
  stopmedia: 0xb2,
};

const MEDIA_VK = {
  playpause: 0xb3,
  next: 0xb0,
  prev: 0xb1,
  volup: 0xaf,
  voldown: 0xae,
  mute: 0xad,
};

const POWER_SHELL = "powershell.exe";
const KEYEVENTF_KEYUP = 2;

function vkUntuk(nama) {
  const kunci = String(nama).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(VK, kunci)) return VK[kunci];
  if (/^f([1-9]|1\d|2[0-4])$/.test(kunci)) return 0x6f + Number(kunci.slice(1)); /* F1..F24 */
  if (/^[a-z]$/.test(kunci)) return kunci.toUpperCase().charCodeAt(0);
  if (/^[0-9]$/.test(kunci)) return 0x30 + Number(kunci);
  if (/^numpad[0-9]$/.test(kunci)) return 0x60 + Number(kunci.slice(6));
  if (kunci === "numpadplus") return 0x6b;
  if (kunci === "numpadminus") return 0x6d;
  if (kunci === "numpadmultiply") return 0x6a;
  if (kunci === "numpaddivide") return 0x6f;
  if (kunci === "numpaddecimal") return 0x6e;
  return null;
}

/* Pecah "ctrl+shift+m" → { mods: [0x11,0x10], kunci: 0x4D }. */
function uraiCombo(combo) {
  const bagian = String(combo)
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!bagian.length) return null;
  const mods = [];
  const sisa = [];
  for (const nama of bagian) {
    const vk = vkUntuk(nama);
    if (vk === null) return { galat: "Tombol tidak dikenal: " + nama };
    if (["ctrl", "control", "shift", "alt", "win", "windows", "meta"].includes(nama.toLowerCase())) {
      mods.push(vk);
    } else {
      sisa.push(vk);
    }
  }
  if (sisa.length !== 1) return { galat: "Pintasan harus punya tepat satu tombol utama." };
  if (mods.length > 3) return { galat: "Terlalu banyak tombol pengubah." };
  return { mods, kunci: sisa[0] };
}

function jalankanPowerShell(skrip, batasMs = 4000) {
  return new Promise((resolve) => {
    let selesai = false;
    let proses;
    try {
      proses = spawn(POWER_SHELL, ["-NoProfile", "-NonInteractive", "-Command", skrip], {
        windowsHide: true,
        stdio: "ignore",
      });
    } catch (err) {
      resolve({ ok: false, message: "PowerShell tidak dapat dijalankan." });
      return;
    }
    const jam = setTimeout(() => {
      if (selesai) return;
      selesai = true;
      try {
        proses.kill();
      } catch (err) {
        /* diabaikan */
      }
      resolve({ ok: true, message: "Perintah dikirim (waktu tunggu habis)." });
    }, batasMs);
    proses.on("error", () => {
      if (selesai) return;
      selesai = true;
      clearTimeout(jam);
      resolve({ ok: false, message: "PowerShell tidak dapat dijalankan." });
    });
    proses.on("exit", (kode) => {
      if (selesai) return;
      selesai = true;
      clearTimeout(jam);
      if (kode === 0) resolve({ ok: true, message: "" });
      else resolve({ ok: false, message: "Perintah gagal (kode " + kode + ")." });
    });
  });
}

function skripTombol(mods, kunci) {
  const tekan = mods
    .map((vk) => `Tombol ${vk} 0; Start-Sleep -Milliseconds 20`)
    .join("\n");
  const lepas = mods
    .slice()
    .reverse()
    .map((vk) => `Tombol ${vk} 2`)
    .join("\n");
  return [
    "Add-Type -TypeDefinition @'",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public static class KumideckKeys {",
    '  [DllImport("user32.dll")] public static extern void keybd_event(byte kode, byte pindai, uint bendera, UIntPtr info);',
    "}",
    "'@",
    "function Tombol($kode, $up) {",
    "  [KumideckKeys]::keybd_event([byte]$kode, 0, [uint32]$up, [UIntPtr]::Zero)",
    "  Start-Sleep -Milliseconds 25",
    "}",
    tekan,
    `Tombol ${kunci} 0`,
    "Start-Sleep -Milliseconds 30",
    `Tombol ${kunci} ${KEYEVENTF_KEYUP}`,
    lepas,
  ].join("\n");
}

/* Escape untuk SendKeys: karakter khusus harus dibungkus kurung kurawal. */
function escapeSendKeys(teks) {
  return String(teks).replace(/[+^%~()[\]{}]/g, (c) => "{" + c + "}");
}

function kutipPs(nilai) {
  return "'" + String(nilai).replace(/'/g, "''") + "'";
}

/* Perluas variabel lingkungan ala Windows (%USERPROFILE%) dan ~. */
export function perluasJalur(target) {
  let hasil = String(target);
  hasil = hasil.replace(/%([^%]+)%/g, (utuh, nama) => {
    const nilai = process.env[nama] ?? process.env[nama.toUpperCase()];
    return nilai === undefined ? utuh : nilai;
  });
  if (hasil.startsWith("~")) {
    const rumah = process.env.USERPROFILE || process.env.HOME || "";
    if (rumah) hasil = rumah + hasil.slice(1);
  }
  return hasil;
}

/* ------------------------------------------------------- aksi http ------ */
/* Saring tujuan aksi http (#SSRF). Loopback/LAN tetap boleh (fitur inti),
   tetapi alamat metadata cloud, link-local, dan port server sendiri ditolak. */
const POLA_TERLARANG = [
  { uji: (h) => h === "169.254.169.254", pesan: "Alamat metadata cloud tidak diizinkan." },
  { uji: (h) => /^169\.254\./.test(h), pesan: "Alamat link-local tidak diizinkan." },
  { uji: (h) => h === "0.0.0.0" || h === "::" || h === "", pesan: "Alamat tujuan tidak sah." },
  { uji: (h) => /^fe80:/i.test(h), pesan: "Alamat link-local IPv6 tidak diizinkan." },
];

function periksaTujuanHttp(url) {
  let data;
  try {
    data = new URL(url);
  } catch (err) {
    return { ok: false, message: "Alamat HTTP tidak sah." };
  }
  if (data.protocol !== "http:" && data.protocol !== "https:") {
    return { ok: false, message: "Hanya http:// dan https:// yang didukung." };
  }
  const host = data.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  for (const pola of POLA_TERLARANG) {
    if (pola.uji(host)) return { ok: false, message: pola.pesan };
  }
  /* Cegah server memanggil dirinya sendiri (rekursi/biaya proses). */
  const port = data.port || (data.protocol === "https:" ? "443" : "80");
  const loopback = host === "127.0.0.1" || host === "::1" || host === "localhost";
  if (loopback && port === String(process.env.PORT || 4173)) {
    return { ok: false, message: "Aksi HTTP tidak boleh memanggil server KumiDeck sendiri." };
  }
  return { ok: true, host: data.host };
}

/* ------------------------------------------------------------- aksi ----- */
const KETERANGAN = {
  hotkey: "Pintasan",
  teks: "Mengetik",
  buka: "Membuka",
  http: "Permintaan HTTP",
  media: "Media",
  urutan: "Urutan",
  halaman: "Pindah halaman",
  jendela: "Tindakan jendela",
  daya: "Daya",
  volume: "Volume",
  kondisional: "Aksi bersyarat",
};

function ringkas(aksi) {
  if (!aksi) return "aksi kosong";
  switch (aksi.type) {
    case "hotkey":
      return "Pintasan " + aksi.combo;
    case "teks":
      return 'Mengetik "' + aksi.text.slice(0, 24) + '"';
    case "buka":
      return "Membuka " + aksi.target.slice(0, 40);
    case "http":
      return aksi.method + " " + aksi.url.slice(0, 48);
    case "media":
      return "Media " + aksi.cmd;
    case "urutan":
      return "Urutan " + aksi.steps.length + " langkah";
    case "halaman":
      return "Pindah halaman";
    case "jendela":
      return "Jendela: " + aksi.cmd;
    case "daya":
      return "Daya: " + aksi.cmd;
    case "volume":
      return aksi.mode === "set" ? "Volume " + aksi.nilai + "%" : "Volume: " + aksi.mode;
    case "kondisional": {
      const aktif = infoJendela();
      const cocok = cocokSyarat(aksi.syarat, aktif);
      return "Bila " + (aksi.syarat.proses || aksi.syarat.jendela) + ": " + (cocok ? "ya" : "tidak");
    }
    default:
      return aksi.type;
  }
}

/* Perintah volume: naik/turun/set/mute (dukungan lama) atau mode baru. */
function perintahVolumeDari(aksi) {
  if (aksi.mode === "naik") return "naik";
  if (aksi.mode === "turun") return "turun";
  if (aksi.mode === "mute") return "mute";
  if (aksi.mode === "set") return "set " + Math.round(aksi.nilai || 50);
  /* Kompatibilitas: aksi media lama volup/voldown/mute. */
  if (aksi.cmd === "volup") return "naik";
  if (aksi.cmd === "voldown") return "turun";
  if (aksi.cmd === "mute") return "mute";
  return "baca";
}

export async function jalankanAksi(aksi, konteks = {}) {
  if (!aksi || aksi.type === "kosong") {
    return { ok: false, message: "Tombol belum diatur.", navigate: null };
  }
  switch (aksi.type) {
    case "jendela": {
      const hasil = await jalankanJendela(aksi.cmd);
      return { ok: hasil.ok, message: hasil.message, navigate: null };
    }

    case "daya": {
      const hasil = await jalankanDaya(aksi.cmd);
      return { ok: hasil.ok, message: hasil.message, navigate: null };
    }

    case "volume": {
      const perintah = perintahVolumeDari(aksi);
      const hasil = await perintahVolume(perintah);
      if (!hasil.ok) {
        return { ok: false, message: hasil.alasan || "Kontrol volume gagal.", navigate: null };
      }
      const persen = typeof hasil.volume === "number" ? hasil.volume : null;
      const pesan =
        persen === null
          ? "Volume diubah."
          : hasil.mute
            ? "Volume " + persen + "% (senyap)"
            : "Volume " + persen + "%";
      return { ok: true, message: pesan, navigate: null, volume: { persen, mute: !!hasil.mute } };
    }

    case "mic": {
      /* Modul audio dimuat malas: KumiDeck tetap jalan kalau PowerShell tidak
         tersedia, dan pemuatan awal tidak diperlambat. */
      try {
        const mod = await import("./mic.js");
        const hasil = await mod.aturMic(aksi.cmd || "togel");
        if (!hasil.ok) {
          return { ok: false, message: hasil.pesan || "Mikrofon tidak dapat diubah.", navigate: null };
        }
        return {
          ok: true,
          message: hasil.mute ? "Mikrofon disenyapkan." : "Mikrofon aktif.",
          navigate: null,
          mic: { mute: !!hasil.mute, volume: hasil.volume },
        };
      } catch (err) {
        return { ok: false, message: "Kontrol mikrofon tidak tersedia.", navigate: null };
      }
    }

    case "suara": {
      const daftar = Array.isArray(konteks.soundboard) ? konteks.soundboard : [];
      const item = daftar.find((s) => s && s.id === aksi.soundId);
      if (!item) {
        return { ok: false, message: "Suara tidak ditemukan di soundboard.", navigate: null };
      }
      try {
        const mod = await import("./audio.js");
        const hasil = await mod.mainkan({
          sumber: item.sumber,
          volume: item.volume,
          perangkatId: item.perangkatId,
        });
        return {
          ok: !!hasil.ok,
          message: hasil.ok ? "Memutar “" + item.name + "”." + (hasil.pesan ? " " + hasil.pesan : "") : hasil.pesan,
          navigate: null,
        };
      } catch (err) {
        return { ok: false, message: "Pemutar suara tidak tersedia.", navigate: null };
      }
    }

    case "kondisional": {
      const dipakai = cocok ? aksi.aktif : aksi.tidakAktif;
      if (!dipakai || dipakai.type === "kosong") {
        return {
          ok: false,
          message: "Syarat " + (cocok ? "terpenuhi" : "tidak terpenuhi") + " dan aksi cadangannya kosong.",
          navigate: null,
        };
      }
      const hasil = await jalankanAksi(dipakai, konteks);
      return {
        ok: hasil.ok,
        message: (cocok ? "[aktif] " : "[tidak aktif] ") + hasil.message,
        navigate: hasil.navigate || null,
        volume: hasil.volume,
      };
    }

    case "hotkey": {
      const urai = uraiCombo(aksi.combo);
      if (!urai) return { ok: false, message: "Pintasan kosong." };
      if (urai.galat) return { ok: false, message: urai.galat };
      const hasil = await jalankanPowerShell(skripTombol(urai.mods, urai.kunci));
      return {
        ok: hasil.ok,
        message: hasil.ok ? "Pintasan dikirim: " + aksi.combo : hasil.message,
      };
    }

    case "teks": {
      const skrip = [
        "Add-Type -AssemblyName System.Windows.Forms",
        "Start-Sleep -Milliseconds 120",
        "[System.Windows.Forms.SendKeys]::SendWait(" + kutipPs(escapeSendKeys(aksi.text)) + ")",
      ].join("\n");
      const hasil = await jalankanPowerShell(skrip);
      return {
        ok: hasil.ok,
        message: hasil.ok ? "Teks dikirim." : hasil.message,
      };
    }

    case "buka": {
      const target = perluasJalur(aksi.target);
      const skrip = "Start-Process " + kutipPs(target);
      const hasil = await jalankanPowerShell(skrip);
      return {
        ok: hasil.ok,
        message: hasil.ok ? "Membuka " + target : hasil.message,
      };
    }

    case "http": {
      /* Aksi http memang untuk jaringan lokal (saklar rumah pintar, webhook),
         jadi loopback/LAN sengaja diizinkan. Yang dicegah: alamat metadata
         cloud/link-local, port server KumiDeck sendiri (mencegah rekursi yang
         bisa dipakai memperbanyak permintaan), redirect ke host lain, dan
         membaca isi balasan (hanya status yang dilaporkan). */
      const tujuan = periksaTujuanHttp(aksi.url);
      if (!tujuan.ok) return { ok: false, message: tujuan.message };

      const kendali = new AbortController();
      const jam = setTimeout(() => kendali.abort(), 8000);
      try {
        const headers = {};
        for (const h of aksi.headers || []) headers[h.name] = h.value;
        const opsi = {
          method: aksi.method,
          headers,
          signal: kendali.signal,
          redirect: "manual",
        };
        if (aksi.body && aksi.method !== "GET") opsi.body = aksi.body;
        const res = await fetch(aksi.url, opsi);
        clearTimeout(jam);
        /* Isi balasan dibuang: mencegah payload besar masuk ke memori server. */
        try {
          if (res.body && res.body.cancel) await res.body.cancel();
        } catch (err) {
          /* diabaikan */
        }
        return {
          ok: res.status >= 200 && res.status < 400,
          message: "HTTP " + res.status + " · " + tujuan.host,
        };
      } catch (err) {
        clearTimeout(jam);
        const sebab = err && err.name === "AbortError" ? "waktu habis" : err.message;
        return { ok: false, message: "Gagal menghubungi " + tujuan.host + " (" + sebab + ")." };
      }
    }

    case "media": {
      /* Volume & senyap kini lewat Core Audio agar nilainya bisa dilaporkan. */
      if (aksi.cmd === "volup" || aksi.cmd === "voldown" || aksi.cmd === "mute") {
        return jalankanAksi({ type: "volume", cmd: aksi.cmd }, konteks);
      }
      const vk = MEDIA_VK[aksi.cmd];
      if (!vk) return { ok: false, message: "Perintah media tidak dikenal." };
      const hasil = await jalankanPowerShell(skripTombol([], vk));
      return { ok: hasil.ok, message: hasil.ok ? "Media: " + aksi.cmd : hasil.message };
    }

    case "halaman": {
      if (!konteks.halamanAda || !konteks.halamanAda.includes(aksi.pageId)) {
        return { ok: false, message: "Halaman tujuan tidak ditemukan." };
      }
      return { ok: true, message: "Pindah halaman.", navigate: aksi.pageId };
    }

    case "urutan": {
      const catatan = [];
      for (const langkah of aksi.steps) {
        if (langkah.delay) await new Promise((r) => setTimeout(r, langkah.delay));
        const hasil = await jalankanAksi(langkah.action, konteks);
        catatan.push((hasil.ok ? "ok: " : "gagal: ") + ringkas(langkah.action));
        if (hasil.navigate) return { ok: true, message: catatan.join(", "), navigate: hasil.navigate };
      }
      return { ok: true, message: "Urutan selesai (" + catatan.length + " langkah)." };
    }

    default:
      return { ok: false, message: "Jenis aksi tidak dikenal." };
  }
}

export { ringkas, KETERANGAN };

