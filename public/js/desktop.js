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
  ];

  var PETUNJUK_JENIS = {
    kosong: "Tombol tidak melakukan apa pun. Pilih jenis aksi untuk mengaktifkannya.",
    hotkey: "Tulis kombinasi dengan tanda +, mis. ctrl+shift+m atau win+l. Tombol yang dikenal: ctrl, shift, alt, win, a-z, 0-9, f1-f24, panah, enter, tab, esc, space, del, printscreen.",
    teks: "Teks dikirim ke jendela yang sedang aktif. Huruf, angka, dan tanda baca biasa didukung.",
    buka: "Contoh: notepad, calc, ms-settings:, https://github.com, %USERPROFILE%\\Downloads.",
    http: "Permintaan dikirim dari komputer host (bukan dari ponsel). Cocok untuk pemantik skrip atau layanan rumah pintar di jaringan lokal.",
    media: "Kontrol pemutar media yang sedang aktif di komputer ini.",
    halaman: "Berpindah ke halaman lain di papan. Halaman tujuan harus masih ada.",
    urutan: "Beberapa aksi dijalankan berurutan, dengan jeda antar langkah. Berguna untuk menyiapkan beberapa aplikasi sekaligus.",
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
    editor: null /* { halamanId, indeks, draft, sumber, cari } */,
    apps: null /* daftar aplikasi terpasang */,
    appsMemuat: false,
    appsGalat: "",
    cepatCari: "",
    ikonKustom: null /* daftar ikon kustom dari /api/icons */,
    sinyal: null /* jendela depan + volume terakhir (#20) */,
    rekaman: null /* pendengar perekam pintasan */,
    kolomTerpasang: 0,
    online: false,
    siap: false,
    stream: null,
    pairInfo: null,
    contohTahap: 0,
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

  /* Jumlah kolom papan menyesuaikan lebar jendela supaya tombol tetap besar
     dan bisa ditekan; di layar sempit 5 kolom akan jadi terlalu kecil. */
  function kolomPapan() {
    var dasar = S.deck ? S.deck.profile.columns : 5;
    var lebar = window.innerWidth;
    if (lebar <= 560) return Math.min(dasar, 3);
    if (lebar <= 900) return Math.min(dasar, 4);
    return dasar;
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
    renderKepala();
    renderHalaman();
    renderPapan();
    renderPerangkat();
    renderAktivitas();
    renderSoundboard();
    renderKaki();
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
      teksPerangkat.textContent = "Belum ada perangkat Remote terpasang";
    } else {
      teksPerangkat.textContent =
        jumlahRemote + " Remote terhubung" + (jumlahSemua > jumlahRemote ? " · desktop aktif" : "");
    }

    var status = $("#status-koneksi");
    var teks = $("#status-teks");
    status.classList.toggle("is-online", S.online);
    status.classList.toggle("is-offline", !S.online);
    teks.textContent = S.online ? "Tersambung" : "Terputus — mencoba menyambung";
  }

  function renderKaki() {
    var el = $("#kaki-alamat");
    if (S.deck && S.papanServer) {
      el.textContent = KD.t("Alamat papan") + ": " + S.papanServer.lanUrl;
    } else if (S.deck) {
      el.textContent = KD.t("Alamat papan") + ": —";
    }
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
      wadah.appendChild(chip);
    });

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

    papan.innerHTML = "";
    var kolom = kolomPapan();
    S.kolomTerpasang = kolom;
    papan.style.setProperty("--kd-cols", String(kolom));
    papan.setAttribute("aria-busy", "false");
    papan.hidden = false;
    memuat.hidden = true;
    $("#papan-galat").hidden = true;

    halaman.keys.forEach(function (key, indeks) {
      var tombol = KD.buatTombol(key, { sunting: S.sunting });
      tombol.dataset.indeks = String(indeks);
      if (S.sunting && !terkunci()) {
        tombol.setAttribute("draggable", "true");
        pasangSeret(tombol, halaman.id, indeks);
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
            (key ? " (klik untuk menyunting)" : " — klik untuk mengisi")
        );
      }

      tombol.addEventListener("click", function () {
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
          tekanTombol(halaman.id, key.id, tombol);
        }
      });

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
        : "Tekan tombol untuk menjalankan aksi. Nyalakan <strong>Sunting meja</strong> untuk mengubah isi tombol.";
  }

  /* --------------------------------------------------- seret & lepas (#2) --- */
  var seret = { indeks: null, elemen: null, halamanId: null };

  function pasangSeret(tombol, halamanId, indeks) {
    tombol.addEventListener("dragstart", function (ev) {
      seret.indeks = indeks;
      seret.elemen = tombol;
      seret.halamanId = halamanId;
      tombol.classList.add("seret-aktif");
      try {
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", String(indeks));
      } catch (err) {
        /* diabaikan */
      }
    });
    tombol.addEventListener("dragend", function () {
      tombol.classList.remove("seret-aktif");
      Array.prototype.forEach.call(
        document.querySelectorAll(".kd-key.seret-sasaran"),
        function (el) {
          el.classList.remove("seret-sasaran");
        }
      );
      seret = { indeks: null, elemen: null, halamanId: null };
    });
    tombol.addEventListener("dragover", function (ev) {
      if (seret.indeks === null || seret.halamanId !== halamanId || seret.indeks === indeks) return;
      ev.preventDefault();
      tombol.classList.add("seret-sasaran");
    });
    tombol.addEventListener("dragleave", function () {
      tombol.classList.remove("seret-sasaran");
    });
    tombol.addEventListener("drop", function (ev) {
      ev.preventDefault();
      tombol.classList.remove("seret-sasaran");
      if (seret.indeks === null || seret.halamanId !== halamanId || seret.indeks === indeks) return;
      tukarPosisi(halamanId, seret.indeks, indeks);
    });
  }

  function tukarPosisi(halamanId, dari, ke) {
    var halaman = S.deck.pages.find(function (h) {
      return h.id === halamanId;
    });
    if (!halaman) return;
    /* Perubahan lokal dulu agar terasa instan, lalu disimpan di server. */
    var dipindah = halaman.keys[dari];
    halaman.keys[dari] = halaman.keys[ke];
    halaman.keys[ke] = dipindah;
    renderPapan();
    KD.pindahTombol(halamanId, dari, ke)
      .then(function (hasil) {
        if (hasil && hasil.deck) S.deck = hasil.deck;
        renderPapan();
        if (window.Kumi) Kumi.sound.play("success");
      })
      .catch(function (galat) {
        /* Kembalikan susunan semula bila server menolak. */
        var kembali = halaman.keys[dari];
        halaman.keys[dari] = halaman.keys[ke];
        halaman.keys[ke] = kembali;
        renderPapan();
        if (galat.status === 400) KD.toast("Posisi tidak bisa ditukar.", "danger");
        else tandaiTerputus(galat);
      });
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
        lencana.appendChild(document.createTextNode(segar ? "Aktif" : "Menunggu"));

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
        jumlahRemote > 0 ? jumlahRemote + " Remote terhubung" : "Menunggu perangkat";
    }
  }

  function renderAktivitas() {
    var daftar = $("#daftar-aktivitas");
    var kosong = $("#aktivitas-kosong");
    var catatan = $("#aktivitas-catatan");
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
    if (window.Kumi) Kumi.sound.play("toggle");
  }

  function tekanTombol(pageId, keyId, tombolEl) {
    KD.kilat(tombolEl);
    tombolEl.classList.add("kena-aksi");
    window.setTimeout(function () {
      tombolEl.classList.remove("kena-aksi");
    }, 520);

    KD.tekan(pageId, keyId)
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
    var target = (S.editor && S.editor.draft && S.editor.draft.action.target) || "";
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
    var target = S.editor.draft.action.target || "";

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
      chip.textContent = v.label;
      chip.setAttribute("aria-pressed", "false");
      chip.addEventListener("click", function () {
        if (!S.editor) return;
        S.editor.draft.variant = v.id;
        tandaiVarianTerpilih();
      });
      wadah.appendChild(chip);
    });
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
      sumber: sumberAwal,
      cari: "",
    };
    hentikanRekam();

    $("#editor-eyebrow").textContent = halaman.name + " · slot " + (indeks + 1);
    $("#editor-judul").textContent = asli ? "Sunting tombol" : "Isi slot kosong";
    $("#editor-label").value = draft.label || "";
    $("#editor-label").removeAttribute("aria-invalid");
    $("#editor-jenis").value = draft.widget
      ? "widget"
      : draft.action
        ? draft.action.type
        : "kosong";
    $("#editor-hapus").hidden = !asli;
    muatIkonKustom();
    tandaiIkonTerpilih();
    tandaiVarianTerpilih();
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

  /* Field parameter mengikuti jenis aksi. */
  function renderParamEditor() {
    var wadah = $("#editor-param");
    if (!S.editor) return;
    var aksi = S.editor.draft.action || { type: "kosong" };
    /* Widget tidak menyimpan aksi, jadi jenisnya dibaca dari draft.widget. */
    var jenis = S.editor.draft.widget ? "widget" : aksi.type || "kosong";
    $("#editor-hint").textContent = PETUNJUK_JENIS[jenis] || "";

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
        '<span class="kumi-field__hint">Tekan “Rekam tombol” lalu tekan kombinasinya, atau tulis sendiri (mis. ctrl+alt+del, win+l, alt+f4).</span></div>';
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
        "</textarea></div>";
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
          '<span class="kumi-field__hint">Volume dan perangkat output mengikuti setelan suara di panel Soundboard.</span></div>';
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
        " Tambah langkah</button></div>";
    } else {
      html =
        '<div class="kd-hint">Tombol ini belum punya aksi. Pilih jenis aksi di atas agar bisa dipakai.</div>';
    }

    wadah.innerHTML = html;

    if (jenis === "urutan") {
      if (!Array.isArray(S.editor.draft.action.steps)) S.editor.draft.action.steps = [];
      renderLangkah();
      $("#btn-tambah-langkah").addEventListener("click", function () {
        kumpulkanLangkah();
        S.editor.draft.action.steps.push({
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
          if (S.editor) S.editor.draft.action = { type: "mic", cmd: pilihMic.value };
        });
      }
    }
    if (jenis === "suara") {
      var pilihSuara = $("#param-suara");
      if (pilihSuara) {
        pilihSuara.addEventListener("change", function () {
          if (S.editor) S.editor.draft.action = { type: "suara", soundId: pilihSuara.value };
        });
      }
    }
    if (jenis === "jendela") {
      var pilihJendela = $("#param-jendela");
      if (pilihJendela) {
        pilihJendela.addEventListener("change", function () {
          if (S.editor) S.editor.draft.action = { type: "jendela", cmd: pilihJendela.value };
        });
      }
    }
    if (jenis === "volume") {
      var pilihVolume = $("#param-volume");
      if (pilihVolume) {
        pilihVolume.addEventListener("change", function () {
          if (!S.editor) return;
          var nilai = Number(($("#param-volume-nilai") || {}).value) || 50;
          S.editor.draft.action =
            pilihVolume.value === "set"
              ? { type: "volume", mode: "set", nilai: nilai }
              : { type: "volume", mode: pilihVolume.value };
          renderParamEditor();
        });
      }
      var sliderVolume = $("#param-volume-nilai");
      if (sliderVolume) {
        sliderVolume.addEventListener("input", function () {
          var label = $("#param-volume-label");
          if (label) label.textContent = sliderVolume.value + "%";
          if (S.editor && S.editor.draft.action.mode === "set") {
            S.editor.draft.action.nilai = Number(sliderVolume.value) || 50;
          }
        });
      }
    }
    if (jenis === "daya") {
      var pilihDaya = $("#param-daya");
      if (pilihDaya) {
        pilihDaya.addEventListener("change", function () {
          if (!S.editor) return;
          S.editor.draft.action = { type: "daya", cmd: pilihDaya.value };
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
        S.editor.draft.action = {
          type: "kondisional",
          syarat: {
            proses: (($("#kond-proses") || {}).value || "").trim(),
            jendela: (($("#kond-jendela") || {}).value || "").trim(),
          },
          aktif: bacaSederhana("aktif", { type: "hotkey" }),
          tidakAktif: bacaSederhana("tidak", { type: "buka" }),
        };
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
          if (S.editor) S.editor.draft.action.combo = inputHotkey.value.trim();
        });
      }
      var tombolRekam = $("#btn-rekam-hotkey");
      if (tombolRekam) {
        tombolRekam.addEventListener("click", function () {
          mulaiRekam(inputHotkey, tombolRekam);
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
            S.editor.draft.action.target = "";
          }
          renderParamEditor();
        });
      }

      var cariApp = $("#param-cari-app");
      if (cariApp) {
        cariApp.addEventListener("input", function () {
          if (!S.editor) return;
          S.editor.cari = cariApp.value;
          var daftar = $("#param-app-daftar");
          if (daftar) daftar.innerHTML = htmlDaftarApp();
          segarkanStatusApps();
        });
      }

      var daftarApp = $("#param-app-daftar");
      if (daftarApp) {
        daftarApp.addEventListener("click", function (ev) {
          var item = ev.target.closest("[data-app-target]");
          if (!item || !S.editor) return;
          S.editor.draft.action.target = item.getAttribute("data-app-target");
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
          if (S.editor) S.editor.draft.action.target = inputTautan.value.trim();
        });
      }
      var inputJalur = $("#param-jalur");
      if (inputJalur) {
        inputJalur.addEventListener("input", function () {
          if (S.editor) S.editor.draft.action.target = inputJalur.value;
        });
      }
    }
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
      if (S.editor && S.editor.draft.action) S.editor.draft.action.combo = combo;
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
    var langkah = S.editor.draft.action.steps || [];
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

      var jeda = document.createElement("input");
      jeda.className = "kumi-input";
      jeda.type = "number";
      jeda.min = "0";
      jeda.max = "5000";
      jeda.step = "50";
      jeda.value = String(l.delay || 0);
      jeda.title = "Jeda setelah langkah sebelumnya (milidetik)";
      jeda.setAttribute("aria-label", "Jeda langkah " + (i + 1) + " dalam milidetik");
      jeda.addEventListener("input", function () {
        l.delay = Math.max(0, Math.min(5000, Number(jeda.value) || 0));
      });

      var hapus = document.createElement("button");
      hapus.type = "button";
      hapus.className = "kumi-btn kumi-btn--ghost kumi-btn--icon kd-editor-baris__hapus";
      hapus.setAttribute("aria-label", "Hapus langkah " + (i + 1));
      hapus.innerHTML = KD.ikon("i-trash");
      hapus.addEventListener("click", function () {
        kumpulkanLangkah();
        S.editor.draft.action.steps.splice(i, 1);
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
    return S.editor && S.editor.draft.action ? S.editor.draft.action.steps || [] : [];
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
        target = ((S.editor && S.editor.draft.action.target) || "").trim();
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

    if (jenis === "http") {
      var url = (($("#param-http-url") || {}).value || "").trim();
      if (!/^https?:\/\//i.test(url)) return { galat: "URL harus dimulai dengan http:// atau https://." };
      var metode = ($("#param-http-metode") || {}).value || "GET";
      var isi = ($("#param-http-body") || {}).value || "";
      return {
        aksi: {
          type: "http",
          method: metode,
          url: url,
          body: metode === "GET" ? "" : isi.slice(0, 4000),
          headers: [],
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

  function simpanDeckBaru(deck, pesan) {
    return KD.simpanDeck(deck)
      .then(function (hasil) {
        if (hasil && hasil.deck) S.deck = hasil.deck;
        S.online = true;
        renderSemua();
        if (window.Kumi) Kumi.sound.play("success");
        if (pesan) KD.toast(pesan, "ok");
        return true;
      })
      .catch(function (galat) {
        tandaiTerputus(galat);
        return false;
      });
  }

  function simpanEditor() {
    if (!S.editor) return;
    var label = ($("#editor-label").value || "").trim();
    if (!label) {
      var input = $("#editor-label");
      input.setAttribute("aria-invalid", "true");
      input.focus();
      tampilkanGalatEditor("Nama tombol belum diisi.");
      return;
    }

    var hasil = bacaAksiDariForm();
    if (hasil.galat) {
      tampilkanGalatEditor(hasil.galat);
      if (window.Kumi) Kumi.sound.play("error");
      return;
    }
    tampilkanGalatEditor("");

    var halaman = S.deck.pages.find(function (p) {
      return p.id === S.editor.halamanId;
    });
    if (!halaman) return;

    var keyBaru = {
      id: S.editor.draft.id || "",
      label: label.slice(0, 24),
      icon: S.editor.draft.icon || "i-grid",
      variant: S.editor.draft.variant || "default",
      warna: S.editor.draft.warna || null,
      widget:
        $("#editor-jenis").value === "widget"
          ? S.editor.draft.widget || { type: "jam" }
          : null,
      action: hasil.aksi,
      /* Penanda status: kosongkan seluruhnya bila kedua kolom kosong. */
      tandaiAktif: (function () {
        var proses = (($("#editor-tanda-proses") || {}).value || "").trim().slice(0, 64);
        var jendela = (($("#editor-tanda-jendela") || {}).value || "").trim().slice(0, 80);
        return proses || jendela ? { proses: proses, jendela: jendela } : null;
      })(),
    };

    halaman.keys[S.editor.indeks] = keyBaru;
    var deck = JSON.parse(JSON.stringify(S.deck));
    var posisi = S.editor;
    tutupModal("modal-editor");
    S.editor = null;

    simpanDeckBaru(deck, "Tombol disimpan.").then(function (ok) {
      if (!ok) return;
      S.suntingSel = { halamanId: posisi.halamanId, indeks: posisi.indeks };
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
    renderCepat();
    bukaModal("modal-cepat");
    if (!S.apps && !S.appsMemuat) muatApps(false);
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
      '<div class="kumi-input-icon">' +
      KD.ikon("i-search") +
      '<input class="kumi-input" id="cepat-cari-app" type="search" autocomplete="off" placeholder="Cari aplikasi, mis. Spotify…" value="' +
      KD.escapeHtml(S.cepatCari || "") +
      '"></div>' +
      '<div class="kd-cepat__daftar" id="cepat-daftar-app">' +
      htmlDaftarCepatApp() +
      "</div></div>";

    wadah.innerHTML = html;
    segarkanStatusApps();
  }

  function tambahCepat(data) {
    if (!S.deck) return;
    var halaman = halamanAktif();
    if (!halaman) return;

    var indeks = halaman.keys.findIndex(function (k) {
      return !k;
    });
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

  function unggahIkon(berkas) {
    if (!berkas) return;
    var status = $("#editor-ikon-hint");
    var tipe = (berkas.type || "").toLowerCase();
    /* Sebagian peramban tidak mengisi MIME untuk .svg; periksa ekstensi juga. */
    var ekstensi = String(berkas.name || "").toLowerCase().split(".").pop();
    var tipeSah =
      ["image/svg+xml", "image/png", "image/webp"].indexOf(tipe) !== -1 ||
      ["svg", "png", "webp"].indexOf(ekstensi) !== -1;
    if (!tipeSah) {
      KD.toast("Pilih berkas SVG, PNG, atau WebP.", "danger");
      return;
    }
    if (berkas.size > BATAS_IKON_UNGGAH) {
      KD.toast("Ikon maksimal 512 KB. Perkecil dulu berkasnya.", "danger");
      return;
    }
    if (status) status.textContent = "Mengunggah " + (berkas.name || "ikon") + "…";
    var pembaca = new FileReader();
    pembaca.onload = function () {
      KD.api("/api/icons", { method: "POST", body: { dataUrl: String(pembaca.result || "") } })
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
    };
    pembaca.onerror = function () {
      if (status) status.textContent = "Berkas tidak dapat dibaca.";
      KD.toast("Berkas tidak dapat dibaca.", "danger");
    };
    pembaca.readAsDataURL(berkas);
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
        (item.perangkatId ? " · perangkat khusus" : "") +
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

  function isiFormSuara(item) {
    S.suaraSunting = item ? item.id : "";
    $("#suara-nama").value = item ? item.name : "";
    $("#suara-sumber").value = item ? item.sumber : "";
    $("#suara-volume").value = String(item ? item.volume : 100);
    $("#suara-volume-nilai").textContent = (item ? item.volume : 100) + "%";
    $("#suara-perangkat-item").value = item ? item.perangkatId || "" : "";
    var tombol = $("#btn-suara-simpan");
    if (tombol) {
      tombol.innerHTML = KD.ikon(item ? "i-check" : "i-plus") + (item ? " Simpan perubahan" : " Tambah suara");
    }
    $("#suara-status").textContent = item ? "Menyunting “" + item.name + "”." : "";
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
      perangkatId: $("#suara-perangkat-item").value || "",
    };
    KD.api("/api/soundboard/simpan", { method: "POST", body: { item: item } })
      .then(function (hasil) {
        if (S.deck && hasil && hasil.soundboard) S.deck.soundboard = hasil.soundboard;
        renderSoundboard();
        isiFormSuara(null);
        $("#suara-status").textContent = "Suara disimpan.";
        if (window.Kumi) Kumi.sound.play("success");
        KD.toast("Suara disimpan.", "ok");
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

  /* Muat daftar perangkat output untuk soundboard. */
  function muatPerangkatAudio() {
    return KD.api("/api/audio/perangkat")
      .then(function (hasil) {
        S.perangkatAudio = (hasil && hasil.perangkat) || [];
        [["#suara-perangkat", "Ikuti perangkat default"], ["#suara-perangkat-item", "Perangkat default"]].forEach(
          function (pasangan) {
            var pilih = $(pasangan[0]);
            if (!pilih) return;
            var nilai = pilih.value;
            pilih.innerHTML = '<option value="">' + pasangan[1] + "</option>";
            S.perangkatAudio.forEach(function (d) {
              var opt = document.createElement("option");
              opt.value = d.id;
              opt.textContent = d.nama + (d.bawaan ? " (bawaan)" : "");
              pilih.appendChild(opt);
            });
            if (nilai) pilih.value = nilai;
          }
        );
        return S.perangkatAudio;
      })
      .catch(function () {
        S.perangkatAudio = [];
        return [];
      });
  }

  function bukaSoundboard() {
    renderSoundboard();
    isiFormSuara(null);
    bukaModal("modal-suara");
    muatPerangkatAudio();
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

      baris.appendChild(input);
      if (lencana.className) baris.appendChild(lencana);
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

  /* ------------------------------------------------------------- setelan --- */
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
        tutupModal(tombol.closest(".kumi-overlay"));
      });
    });

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

    /* Soundboard. */
    var btnSoundboard = $("#btn-soundboard");
    if (btnSoundboard) btnSoundboard.addEventListener("click", bukaSoundboard);
    var btnHenti = $("#btn-suara-henti");
    if (btnHenti) btnHenti.addEventListener("click", hentikanSuara);
    var formSuara = $("#form-suara");
    if (formSuara) formSuara.addEventListener("submit", simpanSuara);
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
    /* Pilih perangkat output untuk SEMUA suara: disimpan ke server satu per satu
       agar benar-benar dipakai saat memutar. */
    var pilihPerangkatSuara = $("#suara-perangkat");
    if (pilihPerangkatSuara) {
      pilihPerangkatSuara.addEventListener("change", function () {
        var nilai = pilihPerangkatSuara.value || "";
        var semua = daftarSuara();
        if (!semua.length) {
          KD.toast("Belum ada suara untuk diatur.", "danger");
          return;
        }
        var berurutan = semua.reduce(function (rantai, item) {
          return rantai.then(function () {
            return KD.api("/api/soundboard/simpan", {
              method: "POST",
              body: { item: Object.assign({}, item, { perangkatId: nilai }) },
            }).then(function (hasil) {
              if (hasil && hasil.soundboard && S.deck) S.deck.soundboard = hasil.soundboard;
            });
          });
        }, Promise.resolve());
        berurutan
          .then(function () {
            renderSoundboard();
            KD.toast(
              nilai ? "Perangkat output soundboard diperbarui." : "Soundboard memakai perangkat default.",
              "ok"
            );
          })
          .catch(function (galat) {
            KD.toast(galat.message || "Perangkat output gagal disimpan.", "danger");
          });
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
        if (berkas) unggahIkon(berkas);
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
    var cepatIsi = $("#cepat-isi");
    if (cepatIsi) {
      cepatIsi.addEventListener("input", function (ev) {
        if (!ev.target || ev.target.id !== "cepat-cari-app") return;
        S.cepatCari = ev.target.value;
        var daftarAppCepat = $("#cepat-daftar-app");
        if (daftarAppCepat) daftarAppCepat.innerHTML = htmlDaftarCepatApp();
        segarkanStatusApps();
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
    $("#editor-jenis").addEventListener("change", function () {
      if (!S.editor) return;
      var jenis = $("#editor-jenis").value;
      S.editor.draft.action = { type: jenis };
      if (jenis === "urutan") S.editor.draft.action.steps = [];
      if (jenis === "buka") S.editor.draft.action.target = "";
      /* Widget dan aksi saling meniadakan. */
      if (jenis === "widget") {
        S.editor.draft.widget = S.editor.draft.widget || { type: "jam" };
        S.editor.draft.action = { type: "kosong" };
      } else {
        S.editor.draft.widget = null;
      }
      renderParamEditor();
      tampilkanGalatEditor("");
    });
    $("#editor-label").addEventListener("input", function () {
      $("#editor-label").removeAttribute("aria-invalid");
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
      bukaModal("modal-setelan");
    });
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

    /* Ubah jumlah kolom hanya kalau ambang lebar jendela berubah. */
    var jamUbahUkuran = null;
    window.addEventListener("resize", function () {
      if (!S.deck) return;
      if (jamUbahUkuran) window.clearTimeout(jamUbahUkuran);
      jamUbahUkuran = window.setTimeout(function () {
        if (kolomPapan() !== S.kolomTerpasang) renderPapan();
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
    ikatPeristiwa();
    KD.siapkanIkonTema();
    KD.amatiBahasa();
    KD.terapkanBahasa();
    muatIkonKustom();

    /* Jam dan tanggal diperbarui dari jam perangkat; hanya berjalan bila
       papan memuat widget waktu (hemat tenaga). */
    window.setInterval(function () {
      if (document.querySelector('[data-widget="jam"], [data-widget="tanggal"]')) {
        KD.segarkanWidget();
      }
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














