/* KumiDeck — logika UI desktop: memuat deck, merender papan, menyunting
   tombol, mengelola halaman, dan memasangkan perangkat Remote. */
(function () {
  "use strict";

  var $ = function (sel, akar) {
    return (akar || document).querySelector(sel);
  };

  /* ------------------------------------------------------------ data tetap --- */
  var IKON = (
    "i-arrow-up i-arrow-down i-arrow-left i-arrow-right i-arrow-up-right i-arrow-down-right " +
    "i-chevron-up i-chevron-down i-chevron-left i-chevron-right i-menu i-external-link i-plus " +
    "i-minus i-check i-close i-copy i-download i-upload i-trash i-pencil i-search i-filter i-more " +
    "i-settings i-refresh i-share i-link i-eye i-lock i-code i-mail i-bell i-calendar i-clock " +
    "i-tag i-image i-play i-file i-book i-folder i-inbox i-user i-users i-wallet i-gamepad " +
    "i-chart-bar i-chart-line i-chart-pie i-trend-up i-trend-down i-layers i-grid i-database " +
    "i-info i-alert i-check-circle i-star i-heart i-sparkle i-bolt i-shield i-globe i-cloud " +
    "i-sun i-moon i-maximize i-rotate i-flip i-wind i-circle-dashed i-volume i-volume-off"
  ).split(" ");

  var VARIAN = [
    { id: "default", label: "Bawaan" },
    { id: "tint", label: "Lembut" },
    { id: "accent", label: "Aksen" },
    { id: "lime", label: "Lime" },
    { id: "dark", label: "Gelap" },
  ];

  var JENIS = [
    { id: "kosong", label: "Belum diatur" },
    { id: "hotkey", label: "Pintasan papan ketik" },
    { id: "teks", label: "Mengetik teks" },
    { id: "buka", label: "Buka aplikasi, berkas, atau tautan" },
    { id: "skrip", label: "Jalankan skrip (.bat, .ps1)" },
    { id: "http", label: "Permintaan HTTP" },
    { id: "media", label: "Kontrol media" },
    { id: "halaman", label: "Pindah halaman" },
    { id: "urutan", label: "Urutan aksi" },
    { id: "jendela", label: "Tindakan jendela" },
    { id: "volume", label: "Volume sistem" },
    { id: "daya", label: "Daya komputer" },
    { id: "kondisional", label: "Bersyarat (jika aplikasi aktif)" },
    { id: "mic", label: "Mikrofon (senyap / nyala)" },
    { id: "suara", label: "Putar suara soundboard" },
    { id: "widget", label: "Widget (jam, tanggal, media)" },
  ];

  var MIC_MODE = [
    { id: "togel", label: "Balik keadaan (senyap ↔ nyala)" },
    { id: "senyap", label: "Senyapkan mikrofon" },
    { id: "nyala", label: "Nyalakan mikrofon" },
  ];

  var JENDELA_PERINTAH = [
    { id: "minimize", label: "Sembunyikan (minimize)" },
    { id: "maximize", label: "Maksimalkan" },
    { id: "restore", label: "Kembalikan ukuran" },
    { id: "kiri", label: "Snap kiri" },
    { id: "kanan", label: "Snap kanan" },
    { id: "monitor-berikut", label: "Pindah ke monitor berikut" },
    { id: "task-view", label: "Task View" },
    { id: "tampilkan-desktop", label: "Tampilkan desktop" },
    { id: "tutup-jendela", label: "Tutup jendela (Alt+F4)" },
  ];

  var VOLUME_MODE = [
    { id: "naik", label: "Volume naik" },
    { id: "turun", label: "Volume turun" },
    { id: "mute", label: "Senyap / bersuara" },
    { id: "set", label: "Atur ke nilai" },
    { id: "baca", label: "Hanya membaca nilai" },
  ];

  var DAYA_PERINTAH = [
    { id: "tidur", label: "Tidurkan komputer" },
    { id: "kunci", label: "Kunci layar" },
    { id: "restart", label: "Mulai ulang (5 dtk)" },
    { id: "matikan", label: "Matikan (5 dtk)" },
    { id: "batal", label: "Batalkan timer" },
  ];

  var WIDGET = [
    { id: "jam", label: "Jam dan tanggal", ket: "Contoh: 19:59 · Rab, 12 Nov" },
    { id: "tanggal", label: "Tanggal lengkap", ket: "Contoh: Rabu, 12 · November 2026" },
    { id: "media", label: "Sedang diputar", ket: "Judul lagu dan artis dari pemutar aktif" },
  ];

  var MEDIA = [
    { id: "playpause", label: "Putar / jeda" },
    { id: "next", label: "Lagu berikut" },
    { id: "prev", label: "Lagu sebelumnya" },
    { id: "volup", label: "Volume naik" },
    { id: "voldown", label: "Volume turun" },
    { id: "mute", label: "Senyapkan" },
  ];

  var JENIS_LANGKAH = [
    { id: "buka", label: "Buka" },
    { id: "hotkey", label: "Pintasan" },
    { id: "teks", label: "Ketik" },
    { id: "media", label: "Media" },
    { id: "halaman", label: "Halaman" },
    { id: "http", label: "HTTP" },
    { id: "tunggu", label: "Tunggu" },
  ];

  var PETUNJUK_JENIS = {
    kosong: "Tombol tidak melakukan apa pun. Pilih jenis aksi untuk mengaktifkannya.",
    hotkey: "Tulis kombinasi dengan tanda +, mis. ctrl+shift+m atau win+l. Tombol yang dikenal: ctrl, shift, alt, win, a-z, 0-9, f1-f24, panah, enter, tab, esc, space, del, printscreen.",
    teks: "Teks dikirim ke jendela yang sedang aktif. Huruf, angka, dan tanda baca biasa didukung.",
    buka: "Contoh: notepad, calc, ms-settings:, https://github.com, %USERPROFILE%\\Downloads.",
    skrip: "Berkas .bat, .cmd, .ps1, atau .exe di komputer host. Saat pertama ditekan, desktop meminta izin; setelah disetujui skrip jalan tanpa bertanya lagi.",
    http: "Permintaan dikirim dari komputer host (bukan dari ponsel). Cocok untuk pemantik skrip atau layanan rumah pintar di jaringan lokal.",
    media: "Kontrol pemutar media yang sedang aktif di komputer ini.",
    halaman: "Berpindah ke halaman lain di papan. Halaman tujuan harus masih ada.",
    urutan: "Beberapa aksi dijalankan berurutan, dengan jeda sampai 60 detik antar langkah. Tombol “Hentikan urutan” tersedia selama urutan berjalan.",
    jendela: "Tindakan berlaku pada jendela yang sedang aktif di komputer. Jalankan dari ponsel agar jendela target tidak berubah.",
    volume: "Kontrol volume sistem lewat API audio Windows; nilainya bisa dilaporkan di papan.",
    daya: "Tindakan daya butuh konfirmasi di layar desktop. Restart dan matikan punya jeda 5 detik (bisa dibatalkan).",
    kondisional: "Tombol yang berperilaku berbeda sesuai aplikasi/jendela yang sedang di depan. Contoh: bila Chrome aktif → ctrl+w; selain itu → buka Chrome.",
    widget: "Widget menampilkan data hidup dan tidak menjalankan aksi. Jam dan tanggal memakai waktu perangkat; media dibaca dari pemutar yang aktif di komputer.",
  };

  /* Tombol siap pakai untuk "Tambah cepat". */
  var CEPAT_MEDIA = [
    { label: "Putar / Jeda", icon: "i-play", tipe: "media", nilai: "playpause", variant: "accent" },
    { label: "Lagu Berikut", icon: "i-arrow-right", tipe: "media", nilai: "next" },
    { label: "Lagu Sebelumnya", icon: "i-arrow-left", tipe: "media", nilai: "prev" },
    { label: "Volume Naik", icon: "i-volume", tipe: "media", nilai: "volup" },
    { label: "Volume Turun", icon: "i-volume-off", tipe: "media", nilai: "voldown" },
    { label: "Senyapkan", icon: "i-volume-off", tipe: "media", nilai: "mute" },
  ];

  var CEPAT_SISTEM = [
    { label: "Tangkapan Layar", icon: "i-image", tipe: "hotkey", nilai: "win+shift+s", ket: "Pintasan" },
    { label: "Kunci Layar", icon: "i-lock", tipe: "hotkey", nilai: "win+l", ket: "Pintasan" },
    { label: "Task Manager", icon: "i-database", tipe: "hotkey", nilai: "ctrl+shift+esc", ket: "Pintasan" },
    { label: "Kalkulator", icon: "i-plus", tipe: "buka", nilai: "calc", ket: "Aplikasi" },
    { label: "File Explorer", icon: "i-folder", tipe: "buka", nilai: "explorer", ket: "Aplikasi" },
    { label: "Pengaturan", icon: "i-settings", tipe: "buka", nilai: "ms-settings:", ket: "Sistem" },
    { label: "Browser", icon: "i-globe", tipe: "buka", nilai: "https://www.google.com", ket: "Tautan" },
    { label: "Unduhan", icon: "i-download", tipe: "buka", nilai: "%USERPROFILE%\\Downloads", ket: "Folder" },
    { label: "Task View", icon: "i-layers", tipe: "jendela", nilai: "task-view", ket: "Jendela" },
    { label: "Ke Monitor 2", icon: "i-maximize", tipe: "jendela", nilai: "monitor-berikut", ket: "Jendela" },
    { label: "Snap Kiri", icon: "i-arrow-left", tipe: "jendela", nilai: "kiri", ket: "Jendela" },
    { label: "Snap Kanan", icon: "i-arrow-right", tipe: "jendela", nilai: "kanan", ket: "Jendela" },
    { label: "Tampilkan Desktop", icon: "i-grid", tipe: "jendela", nilai: "tampilkan-desktop", ket: "Jendela" },
    { label: "Volume 50%", icon: "i-volume", tipe: "volume", nilai: "set:50", ket: "Volume" },
  ];

  /* Widget = tombol tampilan (tanpa aksi). */
  var CEPAT_WIDGET = [
    { label: "Jam", icon: "i-clock", tipe: "widget", nilai: "jam", ket: "Waktu sekarang" },
    { label: "Tanggal", icon: "i-calendar", tipe: "widget", nilai: "tanggal", ket: "Tanggal hari ini" },
    { label: "Sedang Diputar", icon: "i-play", tipe: "widget", nilai: "media", ket: "Lagu dari pemutar aktif" },
  ];

  var S = {
    deck: null,
    perangkat: [],
    aktivitas: [],
    halamanId: null,
    sunting: false,
    suntingSel: null /* { halamanId, indeks } */,
    tempel: null /* tombol yang disalin (papan klip lokal) */,
    pangkas: null /* gambar yang sedang dipangkas (D9) */,
    urutanAktif: false /* ada urutan panjang berjalan (D10) */,
    editor: null /* { halamanId, indeks, draft, slot, sumber, cari } */,
    apps: null /* daftar aplikasi terpasang */,
    appsMemuat: false,
    appsGalat: "",
    cepatCari: "",
    cepatGulir: 0 /* posisi gulir Tambah cepat agar tak melompat ke atas */,
    ikonKustom: null /* daftar ikon kustom dari /api/icons */,
    sinyal: null /* jendela depan + volume terakhir (#20) */,
    rekaman: null /* pendengar perekam pintasan */,
    kolomTerpasang: 0,
    adaWidgetWaktu: false /* papan memuat widget jam/tanggal */,
    online: false,
    siap: false,
    pernahTampil: false /* animasi masuk hanya pada tampilan pertama */,
    stream: null,
    pairInfo: null,
    contohTahap: 0,
    cadangan: null /* cache daftar cadangan supaya modal tidak berkedip */,
    unduhan: null /* status cache tautan soundboard: sumber -> { status, persen } */,
  };

  /* ------------------------------------------------------------- pembantu --- */
  function simpanLokal(kunci, nilai) {
    try {
      localStorage.setItem(kunci, nilai);
    } catch (err) {
      /* diabaikan */
    }
  }

  function bacaLokal(kunci) {
    try {
      return localStorage.getItem(kunci) || "";
    } catch (err) {
      return "";
    }
  }

  function namaHalaman(id) {
    var h = S.deck && S.deck.pages.find(function (p) { return p.id === id; });
    return (h && h.name) || "halaman";
  }

  function halamanAktif() {
    if (!S.deck) return null;
    var h = S.deck.pages.find(function (p) {
      return p.id === S.halamanId;
    });
    if (h) return h;
    h = S.deck.pages.find(function (p) {
      return p.id === S.deck.settings.home;
    });
    return h || S.deck.pages[0] || null;
  }

  /* Warna latar halaman (D8). Kosong = bawaan (transparan). */
  function terapkanLatarHalaman(el, halaman) {
    var warna = (halaman && halaman.warna) || "";
    el.classList.toggle("kd-papan--latar", !!warna);
    if (warna) el.style.setProperty("--kd-latar-halaman", warna);
    else el.style.removeProperty("--kd-latar-halaman");
  }

  /* Jumlah kolom papan menyesuaikan lebar jendela supaya tombol tetap besar
     dan bisa ditekan; di layar sempit 5 kolom akan jadi terlalu kecil. */
  function kolomPapan() {
    var dasar = S.deck ? S.deck.profile.columns : 5;
    var lebar = window.innerWidth;
    if (lebar <= 560) return Math.min(dasar, 3);
    if (lebar <= 900) return Math.min(dasar, 4);
    return dasar;
  }

  /* Jumlah kolom sebagaimana tersimpan di papan. Daftar tombol selalu datar
     dengan kolom profil, jadi perhitungan indeks yang akan DISIMPAN harus
     memakai angka ini — bukan kolom tampilan yang menyesuaikan jendela. */
  function kolomSimpan() {
    var dasar = S.deck && S.deck.profile ? Number(S.deck.profile.columns) : 5;
    if (!(dasar >= 1)) dasar = 5;
    return Math.round(dasar);
  }

  /* Peta sel yang bebas menurut susunan tersimpan DAN susunan yang sedang
     tampil, supaya tombol yang dipindahkan tidak tersembunyi di layar sempit. */
  function petaSelBebas(halaman) {
    if (!halaman) return null;
    var simpan = KD.susunKisi(halaman.keys, kolomSimpan());
    var layar = KD.susunKisi(halaman.keys, kolomPapan());
    return {
      bebas: function (i) {
        return !halaman.keys[i] && !simpan.tertutup[i] && !layar.tertutup[i];
      },
      tertutupSimpan: simpan.tertutup,
    };
  }

  /* Ukuran satu sel kisi (#2.4): dipakai tombol merentang untuk menghitung
     tinggi petaknya. Lebar sel = (lebar papan - celah) / kolom. */
  function ukurSelKisi(papan, kolom) {
    if (!papan || !kolom) return;
    var gaya = window.getComputedStyle(papan);
    var padKiri = parseFloat(gaya.paddingLeft) || 0;
    var padKanan = parseFloat(gaya.paddingRight) || 0;
    var celah = parseFloat(gaya.columnGap) || 0;
    var lebar = papan.clientWidth - padKiri - padKanan;
    if (!(lebar > 0)) return;
    var sel = Math.max(1, (lebar - celah * (kolom - 1)) / kolom);
    papan.dataset.kisi = "1";
    papan.style.setProperty("--kd-cell", sel.toFixed(2) + "px");
    papan.style.setProperty("--kd-gap", celah + "px");
  }

  function labelPerangkat(platform) {
    return platform === "android" ? "Remote" : "Desktop";
  }

  function ikonPerangkat(platform) {
    return platform === "android" ? "i-user" : "i-grid";
  }

  /* --------------------------------------------------------------- modal ---- */
  function bukaModal(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.__kdFokus = document.activeElement;
    /* kumi.js (closeOverlay) memulihkan fokus dari __kumiLastFocus, sedangkan
       modal aplikasi ini dibuka lewat bukaModal. Isi keduanya agar Esc yang
       ditangani kumi.js mengembalikan fokus ke tombol pemicu. */
    el.__kumiLastFocus = document.activeElement;
    el.classList.add("is-open");
    el.removeAttribute("aria-hidden");
    document.body.style.overflow = "hidden";
    KD.segarkanGeser(el);
    window.setTimeout(function () {
      var fokus = el.querySelector(
        "input:not([type=hidden]), select, textarea, button:not([disabled])"
      );
      if (fokus) fokus.focus();
    }, 30);
  }

  function tutupModal(el) {
    var lapis = typeof el === "string" ? document.getElementById(el) : el;
    if (!lapis) return;
    hentikanRekam();
    lapis.classList.remove("is-open");
    lapis.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (lapis.id === "modal-setelan" && S.deck && S.deck.settings) {
      /* Pratinjau warna aksen dibatalkan bila modal ditutup tanpa simpan. */
      KD.terapkanAksen(S.deck.settings.aksen, S.deck.settings.aksen2);
    }
    if (lapis.__kdFokus && lapis.__kdFokus.focus) {
      try {
        lapis.__kdFokus.focus();
      } catch (err) {
        /* diabaikan */
      }
    }
  }

  /* ------------------------------------------------------------- render ---- */
  function renderSemua() {
    if (S.deck && S.deck.settings) KD.terapkanAksen(S.deck.settings.aksen, S.deck.settings.aksen2);
    /* Batas ukuran tombol mengikuti jumlah kolom/baris profil terbaru. */
    if (S.deck) buatPilihanUkuran();
    if (S.editor) tandaiUkuranTerpilih();
    renderKepala();
    renderHalaman();
    renderPapan();
    renderPerangkat();
    renderAktivitas();
    renderSoundboard();
  }

  function renderKepala() {
    if (!S.deck) return;
    $("#nama-profil").textContent = S.deck.profile.name;
    document.title = S.deck.profile.name + " — KumiDeck";

    var jumlahRemote = S.perangkat.filter(function (p) {
      return p.platform === "android";
    }).length;
    var jumlahSemua = S.perangkat.length;
    $("#jumlah-perangkat").textContent = String(jumlahSemua);

    var teksPerangkat = $("#status-perangkat");
    if (jumlahRemote === 0) {
      teksPerangkat.textContent = KD.t("Belum ada perangkat Remote terpasang");
    } else {
      teksPerangkat.textContent =
        jumlahRemote +
        " " +
        KD.t("Remote terhubung") +
        (jumlahSemua > jumlahRemote ? " · " + KD.t("desktop aktif") : "");
    }

    var status = $("#status-koneksi");
    var teks = $("#status-teks");
    status.classList.toggle("is-online", S.online);
    status.classList.toggle("is-offline", !S.online);
    teks.textContent = S.online
      ? KD.t("Tersambung")
      : KD.t("Terputus — mencoba menyambung");
    terapkanTeratas();
  }

  /* Pin "selalu di atas" (D6): disimpan di setelan supaya bertahan setelah
     aplikasi ditutup. Jendela native mengikuti lewat siaran state server. */
  function teratasAktif() {
    return !!(S.deck && S.deck.settings && S.deck.settings.teratas);
  }

  function terapkanTeratas() {
    var aktif = teratasAktif();
    var btn = $("#btn-teratas");
    if (!btn) return;
    btn.setAttribute("aria-pressed", aktif ? "true" : "false");
    btn.setAttribute("aria-label", aktif ? "Lepas pin selalu di atas" : "Selalu di atas");
    btn.setAttribute("title", aktif ? "Selalu di atas: aktif" : "Selalu di atas: mati");
    btn.classList.toggle("is-active", aktif);
    /* Ikon terisi saat pin aktif, sama seperti sakelar lain (lonceng, gembok). */
    var use = btn.querySelector("use");
    if (use) use.setAttribute("href", aktif ? "#kd-pin-fill" : "#kd-pin");
  }

  function ubahTeratas() {
    if (!S.deck) return;
    var deck = JSON.parse(JSON.stringify(S.deck));
    if (!deck.settings) deck.settings = {};
    deck.settings.teratas = !teratasAktif();
    simpanDeckBaru(
      deck,
      deck.settings.teratas ? "Papan selalu di atas." : "Pin selalu di atas dilepas."
    );
  }

  function renderHalaman() {
    var wadah = $("#daftar-halaman");
    wadah.innerHTML = "";
    if (!S.deck) return;
    var aktif = halamanAktif();

    S.deck.pages.forEach(function (h) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "kumi-chip" + (aktif && aktif.id === h.id ? " is-active" : "");
      chip.setAttribute("role", "tab");
      chip.setAttribute("aria-selected", aktif && aktif.id === h.id ? "true" : "false");
      chip.setAttribute("aria-pressed", aktif && aktif.id === h.id ? "true" : "false");
      chip.textContent = h.name;
      chip.addEventListener("click", function () {
        pindahHalaman(h.id);
      });
      /* Seret tombol ke tab: berhenti ±600 ms membuka halaman itu, sedangkan
         lepas langsung di tab mengisi slot kosong pertama. */
      if (S.sunting && !terkunci()) {
        chip.addEventListener("dragover", function (ev) {
          if (seret.indeks === null || seret.halamanId === h.id) return;
          ev.preventDefault();
          try {
            ev.dataTransfer.dropEffect = "move";
          } catch (err) {
            /* diabaikan */
          }
          chip.classList.add("seret-tujuan");
          if (!seretTimer) {
            seretTimer = window.setTimeout(function () {
              seretTimer = 0;
              if (seret.indeks !== null) pindahHalaman(h.id);
            }, 600);
          }
        });
        chip.addEventListener("dragleave", function () {
          chip.classList.remove("seret-tujuan");
          if (seretTimer) {
            window.clearTimeout(seretTimer);
            seretTimer = 0;
          }
        });
        chip.addEventListener("drop", function (ev) {
          ev.preventDefault();
          chip.classList.remove("seret-tujuan");
          if (seretTimer) {
            window.clearTimeout(seretTimer);
            seretTimer = 0;
          }
          if (seret.indeks === null || seret.halamanId === h.id) return;
          var tujuan = halamanDari(h.id);
          if (!tujuan) return;
          var kosong = slotKosongPertama(tujuan);
          if (kosong < 0) {
            KD.toast(
              "Halaman tujuan penuh. Lepas ke salah satu tombol untuk menukar.",
              "danger"
            );
            if (window.Kumi) Kumi.sound.play("error");
            akhiriSeret();
            return;
          }
          if (pindahkanTombol(seret.halamanId, seret.indeks, h.id, kosong)) {
            pindahHalaman(h.id);
            if (window.Kumi) Kumi.sound.play("success");
          }
          akhiriSeret();
        });
      }
      wadah.appendChild(chip);
    });

    /* Jaga tab aktif tetap terlihat saat daftar halaman bisa digulir. */
    var chipAktif = wadah.querySelector(".kumi-chip.is-active");
    if (chipAktif && typeof chipAktif.scrollIntoView === "function") {
      try {
        chipAktif.scrollIntoView({ inline: "nearest", block: "nearest" });
      } catch (err) {
        /* peramban lama: abaikan */
      }
    }

    var kelola = $("#btn-kelola-halaman");
    kelola.hidden = !S.sunting;
    var cepat = $("#btn-tambah-cepat");
    if (cepat) cepat.hidden = !S.sunting;
  }

  function renderPapan() {
    var papan = $("#papan");
    var memuat = $("#papan-memuat");
    if (!S.deck) return;

    var halaman = halamanAktif();
    if (!halaman) return;

    /* Interval 1 detik hanya perlu jalan bila papan memang punya widget waktu. */
    S.adaWidgetWaktu = halaman.keys.some(function (k) {
      return k && k.widget && (k.widget.type === "jam" || k.widget.type === "tanggal");
    });

    papan.innerHTML = "";
    var kolom = kolomPapan();
    S.kolomTerpasang = kolom;
    papan.style.setProperty("--kd-cols", String(kolom));
    papan.dataset.kolom = String(kolom);
    KD.pasangNavigasiKisi(papan);
    /* Skala tombol per halaman (#2.2). 100% = bawaan. */
    papan.style.setProperty("--kd-skala", String((halaman.skala || 100) / 100));
    terapkanLatarHalaman(papan, halaman);
    papan.setAttribute("aria-busy", "false");
    papan.hidden = false;
    memuat.hidden = true;
    $("#papan-galat").hidden = true;

    /* Ukuran sel kisi (#2.4) supaya tombol merentang bisa menghitung tinggi
       petaknya. Diukur setelah papan terlihat agar lebarnya pasti. */
    ukurSelKisi(papan, kolom);

    var bentrok = petaBentrok(S.deck);
    var kisi = KD.susunKisi(halaman.keys, kolom);

    halaman.keys.forEach(function (key, indeks) {
      /* Sel yang tertutup tombol besar tidak digambar tersendiri. */
      if (kisi.tertutup[indeks]) return;
      var tombol = KD.buatTombol(key, { sunting: S.sunting });
      tombol.dataset.indeks = String(indeks);
      KD.pasangRentang(tombol, kisi.entri[indeks]);
      /* Jeda masuk bertahap, dibatasi supaya halaman besar tidak lambat. */
      tombol.style.setProperty("--kd-i", String(Math.min(indeks, 12)));
      /* D12: tandai tombol yang berbagi pintasan dengan tombol lain. */
      var comboBentrok = null;
      var lainnya = [];
      Object.keys(bentrok).forEach(function (comboUji) {
        var daftar = bentrok[comboUji];
        if (daftar.length < 2) return;
        var ini = daftar.some(function (x) {
          return x.halamanId === halaman.id && x.indeks === indeks;
        });
        if (!ini || comboBentrok) return;
        comboBentrok = comboUji;
        lainnya = daftar.filter(function (x) {
          return x.halamanId !== halaman.id || x.indeks !== indeks;
        });
      });
      if (comboBentrok) {
        tombol.classList.add("kd-key--bentrok");
        tombol.title =
          KD.t("Pintasan bentrok") +
          ": " +
          comboBentrok +
          " " +
          KD.t("juga dipakai") +
          " " +
          (lainnya.length === 1
            ? KD.t("tombol") +
              " “" + lainnya[0].label + "” " + KD.t("di halaman") + " “" + lainnya[0].namaHalaman + "”."
            : lainnya.length + " " + KD.t("tombol lain") + ".");
      }
      if (S.sunting && !terkunci()) {
        pasangSeret(tombol, halaman.id, indeks, key);
      }
      if (S.sunting) {
        tombol.classList.add("kd-key--sunting");
        var lencana = document.createElement("span");
        lencana.className = "kd-key__badge";
        lencana.setAttribute("aria-hidden", "true");
        lencana.innerHTML = KD.ikon("i-pencil");
        tombol.appendChild(lencana);
        /* Label menyunting tetap menjelaskan aksi agar pembaca layar paham. */
        tombol.setAttribute(
          "aria-label",
          (key ? key.label + " — " + KD.jelaskan(key.action) : "Slot kosong") +
            (key
              ? " (" + KD.t("klik untuk menyunting") + ")"
              : " — " + KD.t("klik untuk mengisi"))
        );
      }

      var jalankan = function (kedua) {
        /* Kunci tata letak hanya menahan penyuntingan — menjalankan aksi tetap
           boleh, karena itu pemakaian normal papan. */
        var mauSunting = S.sunting && !terkunci();
        if (mauSunting) {
          bukaEditor(halaman.id, indeks);
        } else if (S.sunting && terkunci()) {
          KD.toast("Tata letak terkunci. Buka kunci dulu untuk menyunting.", "danger");
          if (window.Kumi) Kumi.sound.play("error");
        } else if (key && key.widget) {
          /* Widget bukan tombol kerja: tidak ada yang dijalankan. */
          KD.segarkanWidget();
        } else if (key) {
          tekanTombol(halaman.id, key.id, tombol, kedua);
        }
      };

      if (key && key.actionKedua && !S.sunting) {
        KD.pasangTekan(tombol, {
          ketuk: function () {
            jalankan(false);
          },
          lama: function () {
            KD.toast(KD.t("Aksi tekan lama:") + " " + KD.jelaskan(key.actionKedua), "info");
            jalankan(true);
          },
        });
      } else {
        tombol.addEventListener("click", function () {
          jalankan(false);
        });
      }

      /* Penanda slot yang baru dipilih di mode sunting. */
      if (
        S.suntingSel &&
        S.suntingSel.halamanId === halaman.id &&
        S.suntingSel.indeks === indeks
      ) {
        tombol.style.outline = "2px solid var(--kumi-accent)";
        tombol.style.outlineOffset = "2px";
      }

      papan.appendChild(tombol);
    });

    document.body.classList.toggle("kd-sunting", S.sunting && !terkunci());
    if (S.sinyal) KD.segarkanPenanda(S.sinyal);

    $("#petunjuk-papan").innerHTML = terkunci()
      ? "Tata letak terkunci. Tekan tombol untuk menjalankan aksi; buka kunci untuk menyunting."
      : S.sunting
        ? "Mode sunting aktif. Klik tombol untuk mengubah isinya, atau seret untuk menukar posisi."
        : "Tekan tombol untuk menjalankan aksi. Gunakan panah untuk berpindah antar tombol. Nyalakan <strong>Sunting meja</strong> untuk mengubah isi tombol.";
  }

  /* --------------------------------------------------- seret & lepas (#2) --- */
  /* Sejak 2.3.0 tombol bisa dipindah antar halaman: lepas ke slot kosong,
     tukar dengan tombol lain, atau lepas di tab halaman untuk mengisi slot
     kosong pertama. Berhenti ±600 ms di atas tab membuka halaman itu. Semua
     perubahan disimpan lewat simpanDeckBaru supaya Ctrl+Z ikut mengembalikan
     posisi semula. */
  var seret = { indeks: null, elemen: null, halamanId: null };
  var seretTimer = 0;

  function halamanDalam(deck, id) {
    if (!deck) return null;
    return (
      deck.pages.find(function (h) {
        return h.id === id;
      }) || null
    );
  }

  function halamanDari(id) {
    return halamanDalam(S.deck, id);
  }

  function bersihkanSeret() {
    if (seretTimer) {
      window.clearTimeout(seretTimer);
      seretTimer = 0;
    }
    Array.prototype.forEach.call(
      document.querySelectorAll(".kd-key.seret-sasaran, .kumi-chip.seret-tujuan"),
      function (el) {
        el.classList.remove("seret-sasaran");
        el.classList.remove("seret-tujuan");
      }
    );
  }

  function akhiriSeret() {
    bersihkanSeret();
    seret = { indeks: null, elemen: null, halamanId: null };
  }

  /* Pindahkan tombol ke slot tujuan; bila slot terisi, keduanya bertukar.
     Satu langkah simpan = satu titik urungkan. */
  function pindahkanTombol(asalId, dari, tujuanId, ke) {
    if (dari === null || ke === null || dari < 0 || ke < 0) return false;
    if (asalId === tujuanId && dari === ke) return false;
    if (!S.deck) return false;

    var sebelum = JSON.stringify(S.deck);
    var deck = JSON.parse(JSON.stringify(S.deck));
    var asal = halamanDalam(deck, asalId);
    var tujuan = halamanDalam(deck, tujuanId);
    if (!asal || !tujuan || !asal.keys[dari]) return false;
    if (dari >= asal.keys.length || ke >= tujuan.keys.length) return false;

    var dipindah = asal.keys[dari];
    asal.keys[dari] = tujuan.keys[ke] || null;
    tujuan.keys[ke] = dipindah;
    /* Tombol yang pindah kembali ke ukuran 1×1: rentangnya bisa menutupi sel
       yang sudah berisi di posisi barunya. */
    if (dipindah && dipindah.span) dipindah.span = null;
    if (asal.keys[dari] && asal.keys[dari].span) asal.keys[dari].span = null;

    S.deck = deck;
    S.suntingSel = { halamanId: tujuanId, indeks: ke };
    renderSemua();
    simpanDeckBaru(deck, "").then(function (ok) {
      if (ok) return;
      /* Gagal simpan: pulihkan susunan sebelum seret. */
      try {
        S.deck = JSON.parse(sebelum);
      } catch (err) {
        /* diabaikan */
      }
      renderSemua();
    });
    return true;
  }

  /* Slot kosong sejati: belum diisi DAN tidak tertutup tombol besar (#2.4).
     Dipakai saat menempel, menduplikasi, dan menambah cepat. */
  function slotKosongPertama(halaman) {
    if (!halaman) return -1;
    var peta = petaSelBebas(halaman);
    for (var i = 0; i < halaman.keys.length; i += 1) {
      if (peta.bebas(i)) return i;
    }
    return -1;
  }

  function pasangSeret(tombol, halamanId, indeks, key) {
    if (key) {
      tombol.setAttribute("draggable", "true");
      tombol.addEventListener("dragstart", function (ev) {
        seret = { indeks: indeks, elemen: tombol, halamanId: halamanId };
        tombol.classList.add("seret-aktif");
        try {
          ev.dataTransfer.effectAllowed = "move";
          ev.dataTransfer.setData("text/plain", halamanId + ":" + indeks);
        } catch (err) {
          /* diabaikan */
        }
      });
      tombol.addEventListener("dragend", function () {
        tombol.classList.remove("seret-aktif");
        akhiriSeret();
      });
    }

    /* Setiap kotak (termasuk slot kosong) boleh menjadi sasaran lepas. */
    tombol.addEventListener("dragover", function (ev) {
      if (seret.indeks === null) return;
      if (seret.halamanId === halamanId && seret.indeks === indeks) return;
      ev.preventDefault();
      try {
        ev.dataTransfer.dropEffect = "move";
      } catch (err) {
        /* diabaikan */
      }
      tombol.classList.add("seret-sasaran");
    });
    tombol.addEventListener("dragleave", function () {
      tombol.classList.remove("seret-sasaran");
    });
    tombol.addEventListener("drop", function (ev) {
      ev.preventDefault();
      tombol.classList.remove("seret-sasaran");
      if (seret.indeks === null) return;
      if (seret.halamanId === halamanId && seret.indeks === indeks) return;
      pindahkanTombol(seret.halamanId, seret.indeks, halamanId, indeks);
      /* Elemen sumber bisa sudah dibuang oleh render ulang; bersihkan state. */
      window.setTimeout(akhiriSeret, 0);
    });

    /* Klik kanan = pilih tombol tanpa membuka editor, lalu tampilkan menu
       salin/tempel. Hanya di mode sunting dan saat tata letak terbuka. */
    tombol.addEventListener("contextmenu", function (ev) {
      if (!S.sunting || terkunci()) return;
      ev.preventDefault();
      bukaMenuTombol(ev, halamanId, indeks, key);
    });
  }

  /* ---------------------------------------------- salin & tempel (#2.3) ---- */
  /* Papan klip lokal (bukan sistem): satu tombol utuh, bertahan selama
     aplikasi terbuka. Tempel hanya mengisi slot kosong; "tempel gaya" hanya
     mengambil ikon, varian, dan warna tanpa mengubah aksi tombol tujuan. */
  var menuTombol = null;

  function tombolTerpilih() {
    if (!S.deck || !S.suntingSel) return null;
    var halaman = halamanDari(S.suntingSel.halamanId);
    if (!halaman) return null;
    var key = halaman.keys[S.suntingSel.indeks];
    if (!key) return null;
    return { halamanId: S.suntingSel.halamanId, indeks: S.suntingSel.indeks, key: key };
  }

  function salinTombol() {
    var pilih = tombolTerpilih();
    if (!pilih) {
      KD.toast("Pilih satu tombol dulu untuk disalin.", "danger");
      if (window.Kumi) Kumi.sound.play("error");
      return;
    }
    S.tempel = JSON.parse(JSON.stringify(pilih.key));
    KD.toast("Tombol disalin.", "ok");
    if (window.Kumi) Kumi.sound.play("success");
  }

  function tempelTombol(gayaSaja) {
    if (!S.tempel) {
      KD.toast("Belum ada tombol yang disalin.", "danger");
      if (window.Kumi) Kumi.sound.play("error");
      return;
    }
    if (!S.deck || !S.sunting || terkunci()) return;
    var halaman = halamanAktif();
    if (!halaman) return;

    var indeks = -1;
    if (S.suntingSel && S.suntingSel.halamanId === halaman.id) {
      indeks = S.suntingSel.indeks;
    }

    if (gayaSaja) {
      if (indeks < 0 || !halaman.keys[indeks]) {
        KD.toast("Klik kanan tombol tujuan dulu, lalu pilih Tempel gaya.", "danger");
        if (window.Kumi) Kumi.sound.play("error");
        return;
      }
    } else if (indeks < 0 || halaman.keys[indeks]) {
      /* Tidak ada slot kosong terpilih: isi slot kosong pertama halaman ini. */
      indeks = slotKosongPertama(halaman);
      if (indeks < 0) {
        KD.toast("Halaman ini penuh. Hapus atau pindahkan satu tombol dulu.", "danger");
        if (window.Kumi) Kumi.sound.play("error");
        return;
      }
    }

    var sebelum = JSON.stringify(S.deck);
    var deck = JSON.parse(JSON.stringify(S.deck));
    var target = halamanDalam(deck, halaman.id);
    if (!target) return;
    if (gayaSaja) {
      var isi = target.keys[indeks];
      if (!isi) return;
      if (S.tempel.icon) isi.icon = S.tempel.icon;
      isi.variant = S.tempel.variant || "default";
      isi.warna = S.tempel.warna ? JSON.parse(JSON.stringify(S.tempel.warna)) : null;
    } else {
      var salinan = JSON.parse(JSON.stringify(S.tempel));
      salinan.id = "";
      /* Ukuran tombol kembali 1×1 saat ditempel supaya tidak menabrak isi
         slot di sekitar tujuan. */
      salinan.span = null;
      target.keys[indeks] = salinan;
    }

    S.deck = deck;
    S.suntingSel = { halamanId: halaman.id, indeks: indeks };
    renderSemua();
    simpanDeckBaru(deck, gayaSaja ? "Gaya ditempel." : "Tombol ditempel.").then(function (ok) {
      if (ok) return;
      try {
        S.deck = JSON.parse(sebelum);
      } catch (err) {
        /* diabaikan */
      }
      renderSemua();
    });
  }

  function tutupMenuTombol() {
    if (menuTombol && menuTombol.parentNode) menuTombol.parentNode.removeChild(menuTombol);
    menuTombol = null;
  }

  /* Menu klik kanan pada tombol: Salin, Tempel, Tempel gaya. */
  function bukaMenuTombol(ev, halamanId, indeks, key) {
    tutupMenuTombol();
    S.suntingSel = { halamanId: halamanId, indeks: indeks };
    renderPapan();

    var menu = document.createElement("div");
    menu.className = "kd-menu-tombol";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Tindakan tombol");

    function item(label, aksi, mati) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "kd-menu-tombol__item";
      b.setAttribute("role", "menuitem");
      b.textContent = KD.t(label);
      b.disabled = !!mati;
      b.addEventListener("click", function () {
        tutupMenuTombol();
        aksi();
      });
      menu.appendChild(b);
    }

    item(
      "Salin",
      function () {
        salinTombol();
      },
      !key
    );
    item("Tempel", function () {
      tempelTombol(false);
    }, !S.tempel);
    item(
      "Tempel gaya",
      function () {
        tempelTombol(true);
      },
      !S.tempel || !key
    );

    document.body.appendChild(menu);
    var kotak = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(ev.clientX, window.innerWidth - kotak.width - 8)) + "px";
    menu.style.top = Math.max(8, Math.min(ev.clientY, window.innerHeight - kotak.height - 8)) + "px";
    menuTombol = menu;
    var pertama = menu.querySelector("button:not([disabled])");
    if (pertama) pertama.focus();
  }

  /* ------------------------------------------------------- kunci (#1) ----- */
  function terkunci() {
    return !!(S.deck && S.deck.settings && S.deck.settings.terkunci);
  }

  function terapkanKunci() {
    var kunci = terkunci();
    var btn = $("#btn-kunci");
    if (btn) {
      btn.setAttribute("aria-pressed", kunci ? "true" : "false");
      btn.setAttribute("aria-label", kunci ? "Buka kunci tata letak" : "Kunci tata letak");
      btn.setAttribute("title", kunci ? "Tata letak terkunci" : "Kunci tata letak");
      btn.classList.toggle("is-active", kunci);
      /* Ikon berbeda: gembok saat terkunci, mata saat terbuka (bisa disunting). */
      var use = btn.querySelector("use");
      if (use) use.setAttribute("href", kunci ? "#kd-lock-closed" : "#kd-lock-open");
    }
    document.body.classList.toggle("kd-kunci-aktif", kunci);
    /* Kunci menutup mode sunting agar tombol tidak tersenggol. */
    if (kunci && S.sunting) {
      S.sunting = false;
      var tombolSunting = $("#btn-sunting");
      if (tombolSunting) {
        tombolSunting.setAttribute("aria-pressed", "false");
        tombolSunting.classList.remove("kumi-btn--soft");
        tombolSunting.classList.add("kumi-btn--primary");
        $("#btn-sunting-label").textContent = "Sunting meja";
      }
      $("#btn-kelola-halaman").hidden = true;
      var cepat = $("#btn-tambah-cepat");
      if (cepat) cepat.hidden = true;
    }
  }

  function ubahKunci(paksa) {
    if (!S.deck) return;
    var nilai = typeof paksa === "boolean" ? paksa : !terkunci();
    var deck = JSON.parse(JSON.stringify(S.deck));
    deck.settings.terkunci = nilai;
    var sebelum = S.deck;
    S.deck = deck;
    terapkanKunci();
    renderPapan();
    KD.simpanDeck(deck)
      .then(function (hasil) {
        if (hasil && hasil.deck) S.deck = hasil.deck;
        if (window.Kumi) Kumi.sound.play("toggle");
        KD.toast(nilai ? "Tata letak dikunci." : "Kunci dibuka.", "ok");
        renderPapan();
      })
      .catch(function (galat) {
        S.deck = sebelum;
        terapkanKunci();
        renderPapan();
        tandaiTerputus(galat);
      });
  }

  function renderPerangkat() {
    var daftar = $("#daftar-perangkat");
    var kosong = $("#perangkat-kosong");
    daftar.innerHTML = "";
    var ada = S.perangkat.length > 0;
    kosong.hidden = ada;
    daftar.hidden = !ada;

    S.perangkat
      .slice()
      .sort(function (a, b) {
        if (a.platform === b.platform) return 0;
        return a.platform === "android" ? -1 : 1;
      })
      .forEach(function (p) {
        var li = document.createElement("li");
        li.className = "kumi-list__item";

        var ikon = document.createElement("span");
        ikon.className = "kd-perangkat__ikon";
        ikon.setAttribute("aria-hidden", "true");
        ikon.innerHTML = KD.ikon(ikonPerangkat(p.platform));

        var isi = document.createElement("span");
        isi.className = "kd-perangkat__body";
        var nama = document.createElement("span");
        nama.className = "kd-perangkat__nama";
        nama.textContent = p.name || labelPerangkat(p.platform);
        var meta = document.createElement("span");
        meta.className = "kd-perangkat__meta";
        /* Nama perangkat cukup sekali (yang tebal); di sini hanya waktu. */
        meta.textContent = KD.relatif(p.lastSeen);
        isi.appendChild(nama);
        isi.appendChild(meta);

        var lencana = document.createElement("span");
        var segar = Date.now() - p.lastSeen < 30000;
        lencana.className = "kumi-badge " + (segar ? "kumi-badge--ok" : "");
        if (segar) {
          lencana.innerHTML = '<span class="kumi-dot"></span>';
        }
        lencana.appendChild(document.createTextNode(KD.t(segar ? "Aktif" : "Menunggu")));

        li.appendChild(ikon);
        li.appendChild(isi);
        li.appendChild(lencana);
        daftar.appendChild(li);
      });

    /* Status di modal pasangkan ikut diperbarui. */
    var statusPasang = $("#status-pasang");
    if (statusPasang) {
      var jumlahRemote = S.perangkat.filter(function (p) {
        return p.platform === "android";
      }).length;
      statusPasang.classList.toggle("is-online", jumlahRemote > 0);
      statusPasang.querySelector("span:last-child").textContent =
        jumlahRemote > 0
          ? jumlahRemote + " " + KD.t("Remote terhubung")
          : KD.t("Menunggu perangkat");
    }
  }

  /* Tombol "Hentikan urutan" hanya tampil saat ada urutan berjalan (D10). */
  function terapkanHentiUrutan() {
    var btn = $("#btn-henti-urutan");
    if (!btn) return;
    btn.hidden = !S.urutanAktif;
  }

  function renderAktivitas() {
    var daftar = $("#daftar-aktivitas");
    var kosong = $("#aktivitas-kosong");
    var catatan = $("#aktivitas-catatan");
    terapkanHentiUrutan();
    daftar.innerHTML = "";
    /* Hanya satu aktivitas terbaru yang ditampilkan; yang lama digantikan. */
    var terbaru = S.aktivitas.length ? S.aktivitas[0] : null;
    kosong.hidden = !!terbaru;
    daftar.hidden = !terbaru;
    if (catatan) catatan.hidden = S.aktivitas.length <= 1;
    $("#jumlah-aktivitas").textContent = String(S.aktivitas.length);

    if (!terbaru) return;
    var a = terbaru;
    var li = document.createElement("li");
    li.className = "kumi-list__item";

    var waktu = document.createElement("span");
    waktu.className = "kd-aktivitas__waktu";
    waktu.textContent = KD.jam(a.time);

    var isi = document.createElement("span");
    isi.className = "kd-aktivitas__isi";

    var judul = document.createElement("span");
    judul.className = "kd-aktivitas__judul";
    var ikonStatus = document.createElement("span");
    ikonStatus.className = a.ok ? "kd-aktivitas__ok" : "kd-aktivitas__gagal";
    ikonStatus.innerHTML = KD.ikon(a.ok ? "i-check-circle" : "i-alert");
    judul.appendChild(ikonStatus);
    judul.appendChild(document.createTextNode(a.label));

    var meta = document.createElement("span");
    meta.className = "kd-aktivitas__meta";
    meta.textContent =
      (a.ok ? "Berhasil" : "Gagal") +
      " · " +
      labelPerangkat(a.platform) +
      (a.message ? " · " + a.message : "");

    isi.appendChild(judul);
    isi.appendChild(meta);
    li.appendChild(waktu);
    li.appendChild(isi);
    daftar.appendChild(li);
  }

  /* -------------------------------------------------------------- aksi ----- */
  function pindahHalaman(id) {
    if (!S.deck) return;
    var ada = S.deck.pages.some(function (p) {
      return p.id === id;
    });
    if (!ada) return;
    S.halamanId = id;
    simpanLokal("kumideck-halaman", id);
    renderHalaman();
    renderPapan();
    KD.animasiMasuk($("#papan"));
    KD.bunyi.pindah();
  }

  function tekanTombol(pageId, keyId, tombolEl, kedua) {
    KD.kilat(tombolEl);
    tombolEl.classList.add("kena-aksi");
    window.setTimeout(function () {
      tombolEl.classList.remove("kena-aksi");
    }, 520);

    KD.tekan(pageId, keyId, kedua)
      .then(function (hasil) {
        if (!hasil.ok && window.Kumi) {
          Kumi.sound.play("error");
          KD.toast(hasil.message || "Aksi gagal dijalankan.", "danger");
        }
        if (hasil.navigate) pindahHalaman(hasil.navigate);
        if (Array.isArray(hasil.activity)) {
          S.aktivitas = hasil.activity;
          renderAktivitas();
        }
      })
      .catch(function (galat) {
        if (galat && galat.status === 409 && galat.code === "butuh-izin") {
          tanyaIzinSkrip(pageId, keyId, kedua, galat.message);
          return;
        }
        tandaiTerputus(galat);
      });
  }

  /* Konfirmasi skrip sekali per tombol (409 butuh-izin). */
  function tanyaIzinSkrip(pageId, keyId, kedua, pesan) {
    var teks =
      KD.t(pesan || "Jalankan skrip ini?") +
      "\n\n" +
      KD.t("Tekan setuju hanya bila berkas skrip itu kamu pasang sendiri di komputer ini.");
    if (!window.confirm(teks)) {
      KD.toast("Skrip tidak dijalankan.", "info");
      return;
    }
    KD.izinkanSkrip(pageId, keyId, kedua)
      .then(function (hasil) {
        if (window.Kumi) Kumi.sound.play(hasil.ok ? "success" : "error");
        KD.toast(hasil.message || "Skrip dijalankan.", hasil.ok ? "ok" : "danger");
        if (Array.isArray(hasil.activity)) {
          S.aktivitas = hasil.activity;
          renderAktivitas();
        }
      })
      .catch(function (galat) {
        tandaiTerputus(galat);
      });
  }

  function tandaiTerputus(galat) {
    S.online = false;
    renderKepala();
    if (window.Kumi) Kumi.sound.play("error");
    KD.toast(
      galat && galat.status === 401
        ? "Kode pasangan tidak berlaku. Muat ulang halaman."
        : "Server tidak menjawab. Pastikan KumiDeck masih berjalan.",
      "danger"
    );
  }

  /* ------------------------------------------------------------- keadaan --- */
  function terapkanState(state) {
    /* Penanda: pembaruan ini berasal dari simpanan kita sendiri, jadi riwayat
       urungkan tidak boleh dibuang (kalau dibuang, Ctrl+Y langsung mati).
       Sinyal sinkron bisa tiba sebelum jawaban simpan, karena itu ada penanda
       simpanMenunggu; papan yang sama persis juga tidak mengubah riwayat. */
    var jsonBaru = state.deck ? JSON.stringify(state.deck) : "";
    var dariSimpananSendiri =
      S_riwayat.sibuk ||
      S_riwayat.simpanMenunggu > 0 ||
      (!!S_riwayat.tersimpan && jsonBaru === S_riwayat.tersimpan) ||
      (!!S.deck && jsonBaru === JSON.stringify(S.deck));
    S.deck = state.deck;
    S.perangkat = state.devices || [];
    S.aktivitas = state.activity || [];
    S.papanServer = state.server || null;
    if (state.live) KD.live = state.live;
    if (state.sinyal) {
      S.sinyal = state.sinyal;
      KD.sinyal = state.sinyal;
    }
    S.online = true;
    S.siap = true;

    var tersimpan = bacaLokal("kumideck-halaman");
    var ada = S.deck.pages.some(function (p) {
      return p.id === tersimpan;
    });
    if (!ada) {
      S.halamanId = S.deck.settings.home || (S.deck.pages[0] && S.deck.pages[0].id);
    } else if (!S.halamanId) {
      S.halamanId = tersimpan;
    }
    if (!S.deck.pages.some(function (p) { return p.id === S.halamanId; })) {
      S.halamanId = S.deck.pages[0] && S.deck.pages[0].id;
    }
    renderSemua();
    terapkanKunci();
    if (!S.pernahTampil) {
      S.pernahTampil = true;
      KD.animasiMasuk($("#papan"));
    }
    if (!dariSimpananSendiri) riwayatBersih(S.deck);
  }

  function muatState() {
    return KD.api("/api/state")
      .then(function (state) {
        terapkanState(state);
      })
      .catch(function (galat) {
        S.online = false;
        S.siap = false;
        renderKepala();
        var panelGalat = $("#papan-galat");
        var memuat = $("#papan-memuat");
        if (panelGalat) {
          panelGalat.hidden = false;
          $("#papan-galat-pesan").textContent =
            galat && galat.status === 0
              ? "Server tidak menjawab. Jalankan node server/index.js lalu coba lagi."
              : galat.message || "Papan tidak dapat dimuat.";
        }
        if (memuat) memuat.hidden = true;
        var papan = $("#papan");
        if (papan && !S.deck) papan.hidden = true;
        throw galat;
      });
  }

  /* --------------------------------------------------------------- SSE ----- */
  function sambungkan() {
    /* ?nostream=1 dipakai untuk tangkapan layar/pratinjau: tanpa SSE, peramban
       tanpa antarmuka tidak menunggu sambungan yang memang tak pernah tutup. */
    if (/[?&]nostream=1/.test(window.location.search)) return;
    if (S.stream) S.stream.tutup();
    S.stream = KD.stream({
      onOpen: function () {
        S.online = true;
        renderKepala();
      },
      onClose: function () {
        S.online = false;
        renderKepala();
      },
      onSync: function (state) {
        terapkanState(state);
      },
      onDevices: function (devices) {
        S.perangkat = devices;
        renderPerangkat();
        renderKepala();
      },
      onActivity: function (aktivitas) {
        S.aktivitas = aktivitas;
        renderAktivitas();
      },
      onLive: function (data) {
        KD.live = data;
        KD.segarkanWidget();
      },
      /* #20 penanda status: nyalakan tombol saat aplikasi/jendela cocok. */
      onSinyal: function (data) {
        S.sinyal = data;
        KD.sinyal = data;
        KD.segarkanPenanda(data);
      },
      /* D10: server memberi tahu saat urutan panjang mulai dan selesai. */
      onUrutan: function (data) {
        S.urutanAktif = !!(data && data.aktif);
        terapkanHentiUrutan();
      },
      /* #16 profil otomatis: pindah halaman mengikuti aplikasi di depan. */
      onProfil: function (data) {
        if (!data || !data.pageId) return;
        if (!S.deck.pages.some(function (p) { return p.id === data.pageId; })) return;
        if (S.halamanId === data.pageId) return;
        pindahHalaman(data.pageId);
        KD.toast("Profil otomatis: halaman “" + namaHalaman(data.pageId) + "”.", "ok");
      },
      onPress: function (ev) {
        /* Kilat di sini hanya untuk aksi dari perangkat lain; tekan sendiri
           sudah dikilatkan langsung di tekanTombol(). */
        if (ev.deviceId === KD.deviceId) return;
        if (S.deck && ev.pageId === S.halamanId) {
          var tombol = document.querySelector('[data-key-id="' + ev.keyId + '"]');
          if (tombol) {
            KD.kilat(tombol);
            tombol.classList.add("kena-aksi");
            window.setTimeout(function () {
              tombol.classList.remove("kena-aksi");
            }, 520);
          }
        }
        if (!ev.ok && window.Kumi) Kumi.sound.play("error");
      },
    });
  }

  /* -------------------------------------------------------------- editor --- */
  /* Daftar aplikasi terpasang dimuat sekali, lalu dipakai pemilih aplikasi
     dan bagian "Aplikasi" di Tambah cepat. */
  function muatApps(paksa) {
    if (S.appsMemuat) return;
    S.appsMemuat = true;
    S.appsGalat = "";
    segarkanStatusApps();
    if (paksa) renderCepat();
    KD.api("/api/apps" + (paksa ? "?ulang=1" : ""))
      .then(function (hasil) {
        S.apps = Array.isArray(hasil.aplikasi) ? hasil.aplikasi : [];
        S.appsGalat = hasil.galat || "";
        S.appsMemuat = false;
        segarkanStatusApps();
        renderCepat();
        if (S.editor && (S.editor.sumber || "aplikasi") === "aplikasi") {
          renderParamEditor();
        }
      })
      .catch(function (galat) {
        S.appsMemuat = false;
        S.apps = S.apps || [];
        S.appsGalat =
          galat && galat.status === 0
            ? "Server tidak menjawab. Daftar aplikasi tidak dapat dimuat."
            : galat.message || "Daftar aplikasi tidak dapat dimuat.";
        segarkanStatusApps();
        renderCepat();
      });
  }

  function segarkanStatusApps() {
    var status = $("#param-app-status");
    if (status) status.textContent = teksStatusApps();
    var cepatStatus = $("#cepat-status");
    if (cepatStatus) {
      cepatStatus.textContent = S.appsMemuat
        ? "Memindai aplikasi terpasang…"
        : S.apps && S.apps.length
          ? S.apps.length + " aplikasi terpasang ditemukan."
          : S.appsGalat
            ? S.appsGalat
            : "Pilih tombol; aplikasi terpasang muncul otomatis.";
    }
  }

  function teksStatusApps() {
    if (S.appsMemuat) return "Memindai aplikasi terpasang…";
    if (S.appsGalat) return S.appsGalat;
    if (S.apps) return S.apps.length + " aplikasi terpasang. Klik untuk memilih.";
    return "Memuat daftar aplikasi…";
  }

  function daftarAppTersaring() {
    var cari = String((S.editor && S.editor.cari) || "").toLowerCase().trim();
    var apps = Array.isArray(S.apps) ? S.apps : [];
    if (!cari) return apps;
    return apps.filter(function (a) {
      return (
        (a.name || "").toLowerCase().indexOf(cari) !== -1 ||
        (a.target || "").toLowerCase().indexOf(cari) !== -1
      );
    });
  }

  function htmlDaftarApp() {
    if (S.appsMemuat && !S.apps) {
      return '<div class="kd-hint" style="padding:8px">Memindai aplikasi terpasang…</div>';
    }
    if (!S.apps || !S.apps.length) {
      return (
        '<div class="kd-hint" style="padding:8px">' +
        KD.escapeHtml(S.appsGalat || "Belum ada aplikasi terdeteksi.") +
        "</div>"
      );
    }
    var daftar = daftarAppTersaring().slice(0, 400);
    if (!daftar.length) {
      return '<div class="kd-hint" style="padding:8px">Tidak ada aplikasi yang cocok.</div>';
    }
    var target = aksiDraft().target || "";
    return daftar
      .map(function (a) {
        var terpilih = a.target === target;
        return (
          '<button type="button" class="kd-app-item" data-app-target="' +
          KD.escapeHtml(a.target) +
          '" data-app-nama="' +
          KD.escapeHtml(a.name) +
          '" data-app-ikon="' +
          KD.escapeHtml(a.icon || "i-grid") +
          '" aria-pressed="' +
          (terpilih ? "true" : "false") +
          '">' +
          '<span class="kd-app-item__ikon">' +
          KD.ikon(a.icon || "i-grid") +
          "</span>" +
          '<span class="kd-app-item__teks">' +
          '<span class="kd-app-item__nama">' +
          KD.escapeHtml(a.name) +
          "</span>" +
          '<span class="kd-app-item__ket">' +
          (a.sumber === "store" ? "Microsoft Store" : "Aplikasi desktop") +
          "</span></span></button>"
        );
      })
      .join("");
  }

  /* Isi panel parameter aksi "buka" sesuai sumber yang dipilih. */
  function htmlPaneBuka() {
    if (!S.editor) return "";
    var sumber = S.editor.sumber || "aplikasi";
    var target = aksiDraft().target || "";

    if (sumber === "tautan") {
      return (
        '<div class="kumi-field"><label class="kumi-field__label" for="param-tautan">Alamat tautan</label>' +
        '<input class="kumi-input" id="param-tautan" type="url" autocomplete="off" placeholder="https://www.youtube.com" value="' +
        KD.escapeHtml(target) +
        '"><span class="kumi-field__hint">Harus dimulai dengan http:// atau https://.</span></div>'
      );
    }

    if (sumber === "jalur") {
      return (
        '<div class="kumi-field"><label class="kumi-field__label" for="param-jalur">Jalur atau perintah</label>' +
        '<input class="kumi-input" id="param-jalur" type="text" autocomplete="off" placeholder="notepad" value="' +
        KD.escapeHtml(target) +
        '"><span class="kumi-field__hint">Contoh: notepad, calc, %USERPROFILE%\\Downloads, C:\\Program Files\\Aplikasi\\app.exe.</span></div>'
      );
    }

    return (
      '<div class="kumi-field kd-app-cari"><label class="kumi-field__label" for="param-cari-app">Cari aplikasi</label>' +
      '<div class="kumi-input-icon">' +
      KD.ikon("i-search") +
      '<input class="kumi-input" id="param-cari-app" type="search" autocomplete="off" placeholder="Cari aplikasi terpasang…" value="' +
      KD.escapeHtml(S.editor.cari || "") +
      '"></div></div>' +
      '<div class="kumi-field"><span class="kumi-field__label">Aplikasi terpasang</span>' +
      '<div class="kd-app-daftar kumi-scroll" id="param-app-daftar" role="group" aria-label="Daftar aplikasi terpasang">' +
      htmlDaftarApp() +
      "</div>" +
      '<span class="kumi-field__hint" id="param-app-status">' +
      KD.escapeHtml(teksStatusApps()) +
      "</span></div>"
    );
  }

  function buatPilihanIkon() {
    renderPilihanIkon();
  }

  /* Ikon bawaan Kumi + ikon kustom yang sudah diunggah. Ikon kustom dipisah ke
     bagian "Ikon Anda" supaya unggahan baru langsung terlihat. */
  function renderPilihanIkon() {
    var wadah = $("#editor-ikon");
    if (!wadah) return;
    wadah.innerHTML = "";
    var kustom = (S.ikonKustom || []).slice();
    var terpilih = S.editor ? S.editor.draft.icon : "";
    kustom.sort(function (a, b) {
      var ka = a.id === terpilih ? 0 : 1;
      var kb = b.id === terpilih ? 0 : 1;
      return ka - kb || a.id.localeCompare(b.id);
    });

    if (kustom.length) {
      wadah.appendChild(judulIkon("Ikon Anda"));
      kustom.forEach(function (ikon) {
        wadah.appendChild(buatItemIkon(ikon.id, true));
      });
      wadah.appendChild(judulIkon("Ikon bawaan"));
    }

    IKON.forEach(function (nama) {
      wadah.appendChild(buatItemIkon(nama, false));
    });
    tandaiIkonTerpilih();
  }

  function judulIkon(teks) {
    var el = document.createElement("span");
    el.className = "kd-pilih-ikon__judul";
    el.textContent = teks;
    return el;
  }

  function buatItemIkon(nama, kustom) {
    var tombol = document.createElement("button");
    tombol.type = "button";
    tombol.className = "kd-pilih-ikon__item" + (kustom ? " kd-pilih-ikon__item--kustom" : "");
    tombol.dataset.ikon = nama;
    tombol.setAttribute("aria-pressed", "false");
    tombol.setAttribute(
      "aria-label",
      kustom ? "Ikon unggahan " + nama.replace("kst_", "") : "Ikon " + nama.replace(/^i-/, "").replace(/-/g, " ")
    );
    tombol.title = nama;
    tombol.innerHTML = KD.ikon(nama);
    tombol.addEventListener("click", function () {
      if (!S.editor) return;
      S.editor.draft.icon = nama;
      tandaiIkonTerpilih();
    });
    return tombol;
  }

  function tandaiIkonTerpilih() {
    var nama = S.editor ? S.editor.draft.icon : "";
    $$("#editor-ikon .kd-pilih-ikon__item").forEach(function (tombol) {
      tombol.setAttribute("aria-pressed", tombol.dataset.ikon === nama ? "true" : "false");
    });
    var terpilih = $("#editor-ikon .kd-pilih-ikon__item[aria-pressed='true']");
    if (terpilih && terpilih.scrollIntoView) {
      terpilih.scrollIntoView({ block: "nearest" });
    }
    gambarPratinjauEditor();
  }

  function $$(sel, akar) {
    return Array.prototype.slice.call((akar || document).querySelectorAll(sel));
  }

  function buatPilihanVarian() {
    var wadah = $("#editor-varian");
    wadah.innerHTML = "";
    VARIAN.forEach(function (v) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "kumi-chip";
      chip.dataset.varian = v.id;
      chip.textContent = KD.t(v.label);
      chip.setAttribute("aria-pressed", "false");
      chip.addEventListener("click", function () {
        if (!S.editor) return;
        S.editor.draft.variant = v.id;
        tandaiVarianTerpilih();
      });
      wadah.appendChild(chip);
    });
  }

  /* Ukuran tombol (#2.4): pilihan lebar/tinggi dipisah supaya semua kombinasi
     (hingga 6 × 4) bisa dipilih tanpa deretan chip yang panjang. */
  function buatPilihanUkuran() {
    var kolomDasar = S.deck ? S.deck.profile.columns : 5;
    var barisDasar = S.deck ? S.deck.profile.rows : 3;
    var maksLebar = Math.max(1, Math.min(6, Number(kolomDasar) || 5));
    var maksTinggi = Math.max(1, Math.min(4, Number(barisDasar) || 3));

    var isi = function (wadah, maks, kunci) {
      if (!wadah) return;
      wadah.innerHTML = "";
      for (var n = 1; n <= maks; n += 1) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "kumi-chip";
        chip.dataset[kunci] = String(n);
        chip.textContent = String(n);
        chip.setAttribute("aria-pressed", "false");
        wadah.appendChild(chip);
      }
    };
    isi($("#editor-ukuran-lebar"), maksLebar, "lebar");
    isi($("#editor-ukuran-tinggi"), maksTinggi, "tinggi");
  }

  /* Ukuran tombol (#2.4): tandai chip lebar/tinggi sesuai rentang draft. */
  function tandaiUkuranTerpilih() {
    var sp = KD.spanTombol(S.editor ? S.editor.draft : {});
    $$("#editor-ukuran-lebar [data-lebar]").forEach(function (chip) {
      var aktif = Number(chip.dataset.lebar) === sp.c;
      chip.classList.toggle("is-active", aktif);
      chip.setAttribute("aria-pressed", aktif ? "true" : "false");
    });
    $$("#editor-ukuran-tinggi [data-tinggi]").forEach(function (chip) {
      var aktif = Number(chip.dataset.tinggi) === sp.r;
      chip.classList.toggle("is-active", aktif);
      chip.setAttribute("aria-pressed", aktif ? "true" : "false");
    });
    var nilai = $("#editor-ukuran-nilai");
    if (nilai) {
      nilai.textContent = KD.t(sp.c + " × " + sp.r + " slot");
      nilai.hidden = sp.c <= 1 && sp.r <= 1;
    }
    gambarPratinjauEditor();
  }

  /* Pratinjau hidup di editor: tombol digambar dengan fungsi yang sama seperti
     di papan, jadi ikon, warna, label, dan ukuran terlihat persis sebelum
     disimpan. Ukuran besar diperkecil agar tetap muat di kotak pratinjau. */
  function gambarPratinjauEditor() {
    var papan = $("#editor-pratinjau");
    if (!papan || !S.editor) return;
    var d = S.editor.draft;
    var label = (($("#editor-label") || {}).value || "").trim();
    var lebar = Number((($("#editor-ukuran-lebar .kumi-chip.is-active") || {}).dataset || {}).lebar) || 1;
    var tinggi = Number((($("#editor-ukuran-tinggi .kumi-chip.is-active") || {}).dataset || {}).tinggi) || 1;
    var jenis = ($("#editor-jenis") || {}).value || "";
    var widget = !S.editor.slot && jenis === "widget" ? d.widget || { type: "jam" } : null;
    var kunci = {
      id: d.id || "pratinjau",
      label: label || KD.t("Nama tombol"),
      icon: d.icon || "i-grid",
      variant: d.variant || "default",
      warna: d.warna || null,
      widget: widget,
      action: d.action || { type: "kosong" },
    };

    var tombol = KD.buatTombol(kunci, {});
    tombol.tabIndex = -1;
    /* Penanda rentang dipakai juga di papan: ikon/label ikut membesar sehingga
       pratinjau benar-benar mewakili tombol besar. */
    if (lebar > 1 || tinggi > 1) {
      tombol.setAttribute("data-rentang", lebar + "x" + tinggi);
      tombol.style.setProperty("--kd-sc", String(lebar));
      tombol.style.setProperty("--kd-sr", String(tinggi));
    }
    papan.innerHTML = "";
    papan.appendChild(tombol);

    /* Ukuran sel dihitung dalam piksel (bukan transform) supaya tombol terbesar
       (6 × 4) tetap utuh di dalam kotak pratinjau, tidak terpotong. */
    var sel = Math.max(20, Math.min(72, 228 / lebar, 118 / tinggi));
    papan.style.setProperty("--pv-c", String(lebar));
    papan.style.setProperty("--pv-r", String(tinggi));
    papan.style.setProperty("--pv-sel", sel.toFixed(2) + "px");
    /* Ikon dan label ikut mengecil bersama sel supaya perbandingannya tetap
       sama dengan tombol aslinya di papan. */
    tombol.style.setProperty("--kd-skala", (sel / 72).toFixed(3));

    var ket = $("#editor-pratinjau-ket");
    if (ket) {
      var namaVarian = VARIAN.filter(function (v) {
        return v.id === (d.variant || "default");
      })[0];
      ket.textContent =
        KD.t(lebar + " × " + tinggi + " slot") +
        (namaVarian ? " · " + KD.t(namaVarian.label) : "");
    }
    var aksi = $("#editor-pratinjau-aksi");
    if (aksi) {
      var teks = widget
        ? KD.t("Widget") + " · " + KD.t((KD.namaWidget && KD.namaWidget[widget.type]) || widget.type)
        : KD.jelaskan(kunci.action);
      if (!widget && d.actionKedua && d.actionKedua.type && d.actionKedua.type !== "kosong") {
        teks += " · " + KD.t("Tekan lama:") + " " + KD.jelaskan(d.actionKedua);
      }
      aksi.textContent = teks;
    }
  }

  function tandaiVarianTerpilih() {
    var id = S.editor ? S.editor.draft.variant : "default";
    $$("#editor-varian .kumi-chip").forEach(function (chip) {
      var aktif = chip.dataset.varian === id;
      chip.classList.toggle("is-active", aktif);
      chip.setAttribute("aria-pressed", aktif ? "true" : "false");
    });
    /* Warna khusus (#19) diisi ke pemilih warna bila ada. */
    var warna = (S.editor && S.editor.draft.warna) || null;
    var bg = $("#editor-warna-bg");
    var fg = $("#editor-warna-fg");
    if (bg) bg.value = (warna && warna.bg) || "#3d5afe";
    if (fg) fg.value = (warna && warna.fg) || "#ffffff";
    gambarPratinjauEditor();
  }

  function buatPilihanJenis() {
    var pilih = $("#editor-jenis");
    pilih.innerHTML = "";
    JENIS.forEach(function (j) {
      var opt = document.createElement("option");
      opt.value = j.id;
      opt.textContent = j.label;
      pilih.appendChild(opt);
    });
    segarkanPilihanJenis();
  }

  /* Widget hanya masuk akal untuk aksi utama; sembunyikan dari slot tekan lama. */
  function segarkanPilihanJenis() {
    var pilih = $("#editor-jenis");
    if (!pilih || !S.editor) return;
    var slotKedua = S.editor.slot === 1;
    Array.prototype.forEach.call(pilih.options, function (opt) {
      var larang = slotKedua && opt.value === "widget";
      opt.hidden = larang;
      opt.disabled = larang;
    });
    if (slotKedua && pilih.value === "widget") pilih.value = "kosong";
  }

  function dapatkanGalatEditor() {
    var el = $("#editor-galat");
    if (!el) {
      el = document.createElement("span");
      el.id = "editor-galat";
      el.className = "kumi-field__error";
      el.setAttribute("role", "alert");
      el.hidden = true;
      var jenis = $("#editor-jenis");
      jenis.parentNode.appendChild(el);
    }
    return el;
  }

  function tampilkanGalatEditor(pesan) {
    var el = dapatkanGalatEditor();
    el.textContent = pesan || "";
    el.hidden = !pesan;
  }

  /* --------------------------------------------- pemeriksa bentrok (D12) --- */
  /* Pindai seluruh papan: kombinasi pintasan yang dipakai lebih dari satu
     tombol. Tidak memblokir penyimpanan; hanya memberi tahu. */
  function petaBentrok(deck) {
    var peta = {};
    if (!deck || !Array.isArray(deck.pages)) return peta;

    /* Pintasan bisa berada di aksi utama, aksi kedua, cabang kondisional,
       atau langkah urutan; semuanya ikut diperiksa. */
    function catat(aksi, h, i, label) {
      if (!aksi) return;
      if (aksi.type === "hotkey") {
        var combo = String(aksi.combo || "").trim().toLowerCase();
        if (!combo) return;
        if (!peta[combo]) peta[combo] = [];
        var sudah = peta[combo].some(function (x) {
          return x.halamanId === h.id && x.indeks === i;
        });
        if (!sudah) {
          peta[combo].push({
            halamanId: h.id,
            namaHalaman: h.name || "halaman",
            indeks: i,
            label: label || "Tombol",
          });
        }
        return;
      }
      if (aksi.type === "kondisional") {
        catat(aksi.aktif, h, i, label);
        catat(aksi.tidakAktif, h, i, label);
        return;
      }
      if (aksi.type === "urutan") {
        (aksi.steps || []).forEach(function (s) {
          catat(s && s.action, h, i, label);
        });
      }
    }

    deck.pages.forEach(function (h) {
      (h.keys || []).forEach(function (k, i) {
        if (!k) return;
        catat(k.action, h, i, k.label);
        catat(k.actionKedua, h, i, k.label);
      });
    });
    return peta;
  }

  function bentrokLain(combo) {
    if (!S.deck) return [];
    var kunci = String(combo || "").trim().toLowerCase();
    if (!kunci) return [];
    var daftar = petaBentrok(S.deck)[kunci] || [];
    return daftar.filter(function (x) {
      if (!S.editor) return true;
      return !(x.halamanId === S.editor.halamanId && x.indeks === S.editor.indeks);
    });
  }

  /* Peringatan di editor: tombol ini berbagi pintasan dengan tombol lain. */
  function periksaBentrokEditor() {
    var el = $("#peringatan-bentrok");
    if (!el) return;
    var draft = S.editor ? S.editor.draft : null;
    if (!draft || !draft.action || draft.action.type !== "hotkey") {
      el.textContent = "";
      el.hidden = true;
      return;
    }
    var lain = bentrokLain(draft.action.combo);
    if (!lain.length) {
      el.textContent = "";
      el.hidden = true;
      return;
    }
    var pertama = lain[0];
    var sisa = lain.length > 1 ? " (+" + (lain.length - 1) + ")" : "";
    el.textContent =
      KD.t("Pintasan ini juga dipakai tombol") +
      " “" +
      pertama.label +
      "” " +
      KD.t("di halaman") +
      " “" +
      pertama.namaHalaman +
      "”" +
      sisa +
      ". " +
      KD.t("Keduanya tetap bisa disimpan, tetapi aksi yang sama akan dijalankan.");
    el.hidden = false;
  }

  function bukaEditor(halamanId, indeks) {
    var halaman = S.deck.pages.find(function (p) {
      return p.id === halamanId;
    });
    if (!halaman) return;
    var asli = halaman.keys[indeks];
    var draft = asli
      ? JSON.parse(JSON.stringify(asli))
      : { id: "", label: "", icon: "i-grid", variant: "default", widget: null, action: { type: "kosong" } };

    S.suntingSel = { halamanId: halamanId, indeks: indeks };

    /* Tentukan sumber awal untuk aksi "buka": tautan, aplikasi, atau jalur. */
    var targetAwal = draft.action && draft.action.target ? String(draft.action.target) : "";
    var sumberAwal = "aplikasi";
    if (/^https?:\/\//i.test(targetAwal)) sumberAwal = "tautan";
    else if (targetAwal && (targetAwal.indexOf("\\") !== -1 || targetAwal.indexOf("/") !== -1)) {
      sumberAwal = "jalur";
    }

    S.editor = {
      halamanId: halamanId,
      indeks: indeks,
      draft: draft,
      slot: 0,
      sumber: sumberAwal,
      cari: "",
    };
    hentikanRekam();

    $("#editor-eyebrow").textContent = halaman.name + " · slot " + (indeks + 1);
    $("#editor-judul").textContent = asli ? "Sunting tombol" : "Isi slot kosong";
    $("#editor-label").value = draft.label || "";
    $("#editor-label").removeAttribute("aria-invalid");
    $("#editor-hapus").hidden = !asli;
    if ($("#editor-duplikat")) $("#editor-duplikat").hidden = !asli;
    if ($("#editor-slot")) $("#editor-slot").hidden = !!draft.widget;
    muatIkonKustom();
    tandaiIkonTerpilih();
    tandaiVarianTerpilih();
    tandaiUkuranTerpilih();
    /* Jenis aksi awal mengikuti slot yang sedang disunting. */
    $("#editor-jenis").value = draft.widget ? "widget" : aksiDraft().type || "kosong";
    /* Penanda status (#20). */
    if ($("#editor-tanda-proses")) {
      $("#editor-tanda-proses").value = (draft.tandaiAktif && draft.tandaiAktif.proses) || "";
    }
    if ($("#editor-tanda-jendela")) {
      $("#editor-tanda-jendela").value = (draft.tandaiAktif && draft.tandaiAktif.jendela) || "";
    }
    renderParamEditor();
    tampilkanGalatEditor("");
    bukaModal("modal-editor");
    renderPapan();
  }

  /* Field parameter mengikuti jenis aksi.
     S.editor.slot: 0 = aksi ketuk, 1 = aksi tekan lama. */
  function aksiDraft() {
    if (!S.editor) return { type: "kosong" };
    if (!S.editor.slot) {
      if (!S.editor.draft.action) S.editor.draft.action = { type: "kosong" };
      return S.editor.draft.action;
    }
    if (!S.editor.draft.actionKedua) S.editor.draft.actionKedua = { type: "kosong" };
    return S.editor.draft.actionKedua;
  }

  function setAksiDraft(aksi) {
    if (!S.editor) return;
    if (!S.editor.slot) {
      S.editor.draft.action = aksi;
      return;
    }
    S.editor.draft.actionKedua = aksi && aksi.type !== "kosong" ? aksi : null;
  }

  /* Header HTTP lanjutan: baris nama/nilai yang bisa ditambah & dihapus.
     Nilai header sering berupa token, jadi tidak pernah ditampilkan di log. */
  function renderHeaderHttp() {
    var wadah = $("#param-http-header-daftar");
    if (!wadah || !S.editor) return;
    var aksi = aksiDraft();
    var daftar = Array.isArray(aksi.headers) ? aksi.headers : [];
    wadah.innerHTML = "";
    if (!daftar.length) {
      var kosong = document.createElement("div");
      kosong.className = "kd-hint";
      kosong.textContent = "Belum ada header tambahan.";
      wadah.appendChild(kosong);
      return;
    }
    daftar.forEach(function (h, i) {
      var baris = document.createElement("div");
      baris.className = "kd-header-baris__isi";

      var nama = document.createElement("input");
      nama.className = "kumi-input";
      nama.type = "text";
      nama.autocomplete = "off";
      nama.placeholder = "Nama header";
      nama.setAttribute("aria-label", "Nama header " + (i + 1));
      nama.value = h.name || "";
      nama.addEventListener("input", function () {
        h.name = nama.value.trim();
      });

      var nilai = document.createElement("input");
      nilai.className = "kumi-input";
      nilai.type = "text";
      nilai.autocomplete = "off";
      nilai.placeholder = "Nilai";
      nilai.setAttribute("aria-label", "Nilai header " + (i + 1));
      nilai.value = h.value || "";
      nilai.addEventListener("input", function () {
        h.value = nilai.value;
      });

      var hapus = document.createElement("button");
      hapus.type = "button";
      hapus.className = "kumi-btn kumi-btn--ghost kumi-btn--icon";
      hapus.setAttribute("aria-label", "Hapus header " + (i + 1));
      hapus.innerHTML = KD.ikon("i-trash");
      hapus.addEventListener("click", function () {
        kumpulkanHeader();
        aksiDraft().headers.splice(i, 1);
        renderHeaderHttp();
      });

      baris.appendChild(nama);
      baris.appendChild(nilai);
      baris.appendChild(hapus);
      wadah.appendChild(baris);
    });
  }

  /* Nilai sudah ditulis langsung oleh event input; ini hanya memastikan
     bentuknya array sebelum disimpan. */
  function kumpulkanHeader() {
    var aksi = aksiDraft();
    if (!Array.isArray(aksi.headers)) aksi.headers = [];
    aksi.headers = aksi.headers.filter(function (h) {
      return h && (h.name || h.value);
    });
    return aksi.headers;
  }

  function renderParamEditor() {
    var wadah = $("#editor-param");
    if (!S.editor) return;
    var aksi = aksiDraft();
    /* Widget tidak menyimpan aksi, jadi jenisnya dibaca dari draft.widget. */
    var jenis =
      S.editor.slot ? aksi.type || "kosong" : S.editor.draft.widget ? "widget" : aksi.type || "kosong";
    $("#editor-hint").textContent = PETUNJUK_JENIS[jenis] || "";
    if ($("#editor-slot")) {
      Array.prototype.forEach.call($("#editor-slot").children, function (chip) {
        var aktif = Number(chip.getAttribute("data-slot")) === S.editor.slot;
        chip.classList.toggle("is-active", aktif);
        chip.setAttribute("aria-pressed", aktif ? "true" : "false");
      });
    }

    var html = "";
    if (jenis === "hotkey") {
      html =
        '<div class="kumi-field"><label class="kumi-field__label" for="param-hotkey">Kombinasi tombol</label>' +
        '<div class="kd-baris-rekam">' +
        '<input class="kumi-input" id="param-hotkey" type="text" autocomplete="off" placeholder="ctrl+shift+m" value="' +
        KD.escapeHtml(aksi.combo || "") +
        '">' +
        '<button class="kumi-btn kumi-btn--soft" type="button" id="btn-rekam-hotkey">' +
        KD.ikon("i-bolt") +
        " Rekam tombol</button></div>" +
        '<span class="kumi-field__hint">Tekan “Rekam tombol” lalu tekan kombinasinya, atau tulis sendiri (mis. ctrl+alt+del, win+l, alt+f4).</span>' +
        '<span class="kd-peringatan" id="peringatan-bentrok" role="status" hidden></span></div>';
    } else if (jenis === "teks") {
      html =
        '<div class="kumi-field"><label class="kumi-field__label" for="param-teks">Teks yang diketik</label>' +
        '<textarea class="kumi-textarea" id="param-teks" rows="3" placeholder="Halo dunia">' +
        KD.escapeHtml(aksi.text || "") +
        "</textarea></div>";
    } else if (jenis === "buka") {
      var sumber = S.editor.sumber || "aplikasi";
      html =
        '<div class="kumi-field"><label class="kumi-field__label" for="param-sumber">Cara memilih</label>' +
        '<select class="kumi-select" id="param-sumber">' +
        [
          ["aplikasi", "Dari aplikasi terpasang"],
          ["tautan", "Tautan (URL)"],
          ["jalur", "Jalur atau perintah manual"],
        ]
          .map(function (p) {
            return (
              '<option value="' + p[0] + '"' + (sumber === p[0] ? " selected" : "") + ">" + p[1] + "</option>"
            );
          })
          .join("") +
        "</select></div>" +
        htmlPaneBuka();
    } else if (jenis === "skrip") {
      html =
        '<div class="kumi-field"><label class="kumi-field__label" for="param-skrip-jalur">Berkas skrip</label>' +
        '<input class="kumi-input" id="param-skrip-jalur" type="text" autocomplete="off" placeholder="C:\\Skrip\\mulai-ngoding.bat" value="' +
        KD.escapeHtml(aksi.target || "") +
        '">' +
        '<span class="kumi-field__hint">Berkas .bat, .cmd, .ps1, atau .exe di komputer host. Skrip menunggu persetujuan sekali saat pertama dijalankan.</span></div>' +
        '<div class="kumi-field"><label class="kumi-field__label" for="param-skrip-args">Argumen (opsional)</label>' +
        '<input class="kumi-input" id="param-skrip-args" type="text" autocomplete="off" placeholder="--mode cepat" value="' +
        KD.escapeHtml(aksi.args || "") +
        '"></div>' +
        (aksi.izin
          ? '<div class="kd-hint">Skrip ini sudah diizinkan di komputer. Hapus lalu buat ulang tombol bila ingin meminta izin lagi.</div>'
          : '<div class="kd-hint">Saat tombol ditekan, KumiDeck meminta izin menjalankan skrip. Setelah disetujui, izin tersimpan untuk tombol ini.</div>');
    } else if (jenis === "http") {
      html =
        '<div class="kumi-row kd-pasangan-bidang">' +
        '<div class="kumi-field" style="flex:0 0 120px"><label class="kumi-field__label" for="param-http-metode">Metode</label>' +
        '<select class="kumi-select" id="param-http-metode">' +
        ["GET", "POST", "PUT", "PATCH", "DELETE"]
          .map(function (m) {
            return (
              '<option value="' + m + '"' + ((aksi.method || "GET") === m ? " selected" : "") + ">" + m + "</option>"
            );
          })
          .join("") +
        "</select></div>" +
        '<div class="kumi-field" style="flex:1 1 220px"><label class="kumi-field__label" for="param-http-url">URL</label>' +
        '<input class="kumi-input" id="param-http-url" type="url" autocomplete="off" placeholder="http://192.168.1.10:8000/nyala" value="' +
        KD.escapeHtml(aksi.url || "") +
        '"></div></div>' +
        '<div class="kumi-field"><label class="kumi-field__label" for="param-http-body">Isi permintaan (opsional)</label>' +
        '<textarea class="kumi-textarea" id="param-http-body" rows="3" placeholder="{\"saklar\":1}">' +
        KD.escapeHtml(aksi.body || "") +
        "</textarea></div>" +
        '<div class="kumi-field"><span class="kumi-field__label">Header tambahan (opsional)</span>' +
        '<div class="kd-header-baris" id="param-http-header-daftar"></div>' +
        '<button class="kumi-btn kumi-btn--soft kumi-btn--sm" type="button" id="btn-tambah-header">' +
        KD.ikon("i-plus") +
        " Tambah header</button>" +
        '<span class="kumi-field__hint">Contoh: <span class="kumi-mono">Authorization: Bearer token</span> atau ' +
        '<span class="kumi-mono">Content-Type: application/json</span>.</span></div>';
    } else if (jenis === "media") {
      html =
        '<div class="kumi-field"><label class="kumi-field__label" for="param-media">Perintah media</label>' +
        '<select class="kumi-select" id="param-media">' +
        MEDIA.map(function (m) {
          return (
            '<option value="' + m.id + '"' + ((aksi.cmd || "playpause") === m.id ? " selected" : "") + ">" + m.label + "</option>"
          );
        }).join("") +
        "</select></div>";
    } else if (jenis === "halaman") {
      html =
        '<div class="kumi-field"><label class="kumi-field__label" for="param-halaman">Halaman tujuan</label>' +
        '<select class="kumi-select" id="param-halaman">' +
        S.deck.pages
          .map(function (p) {
            return (
              '<option value="' + p.id + '"' + (aksi.pageId === p.id ? " selected" : "") + ">" + KD.escapeHtml(p.name) + "</option>"
            );
          })
          .join("") +
        "</select></div>";
    } else if (jenis === "jendela") {
      html =
        '<div class="kumi-field"><label class="kumi-field__label" for="param-jendela">Perintah jendela</label>' +
        '<select class="kumi-select" id="param-jendela">' +
        JENDELA_PERINTAH.map(function (j) {
          return (
            '<option value="' + j.id + '"' + ((aksi.cmd || "minimize") === j.id ? " selected" : "") + ">" + j.label + "</option>"
          );
        }).join("") +
        "</select></div>";
    } else if (jenis === "volume") {
      var mode = aksi.mode || "naik";
      html =
        '<div class="kumi-field"><label class="kumi-field__label" for="param-volume">Mode volume</label>' +
        '<select class="kumi-select" id="param-volume">' +
        VOLUME_MODE.map(function (m) {
          return '<option value="' + m.id + '"' + (mode === m.id ? " selected" : "") + ">" + m.label + "</option>";
        }).join("") +
        "</select>" +
        (mode === "set"
          ? '<div class="kumi-row" style="gap:12px;align-items:center;margin-top:8px">' +
            '<input class="kumi-input" id="param-volume-nilai" type="range" min="0" max="100" step="5" value="' +
            (aksi.nilai || 50) +
            '" aria-label="Nilai volume" style="padding:0">' +
            '<span class="kumi-mono" id="param-volume-label">' +
            (aksi.nilai || 50) +
            "%</span></div>"
          : "") +
        "</div>";
    } else if (jenis === "daya") {
      html =
        '<div class="kumi-field"><label class="kumi-field__label" for="param-daya">Perintah daya</label>' +
        '<select class="kumi-select" id="param-daya">' +
        DAYA_PERINTAH.map(function (d) {
          return (
            '<option value="' + d.id + '"' + ((aksi.cmd || "tidur") === d.id ? " selected" : "") + ">" + d.label + "</option>"
          );
        }).join("") +
        "</select>" +
        '<span class="kumi-field__hint" id="param-daya-hint">' +
        (["restart", "matikan"].indexOf(aksi.cmd) !== -1
          ? "Aksi ini merusak sesi: desktop akan meminta konfirmasi sebelum menjalankan."
          : "Aman dijalankan tanpa konfirmasi.") +
        "</span></div>";
    } else if (jenis === "kondisional") {
      html = htmlEditorKondisional(aksi);
    } else if (jenis === "mic") {
      html =
        '<div class="kumi-field"><label class="kumi-field__label" for="param-mic">Aksi mikrofon</label>' +
        '<select class="kumi-select" id="param-mic">' +
        MIC_MODE.map(function (m) {
          return (
            '<option value="' + m.id + '"' + ((aksi.cmd || "togel") === m.id ? " selected" : "") + ">" + m.label + "</option>"
          );
        }).join("") +
        "</select>" +
        '<span class="kumi-field__hint">Menyenyapkan mikrofon default Windows. Gunakan dari tombol papan atau ponsel.</span></div>';
    } else if (jenis === "suara") {
      var daftarSuaraAksi = daftarSuara();
      if (!daftarSuaraAksi.length) {
        html =
          '<div class="kd-hint">Soundboard masih kosong. Buka <strong>Soundboard</strong> di kepala halaman untuk menambah suara.</div>';
      } else {
        html =
          '<div class="kumi-field"><label class="kumi-field__label" for="param-suara">Suara</label>' +
          '<select class="kumi-select" id="param-suara">' +
          daftarSuaraAksi
            .map(function (s) {
              return (
                '<option value="' + s.id + '"' + (aksi.soundId === s.id ? " selected" : "") + ">" + KD.escapeHtml(s.name) + "</option>"
              );
            })
            .join("") +
          "</select>" +
          '<span class="kumi-field__hint">Volume mengikuti setelan suara di panel Soundboard.</span></div>';
      }
    } else if (jenis === "widget") {
      var tipeWidget = (S.editor.draft.widget && S.editor.draft.widget.type) || "jam";
      html =
        '<div class="kumi-field"><label class="kumi-field__label" for="param-widget">Jenis widget</label>' +
        '<select class="kumi-select" id="param-widget">' +
        WIDGET.map(function (w) {
          return (
            '<option value="' + w.id + '"' + (tipeWidget === w.id ? " selected" : "") + ">" + w.label + "</option>"
          );
        }).join("") +
        "</select>";
      var ket = WIDGET.filter(function (w) {
        return w.id === tipeWidget;
      })[0];
      html +=
        '<span class="kumi-field__hint" id="param-widget-hint">' +
        KD.escapeHtml(ket ? ket.ket : "") +
        "</span></div>" +
        '<div class="kd-pratinjau-baris">' +
        '<div class="kd-pratinjau kd-pratinjau--widget"><div class="kd-key kd-key--dark kd-key--widget" data-widget="' +
        tipeWidget +
        '"><span class="kd-key__widget"><span class="kd-key__nilai"></span><span class="kd-key__sub"></span></span></div></div>' +
        '<span class="kumi-field__hint">Pratinjau. Widget menampilkan data hidup dan tidak menjalankan aksi.</span>' +
        "</div>";
    } else if (jenis === "urutan") {
      html =
        '<div class="kumi-field"><span class="kumi-field__label">Langkah aksi</span>' +
        '<div class="kumi-stack" id="editor-langkah" style="gap:8px"></div>' +
        '<button class="kumi-btn kumi-btn--soft kumi-btn--sm" type="button" id="btn-tambah-langkah" style="margin-top:8px">' +
        KD.ikon("i-plus") +
        " Tambah langkah</button>" +
        '<span class="kumi-field__hint">Jeda sebelum tiap langkah maksimal 60.000 ms (1 menit). Langkah “Tunggu” memakai kolom jeda; tombol “Hentikan urutan” muncul di panel Aktivitas selama urutan berjalan.</span></div>';
    } else {
      html =
        '<div class="kd-hint">Tombol ini belum punya aksi. Pilih jenis aksi di atas agar bisa dipakai.</div>';
    }

    wadah.innerHTML = html;

    if (jenis === "urutan") {
      if (!Array.isArray(aksiDraft().steps)) aksiDraft().steps = [];
      renderLangkah();
      $("#btn-tambah-langkah").addEventListener("click", function () {
        kumpulkanLangkah();
        aksiDraft().steps.push({
          delay: 150,
          action: { type: "buka", target: "" },
        });
        renderLangkah();
      });
    }

    if (jenis === "widget") {
      var pilihWidget = $("#param-widget");
      if (pilihWidget) {
        pilihWidget.addEventListener("change", function () {
          if (!S.editor) return;
          S.editor.draft.widget = { type: pilihWidget.value };
          renderParamEditor();
        });
      }
      /* Isi pratinjau memakai data hidup yang sudah dimiliki klien. */
      KD.segarkanWidget();
    }

    /* #8/#9/#10/#17: kontrol aksi baru diikat ke draft. */
    if (jenis === "mic") {
      var pilihMic = $("#param-mic");
      if (pilihMic) {
        pilihMic.addEventListener("change", function () {
          setAksiDraft({ type: "mic", cmd: pilihMic.value });
        });
      }
    }
    if (jenis === "suara") {
      var pilihSuara = $("#param-suara");
      if (pilihSuara) {
        pilihSuara.addEventListener("change", function () {
          setAksiDraft({ type: "suara", soundId: pilihSuara.value });
        });
      }
    }
    if (jenis === "jendela") {
      var pilihJendela = $("#param-jendela");
      if (pilihJendela) {
        pilihJendela.addEventListener("change", function () {
          setAksiDraft({ type: "jendela", cmd: pilihJendela.value });
        });
      }
    }
    if (jenis === "volume") {
      var pilihVolume = $("#param-volume");
      if (pilihVolume) {
        pilihVolume.addEventListener("change", function () {
          if (!S.editor) return;
          var nilai = Number(($("#param-volume-nilai") || {}).value) || 50;
          setAksiDraft(
            pilihVolume.value === "set"
              ? { type: "volume", mode: "set", nilai: nilai }
              : { type: "volume", mode: pilihVolume.value }
          );
          renderParamEditor();
        });
      }
      var sliderVolume = $("#param-volume-nilai");
      if (sliderVolume) {
        sliderVolume.addEventListener("input", function () {
          var label = $("#param-volume-label");
          if (label) label.textContent = sliderVolume.value + "%";
          var sekarang = aksiDraft();
          if (sekarang.mode === "set") {
            sekarang.nilai = Number(sliderVolume.value) || 50;
          }
        });
      }
    }
    if (jenis === "daya") {
      var pilihDaya = $("#param-daya");
      if (pilihDaya) {
        pilihDaya.addEventListener("change", function () {
          if (!S.editor) return;
          setAksiDraft({ type: "daya", cmd: pilihDaya.value });
          renderParamEditor();
        });
      }
    }
    if (jenis === "kondisional") {
      var bacaSederhana = function (nama, bawaan) {
        var pilih = $("#kond-" + nama + "-jenis");
        var nilai = (($("#kond-" + nama + "-nilai") || {}).value || "").trim();
        var tipe = pilih ? pilih.value : bawaan.type;
        if (tipe === "hotkey") return nilai ? { type: "hotkey", combo: nilai } : { type: "kosong" };
        if (tipe === "teks") return nilai ? { type: "teks", text: nilai } : { type: "kosong" };
        if (tipe === "buka") return nilai ? { type: "buka", target: nilai } : { type: "kosong" };
        if (tipe === "media") return { type: "media", cmd: nilai || "playpause" };
        if (tipe === "jendela") return nilai ? { type: "jendela", cmd: nilai } : { type: "kosong" };
        if (tipe === "volume") return { type: "volume", mode: nilai || "naik" };
        if (tipe === "halaman") return nilai ? { type: "halaman", pageId: nilai } : { type: "kosong" };
        return { type: "kosong" };
      };
      var perbaruiKondisional = function () {
        if (!S.editor) return;
        setAksiDraft({
          type: "kondisional",
          syarat: {
            proses: (($("#kond-proses") || {}).value || "").trim(),
            jendela: (($("#kond-jendela") || {}).value || "").trim(),
          },
          aktif: bacaSederhana("aktif", { type: "hotkey" }),
          tidakAktif: bacaSederhana("tidak", { type: "buka" }),
        });
      };
      ["#kond-proses", "#kond-jendela", "#kond-aktif-nilai", "#kond-tidak-nilai"].forEach(function (sel) {
        var el = $(sel);
        if (el) el.addEventListener("input", perbaruiKondisional);
      });
      ["#kond-aktif-jenis", "#kond-tidak-jenis"].forEach(function (sel) {
        var el = $(sel);
        if (el) el.addEventListener("change", perbaruiKondisional);
      });
    }

    if (jenis === "hotkey") {
      var inputHotkey = $("#param-hotkey");
      if (inputHotkey) {
        inputHotkey.addEventListener("input", function () {
          aksiDraft().combo = inputHotkey.value.trim();
          periksaBentrokEditor();
        });
      }
      var tombolRekam = $("#btn-rekam-hotkey");
      if (tombolRekam) {
        tombolRekam.addEventListener("click", function () {
          mulaiRekam(inputHotkey, tombolRekam);
        });
      }
      periksaBentrokEditor();
    }

    if (jenis === "http") {
      renderHeaderHttp();
      var tambahHeader = $("#btn-tambah-header");
      if (tambahHeader) {
        tambahHeader.addEventListener("click", function () {
          kumpulkanHeader();
          var daftar = aksiDraft();
          if (!Array.isArray(daftar.headers)) daftar.headers = [];
          daftar.headers.push({ name: "", value: "" });
          renderHeaderHttp();
        });
      }
    }

    if (jenis === "skrip") {
      var inputSkrip = $("#param-skrip-jalur");
      if (inputSkrip) {
        inputSkrip.addEventListener("input", function () {
          aksiDraft().target = inputSkrip.value.trim();
        });
      }
      var inputArgs = $("#param-skrip-args");
      if (inputArgs) {
        inputArgs.addEventListener("input", function () {
          aksiDraft().args = inputArgs.value.trim();
        });
      }
    }

    if (jenis === "buka") {
      var pilihSumber = $("#param-sumber");
      if (pilihSumber) {
        pilihSumber.addEventListener("change", function () {
          if (!S.editor) return;
          S.editor.sumber = pilihSumber.value;
          if (pilihSumber.value === "aplikasi") {
            /* target lama dipertahankan; pengguna bisa memilih aplikasi lain */
          } else {
            aksiDraft().target = "";
          }
          renderParamEditor();
        });
      }

      var cariApp = $("#param-cari-app");
      if (cariApp) {
        /* Ketikan disaring 120 ms: daftar aplikasi bisa berisi ratusan tombol
           dan SVG, jadi jangan dibangun ulang pada setiap huruf. */
        var jamCariApp = 0;
        cariApp.addEventListener("input", function () {
          if (jamCariApp) window.clearTimeout(jamCariApp);
          jamCariApp = window.setTimeout(function () {
            jamCariApp = 0;
            if (!S.editor) return;
            S.editor.cari = cariApp.value;
            var daftar = $("#param-app-daftar");
            if (daftar) daftar.innerHTML = htmlDaftarApp();
            segarkanStatusApps();
          }, 120);
        });
      }

      var daftarApp = $("#param-app-daftar");
      if (daftarApp) {
        daftarApp.addEventListener("click", function (ev) {
          var item = ev.target.closest("[data-app-target]");
          if (!item || !S.editor) return;
          aksiDraft().target = item.getAttribute("data-app-target");
          var ikonApp = item.getAttribute("data-app-ikon");
          if (ikonApp) S.editor.draft.icon = ikonApp;
          var labelInput = $("#editor-label");
          if (labelInput && !(labelInput.value || "").trim()) {
            labelInput.value = item.getAttribute("data-app-nama") || "";
          }
          Array.prototype.forEach.call(
            daftarApp.querySelectorAll("[data-app-target]"),
            function (el) {
              el.setAttribute("aria-pressed", el === item ? "true" : "false");
            }
          );
          tandaiIkonTerpilih();
          /* Ambil ikon asli aplikasi (bila ada) agar tombol langsung mirip
             aplikasinya di Windows. */
          var targetApp = item.getAttribute("data-app-target") || "";
          if (targetApp && !/^https?:/i.test(targetApp) && !/^kst_/.test(S.editor.draft.icon || "")) {
            pakaiIkonAplikasi(targetApp, ikonApp).then(function (ikon) {
              if (!S.editor || !ikon) return;
              S.editor.draft.icon = ikon;
              renderPilihanIkon();
              tandaiIkonTerpilih();
            });
          }
        });
      }
      if (!S.apps && !S.appsMemuat) muatApps(false);

      var inputTautan = $("#param-tautan");
      if (inputTautan) {
        inputTautan.addEventListener("input", function () {
          aksiDraft().target = inputTautan.value.trim();
        });
      }
      var inputJalur = $("#param-jalur");
      if (inputJalur) {
        inputJalur.addEventListener("input", function () {
          aksiDraft().target = inputJalur.value;
        });
      }
    }
    gambarPratinjauEditor();
  }

  /* ---------------------------------------------------- perekam pintasan --- */
  var PETA_KODE_TOMBOL = {
    Space: "space",
    Enter: "enter",
    NumpadEnter: "enter",
    Tab: "tab",
    Escape: "esc",
    Backspace: "backspace",
    Delete: "del",
    Insert: "insert",
    Home: "home",
    End: "end",
    PageUp: "pageup",
    PageDown: "pagedown",
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    PrintScreen: "printscreen",
    CapsLock: "capslock",
    NumLock: "numlock",
    Minus: "minus",
    Equal: "equal",
    Comma: "comma",
    Period: "period",
    Slash: "slash",
    Backslash: "backslash",
    Semicolon: "semicolon",
    Quote: "quote",
    Backquote: "backtick",
    BracketLeft: "bracketleft",
    BracketRight: "bracketright",
    NumpadAdd: "numpadplus",
    NumpadSubtract: "numpadminus",
    NumpadMultiply: "numpadmultiply",
    NumpadDivide: "numpaddivide",
    NumpadDecimal: "numpaddecimal",
    ControlLeft: "ctrl",
    ControlRight: "ctrl",
    ShiftLeft: "shift",
    ShiftRight: "shift",
    AltLeft: "alt",
    AltRight: "alt",
    MetaLeft: "win",
    MetaRight: "win",
  };

  function namaTombolRekam(ev) {
    var kode = ev.code || "";
    var cocok;
    if ((cocok = /^Key([A-Z])$/.exec(kode))) return cocok[1].toLowerCase();
    if ((cocok = /^Digit([0-9])$/.exec(kode))) return cocok[1];
    if ((cocok = /^F([1-9]|1[0-9]|2[0-4])$/.exec(kode))) return "f" + cocok[1];
    if ((cocok = /^Numpad([0-9])$/.exec(kode))) return "numpad" + cocok[1];
    if (PETA_KODE_TOMBOL[kode]) return PETA_KODE_TOMBOL[kode];
    /* Cadangan: pakai event.key untuk tata letak non-standar. */
    var kunci = ev.key || "";
    if (/^[a-zA-Z]$/.test(kunci)) return kunci.toLowerCase();
    if (/^[0-9]$/.test(kunci)) return kunci;
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(kunci)) return kunci.toLowerCase();
    if (kunci === " ") return "space";
    return null;
  }

  function mulaiRekam(input, tombol) {
    if (!input || !tombol) return;
    if (S.rekaman) {
      hentikanRekam();
      return;
    }
    var isiAsli = tombol.innerHTML;
    tombol.classList.add("is-loading");
    tombol.textContent = "Tekan kombinasinya…";

    function tekan(ev) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        hentikanRekam();
        return;
      }
      var nama = namaTombolRekam(ev);
      if (!nama) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (nama === "ctrl" || nama === "alt" || nama === "shift" || nama === "win") return;
      var bagian = [];
      if (ev.ctrlKey) bagian.push("ctrl");
      if (ev.altKey) bagian.push("alt");
      if (ev.shiftKey) bagian.push("shift");
      if (ev.metaKey) bagian.push("win");
      bagian.push(nama);
      var combo = bagian.join("+");
      input.value = combo;
      if (S.editor) aksiDraft().combo = combo;
      periksaBentrokEditor();
      hentikanRekam();
      if (window.Kumi) Kumi.sound.play("success");
    }

    document.addEventListener("keydown", tekan, true);
    S.rekaman = { tekan: tekan, tombol: tombol, isiAsli: isiAsli };
  }

  function hentikanRekam() {
    if (!S.rekaman) return;
    document.removeEventListener("keydown", S.rekaman.tekan, true);
    if (S.rekaman.tombol) {
      S.rekaman.tombol.classList.remove("is-loading");
      S.rekaman.tombol.innerHTML = S.rekaman.isiAsli;
    }
    S.rekaman = null;
  }

  /* Langkah urutan: pilihan jenis + nilai + jeda. */
  /* Konfirmasi untuk aksi daya yang merusak sesi (#10). */
  function konfirmasiDaya(cmd) {
    var teks =
      cmd === "restart"
        ? "Komputer akan dimulai ulang dalam 5 detik. Simpan pekerjaan dulu."
        : "Komputer akan dimatikan dalam 5 detik. Simpan pekerjaan dulu.";
    return window.confirm(teks);
  }

  /* Editor untuk aksi bersyarat (#17): syarat + dua cabang aksi sederhana. */
  function htmlEditorKondisional(aksi) {
    var syarat = aksi.syarat || { proses: "", jendela: "" };
    var aktif = aksi.aktif && aksi.aktif.type !== "kosong" ? aksi.aktif : { type: "hotkey", combo: "" };
    var tidak = aksi.tidakAktif && aksi.tidakAktif.type !== "kosong" ? aksi.tidakAktif : { type: "buka", target: "" };
    var jenisSederhana = [
      { id: "hotkey", label: "Pintasan" },
      { id: "teks", label: "Ketik teks" },
      { id: "buka", label: "Buka aplikasi/tautan" },
      { id: "media", label: "Kontrol media" },
      { id: "jendela", label: "Tindakan jendela" },
      { id: "volume", label: "Volume sistem" },
      { id: "halaman", label: "Pindah halaman" },
    ];
    function nilaiUntuk(a) {
      if (!a) return "";
      if (a.type === "hotkey") return a.combo || "";
      if (a.type === "teks") return a.text || "";
      if (a.type === "buka") return a.target || "";
      if (a.type === "jendela") return a.cmd || "minimize";
      if (a.type === "volume") return a.mode || "naik";
      if (a.type === "halaman") return a.pageId || "";
      return "";
    }
    function cabang(nama, label, aksiCabang) {
      return (
        '<div class="kumi-field"><span class="kumi-field__label">' +
        label +
        '</span><div class="kd-pasangan-bidang"><div class="kumi-field" style="flex:0 0 150px">' +
        '<select class="kumi-select" id="kond-' +
        nama +
        '-jenis" aria-label="Jenis aksi ' +
        label +
        '">' +
        jenisSederhana
          .map(function (j) {
            return '<option value="' + j.id + '"' + (aksiCabang.type === j.id ? " selected" : "") + ">" + j.label + "</option>";
          })
          .join("") +
        "</select></div><div class=\"kumi-field\" style=\"flex:1 1 200px\">" +
        '<input class="kumi-input" id="kond-' +
        nama +
        '-nilai" type="text" aria-label="Nilai aksi ' +
        label +
        '" value="' +
        KD.escapeHtml(nilaiUntuk(aksiCabang)) +
        '" placeholder="' +
        (aksiCabang.type === "halaman" ? "id halaman" : aksiCabang.type === "jendela" ? "snap kiri, snap kanan…" : aksiCabang.type === "volume" ? "naik, turun, mute" : "mis. ctrl+w") +
        '"></div></div></div>'
      );
    }
    return (
      '<div class="kumi-field"><span class="kumi-field__label">Syarat</span>' +
      '<div class="kd-pasangan-bidang"><div class="kumi-field"><label class="kumi-field__label" for="kond-proses">Aplikasi</label>' +
      '<input class="kumi-input" id="kond-proses" type="text" placeholder="mis. chrome" value="' +
      KD.escapeHtml(syarat.proses || "") +
      '"></div><div class="kumi-field"><label class="kumi-field__label" for="kond-jendela">Judul jendela</label>' +
      '<input class="kumi-input" id="kond-jendela" type="text" placeholder="opsional" value="' +
      KD.escapeHtml(syarat.jendela || "") +
      '"></div></div>' +
      '<span class="kumi-field__hint">Bila jendela yang sedang di depan cocok dengan syarat, aksi "bila aktif" dijalankan; bila tidak, aksi "bila tidak aktif".</span></div>' +
      cabang("aktif", "Bila aktif", aktif) +
      cabang("tidak", "Bila tidak aktif", tidak)
    );
  }

  function renderLangkah() {
    var wadah = $("#editor-langkah");
    if (!wadah) return;
    var langkah = aksiDraft().steps || [];
    wadah.innerHTML = "";

    if (!langkah.length) {
      var kosong = document.createElement("div");
      kosong.className = "kd-hint";
      kosong.textContent = "Belum ada langkah. Tambahkan minimal satu.";
      wadah.appendChild(kosong);
      return;
    }

    langkah.forEach(function (l, i) {
      var baris = document.createElement("div");
      baris.className = "kd-editor-baris";
      baris.dataset.langkah = String(i);

      var pilih = document.createElement("select");
      pilih.className = "kumi-select";
      pilih.setAttribute("aria-label", "Jenis langkah " + (i + 1));
      JENIS_LANGKAH.forEach(function (j) {
        var opt = document.createElement("option");
        opt.value = j.id;
        opt.textContent = j.label;
        if (l.action && l.action.type === j.id) opt.selected = true;
        pilih.appendChild(opt);
      });
      pilih.addEventListener("change", function () {
        l.action = aksiLangkah(pilih.value, "");
        renderLangkah();
      });

      var nilai = document.createElement("input");
      nilai.className = "kumi-input";
      nilai.type = "text";
      nilai.value = nilaiLangkah(l.action);
      nilai.placeholder = placeholderLangkah(l.action);
      nilai.setAttribute("aria-label", "Nilai langkah " + (i + 1));
      nilai.addEventListener("input", function () {
        l.action = aksiLangkah(l.action ? l.action.type : "buka", nilai.value);
      });
      /* Langkah "Tunggu" tidak butuh nilai; durasinya dari kolom jeda. */
      if (l.action && l.action.type === "tunggu") nilai.hidden = true;

      var jeda = document.createElement("input");
      jeda.className = "kumi-input";
      jeda.type = "number";
      jeda.min = "0";
      jeda.max = "60000";
      jeda.step = "100";
      jeda.value = String(l.delay || 0);
      jeda.title = "Jeda sebelum langkah ini berjalan (milidetik, maksimal 60.000)";
      jeda.setAttribute("aria-label", "Jeda langkah " + (i + 1) + " dalam milidetik");
      jeda.addEventListener("input", function () {
        l.delay = Math.max(0, Math.min(60000, Number(jeda.value) || 0));
      });

      var hapus = document.createElement("button");
      hapus.type = "button";
      hapus.className = "kumi-btn kumi-btn--ghost kumi-btn--icon kd-editor-baris__hapus";
      hapus.setAttribute("aria-label", "Hapus langkah " + (i + 1));
      hapus.innerHTML = KD.ikon("i-trash");
      hapus.addEventListener("click", function () {
        kumpulkanLangkah();
        aksiDraft().steps.splice(i, 1);
        renderLangkah();
      });

      baris.appendChild(pilih);
      baris.appendChild(nilai);
      baris.appendChild(jeda);
      baris.appendChild(hapus);
      wadah.appendChild(baris);
    });
  }

  function aksiLangkah(jenis, nilai) {
    switch (jenis) {
      case "hotkey":
        return { type: "hotkey", combo: nilai };
      case "teks":
        return { type: "teks", text: nilai };
      case "media":
        return { type: "media", cmd: nilai || "playpause" };
      case "halaman":
        return { type: "halaman", pageId: nilai || (S.deck.pages[0] && S.deck.pages[0].id) };
      case "http":
        return { type: "http", method: "GET", url: nilai, body: "", headers: [] };
      case "tunggu":
        return { type: "tunggu" };
      default:
        return { type: "buka", target: nilai };
    }
  }

  function nilaiLangkah(aksi) {
    if (!aksi) return "";
    if (aksi.type === "buka") return aksi.target || "";
    if (aksi.type === "hotkey") return aksi.combo || "";
    if (aksi.type === "teks") return aksi.text || "";
    if (aksi.type === "media") return aksi.cmd || "";
    if (aksi.type === "halaman") return aksi.pageId || "";
    if (aksi.type === "http") return aksi.url || "";
    return "";
  }

  function placeholderLangkah(aksi) {
    if (!aksi) return "";
    if (aksi.type === "hotkey") return "ctrl+shift+m";
    if (aksi.type === "halaman") return "id halaman";
    if (aksi.type === "http") return "http://…";
    if (aksi.type === "media") return "playpause";
    if (aksi.type === "teks") return "teks";
    return "notepad";
  }

  function kumpulkanLangkah() {
    /* Nilai sudah diperbarui langsung oleh event input; fungsi ini hanya
       memastikan referensi tetap sinkron sebelum render ulang. */
    return S.editor ? aksiDraft().steps || [] : [];
  }

  /* Baca form → aksi tervalidasi. Mengembalikan {aksi} atau {galat}. */
  function bacaAksiDariForm() {
    var jenis = $("#editor-jenis").value;
    if (jenis === "kosong") return { aksi: { type: "kosong" } };

    if (jenis === "widget") {
      var tipeWidget = ($("#param-widget") || {}).value || "jam";
      return { aksi: { type: "kosong" }, widget: { type: tipeWidget } };
    }

    if (jenis === "mic") {
      var cmdMic = ($("#param-mic") || {}).value || "togel";
      return { aksi: { type: "mic", cmd: cmdMic } };
    }

    if (jenis === "suara") {
      var soundId = ($("#param-suara") || {}).value || "";
      if (!soundId) {
        return { galat: "Belum ada suara di soundboard. Tambahkan dulu lewat panel Soundboard." };
      }
      return { aksi: { type: "suara", soundId: soundId } };
    }

    if (jenis === "jendela") {
      var cmdJendela = ($("#param-jendela") || {}).value || "minimize";
      return { aksi: { type: "jendela", cmd: cmdJendela } };
    }

    if (jenis === "volume") {
      var modeVolume = ($("#param-volume") || {}).value || "naik";
      if (modeVolume === "set") {
        var nilaiVolume = Math.max(0, Math.min(100, Number(($("#param-volume-nilai") || {}).value) || 50));
        return { aksi: { type: "volume", mode: "set", nilai: nilaiVolume } };
      }
      return { aksi: { type: "volume", mode: modeVolume } };
    }

    if (jenis === "daya") {
      var cmdDaya = ($("#param-daya") || {}).value || "tidur";
      if ((cmdDaya === "restart" || cmdDaya === "matikan") && !konfirmasiDaya(cmdDaya)) {
        return { galat: "Aksi daya dibatalkan." };
      }
      return { aksi: { type: "daya", cmd: cmdDaya } };
    }

    if (jenis === "kondisional") {
      var syaratProses = (($("#kond-proses") || {}).value || "").trim();
      var syaratJendela = (($("#kond-jendela") || {}).value || "").trim();
      if (!syaratProses && !syaratJendela) {
        return { galat: "Isi aplikasi atau judul jendela untuk syarat." };
      }
      var bacaCabang = function (nama, bawaan) {
        var pilih = $("#kond-" + nama + "-jenis");
        var nilai = (($("#kond-" + nama + "-nilai") || {}).value || "").trim();
        var tipe = pilih ? pilih.value : bawaan;
        if (tipe === "hotkey") return nilai ? { type: "hotkey", combo: nilai } : { type: "kosong" };
        if (tipe === "teks") return nilai ? { type: "teks", text: nilai } : { type: "kosong" };
        if (tipe === "buka") return nilai ? { type: "buka", target: nilai } : { type: "kosong" };
        if (tipe === "media") return { type: "media", cmd: nilai || "playpause" };
        if (tipe === "jendela") return nilai ? { type: "jendela", cmd: nilai } : { type: "kosong" };
        if (tipe === "volume") return { type: "volume", mode: nilai || "naik" };
        if (tipe === "halaman") return nilai ? { type: "halaman", pageId: nilai } : { type: "kosong" };
        return { type: "kosong" };
      };
      var cabangAktif = bacaCabang("aktif", "hotkey");
      var cabangTidak = bacaCabang("tidak", "buka");
      if (cabangAktif.type === "kosong" && cabangTidak.type === "kosong") {
        return { galat: "Isi minimal satu cabang aksi (bila aktif atau bila tidak aktif)." };
      }
      return {
        aksi: {
          type: "kondisional",
          syarat: { proses: syaratProses, jendela: syaratJendela },
          aktif: cabangAktif,
          tidakAktif: cabangTidak,
        },
      };
    }

    if (jenis === "hotkey") {
      var combo = ($("#param-hotkey") || {}).value || "";
      combo = combo.trim();
      if (!combo) return { galat: "Kombinasi tombol belum diisi." };
      if (!/^[a-zA-Z0-9+\-\s]+$/.test(combo)) {
        return { galat: "Kombinasi hanya boleh berisi huruf, angka, spasi, dan tanda +." };
      }
      if (combo.split("+").filter(Boolean).length < 1) return { galat: "Kombinasi tombol tidak valid." };
      return { aksi: { type: "hotkey", combo: combo.replace(/\s+/g, "") } };
    }

    if (jenis === "teks") {
      var teksIsi = ($("#param-teks") || {}).value || "";
      if (!teksIsi.trim()) return { galat: "Teks yang diketik masih kosong." };
      return { aksi: { type: "teks", text: teksIsi.slice(0, 200) } };
    }

    if (jenis === "buka") {
      var sumberBuka = (S.editor && S.editor.sumber) || "aplikasi";
      var target = "";
      if (sumberBuka === "aplikasi") {
        target = (aksiDraft().target || "").trim();
        if (!target) return { galat: "Pilih aplikasi dari daftar, atau ubah ke tautan/jalur manual." };
      } else if (sumberBuka === "tautan") {
        target = (($("#param-tautan") || {}).value || "").trim();
        if (!/^https?:\/\//i.test(target)) {
          return { galat: "Tautan harus dimulai dengan http:// atau https://." };
        }
      } else {
        target = (($("#param-jalur") || {}).value || "").trim();
        if (!target) return { galat: "Isi jalur atau perintah yang ingin dijalankan." };
      }
      return { aksi: { type: "buka", target: target } };
    }

    if (jenis === "skrip") {
      var jalurSkrip = (($("#param-skrip-jalur") || {}).value || "").trim();
      if (!jalurSkrip) return { galat: "Pilih berkas skrip yang ingin dijalankan." };
      if (!/\.(bat|cmd|ps1|exe)$/i.test(jalurSkrip)) {
        return { galat: "Berkas skrip harus berakhiran .bat, .cmd, .ps1, atau .exe." };
      }
      var argsSkrip = (($("#param-skrip-args") || {}).value || "").trim();
      /* Izin yang sudah ada dipertahankan selama berkasnya sama. */
      var izinLama = !!aksiDraft().izin && aksiDraft().target === jalurSkrip;
      return { aksi: { type: "skrip", target: jalurSkrip, args: argsSkrip, izin: izinLama } };
    }

    if (jenis === "http") {
      var url = (($("#param-http-url") || {}).value || "").trim();
      if (!/^https?:\/\//i.test(url)) return { galat: "URL harus dimulai dengan http:// atau https://." };
      var metode = ($("#param-http-metode") || {}).value || "GET";
      var isi = ($("#param-http-body") || {}).value || "";
      var header = kumpulkanHeader()
        .filter(function (h) {
          return h.name;
        })
        .map(function (h) {
          return { name: h.name, value: h.value || "" };
        });
      return {
        aksi: {
          type: "http",
          method: metode,
          url: url,
          body: metode === "GET" ? "" : isi.slice(0, 4000),
          headers: header,
        },
      };
    }

    if (jenis === "media") {
      return { aksi: { type: "media", cmd: $("#param-media").value } };
    }

    if (jenis === "halaman") {
      var pageId = $("#param-halaman").value;
      if (!pageId) return { galat: "Halaman tujuan belum dipilih." };
      return { aksi: { type: "halaman", pageId: pageId } };
    }

    if (jenis === "urutan") {
      var langkah = (S.editor && S.editor.draft.action.steps) || [];
      if (!langkah.length) return { galat: "Urutan butuh minimal satu langkah." };
      for (var i = 0; i < langkah.length; i += 1) {
        var l = langkah[i];
        var nilai = nilaiLangkah(l.action);
        if (!nilai && !(l.action && l.action.type === "media")) {
          return { galat: "Langkah " + (i + 1) + " belum diisi." };
        }
        if (l.action && l.action.type === "http" && !/^https?:\/\//i.test(nilai)) {
          return { galat: "URL pada langkah " + (i + 1) + " harus dimulai http:// atau https://." };
        }
      }
      return {
        aksi: {
          type: "urutan",
          steps: langkah.map(function (l) {
            return { delay: l.delay || 0, action: l.action };
          }),
        },
      };
    }

    return { galat: "Jenis aksi tidak dikenal." };
  }

  /* ------------------------------------------------- undo / ulangi (#2.2) --- */
  /* Riwayat lokal (bukan di server): keadaan papan terakhir yang tersimpan
     didorong ke tumpukan urungkan setiap kali simpan berhasil. Tersedia lewat
     Ctrl+Z dan Ctrl+Y, serta tombol di sisi papan. */
  var RIWAYAT_MAKS = 30;
  var S_riwayat = { tumpukan: [], depan: [], sibuk: false, simpanMenunggu: 0, tersimpan: null };

  function riwayatBersih(deck) {
    S_riwayat.tumpukan = [];
    S_riwayat.depan = [];
    S_riwayat.tersimpan = deck ? JSON.stringify(deck) : null;
    segarkanTombolRiwayat();
  }

  function riwayatDorong(deckLama) {
    if (!deckLama) return;
    S_riwayat.tumpukan.push(deckLama);
    if (S_riwayat.tumpukan.length > RIWAYAT_MAKS) S_riwayat.tumpukan.shift();
    S_riwayat.depan = [];
  }

  function segarkanTombolRiwayat() {
    var urung = $("#btn-urungkan");
    var ulang = $("#btn-ulangi");
    if (urung) urung.disabled = !S_riwayat.tumpukan.length;
    if (ulang) ulang.disabled = !S_riwayat.depan.length;
  }

  function terapkanRiwayat(state) {
    var deck;
    try {
      deck = JSON.parse(state);
    } catch (err) {
      KD.toast("Riwayat tidak dapat dibaca.", "danger");
      return Promise.resolve(false);
    }
    S_riwayat.sibuk = true;
    return KD.simpanDeck(deck)
      .then(function (hasil) {
        if (hasil && hasil.deck) S.deck = hasil.deck;
        S_riwayat.tersimpan = JSON.stringify(S.deck);
        S.online = true;
        renderSemua();
        if (window.Kumi) Kumi.sound.play("toggle");
        return true;
      })
      .catch(function (galat) {
        tandaiTerputus(galat);
        return false;
      })
      .finally(function () {
        S_riwayat.sibuk = false;
        segarkanTombolRiwayat();
      });
  }

  function urungkan() {
    if (!S.deck || S_riwayat.sibuk || !S_riwayat.tumpukan.length) {
      KD.toast("Tidak ada perubahan untuk diurungkan.", "info");
      return;
    }
    var sekarang = JSON.stringify(S.deck);
    var state = S_riwayat.tumpukan.pop();
    S_riwayat.depan.push(sekarang);
    segarkanTombolRiwayat();
    terapkanRiwayat(state).then(function (ok) {
      if (ok) KD.toast("Perubahan terakhir diurungkan.", "ok");
    });
  }

  function ulangi() {
    if (!S.deck || S_riwayat.sibuk || !S_riwayat.depan.length) {
      KD.toast("Tidak ada perubahan untuk diulangi.", "info");
      return;
    }
    var sekarang = JSON.stringify(S.deck);
    var state = S_riwayat.depan.pop();
    S_riwayat.tumpukan.push(sekarang);
    segarkanTombolRiwayat();
    terapkanRiwayat(state).then(function (ok) {
      if (ok) KD.toast("Perubahan diulangi.", "ok");
    });
  }

  function simpanDeckBaru(deck, pesan) {
    var tersimpanSebelum = S_riwayat.tersimpan;
    /* Sinyal sinkron dari server bisa tiba sebelum jawaban simpan; selagi
       menunggu, pembaruan papan tidak boleh menghapus riwayat. */
    S_riwayat.simpanMenunggu++;
    return KD.simpanDeck(deck)
      .then(function (hasil) {
        if (hasil && hasil.deck) S.deck = hasil.deck;
        S.online = true;
        /* Keadaan tersimpan sebelumnya menjadi titik urungkan. */
        riwayatDorong(tersimpanSebelum);
        S_riwayat.tersimpan = JSON.stringify(S.deck);
        renderSemua();
        if (window.Kumi) Kumi.sound.play("success");
        if (pesan) KD.toast(pesan, "ok");
        return true;
      })
      .catch(function (galat) {
        tandaiTerputus(galat);
        return false;
      })
      .finally(function () {
        S_riwayat.simpanMenunggu = Math.max(0, S_riwayat.simpanMenunggu - 1);
        segarkanTombolRiwayat();
      });
  }

  function tombolDariEditor() {
    if (!S.editor) return null;
    var label = ($("#editor-label").value || "").trim();
    if (!label) {
      var input = $("#editor-label");
      input.setAttribute("aria-invalid", "true");
      input.focus();
      tampilkanGalatEditor("Nama tombol belum diisi.");
      return null;
    }

    var hasil = bacaAksiDariForm();
    if (hasil.galat) {
      tampilkanGalatEditor(hasil.galat);
      if (window.Kumi) Kumi.sound.play("error");
      return null;
    }
    tampilkanGalatEditor("");

    /* Form hanya menampilkan satu slot; slot lainnya sudah tersimpan di draft
       lewat aksiDraft(). */
    var slotAktif = S.editor.slot;
    var aksiUtama = slotAktif === 0 ? hasil.aksi : S.editor.draft.action || { type: "kosong" };
    var aksiKedua = slotAktif === 1 ? hasil.aksi : S.editor.draft.actionKedua || null;
    if (aksiKedua && aksiKedua.type === "kosong") aksiKedua = null;

    var widget =
      $("#editor-jenis").value === "widget" && slotAktif === 0
        ? S.editor.draft.widget || { type: "jam" }
        : slotAktif === 0
          ? null
          : S.editor.draft.widget || null;

    return {
      id: S.editor.draft.id || "",
      label: label.slice(0, 24),
      icon: S.editor.draft.icon || "i-grid",
      variant: S.editor.draft.variant || "default",
      warna: S.editor.draft.warna || null,
      /* Ukuran tombol (#2.4) dibaca dari chip lebar/tinggi; 1×1 disimpan
         sebagai null supaya JSON tetap ringkas. */
      span: (function () {
        var lebar = Number((($("#editor-ukuran-lebar .kumi-chip.is-active") || {}).dataset || {}).lebar) || 1;
        var tinggi = Number((($("#editor-ukuran-tinggi .kumi-chip.is-active") || {}).dataset || {}).tinggi) || 1;
        var c = Math.max(1, Math.min(6, Math.round(lebar)));
        var r = Math.max(1, Math.min(4, Math.round(tinggi)));
        return c <= 1 && r <= 1 ? null : { c: c, r: r };
      })(),
      widget: widget,
      action: aksiUtama,
      /* Aksi tekan lama hanya berlaku untuk tombol aksi, bukan widget. */
      actionKedua: widget ? null : aksiKedua,
      /* Penanda status: kosongkan seluruhnya bila kedua kolom kosong. */
      tandaiAktif: (function () {
        var proses = (($("#editor-tanda-proses") || {}).value || "").trim().slice(0, 64);
        var jendela = (($("#editor-tanda-jendela") || {}).value || "").trim().slice(0, 80);
        return proses || jendela ? { proses: proses, jendela: jendela } : null;
      })(),
    };
  }

  /* Perluas tombol (#2.4) tanpa menghapus tetangga: tombol yang tertutup
     dipindahkan ke slot kosong terdekat. Kalau ruang tidak cukup, perluasan
     ditolak dan pengguna diberi tahu. Kembalikan null bila ditolak. */
  function terapkanUkuranTombol(halaman, indeks, keyBaru) {
    var sp = KD.spanTombol(keyBaru);
    /* Indeks tombol mengikuti kolom TERSIMPAN, bukan kolom tampilan. */
    var kolom = kolomSimpan();
    var jumlah = halaman.keys.length;
    var kunciBaru = JSON.parse(JSON.stringify(halaman.keys));
    kunciBaru[indeks] = JSON.parse(JSON.stringify(keyBaru));

    /* 1×1: tidak perlu memindahkan apa pun. */
    if (sp.c <= 1 && sp.r <= 1) return { keys: kunciBaru, dipindah: 0 };

    var baris = Math.max(1, Math.ceil(jumlah / kolom));
    var baris0 = Math.floor(indeks / kolom);
    var kolom0 = indeks % kolom;
    var c = Math.min(sp.c, kolom - kolom0);
    var r = Math.min(sp.r, baris - baris0);
    if (c <= 1 && r <= 1) return { keys: kunciBaru, dipindah: 0 };

    kunciBaru[indeks].span = { c: c, r: r };

    /* Kumpulkan tombol yang tertutup petak baru. */
    var tertimpa = [];
    for (var dr = 0; dr < r; dr += 1) {
      for (var dc = 0; dc < c; dc += 1) {
        var j = (baris0 + dr) * kolom + (kolom0 + dc);
        if (j === indeks || j >= jumlah) continue;
        if (kunciBaru[j]) {
          tertimpa.push(j);
          kunciBaru[j] = null;
        }
      }
    }

    if (tertimpa.length) {
      /* Cari slot kosong sejati (tidak tertutup tombol besar lain), baik
         menurut susunan tersimpan maupun susunan yang tampil. */
      var peta = petaSelBebas({ keys: kunciBaru });
      var kosong = [];
      for (var i = 0; i < jumlah; i += 1) {
        if (peta.bebas(i)) kosong.push(i);
      }
      if (kosong.length < tertimpa.length) {
        KD.toast(
          "Ruang tidak cukup untuk memperbesar tombol. Kosongkan satu slot atau pilih ukuran lain.",
          "danger"
        );
        if (window.Kumi) Kumi.sound.play("error");
        return null;
      }
      tertimpa.forEach(function (asal, urut) {
        /* Tombol yang bergeser kembali ke 1x1 supaya petaknya tidak menabrak
           isi slot tujuan yang baru. */
        var pindahan = JSON.parse(JSON.stringify(halaman.keys[asal]));
        if (pindahan) pindahan.span = null;
        kunciBaru[kosong[urut]] = pindahan;
      });
    }

    return { keys: kunciBaru, indeks: indeks, dipindah: tertimpa.length };
  }

  function simpanEditor() {
    if (!S.editor) return;
    var halaman = S.deck.pages.find(function (p) {
      return p.id === S.editor.halamanId;
    });
    if (!halaman) return;

    var keyBaru = tombolDariEditor();
    if (!keyBaru) return;

    var hasil = terapkanUkuranTombol(halaman, S.editor.indeks, keyBaru);
    if (!hasil) return;
    halaman.keys = hasil.keys;
    var pesanSimpan = "Tombol disimpan.";
    if (hasil.dipindah) {
      pesanSimpan =
        "Tombol disimpan. " + hasil.dipindah + " tombol bergeser ke slot kosong.";
    }

    var deck = JSON.parse(JSON.stringify(S.deck));
    var posisi = S.editor;
    tutupModal("modal-editor");
    S.editor = null;

    simpanDeckBaru(deck, pesanSimpan).then(function (ok) {
      if (!ok) return;
      S.suntingSel = { halamanId: posisi.halamanId, indeks: posisi.indeks };
      renderPapan();
    });
  }

  function duplikatTombol() {
    if (!S.editor) return;
    var halaman = S.deck.pages.find(function (p) {
      return p.id === S.editor.halamanId;
    });
    if (!halaman) return;

    var kosong = slotKosongPertama(halaman);
    if (kosong < 0) {
      KD.toast("Tidak ada slot kosong di halaman ini. Hapus atau pindahkan tombol dulu.", "danger");
      if (window.Kumi) Kumi.sound.play("error");
      return;
    }

    var keyBaru = tombolDariEditor();
    if (!keyBaru) return;

    /* Simpan suntingan yang sedang terlihat, lalu salin ke slot kosong. */
    halaman.keys[S.editor.indeks] = keyBaru;
    var salinan = JSON.parse(JSON.stringify(keyBaru));
    salinan.id = "";
    /* Duplikat mulai sebagai tombol 1×1 agar tidak menutupi slot lain. */
    salinan.span = null;
    halaman.keys[kosong] = salinan;

    var deck = JSON.parse(JSON.stringify(S.deck));
    var posisi = { halamanId: S.editor.halamanId, indeks: kosong };
    tutupModal("modal-editor");
    S.editor = null;

    simpanDeckBaru(deck, KD.t("Tombol diduplikasi ke slot ") + (kosong + 1) + ".").then(function (ok) {
      if (!ok) return;
      S.suntingSel = posisi;
      renderPapan();
    });
  }

  function hapusTombol() {
    if (!S.editor) return;
    var halaman = S.deck.pages.find(function (p) {
      return p.id === S.editor.halamanId;
    });
    if (!halaman) return;
    halaman.keys[S.editor.indeks] = null;
    var deck = JSON.parse(JSON.stringify(S.deck));
    tutupModal("modal-editor");
    S.editor = null;
    simpanDeckBaru(deck, "Tombol dihapus.");
  }

  /* -------------------------------------------------------- tambah cepat --- */
  /* Saring entri yang tidak berguna sebagai tombol (pemeliharaan, alat sistem). */
  var APP_ABAIAKAN = /^(reset|uninstall|remove|repair|modify|upgrade|update)\b|verifier|administrative tools|windows tools|readme|help\b|documentation|license/i;

  /* Aplikasi yang paling sering dipakai didahulukan di galeri Tambah cepat. */
  var APP_POPULER = [
    "spotify",
    "chrome",
    "edge",
    "firefox",
    "discord",
    "steam",
    "code",
    "notepad",
    "explorer",
    "calc",
    "paint",
    "terminal",
    "whatsapp",
    "telegram",
    "word",
    "excel",
    "powerpoint",
    "vlc",
    "obs",
    "slack",
    "teams",
    "zoom",
    "photoshop",
    "figma",
  ];

  function saringAplikasi(daftar) {
    return (daftar || []).filter(function (a) {
      return a && a.name && !APP_ABAIAKAN.test(a.name);
    });
  }

  function skorPopuler(nama) {
    var n = String(nama || "").toLowerCase();
    for (var i = 0; i < APP_POPULER.length; i += 1) {
      if (n.indexOf(APP_POPULER[i]) !== -1) return 100 - i;
    }
    return 0;
  }

  function aplikasiUntukCepat() {
    var cari = String(S.cepatCari || "").toLowerCase().trim();
    var hasil = saringAplikasi(S.apps);
    if (cari) {
      hasil = hasil.filter(function (a) {
        return (
          a.name.toLowerCase().indexOf(cari) !== -1 ||
          String(a.target || "").toLowerCase().indexOf(cari) !== -1
        );
      });
    }
    hasil.sort(function (a, b) {
      var selisih = skorPopuler(b.name) - skorPopuler(a.name);
      if (selisih) return selisih;
      return a.name.localeCompare(b.name, "id", { numeric: true, sensitivity: "base" });
    });
    return hasil;
  }

  function bukaCepat() {
    S.cepatCari = "";
    var cari = $("#cepat-cari");
    if (cari) cari.value = "";
    renderCepat();
    bukaModal("modal-cepat");
    if (!S.apps && !S.appsMemuat) muatApps(false);
  }

  /* Saring kartu "Tambah cepat" di tempat tanpa membangun ulang seluruh isi,
     supaya kotak cari tetap fokus dan pengguna tak perlu menggulir jauh.
     Bagian aplikasi punya penyaringnya sendiri (lihat htmlDaftarCepatApp). */
  function saringCepatTampil() {
    var wadah = $("#cepat-isi");
    if (!wadah) return;
    var cari = String(S.cepatCari || "").toLowerCase().trim();
    Array.prototype.forEach.call(wadah.querySelectorAll(".kd-cepat__bagian"), function (bagian) {
      if (bagian.querySelector("#cepat-daftar-app")) return;
      var ada = 0;
      Array.prototype.forEach.call(bagian.querySelectorAll(".kd-cepat__kartu"), function (kartu) {
        var cocok = !cari || (kartu.textContent || "").toLowerCase().indexOf(cari) !== -1;
        kartu.hidden = !cocok;
        if (cocok) ada += 1;
      });
      bagian.hidden = !!cari && ada === 0;
    });
  }

  function htmlKartuCepat(item) {
    return (
      '<button type="button" class="kd-cepat__kartu" data-cepat-tipe="' +
      item.tipe +
      '" data-cepat-nilai="' +
      KD.escapeHtml(item.nilai) +
      '" data-cepat-label="' +
      KD.escapeHtml(item.label) +
      '" data-cepat-ikon="' +
      KD.escapeHtml(item.icon) +
      '"' +
      (item.variant ? ' data-cepat-varian="' + item.variant + '"' : "") +
      ">" +
      '<span class="kd-cepat__ikon">' +
      KD.ikon(item.icon) +
      "</span>" +
      '<span class="kd-cepat__teks"><span class="kd-cepat__nama">' +
      KD.escapeHtml(item.label) +
      "</span><span class=\"kd-cepat__ket\">" +
      KD.escapeHtml(item.ket || "Kontrol media") +
      "</span></span></button>"
    );
  }

  function htmlDaftarCepatApp() {
    if (S.appsMemuat && !S.apps) {
      return '<div class="kd-hint">Memindai aplikasi terpasang…</div>';
    }
    var apps = aplikasiUntukCepat();
    if (!apps.length) {
      return (
        '<div class="kd-hint">' +
        KD.escapeHtml(
          S.appsGalat && !S.apps
            ? S.appsGalat
            : String(S.cepatCari || "").trim()
              ? "Tidak ada aplikasi yang cocok."
              : "Belum ada aplikasi terdeteksi."
        ) +
        "</div>"
      );
    }
    return apps
      .slice(0, 36)
      .map(function (a) {
        return htmlKartuCepat({
          label: a.name,
          icon: a.icon || "i-grid",
          tipe: "buka",
          nilai: a.target,
          ket: a.sumber === "store" ? "Microsoft Store" : "Aplikasi desktop",
        });
      })
      .join("");
  }

  function renderCepat() {
    var wadah = $("#cepat-isi");
    if (!wadah) return;

    var html = "";
    html +=
      '<div class="kd-cepat__bagian"><div class="kd-cepat__kepala"><span class="kumi-label">Media</span></div>' +
      '<div class="kd-cepat__daftar">' +
      CEPAT_MEDIA.map(function (item) {
        return htmlKartuCepat({
          label: item.label,
          icon: item.icon,
          tipe: item.tipe,
          nilai: item.nilai,
          variant: item.variant,
          ket: "Kontrol media",
        });
      }).join("") +
      "</div></div>";

    html +=
      '<div class="kd-cepat__bagian"><div class="kd-cepat__kepala"><span class="kumi-label">Widget (data hidup)</span></div>' +
      '<div class="kd-cepat__daftar">' +
      CEPAT_WIDGET.map(function (item) {
        return htmlKartuCepat(item);
      }).join("") +
      "</div></div>";

    html +=
      '<div class="kd-cepat__bagian"><div class="kd-cepat__kepala"><span class="kumi-label">Sistem</span></div>' +
      '<div class="kd-cepat__daftar">' +
      CEPAT_SISTEM.map(function (item) {
        return htmlKartuCepat(item);
      }).join("") +
      "</div></div>";

    html +=
      '<div class="kd-cepat__bagian"><div class="kd-cepat__kepala"><span class="kumi-label">Aplikasi terpasang</span>' +
      '<button class="kumi-btn kumi-btn--ghost kumi-btn--sm" type="button" data-cepat-ulang>' +
      KD.ikon("i-refresh") +
      " Pindai ulang</button></div>" +
      '<div class="kd-cepat__daftar" id="cepat-daftar-app">' +
      htmlDaftarCepatApp() +
      "</div></div>";

    wadah.innerHTML = html;
    segarkanStatusApps();
    /* Tahan posisi gulir supaya menambah beberapa tombol berturut-turut tidak
       melempar pengguna kembali ke atas, lalu terapkan saringan yang aktif. */
    wadah.scrollTop = Number(S.cepatGulir) || 0;
    saringCepatTampil();
  }

  function tambahCepat(data) {
    if (!S.deck) return;
    var halaman = halamanAktif();
    if (!halaman) return;

    var indeks = slotKosongPertama(halaman);
    if (indeks === -1) {
      KD.toast("Halaman ini penuh. Kosongkan satu slot atau tambah halaman baru.", "danger");
      if (window.Kumi) Kumi.sound.play("error");
      return;
    }

    var aksi;
    var widget = null;
    if (data.tipe === "widget") {
      widget = { type: data.nilai || "jam" };
      aksi = { type: "kosong" };
    } else if (data.tipe === "media") aksi = { type: "media", cmd: data.nilai };
    else if (data.tipe === "hotkey") aksi = { type: "hotkey", combo: data.nilai };
    else if (data.tipe === "jendela") aksi = { type: "jendela", cmd: data.nilai };
    else if (data.tipe === "daya") aksi = { type: "daya", cmd: data.nilai };
    else if (data.tipe === "volume") {
      var potongan = String(data.nilai || "naik").split(":");
      aksi =
        potongan[0] === "set"
          ? { type: "volume", mode: "set", nilai: Number(potongan[1]) || 50 }
          : { type: "volume", mode: potongan[0] };
    } else aksi = { type: "buka", target: data.nilai };

    halaman.keys[indeks] = {
      id: "",
      label: String(data.label || "Tombol").slice(0, 24),
      icon: data.ikon || "i-grid",
      variant: data.varian || (widget ? "dark" : "default"),
      widget: widget,
      action: aksi,
    };

    var simpan = function (ikon) {
      if (ikon) halaman.keys[indeks].icon = ikon;
      var deck = JSON.parse(JSON.stringify(S.deck));
      simpanDeckBaru(deck, "“" + data.label + "” ditambahkan ke slot " + (indeks + 1) + ".").then(
        function (ok) {
          if (ok) renderCepat();
        }
      );
    };

    /* Untuk aplikasi terpasang, coba pakai ikon aslinya dulu. */
    if (data.tipe === "buka" && data.nilai && !/^https?:/i.test(data.nilai)) {
      pakaiIkonAplikasi(data.nilai, data.ikon).then(simpan);
      return;
    }
    simpan(null);
  }

  /* ---------------------------------------------------- ekspor/impor (#3) --- */
  function eksporDeck() {
    if (!S.deck) return;
    fetch("/api/deck/export", { headers: { "x-kumi-token": KD.token || "" } })
      .then(function (res) {
        if (!res.ok) throw new Error("Ekspor gagal (" + res.status + ")");
        return res.blob();
      })
      .then(function (blob) {
        var tautan = document.createElement("a");
        var url = URL.createObjectURL(blob);
        var nama = (S.deck.profile.name || "kumideck")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        tautan.href = url;
        tautan.download = "kumideck-" + nama + ".json";
        document.body.appendChild(tautan);
        tautan.click();
        tautan.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        if (window.Kumi) Kumi.sound.play("success");
        KD.toast("Deck diekspor sebagai berkas JSON.", "ok");
      })
      .catch(function (galat) {
        if (window.Kumi) Kumi.sound.play("error");
        KD.toast("Ekspor gagal: " + galat.message, "danger");
      });
  }

  function imporDeck(berkas) {
    if (berkas.size > 12 * 1024 * 1024) {
      KD.toast("Berkas terlalu besar (maksimal 12 MB).", "danger");
      return;
    }
    var pembaca = new FileReader();
    pembaca.onload = function () {
      var paket;
      try {
        paket = JSON.parse(String(pembaca.result || ""));
      } catch (err) {
        KD.toast("Berkas bukan JSON yang sah.", "danger");
        return;
      }
      if (!paket || (!paket.deck && !paket.pages)) {
        KD.toast("Berkas ini bukan deck KumiDeck.", "danger");
        return;
      }
      bukaKonfirmasiImpor(paket, berkas.name);
    };
    pembaca.onerror = function () {
      KD.toast("Berkas tidak dapat dibaca.", "danger");
    };
    pembaca.readAsText(berkas);
  }

  /* Impor menimpa papan, jadi selalu minta konfirmasi (satu modal). */
  function bukaKonfirmasiImpor(paket, namaBerkas) {
    var lapis = document.createElement("div");
    lapis.className = "kumi-overlay is-open";
    lapis.innerHTML =
      '<div class="kumi-modal" role="dialog" aria-modal="true" aria-labelledby="impor-judul">' +
      '<div class="kumi-modal__head"><div><span class="kumi-label">Impor</span>' +
      '<h2 class="kumi-h3" id="impor-judul">Ganti papan dengan berkas ini?</h2></div>' +
      '<button class="kumi-btn kumi-btn--icon kumi-btn--ghost" type="button" data-batal aria-label="Tutup">' +
      KD.ikon("i-close") +
      "</button></div>" +
      '<p class="kumi-text kumi-text--sm">Berkas <strong>' +
      KD.escapeHtml(namaBerkas) +
      "</strong> berisi papan <strong>" +
      KD.escapeHtml((paket.deck && paket.deck.profile && paket.deck.profile.name) || "tanpa nama") +
      "</strong> dengan " +
      ((paket.deck && paket.deck.pages && paket.deck.pages.length) || (paket.pages || []).length) +
      " halaman. Papan sekarang akan diganti; ekspor dulu bila ingin menyimpannya.</p>" +
      '<div class="kumi-modal__foot"><button class="kumi-btn kumi-btn--ghost" type="button" data-batal>Batal</button>' +
      '<button class="kumi-btn kumi-btn--primary" type="button" data-lanjut>Impor dan ganti</button></div></div>';
    document.body.appendChild(lapis);
    var tutup = function () { lapis.remove(); };
    lapis.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-batal]")) {
        tutup();
        return;
      }
      if (ev.target.closest("[data-lanjut]")) {
        tutup();
        lanjutkanImpor(paket);
      }
    });
    document.addEventListener(
      "keydown",
      function esc(ev) {
        if (ev.key === "Escape") {
          tutup();
          document.removeEventListener("keydown", esc);
        }
      },
      { once: true }
    );
  }

  function lanjutkanImpor(paket) {
    KD.api("/api/deck/import", { method: "POST", body: paket })
      .then(function (hasil) {
        if (!hasil || !hasil.deck) throw new Error("Server tidak mengembalikan papan.");
        S.deck = hasil.deck;
        S.halamanId = hasil.deck.settings.home || (hasil.deck.pages[0] && hasil.deck.pages[0].id);
        S.sunting = false;
        renderSemua();
        terapkanKunci();
        if (window.Kumi) Kumi.sound.play("success");
        KD.toast(
          "Papan diimpor: " + hasil.deck.pages.length + " halaman" +
            (hasil.ikon ? ", " + hasil.ikon + " ikon kustom." : "."),
          "ok"
        );
        muatIkonKustom();
      })
      .catch(function (galat) {
        if (window.Kumi) Kumi.sound.play("error");
        KD.toast(galat.message || "Impor gagal.", "danger");
      });
  }

  /* ------------------------------------------------ ikon kustom (#19) ----- */
  function muatIkonKustom(paksa) {
    if (S.ikonKustom && !paksa) {
      renderPilihanIkon();
      return Promise.resolve(S.ikonKustom);
    }
    return KD.api("/api/icons")
      .then(function (hasil) {
        S.ikonKustom = (hasil && hasil.ikon) || [];
        renderPilihanIkon();
        return S.ikonKustom;
      })
      .catch(function () {
        S.ikonKustom = S.ikonKustom || [];
        renderPilihanIkon();
        return S.ikonKustom;
      });
  }

  var BATAS_IKON_UNGGAH = 512 * 1024;
  var PANGKAS_TAMPIL = 360;
  var PANGKAS_KELUARAN = 256;

  /* Kirim data URL ikon (hasil pangkasan) ke server. */
  function kirimIkonData(dataUrl) {
    var status = $("#editor-ikon-hint");
    if (status) status.textContent = "Mengunggah ikon…";
    return KD.api("/api/icons", { method: "POST", body: { dataUrl: String(dataUrl || "") } })
      .then(function (hasil) {
        if (!hasil || !hasil.id) throw new Error("Ikon tidak tersimpan.");
        S.ikonKustom = hasil.ikon || [];
        if (!S.ikonKustom.some(function (i) { return i.id === hasil.id; })) {
          S.ikonKustom.unshift({ id: hasil.id, url: "/ikon/" + hasil.id });
        }
        if (S.editor) S.editor.draft.icon = hasil.id;
        renderPilihanIkon();
        tandaiIkonTerpilih();
        if (status) {
          status.textContent = "Ikon tersimpan: " + hasil.id.replace("kst_", "") + ". Terpilih otomatis.";
        }
        if (window.Kumi) Kumi.sound.play("success");
        KD.toast("Ikon diunggah dan dipilih.", "ok");
      })
      .catch(function (galat) {
        if (status) status.textContent = "Unggah gagal.";
        if (window.Kumi) Kumi.sound.play("error");
        KD.toast(galat.message || "Ikon gagal diunggah.", "danger");
      });
  }

  /* Buka pemangkas persegi: geser gambar + atur perbesaran (D9). */
  function mulaiPangkas(berkas) {
    if (!berkas) return;
    var tipe = String(berkas.type || "").toLowerCase();
    var ekstensi = String(berkas.name || "").toLowerCase().split(".").pop();
    var gambarSah =
      tipe.indexOf("image/") === 0 ||
      ["svg", "png", "webp", "jpg", "jpeg", "gif", "bmp"].indexOf(ekstensi) !== -1;
    if (!gambarSah) {
      KD.toast("Pilih berkas gambar.", "danger");
      return;
    }
    if (berkas.size > 10 * 1024 * 1024) {
      KD.toast("Berkas gambar maksimal 10 MB.", "danger");
      return;
    }

    var pembaca = new FileReader();
    pembaca.onload = function () {
      var gambar = new Image();
      gambar.onload = function () {
        S.pangkas = {
          gambar: gambar,
          nama: berkas.name || "ikon",
          skala: 1,
          dasar: Math.max(PANGKAS_TAMPIL / gambar.width, PANGKAS_TAMPIL / gambar.height),
          x: 0,
          y: 0,
          seret: false,
          mulaiX: 0,
          mulaiY: 0,
          awalX: 0,
          awalY: 0,
        };
        var zoom = $("#pangkas-zoom");
        if (zoom) zoom.value = "100";
        bukaModal("modal-ikon");
        gambarPangkas();
      };
      gambar.onerror = function () {
        KD.toast("Gambar tidak dapat dibaca.", "danger");
      };
      gambar.src = String(pembaca.result || "");
    };
    pembaca.onerror = function () {
      KD.toast("Berkas tidak dapat dibaca.", "danger");
    };
    pembaca.readAsDataURL(berkas);
  }

  /* Batasi geseran agar gambar selalu menutup seluruh kotak. */
  function batasiPangkas() {
    var p = S.pangkas;
    if (!p) return;
    var total = p.dasar * p.skala;
    var maksX = Math.max(0, (p.gambar.width * total - PANGKAS_TAMPIL) / 2);
    var maksY = Math.max(0, (p.gambar.height * total - PANGKAS_TAMPIL) / 2);
    p.x = Math.max(-maksX, Math.min(maksX, p.x));
    p.y = Math.max(-maksY, Math.min(maksY, p.y));
  }

  function gambarPangkas() {
    var p = S.pangkas;
    var kanvas = $("#pangkas-kanvas");
    if (!p || !kanvas) return;
    var ctx = kanvas.getContext("2d");
    if (!ctx) return;
    var total = p.dasar * p.skala;
    var lebar = p.gambar.width * total;
    var tinggi = p.gambar.height * total;
    var x = (kanvas.width - lebar) / 2 + p.x;
    var y = (kanvas.height - tinggi) / 2 + p.y;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, kanvas.width, kanvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(p.gambar, x, y, lebar, tinggi);
  }

  /* Hasil pangkas 256x256 PNG; ukurannya jauh di bawah batas 512 KB. */
  function simpanPangkas() {
    var p = S.pangkas;
    if (!p) return;
    var keluaran = document.createElement("canvas");
    keluaran.width = PANGKAS_KELUARAN;
    keluaran.height = PANGKAS_KELUARAN;
    var ctx = keluaran.getContext("2d");
    if (!ctx) return;
    var rasio = PANGKAS_KELUARAN / PANGKAS_TAMPIL;
    var total = p.dasar * p.skala * rasio;
    var lebar = p.gambar.width * total;
    var tinggi = p.gambar.height * total;
    var x = (PANGKAS_KELUARAN - lebar) / 2 + p.x * rasio;
    var y = (PANGKAS_KELUARAN - tinggi) / 2 + p.y * rasio;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(p.gambar, x, y, lebar, tinggi);

    var dataUrl = keluaran.toDataURL("image/png");
    var ukuran = Math.ceil((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
    if (ukuran > BATAS_IKON_UNGGAH) {
      KD.toast("Hasil pangkas masih di atas 512 KB. Perkecil dulu gambarnya.", "danger");
      return;
    }

    tutupModal("modal-ikon");
    S.pangkas = null;
    kirimIkonData(dataUrl);
  }

  /* --------------------------------------------- ikon aplikasi asli (#2) --- */
  /* Minta server mengekstrak ikon .exe aplikasi lalu pakai sebagai ikon tombol.
     Bila gagal, ikon bawaan dari pemindai aplikasi tetap dipakai. */
  function pakaiIkonAplikasi(target, ikonBawaan) {
    if (!target) return Promise.resolve(ikonBawaan || "i-grid");
    return KD.api("/api/appicon?target=" + encodeURIComponent(target))
      .then(function (hasil) {
        if (hasil && hasil.ok && hasil.id) return hasil.id;
        return ikonBawaan || "i-grid";
      })
      .catch(function () {
        return ikonBawaan || "i-grid";
      });
  }

  /* -------------------------------------------------- soundboard (#3-5) --- */
  function daftarSuara() {
    return (S.deck && Array.isArray(S.deck.soundboard)) ? S.deck.soundboard : [];
  }

  /* Tautan soundboard diunduh dulu ke data/suara/tautan oleh server (laju
     dibatasi). Status cache-nya ditanyakan supaya UI bisa menampilkan
     persentase pra-unduh, bukan diam saja saat ketukan pertama. */
  var unduhTimer = 0;

  function statusUnduh(sumber) {
    return (S.unduhan && S.unduhan[sumber]) || null;
  }

  function masihMengunduh() {
    return daftarSuara().some(function (item) {
      var u = statusUnduh(item.sumber);
      return !!u && u.status === "mengunduh";
    });
  }

  function teksStatusUnduh(item) {
    if (item.jenis !== "url") return "";
    var u = statusUnduh(item.sumber);
    if (!u) return "";
    if (u.status === "mengunduh") {
      return " · " + (u.persen >= 0 ? KD.t("Mengunduh") + " " + u.persen + "%" : KD.t("Mengunduh…"));
    }
    if (u.status === "gagal") return " · " + KD.t("Unduhan gagal");
    if (u.status === "belum") return " · " + KD.t("Belum diunduh");
    return " · " + KD.t("Siap diputar");
  }

  function jadwalkanUnduhan() {
    if (unduhTimer) return;
    unduhTimer = window.setTimeout(function () {
      unduhTimer = 0;
      muatUnduhan();
    }, 800);
  }

  function muatUnduhan() {
    if (!S.deck) return Promise.resolve();
    return KD.api("/api/audio/unduhan")
      .then(function (hasil) {
        var peta = {};
        ((hasil && hasil.unduhan) || []).forEach(function (u) {
          if (u && u.sumber) peta[u.sumber] = u;
        });
        S.unduhan = peta;
        renderSoundboard();
        if (masihMengunduh()) jadwalkanUnduhan();
      })
      .catch(function () {
        /* status unduhan hanya pelengkap: diamkan bila gagal */
      });
  }

  function renderSoundboard() {
    var daftar = $("#suara-daftar");
    var kosong = $("#suara-kosong");
    if (!daftar) return;
    var suara = daftarSuara();
    daftar.innerHTML = "";
    kosong.hidden = suara.length > 0;
    daftar.hidden = suara.length === 0;

    suara.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "kd-suara-item";

      var main = document.createElement("button");
      main.type = "button";
      main.className = "kd-suara-item__main";
      main.setAttribute("aria-label", "Putar " + item.name);
      main.innerHTML =
        '<span class="kd-suara-item__ikon" aria-hidden="true">' + KD.ikon(item.jenis === "url" ? "i-link" : "i-play") + "</span>" +
        '<span class="kd-suara-item__teks"><span class="kd-suara-item__nama">' + KD.escapeHtml(item.name) + "</span>" +
        '<span class="kd-suara-item__meta">' +
        (item.jenis === "url" ? "Tautan" : "Berkas") +
        " · volume " + item.volume + "%" +
        teksStatusUnduh(item) +
        "</span></span>";
      main.addEventListener("click", function () {
        mainkanSuara(item.id);
      });

      var sunting = document.createElement("button");
      sunting.type = "button";
      sunting.className = "kumi-btn kumi-btn--ghost kumi-btn--icon";
      sunting.setAttribute("aria-label", "Sunting " + item.name);
      sunting.innerHTML = KD.ikon("i-pencil");
      sunting.addEventListener("click", function () {
        isiFormSuara(item);
      });

      var hapus = document.createElement("button");
      hapus.type = "button";
      hapus.className = "kumi-btn kumi-btn--ghost kumi-btn--icon kd-tombol-hapus";
      hapus.setAttribute("aria-label", "Hapus " + item.name);
      hapus.innerHTML = KD.ikon("i-trash");
      hapus.addEventListener("click", function () {
        hapusSuara(item);
      });

      li.appendChild(main);
      li.appendChild(sunting);
      li.appendChild(hapus);
      daftar.appendChild(li);
    });
  }

  function mainkanSuara(id) {
    KD.api("/api/audio/mainkan", { method: "POST", body: { id: id } })
      .then(function (hasil) {
        if (hasil && hasil.ok) {
          KD.toast(hasil.pesan || "Memutar suara.", "ok");
        } else {
          if (window.Kumi) Kumi.sound.play("error");
          KD.toast((hasil && hasil.pesan) || "Suara tidak dapat diputar.", "danger");
        }
      })
      .catch(function (galat) {
        if (window.Kumi) Kumi.sound.play("error");
        KD.toast(galat.message || "Pemutar suara tidak tersedia.", "danger");
      });
  }

  function hentikanSuara() {
    KD.api("/api/audio/hentikan", { method: "POST" })
      .then(function () {
        KD.toast("Pemutaran dihentikan.", "ok");
      })
      .catch(function () {
        KD.toast("Tidak ada pemutaran.", "danger");
      });
  }

  /* Form tambah suara dilipat supaya daftar suara langsung terlihat dan
     halaman Soundboard tidak perlu digulir hanya untuk menambah satu suara. */
  function aturFormSuara(buka) {
    var form = $("#form-suara");
    var btn = $("#btn-suara-buka");
    if (!form) return;
    form.hidden = !buka;
    if (btn) {
      btn.setAttribute("aria-expanded", buka ? "true" : "false");
      var label = $("#btn-suara-buka-label");
      if (label) label.textContent = KD.t(buka ? "Tutup form" : "Tambah suara");
    }
    if (buka) {
      var nama = $("#suara-nama");
      if (nama) nama.focus();
    }
  }

  function isiFormSuara(item) {
    S.suaraSunting = item ? item.id : "";
    $("#suara-nama").value = item ? item.name : "";
    $("#suara-sumber").value = item ? item.sumber : "";
    $("#suara-volume").value = String(item ? item.volume : 100);
    $("#suara-volume-nilai").textContent = (item ? item.volume : 100) + "%";
    var tombol = $("#btn-suara-simpan");
    if (tombol) {
      tombol.innerHTML =
        KD.ikon(item ? "i-check" : "i-plus") +
        " " +
        KD.t(item ? "Simpan perubahan" : "Tambah suara");
    }
    $("#suara-status").textContent = item ? KD.t("Menyunting “" + item.name + "”.") : "";
    if (item) aturFormSuara(true);
  }

  function simpanSuara(ev) {
    if (ev) ev.preventDefault();
    if (!S.deck) return;
    var nama = $("#suara-nama").value.trim() || "Suara";
    var sumber = $("#suara-sumber").value.trim();
    if (!sumber) {
      KD.toast("Isi berkas atau tautan suara dulu.", "danger");
      return;
    }
    /* 0 adalah volume yang sah: jangan pakai "|| 100". */
    var nilaiVolume = Number($("#suara-volume").value);
    var item = {
      id: S.suaraSunting || "",
      name: nama.slice(0, 32),
      sumber: sumber,
      volume: isNaN(nilaiVolume) ? 100 : Math.max(0, Math.min(100, Math.round(nilaiVolume))),
    };
    KD.api("/api/soundboard/simpan", { method: "POST", body: { item: item } })
      .then(function (hasil) {
        if (S.deck && hasil && hasil.soundboard) S.deck.soundboard = hasil.soundboard;
        renderSoundboard();
        isiFormSuara(null);
        aturFormSuara(false);
        $("#suara-status").textContent = "Suara disimpan.";
        if (window.Kumi) Kumi.sound.play("success");
        /* Tautan mulai diunduh di latar oleh server; tampilkan progresnya. */
        muatUnduhan();
        KD.toast(
          KD.t(item.sumber.indexOf("http") === 0 ? "Suara disimpan. Tautan diunduh di latar." : "Suara disimpan."),
          "ok"
        );
      })
      .catch(function (galat) {
        if (window.Kumi) Kumi.sound.play("error");
        KD.toast(galat.message || "Suara tidak dapat disimpan.", "danger");
      });
  }

  function hapusSuara(item) {
    KD.api("/api/soundboard/hapus", { method: "POST", body: { id: item.id } })
      .then(function (hasil) {
        if (S.deck && hasil && hasil.soundboard) S.deck.soundboard = hasil.soundboard;
        renderSoundboard();
        /* Server juga membuang cache tautannya; segarkan peta status. */
        muatUnduhan();
        if (window.Kumi) Kumi.sound.play("success");
        KD.toast("Suara “" + item.name + "” dihapus.", "ok");
      })
      .catch(function (galat) {
        KD.toast(galat.message || "Suara tidak dapat dihapus.", "danger");
      });
  }

  function unggahBerkasSuara(berkas) {
    if (!berkas) return;
    if (berkas.size > 25 * 1024 * 1024) {
      KD.toast("Berkas suara maksimal 25 MB.", "danger");
      return;
    }
    $("#suara-status").textContent = "Menyiapkan " + berkas.name + "…";
    var pembaca = new FileReader();
    pembaca.onload = function () {
      KD.api("/api/suara/unggah", {
        method: "POST",
        body: { nama: berkas.name, dataUrl: String(pembaca.result || "") },
      })
        .then(function (hasil) {
          if (!hasil || !hasil.ok) throw new Error((hasil && hasil.message) || "Berkas suara gagal disimpan.");
          $("#suara-sumber").value = hasil.sumber;
          if (!$("#suara-nama").value.trim()) {
            $("#suara-nama").value = String(berkas.name || "Suara").replace(/\.[^.]+$/, "").slice(0, 32);
          }
          $("#suara-status").textContent = "Berkas siap. Tekan Simpan.";
          KD.toast("Berkas suara siap dipakai.", "ok");
        })
        .catch(function (galat) {
          $("#suara-status").textContent = "Unggah gagal.";
          KD.toast(galat.message || "Berkas suara gagal disimpan.", "danger");
        });
    };
    pembaca.readAsDataURL(berkas);
  }

  function bukaSoundboard() {
    renderSoundboard();
    isiFormSuara(null);
    aturFormSuara(false);
    bukaModal("modal-suara");
    muatUnduhan();
  }

  /* -------------------------------------------------- editor: ikon kustom --- */
  function renderKelolaHalaman() {
    var daftar = $("#daftar-halaman-kelola");
    daftar.innerHTML = "";
    if (!S.deck) return;

    S.deck.pages.forEach(function (h) {
      var li = document.createElement("li");
      li.className = "kumi-list__item";

      var baris = document.createElement("div");
      baris.className = "kd-halaman-baris";

      var input = document.createElement("input");
      input.className = "kumi-input";
      input.type = "text";
      input.value = h.name;
      input.maxLength = 24;
      input.setAttribute("aria-label", "Nama halaman " + h.name);
      input.addEventListener("change", function () {
        var nama = input.value.trim() || h.name;
        h.name = nama.slice(0, 24);
        simpanDeckBaru(JSON.parse(JSON.stringify(S.deck)), "Nama halaman diperbarui.");
      });

      var lencana = document.createElement("span");
      if (S.deck.settings.home === h.id) {
        lencana.className = "kumi-badge kumi-badge--ok";
        lencana.textContent = "Awal";
      }

      var jadikanAwal = document.createElement("button");
      jadikanAwal.type = "button";
      jadikanAwal.className = "kumi-btn kumi-btn--ghost kumi-btn--sm";
      jadikanAwal.textContent = "Jadikan awal";
      jadikanAwal.disabled = S.deck.settings.home === h.id;
      jadikanAwal.addEventListener("click", function () {
        S.deck.settings.home = h.id;
        simpanDeckBaru(JSON.parse(JSON.stringify(S.deck)), "Halaman awal diperbarui.");
      });

      var hapus = document.createElement("button");
      hapus.type = "button";
      hapus.className = "kumi-btn kumi-btn--ghost kumi-btn--sm";
      hapus.textContent = "Hapus";
      hapus.disabled = S.deck.pages.length <= 1;
      if (hapus.disabled) hapus.title = "Papan harus punya minimal satu halaman.";
      hapus.addEventListener("click", function () {
        if (S.deck.pages.length <= 1) return;
        S.deck.pages = S.deck.pages.filter(function (p) {
          return p.id !== h.id;
        });
        if (S.deck.settings.home === h.id) {
          S.deck.settings.home = S.deck.pages[0].id;
        }
        if (S.halamanId === h.id) {
          S.halamanId = S.deck.settings.home;
        }
        simpanDeckBaru(JSON.parse(JSON.stringify(S.deck)), "Halaman dihapus.").then(function () {
          renderKelolaHalaman();
        });
      });

      var duplikat = document.createElement("button");
      duplikat.type = "button";
      duplikat.className = "kumi-btn kumi-btn--ghost kumi-btn--sm";
      duplikat.textContent = "Duplikat";
      duplikat.disabled = S.deck.pages.length >= 12;
      if (duplikat.disabled) duplikat.title = "Maksimal 12 halaman.";
      duplikat.addEventListener("click", function () {
        if (S.deck.pages.length >= 12) {
          KD.toast("Maksimal 12 halaman.", "danger");
          return;
        }
        var salinan = JSON.parse(JSON.stringify(h));
        salinan.id = "";
        salinan.name = (h.name + " salinan").slice(0, 24);
        salinan.keys = salinan.keys.map(function (k) {
          if (!k) return null;
          k.id = "";
          return k;
        });
        var posisi = S.deck.pages.indexOf(h);
        S.deck.pages.splice(posisi + 1, 0, salinan);
        simpanDeckBaru(JSON.parse(JSON.stringify(S.deck)), "Halaman diduplikasi.").then(function () {
          renderKelolaHalaman();
        });
      });

      var skala = document.createElement("select");
      skala.className = "kumi-select kd-halaman-skala";
      skala.setAttribute("aria-label", "Skala tombol halaman " + h.name);
      [100, 110, 120, 130, 140].forEach(function (n) {
        var opt = document.createElement("option");
        opt.value = String(n);
        opt.textContent = n + "%";
        if ((h.skala || 100) === n) opt.selected = true;
        skala.appendChild(opt);
      });
      skala.addEventListener("change", function () {
        h.skala = Number(skala.value) || 100;
        simpanDeckBaru(JSON.parse(JSON.stringify(S.deck)), "Skala halaman diperbarui.");
      });

      /* Warna latar halaman (D8); kosong = latar bawaan. */
      var warna = document.createElement("input");
      warna.type = "color";
      warna.className = "kd-warna";
      warna.value = h.warna || "#3d5afe";
      warna.setAttribute("aria-label", KD.t("Warna latar halaman") + " " + h.name);
      warna.addEventListener("change", function () {
        h.warna = String(warna.value || "").toLowerCase();
        simpanDeckBaru(JSON.parse(JSON.stringify(S.deck)), "Latar halaman diperbarui.");
      });

      var hapusWarna = document.createElement("button");
      hapusWarna.type = "button";
      hapusWarna.className = "kumi-btn kumi-btn--ghost kumi-btn--sm";
      hapusWarna.textContent = "Hapus warna";
      hapusWarna.disabled = !h.warna;
      if (hapusWarna.disabled) hapusWarna.title = "Halaman ini memakai latar bawaan.";
      hapusWarna.addEventListener("click", function () {
        h.warna = "";
        simpanDeckBaru(JSON.parse(JSON.stringify(S.deck)), "Latar halaman dihapus.").then(function () {
          renderKelolaHalaman();
        });
      });

      baris.appendChild(input);
      if (lencana.className) baris.appendChild(lencana);
      baris.appendChild(skala);
      baris.appendChild(warna);
      baris.appendChild(hapusWarna);
      baris.appendChild(duplikat);
      baris.appendChild(jadikanAwal);
      baris.appendChild(hapus);
      li.appendChild(baris);
      daftar.appendChild(li);
    });
  }

  function tambahHalaman(nama) {
    if (!S.deck) return;
    if (S.deck.pages.length >= 12) {
      KD.toast("Maksimal 12 halaman.", "danger");
      return;
    }
    var jumlah = S.deck.profile.columns * S.deck.profile.rows;
    var keys = new Array(jumlah).fill(null);
    var halaman = {
      id: "",
      name: (nama || "Halaman baru").slice(0, 24),
      keys: keys,
    };
    S.deck.pages.push(halaman);
    simpanDeckBaru(JSON.parse(JSON.stringify(S.deck)), "Halaman ditambahkan.").then(function () {
      renderKelolaHalaman();
    });
  }

  /* ------------------------------------------------------------- templat --- */
  /* Templat bawaan: mengisi papan dengan tombol siap pakai. Semua tombol
     memakai aksi yang sudah dikenal server, jadi tidak ada perintah khusus. */
  var TEMPLAT = [
    {
      id: "streaming",
      nama: "Streaming",
      ket: "Kontrol siaran: mikrofon, kamera, adegan, dan suara.",
      ikon: "i-play",
      halaman: [
        {
          nama: "Siaran",
          keys: [
            ["Mikrofon", "i-volume", { type: "mic", cmd: "togel" }, "accent"],
            ["Senyapkan", "i-volume-off", { type: "volume", mode: "mute" }],
            ["Volume Naik", "i-volume", { type: "media", cmd: "volup" }],
            ["Volume Turun", "i-volume-off", { type: "media", cmd: "voldown" }],
            ["Jeda Siaran", "i-play", { type: "hotkey", combo: "ctrl+shift+p" }],
          ],
        },
        {
          nama: "Aplikasi",
          keys: [
            ["OBS", "i-eye", { type: "buka", target: "obs64.exe" }],
            ["Chrome", "i-globe", { type: "buka", target: "chrome" }],
            ["Spotify", "i-play", { type: "buka", target: "spotify" }],
            ["Catatan", "i-file", { type: "buka", target: "notepad" }],
            ["Jeda Musik", "i-play", { type: "media", cmd: "playpause" }, "accent"],
          ],
        },
      ],
    },
    {
      id: "ngoding",
      nama: "Ngoding",
      ket: "Buka editor, terminal, dan pintasan build dalam satu ketukan.",
      ikon: "i-bolt",
      halaman: [
        {
          nama: "Alat",
          keys: [
            ["Terminal", "i-code", { type: "buka", target: "wt.exe" }, "accent"],
            ["Editor", "i-code", { type: "buka", target: "code" }],
            ["Explorer", "i-folder", { type: "buka", target: "explorer.exe" }],
            ["Browser", "i-globe", { type: "buka", target: "chrome" }],
            ["Sakelar", "i-grid", { type: "jendela", cmd: "minimize" }],
          ],
        },
        {
          nama: "Pintasan",
          keys: [
            ["Simpan", "i-check", { type: "hotkey", combo: "ctrl+s" }],
            ["Build", "i-bolt", { type: "hotkey", combo: "ctrl+shift+b" }, "accent"],
            ["Terminal", "i-code", { type: "hotkey", combo: "ctrl+grave" }],
            ["Cari Berkas", "i-search", { type: "hotkey", combo: "ctrl+p" }],
            ["Format", "i-bolt", { type: "hotkey", combo: "shift+alt+f" }],
          ],
        },
      ],
    },
    {
      id: "media",
      nama: "Media",
      ket: "Pemutar musik dan video: putar, lompat, volume.",
      ikon: "i-play",
      halaman: [
        {
          nama: "Pemutar",
          keys: [
            ["Putar / Jeda", "i-play", { type: "media", cmd: "playpause" }, "accent"],
            ["Sebelumnya", "i-arrow-left", { type: "media", cmd: "prev" }],
            ["Berikutnya", "i-arrow-right", { type: "media", cmd: "next" }],
            ["Volume Naik", "i-volume", { type: "media", cmd: "volup" }],
            ["Volume Turun", "i-volume-off", { type: "media", cmd: "voldown" }],
          ],
        },
        {
          nama: "Aplikasi",
          keys: [
            ["Spotify", "i-play", { type: "buka", target: "spotify" }],
            ["YouTube", "i-globe", { type: "buka", target: "https://www.youtube.com" }],
            ["VLC", "i-play", { type: "buka", target: "vlc" }],
            ["Jam", "i-clock", { type: "widget" }],
          ],
        },
      ],
    },
    {
      id: "kerja",
      nama: "Kerja",
      ket: "Rapat, surel, dan dokumen untuk meja kantor.",
      ikon: "i-inbox",
      halaman: [
        {
          nama: "Harian",
          keys: [
            ["Rapat", "i-eye", { type: "buka", target: "https://meet.google.com" }, "accent"],
            ["Surel", "i-mail", { type: "buka", target: "https://mail.google.com" }],
            ["Kalender", "i-calendar", { type: "buka", target: "https://calendar.google.com" }],
            ["Dokumen", "i-file", { type: "buka", target: "winword" }],
            ["Spreadsheet", "i-grid", { type: "buka", target: "excel" }],
          ],
        },
        {
          nama: "Kontrol",
          keys: [
            ["Senyapkan", "i-volume-off", { type: "volume", mode: "mute" }],
            ["Mikrofon", "i-volume", { type: "mic", cmd: "togel" }],
            ["Tangkapan Layar", "i-image", { type: "hotkey", combo: "win+shift+s" }],
            ["Kunci PC", "i-lock", { type: "hotkey", combo: "win+l" }],
          ],
        },
      ],
    },
  ];

  function tombolTemplat(baris) {
    var label = baris[0];
    return {
      label: label.slice(0, 24),
      icon: baris[1] || "i-grid",
      action: baris[2] || { type: "kosong" },
      variant: baris[3] || "default",
    };
  }

  function renderTemplat() {
    var wadah = $("#templat-daftar");
    if (!wadah) return;
    wadah.innerHTML = "";
    TEMPLAT.forEach(function (t) {
      var kartu = document.createElement("button");
      kartu.type = "button";
      kartu.className = "kd-templat-kartu";
      kartu.setAttribute("data-templat", t.id);
      var jumlahTombol = t.halaman.reduce(function (n, h) {
        return n + h.keys.length;
      }, 0);
      kartu.innerHTML =
        '<span class="kd-templat-kartu__ikon">' +
        KD.ikon(t.ikon) +
        "</span>" +
        '<span class="kd-templat-kartu__teks">' +
        '<span class="kd-templat-kartu__nama">' +
        KD.escapeHtml(KD.t(t.nama)) +
        "</span>" +
        '<span class="kd-templat-kartu__ket">' +
        KD.escapeHtml(KD.t(t.ket)) +
        "</span>" +
        '<span class="kd-templat-kartu__meta">' +
        KD.t(t.halaman.length + " halaman · " + jumlahTombol + " tombol") +
        "</span></span>";
      wadah.appendChild(kartu);
    });
  }

  function pakaiTemplat(id) {
    var t = TEMPLAT.filter(function (x) {
      return x.id === id;
    })[0];
    if (!t || !S.deck) return;
    var jumlah = S.deck.profile.columns * S.deck.profile.rows;
    var pages = t.halaman.map(function (h, indeks) {
      var keys = h.keys.map(tombolTemplat);
      while (keys.length < jumlah) keys.push(null);
      return { id: "", name: h.nama, keys: keys.slice(0, jumlah) };
    });

    var deck = JSON.parse(JSON.stringify(S.deck));
    deck.pages = pages;
    deck.profile = { name: t.nama, columns: 5, rows: 3 };
    deck.settings = Object.assign({}, deck.settings, { home: "" });
    deck.soundboard = deck.soundboard || [];

    tutupModal("modal-templat");
    simpanDeckBaru(deck, "Templat " + KD.t(t.nama) + " dimuat.").then(function (ok) {
      if (!ok) return;
      S.halamanId = S.deck.pages[0] ? S.deck.pages[0].id : "";
      simpanLokal("kumideck-halaman", S.halamanId);
      renderSemua();
      if (window.Kumi) Kumi.sound.play("success");
    });
  }

  /* ------------------------------------------------------------- setelan --- */
  /* Daftar perangkat terpasang + tombol "Lupakan" (token per perangkat). */
  function renderPerangkatSetelan() {
    var wadah = $("#daftar-perangkat-setelan");
    if (!wadah) return;
    wadah.innerHTML = "";
    var daftar = (S.perangkat || []).filter(function (p) {
      /* Bagian ini khusus Remote yang dipasangkan; entri desktop otomatis
         tidak perlu ditampilkan. */
      return p.platform === "android";
    });
    if (!daftar.length) {
      var kosong = document.createElement("div");
      kosong.className = "kd-hint";
      kosong.textContent = "Belum ada perangkat Remote yang terpasang.";
      wadah.appendChild(kosong);
      return;
    }
    daftar.forEach(function (p) {
      var baris = document.createElement("div");
      baris.className = "kd-perangkat-baris";

      var info = document.createElement("div");
      info.className = "kd-perangkat-baris__info";
      var nama = document.createElement("span");
      nama.className = "kumi-text kumi-text--strong";
      nama.textContent = p.name || "Perangkat";
      var ket = document.createElement("span");
      ket.className = "kd-hint";
      ket.textContent =
        (p.platform === "android" ? "Remote" : "Desktop") +
        " · " +
        (p.dicabut ? "dilupakan" : p.lastSeen ? KD.relatif(p.lastSeen) : "belum tersambung");
      info.appendChild(nama);
      info.appendChild(document.createElement("br"));
      info.appendChild(ket);

      var hapus = document.createElement("button");
      hapus.type = "button";
      hapus.className = "kumi-btn kumi-btn--ghost kumi-btn--sm kd-tombol-hapus";
      hapus.textContent = p.dicabut ? "Sudah dilupakan" : "Lupakan";
      hapus.disabled = !!p.dicabut;
      hapus.addEventListener("click", function () {
        if (
          !window.confirm(
            "Lupakan perangkat " + (p.name || "") + "? Ponsel itu harus memasang ulang dengan kode baru."
          )
        ) {
          return;
        }
        KD.cabutPerangkat(p.id)
          .then(function () {
            KD.toast("Perangkat dilupakan.", "ok");
            return muatState();
          })
          .then(function () {
            renderPerangkatSetelan();
          })
          .catch(tandaiTerputus);
      });

      baris.appendChild(info);
      baris.appendChild(hapus);
      wadah.appendChild(baris);
    });
  }

  /* Cek pembaruan lewat rilis GitHub (repo publik, tanpa token). */
  var REPO_RILIS = "https://api.github.com/repos/Owladi-Ex/KumiDeck/releases/latest";

  function bandingVersi(a, b) {
    var pa = String(a || "").split(".").map(Number);
    var pb = String(b || "").split(".").map(Number);
    for (var i = 0; i < 3; i += 1) {
      var x = pa[i] || 0;
      var y = pb[i] || 0;
      if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
  }

  function cekPembaruan() {
    var info = $("#info-versi");
    var btn = $("#btn-cek-pembaruan");
    var versiKini = (S.papanServer && S.papanServer.versi) || "";
    if (info) info.textContent = KD.t("Memeriksa rilis terbaru...");
    if (btn) btn.disabled = true;
    var tautanLama = $(".kd-tautan-rilis");
    if (tautanLama) tautanLama.remove();

    fetch(REPO_RILIS, { headers: { Accept: "application/vnd.github+json" } })
      .then(function (res) {
        if (res.status === 404) {
          var galatRilis = new Error("belum-ada-rilis");
          galatRilis.code = "belum-ada-rilis";
          throw galatRilis;
        }
        if (!res.ok) throw new Error("GitHub menjawab " + res.status + ".");
        return res.json();
      })
      .then(function (data) {
        var tag = String((data && data.tag_name) || "").replace(/^v/i, "");
        var url = (data && data.html_url) || "https://github.com/Owladi-Ex/KumiDeck/releases/latest";
        if (!tag) {
          if (info) info.textContent = KD.t("Rilis terbaru tidak menyebut versi.");
          return;
        }
        var beda = bandingVersi(tag, versiKini);
        if (info) {
          info.textContent =
            KD.t("Terpasang") + " " + (versiKini || "?") + " · " + KD.t("terbaru") + " " + tag +
            (beda > 0 ? KD.t(" — pembaruan tersedia.") : KD.t(" — sudah terbaru."));
        }
        if (beda > 0) {
          var tautan = document.createElement("a");
          tautan.href = url;
          tautan.target = "_blank";
          tautan.rel = "noopener noreferrer";
          tautan.className = "kumi-btn kumi-btn--soft kumi-btn--sm kd-tautan-rilis";
          tautan.textContent = KD.t("Buka halaman rilis");
          tautan.style.marginTop = "8px";
          if (info && info.parentNode) info.parentNode.appendChild(tautan);
        }
      })
      .catch(function (galat) {
        if (info) {
          info.textContent =
            galat && galat.code === "belum-ada-rilis"
              ? KD.t("Belum ada rilis publik di GitHub.")
              : KD.t("Tidak dapat memeriksa pembaruan. Periksa koneksi internet.");
        }
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  }

  function isiFormSetelan() {
    if (!S.deck) return;
    var pilihBahasa = $("#pilih-bahasa");
    if (pilihBahasa) pilihBahasa.value = KD.bahasa;
    $("#setelan-nama").value = S.deck.profile.name;
    $("#setelan-kolom").value = String(S.deck.profile.columns);
    $("#setelan-baris").value = String(S.deck.profile.rows);
    var pilih = $("#setelan-awal");
    pilih.innerHTML = "";
    S.deck.pages.forEach(function (h) {
      var opt = document.createElement("option");
      opt.value = h.id;
      opt.textContent = h.name;
      if (h.id === S.deck.settings.home) opt.selected = true;
      pilih.appendChild(opt);
    });
    S.contohTahap = 0;
    var btn = $("#btn-contoh-ulang");
    btn.textContent = "Muat contoh";
    btn.innerHTML = KD.ikon("i-refresh") + " Muat contoh";

    /* Sakelar baru (1.3.0). */
    var kunci = $("#setelan-terkunci");
    if (kunci) kunci.checked = !!(S.deck.settings && S.deck.settings.terkunci);
    var auto = $("#setelan-autoprofil");
    if (auto) auto.checked = !!(S.deck.settings && S.deck.settings.autoProfil);
    var mulai = $("#setelan-mulai");
    if (mulai) mulai.checked = !!(S.deck.settings && S.deck.settings.mulaiOtomatis);
    var teratas = $("#setelan-teratas");
    if (teratas) teratas.checked = !!(S.deck.settings && S.deck.settings.teratas);
    var aksen = $("#setelan-aksen");
    if (aksen) aksen.value = (S.deck.settings && S.deck.settings.aksen) || KD.AKSEN_BAWAAN;
    var aksen2 = $("#setelan-aksen-2");
    if (aksen2) aksen2.value = (S.deck.settings && S.deck.settings.aksen2) || KD.AKSEN2_BAWAAN;
    /* Suara antarmuka disimpan per perangkat, bukan di deck. */
    var bunyi = $("#setelan-bunyi");
    if (bunyi) bunyi.checked = KD.bunyi.nyala();
    var volume = $("#setelan-volume");
    if (volume) volume.value = String(KD.bunyi.volume());
    var volumeNilai = $("#setelan-volume-nilai");
    if (volumeNilai) volumeNilai.textContent = KD.bunyi.volume() + "%";
    renderAturanOtomatis();
  }

  /* ------------------------------------------------- #16 aturan profil ----- */
  function renderAturanOtomatis() {
    var bagian = $("#setelan-otomatis-bagian");
    var daftar = $("#setelan-otomatis-daftar");
    if (!bagian || !daftar) return;
    var aktif = $("#setelan-autoprofil") && $("#setelan-autoprofil").checked;
    bagian.hidden = !aktif;
    daftar.innerHTML = "";
    var aturan = (S.deck && S.deck.otomatis) || [];
    if (!aturan.length) {
      var kosong = document.createElement("div");
      kosong.className = "kd-hint";
      kosong.textContent = "Belum ada aturan. Tambahkan contoh: aplikasi → halaman.";
      daftar.appendChild(kosong);
      return;
    }

    aturan.forEach(function (r, i) {
      var baris = document.createElement("div");
      baris.className = "kd-editor-baris";

      var proses = document.createElement("input");
      proses.className = "kumi-input";
      proses.type = "text";
      proses.placeholder = "aplikasi, mis. chrome";
      proses.value = r.proses || "";
      proses.setAttribute("aria-label", "Aplikasi aturan " + (i + 1));
      proses.addEventListener("input", function () {
        r.proses = proses.value;
      });

      var jendela = document.createElement("input");
      jendela.className = "kumi-input";
      jendela.type = "text";
      jendela.placeholder = "judul jendela (opsional)";
      jendela.value = r.jendela || "";
      jendela.setAttribute("aria-label", "Judul jendela aturan " + (i + 1));
      jendela.addEventListener("input", function () {
        r.jendela = jendela.value;
      });

      var pilih = document.createElement("select");
      pilih.className = "kumi-select";
      pilih.setAttribute("aria-label", "Halaman aturan " + (i + 1));
      S.deck.pages.forEach(function (h) {
        var opt = document.createElement("option");
        opt.value = h.id;
        opt.textContent = h.name;
        if (h.id === r.pageId) opt.selected = true;
        pilih.appendChild(opt);
      });
      pilih.addEventListener("change", function () {
        r.pageId = pilih.value;
      });

      var hapus = document.createElement("button");
      hapus.type = "button";
      hapus.className = "kumi-btn kumi-btn--ghost kumi-btn--icon kd-editor-baris__hapus";
      hapus.setAttribute("aria-label", "Hapus aturan " + (i + 1));
      hapus.innerHTML = KD.ikon("i-trash");
      hapus.addEventListener("click", function () {
        aturan.splice(i, 1);
        renderAturanOtomatis();
      });

      baris.appendChild(proses);
      baris.appendChild(jendela);
      baris.appendChild(pilih);
      baris.appendChild(hapus);
      daftar.appendChild(baris);
    });
  }

  function tambahAturanOtomatis() {
    if (!S.deck) return;
    if (!Array.isArray(S.deck.otomatis)) S.deck.otomatis = [];
    if (S.deck.otomatis.length >= 20) {
      KD.toast("Maksimal 20 aturan profil.", "danger");
      return;
    }
    S.deck.otomatis.push({
      proses: "",
      jendela: "",
      pageId: S.deck.pages[0].id,
      aktif: true,
    });
    var auto = $("#setelan-autoprofil");
    if (auto) auto.checked = true;
    renderAturanOtomatis();
  }

  function simpanSetelan() {
    if (!S.deck) return;
    var nama = ($("#setelan-nama").value || "").trim() || "Meja Kerja";
    var kolom = Number($("#setelan-kolom").value) || 5;
    var baris = Number($("#setelan-baris").value) || 3;
    var jumlah = kolom * baris;

    var deck = JSON.parse(JSON.stringify(S.deck));
    deck.profile.name = nama.slice(0, 32);
    deck.profile.columns = kolom;
    deck.profile.rows = baris;
    deck.settings.home = $("#setelan-awal").value || deck.settings.home;
    /* Sakelar 1.3.0. */
    if ($("#setelan-terkunci")) deck.settings.terkunci = $("#setelan-terkunci").checked;
    if ($("#setelan-autoprofil")) deck.settings.autoProfil = $("#setelan-autoprofil").checked;
    if ($("#setelan-mulai")) deck.settings.mulaiOtomatis = $("#setelan-mulai").checked;
    if ($("#setelan-teratas")) deck.settings.teratas = $("#setelan-teratas").checked;
    var aksenEl = $("#setelan-aksen");
    if (aksenEl) {
      var aksen = String(aksenEl.value || "").trim().toLowerCase();
      deck.settings.aksen = /^#[0-9a-f]{6}$/.test(aksen) ? aksen : "";
    }
    var aksen2El = $("#setelan-aksen-2");
    if (aksen2El) {
      var aksen2 = String(aksen2El.value || "").trim().toLowerCase();
      deck.settings.aksen2 = /^#[0-9a-f]{6}$/.test(aksen2) ? aksen2 : "";
    }
    if (!Array.isArray(deck.otomatis)) deck.otomatis = [];
    /* Buang aturan yang tidak lengkap. */
    deck.otomatis = deck.otomatis.filter(function (r) {
      return (r.proses || r.jendela) && r.pageId;
    });
    deck.pages.forEach(function (h) {
      h.keys = h.keys.slice(0, jumlah);
      while (h.keys.length < jumlah) h.keys.push(null);
    });

    tutupModal("modal-setelan");
    simpanDeckBaru(deck, "Setelan disimpan.");
  }

  function muatContoh() {
    if (!S.deck) return;
    var btn = $("#btn-contoh-ulang");
    if (S.contohTahap === 0) {
      S.contohTahap = 1;
      btn.textContent = "Tekan sekali lagi untuk menimpa";
      window.setTimeout(function () {
        if (S.contohTahap === 1) {
          S.contohTahap = 0;
          btn.innerHTML = KD.ikon("i-refresh") + " Muat contoh";
        }
      }, 4000);
      return;
    }
    S.contohTahap = 0;
    KD.api("/api/deck", {
      method: "POST",
      body: {
        deck: {
          version: 1,
          profile: { name: "Meja Kerja", columns: 5, rows: 3 },
          pages: [],
          settings: { sound: true, home: "" },
        },
      },
    })
      .then(function (hasil) {
        if (hasil && hasil.deck) {
          S.deck = hasil.deck;
          S.halamanId = hasil.deck.settings.home;
          renderSemua();
          renderKelolaHalaman();
          isiFormSetelan();
          if (window.Kumi) Kumi.sound.play("success");
          KD.toast("Contoh dimuat ulang.", "ok");
        }
      })
      .catch(tandaiTerputus);
  }

  /* ------------------------------------------------- cadangan & data ---- */
  function formatWaktu(ms) {
    try {
      return new Date(ms).toLocaleString(KD.bahasa === "en" ? "en-GB" : "id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch (err) {
      return new Date(ms).toLocaleString();
    }
  }

  /* Cadangan ringkas: satu dropdown berisi versi terakhir. Daftar panjang
     tidak perlu digambar, jadi tab Data tidak lagi butuh gulir. */
  function isiPilihanCadangan(items) {
    var pilih = $("#setelan-cadangan");
    if (!pilih) return;
    var sebelumnya = pilih.value;
    pilih.innerHTML = "";
    if (!items.length) {
      var kosong = document.createElement("option");
      kosong.value = "";
      kosong.textContent = KD.t("Belum ada cadangan");
      pilih.appendChild(kosong);
      pilih.disabled = true;
      var tombolKosong = $("#btn-cadangan-pulihkan");
      if (tombolKosong) tombolKosong.disabled = true;
      return;
    }
    pilih.disabled = false;
    var tombol = $("#btn-cadangan-pulihkan");
    if (tombol) tombol.disabled = false;
    items.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c.nama;
      opt.textContent =
        formatWaktu(c.waktu) + " · " + Math.max(1, Math.round(c.ukuran / 1024)) + " KB";
      pilih.appendChild(opt);
    });
    var masihAda = items.some(function (c) {
      return c.nama === sebelumnya;
    });
    pilih.value = masihAda ? sebelumnya : items[0].nama;
  }

  function muatCadangan() {
    var pilih = $("#setelan-cadangan");
    if (!pilih) return;
    /* Tampilkan hasil terakhir lebih dulu supaya tidak ada kedipan saat
       modal dibuka berulang kali. */
    if (S.cadangan && S.cadangan.length) isiPilihanCadangan(S.cadangan);
    else pilih.innerHTML = '<option value="">' + KD.escapeHtml(KD.t("Memuat cadangan…")) + "</option>";
    KD.api("/api/cadangan")
      .then(function (hasil) {
        S.cadangan = (hasil && hasil.cadangan) || [];
        isiPilihanCadangan(S.cadangan);
      })
      .catch(function () {
        if (S.cadangan && S.cadangan.length) return;
        pilih.innerHTML = '<option value="">' + KD.escapeHtml(KD.t("Daftar cadangan tidak dapat dimuat.")) + "</option>";
        pilih.disabled = true;
      });
  }

  /* Dua klik: cegah pemulihan tidak sengaja. Label tombol ditukar lewat span
     supaya ikon di dalamnya tidak hilang. */
  function pulihkanCadangan(nama, tombol) {
    if (!nama || !tombol) return;
    var label = tombol.querySelector("#btn-cadangan-pulihkan-label") || tombol;
    if (tombol.dataset.siap !== "1") {
      tombol.dataset.siap = "1";
      tombol.dataset.teksAsli = label.textContent.trim();
      label.textContent = KD.t("Yakin?");
      window.setTimeout(function () {
        if (!tombol) return;
        tombol.dataset.siap = "";
        label.textContent = tombol.dataset.teksAsli || KD.t("Pulihkan");
      }, 4000);
      return;
    }

    tombol.disabled = true;
    KD.api("/api/cadangan/pulihkan", { method: "POST", body: { nama: nama } })
      .then(function (hasil) {
        tombol.dataset.siap = "";
        label.textContent = tombol.dataset.teksAsli || KD.t("Pulihkan");
        tombol.disabled = false;
        if (!hasil || !hasil.deck) return;
        S.deck = hasil.deck;
        S.halamanId =
          hasil.deck.settings.home || (hasil.deck.pages[0] && hasil.deck.pages[0].id);
        renderSemua();
        renderKelolaHalaman();
        isiFormSetelan();
        muatCadangan();
        if (window.Kumi) Kumi.sound.play("success");
        KD.toast(KD.t("Cadangan dipulihkan."), "ok");
      })
      .catch(function (galat) {
        if (window.Kumi) Kumi.sound.play("error");
        KD.toast(galat.message || KD.t("Cadangan tidak dapat dipulihkan."), "danger");
        tombol.disabled = false;
        tombol.dataset.siap = "";
        label.textContent = tombol.dataset.teksAsli || KD.t("Pulihkan");
      });
  }

  function unduhBlob(blob, nama) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = nama;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 3000);
  }

  function unduhLog() {
    fetch("/api/log/unduh", {
      headers: KD.token ? { "x-kumi-token": KD.token } : {},
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Log tidak dapat diunduh (" + res.status + ").");
        return res.blob();
      })
      .then(function (blob) {
        unduhBlob(blob, "kumideck-log.txt");
        KD.toast("Log diunduh.", "ok");
      })
      .catch(function (galat) {
        KD.toast(galat.message || "Log tidak dapat diunduh.", "danger");
      });
  }

  function eksporPng() {
    var papan = $("#papan");
    if (!papan) return;
    var kotak = papan.getBoundingClientRect();
    if (kotak.width < 2 || kotak.height < 2) {
      KD.toast("Papan belum siap untuk diekspor.", "danger");
      return;
    }

    fetch("/api/papan/ekspor", {
      method: "POST",
      headers: Object.assign(
        { "content-type": "application/json" },
        KD.token ? { "x-kumi-token": KD.token } : {}
      ),
      body: JSON.stringify({
        x: Math.round(kotak.left),
        y: Math.round(kotak.top),
        lebar: Math.round(kotak.width),
        tinggi: Math.round(kotak.height),
      }),
    })
      .then(function (res) {
        var tipe = res.headers.get("content-type") || "";
        if (res.ok && tipe.indexOf("image/png") !== -1) return res.blob();
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            throw new Error(
              (data && data.message) ||
                (tipe.indexOf("image/png") === -1
                  ? "Ekspor PNG hanya tersedia di aplikasi desktop."
                  : "Ekspor PNG gagal (" + res.status + ").")
            );
          });
      })
      .then(function (blob) {
        unduhBlob(blob, "kumideck-papan.png");
        KD.toast("Gambar papan diunduh.", "ok");
      })
      .catch(function (galat) {
        KD.toast(galat.message || "Ekspor PNG gagal.", "danger");
      });
  }

  /* --------------------------------------------------- pencarian Ctrl+K --- */
  function keteranganTombol(key) {
    if (!key) return "Slot kosong";
    if (key.widget) return "Widget " + (key.widget.type || "");
    return KD.jelaskan(key.action || { type: "kosong" });
  }

  function hasilPencarian(q) {
    var cari = String(q || "").trim().toLowerCase();
    var hasil = [];
    if (!S.deck) return hasil;

    S.deck.pages.forEach(function (h) {
      h.keys.forEach(function (key, indeks) {
        if (!key) return;
        var ket = keteranganTombol(key);
        var teks = ((key.label || "") + " " + ket + " " + h.name).toLowerCase();
        if (cari && teks.indexOf(cari) === -1) return;
        hasil.push({
          halamanId: h.id,
          halaman: h.name,
          indeks: indeks,
          key: key,
          ket: ket,
        });
      });
    });

    hasil.sort(function (a, b) {
      var aAktif = a.halamanId === S.halamanId ? 0 : 1;
      var bAktif = b.halamanId === S.halamanId ? 0 : 1;
      if (aAktif !== bAktif) return aAktif - bAktif;
      return String(a.key.label || "").localeCompare(String(b.key.label || ""), "id");
    });
    return hasil.slice(0, 40);
  }

  function renderHasilCari() {
    var daftar = $("#hasil-cari");
    if (!daftar) return;
    var q = ($("#cari-tombol") && $("#cari-tombol").value) || "";
    var hasil = hasilPencarian(q);
    daftar.innerHTML = "";

    if (!hasil.length) {
      var li = document.createElement("li");
      li.className = "kumi-list__item kd-hint";
      li.textContent = q ? "Tidak ada tombol yang cocok." : "Belum ada tombol di papan ini.";
      daftar.appendChild(li);
      return;
    }

    hasil.forEach(function (r) {
      var li = document.createElement("li");
      li.className = "kumi-list__item";

      var tombol = document.createElement("button");
      tombol.type = "button";
      tombol.className = "kd-cari-item";
      tombol.setAttribute("data-halaman", r.halamanId);
      tombol.setAttribute("data-indeks", String(r.indeks));

      var label = document.createElement("span");
      label.className = "kd-cari-item__label";
      label.textContent = r.key.label || "Tombol";

      var ket = document.createElement("span");
      ket.className = "kd-cari-item__ket";
      ket.textContent = r.halaman + " · " + r.ket;

      tombol.appendChild(label);
      tombol.appendChild(ket);
      tombol.addEventListener("click", function () {
        bukaHasilCari(r);
      });

      li.appendChild(tombol);
      daftar.appendChild(li);
    });
  }

  function bukaCari() {
    if (!S.deck) return;
    var input = $("#cari-tombol");
    if (input) input.value = "";
    renderHasilCari();
    bukaModal("modal-cari");
    window.setTimeout(function () {
      if (input) input.focus();
    }, 60);
  }

  function bukaHasilCari(r) {
    tutupModal("modal-cari");
    S.suntingSel = { halamanId: r.halamanId, indeks: r.indeks };
    pindahHalaman(r.halamanId);
    window.setTimeout(function () {
      var tombol = document.querySelector('[data-key-id="' + r.key.id + '"]');
      if (tombol) {
        tombol.classList.add("kd-key--sorot");
        window.setTimeout(function () {
          tombol.classList.remove("kd-key--sorot");
        }, 1600);
        try {
          tombol.scrollIntoView({ block: "nearest", behavior: "smooth" });
        } catch (err) {
          /* peramban lama: abaikan */
        }
      }
      if (S.sunting && !terkunci()) bukaEditor(r.halamanId, r.indeks);
    }, 120);
  }

  /* ----------------------------------------------------------- pasangkan --- */
  function bukaPasangkan() {
    KD.api("/api/pair-info")
      .then(function (info) {
        S.pairInfo = info;
        $("#kode-pasangan").textContent = info.code;
        $("#tautan-remote").textContent = info.url;
        var gambar = $("#qr-gambar");
        if (info.qrSiap) {
          gambar.src = info.qrUrl;
          gambar.hidden = false;
          $("#qr-galat").hidden = true;
          $("#kode-pasangan-hint").textContent =
            "Pindai kode QR, atau ketik kode ini di layar perangkat Remote.";
        } else {
          gambar.hidden = true;
          $("#qr-galat").hidden = false;
          $("#kode-pasangan-hint").textContent =
            "Ketik alamat dan kode ini di peramban perangkat Remote.";
        }
        renderPerangkat();
        bukaModal("modal-pasangkan");
      })
      .catch(function (galat) {
        if (galat.status === 403) {
          KD.toast("Kode pasangan hanya bisa dibuka dari komputer ini.", "danger");
          return;
        }
        tandaiTerputus(galat);
      });
  }

  function salinTautan() {
    var tautan = (S.pairInfo && S.pairInfo.url) || "";
    if (!tautan) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tautan).then(
        function () {
          KD.toast("Tautan disalin.", "ok");
        },
        function () {
          KD.toast("Gagal menyalin. Salin manual dari teks di atas.", "danger");
        }
      );
    } else {
      KD.toast("Peramban tidak mendukung penyalinan otomatis.", "danger");
    }
  }

  /* --------------------------------------------------------------- ikat ----- */
  function ikatPeristiwa() {
    /* Tombol tutup semua modal. */
    $$("[data-tutup]").forEach(function (tombol) {
      tombol.addEventListener("click", function () {
        var modal = tombol.closest(".kumi-overlay");
        if (modal && modal.id === "modal-ikon") S.pangkas = null;
        tutupModal(modal);
      });
    });

    /* Pemangkas ikon (D9): geser dengan penunjuk, zoom dengan penggeser. */
    var kanvasPangkas = $("#pangkas-kanvas");
    if (kanvasPangkas) {
      kanvasPangkas.addEventListener("pointerdown", function (ev) {
        if (!S.pangkas) return;
        S.pangkas.seret = true;
        S.pangkas.mulaiX = ev.clientX;
        S.pangkas.mulaiY = ev.clientY;
        S.pangkas.awalX = S.pangkas.x;
        S.pangkas.awalY = S.pangkas.y;
        try {
          kanvasPangkas.setPointerCapture(ev.pointerId);
        } catch (err) {
          /* diabaikan */
        }
        ev.preventDefault();
      });
      kanvasPangkas.addEventListener("pointermove", function (ev) {
        if (!S.pangkas || !S.pangkas.seret) return;
        var kotak = kanvasPangkas.getBoundingClientRect();
        var faktor = kotak.width ? kanvasPangkas.width / kotak.width : 1;
        S.pangkas.x = S.pangkas.awalX + (ev.clientX - S.pangkas.mulaiX) * faktor;
        S.pangkas.y = S.pangkas.awalY + (ev.clientY - S.pangkas.mulaiY) * faktor;
        batasiPangkas();
        gambarPangkas();
      });
      var akhiriSeretPangkas = function () {
        if (S.pangkas) S.pangkas.seret = false;
      };
      kanvasPangkas.addEventListener("pointerup", akhiriSeretPangkas);
      kanvasPangkas.addEventListener("pointercancel", akhiriSeretPangkas);
    }
    var zoomPangkas = $("#pangkas-zoom");
    if (zoomPangkas) {
      zoomPangkas.addEventListener("input", function () {
        if (!S.pangkas) return;
        var baru = Math.max(1, (Number(zoomPangkas.value) || 100) / 100);
        var rasio = baru / S.pangkas.skala;
        S.pangkas.x *= rasio;
        S.pangkas.y *= rasio;
        S.pangkas.skala = baru;
        batasiPangkas();
        gambarPangkas();
      });
    }
    var btnPangkasSimpan = $("#btn-pangkas-simpan");
    if (btnPangkasSimpan) btnPangkasSimpan.addEventListener("click", simpanPangkas);

    /* Mode sunting. */
    $("#btn-sunting").addEventListener("click", function () {
      if (terkunci()) {
        /* #1: buka kunci dulu, jangan diam-diam mengabaikan klik. */
        KD.toast("Tata letak terkunci. Tekan ikon gembok untuk membuka.", "danger");
        if (window.Kumi) Kumi.sound.play("error");
        return;
      }
      S.sunting = !S.sunting;
      S.suntingSel = null;
      var btn = $("#btn-sunting");
      btn.setAttribute("aria-pressed", S.sunting ? "true" : "false");
      btn.classList.toggle("kumi-btn--soft", S.sunting);
      btn.classList.toggle("kumi-btn--primary", !S.sunting);
      $("#btn-sunting-label").textContent = S.sunting ? "Selesai menyunting" : "Sunting meja";
      $("#btn-kelola-halaman").hidden = !S.sunting;
      var btnCepat = $("#btn-tambah-cepat");
      if (btnCepat) btnCepat.hidden = !S.sunting;
      if (window.Kumi) Kumi.sound.play("toggle");
      renderPapan();
    });

    /* Tambah cepat. */
    var btnTambahCepat = $("#btn-tambah-cepat");
    if (btnTambahCepat) btnTambahCepat.addEventListener("click", bukaCepat);

    /* #1 Kunci tata letak. */
    var btnKunci = $("#btn-kunci");
    if (btnKunci) btnKunci.addEventListener("click", function () { ubahKunci(); });

    /* Pin selalu di atas (D6). */
    var btnTeratas = $("#btn-teratas");
    if (btnTeratas) btnTeratas.addEventListener("click", ubahTeratas);

    /* Hentikan urutan panjang (D10). */
    var btnHentiUrutan = $("#btn-henti-urutan");
    if (btnHentiUrutan) {
      btnHentiUrutan.addEventListener("click", function () {
        KD.hentikanUrutan()
          .then(function (hasil) {
            var pesan =
              hasil && hasil.aktif === false
                ? KD.t("Tidak ada urutan yang sedang berjalan.")
                : KD.t("Urutan dihentikan.");
            KD.toast(pesan, "ok");
          })
          .catch(function (galat) {
            KD.toast((galat && galat.message) || KD.t("Urutan tidak dapat dihentikan."), "danger");
          });
      });
    }

    /* Pencarian tombol (Ctrl+K). */
    var btnCari = $("#btn-cari");
    if (btnCari) btnCari.addEventListener("click", bukaCari);
    var cariInput = $("#cari-tombol");
    if (cariInput) {
      cariInput.addEventListener("input", renderHasilCari);
      cariInput.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          var pertama = $("#hasil-cari .kd-cari-item");
          if (pertama) pertama.click();
        } else if (ev.key === "ArrowDown") {
          ev.preventDefault();
          var turun = $("#hasil-cari .kd-cari-item");
          if (turun) turun.focus();
        }
      });
    }

    /* Soundboard. */
    var btnSoundboard = $("#btn-soundboard");
    if (btnSoundboard) btnSoundboard.addEventListener("click", bukaSoundboard);
    var btnHenti = $("#btn-suara-henti");
    if (btnHenti) btnHenti.addEventListener("click", hentikanSuara);
    var formSuara = $("#form-suara");
    if (formSuara) formSuara.addEventListener("submit", simpanSuara);
    var btnSuaraBuka = $("#btn-suara-buka");
    if (btnSuaraBuka) {
      btnSuaraBuka.addEventListener("click", function () {
        var form = $("#form-suara");
        var akanBuka = !!(form && form.hidden);
        if (akanBuka) isiFormSuara(null);
        aturFormSuara(akanBuka);
      });
    }
    var btnSuaraBerkas = $("#btn-suara-berkas");
    var berkasSuara = $("#berkas-suara");
    if (btnSuaraBerkas && berkasSuara) {
      btnSuaraBerkas.addEventListener("click", function () { berkasSuara.click(); });
      berkasSuara.addEventListener("change", function () {
        var f = berkasSuara.files && berkasSuara.files[0];
        if (f) unggahBerkasSuara(f);
        berkasSuara.value = "";
      });
    }
    var sliderSuara = $("#suara-volume");
    if (sliderSuara) {
      sliderSuara.addEventListener("input", function () {
        $("#suara-volume-nilai").textContent = sliderSuara.value + "%";
      });
    }

    /* #6 Tray icon: hidupkan bila belum, dan tampilkan status.
       Ikon: lonceng polos saat baki sistem mati, lonceng isi saat aktif. */
    var btnTray = $("#btn-tray");
    if (btnTray) {
      var gambarkanLonceng = function (aktif) {
        var use = btnTray.querySelector("use");
        if (use) use.setAttribute("href", aktif ? "#kd-bell-fill" : "#kd-bell");
        btnTray.setAttribute("aria-pressed", aktif ? "true" : "false");
        btnTray.setAttribute("aria-label", aktif ? "Ikon tampil di baki sistem — klik untuk menyembunyikan" : "Tampilkan ikon di baki sistem");
        btnTray.setAttribute("title", aktif ? "Di baki sistem" : "Tidak di baki sistem");
        btnTray.classList.toggle("is-active", aktif);
      };
      KD.api("/api/tray")
        .then(function (hasil) {
          gambarkanLonceng(!!(hasil && hasil.tray));
        })
        .catch(function () {
          /* diabaikan: tray opsional */
        });
      btnTray.addEventListener("click", function () {
        var nyala = btnTray.getAttribute("aria-pressed") === "true";
        KD.api("/api/tray", { method: "POST", body: { aktif: !nyala } })
          .then(function (hasil) {
            var aktif = !!(hasil && hasil.tray);
            gambarkanLonceng(aktif);
            if (window.Kumi) Kumi.sound.play("toggle");
            KD.toast(
              aktif
                ? "Ikon KumiDeck tampil di baki sistem. Menu Keluar tersedia di sana."
                : "Ikon baki sistem dimatikan.",
              "ok"
            );
          })
          .catch(function (galat) {
            if (window.Kumi) Kumi.sound.play("error");
            KD.toast(galat.message || "Tray tidak dapat diubah.", "danger");
          });
      });
    }

    /* #3 Ekspor / impor deck. */
    var btnEkspor = $("#btn-ekspor");
    if (btnEkspor) btnEkspor.addEventListener("click", eksporDeck);
    var btnImpor = $("#btn-impor");
    var berkasImpor = $("#berkas-impor");
    if (btnImpor && berkasImpor) {
      btnImpor.addEventListener("click", function () { berkasImpor.click(); });
      berkasImpor.addEventListener("change", function () {
        var berkas = berkasImpor.files && berkasImpor.files[0];
        if (!berkas) return;
        imporDeck(berkas);
        berkasImpor.value = "";
      });
    }

    /* #16 aturan profil otomatis + #6 mulai otomatis di form setelan. */
    var tambahAturan = $("#btn-tambah-otomatis");
    if (tambahAturan) tambahAturan.addEventListener("click", tambahAturanOtomatis);

    /* #19 unggah ikon dari editor. */
    var btnUnggah = $("#btn-unggah-ikon");
    var berkasIkon = $("#berkas-ikon");
    if (btnUnggah && berkasIkon) {
      btnUnggah.addEventListener("click", function () { berkasIkon.click(); });
      berkasIkon.addEventListener("change", function () {
        var berkas = berkasIkon.files && berkasIkon.files[0];
        if (berkas) mulaiPangkas(berkas);
        berkasIkon.value = "";
      });
    }

    /* #19 warna khusus tombol. */
    var warnaBg = $("#editor-warna-bg");
    var warnaFg = $("#editor-warna-fg");
    var pasangWarna = function () {
      if (!S.editor) return;
      S.editor.draft.warna = {
        bg: warnaBg.value || "#3d5afe",
        fg: warnaFg.value || "#ffffff",
      };
      gambarPratinjauEditor();
      if (window.Kumi) Kumi.sound.play("tap");
    };
    if (warnaBg) warnaBg.addEventListener("input", pasangWarna);
    if (warnaFg) warnaFg.addEventListener("input", pasangWarna);
    var hapusWarna = $("#btn-warna-hapus");
    if (hapusWarna) {
      hapusWarna.addEventListener("click", function () {
        if (!S.editor) return;
        S.editor.draft.warna = null;
        tandaiVarianTerpilih();
        KD.toast("Warna khusus dihapus; varian Kumi dipakai.", "ok");
      });
    }
    var auto = $("#setelan-autoprofil");
    if (auto) auto.addEventListener("change", renderAturanOtomatis);
    var mulaiTomatis = $("#setelan-mulai");
    if (mulaiTomatis) {
      mulaiTomatis.addEventListener("change", function () {
        if (!S.deck) return;
        KD.api("/api/otomatis", {
          method: "POST",
          body: { aktif: mulaiTomatis.checked },
        })
          .then(function (hasil) {
            if (window.Kumi) Kumi.sound.play("toggle");
            KD.toast(
              mulaiTomatis.checked
                ? "KumiDeck akan berjalan saat Windows menyala."
                : "Mulai otomatis dimatikan.",
              "ok"
            );
            if (!hasil || !hasil.aktif) mulaiTomatis.checked = false;
          })
          .catch(function () {
            mulaiTomatis.checked = !mulaiTomatis.checked;
            KD.toast("Mulai otomatis hanya tersedia untuk start.cmd atau .exe.", "danger");
          });
      });
    }
    var cepatCari = $("#cepat-cari");
    if (cepatCari) {
      cepatCari.addEventListener("input", function (ev) {
        S.cepatCari = ev.target.value;
        /* Bagian aplikasi disaring ulang dari daftar penuh; kartu bagian lain
           cukup disembunyikan di tempat. */
        var daftarAppCepat = $("#cepat-daftar-app");
        if (daftarAppCepat) daftarAppCepat.innerHTML = htmlDaftarCepatApp();
        saringCepatTampil();
        segarkanStatusApps();
      });
    }
    var cepatIsi = $("#cepat-isi");
    if (cepatIsi) {
      cepatIsi.addEventListener("scroll", function () {
        S.cepatGulir = cepatIsi.scrollTop;
      });
      cepatIsi.addEventListener("click", function (ev) {
        var ulang = ev.target.closest("[data-cepat-ulang]");
        if (ulang) {
          muatApps(true);
          return;
        }
        var kartu = ev.target.closest("[data-cepat-tipe]");
        if (!kartu) return;
        tambahCepat({
          tipe: kartu.getAttribute("data-cepat-tipe"),
          nilai: kartu.getAttribute("data-cepat-nilai"),
          label: kartu.getAttribute("data-cepat-label"),
          ikon: kartu.getAttribute("data-cepat-ikon"),
          varian: kartu.getAttribute("data-cepat-varian") || "",
        });
      });
    }

    /* Editor. */
    $("#form-editor").addEventListener("submit", function (ev) {
      ev.preventDefault();
      simpanEditor();
    });
    $("#editor-hapus").addEventListener("click", hapusTombol);
    if ($("#editor-duplikat")) {
      $("#editor-duplikat").addEventListener("click", duplikatTombol);
    }
    /* Ukuran tombol (#2.4): lebar dan tinggi dipilih terpisah; nilainya
       disimpan di draft, papan berubah setelah tombol disimpan. */
    if ($("#editor-ukuran")) {
      $("#editor-ukuran").addEventListener("click", function (ev) {
        var chip = ev.target.closest("[data-lebar],[data-tinggi]");
        if (!chip || !S.editor) return;
        var sp = KD.spanTombol(S.editor.draft);
        if (chip.dataset.lebar) sp.c = Math.max(1, Number(chip.dataset.lebar) || 1);
        if (chip.dataset.tinggi) sp.r = Math.max(1, Number(chip.dataset.tinggi) || 1);
        if (sp.c <= 1 && sp.r <= 1) delete S.editor.draft.span;
        else S.editor.draft.span = { c: sp.c, r: sp.r };
        tandaiUkuranTerpilih();
      });
    }
    $("#editor-jenis").addEventListener("change", function () {
      if (!S.editor) return;
      var jenis = $("#editor-jenis").value;
      var aksi = { type: jenis };
      if (jenis === "urutan") aksi.steps = [];
      if (jenis === "buka") aksi.target = "";
      /* Widget dan aksi saling meniadakan. */
      if (jenis === "widget") {
        if (!S.editor.slot) {
          S.editor.draft.widget = S.editor.draft.widget || { type: "jam" };
          S.editor.draft.action = { type: "kosong" };
        }
      } else {
        if (!S.editor.slot) S.editor.draft.widget = null;
        setAksiDraft(aksi);
      }
      renderParamEditor();
      tampilkanGalatEditor("");
    });

    /* Ketuk / tekan lama: satu form, dua slot aksi. */
    if ($("#editor-slot")) {
      $("#editor-slot").addEventListener("click", function (ev) {
        var chip = ev.target.closest("[data-slot]");
        if (!chip || !S.editor) return;
        S.editor.slot = Number(chip.getAttribute("data-slot")) || 0;
        $("#editor-jenis").value = aksiDraft().type || "kosong";
        segarkanPilihanJenis();
        renderParamEditor();
        tampilkanGalatEditor("");
      });
    }
    $("#editor-label").addEventListener("input", function () {
      $("#editor-label").removeAttribute("aria-invalid");
      gambarPratinjauEditor();
    });

    /* Halaman. */
    $("#btn-kelola-halaman").addEventListener("click", function () {
      renderKelolaHalaman();
      bukaModal("modal-halaman");
    });
    $("#form-halaman").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var input = $("#halaman-baru");
      tambahHalaman(input.value.trim() || "Halaman baru");
      input.value = "";
    });

    /* Setelan. */
    $("#btn-setelan").addEventListener("click", function () {
      isiFormSetelan();
      muatCadangan();
      renderPerangkatSetelan();
      pilihTabSetelan(tabSetelanAktif, false);
      var infoVersi = $("#info-versi");
      if (infoVersi) {
        infoVersi.textContent =
          KD.t("Terpasang") + " " + ((S.papanServer && S.papanServer.versi) || "?") + ".";
      }
      bukaModal("modal-setelan");
    });
    /* Setelan dua kolom: tab di kiri, isi tab di kanan. */
    var tabSetelanAktif = "umum";

    function pilihTabSetelan(nama, fokus) {
      var tab = document.querySelector('#form-setelan [data-setelan-tab="' + nama + '"]');
      if (!tab) return;
      var semua = document.querySelectorAll("#form-setelan [data-setelan-tab]");
      for (var i = 0; i < semua.length; i++) {
        var t = semua[i];
        var aktif = t === tab;
        t.classList.toggle("is-active", aktif);
        t.setAttribute("aria-selected", aktif ? "true" : "false");
        t.setAttribute("tabindex", aktif ? "0" : "-1");
        var panel = document.getElementById(t.getAttribute("aria-controls"));
        if (panel) {
          panel.hidden = !aktif;
          panel.classList.toggle("is-active", aktif);
        }
      }
      tabSetelanAktif = nama;
      if (fokus) {
        try {
          tab.focus({ preventScroll: true });
        } catch (err) {
          tab.focus();
        }
      }
    }

    var navSetelan = $("#form-setelan .kd-setelan__nav");
    if (navSetelan) {
      /* Tab menumpuk di atas pada layar sempit; orientasi ARIA ikut berubah. */
      var perbaruiOrientasiTab = function () {
        navSetelan.setAttribute(
          "aria-orientation",
          window.innerWidth <= 640 ? "horizontal" : "vertical"
        );
      };
      window.addEventListener("resize", perbaruiOrientasiTab);
      perbaruiOrientasiTab();

      navSetelan.addEventListener("click", function (ev) {
        var tab = ev.target.closest("[data-setelan-tab]");
        if (!tab) return;
        var nama = tab.getAttribute("data-setelan-tab");
        if (nama === tabSetelanAktif) {
          KD.bunyi.ketuk();
          return;
        }
        KD.bunyi.pindah();
        pilihTabSetelan(nama, false);
      });
      navSetelan.addEventListener("keydown", function (ev) {
        var tab = ev.target.closest("[data-setelan-tab]");
        if (!tab) return;
        var semua = Array.prototype.slice.call(
          navSetelan.querySelectorAll("[data-setelan-tab]")
        );
        var i = semua.indexOf(tab);
        var tujuan = -1;
        if (ev.key === "ArrowDown" || ev.key === "ArrowRight") tujuan = (i + 1) % semua.length;
        else if (ev.key === "ArrowUp" || ev.key === "ArrowLeft")
          tujuan = (i - 1 + semua.length) % semua.length;
        else if (ev.key === "Home") tujuan = 0;
        else if (ev.key === "End") tujuan = semua.length - 1;
        if (tujuan < 0) return;
        ev.preventDefault();
        KD.bunyi.pindah();
        pilihTabSetelan(semua[tujuan].getAttribute("data-setelan-tab"), true);
      });
    }

    var pilihBahasa = $("#pilih-bahasa");
    if (pilihBahasa) {
      pilihBahasa.addEventListener("change", function () {
        KD.pasangBahasa(pilihBahasa.value);
        renderSemua();
        isiFormSetelan();
        KD.toast(pilihBahasa.value === "en" ? "Interface language: English." : "Bahasa antarmuka: Indonesia.", "ok");
      });
    }
    $("#form-setelan").addEventListener("submit", function (ev) {
      ev.preventDefault();
      simpanSetelan();
    });
    $("#btn-contoh-ulang").addEventListener("click", muatContoh);

    /* Templat bawaan. */
    var btnTemplat = $("#btn-templat");
    if (btnTemplat) {
      btnTemplat.addEventListener("click", function () {
        renderTemplat();
        bukaModal("modal-templat");
      });
    }
    var daftarTemplat = $("#templat-daftar");
    if (daftarTemplat) {
      daftarTemplat.addEventListener("click", function (ev) {
        var kartu = ev.target.closest("[data-templat]");
        if (!kartu) return;
        var nama = kartu.querySelector(".kd-templat-kartu__nama").textContent;
        if (
          !window.confirm(
            KD.t(
              "Muat templat " +
                nama +
                "? Papan saat ini diganti. Cadangan otomatis tetap bisa dipulihkan dari Setelan."
            )
          )
        ) {
          return;
        }
        pakaiTemplat(kartu.getAttribute("data-templat"));
      });
    }

    /* Cadangan, log, dan ekspor PNG. */
    var btnCadanganMuat = $("#btn-cadangan-muat");
    if (btnCadanganMuat) btnCadanganMuat.addEventListener("click", muatCadangan);
    var btnCadanganPulih = $("#btn-cadangan-pulihkan");
    if (btnCadanganPulih) {
      btnCadanganPulih.addEventListener("click", function () {
        var pilih = $("#setelan-cadangan");
        pulihkanCadangan(pilih ? pilih.value : "", btnCadanganPulih);
      });
    }
    var btnUnduhLog = $("#btn-unduh-log");
    if (btnUnduhLog) btnUnduhLog.addEventListener("click", unduhLog);
    var btnEksporPng = $("#btn-ekspor-png");
    if (btnEksporPng) btnEksporPng.addEventListener("click", eksporPng);

    var btnPerangkatMuat = $("#btn-perangkat-muat");
    if (btnPerangkatMuat) {
      btnPerangkatMuat.addEventListener("click", function () {
        muatState()
          .then(function () {
            renderPerangkatSetelan();
            KD.toast("Daftar perangkat diperbarui.", "ok");
          })
          .catch(tandaiTerputus);
      });
    }
    var btnCekPembaruan = $("#btn-cek-pembaruan");
    if (btnCekPembaruan) btnCekPembaruan.addEventListener("click", cekPembaruan);

    /* Warna aksen: pratinjau langsung, simpan lewat form setelan. */
    var aksenEl = $("#setelan-aksen");
    var aksen2El = $("#setelan-aksen-2");
    var pratinjauAksen = function () {
      KD.terapkanAksen(aksenEl ? aksenEl.value : "", aksen2El ? aksen2El.value : "");
    };
    if (aksenEl) aksenEl.addEventListener("input", pratinjauAksen);
    if (aksen2El) aksen2El.addEventListener("input", pratinjauAksen);
    var btnAksenAwal = $("#btn-aksen-awal");
    if (btnAksenAwal) {
      btnAksenAwal.addEventListener("click", function () {
        if (aksenEl) aksenEl.value = KD.AKSEN_BAWAAN;
        pratinjauAksen();
        if (window.Kumi) Kumi.sound.play("tap");
      });
    }
    var btnAksen2Awal = $("#btn-aksen-2-awal");
    if (btnAksen2Awal) {
      btnAksen2Awal.addEventListener("click", function () {
        if (aksen2El) aksen2El.value = KD.AKSEN2_BAWAAN;
        pratinjauAksen();
        if (window.Kumi) Kumi.sound.play("tap");
      });
    }

    /* Suara antarmuka: berlaku langsung di perangkat ini (bukan bagian deck). */
    var bunyiEl = $("#setelan-bunyi");
    if (bunyiEl) {
      bunyiEl.addEventListener("change", function () {
        KD.bunyi.atur(bunyiEl.checked);
        if (bunyiEl.checked) KD.bunyi.ketuk();
      });
    }
    var volumeEl = $("#setelan-volume");
    if (volumeEl) {
      volumeEl.addEventListener("input", function () {
        var nilai = Math.max(0, Math.min(100, Number(volumeEl.value) || 0));
        KD.bunyi.aturVolume(nilai);
        var label = $("#setelan-volume-nilai");
        if (label) label.textContent = nilai + "%";
      });
    }
    var btnUjiBunyi = $("#btn-uji-bunyi");
    if (btnUjiBunyi) {
      btnUjiBunyi.addEventListener("click", function () {
        if (!KD.bunyi.nyala()) {
          KD.toast("Suara ketukan sedang dimatikan. Nyalakan dulu untuk mendengar contoh.", "info");
          return;
        }
        KD.bunyi.uji();
      });
    }

    /* Pasangkan. */
    $("#btn-pasangkan").addEventListener("click", bukaPasangkan);
    $("#btn-salin-tautan").addEventListener("click", salinTautan);

    /* Coba lagi saat server sempat mati. */
    $("#btn-coba-lagi").addEventListener("click", function () {
      var panel = $("#papan-galat");
      panel.hidden = true;
      $("#papan-memuat").hidden = false;
      muatState()
        .then(function () {
          sambungkan();
        })
        .catch(function () {
          /* pesan sudah ditampilkan */
        });
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && S.editor) {
        hentikanRekam();
        S.editor = null;
        renderPapan();
      }
    });

    /* Ctrl+K (atau Cmd+K) membuka pencarian tombol dari mana saja. */
    document.addEventListener("keydown", function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && String(ev.key).toLowerCase() === "k") {
        ev.preventDefault();
        bukaCari();
      }
    });

    /* Ctrl+Z / Ctrl+Y (dan Ctrl+Shift+Z) untuk urungkan/ulangi papan.
       Di dalam kolom isian, biarkan urungkan teks bawaan peramban. */
    document.addEventListener("keydown", function (ev) {
      if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
      var el = ev.target;
      var mengetik =
        el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (mengetik) return;

      var tombol = String(ev.key).toLowerCase();
      if (tombol === "z" && !ev.shiftKey) {
        ev.preventDefault();
        urungkan();
      } else if (tombol === "y" || (tombol === "z" && ev.shiftKey)) {
        ev.preventDefault();
        ulangi();
      }
    });

    /* Ctrl+C / Ctrl+V / Ctrl+Shift+V: salin, tempel, tempel gaya saat mode
       sunting. Di kolom isian biarkan peramban menangani salin-tempel teks. */
    document.addEventListener("keydown", function (ev) {
      if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
      var el = ev.target;
      var mengetik =
        el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (mengetik || !S.sunting || terkunci()) return;

      var huruf = String(ev.key).toLowerCase();
      if (huruf === "c" && !ev.shiftKey) {
        if (!tombolTerpilih()) return;
        ev.preventDefault();
        salinTombol();
      } else if (huruf === "v") {
        if (!S.tempel) return;
        ev.preventDefault();
        tempelTombol(ev.shiftKey);
      }
    });

    /* Menu klik kanan ditutup saat klik di luar, Esc, gulir, atau jendela
       kehilangan fokus. */
    document.addEventListener("click", function (ev) {
      if (menuTombol && !menuTombol.contains(ev.target)) tutupMenuTombol();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") tutupMenuTombol();
    });
    window.addEventListener("blur", tutupMenuTombol);
    document.addEventListener("scroll", tutupMenuTombol, true);

    var btnUrungkan = $("#btn-urungkan");
    if (btnUrungkan) btnUrungkan.addEventListener("click", urungkan);
    var btnUlangi = $("#btn-ulangi");
    if (btnUlangi) btnUlangi.addEventListener("click", ulangi);

    /* Ubah jumlah kolom hanya kalau ambang lebar jendela berubah. */
    var jamUbahUkuran = null;
    window.addEventListener("resize", function () {
      if (!S.deck) return;
      if (jamUbahUkuran) window.clearTimeout(jamUbahUkuran);
      jamUbahUkuran = window.setTimeout(function () {
        if (kolomPapan() !== S.kolomTerpasang) renderPapan();
        else ukurSelKisi($("#papan"), S.kolomTerpasang);
      }, 120);
    });
  }

  /* ---------------------------------------------------------------- mulai --- */
  function mulai() {
    if (window.Kumi && typeof Kumi.theme.init === "function") Kumi.theme.init();
    KD.siapkanIkon();
    buatPilihanIkon();
    buatPilihanVarian();
    buatPilihanJenis();
    buatPilihanUkuran();
    ikatPeristiwa();
    KD.siapkanIkonTema();
    KD.amatiBahasa();
    KD.terapkanBahasa();
    muatIkonKustom();

    /* Label ukuran memuat angka dinamis, jadi perlu digambar ulang saat
       bahasa berganti (kamus hanya menjangkau teks tetap). */
    window.addEventListener("kd:bahasa", function () {
      if (!S.editor) return;
      buatPilihanVarian();
      tandaiVarianTerpilih();
      tandaiUkuranTerpilih();
    });

    /* Jam dan tanggal diperbarui dari jam perangkat; hanya berjalan bila
       papan memuat widget waktu (hemat tenaga). */
    window.setInterval(function () {
      if (S.adaWidgetWaktu) KD.segarkanWidget();
    }, 1000);

    muatState()
      .then(function () {
        sambungkan();
        KD.kirimHello().catch(function () {
          /* diabaikan: SSE sudah mendaftarkan perangkat */
        });
      })
      .catch(function () {
        /* panel galat sudah diperbarui oleh muatState */
        sambungkan();
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mulai);
  } else {
    mulai();
  }
})();














