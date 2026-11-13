/* KumiDeck — server lokal.

   Menyajikan UI desktop dan UI Remote (ponsel/tablet), menyimpan deck, meneruskan
   keadaan lewat SSE, dan menjalankan aksi di komputer host.

   Jalankan: node server/index.js   (atau npm start) */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  muatDeck,
  simpanDeck,
  normalDeck,
  normalTombol,
  normalSuara as normalSuaraPublik,
  muatToken,
  AKAR,
  DIR_DATA,
} from "./store.js";
import { jalankanAksi, ringkas } from "./actions.js";
import { perintahVolume } from "./volume.js";
import { mulaiTray, hentikanTray, trayAktif, trayDiinginkan, logTray } from "./tray.js";
import { adaSertifikat } from "./tls.js";
import { aturMulaiOtomatis, statusMulaiOtomatis } from "./autostart.js";
import {
  mulaiPengamatJendela,
  hentikanPengamatJendela,
  infoJendela,
  saatJendelaBerubah,
  cocokJendela,
} from "./window.js";

/* Ikon kustom (#19): berkas SVG/PNG kecil disimpan di data/ikon/<id>.<ext>. */
const DIR_IKON = path.join(AKAR, "data", "ikon");
const BATAS_IKON = 512 * 1024;
const TIPE_IKON = { ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp" };

const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIK = path.join(AKAR, "public");
/* 8 MB: satu ekspor sah dengan ikon base64 bisa melebihi 1 MB, dan pengguna
   harus bisa mengimpor berkas hasil ekspornya sendiri. */
const BATAS_BODY = 16 * 1024 * 1024;

const TOKEN = muatToken();
let TRAY_PANTAU = null;
const KODE_TAMPIL = TOKEN.slice(0, 4).toUpperCase() + "-" + TOKEN.slice(4).toUpperCase();

let deck = muatDeck();
let aktivitas = []; /* maks 30, terbaru di depan */
const perangkat = new Map(); /* id → { id, platform, name, lastSeen, sambungan } */
const klienSse = new Set(); /* { res, deviceId, platform } */

let qrSvg = null;
import("./qr.js")
  .then((mod) => {
    qrSvg = mod.qrSvg;
    console.log("[kumideck] pembuat QR siap.");
  })
  .catch(() => {
    console.warn("[kumideck] modul QR tidak tersedia; kode pasangan tetap tampil sebagai teks.");
  });

/* Pemindai aplikasi terpasang (dipakai pemilih aplikasi di editor). */
let daftarAplikasi = null;
import("./apps.js")
  .then((mod) => {
    daftarAplikasi = mod.daftarAplikasi;
    console.log("[kumideck] pemindai aplikasi siap.");
  })
  .catch(() => {
    console.warn("[kumideck] pemindai aplikasi tidak tersedia; isi aplikasi secara manual.");
  });

/* Pembaca media untuk widget "Sedang Diputar". */
let mediaModul = null;
import("./media.js")
  .then((mod) => {
    mediaModul = mod;
    console.log("[kumideck] pembaca media siap.");
  })
  .catch(() => {
    console.warn("[kumideck] pembaca media tidak tersedia; widget media akan kosong.");
  });

/* ------------------------------------------------------- utilitas umum ---- */
function namaBerkasAman(nama) {
  return (
    String(nama || "kumideck")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "kumideck"
  );
}

function bacaVersi() {
  try {
    return JSON.parse(fs.readFileSync(path.join(AKAR, "package.json"), "utf8")).version || "";
  } catch (err) {
    return "";
  }
}

/* Target untuk pintasan "mulai otomatis": .exe bila berjalan sebagai SEA,
   atau node.exe + jalur server.index.js bila dijalankan dengan sumber. */
function targetAutostart() {
  const exe = process.execPath;
  const berupaSea = !/node(\.exe)?$/i.test(exe);
  if (berupaSea) {
    return { target: exe, argumen: "", folderKerja: AKAR };
  }
  return {
    target: exe,
    argumen: '"' + path.join(AKAR, "server", "index.js") + '"',
    folderKerja: AKAR,
  };
}

/* ------------------------------------------------------- ikon kustom (#19) --- */
function pastikanDirIkon() {
  if (!fs.existsSync(DIR_IKON)) fs.mkdirSync(DIR_IKON, { recursive: true });
}

function daftarIkon() {
  try {
    return fs
      .readdirSync(DIR_IKON)
      .filter((f) => /^kst_[a-z0-9]{4,16}\.(svg|png|webp)$/.test(f))
      .map((f) => {
        const id = f.replace(/\.[^.]+$/, "");
        const ext = path.extname(f).toLowerCase();
        return {
          id,
          url: "/ikon/" + id,
          tipe: TIPE_IKON[ext] || "application/octet-stream",
          ukuran: fs.statSync(path.join(DIR_IKON, f)).size,
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch (err) {
    return [];
  }
}

function simpanIkon(id, buffer, ekstensi) {
  if (!/^kst_[a-z0-9]{4,16}$/.test(id) || !TIPE_IKON["." + ekstensi]) return false;
  try {
    pastikanDirIkon();
    fs.writeFileSync(path.join(DIR_IKON, id + "." + ekstensi), buffer);
    return true;
  } catch (err) {
    return false;
  }
}

function bacaIkon(id) {
  if (!/^kst_[a-z0-9]{4,16}$/.test(String(id))) return null;
  for (const ext of Object.keys(TIPE_IKON)) {
    const berkas = path.join(DIR_IKON, id + ext);
    try {
      if (fs.existsSync(berkas)) {
        return { buffer: fs.readFileSync(berkas), tipe: TIPE_IKON[ext], ekstensi: ext.slice(1) };
      }
    } catch (err) {
      /* lanjut ke ekstensi lain */
    }
  }
  return null;
}

/* ------------------------------------------------------------- bantuan --- */
function alamatLokal(req) {
  const alamat = req.socket.remoteAddress || "";
  return alamat === "127.0.0.1" || alamat === "::1" || alamat === "::ffff:127.0.0.1";
}

function tokenDari(req, url) {
  const header = req.headers["x-kumi-token"];
  if (typeof header === "string" && header) return header.trim().toLowerCase();
  const dariQuery = url.searchParams.get("kode");
  return dariQuery ? dariQuery.trim().toLowerCase().replace(/[-\s]/g, "") : "";
}

function terautentikasi(req, url) {
  if (alamatLokal(req)) return true;
  return tokenDari(req, url) === TOKEN;
}

function alamatLan() {
  const antarmuka = os.networkInterfaces();
  const calon = [];
  for (const nama of Object.keys(antarmuka)) {
    for (const info of antarmuka[nama] || []) {
      if (info.family !== "IPv4" || info.internal) continue;
      calon.push({ ip: info.address, nama });
    }
  }
  const prioritas = ["192.168.", "10.", "172.16.", "172.17.", "172.18.", "172.19."];
  calon.sort((a, b) => {
    const pa = prioritas.findIndex((p) => a.ip.startsWith(p));
    const pb = prioritas.findIndex((p) => b.ip.startsWith(p));
    return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
  });
  return calon[0] ? calon[0].ip : "127.0.0.1";
}

function tautanRemote() {
  const skema = modeHttps ? "https" : "http";
  return skema + "://" + alamatLan() + ":" + PORT + "/remote?kode=" + TOKEN;
}

function kirimJson(res, kode, data) {
  const isi = JSON.stringify(data);
  res.writeHead(kode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(isi),
    "cache-control": "no-store",
  });
  res.end(isi);
}

function kirimTeks(res, kode, tipe, isi) {
  res.writeHead(kode, {
    "content-type": tipe + "; charset=utf-8",
    "content-length": Buffer.byteLength(isi),
    "cache-control": "no-store",
  });
  res.end(isi);
}

function bacaBody(req) {
  /* Hanya terima JSON. Permintaan `text/plain`/form-urlencoded adalah "simple
     request" yang lolos CORS tanpa preflight, sehingga bisa dipakai situs lain
     untuk menembak API ini (CSRF). */
  const tipe = String(req.headers["content-type"] || "").toLowerCase();
  if (tipe && tipe.indexOf("application/json") === -1) {
    req.resume();
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let ukuran = 0;
    const potongan = [];
    req.on("data", (bagian) => {
      ukuran += bagian.length;
      if (ukuran > BATAS_BODY) {
        req.destroy();
        resolve(null);
        return;
      }
      potongan.push(bagian);
    });
    req.on("end", () => {
      if (!potongan.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(potongan).toString("utf8")));
      } catch (err) {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

/* ------------------------------------------------------------- SSE ------ */
function siar(nama, data) {
  const isi = "event: " + nama + "\ndata: " + JSON.stringify(data) + "\n\n";
  for (const klien of klienSse) {
    try {
      klien.res.write(isi);
    } catch (err) {
      /* sambungan sudah tertutup: dibersihkan oleh penangan close */
    }
  }
}

function muatanState() {
  return {
    deck,
    devices: Array.from(perangkat.values()).map((p) => ({
      id: p.id,
      platform: p.platform,
      name: p.name,
      lastSeen: p.lastSeen,
    })),
    activity: aktivitas,
    live: muatanLive(),
    sinyal: muatanSinyal(),
    server: {
      name: "KumiDeck",
      port: PORT,
      lan: alamatLan(),
      lanUrl: "http://" + alamatLan() + ":" + PORT + "/remote",
      connected: klienSse.size,
    },
  };
}

/* ------------------------------------------------------------- widget ---- */
/* Data hidup untuk tombol widget: waktu server dan media yang diputar. */
function muatanLive() {
  return {
    now: Date.now(),
    media: mediaModul ? mediaModul.infoMedia() : { ada: false, status: "tertutup" },
  };
}

/* Apakah papan memakai widget media? Hanya saat itu pembaca media dinyalakan
   dan pembaruan dikirim, supaya proses PowerShell tidak jalan sia-sia. */
function adaWidgetMedia() {
  return deck.pages.some((h) => h.keys.some((k) => k && k.widget && k.widget.type === "media"));
}

/* ------------------------------------------------------- siaran hidup ---- */
/* Satu interval per ±500 ms untuk: media (#widget), volume (#9), jendela depan
   (#16/#17/#20) dan kedipan tombol (#20). Hanya yang berubah yang dikirim. */
let siaranLive = null;
let liveTerakhir = "";
let sinyalTerakhir = "";
let kedipTerakhir = 0;

function adaTandaAktif() {
  return deck.pages.some((h) => h.keys.some((k) => k && k.tandaiAktif));
}

function muatanSinyal() {
  const jendela = infoJendela();
  const volume = moduleVolumeTerakhir;
  return {
    jendela: { ada: jendela.ada, proses: jendela.proses, judul: jendela.judul },
    volume,
    aktif: jendela.ada ? jendela.proses : "",
  };
}

let moduleVolumeTerakhir = null;

/* Apakah proses pembaca media sedang hidup? Dipakai agar tick tidak memanggil
   mulaiPembacaMedia berulang kali. */
function mediaSiap() {
  return !!(mediaModul && mediaModul.sedangJalan && mediaModul.sedangJalan());
}

function perbaruiSiaranLive() {
  const perluMedia = !!mediaModul && adaWidgetMedia();
  if (perluMedia && mediaModul.mulaiPembacaMedia) mediaModul.mulaiPembacaMedia();
  else if (!perluMedia && mediaModul && mediaModul.hentikanPembacaMedia) mediaModul.hentikanPembacaMedia();

  /* Pengamat jendela hanya perlu bila ada tombol yang memakainya. */
  if (adaTandaAktif() || deck.settings.autoProfil || adaAksiBersyarat()) {
    mulaiPengamatJendela();
  }

  if (!siaranLive) {
    siaranLive = setInterval(async () => {
      const sekarang = Date.now();
      /* Dibaca ulang tiap tick: deck bisa berubah saat server berjalan, dan
         closure lama membuat widget media yang baru ditambahkan tidak pernah
         menerima event `live`. */
      const adaMediaSekarang = !!mediaModul && adaWidgetMedia();

      /* -- media -- */
      if (adaMediaSekarang) {
        if (mediaModul.mulaiPembacaMedia && !mediaSiap()) mediaModul.mulaiPembacaMedia();
        const muatan = { now: sekarang, media: mediaModul.infoMedia() };
        const kunci = JSON.stringify(muatan.media);
        if (kunci !== liveTerakhir || sekarang - (siaranLive.__akhirLive || 0) > 15000) {
          liveTerakhir = kunci;
          siaranLive.__akhirLive = sekarang;
          siar("live", muatan);
        }
      }

      /* -- sinyal (jendela, volume, kedip) tiap ±700 ms -- */
      if (sekarang - (siaranLive.__akhirSinyal || 0) >= 700) {
        siaranLive.__akhirSinyal = sekarang;
        const hasilVolume = await perintahVolume("baca");
        moduleVolumeTerakhir = hasilVolume.ok
          ? { persen: hasilVolume.volume, mute: !!hasilVolume.mute }
          : moduleVolumeTerakhir;
        const sinyal = muatanSinyal();
        const kunciSinyal = JSON.stringify(sinyal);
        const adaTekan = sekarang - (KEDIP.last || 0) < 900;
        /* Kirim saat berubah, saat ada tombol ditekan, atau tiap 5 dtk sebagai
           detak agar klien yang baru tersambung cepat sinkron. */
        if (
          kunciSinyal !== sinyalTerakhir ||
          (adaTekan && sekarang - kedipTerakhir > 300) ||
          sekarang - (siaranLive.__akhirKirimSinyal || 0) > 5000
        ) {
          sinyalTerakhir = kunciSinyal;
          kedipTerakhir = sekarang;
          siaranLive.__akhirKirimSinyal = sekarang;
          siar("sinyal", sinyal);
        }
      }
    }, 500);
    siaranLive.unref?.();
  }
}

/* Tombol berkedip (#20): ditangani Promise pendek agar tidak memblokir. */
const KEDIP = { last: 0, pageId: "", keyId: "" };

/* Apakah papan punya tombol "aktif bila" atau aksi kondisional? */
function adaAksiBersyarat() {
  function cek(aksi) {
    if (!aksi) return false;
    if (aksi.type === "kondisional") return true;
    if (aksi.type === "urutan") return aksi.steps.some((l) => cek(l.action));
    return false;
  }
  return deck.pages.some((h) => h.keys.some((k) => k && cek(k.action)));
}

function siarState() {
  siar("sync", muatanState());
}

function siarPerangkat() {
  siar("devices", muatanState().devices);
}

function catatPerangkat(id, platform, nama) {
  if (!id) return null;
  const sekarang = Date.now();
  const lama = perangkat.get(id);
  const data = {
    id,
    platform: platform === "android" ? "android" : "desktop",
    name: (nama || (platform === "android" ? "Perangkat Remote" : "Desktop")).slice(0, 32),
    lastSeen: sekarang,
    sambungan: lama ? lama.sambungan : 0,
  };
  perangkat.set(id, data);
  return data;
}

/* Bersihkan perangkat yang sudah lama tidak menyapa. */
setInterval(() => {
  const batas = Date.now() - 45000;
  let berubah = false;
  for (const [id, data] of perangkat) {
    if (data.sambungan <= 0 && data.lastSeen < batas) {
      perangkat.delete(id);
      berubah = true;
    }
  }
  if (berubah) siarPerangkat();
}, 15000);

/* ------------------------------------------------------- penangan API --- */
const percobaanPasangan = new Map(); /* ip → { jumlah, reset } */

function izinPasangan(ip) {
  const sekarang = Date.now();
  const data = percobaanPasangan.get(ip);
  if (!data || sekarang > data.reset) {
    percobaanPasangan.set(ip, { jumlah: 1, reset: sekarang + 60000 });
    return true;
  }
  data.jumlah += 1;
  return data.jumlah <= 10;
}

function catatAktivitas(entri) {
  aktivitas.unshift(entri);
  if (aktivitas.length > 30) aktivitas.length = 30;
  siar("activity", aktivitas);
}

/* Batas aksi yang berjalan bersamaan. Setiap aksi bisa memicu proses PowerShell;
   tanpa batas, rentetan permintaan (mis. tombol ditekan berulang dari ponsel
   atau skrip) dapat melahirkan puluhan proses sekaligus dan membuat komputer
   tersendat. */
const BATAS_AKSI_BERSAMAAN = 4;
let aksiBerjalan = 0;

async function tanganiPress(req, res, url) {
  const body = await bacaBody(req);
  if (!body) return kirimJson(res, 400, { ok: false, message: "Isi permintaan tidak valid." });

  const pageId = String(body.pageId || "");
  const keyId = String(body.keyId || "");
  const halaman = deck.pages.find((h) => h.id === pageId);
  if (!halaman) return kirimJson(res, 404, { ok: false, message: "Halaman tidak ditemukan." });

  const indeks = halaman.keys.findIndex((k) => k && k.id === keyId);
  if (indeks === -1) return kirimJson(res, 404, { ok: false, message: "Tombol tidak ditemukan." });
  const key = halaman.keys[indeks];

  if (key.widget) {
    return kirimJson(res, 200, {
      ok: true,
      message: "Tombol widget hanya menampilkan data.",
      navigate: null,
    });
  }

  catatPerangkat(
    String(body.deviceId || ""),
    String(body.platform || ""),
    String(body.name || "")
  );

  if (aksiBerjalan >= BATAS_AKSI_BERSAMAAN) {
    return kirimJson(res, 429, {
      ok: false,
      message: "Terlalu banyak aksi berjalan. Tunggu sebentar lalu coba lagi.",
    });
  }

  const mulai = Date.now();
  let hasil;
  aksiBerjalan += 1;
  try {
    hasil = await jalankanAksi(key.action, {
      halamanAda: deck.pages.map((h) => h.id),
      soundboard: deck.soundboard || [],
    });
  } catch (err) {
    hasil = { ok: false, message: "Aksi gagal: " + err.message };
  } finally {
    aksiBerjalan = Math.max(0, aksiBerjalan - 1);
  }

  const entri = {
    id: crypto.randomBytes(4).toString("hex"),
    time: Date.now(),
    pageId,
    keyId,
    label: key.label,
    ok: !!hasil.ok,
    message: hasil.message || ringkas(key.action),
    platform: body.platform === "android" ? "android" : "desktop",
    durasi: Date.now() - mulai,
  };
  catatAktivitas(entri);

  siar("press", {
    pageId,
    keyId,
    deviceId: body.deviceId || "",
    platform: entri.platform,
    ok: entri.ok,
    message: entri.message,
    navigate: hasil.navigate || null,
    time: entri.time,
    volume: hasil.volume || null,
  });

  /* Kedip tombol (#20): pemberitahuan singkat agar semua klien menyalakannya. */
  KEDIP.last = Date.now();
  KEDIP.pageId = pageId;
  KEDIP.keyId = keyId;
  siar("sinyal", { ...muatanSinyal(), kedip: { pageId, keyId } });

  kirimJson(res, 200, {
    ok: entri.ok,
    message: entri.message,
    navigate: hasil.navigate || null,
    volume: hasil.volume || null,
    activity: aktivitas,
  });
}

function tanganiSse(req, res, url) {
  if (!terautentikasi(req, url)) {
    return kirimJson(res, 401, { ok: false, code: "butuh-pasangan", message: "Kode pasangan salah atau kedaluwarsa." });
  }

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  res.write("retry: 2500\n\n");

  const deviceId = String(url.searchParams.get("device") || "");
  const platform = url.searchParams.get("platform") === "android" ? "android" : "desktop";
  const nama = String(url.searchParams.get("nama") || "");
  const klien = { res, deviceId, platform };
  klienSse.add(klien);

  if (deviceId) {
    const data = catatPerangkat(deviceId, platform, nama);
    if (data) data.sambungan += 1;
    siarPerangkat();
  }

  res.write("event: sync\ndata: " + JSON.stringify(muatanState()) + "\n\n");
  /* Klien baru langsung menerima sinyal agar penanda status tidak menunggu. */
  perintahVolume("baca")
    .then((hasil) => {
      if (hasil.ok) moduleVolumeTerakhir = { persen: hasil.volume, mute: !!hasil.mute };
    })
    .catch(() => {})
    .finally(() => {
      try {
        res.write("event: sinyal\ndata: " + JSON.stringify(muatanSinyal()) + "\n\n");
      } catch (err) {
        /* diabaikan */
      }
    });

  const denyut = setInterval(() => {
    try {
      res.write(":denyut\n\n");
    } catch (err) {
      /* diabaikan */
    }
  }, 20000);

  req.on("close", () => {
    clearInterval(denyut);
    klienSse.delete(klien);
    if (deviceId) {
      const data = perangkat.get(deviceId);
      if (data) {
        data.sambungan = Math.max(0, data.sambungan - 1);
        data.lastSeen = Date.now();
      }
      siarPerangkat();
    }
  });
}

/* ------------------------------------------------------------- statis --- */
const TIPE = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function sajikanBerkas(res, jalur) {
  const bersih = path.normalize(jalur).replace(/^(\.\.[/\\])+/, "");
  const penuh = path.join(PUBLIK, bersih);
  /* Bandingkan dengan pemisah path agar direktori bersaudara (mis. `public-x`)
     tidak lolos hanya karena namanya mirip awalan. */
  if (penuh !== PUBLIK && !penuh.startsWith(PUBLIK + path.sep)) {
    return kirimTeks(res, 403, "text/plain", "Terlarang");
  }
  fs.stat(penuh, (err, stat) => {
    if (err || !stat.isFile()) {
      return kirimTeks(res, 404, "text/plain", "Berkas tidak ditemukan.");
    }
    const tipe = TIPE[path.extname(penuh).toLowerCase()] || "application/octet-stream";
    /* Aset aplikasi (sprite ikon, CSS, JS) harus revalidasi supaya perubahan
       ikon langsung terlihat; hanya font/gambar vendor Kumi yang di-cache lama. */
    const bolehCache =
      /\.(woff2|png|ico)$/i.test(penuh) ||
      (/[\\/]kumi[\\/]/i.test(penuh) && /\.svg$/i.test(penuh));
    res.writeHead(200, {
      "content-type": tipe,
      "content-length": stat.size,
      "cache-control": bolehCache ? "public, max-age=86400" : "no-cache",
      "x-content-type-options": "nosniff",
    });
    fs.createReadStream(penuh).pipe(res);
  });
}

/* Apakah permintaan hanya membuka kunci (tidak mengubah isi papan)? Dipakai
   untuk menegakkan `settings.terkunci` di server. */
function hanyaMembukaKunci(deckBaru) {
  if (!deckBaru || typeof deckBaru !== "object") return false;
  if (deckBaru.settings && deckBaru.settings.terkunci !== false) return false;
  /* Bandingkan isi tanpa memperhatikan settings.terkunci. */
  const bersihkan = (d) => {
    const salinan = JSON.parse(JSON.stringify(d || {}));
    if (salinan.settings) delete salinan.settings.terkunci;
    return salinan;
  };
  try {
    return JSON.stringify(bersihkan(deckBaru)) === JSON.stringify(bersihkan(deck));
  } catch (err) {
    return false;
  }
}

/* --------------------------------------------------- asal permintaan ----- */
/* Tolak permintaan lintas-situs dan Host yang tidak dikenal. Bypass loopback
   membuat server menerima permintaan tanpa token dari peramban di komputer ini,
   sehingga tanpa pemeriksaan ini halaman web mana pun bisa menembak API. */
function hostDiizinkan(host) {
  if (!host) return true;
  const nama = String(host).split(":")[0].replace(/^\[|\]$/g, "").toLowerCase();
  if (!nama) return true;
  if (nama === "localhost" || nama === "127.0.0.1" || nama === "::1") return true;
  try {
    if (nama === String(alamatLan()).toLowerCase()) return true;
    if (nama === String(os.hostname()).toLowerCase()) return true;
  } catch (err) {
    return true;
  }
  return false;
}

function periksaAsal(req) {
  const situs = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (situs === "cross-site") {
    return { ok: false, message: "Permintaan dari situs lain ditolak." };
  }
  const origin = req.headers.origin;
  if (origin) {
    let hostOrigin = "";
    try {
      hostOrigin = new URL(origin).host;
    } catch (err) {
      return { ok: false, message: "Origin tidak valid." };
    }
    if (hostOrigin !== req.headers.host) {
      return { ok: false, message: "Origin tidak cocok dengan server ini." };
    }
  }
  if (!hostDiizinkan(req.headers.host)) {
    return { ok: false, message: "Host tidak dikenal. Buka lewat localhost atau alamat LAN." };
  }
  return { ok: true };
}

/* ---------------------------------------------------------- log berkas --- */
/* Saat dibangun sebagai aplikasi jendela (tanpa konsol), keluaran tetap bisa
   diperiksa lewat data\kumideck.log. */
function pasangLogBerkas() {
  try {
    fs.mkdirSync(DIR_DATA, { recursive: true });
    const berkas = path.join(DIR_DATA, "kumideck.log");
    const bungkus = (asli, tingkat) =>
      function (...args) {
        try {
          const isi = args
            .map((a) => (typeof a === "string" ? a : a instanceof Error ? a.stack || a.message : JSON.stringify(a)))
            .join(" ");
          fs.appendFileSync(berkas, new Date().toISOString() + " [" + tingkat + "] " + isi + "\n");
        } catch (err) {
          /* diabaikan */
        }
        try {
          asli.apply(console, args);
        } catch (err) {
          /* konsol tidak tersedia */
        }
      };
    console.log = bungkus(console.log, "info");
    console.error = bungkus(console.error, "error");
  } catch (err) {
    /* diabaikan */
  }
}

if (process.env.KD_LOG === "1") pasangLogBerkas();
/* -------------------------------------------------------------- router --- */
const handler = async (req, res) => {
  let url;
  try {
    url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  } catch (err) {
    return kirimTeks(res, 400, "text/plain", "Permintaan tidak valid.");
  }
  /* decodeURIComponent melempar URIError untuk persen-encoding rusak. Tanpa
     try/catch, galat ini muncul di handler async dan MEMATIKAN proses server.
     Permintaan seperti GET /%E0%A4%A tidak butuh token, jadi ini DoS murni. */
  let jalur;
  try {
    jalur = decodeURIComponent(url.pathname);
  } catch (err) {
    return kirimTeks(res, 400, "text/plain", "Alamat permintaan tidak valid.");
  }

  const asal = periksaAsal(req);
  if (!asal.ok) {
    return kirimJson(res, 403, { ok: false, code: "asal-ditolak", message: asal.message });
  }

  /* --- PWA di perangkat Remote -------------------------------------------
     Chrome hanya menawarkan "Pasang aplikasi" pada konteks aman. Endpoint ini
     memberi tahu klien apa yang tersedia, plus sertifikat untuk dipercaya. */
  if (jalur === "/api/pwa") {
    const httpsAktif = modeHttps;
    const sertifikat = adaSertifikat(DIR_DATA) ? "/sertifikat.cer" : null;
    return kirimJson(res, 200, {
      ok: true,
      https: httpsAktif,
      sertifikat,
      alamat: (httpsAktif ? "https" : "http") + "://" + alamatLan() + ":" + PORT,
      tautan: tautanRemote(),
      petunjuk: httpsAktif
        ? "Pasang sertifikat di perangkat Remote, lalu buka tautan HTTPS dan pilih “Pasang aplikasi”."
        : "Aktifkan mode HTTPS (start-https.cmd) agar perangkat Remote bisa memasang aplikasinya.",
    });
  }

  /* Unduh sertifikat CA lokal untuk dipasang di perangkat Remote. */
  if (jalur === "/sertifikat.cer") {
    const berkas = path.join(DIR_DATA, "tls", "kumideck.cer");
    try {
      const isi = fs.readFileSync(berkas);
      res.writeHead(200, {
        "content-type": "application/x-x509-ca-cert",
        "content-length": isi.length,
        "cache-control": "no-store",
        "content-disposition": 'attachment; filename="kumideck.cer"',
      });
      return res.end(isi);
    } catch (err) {
      return kirimTeks(res, 404, "text/plain", "Sertifikat belum dibuat. Jalankan mode HTTPS lebih dulu.");
    }
  }

  /* Tolak badan yang kebesaran SEBELUM membaca: membalas 413 yang jelas jauh
     lebih baik daripada memutus koneksi di tengah unggahan. */
  const panjang = Number(req.headers["content-length"] || 0);
  if (panjang && panjang > BATAS_BODY) {
    req.resume();
    return kirimJson(res, 413, {
      ok: false,
      code: "terlalu-besar",
      message: "Berkas terlalu besar. Maksimal " + Math.round(BATAS_BODY / (1024 * 1024)) + " MB.",
    });
  }

  try {
    /* --- halaman --- */
    if (jalur === "/" || jalur === "/index.html") return sajikanBerkas(res, "index.html");
    if (jalur === "/remote" || jalur === "/remote.html") return sajikanBerkas(res, "remote.html");

    /* --- API --- */
    if (jalur === "/api/state") {
      if (!terautentikasi(req, url)) {
        return kirimJson(res, 401, { ok: false, code: "butuh-pasangan", message: "Perlu kode pasangan." });
      }
      return kirimJson(res, 200, muatanState());
    }

    if (jalur === "/api/events") return tanganiSse(req, res, url);

    if (jalur === "/api/pair") {
      const ip = req.socket.remoteAddress || "?";
      if (!izinPasangan(ip)) {
        return kirimJson(res, 429, { ok: false, message: "Terlalu banyak percobaan. Coba lagi sebentar." });
      }
      const body = await bacaBody(req);
      const kode = String((body && body.code) || url.searchParams.get("code") || "")
        .trim()
        .toLowerCase()
        .replace(/[-\s]/g, "");
      if (kode && kode === TOKEN) return kirimJson(res, 200, { ok: true, token: TOKEN });
      return kirimJson(res, 401, { ok: false, code: "butuh-pasangan", message: "Kode pasangan salah. Periksa layar desktop." });
    }

    if (jalur === "/api/hello") {
      if (!terautentikasi(req, url)) {
        return kirimJson(res, 401, { ok: false, code: "butuh-pasangan", message: "Perlu kode pasangan." });
      }
      const body = (await bacaBody(req)) || {};
      const data = catatPerangkat(
        String(body.deviceId || ""),
        String(body.platform || ""),
        String(body.name || "")
      );
      if (data) {
        data.lastSeen = Date.now();
        siarPerangkat();
      }
      return kirimJson(res, 200, { ok: true });
    }

    if (jalur === "/api/press") {
      if (!terautentikasi(req, url)) {
        return kirimJson(res, 401, { ok: false, code: "butuh-pasangan", message: "Perlu kode pasangan." });
      }
      return tanganiPress(req, res, url);
    }

    /* ---- #3 impor/ekspor deck ---- */
    if (jalur === "/api/deck/export") {
      if (!terautentikasi(req, url)) {
        return kirimJson(res, 401, { ok: false, code: "butuh-pasangan", message: "Perlu kode pasangan." });
      }
      /* Ikon kustom ikut disertakan supaya berkas ekspor berdiri sendiri. */
      const ikon = {};
      for (const h of deck.pages) {
        for (const k of h.keys) {
          if (!k || !k.icon || !/^kst_/.test(k.icon)) continue;
          const data = bacaIkon(k.icon);
          if (data) ikon[k.icon] = "data:" + data.tipe + ";base64," + data.buffer.toString("base64");
        }
      }
      const paket = {
        format: "kumideck",
        versiFormat: 1,
        aplikasi: "KumiDeck " + (bacaVersi() || ""),
        dibuat: new Date().toISOString(),
        deck,
        ikon,
      };
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "content-disposition":
          'attachment; filename="kumideck-' + namaBerkasAman(deck.profile.name) + '.json"',
        "cache-control": "no-store",
      });
      return res.end(JSON.stringify(paket, null, 2));
    }

    if (jalur === "/api/deck/import") {
      if (!terautentikasi(req, url)) {
        return kirimJson(res, 401, { ok: false, code: "butuh-pasangan", message: "Perlu kode pasangan." });
      }
      if (deck.settings && deck.settings.terkunci) {
        return kirimJson(res, 423, {
          ok: false,
          code: "terkunci",
          message: "Tata letak terkunci. Buka kunci dulu untuk mengimpor papan.",
        });
      }
      const body = await bacaBody(req);
      if (!body) return kirimJson(res, 400, { ok: false, message: "Berkas impor tidak valid." });
      const paket = body.format === "kumideck" ? body : { deck: body.deck || body, ikon: body.ikon || {} };
      if (!paket.deck || !Array.isArray(paket.deck.pages)) {
        return kirimJson(res, 400, { ok: false, message: "Berkas ini bukan deck KumiDeck." });
      }
      /* Simpan ikon kustom yang disertakan (maks 60, 256 KB per berkas). */
      let ikonTersimpan = 0;
      const petaIkon = {};
      if (paket.ikon && typeof paket.ikon === "object") {
        for (const [kunci, dataUrl] of Object.entries(paket.ikon).slice(0, 60)) {
          if (!/^kst_[a-z0-9]{4,16}$/.test(kunci)) continue;
          const cocok = /^data:(image\/(?:svg\+xml|png|webp));base64,(.+)$/i.exec(String(dataUrl));
          if (!cocok) continue;
          const buffer = Buffer.from(cocok[2], "base64");
          if (!buffer.length || buffer.length > BATAS_IKON) continue;
          const ekstensi = cocok[1].toLowerCase().includes("svg") ? "svg" : cocok[1].includes("webp") ? "webp" : "png";
          if (simpanIkon(kunci, buffer, ekstensi)) {
            ikonTersimpan += 1;
            petaIkon[kunci] = kunci;
          }
        }
      }
      /* Ikon kustom yang tidak ikut berkas dinormalkan menjadi ikon bawaan. */
      const masuk = JSON.parse(JSON.stringify(paket.deck));
      for (const h of masuk.pages || []) {
        for (const k of h.keys || []) {
          if (k && typeof k.icon === "string" && /^kst_/.test(k.icon) && !petaIkon[k.icon]) {
            k.icon = "i-grid";
          }
        }
      }
      deck = normalDeck(masuk, deck);
      simpanDeck(deck);
      perbaruiSiaranLive();
      siarState();
      return kirimJson(res, 200, { ok: true, deck, ikon: ikonTersimpan });
    }

    /* ---- soundboard: suara, perangkat output, mikrofon ---- */
    if (jalur === "/api/audio/perangkat") {
      if (!terautentikasi(req, url)) {
        return kirimJson(res, 401, { ok: false, code: "butuh-pasangan", message: "Perlu kode pasangan." });
      }
      try {
        const mod = await import("./audio.js");
        const hasil = await mod.daftarPerangkatOutput();
        return kirimJson(res, 200, hasil);
      } catch (err) {
        return kirimJson(res, 503, {
          ok: false,
          perangkat: [],
          galat: "Perangkat audio tidak dapat dibaca.",
        });
      }
    }

    if (jalur === "/api/audio/status") {
      if (!terautentikasi(req, url)) {
        return kirimJson(res, 401, { ok: false, code: "butuh-pasangan", message: "Perlu kode pasangan." });
      }
      try {
        const mod = await import("./audio.js");
        return kirimJson(res, 200, await mod.statusPemutar());
      } catch (err) {
        return kirimJson(res, 503, { ok: false, memutar: false, pesan: "Pemutar suara tidak tersedia." });
      }
    }

    if (jalur === "/api/audio/mainkan") {
      if (!terautentikasi(req, url)) {
        return kirimJson(res, 401, { ok: false, code: "butuh-pasangan", message: "Perlu kode pasangan." });
      }
      const body = (await bacaBody(req)) || {};
      const daftar = deck.soundboard || [];
      const item = body.id ? daftar.find((s) => s && s.id === body.id) : null;
      const sumber = item ? item.sumber : String(body.sumber || "").trim();
      if (!sumber) return kirimJson(res, 400, { ok: false, message: "Pilih suara atau isi sumber suara." });
      try {
        const mod = await import("./audio.js");
        const hasil = await mod.mainkan({
          sumber,
          volume: item ? item.volume : Number(body.volume) || 100,
          perangkatId: item ? item.perangkatId : String(body.perangkatId || ""),
        });
        return kirimJson(res, hasil.ok ? 200 : 502, hasil);
      } catch (err) {
        return kirimJson(res, 503, { ok: false, pesan: "Pemutar suara tidak tersedia." });
      }
    }

    if (jalur === "/api/audio/hentikan") {
      if (!terautentikasi(req, url)) {
        return kirimJson(res, 401, { ok: false, code: "butuh-pasangan", message: "Perlu kode pasangan." });
      }
      try {
        const mod = await import("./audio.js");
        return kirimJson(res, 200, await mod.hentikan());
      } catch (err) {
        return kirimJson(res, 503, { ok: false, pesan: "Pemutar suara tidak tersedia." });
      }
    }

    if (jalur === "/api/mic") {
      if (!terautentikasi(req, url)) {
        return kirimJson(res, 401, { ok: false, code: "butuh-pasangan", message: "Perlu kode pasangan." });
      }
      try {
        const mod = await import("./mic.js");
        if (req.method === "POST") {
          const body = (await bacaBody(req)) || {};
          const mode = ["togel", "senyap", "nyala"].includes(body.mode) ? body.mode : "togel";
          const hasil = await mod.aturMic(mode);
          if (hasil && hasil.ok) siarState();
          return kirimJson(res, hasil && hasil.ok ? 200 : 502, hasil);
        }
        return kirimJson(res, 200, await mod.bacaMic());
      } catch (err) {
        return kirimJson(res, 503, { ok: false, pesan: "Kontrol mikrofon tidak tersedia." });
      }
    }

    /* Unggah berkas suara: peramban tidak memberi jalur lokal, jadi berkasnya
       disimpan di data/suara lalu diputar dari sana. */
    if (jalur === "/api/suara/unggah") {
      if (!terautentikasi(req, url)) {
        return kirimJson(res, 401, { ok: false, code: "butuh-pasangan", message: "Perlu kode pasangan." });
      }
      const body = (await bacaBody(req)) || {};
      const cocok = /^data:audio\/([a-z0-9.+-]+);base64,(.+)$/i.exec(String(body.dataUrl || ""));
      if (!cocok) {
        return kirimJson(res, 400, { ok: false, message: "Berkas suara tidak valid." });
      }
      const petaEkstensi = {
        mpeg: "mp3",
        mp3: "mp3",
        wav: "wav",
        "x-wav": "wav",
        wave: "wav",
        mp4: "m4a",
        m4a: "m4a",
        ogg: "ogg",
        flac: "flac",
        "x-flac": "flac",
      };
      const ekstensi = petaEkstensi[cocok[1].toLowerCase()];
      if (!ekstensi) {
        return kirimJson(res, 400, { ok: false, message: "Format suara tidak didukung (MP3, WAV, M4A, OGG, FLAC)." });
      }
      const buffer = Buffer.from(cocok[2], "base64");
      if (!buffer.length) return kirimJson(res, 400, { ok: false, message: "Berkas suara kosong." });
      if (buffer.length > 25 * 1024 * 1024) {
        return kirimJson(res, 413, { ok: false, message: "Berkas suara maksimal 25 MB." });
      }
      try {
        const dirSuara = path.join(DIR_DATA, "suara");
        if (!fs.existsSync(dirSuara)) fs.mkdirSync(dirSuara, { recursive: true });
        const id = crypto.randomBytes(6).toString("hex");
        const berkas = path.join(dirSuara, id + "." + ekstensi);
        fs.writeFileSync(berkas, buffer);
        return kirimJson(res, 200, { ok: true, sumber: berkas, nama: String(body.nama || "Suara").slice(0, 32) });
      } catch (err) {
        return kirimJson(res, 500, { ok: false, message: "Berkas suara tidak dapat disimpan." });
      }
    }

    if (jalur === "/api/soundboard/simpan") {
      if (!terautentikasi(req, url)) {
        return kirimJson(res, 401, { ok: false, code: "butuh-pasangan", message: "Perlu kode pasangan." });
      }
      if (deck.settings && deck.settings.terkunci) {
        return kirimJson(res, 423, {
          ok: false,
          code: "terkunci",
          message: "Tata letak terkunci. Buka kunci dulu untuk mengubah soundboard.",
        });
      }
      const body = (await bacaBody(req)) || {};
      const item = normalSuaraPublik(body.item, "s_" + crypto.randomBytes(3).toString("hex"));
      if (!item) {
        return kirimJson(res, 400, {
          ok: false,
          message: "Sumber suara tidak sah. Gunakan jalur berkas lokal atau tautan http(s).",
        });
      }
      const daftar = Array.isArray(deck.soundboard) ? deck.soundboard.slice() : [];
      const posisi = daftar.findIndex((s) => s && s.id === item.id);
      if (posisi >= 0) daftar[posisi] = item;
      else {
        if (daftar.length >= 40) {
          return kirimJson(res, 400, { ok: false, message: "Soundboard maksimal 40 suara." });
        }
        daftar.push(item);
      }
      deck.soundboard = daftar;
      simpanDeck(deck);
      /* Bila suara ini sedang diputar, terapkan volume barunya seketika
         (pengguna mengharapkan slider langsung terasa). */
      try {
        const mod = await import("./audio.js");
        const status = await mod.statusPemutar();
        if (status && status.ok && status.memutar && status.sumber === item.sumber) {
          await mod.aturVolume(item.volume);
        }
      } catch (err) {
        /* pemutar tidak tersedia: abaikan */
      }
      siarState();
      return kirimJson(res, 200, { ok: true, soundboard: daftar, item });
    }

    if (jalur === "/api/soundboard/hapus") {
      if (!terautentikasi(req, url)) {
        return kirimJson(res, 401, { ok: false, code: "butuh-pasangan", message: "Perlu kode pasangan." });
      }
      if (deck.settings && deck.settings.terkunci) {
        return kirimJson(res, 423, { ok: false, code: "terkunci", message: "Tata letak terkunci." });
      }
      const body = (await bacaBody(req)) || {};
      const id = String(body.id || "");
      deck.soundboard = (deck.soundboard || []).filter((s) => s && s.id !== id);
      simpanDeck(deck);
      siarState();
      return kirimJson(res, 200, { ok: true, soundboard: deck.soundboard });
    }

    /* Ikon asli aplikasi terpasang (#2): diekstrak dari .exe lalu disajikan
       lewat rute /ikon/<id> yang sudah ada. */
    if (jalur === "/api/appicon") {
      if (!terautentikasi(req, url)) {
        return kirimJson(res, 401, { ok: false, code: "butuh-pasangan", message: "Perlu kode pasangan." });
      }
      const target = String(url.searchParams.get("target") || "").trim();
      if (!target) return kirimJson(res, 400, { ok: false, alasan: "Target aplikasi kosong." });
      try {
        const mod = await import("./appicons.js");
        const hasil = await mod.ikonAplikasi(target, { tujuanDir: DIR_IKON });
        return kirimJson(res, hasil.ok ? 200 : 422, hasil);
      } catch (err) {
        return kirimJson(res, 503, { ok: false, alasan: "Ikon aplikasi tidak dapat dibaca." });
      }
    }
    if (jalur === "/api/icons") {      if (req.method === "GET") {
        return kirimJson(res, 200, { ok: true, ikon: daftarIkon() });
      }
      if (req.method !== "POST") {
        return kirimJson(res, 405, { ok: false, message: "Metode tidak didukung." });
      }
      if (!terautentikasi(req, url)) {
        return kirimJson(res, 401, { ok: false, code: "butuh-pasangan", message: "Perlu kode pasangan." });
      }
      const body = await bacaBody(req);
      const cocok = /^data:(image\/(?:svg\+xml|png|webp));base64,(.+)$/i.exec(
        String((body && body.dataUrl) || "")
      );
      if (!cocok) {
        return kirimJson(res, 400, { ok: false, message: "Pilih berkas SVG, PNG, atau WebP." });
      }
      const buffer = Buffer.from(cocok[2], "base64");
      if (!buffer.length) return kirimJson(res, 400, { ok: false, message: "Berkas ikon kosong." });
      if (buffer.length > BATAS_IKON) {
        return kirimJson(res, 413, { ok: false, message: "Ikon maksimal 256 KB." });
      }
      const ekstensi = cocok[1].toLowerCase().includes("svg")
        ? "svg"
        : cocok[1].includes("webp")
          ? "webp"
          : "png";
      const id = "kst_" + crypto.randomBytes(4).toString("hex");
      if (!simpanIkon(id, buffer, ekstensi)) {
        return kirimJson(res, 500, { ok: false, message: "Ikon tidak dapat disimpan." });
      }
      return kirimJson(res, 200, { ok: true, id, ikon: daftarIkon() });
    }

    if (jalur.startsWith("/ikon/")) {
      const id = jalur.slice("/ikon/".length);
      const data = bacaIkon(id);
      if (!data) return kirimTeks(res, 404, "text/plain", "Ikon tidak ditemukan.");
      /* Ikon kustom bisa berupa SVG buatan pengguna. Sajikan sebagai aset
         gambar mati: nosniff + CSP ketat + attachment untuk SVG, supaya berkas
         yang dibuka langsung tidak bisa menjalankan skrip di origin server. */
      res.writeHead(200, {
        "content-type": data.tipe,
        "content-length": data.buffer.length,
        "cache-control": "public, max-age=86400",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      });
      return res.end(data.buffer);
    }

    if (jalur === "/api/deck") {
      if (!terautentikasi(req, url)) {
        return kirimJson(res, 401, { ok: false, code: "butuh-pasangan", message: "Perlu kode pasangan." });
      }
      const body = await bacaBody(req);
      if (!body || !body.deck) {
        return kirimJson(res, 400, { ok: false, message: "Deck tidak valid." });
      }
      /* Kunci tata letak ditegakkan di server, bukan hanya di UI: selama
         `settings.terkunci` benar, satu-satunya perubahan yang diterima adalah
         membuka kunci itu sendiri. Mencegah klien lain (atau berkas impor)
         menimpa papan yang sedang dikunci. */
      const terkunciSekarang = !!(deck.settings && deck.settings.terkunci);
      if (terkunciSekarang && !hanyaMembukaKunci(body.deck)) {
        return kirimJson(res, 423, {
          ok: false,
          code: "terkunci",
          message: "Tata letak terkunci. Buka kunci dulu untuk mengubah papan.",
          deck,
        });
      }
      deck = normalDeck(body.deck, deck);
      simpanDeck(deck);
      perbaruiSiaranLive();
      siarState();
      return kirimJson(res, 200, { ok: true, deck });
    }

    /* ---- #20 baca sinyal segera (jendela depan + volume) ---- */
    if (jalur === "/api/sinyal") {
      if (!terautentikasi(req, url)) {
        return kirimJson(res, 401, { ok: false, code: "butuh-pasangan", message: "Perlu kode pasangan." });
      }
      const hasilVolume = await perintahVolume("baca");
      if (hasilVolume.ok) {
        moduleVolumeTerakhir = { persen: hasilVolume.volume, mute: !!hasilVolume.mute };
      }
      return kirimJson(res, 200, { ok: true, ...muatanSinyal() });
    }

    /* ---- #2 tukar posisi tombol dalam satu halaman ---- */
    if (jalur === "/api/deck/pindah") {
      if (!terautentikasi(req, url)) {
        return kirimJson(res, 401, { ok: false, code: "butuh-pasangan", message: "Perlu kode pasangan." });
      }
      if (deck.settings && deck.settings.terkunci) {
        return kirimJson(res, 423, {
          ok: false,
          code: "terkunci",
          message: "Tata letak terkunci. Buka kunci dulu untuk menukar posisi.",
        });
      }
      const body = await bacaBody(req);
      const pageId = String((body && body.pageId) || "");
      const dari = Number(body && body.dari);
      const ke = Number(body && body.ke);
      const halaman = deck.pages.find((h) => h.id === pageId);
      if (!halaman) return kirimJson(res, 404, { ok: false, message: "Halaman tidak ditemukan." });
      if (
        !Number.isInteger(dari) ||
        !Number.isInteger(ke) ||
        dari < 0 ||
        ke < 0 ||
        dari >= halaman.keys.length ||
        ke >= halaman.keys.length
      ) {
        return kirimJson(res, 400, { ok: false, message: "Posisi tombol tidak valid." });
      }
      if (dari !== ke) {
        const dipindah = halaman.keys[dari];
        halaman.keys[dari] = halaman.keys[ke];
        halaman.keys[ke] = dipindah;
        simpanDeck(deck);
        siarState();
      }
      return kirimJson(res, 200, { ok: true, deck });
    }

    if (jalur === "/api/apps") {
      if (!terautentikasi(req, url)) {
        return kirimJson(res, 401, { ok: false, code: "butuh-pasangan", message: "Perlu kode pasangan." });
      }
      if (!daftarAplikasi) {
        return kirimJson(res, 503, {
          ok: false,
          aplikasi: [],
          galat: "Pemindai aplikasi belum siap. Coba lagi sebentar.",
        });
      }
      try {
        const hasil = await daftarAplikasi({ paksa: url.searchParams.get("ulang") === "1" });
        return kirimJson(res, 200, hasil);
      } catch (err) {
        return kirimJson(res, 500, {
          ok: false,
          aplikasi: [],
          galat: "Daftar aplikasi tidak dapat dibaca: " + err.message,
        });
      }
    }

    /* ---- #6 tray + mulai otomatis ---- */
    if (jalur === "/api/otomatis") {
      if (!terautentikasi(req, url)) {
        return kirimJson(res, 401, { ok: false, code: "butuh-pasangan", message: "Perlu kode pasangan." });
      }
      if (req.method === "GET") {
        return kirimJson(res, 200, {
          ok: true,
          aktif: statusMulaiOtomatis(),
          tercatat: !!(deck.settings && deck.settings.mulaiOtomatis),
          tray: trayAktif(DIR_DATA),
        });
      }
      const body = await bacaBody(req);
      if (!body || typeof body.aktif !== "boolean") {
        return kirimJson(res, 400, { ok: false, message: "Permintaan tidak valid." });
      }
      const hasil = await aturMulaiOtomatis(body.aktif, targetAutostart());
      if (!hasil.ok) {
        return kirimJson(res, 500, { ok: false, aktif: false, message: hasil.alasan });
      }
      /* Cerminkan status ke deck agar UI dan berkas ekspor tidak menampilkan
         nilai lama. */
      deck.settings.mulaiOtomatis = !!hasil.aktif;
      simpanDeck(deck);
      siarState();
      return kirimJson(res, 200, { ok: true, aktif: hasil.aktif });
    }

    if (jalur === "/api/tray") {
      if (!terautentikasi(req, url)) {
        return kirimJson(res, 401, { ok: false, code: "butuh-pasangan", message: "Perlu kode pasangan." });
      }
      if (req.method === "POST") {
        const body = await bacaBody(req);
        if (body && body.aktif === false) {
          hentikanTray({ dirData: DIR_DATA });
          return kirimJson(res, 200, { ok: true, tray: false });
        }
        const aktif = mulaiTray({
          port: PORT,
          lanUrl: tautanRemote(),
          dirData: DIR_DATA,
          ikon: path.join(AKAR, "assets", "tray.ico"),
          ikonCadangan: path.join(AKAR, "assets", "icon.ico"),
          jendela: path.join(DIR_DATA, "jendela", "KumiDeck.lnk"),
        });
        /* mulaiTray mengembalikan false bila tray sudah hidup; anggap sukses. */
        return kirimJson(res, 200, { ok: true, tray: true, baru: !!aktif });
      }
      return kirimJson(res, 200, { ok: true, tray: trayAktif(DIR_DATA) });
    }

    /* Diagnosa ikon baki sistem: berkas mana yang benar-benar dipakai. */
    if (jalur === "/api/tray/ikon") {
      if (!terautentikasi(req, url)) {
        return kirimJson(res, 401, { ok: false, code: "butuh-pasangan", message: "Perlu kode pasangan." });
      }
      const berkas = path.join(AKAR, "assets", "tray.ico");
      let ukuran = 0;
      try {
        ukuran = fs.statSync(berkas).size;
      } catch (err) {
        ukuran = 0;
      }
      return kirimJson(res, 200, {
        ok: true,
        berkas,
        ukuran,
        log: logTray(DIR_DATA),
      });
    }

    if (jalur === "/api/pair-info") {
      if (!alamatLokal(req)) {
        return kirimJson(res, 403, { ok: false, message: "Hanya untuk desktop." });
      }
      const tautan = tautanRemote();
      return kirimJson(res, 200, {
        url: tautan,
        qrUrl: "/api/qr.svg?data=" + encodeURIComponent(tautan),
        code: KODE_TAMPIL,
        token: TOKEN,
        lan: alamatLan(),
        port: PORT,
        qrSiap: !!qrSvg,
      });
    }

    if (jalur === "/api/qr.svg") {
      if (!terautentikasi(req, url)) return kirimTeks(res, 401, "text/plain", "Perlu kode pasangan.");
      /* Pembuat QR mendukung byte sampai version 10 (ECC M ±213 bita); potong
         data supaya tautan panjang tidak membuat endpoint ini melempar galat. */
      const data = (url.searchParams.get("data") || tautanRemote()).slice(0, 180);
      if (!qrSvg) {
        return kirimTeks(res, 503, "text/plain", "Pembuat QR belum siap.");
      }
      try {
        const svg = qrSvg(data, { size: 320, margin: 3 });
        return kirimTeks(res, 200, "image/svg+xml", svg);
      } catch (err) {
        return kirimTeks(res, 422, "text/plain", "Data terlalu panjang untuk kode QR.");
      }
    }

    if (jalur.startsWith("/api/")) {
      return kirimJson(res, 404, { ok: false, message: "Endpoint tidak dikenal." });
    }

    /* --- berkas statis --- */
    return sajikanBerkas(res, jalur.replace(/^\/+/, ""));
  } catch (err) {
    console.error("[kumideck] galat permintaan:", err);
    return kirimJson(res, 500, { ok: false, message: "Terjadi galat di server." });
  }
};

/* Server HTTP biasa, atau HTTPS bila diminta (KD_HTTPS=1) supaya PWA bisa
   dipasang di perangkat Remote — Chrome hanya mengizinkan "Pasang aplikasi" pada konteks
   aman (HTTPS/localhost), bukan http://IP-LAN. */
let server = http.createServer(handler);
let modeHttps = false;
let serverHttpPengalihan = null;

/* Disiapkan sebagai fungsi async, bukan top-level await: bundel SEA dibangun
   dengan format CommonJS yang tidak mendukung top-level await. */
async function siapkanHttps() {
  if (process.env.KD_HTTPS !== "1") return;
  try {
    const { siapkanTls } = await import("./tls.js");
    const tls = await siapkanTls(DIR_DATA, alamatLan());
    if (tls.ok) {
      const https = await import("node:https");
      server = https.createServer({ pfx: fs.readFileSync(tls.pfx), passphrase: tls.passphrase }, handler);
      modeHttps = true;
      /* Port kedua (HTTP) hanya mengalihkan ke HTTPS supaya tautan lama tetap
         membuka halaman yang benar. */
      if (process.env.KD_HTTPS_REDIRECT !== "0") {
        serverHttpPengalihan = http.createServer((req, res) => {
          /* Sertifikat HARUS bisa diunduh lewat HTTP: ponsel belum bisa membuka
             HTTPS sebelum sertifikatnya dipercaya. */
          const jalurHttp = (req.url || "/").split("?")[0];
          if (jalurHttp === "/sertifikat.cer") {
            try {
              const isi = fs.readFileSync(path.join(DIR_DATA, "tls", "kumideck.cer"));
              res.writeHead(200, {
                "content-type": "application/x-x509-ca-cert",
                "content-length": isi.length,
                "cache-control": "no-store",
                "content-disposition": 'attachment; filename="kumideck.cer"',
              });
              res.end(isi);
              return;
            } catch (err) {
              res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
              res.end("Sertifikat belum dibuat.");
              return;
            }
          }
          const tujuan = "https://" + (req.headers.host || alamatLan() + ":" + PORT) + (req.url || "/");
          res.writeHead(308, { location: tujuan, "cache-control": "no-store" });
          res.end();
        });
        serverHttpPengalihan.listen(Number(process.env.KD_HTTPS_HTTP_PORT) || PORT + 1, HOST);
      }
    } else {
      console.error("[kumideck] HTTPS diminta tetapi sertifikat gagal dibuat:", tls.alasan);
    }
  } catch (err) {
    console.error("[kumideck] HTTPS gagal disiapkan:", err.message);
  }
}

/* --------------------------------------------------------------- mulai --- */
siapkanHttps().finally(mulaiServer);

function mulaiServer() {
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        "[kumideck] Port " + PORT + " sedang dipakai. Hentikan proses lain atau jalankan dengan PORT lain, mis.:\n" +
          "  $env:PORT=4174; node server/index.js"
      );
      process.exit(1);
    }
    console.error("[kumideck] galat server:", err.message);
  });

  server.listen(PORT, HOST, () => {
  const lan = alamatLan();
  perbaruiSiaranLive();

  /* Tray dihidupkan kecuali dimatikan eksplisit (KD_TRAY=0). Tray juga
     dinyalakan lagi saat boot bila pengguna terakhir menyalakannya, supaya ikon
     tidak hilang setelah server dijalankan ulang. */
  if (process.env.KD_TRAY !== "0" && process.platform === "win32") {
    const aktif = mulaiTray({
      port: PORT,
      lanUrl: tautanRemote(),
      dirData: DIR_DATA,
      ikon: path.join(AKAR, "assets", "tray.ico"),
      ikonCadangan: path.join(AKAR, "assets", "icon.ico"),
      jendela: path.join(DIR_DATA, "jendela", "KumiDeck.lnk"),
    });
    if (aktif) {
      console.log("  Tray   : aktif — klik ikon KumiDeck di baki sistem");
      /* Pantau perintah keluar dari menu tray. */
      TRAY_PANTAU = setInterval(() => {
        try {
          const berkas = path.join(DIR_DATA, "tray.ctl");
          /* Tray mati sendiri (mis. proses PowerShell terbunuh)? Nyalakan lagi
             selama pengguna belum memilih "Keluar" dari menu tray. */
          if (!trayAktif(DIR_DATA) && trayDiinginkan(DIR_DATA) && !fs.existsSync(berkas)) {
            mulaiTray({
              port: PORT,
              lanUrl: tautanRemote(),
              dirData: DIR_DATA,
              ikon: path.join(AKAR, "assets", "tray.ico"),
              ikonCadangan: path.join(AKAR, "assets", "icon.ico"),
              jendela: path.join(DIR_DATA, "jendela", "KumiDeck.lnk"),
            });
          }
          if (fs.existsSync(berkas)) {
            const isi = fs.readFileSync(berkas, "utf8").trim().toLowerCase();
            if (isi === "keluar" || isi === "matikan") {
              fs.rmSync(berkas, { force: true });
              console.log("\n[kumideck] keluar dari tray…");
              tutup();
            }
          }
        } catch (err) {
          /* diabaikan */
        }
      }, 800);
      TRAY_PANTAU.unref?.();
    }
  }
  /* Profil otomatis (#16): ikuti jendela depan; simpan halaman terakhir agar
     tidak bolak-balik bila aplikasi yang sama masih aktif. */
  if (deck.settings.autoProfil) mulaiPengamatJendela();
  let halamanSaatIni = deck.settings.home;
  saatJendelaBerubah(() => {
    if (!deck.settings.autoProfil) return;
    const j = infoJendela();
    const aturan = (deck.otomatis || []).find((r) => r.aktif && cocokJendela(r, j));
    if (!aturan) return;
    if (aturan.pageId === halamanSaatIni) return;
    halamanSaatIni = aturan.pageId;
    siar("profil", { pageId: aturan.pageId, alasan: j.proses || j.judul, otomatis: true });
  });
  /* Simpan halaman yang dipilih pengguna agar auto-profil tidak menimpanya
     terus-menerus sampai jendela berganti. */
  console.log("");
  console.log("  KumiDeck — papan tombol untuk desktop dan Remote");
  console.log("  ------------------------------------------------");
  const skema = modeHttps ? "https" : "http";
  console.log("  Desktop : " + skema + "://localhost:" + PORT);
  console.log("  Remote  : " + skema + "://" + lan + ":" + PORT + "/remote");
  console.log("  Kode    : " + KODE_TAMPIL);
  if (modeHttps) {
    console.log("");
    console.log("  Mode HTTPS aktif. Untuk memasang aplikasi di perangkat Remote:");
    console.log("  1. Unduh sertifikat : http://" + lan + ":" + (PORT + 1) + "/sertifikat.cer");
    console.log("  2. Setelan > Keamanan > Pasang sertifikat > Sertifikat CA");
    console.log("  3. Buka " + skema + "://" + lan + ":" + PORT + "/remote lalu pilih Pasang aplikasi");
  }
  console.log("");
  console.log("  Tutup dengan Ctrl+C.");
  console.log("");

  const tautanLokal = "http://localhost:" + PORT;
  if (process.env.KD_JENDELA === "1") {
    /* UI dibuka sebagai jendela aplikasi sendiri (mode --app peramban). */
    console.log("[kumideck] membuka jendela aplikasi:", tautanLokal);
    import("./jendela.js")
      .then((mod) =>
        mod.bukaJendela(tautanLokal, { dirData: DIR_DATA, ikon: path.join(AKAR, "assets", "icon.ico") })
      )
      .then((hasil) => {
        console.log("[kumideck] jendela aplikasi:", JSON.stringify(hasil));
        if (!hasil || !hasil.ok) bukaPeramban(tautanLokal);
      })
      .catch(() => bukaPeramban(tautanLokal));
  } else if (process.env.KD_OPEN === "1") {
    bukaPeramban(tautanLokal);
  }
  });
}



/* ------------------------------------------------------- buka peramban --- */
/* Membuka URL dengan aman. Chrome yang diluncurkan langsung dari proses ini
   (mis. lewat `cmd /c start`) bisa gagal dengan "Exception Breakpoint
   0x80000003" ketika proses induk berada di job object/lingkungan terbatas.
   Karena itu URL dibuka lewat explorer.exe yang melepas proses dari job induk,
   dengan cadangan `cmd /c start`, lalu Start-Process PowerShell. */
function bukaPeramban(url) {
  if (!url) return false;
  const percobaan = [
    () => spawn("explorer.exe", [url], { detached: true, stdio: "ignore", windowsHide: true }),
    () => spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], { detached: true, stdio: "ignore", windowsHide: true }),
    () => spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }),
  ];
  for (const jalankan of percobaan) {
    try {
      const anak = jalankan();
      anak.on("error", () => {});
      anak.unref();
      return true;
    } catch (err) {
      /* coba cara berikutnya */
    }
  }
  try {
    console.log("[kumideck] Peramban tidak dapat dibuka otomatis. Buka manual: " + url);
  } catch (err) {
    /* diabaikan */
  }
  return false;
}
function tutup() {
  console.log("\n[kumideck] menyimpan deck dan berhenti…");
  simpanDeck(deck);
  if (mediaModul && mediaModul.hentikanPembacaMedia) mediaModul.hentikanPembacaMedia();
  if (siaranLive) clearInterval(siaranLive);
  hentikanPengamatJendela();
  import("./volume.js")
    .then((mod) => mod.hentikanKontrolVolume())
    .catch(() => {})
    .finally(() => finishTutup());
  setTimeout(() => process.exit(0), 1800).unref();
}

function finishTutup() {
  server.close(() => process.exit(0));
}
process.on("SIGINT", tutup);
process.on("SIGTERM", tutup);






































