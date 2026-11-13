/* Penyimpanan deck: baca/tulis data/deck.json + token pasangan di
   data/secret.json. Semua masukan dari klien divalidasi dan dinormalkan di
   sini supaya berkas yang tersimpan selalu berbentuk benar. */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const AKAR = akarProyek();
const DIR_DATA = path.join(AKAR, "data");
const BERKAS_DECK = path.join(DIR_DATA, "deck.json");
const BERKAS_RAHASIA = path.join(DIR_DATA, "secret.json");

/* Menentukan folder aplikasi (tempat `public/` dan `data/`):
   1. KD_ROOT — dipakai saat pengujian/paket khusus;
   2. __KD_BASE — diisi pembungkus .exe portabel (folder di samping exe);
   3. ESM biasa — relatif terhadap berkas ini;
   4. cadangan terakhir — folder executable. */
function akarProyek() {
  if (process.env.KD_ROOT) return path.resolve(process.env.KD_ROOT);
  if (globalThis.__KD_BASE) return path.resolve(globalThis.__KD_BASE);
  try {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  } catch (err) {
    /* diabaikan: import.meta tidak tersedia pada bundel CJS */
  }
  try {
    if (typeof __dirname === "string") return path.resolve(__dirname, "..");
  } catch (err) {
    /* diabaikan */
  }
  return path.dirname(process.execPath);
}

const IKON_SAH = /^i-[a-z0-9-]+$/;
const VARIAN = ["default", "tint", "accent", "lime", "dark"];
const MEDIA = ["playpause", "next", "prev", "volup", "voldown", "mute"];
const JENDELA = [
  "minimize",
  "maximize",
  "restore",
  "kiri",
  "kanan",
  "monitor-berikut",
  "task-view",
  "tampilkan-desktop",
  "tutup-jendela",
];
const DAYA = ["tidur", "kunci", "restart", "matikan", "batal"];
const VOLUME = ["naik", "turun", "mute", "set", "baca"];
const MIC = ["togel", "senyap", "nyala"];
/* Suara soundboard: berkas lokal atau tautan http(s). */
const SUMBER_SUARA = /^(https?:\/\/|(?:[A-Za-z]:\\)|(?:\\\\|%))/;
const METODE = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function pastikanDir() {
  if (!fs.existsSync(DIR_DATA)) fs.mkdirSync(DIR_DATA, { recursive: true });
}

function idBaru(prefix) {
  return prefix + crypto.randomBytes(4).toString("hex");
}

function teks(nilai, maks, bawaan = "") {
  if (typeof nilai !== "string") return bawaan;
  const bersih = nilai.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return bersih.slice(0, maks) || bawaan;
}

/* ------------------------------------------------------------ aksi ------ */
/* Aksi kondisional (#17): satu tombol bisa berisi aksi "saat ini aktif" dan
   "saat tidak aktif", memeriksa aplikasi/jendela di depan. */
function normalSyarat(syarat) {
  if (!syarat || typeof syarat !== "object") return null;
  const proses = teks(syarat.proses, 64, "");
  const jendela = teks(syarat.jendela, 80, "");
  if (!proses && !jendela) return null;
  return { proses, jendela };
}

/* `kedalaman` membatasi aksi bersarang (urutan di dalam urutan) supaya tidak
   bisa dipakai mengalikan jumlah proses PowerShell secara eksponensial. */
export function normalAksi(aksi, kedalaman = 0) {
  if (!aksi || typeof aksi !== "object") return { type: "kosong" };
  if (kedalaman > 3) return { type: "kosong" };
  switch (aksi.type) {
    case "hotkey": {
      const combo = teks(aksi.combo, 64, "");
      if (!combo) return { type: "kosong" };
      return { type: "hotkey", combo };
    }
    case "teks": {
      const isi = typeof aksi.text === "string" ? aksi.text.slice(0, 200) : "";
      if (!isi) return { type: "kosong" };
      return { type: "teks", text: isi };
    }
    case "buka": {
      const target = teks(aksi.target, 500, "");
      if (!target) return { type: "kosong" };
      return { type: "buka", target };
    }
    case "http": {
      const url = teks(aksi.url, 500, "");
      if (!/^https?:\/\//i.test(url)) return { type: "kosong" };
      let host = "";
      try {
        host = new URL(url).hostname;
      } catch (err) {
        return { type: "kosong" };
      }
      /* Hanya alamat lokal/HTTP biasa; cegah permintaan ke jaringan internal
         lewat protokol lain (file:, dsb.). */
      if (!host) return { type: "kosong" };
      const metode = METODE.includes(String(aksi.method).toUpperCase())
        ? String(aksi.method).toUpperCase()
        : "GET";
      const headers = Array.isArray(aksi.headers)
        ? aksi.headers
            .filter((h) => h && typeof h.name === "string" && h.name.trim())
            .slice(0, 10)
            .map((h) => ({ name: teks(h.name, 64), value: teks(String(h.value ?? ""), 300) }))
        : [];
      const body = metode === "GET" || metode === "HEAD" ? "" : String(aksi.body ?? "").slice(0, 4000);
      return { type: "http", method: metode, url, body, headers };
    }
    case "media": {
      const cmd = MEDIA.includes(aksi.cmd) ? aksi.cmd : "playpause";
      return { type: "media", cmd };
    }
    case "jendela": {
      const cmd = JENDELA.includes(aksi.cmd) ? aksi.cmd : "";
      return cmd ? { type: "jendela", cmd } : { type: "kosong" };
    }
    case "daya": {
      const cmd = DAYA.includes(aksi.cmd) ? aksi.cmd : "";
      /* Hanya tidur & kunci tanpa konfirmasi; restart/matikan tetap butuh
         konfirmasi di klien (dijaga juga di sini lewat flag). */
      return cmd ? { type: "daya", cmd } : { type: "kosong" };
    }
    case "volume": {
      const mode = VOLUME.includes(aksi.mode) ? aksi.mode : aksi.cmd || "naik";
      const amanMode = VOLUME.includes(mode) ? mode : "naik";
      if (amanMode === "set") {
        const nilai = Math.max(0, Math.min(100, Math.round(Number(aksi.nilai) || 50)));
        return { type: "volume", mode: "set", nilai };
      }
      return { type: "volume", mode: amanMode };
    }
    case "mic": {
      const cmd = MIC.includes(aksi.cmd) ? aksi.cmd : "togel";
      return { type: "mic", cmd };
    }
    case "suara": {
      const soundId = teks(aksi.soundId, 40, "");
      return soundId ? { type: "suara", soundId } : { type: "kosong" };
    }
    case "halaman": {
      const pageId = teks(aksi.pageId, 64, "");      return pageId ? { type: "halaman", pageId } : { type: "kosong" };
    }
    case "urutan": {
      const langkah = Array.isArray(aksi.steps) ? aksi.steps.slice(0, 12) : [];
      const bersih = langkah
        .map((l) => ({
          delay: Math.min(5000, Math.max(0, Number(l && l.delay) || 0)),
          action: normalAksi(l && l.action, kedalaman + 1),
        }))
        .filter((l) => l.action.type !== "kosong");
      return bersih.length ? { type: "urutan", steps: bersih } : { type: "kosong" };
    }
    case "kondisional": {
      const syarat = normalSyarat(aksi.syarat);
      const aktif = normalAksi(aksi.aktif);
      const tidak = normalAksi(aksi.tidakAktif);
      /* Kondisi harus jelas dan minimal satu cabang berisi. */
      if (!syarat || (aktif.type === "kosong" && tidak.type === "kosong")) {
        return { type: "kosong" };
      }
      return { type: "kondisional", syarat, aktif, tidakAktif: tidak };
    }
    default:
      return { type: "kosong" };
  }
}

/* ------------------------------------------------------------ widget ----- */
/* Widget = tombol tampilan (bukan aksi): jam, tanggal, atau media yang
   sedang diputar. Nilainya diisi server/klien saat berjalan. */
export const WIDGET_SAH = ["jam", "tanggal", "media"];

function normalWidget(widget) {
  if (!widget || typeof widget !== "object") return null;
  const tipe = WIDGET_SAH.includes(widget.type) ? widget.type : null;
  return tipe ? { type: tipe } : null;
}

/* ------------------------------------------------------------ tombol ---- */
/* Warna tombol: kunci varian Kumi, atau kustom { bg, fg } dari pemilih warna. */
function normalWarna(warna) {
  if (!warna || typeof warna !== "object") return null;
  const bg = typeof warna.bg === "string" && /^#[0-9a-f]{6}$/i.test(warna.bg) ? warna.bg.toLowerCase() : "";
  const fg = typeof warna.fg === "string" && /^#[0-9a-f]{6}$/i.test(warna.fg) ? warna.fg.toLowerCase() : "";
  if (!bg) return null;
  return { bg, fg: fg || "" };
}
/* Penanda status (#20): tombol menyala bila jendela/aplikasi cocok. */
function normalTandaAktif(tanda) {
  if (!tanda || typeof tanda !== "object") return null;
  const proses = teks(tanda.proses, 64, "");
  const jendela = teks(tanda.jendela, 80, "");
  if (!proses && !jendela) return null;
  return { proses, jendela };
}

export function normalTombol(tombol, idFallback) {
  if (!tombol || typeof tombol !== "object") return null;
  const label = teks(tombol.label, 24, "Tombol");
  /* Ikon: nama sprite Kumi (i-...) atau ikon kustom (kst_<id>). */
  const ikon =
    typeof tombol.icon === "string" && (IKON_SAH.test(tombol.icon) || /^kst_[a-z0-9]{4,16}$/.test(tombol.icon))
      ? tombol.icon
      : "i-grid";
  const varian = VARIAN.includes(tombol.variant) ? tombol.variant : "default";
  const widget = normalWidget(tombol.widget);
  return {
    id: teks(tombol.id, 40, idFallback),
    label,
    icon: ikon,
    variant: varian,
    warna: normalWarna(tombol.warna),
    widget,
    tandaiAktif: widget ? null : normalTandaAktif(tombol.tandaiAktif),
    /* Tombol widget hanya menampilkan data; aksinya selalu kosong. */
    action: widget ? { type: "kosong" } : normalAksi(tombol.action),
  };
}

/* ----------------------------------------------------------- halaman ---- */
function normalHalaman(halaman, kolom, baris, halamanSah) {
  const jumlah = kolom * baris;
  const id = teks(halaman && halaman.id, 40, idBaru("p_"));
  const nama = teks(halaman && halaman.name, 24, "Halaman");
  const sumber = Array.isArray(halaman && halaman.keys) ? halaman.keys : [];
  const keys = [];
  for (let i = 0; i < jumlah; i += 1) {
    const tombol = normalTombol(sumber[i], "k_" + crypto.randomBytes(3).toString("hex"));
    /* Aksi "halaman" di mana pun (termasuk di urutan/kondisional) harus
       menunjuk halaman yang masih ada; bila tidak, jadikan kosong. */
    if (tombol) tombol.action = rapikanHalamanDiAksi(tombol.action, halamanSah);
    keys.push(tombol);
  }
  return { id, name: nama, keys };
}

function rapikanHalamanDiAksi(aksi, halamanSah) {
  if (!aksi || typeof aksi !== "object") return aksi;
  if (aksi.type === "halaman" && !halamanSah.includes(aksi.pageId)) {
    return { type: "kosong" };
  }
  if (aksi.type === "urutan") {
    aksi.steps = aksi.steps
      .map((l) => ({ delay: l.delay, action: rapikanHalamanDiAksi(l.action, halamanSah) }))
      .filter((l) => l.action.type !== "kosong");
    return aksi.steps.length ? aksi : { type: "kosong" };
  }
  if (aksi.type === "kondisional") {
    aksi.aktif = rapikanHalamanDiAksi(aksi.aktif, halamanSah);
    aksi.tidakAktif = rapikanHalamanDiAksi(aksi.tidakAktif, halamanSah);
    return aksi;
  }
  return aksi;
}

/* ------------------------------------------------------------- deck ----- */
/* Profil otomatis (#16): daftar aturan "bila aplikasi X di depan → halaman Y". */
function normalProfilOtomatis(daftar, halamanSah) {
  if (!Array.isArray(daftar)) return [];
  return daftar
    .slice(0, 20)
    .map((r) => ({
      proses: teks(r && r.proses, 64, ""),
      jendela: teks(r && r.jendela, 80, ""),
      pageId: teks(r && r.pageId, 40, ""),
      aktif: !(r && r.aktif === false),
    }))
    .filter((r) => (r.proses || r.jendela) && halamanSah.includes(r.pageId));
}
/* --------------------------------------------------------- soundboard ---- */
/* Item soundboard disimpan di dalam deck supaya ikut ekspor/impor. Sumbernya
   berkas lokal atau tautan http(s); volume & perangkat output per item. */
export function normalSuara(item, idFallback) {
  if (!item || typeof item !== "object") return null;
  const sumber = String(item.sumber || "").trim().slice(0, 500);
  if (!sumber) return null;
  if (!SUMBER_SUARA.test(sumber)) return null;
  const nama = teks(item.name, 32, "Suara");
  const jenis = /^https?:\/\//i.test(sumber) ? "url" : "berkas";
  return {
    id: teks(item.id, 40, idFallback),
    name: nama,
    sumber,
    jenis,
    volume: Math.max(0, Math.min(100, Math.round(Number(item.volume) || 100))),
    perangkatId: teks(item.perangkatId, 200, ""),
  };
}

function normalSoundboard(daftar) {
  if (!Array.isArray(daftar)) return [];
  const hasil = [];
  const idTerpakai = new Set();
  for (const item of daftar.slice(0, 40)) {
    const suara = normalSuara(item, "s_" + crypto.randomBytes(3).toString("hex"));
    if (!suara) continue;
    if (idTerpakai.has(suara.id)) suara.id = "s_" + crypto.randomBytes(3).toString("hex");
    idTerpakai.add(suara.id);
    hasil.push(suara);
  }
  return hasil;
}

export function normalDeck(masukan, deckLama) {
  const sumber = masukan && typeof masukan === "object" ? masukan : {};
  const kolom = Math.min(6, Math.max(3, Math.round(Number(sumber?.profile?.columns ?? sumber?.settings?.columns ?? 5)) || 5));
  const baris = Math.min(6, Math.max(2, Math.round(Number(sumber?.profile?.rows ?? 3)) || 3));
  const namaProfil = teks(sumber?.profile?.name, 32, "Meja Kerja");

  let halamanMasukan = Array.isArray(sumber.pages) ? sumber.pages.slice(0, 12) : [];
  if (!halamanMasukan.length && deckLama) halamanMasukan = deckLama.pages;

  const idSah = halamanMasukan
    .map((h) => teks(h && h.id, 40, ""))
    .filter(Boolean);
  /* Dua lintasan: kumpulkan id dulu supaya aksi "halaman" bisa divalidasi. */
  const pages = halamanMasukan.map((h) => normalHalaman(h, kolom, baris, idSah));

  if (!pages.length) {
    pages.push(normalHalaman({ name: "Utama" }, kolom, baris, idSah));
  }

  /* Id halaman harus unik. */
  const terpakai = new Set();
  for (const h of pages) {
    if (terpakai.has(h.id)) h.id = idBaru("p_");
    terpakai.add(h.id);
  }

  /* Id tombol juga harus unik: `/api/press` mencari tombol berdasarkan id dan
     akan selalu mengenai tombol pertama bila id kembar (mudah terjadi lewat
     impor berkas). Tombol yang id-nya kembar diberi id baru. */
  const idTombol = new Set();
  for (const h of pages) {
    for (const k of h.keys) {
      if (!k) continue;
      if (!k.id || idTombol.has(k.id)) k.id = "k_" + crypto.randomBytes(3).toString("hex");
      idTombol.add(k.id);
    }
  }

  const homeId = pages.some((h) => h.id === sumber?.settings?.home)
    ? sumber.settings.home
    : pages[0].id;

  /* Aturan profil otomatis divalidasi setelah id halaman final diketahui. */
  const idHalamanFinal = pages.map((h) => h.id);

  return {
    version: 1,
    profile: { name: namaProfil, columns: kolom, rows: baris },
    pages,
    /* #16: profil otomatis (#1 kunci tata letak juga disimpan di sini). */
    otomatis: normalProfilOtomatis(sumber.otomatis, idHalamanFinal),
    /* Soundboard: daftar suara yang bisa dipasang di tombol atau diputar
       langsung dari panel. */
    soundboard: normalSoundboard(sumber.soundboard),
    settings: {
      sound: sumber?.settings?.sound !== false,
      home: homeId,
      /* Papan terkunci: mode sunting dimatikan kecuali dibuka dengan sengaja. */
      terkunci: sumber?.settings?.terkunci === true,
      /* Auto-profil: ganti halaman mengikuti aplikasi di depan. */
      autoProfil: sumber?.settings?.autoProfil === true,
      /* Tray: start.cmd/.exe menambah shortcut autostart. */
      mulaiOtomatis: sumber?.settings?.mulaiOtomatis === true,
    },
  };
}

/* ------------------------------------------------------------ contoh ---- */
function tombol(label, icon, action, variant = "default") {
  return { id: idBaru("k_"), label, icon, variant, widget: null, action };
}

/* Tombol widget: hanya menampilkan data hidup. */
function widget(label, icon, type, variant = "dark") {
  return { id: idBaru("k_"), label, icon, variant, widget: { type }, action: { type: "kosong" } };
}

function lengkapi(keys, jumlah) {
  const hasil = keys.slice(0, jumlah);
  while (hasil.length < jumlah) hasil.push(null);
  return hasil;
}

export function deckContoh() {
  const kolom = 5;
  const baris = 3;
  const n = kolom * baris;

  const pUtama = {
    id: idBaru("p_"),
    name: "Utama",
    keys: lengkapi(
      [
        tombol("Putar / Jeda", "i-play", { type: "media", cmd: "playpause" }, "accent"),
        tombol("Lagu Berikut", "i-arrow-right", { type: "media", cmd: "next" }),
        tombol("Volume Naik", "i-volume", { type: "media", cmd: "volup" }),
        tombol("Volume Turun", "i-volume-off", { type: "media", cmd: "voldown" }),
        tombol("Senyapkan", "i-volume-off", { type: "media", cmd: "mute" }),
        tombol("Tangkapan Layar", "i-image", { type: "hotkey", combo: "win+shift+s" }),
        tombol("Buka Peramban", "i-globe", { type: "buka", target: "https://www.google.com" }, "tint"),
        tombol("Unduhan", "i-download", { type: "buka", target: "%USERPROFILE%\\Downloads" }),
        tombol("Kalkulator", "i-plus", { type: "buka", target: "calc" }),
        tombol("Kunci Layar", "i-lock", { type: "hotkey", combo: "win+l" }),
        tombol("Aplikasi", "i-grid", { type: "halaman", pageId: "" }, "dark"),
        tombol("Web", "i-link", { type: "halaman", pageId: "" }, "dark"),
        tombol("Catatan Cepat", "i-pencil", { type: "buka", target: "notepad" }),
        widget("Sekarang", "i-clock", "jam"),
        widget("Sedang Diputar", "i-play", "media"),
      ],
      n
    ),
  };

  const pAplikasi = {
    id: idBaru("p_"),
    name: "Aplikasi",
    keys: lengkapi(
      [
        tombol("Explorer", "i-folder", { type: "buka", target: "explorer" }, "tint"),
        tombol("Terminal", "i-code", { type: "buka", target: "wt" }),
        tombol("VS Code", "i-file", { type: "buka", target: "code" }),
        tombol("Paint", "i-image", { type: "buka", target: "mspaint" }),
        tombol("Task Manager", "i-database", { type: "hotkey", combo: "ctrl+shift+esc" }),
        tombol("Salin", "i-copy", { type: "hotkey", combo: "ctrl+c" }),
        tombol("Tempel", "i-upload", { type: "hotkey", combo: "ctrl+v" }),
        tombol("Kembali", "i-arrow-left", { type: "halaman", pageId: "" }, "dark"),
      ],
      n
    ),
  };

  const pWeb = {
    id: idBaru("p_"),
    name: "Web",
    keys: lengkapi(
      [
        tombol("YouTube", "i-play", { type: "buka", target: "https://www.youtube.com" }),
        tombol("GitHub", "i-code", { type: "buka", target: "https://github.com" }),
        tombol("WhatsApp", "i-mail", { type: "buka", target: "https://web.whatsapp.com" }),
        tombol("Spotify", "i-volume", { type: "buka", target: "https://open.spotify.com" }),
        tombol("Fokus Kerja", "i-bolt", {
          type: "urutan",
          steps: [
            { delay: 300, action: { type: "buka", target: "code" } },
            { delay: 900, action: { type: "buka", target: "https://github.com" } },
          ],
        }, "lime"),
        tombol("Kembali", "i-arrow-left", { type: "halaman", pageId: "" }, "dark"),
      ],
      n
    ),
  };

  /* Sambungkan navigasi antarhalaman. */
  for (const key of pUtama.keys) {
    if (!key || key.action.type !== "halaman") continue;
    if (key.label === "Aplikasi") key.action.pageId = pAplikasi.id;
    if (key.label === "Web") key.action.pageId = pWeb.id;
  }
  for (const page of [pAplikasi, pWeb]) {
    for (const key of page.keys) {
      if (key && key.action.type === "halaman") key.action.pageId = pUtama.id;
    }
  }

  return {
    version: 1,
    profile: { name: "Meja Kerja", columns: kolom, rows: baris },
    pages: [pUtama, pAplikasi, pWeb],
    settings: {
      sound: true,
      home: pUtama.id,
      terkunci: false,
      autoProfil: false,
      mulaiOtomatis: false,
    },
  };
}

/* ------------------------------------------------------------ disk ------ */
export function muatDeck() {
  pastikanDir();
  try {
    const mentah = fs.readFileSync(BERKAS_DECK, "utf8");
    return normalDeck(JSON.parse(mentah));
  } catch (err) {
    /* Pada pemasangan baru, contoh deck juga harus melewati normalisasi supaya
       `settings` memuat semua kunci baru (terkunci, autoProfil, mulaiOtomatis). */
    const awal = normalDeck(deckContoh());
    simpanDeck(awal, { diam: true });
    return awal;
  }
}

export function simpanDeck(deck, opsi = {}) {
  pastikanDir();
  const sementara = BERKAS_DECK + ".tmp";
  try {
    fs.writeFileSync(sementara, JSON.stringify(deck, null, 2), "utf8");
    fs.renameSync(sementara, BERKAS_DECK);
    if (!opsi.diam) return true;
    return true;
  } catch (err) {
    console.error("[kumideck] gagal menyimpan deck:", err.message);
    return false;
  }
}

/* Token pasangan: dibuat sekali, dipakai bersama semua perangkat. */
export function muatToken() {
  pastikanDir();
  try {
    const data = JSON.parse(fs.readFileSync(BERKAS_RAHASIA, "utf8"));
    if (typeof data.token === "string" && /^[a-f0-9]{8,}$/.test(data.token)) return data.token;
  } catch (err) {
    /* buat baru */
  }
  const token = crypto.randomBytes(4).toString("hex");
  fs.writeFileSync(BERKAS_RAHASIA, JSON.stringify({ token }, null, 2), "utf8");
  return token;
}

export { AKAR, DIR_DATA };






