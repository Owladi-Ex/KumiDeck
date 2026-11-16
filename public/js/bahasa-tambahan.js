/* Bagian kedua kamus: label dinamis, istilah aksi, dan pola tambahan.
   Dipisah agar mudah ditambah tanpa menyunting blok pertama. */
(function () {
  if (!window.KD_EN) return;

  Object.assign(window.KD_EN, {
    "KumiDeck · papan tombol": "KumiDeck · button pad",
    "KumiDeck — papan tombol": "KumiDeck — button pad",
    "Di baki sistem": "In the system tray",
    "Tata letak terkunci": "Layout locked",
    "Tersambung": "Connected",
    "Terputus": "Disconnected",
    "Terputus — mencoba menyambung": "Disconnected — reconnecting",
    "Belum ada perangkat Remote terpasang": "No Remote device connected yet",
    "Desktop": "Desktop",
    "Remote terhubung": "Remote connected",
    "desktop aktif": "desktop active",
    "Menunggu": "Waiting",
    "Menunggu perangkat": "Waiting for a device",
    "Alamat papan": "Board address",
    "Mis. Putar / Jeda": "e.g. Play / Pause",
    "Selesai menyunting": "Done editing",
    "Mode sunting aktif. Klik tombol untuk mengubah isinya, atau seret untuk menukar posisi.": "Edit mode is on. Click a button to change it, or drag to swap positions.",
    "Halaman papan": "Board pages",
    "Membuka aplikasi atau tautan": "Opens an app or link",
    "Membuka halaman": "Opens a page",
    "balik senyap/nyala": "toggle mute/live",
    "senyapkan": "mute",
    "nyalakan": "unmute",
    "belum diatur": "not set yet",
    "kosong": "empty",
    "jendela": "window",
    "bila": "when",
    "selain itu": "otherwise",
    "langkah": "steps",
    "sembunyikan": "minimise",
    "maksimalkan": "maximise",
    "kembalikan ukuran": "restore size",
    "snap kiri": "snap left",
    "snap kanan": "snap right",
    "pindah monitor": "move to next monitor",
    "tampilkan desktop": "show desktop",
    "tidurkan komputer": "sleep the computer",
    "kunci layar": "lock the screen",
    "mulai ulang": "restart",
    "matikan": "shut down",
    "batalkan timer": "cancel the timer",
    "naik": "up",
    "turun": "down",
    "mute": "mute",
    "baca": "read",
    "Volume naik": "Volume up",
    "Volume turun": "Volume down",
    "Senyap / bersuara": "Mute / unmute",
    "Atur ke nilai": "Set to a value",
    "Hanya membaca nilai": "Read the value",
    "terpasang": "paired",
    "belum terpasang": "not paired yet",
    "Peramban": "Browser",
    "Jam": "Clock",
    "Tanggal": "Date",
    "tanggal lengkap": "full date",
    "Bahasa antarmuka": "Interface language",
    "Berlaku untuk layar ini dan perangkat Remote yang memakai bahasa yang sama.": "Applies to this screen and to Remote devices using the same language.",
    "Bahasa": "Language",
    "Kontrol media": "Media control",
    "Pintasan papan ketik": "Keyboard shortcut",
    "Mengetik teks": "Typing text",
    "Urutan aksi": "Action sequence",
    "Tindakan jendela": "Window action",
    "Volume sistem": "System volume",
    "Daya komputer": "Computer power",
    "Permintaan HTTP": "HTTP request",
    "Pindah halaman": "Switch page",
    "Bersyarat (jika aplikasi aktif)": "Conditional (if an app is active)",
    "Mikrofon (senyap / nyala)": "Microphone (mute / live)",
    "Putar suara soundboard": "Play a soundboard sound",
    "Widget (jam, tanggal, media)": "Widget (clock, date, media)",
    "Balik keadaan (senyap ↔ nyala)": "Toggle (mute ↔ live)",
    "Senyapkan mikrofon": "Mute the microphone",
    "Nyalakan mikrofon": "Unmute the microphone",
    "jam dan tanggal (hanya tampilan)": "clock and date (display only)",
    "media yang diputar (hanya tampilan)": "now playing (display only)"
  });

  /* Nama perintah media: "Media control volup" → "Volume up". */
  var PERINTAH_MEDIA = {
    playpause: "Play / Pause",
    play: "Play",
    pause: "Pause",
    next: "Next track",
    prev: "Previous track",
    stop: "Stop",
    volup: "Volume up",
    voldown: "Volume down",
    mute: "Mute"
  };

  window.KD_EN_POLA = window.KD_EN_POLA || [];
  window.KD_EN_POLA.push(
    [/^Ikon unggahan (.+)$/i, "Uploaded icon $1"],
    [/^Ikon (.+)$/i, "Icon $1"],
    [/^(.+) \(klik untuk menyunting\)$/i, "$1 (click to edit)"],
    [/^Alamat papan: (.+)$/i, "Board address: $1"],
    [/^Halaman awal: (.+)$/i, "Start page: $1"],
    [/^Halaman (.+) jadi halaman awal perangkat ini\.$/i, "Page $1 is now this device's start page."],
    [/^Nama halaman (.+)$/i, "Page name $1"],
    [/^Skala tombol halaman (.+)$/i, "Key scale for page $1"],
    [/^Jalankan skrip (.+)\? Komputer akan menjalankan berkas ini\.$/i, "Run the script $1? The computer will run this file."],
    [/^Hapus header (\d+)$/i, "Remove header $1"],
    [/^Nama header (\d+)$/i, "Header name $1"],
    [/^Nilai header (\d+)$/i, "Header value $1"],
    [/^Lupakan perangkat (.+)\?/i, "Forget the device $1?"],
    [/^(\d+) halaman · (\d+) tombol$/i, "$1 pages · $2 keys"],
    [/^(\d+) halaman$/i, "$1 pages"],
    [/^(\d+) tombol$/i, "$1 keys"],
    [/^Terpasang (.+) · terbaru (.+)$/i, "Installed $1 · latest $2"],
    [/^Templat (.+) dimuat\.$/i, "Template $1 loaded."],
    [
      /^Muat templat (.+)\? Papan saat ini diganti\. Cadangan otomatis tetap bisa dipulihkan dari Setelan\.$/i,
      "Load the $1 template? The current board is replaced. Automatic backups can still be restored from Settings.",
    ]
  );

  /* ------------------------------------------------------ 2.2.0: fitur baru --- */
  Object.assign(window.KD_EN, {
    "Templat": "Templates",
    "Mulai cepat": "Quick start",
    "Templat papan": "Board templates",
    "Templat mengisi papan dengan tombol siap pakai. Papan saat ini diganti — cadangan otomatis tetap tersimpan di Setelan.":
      "Templates fill the board with ready-made keys. The current board is replaced — automatic backups stay available in Settings.",
    "Streaming": "Streaming",
    "Ngoding": "Coding",
    "Kerja": "Work",
    "Kontrol siaran: mikrofon, kamera, adegan, dan suara.":
      "Broadcast control: microphone, camera, scenes, and sound.",
    "Buka editor, terminal, dan pintasan build dalam satu ketukan.":
      "Open the editor, terminal, and build shortcuts with one tap.",
    "Pemutar musik dan video: putar, lompat, volume.":
      "Music and video player: play, skip, volume.",
    "Rapat, surel, dan dokumen untuk meja kantor.":
      "Meetings, mail, and documents for the office desk.",

    "Urungkan (Ctrl+Z)": "Undo (Ctrl+Z)",
    "Ulangi (Ctrl+Y)": "Redo (Ctrl+Y)",
    "Perubahan terakhir diurungkan.": "Last change undone.",
    "Perubahan diulangi.": "Change redone.",
    "Tidak ada perubahan untuk diurungkan.": "Nothing to undo.",
    "Tidak ada perubahan untuk diulangi.": "Nothing to redo.",
    "Riwayat tidak dapat dibaca.": "The history could not be read.",

    "Jalankan skrip (.bat, .ps1)": "Run a script (.bat, .ps1)",
    "Menjalankan skrip": "Runs a script",
    "Berkas skrip": "Script file",
    "Argumen (opsional)": "Arguments (optional)",
    "Berkas .bat, .cmd, .ps1, atau .exe di komputer host. Skrip menunggu persetujuan sekali saat pertama dijalankan.":
      "A .bat, .cmd, .ps1, or .exe file on the host computer. The script waits for approval the first time it runs.",
    "Skrip ini sudah diizinkan di komputer. Hapus lalu buat ulang tombol bila ingin meminta izin lagi.":
      "This script is already allowed on this computer. Delete and recreate the key to ask again.",
    "Saat tombol ditekan, KumiDeck meminta izin menjalankan skrip. Setelah disetujui, izin tersimpan untuk tombol ini.":
      "When the key is pressed, KumiDeck asks for permission to run the script. Once approved, the permission is stored for this key.",
    "Pilih berkas skrip yang ingin dijalankan.": "Choose the script file to run.",
    "Berkas skrip harus berakhiran .bat, .cmd, .ps1, atau .exe.":
      "The script file must end in .bat, .cmd, .ps1, or .exe.",
    "Skrip tidak dijalankan.": "Script not run.",
    "Berkas skrip tidak ditemukan.": "Script file not found.",
    "Skrip belum dipilih.": "No script selected.",
    "Skrip dijalankan.": "Script started.",
    "Jalankan skrip ini?": "Run this script?",
    "Tekan setuju hanya bila berkas skrip itu kamu pasang sendiri di komputer ini.":
      "Press approve only if you installed that script file yourself on this computer.",
    "Jalankan skrip di komputer ini?": "Run the script on this computer?",
    "Setujui hanya bila berkas skrip itu kamu pasang sendiri di komputer host.":
      "Approve only if you installed that script file yourself on the host computer.",

    "Aksi yang disunting": "Action being edited",
    "Ketuk": "Tap",
    "Tekan lama": "Long press",
    "Ketuk = aksi utama. Tekan lama di papan atau Remote menjalankan aksi kedua.":
      "Tap = main action. Long press on the board or Remote runs the second action.",
    "Tombol ini belum punya aksi kedua.": "This key has no second action yet.",

    "Header tambahan (opsional)": "Extra headers (optional)",
    "Tambah header": "Add header",
    "Belum ada header tambahan.": "No extra headers yet.",

    "Skala halaman diperbarui.": "Page scale updated.",
    "klik untuk menyunting": "click to edit",
    "klik untuk mengisi": "click to fill",

    "Halaman awal di perangkat ini": "Start page on this device",
    "Mengikuti setelan papan.": "Follows the board setting.",
    "Jadikan halaman ini awal": "Make this the start page",
    "Jadikan awal": "Make start page",
    "Halaman ini awal (ketuk untuk lepas)": "This is the start page (tap to clear)",
    "Halaman awal mengikuti setelan papan.": "Start page now follows the board setting.",

    "Mode kios tablet": "Tablet kiosk mode",
    "Layar penuh, tanpa bilah peramban": "Full screen, without browser bars",
    "Layar tetap menyala saat papan terbuka": "Keep the screen awake while the board is open",
    "Layar tetap menyala butuh HTTPS dan peramban yang mendukung Wake Lock.":
      "Keeping the screen awake needs HTTPS and a browser that supports Wake Lock.",
    "Layar penuh ditolak peramban. Ketuk sekali di halaman lalu coba lagi.":
      "The browser refused full screen. Tap once on the page and try again.",
    "Peramban ini belum mendukung Wake Lock.": "This browser does not support Wake Lock yet.",

    "Perangkat terpasang": "Paired devices",
    "Muat ulang": "Reload",
    "Lupakan": "Forget",
    "Sudah dilupakan": "Already forgotten",
    "dilupakan": "forgotten",
    "belum tersambung": "not connected yet",
    "Perangkat dilupakan.": "Device forgotten.",
    "Daftar perangkat diperbarui.": "Device list refreshed.",
    "Belum ada perangkat Remote yang terpasang.": "No Remote devices are paired yet.",
    "Lupakan perangkat untuk mematikan tokennya. Ponsel itu harus memasukkan kode pasangan baru.":
      "Forget a device to revoke its token. That phone must enter a new pairing code.",
    "Perangkat ini sudah dilupakan. Masukkan kode baru dari layar desktop.":
      "This device was forgotten. Enter a new code from the desktop screen.",

    "Terpasang": "Installed",
    "terbaru": "latest",
    " — pembaruan tersedia.": " — update available.",
    " — sudah terbaru.": " — already up to date.",
    "Versi aplikasi": "App version",
    "Cek pembaruan": "Check for updates",
    "Versi belum dibaca.": "Version not read yet.",
    "Memeriksa rilis terbaru...": "Checking the latest release...",
    "Belum ada rilis publik di GitHub.": "No public release on GitHub yet.",
    "Rilis terbaru tidak menyebut versi.": "The latest release does not name a version.",
    "Buka halaman rilis": "Open the release page",
    "Tidak dapat memeriksa pembaruan. Periksa koneksi internet.":
      "Could not check for updates. Check your internet connection.",

    "Pratinjau": "Preview",
    "Nama tombol": "Button name",
    "Widget": "Widget",
    "Tekan lama:": "Hold action:",
    "Bawaan": "Default",
    "Lembut": "Soft",
    "Aksen": "Accent",
    "Cadangan dibuat otomatis saat papan berubah. Pilih waktu, lalu tekan Pulihkan.":
      "Backups are created automatically when the board changes. Pick a time, then press Restore.",
    "Belum ada cadangan": "No backups yet",
    "Daftar cadangan tidak dapat dimuat": "The backup list could not be loaded",

    /* Soundboard: pra-unduh tautan dan pembatas laju. */
    "Mengunduh": "Downloading",
    "Mengunduh…": "Downloading…",
    "Unduhan gagal": "Download failed",
    "Belum diunduh": "Not downloaded yet",
    "Siap diputar": "Ready to play",
    "Suara disimpan. Tautan diunduh di latar.":
      "Sound saved. The link is downloading in the background.",
    "Tautan http(s) diunduh dulu ke komputer (maks 40 MB, kecepatan dibatasi) lalu diputar dari berkas lokal, jadi ping game tidak tersedot.":
      "http(s) links are downloaded to this computer first (max 40 MB, throttled) and then played from the local file, so your game's ping is not drained."
  });

  window.KD_EN_POLA.push([
    /^Suara sedang diunduh \((\d+)%\)\. Coba lagi sebentar\.$/i,
    "The sound is still downloading ($1%). Try again in a moment.",
  ]);
})();

