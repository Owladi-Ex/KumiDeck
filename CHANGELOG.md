# Riwayat Perubahan

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/) dan
versi mengikuti [SemVer](https://semver.org/lang/id/).

## [2.4.0] - 2026-11-23

**"Inti Baru"** — KumiDeck ditulis ulang di atas inti Rust dengan antarmuka
Rangka. `KumiDeck.exe` turun dari 72,89 MB menjadi 3,45 MB, siap dalam sekitar
0,5 detik, dan .NET tidak lagi dibutuhkan. Papan, ikon, suara, token pasangan,
sertifikat, dan seluruh endpoint 2.3.0 terbaca apa adanya; pemasang 2.4.0
menggantikan 2.3.0 di tempat, tanpa menghapus `data/`. Versi APK Remote: 2.4.0
(versionCode 240).

### Ditambahkan

- **Pengaturan ukuran grid langsung di UI**: ukuran baris (1–6) dan kolom
  (1–8) papan dapat disunting langsung dari desktop lewat dialog pengatur grid
  (klik tag ukuran papan di samping judul atau tombol *Atur Ukuran Grid* di kartu
  Setelan). Tombol preset instan: 5×3, 6×4, 4×3, dan 3×2. Slot halaman dinormalkan
  secara otomatis dan tersinkronisasi ke server.
- **Tata letak papan Remote seragam dan proporsional**:
  - Tombol ubin aktif (`.kd-tile`) dan tombol kosong (`.kd-empty`) memiliki
    aspect ratio 1:1 seragam dan tersusun simetris di tengah panggung ponsel
    tanpa jeda kosong timpang.
  - Penataan mendatar (landscape) menggabungkan pemutar media dan bilah volume
    ke dalam strip horizontal bawah, mencegah overscroll vertikal pada perangkat
    layar lebar.
  - Perhitungan adaptif ubin papan (`pasPapan`) memutus siklus layout loop
    sehingga ukuran tombol langsung pas saat orientasi diputar.
  - Service worker cache diperbarui ke `kumideck-v46` agar aset CSS/JS remote
    terbaru langsung aktif di semua klien PWA / WebView.
- **Widget pemantauan**: tombol widget baru `cpu`, `ram`, `gpu`, dan `jaringan`.
  Angka besar di tengah, grafik area 60 detik (20 sampel) yang menskala sendiri,
  dan penanda `high` saat pemakaian 85% ke atas. Jaringan menampilkan kecepatan
  unduh dengan unggah di chip kecil; nilai yang tidak tersedia ditulis "tidak
  tersedia", bukan angka palsu.
- **Port dan proses**: layar baru yang mendaftar port yang sedang mendengar
  beserta proses pemiliknya, dan bisa menghentikan proses setelah konfirmasi.
  Endpoint `GET /api/ports` dan `POST /api/proc/end` bersifat tambahan.
- **Folder tombol**: satu tombol bisa berisi tombol lain, bertingkat, dengan
  tombol kembali dan jumlah isi di lencananya. Folder disunting dari panelnya
  sendiri; pensil di kepala panel menyunting tombol foldernya.
- **Label bervariabel**: `%jam%`, `%tanggal%`, `%volume%`, `%mic%`, `%lagu%`,
  `%artis%`, `%halaman%`, `%komputer%`, dan `%clipboard%` diurai saat papan
  digambar dan disegarkan tiap 30 detik.
- **Syarat kontekstual lengkap**: jam (rentang), hari (kerja/libur/pilihan),
  jaringan, proses atau jendela di depan, keadaan mikrofon, dan halaman aktif.
  Penyunting syarat menyesuaikan bentuk isian menurut jenisnya.
- **Arsip zip semua data**: ekspor `deck.json`, ikon, dan suara dalam satu
  berkas, lalu pulihkan kembali dari berkas yang sama. Impor JSON 2.3.0 tetap
  diterima; jenis berkas dikenali dari isinya, bukan dari namanya.
- **Pintasan global** untuk menampilkan atau menyembunyikan papan
  (`settings.pintasan`), dibaca ulang tiap 120 ms sehingga berlaku tanpa
  membuka ulang aplikasi.
- **Mulai otomatis dan profil otomatis** dipindahkan ke inti Rust: kunci
  `HKCU\...\CurrentVersion\Run` yang sama, dan perpindahan halaman mengikuti
  jendela depan lewat peristiwa `profil` pada SSE.
- **Hapus halaman**: tombol tempat sampah di samping tombol tambah halaman.
  Halaman aktif beserta seluruh tombolnya dihapus setelah konfirmasi; tombol
  nonaktif saat hanya tersisa satu halaman, karena papan wajib punya satu.
- **Hapus folder**: tombol tempat sampah di kepala panel folder. Folder dan
  seluruh isinya dilepas dari slot papan setelah konfirmasi.

### Diubah

- **Antarmuka Rangka**: rel ikon ringkas, kepala papan, dan panel kanan tetap
  yang selalu tampil di bagian Papan. Setelan menjadi satu daftar vertikal yang
  mengisi sampai tepi kanan, penggeser dan pemilih dibuat ulang, dan semua gerak
  memakai token Rangka (120-320 ms).
- **Papan mengisi seluruh jendela**: latar kanvas ungu dan sudut membulat dari
  prototipe dihapus, jadi tidak ada bingkai berwarna di sekeliling aplikasi.
- **HTTPS**: berkas `data/tls/kumideck.pfx` 2.3.0 tetap dipakai lewat SChannel,
  jadi ponsel yang sudah memercayai sertifikat 2.3.0 tetap bisa memasang PWA.
  Sertifikat baru dibuat ECDSA dan disajikan rustls; `/sertifikat.cer` tetap
  menyediakan berkas DER untuk Android.
- **Nama varian** `hijau` dari papan lama dinormalkan menjadi `lime` saat papan
  dibaca, tanpa mengubah arti warnanya.
- Aset antarmuka tidak lagi disimpan peramban selama sehari: HTML dan service
  worker dikirim `no-store`, berkas lain `no-cache`, jadi pembaruan aplikasi
  langsung terpakai di WebView2 maupun PWA yang sudah dipasang.
- **APK Remote 2.4.0 memakai kunci debug baru**, karena kunci 2.3.0 tidak ikut
  terbawa. Bila Android menolak memperbarui, copot pemasangan *KumiDeck Remote*
  versi lama lalu pasang 2.4.0; papan dan data tetap ada di komputer.
- Pemutar soundboard tetap memakai perangkat default Windows dan tidak pernah
  mengalihkan endpoint.

### Dihapus

- **Tombol bisukan mikrofon di kepala aplikasi**: aksinya tetap tersedia di
  papan dan di Remote.
- **Ekspor papan PNG** (tangkapan WebView2 di 2.3.0): belum dipindahkan ke inti
  Rust; `/api/papan/ekspor` menjawab 501 dengan pesan yang jelas, dan tombolnya
  tidak ditampilkan.
- **Panel templat papan** dan **pemilih aplikasi terpasang** di UI. Endpoint
  `/api/apps` tetap ada untuk klien lama, dan aksi "Buka aplikasi atau alamat"
  kini memakai kolom target seperti di editor 2.3.0.
- **Pencarian tombol Ctrl+K** dari 2.3.0: belum dipindahkan ke antarmuka Rangka,
  jadi tidak lagi disebut di README. Pencarian per halaman tetap ada di daftar
  tombol editor.
- Paket desain `public/kumi/` beserta `public/css/` dan JS 2.3.0 (`core.js`,
  `desktop.js`, `remote.js`, `bahasa.js`, `bahasa-tambahan.js`).

### Diperbaiki

- **Daftar suara Remote akhirnya bergaya**: baris soundboard di ponsel memakai
  kelas `kd-sb-item` yang tidak pernah ada di lembar gaya mana pun, sehingga
  tampil sebagai tombol bawaan peramban — teks tebal menempel ("Terimakasih
  AbangkuBerkas"), tanpa jarak, tanpa kartu. Markup kini memakai kelas desktop
  yang sama (`kd-sb-row`, `kd-play`, `kd-sb-main`) dan `remote.css` hanya
  menyesuaikan ukuran sentuh: baris 56 px, teks rata kiri, tombol putar 40 px.
- **Target sentuh Remote minimal 44 px**: tombol kepala (layar penuh, muat
  ulang), tab halaman, tombol putar di baris media, tab bawah, dan penggeser
  volume di ponsel dinaikkan dari 30-32 px ke 44-48 px. Layar mendatar pendek
  tetap memakai ukuran rapat supaya kepala tidak memakan papan. Diukur di
  aplikasi terpasang: tidak ada lagi kontrol di bawah 44 px di tab Papan,
  Suara, maupun Setelan.
- **Ubin Remote tidak lagi mengecil sampai tak terbaca**: ukuran ubin dibatasi
  64 px minimum dan 112 px maksimum. Di ponsel mendatar 844x390 ubin naik dari
  51 px (label 8 px, kata terpotong "Terimakasi|h") menjadi 64 px; di tablet
  820x1180 turun dari 150 px menjadi 112 px. Bila papan lebih tinggi dari ruang,
  papan menggulir (`justify-content: safe center`) alih-alih mengecil, dan baris
  teratas tetap terlihat.
- **Tidak ada lagi jendela terminal**: exe rilis dibangun sebagai aplikasi
  jendela, jadi hanya KumiDeck yang muncul. Log tetap ditulis ke
  `data/kumideck.log`, dan perintah latar (curl, netsh, PowerShell, shutdown)
  dijalankan tanpa jendela konsol sekilas.
- **Ikon baki sistem kembali ada** (baki Windows): menu Buka KumiDeck, Buka di
  peramban, Salin tautan Remote, dan Keluar. Ikonnya memakai bahan yang sama
  dengan ikon aplikasi.
- **Ikon aplikasi mengikuti tema terang**: kotak putih membulat dengan empat
  kotak indigo, tanpa latar hitam dan tanpa kuning, dipakai untuk `.exe`,
  pemasang, baki, favicon, PWA, dan launcher Android. Berkas `.ico` kini memakai
  bingkai DIB yang sah (bukan PNG di dalam ICO), dan ikon baki dibaca ulang
  setiap build.
- **Umpan balik suara benar-benar berbunyi**: klik tombol papan dan nada galat
  pendek diputar lewat WebAudio di sisi klien dan mengikuti sakelar "Umpan
  balik suara".
- **Selalu di atas**: tombol pin di kepala kini mengirim perintah native ke
  jendela, jadi pin bekerja seketika dan tetap sama dengan sakelar di Setelan.
- **Periksa pembaruan**: sakelar dan tombol "Periksa" membandingkan versi
  aplikasi dengan rilis terbaru `Owladi-Ex/KumiDeck`; pemeriksaan otomatis saat
  aplikasi dibuka berjalan diam, pemeriksaan manual memberi kabar.
- **Remote mendatar**: ponsel dalam posisi mendatar tidak lagi memaksa papan
  tergulung; kepala, tab, dan kaki dirapatkan, papan menyesuaikan lebar dengan
  ruang tegak yang ada, dan bingkai ponsel desktop tidak muncul di ponsel.
- **Pindai QR langsung memasangkan**: QR membawa kode pasangan di tautannya,
  Remote memasangkan perangkat sendiri lalu membuang kode dari URL, dan QR
  memakai alamat HTTP agar tidak berhenti di peringatan sertifikat.
- **Warna ungu dihapus dari seluruh permukaan**: token permukaan diganti netral
  terang (`#F5F5F6`/`#F7F7F8`) dan netral gelap, termasuk kanvas papan.
- **Jendela mengikuti isi papan**: tinggi awal dihitung dari baris dan kolom
  profil, jadi tidak ada ruang kosong besar di bawah tombol. Saat jendela diubah
  ukurannya, lebar dan tinggi dipasang ke kotak tombol, jadi papan selalu
  menempel rapat di tengah jendela.
- **Setelan berbahasa Indonesia**: baris "Bahasa antarmuka" dan "Tombol jendela"
  dihapus, sehingga tidak ada lagi teks English atau versi 2.3.0 di Setelan.
- **Widget jam dan media dipoles**: jam memakai pemisah titik dua dan angka
  tabular yang lebih besar, tanggal rata tengah, judul media dua baris dengan
  ikon putar/jeda sesuai status.
- **Layar penuh Remote benar-benar penuh**: tombol layar penuh di ponsel kini
  menyembunyikan kepala, tab halaman, kartu media, volume, dan kaki tab; yang
  tersisa hanya papan dan satu tombol bulat kecil untuk keluar. Keluar lewat
  gestur sistem juga mengembalikan tampilan.
- **Kapsul tab Remote meluncur**: kapsul tab halaman tidak lagi digambar ulang
  di tempat baru, jadi ia benar-benar bergeser dari tab lama ke tab baru; bentuk
  kapsulnya kini bulat penuh.
- **Slider volume Remote mengikuti jari**: isi lintasan ikut bergerak bersama
  bulatan dan angka persen, bukan hanya labelnya.
- **Layar pindai QR memakai tema terang**: halaman masuk, formulir alamat,
  layar galat, dan bingkai pemindai QR di APK memakai permukaan putih, abu muda,
  dan aksen indigo yang sama dengan Rangka, bukan latar hitam dan aksen limau.
- **Ikon Android tidak terpotong**: lapisan depan ikon adaptif diperkecil ke
  zona aman 66 dp, jadi keempat sudutnya utuh di bawah topeng bulat peluncur;
  ikon lama juga memakai sudut putih, bukan gelap.
- **Panel Ringkasan selalu tampil**: tombol buka dan tutup di panel dihapus, dan
  kolomnya kini selebar tetap 296 px di bagian Papan pada semua ukuran jendela.
  Karena panel tidak pernah dibuka atau ditutup, tidak ada lebar yang harus
  digerakkan: papan tidak bergeser, tidak berubah ukuran, dan tidak bergetar saat
  masuk atau keluar dari Papan. Tinggi minimum jendela diturunkan ke 300 px
  supaya papan tetap menempel rapat sampai ukuran terkecil.
- **Tanpa list biru dan tanpa shadow cangkang**: bayangan dan batas aksen
  cangkang Windows pada jendela tanpa dekorasi dinonaktifkan bersih lewat
  `with_undecorated_shadow(false)` bawaan runtime jendela. Jendela menempel
  rata ke layar tanpa lis biru muda di tepi.
- **Resize halus, tanpa jendela yang melompat balik**: dua penyebab patahan
  ditemukan lewat pengukuran di aplikasi terpasang dan keduanya dihapus.
  Pertama, `app-region: drag` pada kepala jendela (jalur non-client WebView2)
  membuat seretan tepi hanya menghasilkan 1-3 perubahan lebar dari 23 langkah
  kursor; tanpa properti itu 23 dari 23 langkah mulus. Kepala kini kembali
  memakai `mousedown` -> IPC `geser` -> `drag_window()` native. Kedua, `pasIsi`
  dipanggil setiap tepi jendela dilepas sehingga jendela yang baru saja
  dilebarkan langsung menyusut balik ke lebar papan (terukur 1434 -> 873 px);
  panggilan itu dihapus dari jalur seret dan dari pembukaan aplikasi. `pasIsi`
  sekarang hanya berjalan saat ukuran papan diubah dari dialog Papan.
  `WM_EXITSIZEMOVE` tetap dipakai, tetapi hanya untuk membulatkan ukuran ubin.
- **Ukuran jendela pilihan pengguna dihormati**: aplikasi tidak lagi memasang
  ulang jendela ke ukuran papan saat dibuka atau saat masuk ke Papan, jadi
  lebar yang sudah diatur tidak berubah sendiri. Papan tetap dirapikan ke dalam
  jendela oleh `fitBoard`.
- **Seret tepi jendela tanpa patahan**: ukuran ubin mengikuti lebar isi secara
  pecahan selama jendela diseret, lalu dibulatkan setelah seretan berhenti.
- **Seret tepi jendela tanpa patahan**: ukuran ubin mengikuti lebar isi secara
  pecahan selama jendela diseret, lalu dibulatkan setelah seretan berhenti dan
  jendela dipasang ke papan.
- **Pindah halaman papan lebih ringan**: papan masuk sebagai satu lapisan;
  animasi lama yang menjalankan belasan tombol sekaligus dengan jeda 16 ms per
  tombol dihapus. Garis bawah tab baru bergerak setelah papan selesai ditata.
- **Tanpa batang gulir**: batang gulir disembunyikan di semua bagian dan di tab
  halaman, sehingga lebar isi tidak berubah 15–18 px saat guliran muncul atau
  hilang.
- **Soundboard bisa disunting**: tombol pensil di tiap suara kini membuka dialog
  ubah nama dan volume; sebelumnya tombolnya ada tetapi tidak melakukan apa pun.
  Perubahan langsung tersimpan ke papan dan berlaku saat suara diputar.
- **Riwayat aktivitas langsung terisi**: peristiwa `press` dari server dipakai
  apa adanya oleh desktop, jadi entri baru muncul seketika di panel Ringkasan
  dan di layar Riwayat tanpa menunggu sinkronisasi papan berikutnya. Sebelumnya
  peristiwa itu diabaikan dan riwayat hanya terisi setelah halaman dimuat ulang.
- **Service worker tidak lagi mengunci desktop pada versi lama**: cache Remote
  hanya melayani halaman `/remote`, dan desktop melepas registrasi yang
  terlanjur ada. Inilah sebab fitur baru (ukuran grid, sunting soundboard)
  tampak "tidak ada" di aplikasi terpasang meski sudah ikut ke dalam exe:
  `app.js` lama tersaji dari cache dengan stale-while-revalidate. Versi cache
  naik ke `kumideck-v47`.
- **Slider volume Soundboard akhirnya berpengaruh**: sebelumnya nilai slider
  dikirim tetapi diabaikan server, karena volume suara per item selalu menang.
  Kini slider menjadi pengali master untuk pemutaran dari halaman Soundboard
  (`volume suara × slider / 100`), sedangkan pemutaran dari papan dan Remote
  tetap memakai volume suara itu saja. Label kedua kolom diperjelas: "Volume
  pemutaran" di kepala halaman dan "Volume suara (%)" di dialog ubah.
- **Hover tab halaman tidak lagi berupa blok**: hanya teks tab yang menyala,
  latar tetap bening, jadi garis bawah tab aktif tetap jadi satu-satunya
  penanda.
- **Tab halaman tidak lagi hilang di baris kedua**: tabstip dipaksa satu baris
  dan digeser mendatar, tab aktif otomatis dibawa ke pandangan. Sebelumnya tab
  keempat dan seterusnya terpotong di luar kepala jendela sehingga halamannya
  tidak bisa dibuka. Panah kiri/kanan kini berpindah tab seperti tablist.
- **Judul papan tidak terpotong**: wadah judul tidak lagi menyusut karena tab,
  jadi "Meja Kerja" tetap utuh sampai lebar 640 px.
- **Hapus tombol minta konfirmasi**: sama seperti hapus halaman dan folder;
  satu klik tidak lagi langsung melenyapkan tombol.
- **Tombol dengan suara terhapus ditandai**: ubin bergaris putus-putus dengan
  ikon peringatan, dan pilihan suara di editor menampilkan "Suara tidak
  ditemukan — pilih ulang" alih-alih diam-diam memasang suara lain.
- **Proses sistem tidak bisa diakhiri**: PID 0–4 dan proses tanpa nama kini
  dilindungi di inti Rust, bukan hanya lewat daftar nama proses. "Akhiri" tampil
  nonaktif sebagai "Dilindungi".
- **Alamat Remote tidak lagi bertentangan dengan QR**: QR memakai HTTP dan
  alamat di bawahnya ditulis persis seperti isi QR; tautan HTTPS ditampilkan
  terpisah bila menyala.
- **Halaman dan folder kosong punya keterangan**: halaman tanpa tombol
  menampilkan ajakan "Tambah tombol" (bukan dua puluh slot "+"), folder kosong
  menjelaskan cara mengisinya.
- **Toast "Akhiri proses" tidak lagi tertimpa**: penyegaran daftar port
  berjalan diam-diam, jadi pesan sukses tetap terbaca.
- **Keterangan ukuran halaman mengikuti grid aktif**: dialog halaman baru
  menulis "5 × 4 slot" sesuai ukuran sebenarnya, bukan 5 × 3 yang tetap; preset
  cepat mendapat pilihan 5 × 4.
- **Target sentuh diperbesar ke 32 px**: tombol tambah/hapus halaman, tombol
  jendela, salin alamat, sunting/hapus suara, chip saringan, swatch aksen,
  preset grid, dan tombol Akhiri proses.
- **Sakelar mati terbaca di tema gelap**: jalur sakelar diberi kontras terhadap
  kartu, tidak lagi nyaris menyatu.
- **Dialog besar lebih lega**: isi dialog dapat memakai tinggi layar sampai
  sisa 190 px, jadi kolom Ukuran/Widget/Aksi tidak lagi terkunci di 250 px.
- **Panel Ringkasan tidak lagi menghimpit di layar sempit**: panel kanan
  disembunyikan di bawah 900 px sehingga papan memakai seluruh lebar. Di layar
  lebar Soundboard tampil dua kolom mulai 1200 px.
- **Panel folder benar-benar modal**: Tab berputar di dalam panel, tidak lagi
  lolos ke tombol di belakangnya.
- **Nama papan bisa diganti**: klik judul di kepala jendela (atau tag ukuran /
  tombol *Ubah* di Setelan) untuk membuka dialog Papan. Isinya nama papan
  (sampai 48 karakter) plus kolom × baris. Sebelumnya "Meja Kerja" terkunci di
  kode.
- **Konfirmasi hapus memakai dialog aplikasi**: hapus halaman, folder, tombol,
  pulihkan arsip, dan izin menjalankan skrip tidak lagi memunculkan kotak
  bawaan WebView2 ("127.0.0.1:4173 says", tombol OK/Cancel berbahasa Inggris),
  melainkan dialog gelap-terang yang mengikuti tema, dengan tombol
  "Hapus/Batal" berbahasa Indonesia dan fokus awal di Batal.
- **Widget GPU dan RAM tidak lagi menulis "tidak tersedia" di kepala**: angka
  pemakaian tetap tampil; label suhu/total RAM hanya muncul bila nilainya
  memang terbaca. Suhu GPU tidak tersedia karena Windows tidak menyediakan
  penghitung PDH untuknya — kini ditulis sebagai ketiadaan, bukan seolah
  seluruh widget gagal.
- **Alamat di bawah QR tidak lagi melimpah keluar kotak**: kotak QR memakai
  tinggi minimum 188 px (bukan tinggi tetap), jadi gambar QR, keterangan, dan
  alamat Remote tetap di dalam bingkai putus-putus.
- **Judul papan benar-benar bisa diklik**: penanganan geser jendela di bilah
  atas menelan klik (`mousedown` menangkap judul lalu memulai geser), sehingga
  hanya tag ukuran yang berfungsi. Elemen `role="button"` kini dikecualikan,
  jadi klik judul membuka dialog Papan seperti yang dijanjikan.
- **Kepala jendela memakai area geser asli Windows**: geser jendela tidak lagi
  dijalankan lewat perintah IPC dari `mousedown`, melainkan lewat `app-region:
  drag` milik WebView2 (dukungan non-client region dinyalakan wry). Judul, tab,
  dan tombol ditandai `no-drag` sehingga tetap bisa diklik. Ini menghapus
  sumber bug klik-tertelan, bukan menambalnya.
- **Panik Rust dan galat JS tidak lagi senyap**: exe rilis tanpa konsol kini
  mencatat panik ke `data/kumideck.log` (`[panik] pesan (berkas:baris)`), dan
  halaman menampilkan toast untuk galat JS maupun janji yang ditolak. Sebelumnya
  keduanya berakhir sebagai UI yang diam tanpa jejak.
- **UI bisa diuji tanpa membangun ulang**: variabel lingkungan
  `KUMIDECK_PUBLIK=<folder>` membuat exe rilis menyajikan `index.html`, CSS, dan
  JS langsung dari folder itu, jadi suntingan tampil setelah muat ulang. Build
  debug sudah melakukan ini sejak awal.

## [2.3.0] - 2026-11-16

**"Geser & Atur"** — papan lebih luwes disusun, dan Remote ikut mendapat
kontrolnya. Versi APK Remote: 2.3.0 (versionCode 230).

### Ditambahkan

- **Seret tombol antar halaman**: lepas ke slot kosong, tukar dengan tombol
  lain, atau lepas langsung di tab halaman. Berhenti ±600 ms di atas tab membuka
  halaman itu. Satu langkah simpan = satu titik urungkan, jadi `Ctrl+Z`
  mengembalikan susunan semula.
- **Salin/tempel tombol**: klik kanan tombol saat mode sunting untuk *Salin*,
  *Tempel*, atau *Tempel gaya*; pintasan `Ctrl+C`, `Ctrl+V`, dan `Ctrl+Shift+V`.
  Tempel mengisi slot kosong; tempel gaya hanya menyalin ikon, varian, dan warna.
- **Pin "selalu di atas"**: tombol pin di kepala papan dan sakelar di Setelan.
  Pilihan tersimpan di papan dan berlaku lagi setelah aplikasi dibuka ulang.
- **Latar per halaman**: pilih warna latar di Kelola halaman; tampil di desktop
  dan Remote. Tombol *Hapus warna* mengembalikan latar bawaan.
- **Pemangkas ikon**: unggah gambar (maks 10 MB), geser dan perbesar di kotak
  pratinjau 360 px, lalu simpan sebagai PNG 256×256 di bawah 512 KB.
- **Jeda urutan sampai 60 detik** per langkah, plus jenis langkah **Tunggu**.
  Selama urutan berjalan, tombol **Hentikan urutan** tampil di desktop dan
  Remote; menekannya membatalkan jeda yang sedang berlangsung tanpa menunggu.
- **Pemeriksa bentrok pintasan**: saat menyunting pintasan, editor memperingatkan
  bila kombinasi sudah dipakai tombol lain — termasuk di halaman lain, aksi
  kedua, aksi kondisional, atau langkah urutan. Tombol yang bentrok ditandai
  garis putus-putus. Penyimpanan tetap boleh dilakukan.
- **Ukuran tombol**: lebar 1–6 dan tinggi 1–4 dipilih terpisah di editor
  tombol, jadi widget bisa memakai hingga 6×4 slot. Tombol besar memakai
  beberapa slot sekaligus — cocok untuk widget jam, judul lagu, dan label
  panjang. Berlaku sama di desktop dan Remote. Bila slot di bawahnya terisi,
  tombol itu **dipindahkan** ke slot kosong lain (bukan dihapus); kalau ruang
  tidak cukup, perubahan ditolak dengan pesan. Seret, tempel, dan duplikat
  mengembalikan ukuran ke 1×1 agar tidak menabrak slot tetangga.

### Diperbaiki

- **Soundboard tidak lagi mengganti perangkat default Windows.** Dulu, bila
  sebuah suara disetel ke perangkat lain, KumiDeck mengalihkan endpoint default
  sistem selama pemutaran lalu mengembalikannya. Banyak aplikasi (termasuk
  game) membangun ulang mesin audionya setiap kali endpoint berubah, sehingga
  terasa berhenti sesaat. Sekarang semua suara diputar lewat perangkat default:
  tanpa pengalihan, tanpa jeda 200 ms, dan audio aplikasi lain tidak terganggu.
  Pilihan perangkat per suara dihapus dari panel Soundboard; pemisahan channel
  dikerjakan aplikasi mixer (mis. Elgato Wave Link) dengan mengarahkan
  `KumiDeck.exe` ke channel yang diinginkan.
- **Tautan soundboard tidak lagi membuat ping game melonjak.** Tautan `http`/
  `https` kini mulai diunduh begitu item disimpan (bukan saat tombol ditekan),
  di thread berprioritas rendah dengan laju dibatasi sekitar 2 MB/s, lalu
  diputar dari berkas lokal. Pemutar juga dipanaskan saat aplikasi mulai dan
  permintaan putar dibalas cepat (≤120 ms), jadi menekan tombol tidak lagi
  menyedot bandwidth atau menahan UI. Status tiap tautan tampil di kartu
  soundboard: *Siap diputar*, *Mengunduh n%*, *Unduhan gagal*, atau *Belum
  diunduh*; menghapus item ikut membersihkan cache tautannya.

### Dipoles

- **Suara interaksi**: ketukan tombol, tekan lama, dan ganti halaman kini punya
  isyarat berbeda. Suara bisa dimatikan, volumenya diatur lewat slider, dan
  tersimpan per perangkat.
- **Setelan lebih rapi**: panel Setelan kini dua kolom — daftar tab di kiri
  (Umum, Perilaku, Suara, Tampilan, Data) dan isi tab di kanan. Tab bisa
  dipindah dengan panah, `Home`, dan `End`. Remote mendapat bagian Umpan balik
  (suara + volume + tombol Uji) dan Getaran.
- **Animasi halus**: papan muncul bertahap saat pertama tampil dan saat pindah
  halaman, tab aktif menandai dirinya, dan tombol menampilkan bilah tipis
  selama ditahan. Semua animasi berhenti bila pengguna memilih gerak minimal.
- **Navigasi papan dengan panah**: tombol papan bisa dipindah dengan panah,
  `Home`, dan `End`, baik di desktop maupun Remote.
- **Petunjuk sekali pakai**: Remote memberi tahu sekali bahwa tombol beraksi
  ganda dijalankan dengan tekan lama.
- **Tambah tombol lebih mudah**: modal *Tambah cepat* kini punya kotak cari di
  atas (satu kolom untuk semua jenis), kepala dan kakinya menetap sehingga
  tombol *Tutup* selalu terjangkau, dan posisi gulir dipertahankan saat
  menambah beberapa tombol berturut-turut.
- **Editor tombol lebih ringkas**: di layar lebar bidangnya disusun dua kolom
  dengan pemilih ikon lebih pendek, jadi tombol *Simpan* terlihat tanpa
  menggulir jauh.
- **Tanpa scrollbar**: batang gulir disembunyikan di seluruh antarmuka — gulir
  tetap bekerja lewat roda tetikus dan gestur sentuh.
- **Kepala lebih bersih**: urutan ikon kini Soundboard, Templat, Cari, suara,
  baki sistem, pin, kunci, Setelan, lalu tema. Sakelar yang aktif ditandai
  warna ikon dan latar netral, bukan biru aksen. Sakelar tema ikut punya
  sorotan hover seperti tombol lain.
- **Kaki halaman dihapus**: alamat papan di kiri bawah dan keterangan "aksi
  dijalankan…" di kanan bawah (serta penghitung halaman Remote) dibuang agar
  tampilan lebih bersih.
- **Tambah cepat & Soundboard lebih ringkas**: Tambah cepat memakai satu kotak
  cari; form tambah suara dilipat di balik tombol *Tambah suara* sehingga
  daftar tidak terdorong ke bawah.
- **Slider berprogress**: semua penggeser (volume antarmuka dan volume suara)
  kini menunjukkan bagian yang terisi, bukan hanya bulatan di track kosong.
- **Warna aksen kedua**: tab Tampilan punya dua warna berbentuk bulatan —
  aksen utama untuk tombol aksi dan aksen kedua untuk blob latar. Keduanya bisa
  dikembalikan ke bawaan lewat tombol ikon di sebelahnya.
- **Setelan tinggi stabil**: modal Setelan dikunci setingginya, jadi berpindah
  tab tidak lagi membuat jendela membesar-mengecil; hanya isi tab yang bergulir.
- **Tab Data dipadatkan**: keterangan panjang dihapus, tombol utilitas (Cek
  pembaruan, Unduh log, Ekspor PNG, Muat contoh) dikumpulkan dalam satu baris,
  dan tombol muat ulang menjadi ikon saja.
- **Remote layar penuh**: tombol layar penuh di kepala menyembunyikan kepala,
  banner, dan kaki sehingga kisi tombol memenuhi layar; tombol keluar melayang
  tetap tersedia. Cincin fokus tidak lagi tertinggal di tombol setelah diketuk.

### Catatan teknis

- Model papan bertambah: `Setelan.teratas`, `Setelan.aksen2`, `Halaman.warna`,
  dan jenis aksi `tunggu`; semuanya dinormalkan di `DeckNormalizer` (jeda
  langkah dibatasi 0–60.000 ms). `Halaman.warna` dan kedua aksen memakai format
  `#rrggbb`.
- `Tombol.span` (`{c, r}`) menyimpan ukuran tombol; `DeckNormalizer` membatasi
  rentang agar tetap di dalam kisi dan mengosongkan sel yang tertutup. Render
  desktop dan Remote memakai `KD.susunKisi()` + `KD.pasangRentang()` dengan
  penempatan `grid-column`/`grid-row` eksplisit. Saat tombol diperbesar,
  `terapkanUkuranTombol()` memindahkan tombol yang tertimpa ke slot kosong;
  bila tidak ada ruang, perubahan ditolak.
- Endpoint baru `POST /api/aksi/hentikan`; event SSE `urutan` memberi tahu
  desktop dan Remote saat ada urutan berjalan. Pembatalan memakai satu
  `CancellationTokenSource` bersama di `ActionRunner`, dan urutan berikutnya
  selalu mendapat token baru.

## [2.2.0] - 2026-11-15

**"Lebih Cepat"** - templat siap pakai, aksi ganda, dan kendali Remote yang
lebih lengkap.

### Ditambahkan

- **Templat papan bawaan**: Streaming, Ngoding, Media, dan Kerja. Satu klik
  mengisi papan dengan halaman serta tombol siap pakai; papan lama tetap bisa
  dipulihkan dari cadangan otomatis.
- **Aksi tekan lama (aksi kedua)**: setiap tombol boleh punya dua aksi. Ketuk
  menjalankan aksi utama, tekan lama (±550 ms) menjalankan aksi kedua. Berlaku
  di papan desktop dan UI Remote; editor memakai pilihan "Ketuk / Tekan lama".
- **Urungkan & ulangi** untuk papan: `Ctrl+Z` dan `Ctrl+Y` (juga
  `Ctrl+Shift+Z`) dengan riwayat 30 langkah, plus tombol panah di kepala papan.
- **Aksi skrip**: jalankan `.bat`, `.cmd`, `.ps1`, atau `.exe` di komputer host
  tanpa jendela konsol. Saat pertama ditekan, KumiDeck meminta izin; setelah
  disetujui, izin tersimpan untuk tombol itu saja.
- **Header HTTP tambahan**: editor permintaan HTTP kini punya baris nama/nilai
  header (mis. `Authorization: Bearer …`) di samping metode, URL, dan isi JSON.
- **Skala tombol per halaman** (100–140%): ikon dan label menyesuaikan ukuran
  tombol, berguna untuk tablet atau layar sentuh besar.
- **Mode kios tablet & layar tetap menyala** di Remote: layar penuh tanpa bilah
  peramban dan Wake Lock (bila peramban mendukung).
- **Halaman awal per perangkat**: bintang di setelan Remote menjadikan halaman
  yang sedang dibuka sebagai halaman pembuka khusus perangkat itu.
- **Lupakan perangkat**: setiap perangkat Remote mendapat token sendiri, jadi
  mencabut satu ponsel tidak mengganggu perangkat lain. Perangkat yang
  dilupakan harus memasukkan kode pasangan baru.
- **Cek pembaruan** dari setelan desktop: membandingkan versi terpasang dengan
  rilis terbaru di GitHub (tanpa token).
- **Aplikasi Android (APK)**: Remote bisa dipasang di ponsel tanpa sertifikat
  HTTPS. APK hanya membungkus UI `/remote` di WebView, jadi papan dan aksi tetap
  di komputer; sumber dan cara build ada di `android/README.md`.

### Diperbaiki

- **Izin skrip tidak lagi dipercaya dari berkas**: deck impor atau JSON kiriman
  klien yang mencantumkan `"izin": true` tetap meminta persetujuan. Izin hanya
  diwarisi dari papan tersimpan bila tombol dan target skripnya sama persis.
- **Daftar aktivitas aman dari perubahan bersamaan**: salinan diambil di dalam
  lock sebelum disiarkan ke klien SSE.
- **Pengalih HTTPS tidak bisa dipakai open redirect**: alamat tujuan selalu
  menunjuk ke alamat LAN mesin ini dan hanya menerima jalur lokal (`/…`).
- **Tukar posisi tombol** (`/api/deck/pindah`) memvalidasi dan menukar di dalam
  satu lock, jadi tidak bisa balapan dengan permintaan lain.
- **Detak 500 ms tidak lagi menumpuk** saat pemanggilan media/volume lambat;
  kontrol volume juga berhenti ditanyakan selama 60 detik bila endpoint audio
  tidak tersedia.
- **Pencarian aplikasi di editor** disaring 120 ms sehingga mengetik tidak
  membangun ulang ratusan tombol pada setiap huruf.
- **Pengamat bahasa hanya aktif saat antarmuka berbahasa Inggris**, dan interval
  jam hanya berjalan bila papan benar-benar memuat widget waktu.
- **Slider volume soundboard**: kini selebar kolomnya dan memakai track sendiri,
  tidak lagi terpotong padding kolom isian biasa.
- **Teks status saat terputus** ikut diterjemahkan ("Disconnected — reconnecting")
  ketika antarmuka memakai bahasa Inggris.
- **Nama aplikasi pada notifikasi Windows** kini "KumiDeck", bukan
  `NotifyIconGeneratedAumid_…` buatan Windows.

### Catatan teknis

- Model papan bertambah: `Halaman.skala`, `Tombol.actionKedua`,
  `Aksi.args`, dan `Aksi.izin`; semuanya dinormalkan di `DeckNormalizer`.
- Endpoint: `POST /api/press` menerima `kedua`, `POST /api/press/izinkan`,
  `POST /api/devices/revoke`; `/api/pair` mengeluarkan token per perangkat bila
  `deviceId` dikirim.
- Token perangkat disimpan di `data/perangkat.json`; token yang dicabut langsung
  ditolak, termasuk setelah aplikasi dijalankan ulang.

## [2.1.0] - 2026-11-14

**"Rapi & Aman"** - paket perapian kecil tanpa perubahan arsitektur.

### Ditambahkan

- **Pencarian tombol Ctrl+K**: modal pencarian dari mana saja. Cocokkan nama
  tombol, jenis aksi, atau nama halaman; hasil di halaman aktif didahulukan.
  Enter membuka hasil pertama; memilih hasil berpindah halaman, menyorot
  tombol, dan membuka editor bila mode sunting aktif.
- **Duplikat halaman & tombol**: halaman disalin lengkap dengan semua tombolnya
  (ID baru, bukan halaman awal); tombol disalin ke slot kosong berikutnya pada
  halaman yang sama.
- **Cadangan otomatis + pulihkan**: setiap perubahan papan menyimpan versi
  sebelumnya di `data/cadangan` (maksimal 10). Setelan menampilkan daftar
  cadangan dengan waktu dan ukuran; pemulihan memakai dua klik untuk mencegah
  kecelakaan. Pemulihan ikut mencadangkan papan yang sedang aktif.
- **Unduh log dari setelan**: berkas `kumideck.log` diunduh lewat UI desktop
  (endpoint dibatasi untuk komputer host).
- **Warna aksen tema**: pilih warna aksen di setelan; berlaku di UI desktop
  dan perangkat Remote. Nilai dibatasi ke `#rrggbb`.
- **Ekspor papan PNG**: tangkap papan dari WebView2, potong ke area papan, lalu
  unduh sebagai `kumideck-papan.png`. Hanya tersedia di aplikasi desktop;
  peramban biasa mendapat pesan yang jelas.

### Catatan teknis

- `DeckNormalizer` menormalkan `settings.aksen` (kosong bila tidak sah).
- Endpoint baru: `GET /api/cadangan`, `POST /api/cadangan/pulihkan`,
  `GET /api/log/unduh`, `POST /api/papan/ekspor`.
- Folder `data/cadangan` dibuat otomatis; berkas cadangan bernama
  `deck-yyyyMMdd-HHmmss-fff.json` dan dipangkas ke 10 versi terbaru.

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






















