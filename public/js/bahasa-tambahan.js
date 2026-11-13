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
    "Belum ada perangkat Remote terpasang": "No Remote device connected yet",
    "Desktop": "Desktop",
    "Remote terhubung": "Remote connected",
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
    [/^Alamat papan: (.+)$/i, "Board address: $1"]
  );
})();

