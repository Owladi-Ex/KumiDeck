# KumiDeck

Papan tombol (stream deck) yang berjalan di komputer Windows dan bisa dipakai
dari ponsel atau tablet lewat web. Semua aksi dijalankan **di komputer**, bukan di
ponsel.

Dibuat dengan **Kumi Design System v1.1.0** — tanpa dependensi npm, tanpa proses
build, hanya Node.js + HTML/CSS/JavaScript.

---

## Sekilas

- Grid tombol 5×3 (kolom 3–6, baris 2–4), beberapa halaman, 73 ikon garis.
- Tiap tombol: nama, ikon, warna (5 varian atau warna khusus), dan satu aksi.
- Aksi: pintasan papan ketik, mengetik teks, buka aplikasi/berkas/tautan,
  permintaan HTTP, kontrol media, pindah halaman, urutan beberapa aksi,
  **tindakan jendela**, **volume sistem**, **daya komputer**, dan
  **aksi bersyarat** (berbeda menurut aplikasi yang sedang di depan).
- **Soundboard** dengan unggah berkas/link, volume dan perangkat output per suara.
- **Mute/unmute mikrofon** langsung dari papan.
- **Ikon asli aplikasi** dipakai otomatis saat menambah aplikasi terpasang.
- **Widget tombol hidup**: jam, tanggal, dan lagu yang sedang diputar —
  tampil seperti tombol, berubah sendiri tanpa aksi.
- **Tambah cepat**: galeri tombol siap pakai — kontrol media, tangkapan layar,
  kunci layar, jendela, volume, dan aplikasi yang terpasang di komputer.
- **Pemilih aplikasi**: daftar aplikasi terpasang dipindai otomatis (termasuk
  Spotify, Discord, Steam, aplikasi Microsoft Store) — tidak perlu tahu
  perintahnya.
- **Perekam pintasan**: tekan kombinasi tombolnya, tidak perlu menulis
  `ctrl+shift+m`.
- **Kunci tata letak** dan **seret & lepas** untuk menata papan.
- **Impor/ekspor** papan sebagai berkas JSON (ikon kustom ikut disertakan).
- **Profil otomatis**: papan berpindah halaman mengikuti aplikasi di depan.
- **Penanda status**: tombol menyala selama aplikasi/jendela tertentu aktif.
- **Tray icon** + opsi **mulai otomatis** saat Windows menyala.
- Ponsel atau tablet jadi papan tombol nirkabel lewat Wi-Fi, bisa **dipasang sebagai
  PWA** (layar penuh tanpa bilah peramban), dipasangkan dengan kode QR.
- Sinkronisasi langsung: sunting di desktop, papan Remote langsung berubah.
- Mode terang & gelap, riwayat aktivitas, daftar perangkat terhubung.

---

## Syarat

- Windows 10/11
- Node.js 20 atau lebih baru ([nodejs.org](https://nodejs.org))
- Ponsel atau tablet dengan peramban (Chrome/Safari/Samsung Internet) di Wi-Fi yang sama

Tidak perlu `npm install` — tidak ada dependensi.

---

## Menjalankan

Klik dua kali **`start.cmd`**, atau dari terminal:

```powershell
cd D:\Harness\kumideck
node server/index.js
```

Konsol akan menampilkan:

```
  KumiDeck — papan tombol untuk desktop dan Remote
  Desktop : http://localhost:4173
  Remote  : http://192.168.1.64:4173/remote
  Kode    : B07D-8431
```

Port bisa diganti: `$env:PORT=4174; node server/index.js`.
Hentikan dengan `Ctrl+C` (konfigurasi tersimpan otomatis).

---

## Memasangkan perangkat Remote

1. Pastikan ponsel dan komputer di **Wi-Fi yang sama**.
2. Di desktop klik **Pasangkan Remote**.
3. Pindai kode QR dengan kamera ponsel — atau buka alamat yang tertera dan ketik
   kode 8 karakternya (`abcd-efgh`).
4. Di ponsel, pilih **Tambahkan ke layar utama** agar tampil penuh seperti
   aplikasi.

Kode pasangan tersimpan di `data/secret.json`. Menghapusnya berarti semua
perangkat harus memasangkan ulang.

> Windows Firewall mungkin bertanya sekali saat pertama dijalankan — pilih
> **Private networks**.

---

## Mengatur papan

1. Klik **Sunting meja** (tombol biru di kanan atas).
2. **Cara tercepat**: klik **Tambah cepat** → pilih kontrol media, tombol sistem,
   atau aplikasi terpasang (bisa dicari, mis. ketik `spotify`). Tombol langsung
   masuk ke slot kosong pertama.
3. Atau klik tombol/slot kosong untuk mengubah manual: nama, ikon, warna, dan
   jenis aksi → **Simpan tombol**.
4. **Kelola halaman** untuk menambah/mengganti nama/menghapus halaman.
5. **Setelan** untuk nama papan, jumlah kolom/baris, halaman awal, kunci tata
   letak, profil otomatis, dan mulai otomatis.

Klik **Selesai menyunting** untuk kembali ke mode pakai. Di mode pakai, klik
tombol langsung menjalankan aksinya.

### Menata papan

| Alat | Cara |
|---|---|
| **Seret & lepas** | Saat mode sunting, seret tombol ke slot lain untuk menukar posisi. Urutannya langsung tersimpan. |
| **Kunci tata letak** | Klik ikon gembok di kepala halaman. Saat terkunci, mode sunting dan seret dimatikan agar papan tidak tersenggol (berguna bila papan dipakai dari ponsel). |
| **Impor / Ekspor** | Tombol di kartu Perangkat. Ekspor mengunduh berkas JSON berisi papan + ikon kustom; impor meminta konfirmasi sebelum menimpa papan sekarang. |

### Ikon & warna khusus

- **Unggah ikon**: di editor tombol → **Unggah ikon** (SVG, PNG, atau WebP,
  maks 256 KB). Ikon kustom muncul paling depan di daftar ikon dan ikut tersimpan
  saat papan diekspor.
- **Warna khusus**: pilih latar dan warna teks sendiri di editor. Warna khusus
  mengalahkan varian Kumi; tekan **Hapus warna** untuk kembali ke varian.

### Penanda status tombol

Isi **Aplikasi** (mis. `chrome`) dan/atau **Judul jendela** pada bagian
**Penanda status** di editor. Tombol akan menyala selama jendela itu aktif di
komputer — berguna sebagai penunjuk "sedang di aplikasi apa".

### Tindakan jendela, volume, dan daya

| Jenis | Pilihan |
|---|---|
| **Tindakan jendela** | sembunyikan, maksimalkan, kembalikan ukuran, snap kiri/kanan, pindah monitor, Task View, tampilkan desktop, tutup jendela |
| **Volume sistem** | naik, turun, senyap/bersuara, atur ke nilai (0–100%), baca nilai |
| **Daya komputer** | tidur, kunci layar, mulai ulang, matikan, batalkan timer |

Tindakan jendela berlaku pada jendela yang **sedang aktif**; jalankan dari ponsel
agar jendela target tidak berubah. Mulai ulang/matikan meminta konfirmasi.

### Aksi bersyarat

Satu tombol bisa berperilaku berbeda menurut aplikasi yang di depan. Contoh:
bila `chrome` aktif → `ctrl+w`; bila tidak → buka `https://example.com`.

### Profil otomatis

Di **Setelan** aktifkan **Profil otomatis**, lalu tambahkan aturan
"aplikasi → halaman" (mis. `chrome` → halaman **Web**). Papan akan berpindah
halaman sendiri saat jendela depan berganti, di desktop maupun ponsel.

### Aksi "Buka aplikasi"

Saat memilih jenis aksi **Buka aplikasi, berkas, atau tautan**, ada tiga sumber:

| Sumber | Dipakai untuk |
|---|---|
| **Dari aplikasi terpasang** | Pilih dari daftar ±200 aplikasi hasil pemindaian (ada kolom pencarian). Mengisi target otomatis, mis. Spotify → `spotify:` |
| **Tautan (URL)** | Situs web, mis. `https://web.whatsapp.com` |
| **Jalur atau perintah manual** | Kasus khusus: `%USERPROFILE%\Downloads`, `C:\Program Files\App\app.exe`, `ms-settings:` |

### Perekam pintasan

Pada aksi **Pintasan papan ketik**, klik **Rekam tombol** lalu tekan kombinasinya
(mis. `Ctrl+Shift+M`). Tekan `Esc` untuk membatalkan rekaman.

### Widget (tombol yang menampilkan data)

Widget bukan tombol kerja: ia menampilkan informasi dan berubah sendiri.

| Widget | Tampilan | Sumber |
|---|---|---|
| **Jam** | `20.45` + `Kam, 12 Nov` | jam perangkat, diperbarui tiap detik |
| **Tanggal** | `Kamis, 12` + `November 2026` | tanggal perangkat |
| **Sedang Diputar** | judul lagu + artis/aplikasi | media yang aktif di Windows (Spotify, peramban, dll.) |

Cara menambah: **Sunting meja → Tambah cepat → Widget**, atau dari editor tombol
pilih jenis aksi **Widget**. Widget juga muncul otomatis di perangkat Remote.

Catatan:

- Widget media membaca pemutar yang sedang aktif **di komputer**. Bila tidak ada
  yang diputar, tombol menampilkan "Tidak ada".
- Widget tidak menjalankan aksi dan tidak tercatat di Aktivitas.
- Membaca media memakai API sistem (butuh Windows 10 1809+). Bila tidak
  tersedia, widget tetap tampil dengan keterangan kosong.

### Jenis aksi

| Jenis | Isi | Contoh |
|---|---|---|
| Pintasan papan ketik | kombinasi dengan `+` (bisa direkam) | `ctrl+shift+m`, `win+l`, `alt+f4`, `f5` |
| Mengetik teks | teks biasa | `Halo, dunia` |
| Buka aplikasi/berkas/tautan | aplikasi terpasang, URL, atau jalur | `spotify:`, `notepad`, `ms-settings:`, `%USERPROFILE%\Downloads` |
| Permintaan HTTP | metode + URL (+ isi) | `POST http://192.168.1.10:8000/saklar` |
| Kontrol media | salah satu perintah | putar/jeda, lagu berikut, volume naik/turun, senyapkan |
| Pindah halaman | halaman tujuan | kembali ke Utama |
| Tindakan jendela | salah satu perintah | snap kanan, pindah monitor, Task View |
| Volume sistem | mode | naik, turun, senyap, atur 40% |
| Daya komputer | salah satu perintah | kunci layar, tidur, mulai ulang |
| Bersyarat | syarat + dua cabang aksi | bila chrome → ctrl+w, selain itu buka tautan |
| Urutan aksi | beberapa langkah + jeda | buka VS Code, tunggu, buka GitHub |
| Widget | jam / tanggal / media | tampilkan data hidup, tanpa aksi |

Tombol pintasan dan teks dikirim ke **jendela yang sedang aktif**. Kalau fokus
masih di peramban KumiDeck, klik jendela tujuan dulu — atau jalankan tombol dari
ponsel.

---

## Struktur proyek

```
kumideck/
  start.cmd              Jalankan server + buka peramban
  rilis.cmd              Buat ZIP rilis (_rilis\kumideck-<versi>.zip)
  buat-exe.cmd           Buat versi .exe portabel (_exe\KumiDeck\)
  package.json           type: module; devDependencies hanya untuk build exe
  CONTRACT.md            Kontrak data/API/class antar bagian
  README.md              Dokumen ini
  CHANGELOG.md           Riwayat versi
  LICENSE                MIT
  server/
    index.js             HTTP, SSE, token, perangkat, aktivitas, berkas statis
    store.js             Normalisasi & penyimpanan deck, contoh deck
    actions.js           Eksekutor aksi (PowerShell/keybd_event)
    media.js             Pembaca media Windows untuk widget "Sedang Diputar"
    apps.js              Pemindai aplikasi terpasang (Start Menu + Store)
    apps.test.js         Uji pemindai aplikasi (npm test)
    qr.js                Pembuat QR SVG mandiri
    window.js            Pengamat jendela depan (profil otomatis, penanda status)
    window-actions.js    Tindakan jendela + daya
    volume.js            Kontrol volume Core Audio
    tray.js              Ikon baki sistem (#6)
    autostart.js         Pintasan mulai otomatis (#6)
    qr.test.js           Uji QR (npm test)
  scripts/
    rilis.ps1            Skrip pembuat ZIP rilis
    buat-exe.ps1         Skrip pembuat .exe portabel (SEA)
    inject-exe.js        Penyuntik awal bundel exe (folder aplikasi)
    sea-config.json      Konfigurasi Node.js SEA
  public/
    index.html           Papan desktop + penyunting
    remote.html          Papan Remote
    js/core.js           Inti bersama (API, SSE, tombol, ikon)
    js/desktop.js        Logika desktop
    js/remote.js         Logika Remote
    css/app.css          Tombol papan & kerangka remote
    css/desktop.css      Tata letak desktop
    css/remote.css       Tata letak Remote
    css/fitur13.css      Gaya kunci, seret, ikon/warna kustom
    manifest.webmanifest Manifest PWA
    sw.js                Service worker PWA
    icons/               Ikon PWA (192, 512, maskable, apple-touch)
    kumi/                Kumi Design System (jangan diubah)
  assets/
    icon.ico             Ikon aplikasi (exe + tray)
  data/
    deck.json            Konfigurasi papan
    secret.json          Kode pasangan
    ikon/                Ikon kustom hasil unggahan
```

---

## Teknis

- Server: Node.js `http` + **Server-Sent Events** (`/api/events`), tanpa
  pustaka WebSocket. Perintah dikirim lewat `POST`.
- Autentikasi: permintaan dari `127.0.0.1` bebas; dari LAN wajib token
  (`x-kumi-token` atau `?kode=`). Token 8 heksadesimal.
- `GET /api/state`, `POST /api/press`, `POST /api/deck`, `POST /api/pair`,
  `GET /api/qr.svg` — detail di `CONTRACT.md`.
- Aksi sistem dijalankan lewat PowerShell (`keybd_event`, `SendKeys`,
  `Start-Process`), dibangun dari daftar putih (tanpa sisipan mentah).
- Semua masukan deck divalidasi dan dinormalkan di server sebelum disimpan.
- Daftar aplikasi dibaca dari pintasan Start Menu (`WScript.Shell`) dan
  `Get-StartApps`, lalu di-cache 5 menit (`GET /api/apps`).

Uji: `npm test` menjalankan uji QR (vektor ISO 18004) dan uji pemindai aplikasi.

---

## Membuat rilis

```cmd
rilis.cmd
```

Menghasilkan `_rilis\kumideck-<versi>.zip` berisi `server/`, `public/`,
`start.cmd`, `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE`, dan
`CONTRACT.md`.

- **Tidak** menyertakan `data/` — agar setiap pengguna mendapat kode pasangan
  dan papan contoh sendiri saat pertama dijalankan.
- Penerima cukup mengekstrak ZIP, klik dua kali `start.cmd` (butuh Node.js 20+).
- Versi dinaikkan di `package.json`; catat perubahan di `CHANGELOG.md`.

---

## Versi .exe portabel

Untuk dibagikan ke orang yang **tidak punya Node.js**:

```cmd
buat-exe.cmd
```

Menghasilkan:

```
_exe\KumiDeck\KumiDeck.exe     + public\ + dokumentasi
_exe\KumiDeck-<versi>-portable.zip
```

- Exe berisi runtime Node.js + server (±92 MB; ZIP ±34 MB), sudah memakai ikon\n  KumiDeck dan informasi versi di Properties. Cukup folder itu,
  bisa diletakkan di USB — tidak ada instalasi.
- `data\` dibuat otomatis **di samping exe** saat pertama dijalankan. Salin
  seluruh folder untuk memindahkan papan & kode pasangan ke komputer lain.
- Peramban terbuka otomatis di `http://localhost:4173`.
- Jangan letakkan di `C:\Program Files` (Windows membatasi penulisan di sana).

Catatan saat membagikan:

- Exe **belum ditandatangani**, jadi Windows SmartScreen bisa menampilkan
  "Windows protected your PC" — pilih **More info → Run anyway**, atau gunakan
  sertifikat code signing agar hilang.
- Beberapa antivirus bisa curiga pada exe Node.js yang digabung (false positive
  umum untuk SEA). Bila perlu, bagikan ZIP + `start.cmd` sebagai alternatif.
- Perkakas build (`esbuild`, `postject`) hanya dibutuhkan di mesin pengembang
  (`npm install`), **bukan** oleh pengguna akhir — runtime tetap tanpa
  dependensi.

---

## Pemecahan masalah

| Gejala | Solusi |
|---|---|
| "Papan tidak dapat dimuat" | Server belum jalan; jalankan lalu klik **Coba lagi** |
| Ponsel tidak bisa membuka alamat | Wi-Fi berbeda / isolasi klien / firewall memblokir Node |
| Kode pasangan ditolak | Token berubah (secret.json terhapus); pasangkan ulang |
| Ikon dan font tidak muncul | Halaman dibuka lewat `file://` — harus lewat server |
| Pintasan tidak berpengaruh | Fokus ada di jendela lain; klik jendela target dulu |
| Daftar aplikasi kosong | Tekan **Pindai ulang**; di komputer tanpa PowerShell, isi jalur manual |
| Aplikasi tidak ada di daftar | Aplikasi portabel tanpa pintasan Start Menu — pakai **Jalur manual** |
| Port 4173 dipakai | `$env:PORT=4174; node server/index.js` |
| Port 4173 dipakai | `$env:PORT=4174; node server/index.js` |
| Tidak ada ikon di baki sistem | Aktifkan lewat tombol lonceng di kepala halaman (butuh Windows + PowerShell) |
| Tombol tidak bisa disunting | Papan terkunci — klik ikon gembok untuk membuka |
| Profil otomatis tidak berpindah | Pastikan **Setelan → Profil otomatis** menyala dan aturannya punya aplikasi + halaman |
| Aksi jendela tidak berpengaruh | Jendela target harus sedang aktif; jalankan dari ponsel |
| PWA tidak bisa dipasang | Butuh HTTPS atau localhost; lewat IP LAN pemasangan penuh mungkin dibatasi peramban |

---

## Kredit

Tampilan memakai **Kumi Design System v1.1.0** (lisensi font Inter & Space
Grotesk: SIL Open Font License 1.1). Ikon: set garis Kumi (24×24).






## Keamanan

KumiDeck dirancang untuk jaringan lokal, tanpa akun online.

- **Kode pasangan** (8 karakter) disimpan di `data/secret.json`; perangkat LAN
  wajib memakainya. Komputer ini sendiri (loopback) tidak dimintai kode.
- Permintaan dari **situs web lain** ditolak: `Sec-Fetch-Site: cross-site`,
  `Origin` yang tidak cocok, `Host` asing, serta badan non-JSON semuanya ditolak.
  Ini mencegah halaman web mana pun menekan tombol di komputermu.
- Ikon kustom disajikan sebagai aset mati (CSP ketat), ikon SVG tidak bisa
  menjalankan skrip.
- Teks dari deck (nama halaman, label) selalu di-escape sebelum ditampilkan.
- Maksimum 4 aksi berjalan bersamaan dan kedalaman aksi bersarang dibatasi.
- Aksi HTTP (untuk saklar rumah pintar) menolak alamat metadata cloud, alamat
  kosong, dan panggilan balik ke server KumiDeck sendiri.
- **Kunci tata letak** juga ditegakkan di server: selama terkunci, papan tidak
  bisa diubah, ditukar posisinya, atau diimpor (dibalas `423`).

Yang **tidak** dilindungi: siapa pun yang memegang kode pasangan dapat
mengubah papan, menambah ikon, dan menyalakan "mulai otomatis". Jangan bagikan
tautan `?kode=...` ke orang di luar jaringanmu. Untuk memutus akses, hapus
`data/secret.json` lalu jalankan ulang (semua perangkat harus memasangkan lagi).


## Soundboard

Panel **Soundboard** (tombol di kepala halaman) mengumpulkan suara pendek untuk
diputar saat siaran, main game, atau rapat.

| Fitur | Keterangan |
|---|---|
| Sumber | Berkas di komputer (diunggah ke `data/suara`) atau tautan `http(s)` |
| Volume | Per suara, 0–100 |
| Output | Ikuti perangkat default, atau pilih perangkat tertentu |
| Tombol papan | Di editor tombol pilih jenis aksi **Putar suara soundboard** |

Catatan output: pemilihan perangkat bekerja dengan **mengalihkan sementara
perangkat default sistem** selama suara berbunyi lalu mengembalikannya. Selama
suara itu diputar, audio aplikasi lain juga ikut berpindah sepersekian detik.
Jika KumiDeck dimatikan paksa saat pengalihan aktif, perangkat default bisa
tertinggal berpindah — hentikan lewat tombol **Hentikan** atau tutup KumiDeck
dengan `Ctrl+C` agar dipulihkan.

Format yang didukung: MP3, WAV, M4A, OGG, FLAC (maks 25 MB per berkas).

## Mikrofon

Mikrofon dikendalikan lewat **tombol papan**: di editor tombol pilih jenis aksi
**Mikrofon** dengan pilihan balik keadaan, senyapkan, atau nyalakan. Tombol ini
menyenyapkan/menyalakan mikrofon default Windows, jadi bisa ditekan dari ponsel.



## Memasang di perangkat Remote (PWA)

Aplikasi Remote-nya adalah **PWA**: dibuka lewat browser, lalu dipasang ke layar
utama sehingga tampil tanpa bilah alamat.

Chrome di Android hanya mengizinkan pemasangan pada **konteks aman** — `https://`
atau `localhost`. Membuka `http://192.168.x.x:4173` akan berjalan normal tetapi
tombol "Pasang aplikasi" tidak muncul. Ada dua cara:

### Cara A — mode HTTPS (disarankan, tanpa kabel)

1. Di desktop jalankan **`start-https.cmd`**.
2. Unduh sertifikat dari ponsel: `http://<ip-lan>:4174/sertifikat.cer`
   (port `PORT+1`, otomatis).
3. Pasang di Android: **Setelan → Keamanan → Enkripsi & kredensial →
   Pasang sertifikat → Sertifikat CA**, pilih berkas tadi.
4. Buka `https://<ip-lan>:4173/remote?kode=…` lalu menu Chrome →
   **Pasang aplikasi**.

### Cara B — lewat localhost (butuh kabel USB + adb)

```powershell
adb reverse tcp:4173 tcp:4173
```

Lalu di ponsel buka `http://localhost:4173/remote?kode=…` dan pasang.

### Catatan

- Sertifikat berlaku 5 tahun dan hanya untuk alamat LAN/nama komputer saat
  dibuat. Bila IP LAN berubah, hapus `data\tls` lalu jalankan ulang
  `start-https.cmd`.
- Sertifikat swa-tanda hanya melindungi jaringan lokal; jangan pakai di jaringan
  publik.


## Bahasa antarmuka (Indonesia / English)

KumiDeck tersedia dalam **Bahasa Indonesia** (bawaan) dan **English**.

- Desktop: **Setelan → Bahasa antarmuka**.
- Remote (ponsel/tablet): **Pengaturan perangkat → Bahasa**.

Pilihan disimpan di perangkat itu (`localStorage`), jadi ponsel dan komputer bisa
memakai bahasa berbeda. Pada kunjungan pertama, bahasa Inggris dipilih otomatis
hanya bila bahasa peramban jelas berbahasa Inggris; selain itu Indonesia.

Teks antarmuka (tombol, panel, pesan, label aksesibilitas) diterjemahkan lewat
kamus `public/js/bahasa.js` + `public/js/bahasa-tambahan.js`. **Label tombol dan
nama halaman tidak diterjemahkan** karena itu data milik pengguna. Menambah teks
baru: tambahkan pasangan Indonesia → Inggris di salah satu berkas kamus, dan
`KD.t("teks Indonesia")` akan menerjemahkannya di mana pun ia muncul.

## Ringan dan tanpa dependensi

- **Runtime tanpa dependensi**: `node server/index.js` langsung berjalan tanpa
  `node_modules`. Tidak ada framework, tidak ada langkah build untuk UI.
- Ukuran repo sumber ± **1,4 MB** (server, klien, aset, dokumentasi). Aset besar
  seperti `.exe` portabel dan arsip rilis **tidak** disimpan di repo — dibuat
  ulang lewat `buat-exe.cmd` / `rilis.cmd`, yang memasang dependensi build
  (`esbuild`, `postject`, `rcedit`) hanya saat dibutuhkan.
- Data pribadi (`data/`) tidak ikut repositori: kode pasangan, papan, ikon
  unggahan, suara, dan sertifikat TLS tetap di mesin pengguna.

