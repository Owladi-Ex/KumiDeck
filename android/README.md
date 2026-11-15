# KumiDeck Remote untuk Android

APK ringan (sekitar 0,5 MB) yang membungkus UI Remote KumiDeck di dalam WebView,
dengan pemindai kode QR bawaan. Aplikasi ini **tidak berisi papan tombol**:
papan, pasangan, skrip, dan aksi tetap dijalankan KumiDeck di komputer. Karena
itu, setiap pembaruan UI di desktop langsung terpakai tanpa memasang ulang APK.

## Kenapa perlu APK, bukan sekadar PWA?

Manifest dan service worker KumiDeck sudah memenuhi syarat PWA, tetapi Chrome
Android hanya menawarkan pemasangan PWA pada *secure context*:

- `https://…` dengan sertifikat yang dipercaya perangkat, atau
- `http://localhost` / `127.0.0.1` (tidak berlaku untuk ponsel yang membuka
  alamat LAN komputer).

Alamat yang dipakai Remote sehari-hari adalah `http://192.168.x.x:4173`.
Karena itu `window.isSecureContext` bernilai `false`, tombol "Instal aplikasi"
tidak pernah muncul, dan banner di UI menampilkan "Pemasangan butuh HTTPS".

Ada dua jalan keluar:

1. **HTTPS + sertifikat** — jalankan `Jalankan KumiDeck HTTPS.cmd`, lalu pasang
   sertifikat akar KumiDeck di ponsel. PWA bisa dipasang, tetapi setiap perangkat
   perlu memasang sertifikat dan ada peringatan keamanan.
2. **APK ini** — tidak perlu sertifikat, tidak perlu HTTPS, tetap memakai seluruh
   UI `/remote` yang sama.

Jalur kedua yang dipakai di sini.

## Membangun APK

Syarat:

- JDK 17 (`javac`, `keytool`, dipakai juga oleh `d8` dan `apksigner`)
- Android SDK dengan `build-tools` (aapt2, d8, zipalign, apksigner) dan
  `platforms/android-35`
- Pustaka `android/libs/core-3.5.3.jar` (ZXing) — sudah disertakan di repositori

Tidak perlu Gradle atau Android Studio. Skrip memakai `ANDROID_HOME` dan
`JAVA_HOME` bila tersedia, atau menerima path eksplisit:

```powershell
.\android\build-apk.ps1
.\android\build-apk.ps1 -Sdk "C:\Android\Sdk" -Jdk "C:\Program Files\Java\jdk-17"
```

Alur skrip: `aapt2 compile` → `aapt2 link` → `javac` → `d8` → sisipkan
`classes.dex` → `zipalign -p 4` → `apksigner sign` → `apksigner verify`.

Hasil: `_rilis\KumiDeck-<versi>-remote.apk`, ditandatangani kunci debug
(`%USERPROFILE%\.android\debug.keystore`, dibuat otomatis bila belum ada).
Ikon peluncur dibuat dari `public/icons/icon-512.png` dan
`icon-maskable-512.png`, jadi tidak ada aset ikon terpisah yang perlu dirawat.

Gunakan `-TanpaTandaTangan` bila hanya ingin memeriksa hasil build.
`versionCode` dan `versionName` diambil dari `android/AndroidManifest.xml`;
naikkan keduanya setiap rilis agar Android mau memperbarui aplikasi yang sudah
terpasang.

## Memasang di ponsel

1. Pindahkan APK ke ponsel (kabel USB, Google Drive, atau `adb install`).
2. Buka berkasnya. Android akan meminta izin "Instal aplikasi tak dikenal"
   untuk aplikasi yang membuka berkas tersebut; izinkan sekali saja.
3. Jalankan **KumiDeck Remote**.

Lewat kabel USB dan SDK yang dipakai untuk membangun:

```powershell
& "$Sdk\platform-tools\adb.exe" install -r "_rilis\KumiDeck-2.2.0-remote.apk"
```

## Pemakaian

1. Jalankan KumiDeck di komputer, buka layar **Remote** (kode QR tampil di sana).
2. Di ponsel, layar masuk menawarkan dua cara:
   - **Pindai kode QR** — izinkan kamera sekali, arahkan ke kode QR di layar
     komputer, aplikasi langsung tersambung;
   - **Masukkan kode** — isi alamat server (mis. `192.168.1.10:4173`), tempel
     tautan `/remote?kode=…`, lalu masukkan kode pasangan 8 karakter dari layar
     komputer.
3. Bila perangkat diputus dari komputer (tombol **Putuskan** di UI Remote),
   aplikasi kembali ke layar masuk itu — bukan langsung ke kolom kode — jadi
   pemindaian QR selalu tersedia.

### Memindai kode QR

Pemindai berjalan di dalam aplikasi: `PemindaiQr` memakai Camera2
(`TextureView` + `ImageReader` YUV) dan decoder ZXing. Bingkai dibaca paling
cepat setiap 300 ms. Kode QR di layar komputer berisi
`http://<ip>:<port>/remote?kode=<token>`, jadi sekali pindai alamat dan token
langsung terpakai — kode 8 karakter tidak perlu diketik.

Aplikasi juga mendaftarkan diri sebagai pembuka tautan `http(s)://…/remote`
dan menerima **Bagikan ke KumiDeck Remote**. Ini cadangan bila pemindai kamera
tidak bisa dipakai; pada banyak ponsel Chrome sudah menjadi pembuka default
untuk tautan `http`, sehingga tautan dari aplikasi kamera tetap terbuka di
peramban — pakai tombol **Pindai kode QR** di aplikasi untuk hasil yang pasti.

Bila pratinjau kamera miring, tekan **↺ Putar kiri** di layar pemindai. Setiap
tekanan memutar 90° berlawanan arah jarum jam, dan pilihan itu diingat di
`SharedPreferences` (`putarKamera`) untuk pemindaian berikutnya. Pembacaan kode
QR tidak terpengaruh arah putar.

Pratinjau tidak memakai matriks `TextureView.setTransform`. Kotak `TextureView`
dibuat dengan aspek yang sama persis seperti buffer kamera, lalu kotak itu
diputar (`setRotation`) dan diperbesar sampai menutupi layar. Dengan begitu
gambar hanya terpotong (center-crop), tidak pernah gepeng — baik mendatar
maupun menurun.

Aplikasi hanya menyimpan alamat asal server (`http://host:port`) di
`SharedPreferences`. Token pasangan disimpan WebView di `localStorage`, sama
seperti peramban. Server mengikat token ke perangkat, jadi pasangan tidak
berpindah ke ponsel lain.

Bila alamat server berubah, buka aplikasi saat server lama tidak terjangkau —
layar "Tidak tersambung" menyediakan tombol **Ganti alamat server**; atau tekan
lama ikon aplikasi dan pilih **Ganti alamat**.

## Catatan teknis

- `minSdkVersion 24`, `targetSdkVersion 34`, `usesCleartextTraffic="true"`.
- Izin: `INTERNET`, `ACCESS_NETWORK_STATE`, `VIBRATE` (getaran tombol), dan
  `CAMERA` (diminta saat memindai; kamera bersifat opsional).
- Sebelum memuat halaman, aplikasi mencoba menyambung ke `host:port` dengan
  batas 1,5 detik. Bila tidak menjawab, muncul pesan berisi alamat itu
  (mis. "Tidak ada jawaban dari 192.168.1.10:4173") plus tombol **Coba lagi**,
  **Buka di Chrome**, dan **Ganti alamat server** — jadi tidak perlu menunggu
  layar "Menyambung…" menggantung. Bila halaman belum selesai dalam 15 detik,
  batas waktu kedua menampilkan galat yang sama.
- Pustaka pihak ketiga: `libs/core-3.5.3.jar` (ZXing core, Apache-2.0) untuk
  decoder QR. Lihat `libs/README.md`.
- Jembatan JS `KumiDeckApl.pasangan(Boolean)` hanya melaporkan status layar
  pasangan (`#lapis-pasangan`) milik UI Remote, dipakai untuk menampilkan layar
  masuk saat perangkat diputus. Tidak ada data lain yang dikirim ke aplikasi.
- Layar tetap menyala selama aplikasi terbuka (`FLAG_KEEP_SCREEN_ON`), karena
  `navigator.wakeLock` tidak tersedia pada konteks HTTP.
- Video layar penuh dari UI web didukung lewat `onShowCustomView`; tombol
  kembali menutup layar penuh lebih dulu, baru berpindah halaman web.
- Ajakan "Tambahkan ke layar utama" disembunyikan di dalam APK, karena
  aplikasinya memang sudah terpasang.
- Tidak ada data papan, aksi, atau skrip di dalam APK. Remote hanya bisa
  mengendalikan komputer di LAN yang menjalankan KumiDeck.
