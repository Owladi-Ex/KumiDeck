# KumiDeck

Papan tombol (stream deck) lokal untuk Windows: tombol-tombol di layar komputer
menjalankan aksi di komputer itu sendiri, dan ponsel/tablet bisa dipakai sebagai
papan tombol nirkabel lewat Wi-Fi.

Mulai versi 2.4.0 KumiDeck adalah **aplikasi native Windows** dengan **inti
Rust** (`wry`/`tao` + `axum`) dan antarmuka web **Rangka** yang ditanam di dalam
exe: satu berkas `KumiDeck.exe` sekitar 3 MB, tanpa .NET, tanpa Node.js, dan
tanpa konsol.

## Unduh

Rilis siap pakai tersedia di halaman **Releases**:

- **Pemasang:** `KumiDeck-<versi>-setup.exe` — pasang, lalu jalankan KumiDeck
  dari menu Mulai. Bisa juga membuat pintasan Desktop dan mulai otomatis.
  Pemasang 2.4.0 menggantikan 2.3.0 di tempat dan **tidak** menghapus data.
- **Portabel (tanpa pemasangan):** `KumiDeck-<versi>-portabel.zip` — ekstrak,
  lalu klik dua kali **`Jalankan KumiDeck.cmd`** (atau `KumiDeck.exe`).

Sidik jari berkas rilis ada di `SHA256.txt`.

Lihat rilis terbaru: https://github.com/Owladi-Ex/KumiDeck/releases/latest

## Isi repo

| Path | Isi |
|---|---|
| `native-rs/kumideck/` | **Aplikasi 2.4.0**: inti Rust — server lokal (HTTP/HTTPS, SSE, API), eksekusi aksi, pemantauan, port & proses, pemindai aplikasi, soundboard, mikrofon, ikon, mulai otomatis, QR, jendela `tao` + WebView2 |
| `prototipe/` | Prototipe UI Rangka (`kumideck-2.4.html`) dan bagian sumbernya di `parts/` |
| `public/` | Antarmuka yang ikut ke exe: `index.html`, `remote.html`, `assets/` (Rangka + CSS aplikasi + sprite), `js/`, PWA (manifest + service worker) |
| `assets/` | Ikon aplikasi & sprite ikon Kumi untuk perakitan UI |
| `native/` | Aplikasi .NET 2.3.0 — rujukan bacaan, tidak dibangun lagi |
| `server/` | Server Node.js versi lama (1.x) sebagai rujukan dan tempat empat uji otomatis |
| `scripts/` | Perkakas build rilis dan perakit UI |
| `CHANGELOG.md` | Riwayat versi |
| `LICENSE` | Lisensi MIT |
| `data/` | **tidak** ada di repo — dibuat saat pertama dijalankan (papan, token pasangan, ikon & suara unggahan, sertifikat) |

## Fitur

- Papan tombol berhalaman (kolom 1–8, baris 1–6) yang dapat diatur ukurannya
  langsung dari UI desktop, lengkap dengan ikon, warna, dan varian tombol.
  Nama papan bisa diganti dengan klik judul di kepala jendela.
- Aksi: pintasan papan ketik, mengetik teks, buka aplikasi/berkas/tautan,
  permintaan HTTP (dengan header tambahan), kontrol media, pindah halaman,
  urutan aksi, tindakan jendela, volume sistem, daya komputer, aksi bersyarat,
  serta menjalankan skrip `.bat`/`.cmd`/`.ps1`/`.exe` dengan izin sekali per tombol.
- **Syarat kontekstual**: jam, hari kerja/libur, jaringan, proses atau jendela di
  depan, keadaan mikrofon, dan halaman aktif.
- **Dua aksi per tombol**: ketuk menjalankan aksi utama, tekan lama menjalankan
  aksi kedua — di papan desktop maupun Remote.
- **Umpan balik halus**: isyarat suara untuk ketukan, tekan lama, dan ganti
  halaman (volume bisa diatur atau dimatikan per perangkat).
- **Templat papan bawaan**: Streaming, Ngoding, Media, dan Kerja.
- **Urungkan/ulangi** (`Ctrl+Z`/`Ctrl+Y`) untuk perubahan papan.
- **Soundboard**: unggah berkas atau tautan dan atur volume per suara; semua
  suara diputar lewat perangkat default Windows, tanpa mengubah endpoint sistem.
- **Mute/unmute mikrofon** dari tombol papan dan Remote.
- **Ikon asli aplikasi** diekstrak otomatis saat menambah aplikasi terpasang.
- **Widget**: jam, tanggal, lagu yang sedang diputar, serta **pemantauan CPU,
  RAM, GPU, dan jaringan** dalam bentuk grafik 60 detik.
- **Layar Port dan proses**: port yang sedang mendengar beserta proses
  pemiliknya, dan tombol hentikan proses setelah konfirmasi. Proses sistem
  (PID 0–4, tanpa nama) ditandai **Dilindungi** dan tidak bisa diakhiri.
- **Folder tombol** bertingkat, dengan tombol kembali dan jumlah isi; folder bisa
  dihapus beserta isinya dari kepala panel folder.
- **Halaman** bisa ditambah dan dihapus (tombol tempat sampah di kepala papan);
  tabstip satu baris dengan gulir mendatar dan navigasi panah, halaman kosong
  menampilkan ajakan "Tambah tombol".
- **Label bervariabel** (`%jam%`, `%volume%`, `%lagu%`, `%halaman%`, …).
- **Tambah cepat**, daftar aplikasi terpasang, perekam pintasan.
- **Seret tombol antar halaman** dan **salin/tempel tombol** lewat klik kanan
  atau `Ctrl+C`/`Ctrl+V`/`Ctrl+Shift+V`.
- **Pin "selalu di atas"**, **latar per halaman**, **pemangkas ikon** bawaan.
- **Jeda urutan sampai 30 detik** per langkah dan tombol **Hentikan urutan**.
- **Pemeriksa bentrok pintasan**: editor memperingatkan kombinasi yang dipakai
  lebih dari satu tombol.
- Kunci tata letak, impor/ekspor papan (JSON), **arsip zip** semua data.
- **Duplikat halaman dan tombol**. (Pintasan pencarian `Ctrl+K` dari 2.3.0
  belum dipindahkan ke antarmuka Rangka.)
- **Cadangan otomatis** 10 versi terakhir + pulihkan, serta unduh log.
- **Warna aksen** tema dan **skala tombol per halaman** (100–140%).
- **Pintasan global** untuk menampilkan atau menyembunyikan papan, **mulai
  otomatis**, dan **profil otomatis** (halaman mengikuti jendela depan).
- Klien Remote di ponsel/tablet (dipasangkan lewat kode QR) dengan halaman awal
  sendiri, mode kios, dan token per perangkat. Bisa dipasang sebagai **APK
  KumiDeck Remote** atau sebagai PWA bila HTTPS aktif.
- Jendela native: title bar sendiri (perkecil/perbesar/tutup), kepala aplikasi
  dipakai untuk menggeser jendela.
- Mode terang/gelap, riwayat aktivitas, daftar perangkat.

## Syarat

- Windows 10 (1809+) / Windows 11, 64-bit
- **Microsoft Edge WebView2 Runtime** — Windows 11 sudah menyertakannya; bila
  belum ada, KumiDeck menawarkan tautan unduhnya saat pertama dijalankan.

Tidak perlu memasang .NET, Node.js, maupun peramban tambahan.

## Menjalankan

Dari paket rilis: ekstrak ZIP lalu jalankan `Jalankan KumiDeck.cmd` (atau
`KumiDeck.exe`). Papan terbuka di jendela aplikasi sendiri; untuk klien Remote,
buka `http://<ip-komputer>:4173/remote` dari perangkat di Wi-Fi yang sama, lalu
pasangkan dengan kode yang tampil di layar komputer.

Untuk memasang Remote sebagai aplikasi di Android ada dua pilihan:

- **APK KumiDeck Remote** (disarankan, tanpa sertifikat): unduh
  `KumiDeck-<versi>-remote.apk` dari halaman rilis, izinkan pemasangan dari
  sumber tak dikenal, lalu isi alamat server saat aplikasi pertama dibuka.
  Sumber dan cara membangunnya ada di [`android/README.md`](android/README.md).
- **PWA lewat HTTPS**: Chrome Android hanya menawarkan "Pasang aplikasi" pada
  konteks aman. HTTPS menyala dari Setelan (bawaan 2.4.0: aktif); sertifikat
  lokal dibuat saat pertama dijalankan dan bisa diunduh dari
  `https://<ip-komputer>:4174/sertifikat.cer`. Sertifikat PFX 2.3.0 tetap
  dipakai, jadi ponsel yang sudah memercayainya tidak perlu mengulang.

## Dari kode sumber

Butuh Rust (stable) dan Visual Studio Build Tools (C++).

```powershell
cargo run --release --manifest-path native-rs\kumideck\Cargo.toml
```

Membuat `KumiDeck.exe` tunggal (UI dirakit dulu, lalu ditanam ke exe):

```powershell
pwsh -File scripts\buat-exe.ps1      # -> _exe\KumiDeck.exe
```

Mengubah antarmuka: sunting `prototipe/parts/*`, lalu rakit ulang ke `public\`.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\ui-rakit.ps1
```

Pemasang Inno Setup (butuh ISCC.exe dari Inno Setup 6 atau 7):

```powershell
pwsh -File scripts\buat-installer.ps1
```

Saat pengembangan, `cargo run` membaca `public/` langsung dari disk, jadi
suntingan UI terlihat setelah halaman dimuat ulang. Rilis memakai berkas
tertanam.

## Data & keamanan

- Data disimpan di `data/` **di samping exe** (mode portabel). Bila folder itu
  tidak bisa ditulis (mis. dipasang di `Program Files`), data dipindah otomatis
  ke `%LOCALAPPDATA%\KumiDeck\data`.
- Akses dari perangkat lain di jaringan yang sama memakai **kode pasangan**
  (token) yang dibuat otomatis saat pertama dijalankan dan disimpan di
  `data/secret.json`. Percobaan pasangan dibatasi 10 per menit per alamat IP.
- Folder `data/` **tidak** masuk repositori (`.gitignore`): berisi papan, token,
  ikon unggahan, suara, dan sertifikat TLS. Mencopot pemasangan tidak
  menghapusnya.
- Server hanya untuk jaringan lokal tepercaya; jangan diekspos langsung ke
  internet.

## Uji

Empat uji otomatis yang ada masih untuk server Node (versi 1.x):

```powershell
node server/qr.test.js
node server/apps.test.js
node server/appicons.test.js
node server/audio.test.js
```

Inti Rust 2.4.0 belum punya uji otomatis; pemeriksaannya dilakukan lewat
endpoint dan UI seperti tercatat di rencana implementasi.

## Lisensi

MIT — lihat `LICENSE`.
