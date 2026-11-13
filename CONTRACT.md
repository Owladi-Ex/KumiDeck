# Kontrak KumiDeck

Dokumen ini adalah kesepakatan antara server, UI desktop, dan UI Android (remote).
Semua nama field, endpoint, dan class CSS di bawah **tidak boleh diubah** tanpa
memperbarui dokumen ini.

## 1. Bentuk data

```js
deck = {
  version: 1,
  profile: { name: "Meja Kerja", columns: 5, rows: 3 },
  pages: [
    { id: "p_utama", name: "Utama", keys: [ key | null, ... ] }  // panjang = columns * rows
  ],
  otomatis: [ { proses: "chrome", jendela: "", pageId: "p_web", aktif: true } ],  // #16
  soundboard: [ { id: "s_xxxx", name: "Sorak", sumber: "C:\\suara\\a.mp3", jenis: "berkas"|"url", volume: 0..100, perangkatId: "" } ],
  settings: {
    sound: true,
    home: "p_utama",
    terkunci: false,      // #1 papan terkunci
    autoProfil: false,    // #16 aktifkan profil otomatis
    mulaiOtomatis: false  // #6 cermin status pintasan Startup
  }
}

key = {
  id: "k_xxxx",
  label: "Nama tombol",        // 1..24 karakter
  icon: "i-play",              // sprite Kumi ATAU ikon kustom "kst_xxxxxxxx"
  variant: "default" | "tint" | "dark" | "lime" | "accent",
  warna: { bg: "#ff6b35", fg: "#101010" } | null,          // #19 warna khusus
  widget: { type: "jam" | "tanggal" | "media" } | null,   // tombol tampilan
  tandaiAktif: { proses: "chrome", jendela: "" } | null,  // #20 penanda status
  action: action               // selalu { type: "kosong" } bila widget diisi
}

action =
  { type: "hotkey",  combo: "ctrl+shift+m" }
  { type: "teks",    text: "halo" }
  { type: "buka",    target: "notepad" }            // aplikasi, berkas, atau URL
  { type: "http",    method: "GET"|"POST", url: "...", body: "", headers: [{name,value}] }
  { type: "media",   cmd: "playpause"|"next"|"prev"|"volup"|"voldown"|"mute" }
  { type: "halaman", pageId: "p_utama" }
  { type: "urutan",  steps: [ { delay: 150, action: action } ] }
  { type: "jendela", cmd: "minimize"|"maximize"|"restore"|"kiri"|"kanan"|"monitor-berikut"|"task-view"|"tampilkan-desktop"|"tutup-jendela" }
  { type: "volume",  mode: "naik"|"turun"|"mute"|"set"|"baca", nilai: 0..100 }   // nilai hanya untuk "set"
  { type: "daya",    cmd: "tidur"|"kunci"|"restart"|"matikan"|"batal" }
  { type: "mic",    cmd: "togel"|"senyap"|"nyala" }
  { type: "suara",  soundId: "s_xxxx" }
  { type: "kondisional", syarat: { proses, jendela }, aktif: action, tidakAktif: action }
  { type: "kosong" }
```

## 2. Endpoint HTTP

| Method | Path | Keterangan |
|---|---|---|
| GET | `/` | UI desktop (HTML) |
| GET | `/remote` | UI Android (HTML) |
| GET | `/api/state` | `{ deck, devices, activity, live, server }` |
| GET | `/api/events?kode=<token>&device=<id>&platform=<desktop\|android>` | SSE |
| POST | `/api/press` | `{ pageId, keyId, deviceId, platform }` → `{ ok, message }`; maksimum 4 aksi bersamaan, kelebihan → `429` |
| POST | `/api/deck` | `{ deck }` → `{ ok, deck }` (validasi + simpan + siarkan) |
| POST | `/api/pair` | `{ code }` → `{ ok: true, token }` |
| POST | `/api/hello` | `{ deviceId, platform, name }` → `{ ok }` |
| GET | `/api/pair-info` | `{ url, qrUrl, code }` (hanya dari localhost) |
| GET | `/api/qr.svg?data=<teks>` | SVG QR code |
| GET | `/api/apps?ulang=1` | `{ aplikasi: [{id,name,target,icon,sumber}], diambil, galat }` — daftar aplikasi terpasang di Windows (cache 5 menit, `ulang=1` memaksa pindai ulang) |
| GET | `/api/sinyal` | `{ ok, jendela: {ada,proses,judul}, volume: {persen,mute}, aktif }` — keadaan segera |
| POST | `/api/deck/pindah` | `{ pageId, dari, ke }` → `{ ok, deck }` (#2 tukar posisi) |
| GET | `/api/deck/export` | berkas JSON `{ format:"kumideck", versiFormat, aplikasi, dibuat, deck, ikon }` (#3) |
| POST | `/api/deck/import` | `{ format?, deck, ikon? }` → `{ ok, deck, ikon }` (#3) |
| GET | `/api/icons` | `{ ok, ikon: [{id,url,tipe,ukuran}] }` (#19) |
| POST | `/api/icons` | `{ dataUrl }` → `{ ok, id, ikon }` (SVG/PNG/WebP, maks 256 KB) (#19) |
| GET | `/ikon/<id>` | berkas ikon kustom (#19) |
| GET | `/api/tray` | `{ ok, tray }` (#6) |
| POST | `/api/tray` | `{ aktif: boolean }` → `{ ok, tray }` (#6) |
| GET | `/api/otomatis` | `{ ok, aktif, tray }` — status pintasan Startup (#6) |
| POST | `/api/otomatis` | `{ aktif: boolean }` → `{ ok, aktif }`; status dicerminkan ke `deck.settings.mulaiOtomatis` (#6) |
| GET | `/api/pwa` | `{ ok, https, sertifikat, alamat, tautan, petunjuk }` |
| GET | `/sertifikat.cer` | unduh sertifikat CA lokal (mode HTTPS) |
| GET | `/api/audio/perangkat` | `{ ok, perangkat: [{id,nama,bawaan}], galat }` |
| POST | `/api/audio/mainkan` | `{ id }` atau `{ sumber, volume, perangkatId }` → `{ ok, pesan, routeSementara }` |
| POST | `/api/audio/hentikan` | `{ ok, pesan }` |
| GET | `/api/mic` | `{ ok, mute, volume }` |
| POST | `/api/mic` | `{ mode: "togel"\\|"senyap"\\|"nyala" }` → `{ ok, mute, volume }` |
| POST | `/api/suara/unggah` | `{ nama, dataUrl }` → `{ ok, sumber }` (MP3/WAV/M4A/OGG/FLAC, maks 25 MB) |
| POST | `/api/soundboard/simpan` | `{ item }` → `{ ok, soundboard, item }` |
| POST | `/api/soundboard/hapus` | `{ id }` → `{ ok, soundboard }` |
| GET | `/api/appicon?target=…` | `{ ok, id, lebar, tinggi }` — ikon asli aplikasi (PNG 128) |
| GET | `/manifest.webmanifest` | manifest PWA Android (#15) |
| GET | `/sw.js` | service worker PWA (#15) |

`server` = `{ name, port, lan, lanUrl, connected }`.

`live` = `{ now, media: { ada, judul, artis, album, status, app } }` — data hidup
untuk tombol widget. `media.status`: `playing` | `paused` | `tertutup` | `galat`.

`sinyal` = `{ jendela: { ada, proses, judul }, volume: { persen, mute }, aktif }`
— dikirim lewat event `sinyal` untuk penanda status (#20) dan `GET /api/sinyal`.

`devices` = `[{ id, platform, name, lastSeen }]`.

`activity` = `[{ id, time, pageId, keyId, label, ok, message, platform }]` (maks 30, terbaru dulu).

### Pertahanan permintaan lintas-situs (1.3.1)

- `Sec-Fetch-Site: cross-site` → `403`.
- `Origin` (bila ada) harus sama dengan `Host`.
- `Host` harus loopback, alamat LAN mesin, atau nama host mesin (anti DNS
  rebinding).
- Badan permintaan wajib `application/json`; `text/plain` dan form ditolak.
- `/ikon/<id>` memakai `nosniff` + CSP `default-src 'none'; sandbox`.
- Maksimum 4 aksi berjalan bersamaan; `urutan`/`kondisional` maksimum
  kedalaman 3; `BATAS_BODY` 16 MB, kelebihan dibalas `413`.
- Saat `settings.terkunci` benar, `POST /api/deck` hanya menerima perubahan
  `settings.terkunci` (`423` untuk perubahan lain), dan `/api/deck/pindah` serta
  `/api/deck/import` dibalas `423`.
- Aksi `http` menolak alamat metadata cloud (169.254.0.0/16), alamat kosong, dan
  panggilan ke server KumiDeck sendiri; redirect tidak diikuti.

### Autentikasi

- Permintaan dari `127.0.0.1`/`::1` selalu diizinkan.
- Permintaan dari LAN wajib menyertakan token: header `x-kumi-token: <token>`
  atau query `?kode=<token>`.
- Token dibuat acak saat pertama kali server jalan, disimpan di `data/secret.json`,
  ditampilkan di UI desktop sebagai kode 8 karakter (format tampilan `abcd-efgh`).

### Peristiwa SSE

| event | data |
|---|---|
| `sync` | payload sama dengan `/api/state` |
| `press` | `{ pageId, keyId, ok, message, platform, volume? }` |
| `devices` | array devices |
| `activity` | array activity |
| `live` | `{ now, media }` — hanya dikirim bila papan memakai widget media (saat berubah atau tiap 15 dtk) |
| `sinyal` | `{ jendela, volume, aktif }` — saat berubah, saat tombol ditekan, tiap 5 dtk, dan sekali saat klien tersambung (#20) |
| `profil` | `{ pageId, alasan, otomatis: true }` — papan diminta berpindah halaman mengikuti aplikasi di depan (#16) |

## 3. Berkas bersama (dibuat oleh Lead, jangan diubah teammate)

- `public/js/core.js` → objek global `KD` (lihat API di dalam berkas).
- `public/css/app.css` → class `kd-*` untuk papan tombol, status, dan QR.
- `public/kumi/` → Kumi Design System (css, js, fonts, assets/icons.svg).

## 4. Class CSS bersama (di app.css)

Tombol papan:

```html
<button class="kd-key" data-variant="default" aria-pressed="false">
  <span class="kd-key__icon" aria-hidden="true">SVG</span>
  <span class="kd-key__label">Label</span>
</button>
<button class="kd-key kd-key--empty" aria-label="Slot kosong">+</button>

<!-- Tombol widget: hanya tampilan, tidak menjalankan aksi -->
<button class="kd-key kd-key--dark kd-key--widget" data-widget="jam">
  <span class="kd-key__widget">
    <span class="kd-key__nilai">20.45</span>
    <span class="kd-key__sub">Kam, 12 Nov</span>
  </span>
</button>
```

Keadaan: `.is-pressed` (kilat saat ditekan), `[disabled]`, `.kd-key--active`
(halaman aktif), `.kd-key__badge` (penanda sunting).

Kelas 1.3.0:

- `.kd-key[data-warna="kustom"]` + variabel `--warna-bg`/`--warna-fg` (#19).
- `.kd-key[data-tanda]` + `.is-aktif` (penanda status #20); atribut
  `data-tanda-proses` / `data-tanda-jendela`.
- `.kd-key.seret-aktif` / `.kd-key.seret-sasaran` (#2 seret & lepas).
- `body.kd-kunci-aktif` (papan terkunci #1), `body.kd-sunting` (#2).
- `kd-berbagi`, `kd-sakelar-teks`, `kd-warna`, `kd-warna-kustom`, `kd-otomatis`,
  `kd-pilih-ikon__item--kustom`, `kd-pratinjau--widget` (fitur13.css).

Wadah: `.kd-deck`, `.kd-grid` (variabel `--kd-cols`), `.kd-pages`,
`.kd-status` (`.is-online`/`.is-offline`), `.kd-pair`, `.kd-qr`, `.kd-empty`.

Server-side (bukan CSS): ikon kustom disajikan `GET /ikon/<id>`, gambar disimpan
di `data/ikon/`.

## 5. Aturan UI (dari panduan Kumi)

- Semua teks berbahasa Indonesia, tanpa emoji, ikon dari sprite Kumi.
- Hanya class `kumi-*`/`kd-*` dan token `--kumi-*`; tanpa nilai warna mentah.
- Terang dan gelap harus jalan; fokus terlihat; tombol ikon punya `aria-label`.
- Sediakan keadaan kosong, memuat, dan gagal.
- Satu aksi primary per pandangan.




