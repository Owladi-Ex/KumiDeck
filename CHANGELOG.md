# Riwayat Perubahan

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/) dan
versi mengikuti [SemVer](https://semver.org/lang/id/).

## [2.0.1] - 2026-11-13

### Diperbaiki

- **Soundboard: suara dari tautan `http`/`https` kini benar-benar bisa
  diputar.** Pemutar media WPF (`MediaPlayer`) menolak membuka URL jaringan
  (`Only site-of-origin pack URIs are supported for media`), sehingga suara
  bertipe tautan selalu gagal. Kini tautan diunduh lebih dulu ke cache lokal
  (`data\suara\tautan\<hash>.<ekstensi>`, batas 40 MB, cache lebih dari 30 hari
  dibersihkan otomatis) lalu diputar dari berkas lokal itu. Sumber yang
  dilaporkan ke UI tetap URL aslinya. Pesan galat dalam Bahasa Indonesia:
  HTTP 403, melebihi 40 MB, bukan berkas audio, host tidak ditemukan, atau
  unduhan terlalu lama.
- **`.gitignore`**: aturan `data/` juga mengabaikan folder sumber
  `native/KumiDeck/Data/` (`DeckStore.cs`, `DeckNormalizer.cs`, `Models.cs`),
  sehingga repo publik tidak dapat dibangun (`CS0246`). Diganti menjadi
  `/data/` agar hanya folder data pengguna di akar yang diabaikan.

## [2.0.0] - 2026-11-13

**Aplikasi native Windows 11.** Backend Node.js digantikan aplikasi C#
(.NET 10 + WPF + WebView2) yang membawa seluruh UI `public/` di dalam satu
`KumiDeck.exe` mandiri. Tidak ada Node.js, PowerShell, Chrome/Edge `--app`,
maupun jendela konsol saat dipakai. Antarmuka web dan API-nya tetap sama,
sehingga klien Remote di ponsel tidak berubah.

### Ditambahkan

- **Aplikasi native** `native/KumiDeck` (C#/.NET 10, WPF + WebView2): satu
  berkas `KumiDeck.exe` mandiri (~73 MB) berisi server HTTP/HTTPS, SSE, API,
  eksekusi aksi, pemindai aplikasi, soundboard, mikrofon, ikon aplikasi, tray,
  mulai otomatis, dan QR pasangan.
- **Title bar custom ala Windows 11**: tanpa caption bawaan; tombol
  perkecil/perbesar/tutup dibuat di UI, kepala aplikasi dipakai untuk menggeser
  jendela (snap ke tepi layar dan klik ganda untuk memperbesar tetap jalan),
  dan sudut jendela membulat.
- **Tata letak padat**: tinggi halaman dikunci ke jendela, papan mengisi sisa
  ruang, gulir hanya terjadi di dalam kartu, dan batang gulir disembunyikan di
  seluruh antarmuka — termasuk dialog Setelan.
- Gaya native disuntikkan dari sisi C# (`AddScriptToExecuteOnDocumentCreated`),
  jadi berkas di `public/` tidak diubah dan tetap bisa dipakai di peramban biasa.
- Ikon baki sistem tertanam di dalam exe; `/api/tray/ikon` melaporkannya.
- HTTPS opsional (`KD_HTTPS=1`) dengan sertifikat buatan sendiri dan server
  pengalih `308` di port+1, sama seperti versi Node.
- `scripts/buat-installer.ps1` (Inno Setup) dan `scripts/rilis.ps1` (paket
  portabel + `SHA256.txt`), dipanggil lewat `buat-installer.cmd` / `rilis.cmd`.

### Diubah

- `scripts/buat-exe.ps1` kini mempublikasikan aplikasi .NET menjadi satu berkas.
- Gerak khas peramban dimatikan: zoom Ctrl+roda, cubit (pinch), dan geser dua
  jari untuk maju/mundur. Pintasan salin-tempel tetap aktif.
- Pemasang tidak lagi menghapus folder aplikasi saat dicopot, supaya data
  pengguna (papan, token pasangan, ikon, suara, sertifikat) tidak hilang.
- Server Node di `server/` tetap ada sebagai versi lama/rujukan.

### Distribusi

- `KumiDeck-2.0.0-setup.exe` (pemasang) dan `KumiDeck-2.0.0-portabel.zip`.
- Syarat: Windows 10 (1809+)/11 64-bit + Microsoft Edge WebView2 Runtime
  (sudah ada di Windows 11).

## [1.0.0] — 2026-11-13

**Rilis publik pertama.** Kode yang sama dengan versi pengembangan internal
1.7.6, dilabeli ulang sebagai 1.0.0 untuk rilis GitHub.

### Fitur

- Papan tombol berhalaman (kolom 3-6, baris 2-4) dengan ikon, warna, dan varian.
- Aksi: pintasan papan ketik, mengetik teks, buka aplikasi/berkas/tautan,
  permintaan HTTP, kontrol media, pindah halaman, urutan aksi, tindakan jendela,
  volume sistem, daya komputer, mikrofon, soundboard, dan aksi bersyarat.
- **Soundboard**: unggah berkas atau tautan, volume dan perangkat output per suara.
- **Ikon asli aplikasi** diekstrak otomatis saat menambah aplikasi terpasang.
- **Widget** jam, tanggal, dan lagu yang sedang diputar.
- **Tambah cepat**, pemindai aplikasi terpasang, perekam pintasan.
- Kunci tata letak, seret & lepas, impor/ekspor papan (JSON).
- Profil otomatis, penanda status, tray icon, mulai otomatis.
- Klien Remote (PWA) untuk ponsel/tablet, dipasangkan lewat kode QR, bisa
  dipasang sebagai aplikasi bila tersedia HTTPS.
- Mode terang/gelap, riwayat aktivitas, daftar perangkat, bahasa ID/EN.

### Distribusi

- **Portabel**: `KumiDeck-1.0.0-portable.zip` - ekstrak, lalu klik dua kali
  `Buka KumiDeck.cmd`. Server berjalan tanpa konsol, UI terbuka di jendela
  aplikasi sendiri (tanpa bilah alamat/tab), tray icon tersedia.
- Tanpa dependensi runtime; cukup Windows 10/11.

## [1.7.6] — 2026-11-13

### Ditambahkan

- **Mode jendela aplikasi**: UI desktop kini bisa dibuka sebagai jendela sendiri
  (mirip aplikasi Windows) memakai mode `--app` peramban — tanpa bilah alamat,
  tanpa tab, ikon & judul sendiri, entri taskbar sendiri. Pemilih peramban:
  Chrome → Edge → Brave; profil khusus di `data\jendela\profil`.
- `server/jendela.js`: membuka jendela lewat pintasan (.lnk) yang dijalankan
  shell Windows (rundll32/explorer/cmd start) agar proses peramban tidak
  mewarisi batasan proses induk — akar masalah crash Chrome 0x80000003.
- **`Buka KumiDeck.cmd`** sebagai peluncur utama paket portabel; juga
  `Buka di Peramban.cmd` dan `Jalankan Server Saja.cmd`.
- Menu baki sistem: "Buka papan" membuka jendela aplikasi, "Buka di peramban"
  membuka di peramban biasa.
- Log aplikasi `data\kumideck.log` (dipakai saat konsol disembunyikan).

### Diubah

- `.exe` portabel **tidak lagi membuka peramban/jendela sendiri** dan **tidak
  menampilkan jendela konsol** (subsistem PE diubah ke GUI). Peluncur
  `Buka KumiDeck.cmd` yang menyalakan server lalu membuka jendela aplikasi.
- `BACA-INI.txt` diperbarui untuk alur baru.
## [1.7.5] — 2026-11-13

### Diperbaiki

- **Peramban tidak lagi dibuka lewat `cmd /c start`.** Bila aplikasi berjalan di
  lingkungan proses terbatas (job object), Chrome yang diluncurkan dengan cara
  itu bisa berhenti dengan **"Exception Breakpoint 0x80000003"**. URL kini
  dibuka lewat `explorer.exe`, dengan cadangan `rundll32` dan `cmd start`, dan
  kegagalan membuka peramban tidak lagi menghentikan aplikasi.
- Paket portabel menambah **`Jalankan Tanpa Peramban.cmd`** (menjalankan dengan
  `KD_OPEN=0`) untuk mesin yang perambannya tetap bermasalah; buka
  `http://localhost:4173` manual.
- `BACA-INI.txt` memuat catatan troubleshooting error Breakpoint tersebut.
## [1.7.4] — 2026-11-13

### Diubah

- **Versi portabel dijadikan jalur utama**: ZIP berisi `KumiDeck.exe`, folder
  `public`/`assets`, `BACA-INI.txt`, dan peluncur **`Jalankan KumiDeck.cmd`** —
  cukup diekstrak lalu dijalankan, tanpa pemasangan dan tanpa admin.
- `BACA-INI.txt` diperbarui: langkah menjalankan, tautan Remote (istilah
  "Pasangkan Remote"), letak folder `data`, dan catatan SmartScreen.
- `CONTRACT.md` tidak lagi ikut ke paket portabel (dokumen internal).

### Catatan

- Installer tetap tersedia sebagai alternatif (`KumiDeck-Setup-<versi>.exe`).
- Uji: ZIP diekstrak ke folder kosong lalu dijalankan → `/api/state` 200,
  `/` 200, `data\deck.json` dibuat di samping exe, versi exe 1.7.4.
## [1.7.3] — 2026-11-13

### Diperbaiki

- Installer memilih folder tujuan **otomatis dari daftar lokasi yang benar-benar
  bisa ditulis** (D:\KumiDeck, %LOCALAPPDATA%\KumiDeck,
  %LOCALAPPDATA%\Programs\KumiDeck, folder profil, lalu drive sistem). Ini
  mengatasi kegagalan "Error 5: Access is denied" saat membuat folder bawaan di
  mesin yang membatasi penulisan pada %LOCALAPPDATA%.
- `UsePreviousAppDir=no`: folder dari pemasangan lama yang bermasalah tidak lagi
  dipakai ulang secara diam-diam.
- Tersedia juga **ZIP portabel** (`KumiDeck-<versi>-portable.zip`) sebagai jalan
  alternatif tanpa pemasangan.
## [1.7.2] — 2026-11-13

### Diperbaiki

- Installer: folder bawaan dipindah dari `{autopf}\KumiDeck` ke
  **`%LOCALAPPDATA%\KumiDeck`**, dan halaman pemilihan folder kini **selalu
  tampil** sehingga pengguna bisa memilih lokasi lain bila folder bawaan
  bermasalah. Pintasan memakai cakupan pengguna (`{userprograms}`,
  `{userdesktop}`, `{userstartup}`) agar tidak pernah memicu permintaan izin.
- Installer kini **selalu menulis log** ke `%TEMP%\Setup Log*.txt`
  (`SetupLogging=yes`) untuk memudahkan diagnosa bila pemasangan gagal.
## [1.7.1] — 2026-11-13

### Diperbaiki

- Penyiapan HTTPS dipindah ke fungsi `async` sehingga server tidak lagi memakai
  **top-level await**. Ini memperbaiki pembuatan `.exe` (SEA) yang dibangun
  sebagai CommonJS: sebelumnya bundling gagal dengan galat
  "Top-level await is currently not supported with the cjs output format".
  Perilaku aplikasi tidak berubah.
## [1.7.0] — 2026-11-13

### Dibersihkan

Repo dikecilkan dari **240 MB → 1,4 MB** tanpa menghilangkan fitur:

| Dihapus | Ukuran | Alasan |
|---|---:|---|
| `_exe/` | 126,5 MB | hasil build portabel (dibuat ulang lewat `buat-exe.cmd`) |
| `build/` | 92,6 MB | folder kerja SEA saat membangun exe |
| `node_modules/` | 18,5 MB | dependensi build (`esbuild`, `postject`, `rcedit`); dipasang otomatis oleh `scripts/buat-exe.ps1` saat dibutuhkan |
| `_rilis/` | 0,2 MB | arsip ZIP rilis lama (dibuat ulang oleh `rilis.cmd`) |
| `package-lock.json` | 20 KB | dibuat ulang saat `npm install` |
| `public/kumi/css/charts.css` | 44 KB | tidak pernah dirujuk halaman mana pun |
| `assets/tray.png`, `scripts/buat-ikon-pwa.py` | 6 KB | tidak dirujuk kode |
| Ikon/suara uji di `data/` | ~90 KB | sisa pengujian, bukan aset pengguna |
| Sertifikat & penanda tray di `data/` | 4 KB | dibuat ulang otomatis saat dipakai |

Aset pengguna **dipertahankan**: `data/deck.json`, `data/secret.json`, ikon yang
dirujuk papan, dan berkas suara yang diunggah.

### Diubah

- Service worker: entri cache `tailwind.css` yang tidak dipakai dihapus, versi
  cache dinaikkan ke `kumideck-v4`.
- `package.json` dirapikan (JSON valid tanpa baris kosong berlebih).

### Catatan

- Runtime tetap **tanpa dependensi**: `node server/index.js` langsung jalan tanpa
  `node_modules`. Dependensi hanya dibutuhkan saat membangun `.exe`, dan
  `scripts/buat-exe.ps1` memasangnya sendiri bila belum ada.
## [1.6.0] — 2026-11-13

### Ditambahkan

- **Opsi bahasa Indonesia / English** untuk seluruh antarmuka. Pilihan tersedia
  di **Setelan → Bahasa antarmuka** (desktop) dan **Pengaturan perangkat**
  (Remote), disimpan per perangkat di `localStorage`, dan mengikuti bahasa
  peramban hanya bila jelas berbahasa Inggris.
- `public/js/bahasa.js` + `public/js/bahasa-tambahan.js`: kamus ~300 entri
  (teks statis HMTL, label dinamis, istilah aksi, pesan) plus pola untuk pesan
  yang memuat angka/nama ("Volume 45%", "2 jam lalu", "… ditambahkan ke slot 3").
- `KD.t()`, `KD.pasangBahasa()`, `KD.terapkanBahasa()`, `KD.amatiBahasa()`:
  penerjemah DOM yang menyapu teks dan atribut (`aria-label`, `title`,
  `placeholder`, `alt`, `value`) lalu mengamati perubahan DOM, sehingga teks
  yang dibuat JavaScript ikut diterjemahkan tanpa menyunting tiap render.
- `KD.toast()` dan `KD.jelaskan()` menerjemahkan pesannya secara terpusat,
  termasuk pesan hasil aksi dari server.
- `<html lang>` ikut berubah agar pembaca layar dan kamus peramban menyesuaikan.

### Diubah

- Layanan worker menaikkan versi cache (`kumideck-v3`) dan ikut menyimpan kedua
  berkas kamus.
- Label alamat papan, status antar-aplikasi, dan deskripsi aksi dibangun lewat
  `KD.t()` supaya ikut berbahasa Inggris.

### Catatan

- Label tombol dan nama halaman adalah **data pengguna**, jadi tidak
  diterjemahkan — hanya antarmuka yang berubah bahasa.
## [1.5.2] — 2026-11-13

### Diubah

- **Istilah "Android" diganti "Remote"** di seluruh teks yang dilihat pengguna,
  karena perangkat yang bisa tersambung bukan hanya Android (iOS, tablet, dan
  peramban desktop juga bisa):
  - tombol & judul modal **Pasangkan Remote**, teks bantuan kode pasangan,
    label daftar perangkat ("Belum ada perangkat Remote terpasang",
    "N Remote terhubung"), teks QR, dan label platform di remote;
  - menu baki sistem **Salin tautan Remote**, serta nama perangkat bawaan
    "Perangkat Remote";
  - banner HTTPS dan petunjuk pemasangan PWA;
  - README (bagian **Memasangkan perangkat Remote** dan
    **Memasang di perangkat Remote (PWA)**); istilah "Chrome di Android" tetap
    dipakai hanya pada langkah khusus Android.
- **Ikon tema tanpa border**: tombol ganti tema kini benar-benar hanya ikon
  (border transparan, latar transparan, tanpa bayangan) di keadaan terang
  maupun gelap.

### Diperbaiki

- **Ikon gembok terkunci kini berisi penuh** (padlock solid dengan lubang kunci
  transparan), sedangkan gembok terbuka tetap bergaris — sehingga keadaan
  terkunci/terbuka langsung terbaca.
## [1.5.1] — 2026-11-13

### Diubah

- **Tata letak kepala halaman**: Soundboard & Setelan bergeser ke kiri, lalu
  kelompok sakelar di kanan — audio, tray, kunci — kemudian tombol utama
  "Sunting meja", dan **tema paling kanan** (sudut kanan atas).
- **Sakelar tema tidak lagi berwarna biru** saat mode gelap aktif: ia hanya
  mengganti tampilan, bukan menyalakan fitur. Ikon bulan/matahari tetap berganti
  dan `aria-pressed` tetap menandai keadaan gelap untuk pembaca layar.
- **Ikon Ekspor/Impor dibetulkan arahnya**: Ekspor memakai panah keluar
  (`i-upload`), Impor memakai panah masuk (`i-download`) — sebelumnya tertukar.
## [1.5.0] — 2026-11-13

### Ditambahkan

- **Mode HTTPS lokal** (`start-https.cmd` / `KD_HTTPS=1`) dengan sertifikat
  swa-tanda otomatis untuk `localhost`, nama komputer, dan IP LAN. Diperlukan
  karena Chrome Android hanya mau memasang PWA pada konteks aman (HTTPS atau
  localhost) — bukan `http://alamat-LAN`.
- Sertifikat bisa diunduh dari **`/sertifikat.cer`** (juga lewat port HTTP
  `PORT+1` supaya ponsel bisa mengunduhnya sebelum HTTPS dipercaya) lalu
  dipasang sebagai *Sertifikat CA* di Android.
- Port HTTP kedua (`PORT+1`) mengalihkan tautan lama ke HTTPS (308).
- `GET /api/pwa` — status HTTPS, tautan siap pakai, dan petunjuk pemasangan.
- `server/ps.js` — lingkungan PowerShell 5.1 yang bersih. Sebelumnya
  `PSModulePath` warisan PowerShell 7 membuat modul `Security` gagal dimuat
  sehingga drive `Cert:` tidak ada dan pembuatan sertifikat gagal.
- Banner di halaman Android kini menjelaskan syarat HTTPS bila dibuka lewat
  HTTP biasa (tidak membuat pengguna menebak).

### Diubah

- **Keempat sakelar kepala halaman diseragamkan** (suara, tema, tray, kunci):
  kelas bersama `kd-toggle`, ukuran 44×44, `aria-pressed="true"` selalu berarti
  fitur aktif, dan keadaan aktif selalu ditandai warna aksen + latar tint.
  Ikonnya berganti otomatis: pengeras suara isi/polos, bulan/matahari,
  lonceng isi/polos, gembok tertutup/terbuka.
- Seluruh pemanggilan PowerShell (tray, ikon aplikasi, audio, mikrofon,
  pemindai aplikasi, sertifikat) memakai lingkungan modul yang bersih.
## [1.4.4] — 2026-11-13

### Diperbaiki

- **Ikon tombol suara sempat tidak tampil**: sprite tambahan
  `public/assets/kd-icons.svg` disajikan dengan cache 1 hari, sehingga peramban
  masih memakai versi lama yang belum memuat `kd-volume-on`/`kd-volume-off`.
  Aset aplikasi (`.svg`) kini `no-cache` (hanya font/gambar vendor Kumi yang
  di-cache lama) dan sprite diminta dengan `?v=1.4.4`.
- **Ikon baki sistem**: ikon diubah menjadi kotak aksen dengan huruf **K** putih
  (`assets/tray.ico`, 9 ukuran 16–256 px) agar tidak mungkin tertukar dengan
  ikon aplikasi lain.

### Ditambahkan

- Keadaan tray kini disimpan di berkas (`data/tray.pid`, `tray.on`,
  `tray.berjalan`), bukan hanya variabel memori — status tetap benar setelah
  server dijalankan ulang.
- **Auto-restart tray**: bila proses PowerShell tray mati (mis. terbunuh),
  server menyalakannya lagi selama pengguna belum memilih "Keluar" dari menu
  tray.
- Tray menulis `data/tray.log` berisi berkas ikon yang benar-benar dipakai dan
  ukurannya, plus endpoint diagnosa `GET /api/tray/ikon`.
- Tooltip tray menjadi "KumiDeck - papan tombol".
## [1.4.3] — 2026-11-13

### Diubah

- **Ikon suara antarmuka** mengikuti pola ikon keadaan lain: **pengeras suara
  isi** saat suara aktif, **pengeras suara dibisukan (polos)** saat dimatikan.
  Memakai dua `<svg>` dengan kelas `kumi-icon--sound-on/-sound-off` sehingga
  Kumi Design System sendiri yang menukarnya lewat `[data-kumi-sound]`, tanpa
  perlu JavaScript tambahan. Simbol baru `kd-volume-on` dan `kd-volume-off`
  ditambahkan ke `public/assets/kd-icons.svg`.
## [1.4.2] — 2026-11-13

### Diubah

- **Ikon gembok**: gembok **tertutup** saat tata letak terkunci, gembok
  **terbuka** saat tata letak bisa disunting (sebelumnya memakai ikon mata).
- **Ikon lonceng**: **polos** saat ikon KumiDeck tidak tampil di baki sistem,
  **isi penuh** saat tampil. Tombol juga memberi warna aksen ketika aktif.
- Sprite ikon tambahan aplikasi `public/assets/kd-icons.svg` (gembok terbuka,
  gembok tertutup, lonceng polos, lonceng isi) disuntik bersama sprite Kumi,
  sehingga gaya garisnya (24×24, garis 1,75, `currentColor`) tetap konsisten.
## [1.4.1] — 2026-11-13

### Diubah

- Tombol **mikrofon di kepala halaman dihapus** (duplikat dengan Soundboard).
  Mikrofon tetap tersedia sebagai aksi tombol papan: jenis aksi **Mikrofon**.
- Tombol ganti tema kini menampilkan **bulan** di mode terang dan **matahari**
  di mode gelap (ikon diselaraskan otomatis lewat MutationObserver).
- Tombol **kunci tata letak** memakai ikon berbeda: **gembok** saat terkunci,
  **mata** saat terbuka.
- Ikon baki sistem memakai varian **isi penuh** (`assets/tray.ico`) agar menonjol
  di taskbar, terpisah dari ikon aplikasi (`assets/icon.ico`).

### Diperbaiki

- **Volume per suara soundboard tidak terasa**: WMPlayer mengatur ulang
  `settings.volume` saat URL baru dimuat. Volume kini dipasang lagi sesudah
  `controls.play()` dan sekali lagi setelah media berjalan.
- Mengubah volume suara yang **sedang diputar** langsung diterapkan ke pemutar.
- Slider volume menerima nilai **0** (sebelumnya `0` jatuh ke 100 karena `|| 100`).
- Pilihan **perangkat output massal** di panel Soundboard kini benar-benar
  disimpan ke server (sebelumnya hanya mengubah data di memori).
- `GET /api/audio/status` ditambahkan agar UI/skrip bisa membaca keadaan pemutar.
## [1.4.0] — 2026-11-13

### Ditambahkan

- **Soundboard**: daftar suara (berkas lokal atau tautan http) dengan panel
  tersendiri, tombol putar/hentikan, dan aksi tombol papan `suara` untuk
  memutar suara tertentu tanpa membuka panel.
- **Unggah berkas suara**: berkas MP3/WAV/M4A/OGG/FLAC (maks 25 MB) disimpan
  ke `data/suara` sehingga bisa diputar dari papan.
- **Volume per suara** (0–100) dan **pilihan perangkat output** per suara.
  Perangkat output dipilih lewat Core Audio dengan pengalihan sementara
  perangkat default sistem selama suara berbunyi (dipulihkan otomatis).
- **Mute/unmute mikrofon**: tombol mikrofon di kepala halaman (status nyata dari
  Windows) plus jenis aksi `mic` (balik / senyap / nyala).
- **Ikon asli aplikasi**: memilih aplikasi terpasang kini memakai ikon `.exe`
  aslinya (128×128 PNG) lewat `GET /api/appicon?target=…`, baik dari Tambah
  cepat maupun dari editor tombol.
- `GET /api/audio/perangkat`, `POST /api/audio/mainkan`, `POST /api/audio/hentikan`,
  `GET|POST /api/mic`, `POST /api/suara/unggah`,
  `POST /api/soundboard/simpan`, `POST /api/soundboard/hapus`.
- **Lapisan poles visual** (`public/css/polish.css`): gradien latar halus, kartu
  papan terasa timbul, transisi modal, tombol mikrofon senyap yang jelas, dan
  animasi masuk yang tetap menghormati `prefers-reduced-motion`.

### Diubah

- Unggah ikon: batas naik ke 512 KB, menerima `.svg/.png/.webp` meski peramban
  tidak mengisi MIME, ikon unggahan dikelompokkan di bagian **“Ikon Anda”** dan
  langsung terpilih setelah diunggah, plus status proses di editor.
- `deck.soundboard` ikut tersimpan, diekspor, dan diimpor bersama papan.
- Aksi `suara` memakai volume & perangkat dari item soundboard.
## [1.3.1] — 2026-11-13

Perbaikan hasil review independen (laporan di vault: `Review Server 1.3.md`,
`Review UI 1.3.md`, `Review 1.3.md`, `Review Data dan Kontrak 1.3.md`).

### Keamanan

- DoS tanpa autentikasi: `decodeURIComponent` dipindah ke dalam `try`, sehingga
  `GET /%E0%A4%A` dibalas `400` dan server tidak mati lagi.
- CSRF/DNS rebinding: tolak `Sec-Fetch-Site: cross-site`, wajibkan `Origin`
  cocok dengan `Host`, batasi `Host` ke loopback/alamat LAN/nama mesin, dan
  wajibkan badan permintaan `application/json`.
- `/ikon/<id>` memakai `nosniff` + CSP ketat agar SVG unggahan tidak menjalankan
  skrip; penyajian statis memeriksa pemisah path.
- Maksimum 4 aksi bersamaan pada `/api/press` (kelebihan dibalas `429`).

### Diperbaiki

- XSS tersimpan lewat `Kumi.toast` ditutup dengan meng-escape pesan di `KD.toast`.
- Kontras `.kumi-btn--soft` naik dari 3,07–4,34:1 menjadi 15,1:1 (terang) dan
  14,4:1 (gelap); `.kumi-btn--danger` di mode gelap dari 2,25:1 menjadi 6,94:1.
- Overlay tertutup tidak lagi ikut urutan Tab (`visibility: hidden`), dan fokus
  kembali ke tombol pemicu setelah Esc (dua sistem modal kini berbagi penanda
  fokus `__kumiLastFocus`).
- QR pasangkan tidak lagi terdistorsi: rasio 1:1 terjaga (184×184).
- Kunci tata letak ditegakkan **di server**: selama terkunci, `POST /api/deck`
  hanya menerima perubahan `settings.terkunci`, sedangkan tukar posisi dan impor
  dibalas `423`.
- Badan permintaan melebihi batas kini dibalas `413` yang jelas, bukan
  memutus koneksi.
- Contoh deck baru kini lahir dari normalisasi sehingga `settings` selalu
  memuat `terkunci`, `autoProfil`, dan `mulaiOtomatis`.
- Aksi `http` menyaring tujuan: alamat metadata cloud/link-local, alamat kosong,
  dan panggilan ke server KumiDeck sendiri ditolak; redirect tidak diikuti dan
  isi balasan dibuang.
- Mode volume "baca" tidak lagi menjadi "naik".
- Batas impor 16 MB (UI 12 MB) agar ekspor dengan banyak ikon bisa diimpor lagi.
- Kunci tata letak tidak lagi memblokir penekanan tombol; hanya penyuntingan.
- Widget media baru menerima `live`; pembaca media tidak hidup lagi setelah
  dihentikan; menu Keluar tray benar-benar menghentikan server.
- "Tutup jendela" mengirim Alt+F4, bukan minimize.
- Kedalaman aksi bersarang dibatasi 3; id tombol kembar dinormalkan;
  `settings.mulaiOtomatis` dicerminkan ke deck; pemindaian aplikasi tidak ganda.
# Riwayat Perubahan

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/) dan
versi mengikuti [SemVer](https://semver.org/lang/id/).

## [1.3.0] — 2026-11-13

### Ditambahkan

- **Kunci tata letak** (#1): tombol gembok di kepala halaman; saat terkunci,
  mode sunting dan seret dimatikan agar tombol tidak tersenggol. Statusnya
  tersimpan di papan (`settings.terkunci`).
- **Seret & lepas untuk menukar posisi** (#2): seret tombol ke slot lain saat
  mode sunting. Endpoint baru `POST /api/deck/pindah`.
- **Impor/ekspor papan** (#3): `GET /api/deck/export` (berkas JSON siap unduh,
  ikon kustom ikut disertakan) dan `POST /api/deck/import` (validasi + konfirmasi
  sebelum menimpa). Tombol **Ekspor** / **Impor** di kartu Perangkat.
- **Tray icon + mulai otomatis** (#6): ikon di baki sistem dengan menu Buka
  papan / Salin tautan Android / Keluar; pintasan Startup untuk berjalan saat
  Windows menyala. Endpoint `GET|POST /api/tray` dan `GET|POST /api/otomatis`.
- **Tindakan jendela** (#8): minimize, maximize, restore, snap kiri/kanan,
  pindah monitor, Task View, tampilkan desktop, tutup jendela.
- **Kontrol volume sistem** (#9) lewat Windows Core Audio — nilai dibaca dan
  dilaporkan, termasuk mode naik/turun/senyap/atur nilai.
- **Aksi daya** (#10): tidur, kunci layar, mulai ulang, matikan, batalkan timer
  (aksi merusak meminta konfirmasi).
- **Aksi bersyarat** (#17): perilaku berbeda menurut aplikasi/jendela di depan.
- **Profil otomatis** (#16): aturan "aplikasi → halaman"; papan berpindah sendiri
  saat jendela depan berganti (desktop dan ponsel).
- **Ikon kustom** (#19): unggah SVG/PNG/WebP (maks 256 KB), tersimpan di
  `data/ikon/`, disajikan lewat `/ikon/<id>`, ikut dalam ekspor/impor.
- **Warna khusus tombol** (#19): latar & teks bebas selain 5 varian Kumi.
- **Penanda status tombol** (#20): tombol menyala selama aplikasi/jendela yang
  ditentukan aktif; data dikirim lewat event SSE baru `sinyal`.
- **PWA Android** (#15): `manifest.webmanifest`, service worker (aset
  cache-first, `/api` tidak pernah di-cache), 4 ikon, banner "Tambahkan ke layar
  utama" dengan `beforeinstallprompt`.
- `GET /api/sinyal` untuk membaca jendela depan + volume saat itu juga.

### Diubah

- Volume/senyap dari aksi media lama kini memakai Core Audio sehingga nilainya
  bisa ditampilkan (sebelumnya mengirim tombol media).
- Deskripsi aksi di `aria-label` kini menjelaskan aksi baru (jendela, volume,
  daya, bersyarat), bukan hanya nama jenis.
- `start.cmd` memakai jalur absolut; tray dihidupkan otomatis (matikan dengan
  `KD_TRAY=0`).

### Diperbaiki

- Skrip PowerShell tindakan jendela: kode C# disuntik lewat variabel here-string
  sehingga terbaca benar oleh PowerShell 5.1.
- Ikon `.ico` dibuat ulang multi-ukuran (16–256 px) agar `NotifyIcon` Windows
  menerimanya.

## [1.2.0] — 2026-11-12

### Ditambahkan

- **Widget tombol hidup**: tombol yang menampilkan data, bukan aksi.
  - `jam` — waktu sekarang + hari/tanggal singkat (diperbarui tiap detik).
  - `tanggal` — tanggal lengkap (hari, tanggal, bulan, tahun).
  - `media` — judul lagu dan artis/aplikasi dari pemutar yang sedang aktif di
    Windows (Spotify, peramban, pemutar lain), lewat API media sistem.
- **Pembaca media** (`server/media.js`): satu proses PowerShell yang hidup lama
  membaca `GlobalSystemMediaTransportControlsSessionManager`, mengirim JSON saat
  keadaan berubah. Nyalakan hanya bila papan memakai widget media.
- **Event SSE `live`** + `live` pada `/api/state` untuk menyuplai data widget.
- Widget bisa ditambah lewat **Tambah cepat → Widget**, atau dari editor tombol
  (jenis aksi "Widget") dengan pratinjau langsung.
- Contoh deck kini memuat widget "Sekarang" (jam) dan "Sedang Diputar" (media).

### Diubah

- Tombol widget tidak mengirim aksi saat ditekan (di desktop maupun Android) dan
  tidak tercatat sebagai aktivitas.
- Ukuran teks widget mengikuti sisi terkecil tombol, sehingga tetap terbaca di
  potret maupun lanskap Android.

## [1.1.0] — 2026-11-12

### Ditambahkan

- **Versi .exe portabel**: `buat-exe.cmd` (Node.js SEA + esbuild + postject)
  menghasilkan `_exe\KumiDeck\KumiDeck.exe` + folder `public/` + ZIP portabel.
  Penerima tidak perlu memasang Node.js — cukup jalankan exe. Exe memakai ikon\n  KumiDeck dan informasi versi (ProductName/FileDescription) di Properties.
- **Pemilih aplikasi terpasang**: aksi "Buka aplikasi, berkas, atau tautan"
  kini bisa memilih aplikasi dari daftar yang dipindai server
  (`GET /api/apps`) — tidak perlu lagi mengetik `spotify:` atau jalur exe.
  Mendukung aplikasi klasik (pintasan Start Menu) dan aplikasi Store/UWP.
- **Tambah cepat**: galeri tombol siap pakai di mode sunting (kontrol media,
  tangkapan layar, kunci layar, kalkulator, Spotify, dan aplikasi yang
  terpasang). Satu klik langsung mengisi slot kosong.
- **Perekam pintasan**: tombol "Rekam tombol" di editor — tekan kombinasi di
  papan ketik, tidak perlu menulis `ctrl+shift+m` secara manual.
- **Perkakas rilis**: `rilis.cmd` + `scripts/rilis.ps1` untuk membuat ZIP rilis
  (tanpa `data/` berisi token), `LICENSE` (MIT), `CHANGELOG.md`, `.gitignore`.
- `README.md` bagian rilis dan pemakaian pemilih aplikasi.

### Diubah

- Editor tombol: tindakan `buka` dipisah menjadi tiga sumber — aplikasi
  terpasang, tautan (URL), atau jalur manual.
- Server memotong data QR ke 180 karakter dan mengembalikan 422 (dulu berisiko
  500 untuk data panjang).
- Penentuan folder aplikasi kini mendukung `KD_ROOT` dan `__KD_BASE`, sehingga
  versi `.exe` membaca `public/` dan menyimpan `data/` di samping exe.
- Remote Android: tata letak dipadatkan untuk layar pendek (potret ≤660 px,
  lanskap ≤520 px) dan kolom 3 pada lebar ≤360 px.

### Diperbaiki

- Tombol **Pasangkan Android** dipindah ke dalam kartu Perangkat (sebelumnya di
  kepala halaman, tampak tidak sejajar dengan kartu). Sekarang selebar kartu dan
  menempel di bawah.
- Daftar perangkat tidak lagi menampilkan nama dua kali: nama tebal saja, baris
  kedua hanya waktu relatif.
- Kartu **Aktivitas** hanya menampilkan satu aktivitas terbaru (yang lama
  digantikan), dengan catatan kecil bila ada riwayat lain.
- Batas bawah kartu Aktivitas kini sejajar dengan kartu papan.
- Lencana pensil di mode sunting diperbesar (14px → 22–28px mengikuti ukuran
  tombol, ikon 12–16px) dan tetap kontras di tombol varian aksen.
- Android lanskap: ikon tombol mengecil (dari ±44px menjadi ±21–26px) karena
  ukurannya kini mengikuti sisi terkecil tombol; label dipadatkan satu baris.
- Tombol papan tidak lagi persegi salah akibat satuan `cqi` pada elemen
  container sendiri (ukuran kini mengikuti `container-type: size`).
- Jumlah kolom papan desktop menyesuaikan lebar jendela (3/4/5).

## [0.9.0] — 2026-11-12

Rilis awal.

- Papan tombol desktop + klien Android (web) lewat SSE.
- Halaman, grid 3–6 × 2–4, 73 ikon, 5 varian warna.
- Aksi: pintasan, teks, buka, HTTP, media, pindah halaman, urutan.
- Pasangkan Android dengan kode QR + kode 8 karakter.
- Penyunting di desktop, riwayat aktivitas, daftar perangkat.
- Tema terang/gelap, Kumi Design System v1.1.0.






















