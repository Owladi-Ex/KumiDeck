/* KumiDeck — logika UI Remote (ponsel/tablet).
   Memasangkan perangkat lewat kode 8 karakter, memuat papan dari server,
   menangani ketukan tombol dengan umpan balik getar + visual, dan menjaga
   tampilan tetap satu layar penuh tanpa gulir halaman. */
(function () {
  "use strict";

  var TOKEN_KEY = "kumideck-token";
  var HALAMAN_KEY = "kumideck-remote-halaman";
  var AWAL_KEY = "kumideck-remote-awal";
  var KIOS_KEY = "kumideck-remote-kios";
  var JAGA_KEY = "kumideck-remote-jaga-layar";
  var HINT_KEY = "kumideck-remote-hint";

  var $ = function (sel, akar) {
    return (akar || document).querySelector(sel);
  };

  var $$ = function (sel, akar) {
    return Array.prototype.slice.call((akar || document).querySelectorAll(sel));
  };

  var S = {
    deck: null,
    devices: [],
    aktivitas: [],
    halamanId: "",
    online: false,
    siap: false,
    pairing: false,
    stream: null,
    raf: 0,
    wakeLock: null,
    adaWidgetWaktu: false /* papan memuat widget jam/tanggal */,
  };

  /* ------------------------------------------------------------ penyimpanan --- */
  function bacaLokal(kunci) {
    try {
      return localStorage.getItem(kunci) || "";
    } catch (err) {
      return "";
    }
  }

  function tulisLokal(kunci, nilai) {
    try {
      localStorage.setItem(kunci, nilai);
    } catch (err) {
      /* penyimpanan diblokir: abaikan */
    }
  }

  /* --------------------------------------------------------------- pembantu --- */
  function halamanAda(id) {
    if (!S.deck || !id) return false;
    return S.deck.pages.some(function (h) {
      return h.id === id;
    });
  }

  function halamanAktif() {
    if (!S.deck || !S.deck.pages || !S.deck.pages.length) return null;
    var i;
    for (i = 0; i < S.deck.pages.length; i += 1) {
      if (S.deck.pages[i].id === S.halamanId) return S.deck.pages[i];
    }
    return S.deck.pages[0] || null;
  }

  function getar(pola) {
    try {
      if (navigator && typeof navigator.vibrate === "function") navigator.vibrate(pola);
    } catch (err) {
      /* getaran tidak didukung: abaikan */
    }
  }

  /* ---------------------------------------------------------------- render --- */
  function renderStatus() {
    var status = $("#status-koneksi");
    var teks = $("#status-teks");
    if (!status || !teks) return;
    var online = !!S.online;
    status.classList.toggle("is-online", online);
    status.classList.toggle("is-offline", !online);
    if (online) teks.textContent = "Tersambung";
    else if (S.pairing) teks.textContent = "Belum dipasangkan";
    else if (S.siap) teks.textContent = "Terputus";
    else teks.textContent = "Menyambung…";
  }

  function renderJudul() {
    var aktif = halamanAktif();
    var namaPapan = S.deck && S.deck.profile ? S.deck.profile.name : "KumiDeck";
    var namaHalaman = aktif ? aktif.name : "Papan tombol";
    var label = $("#nama-papan");
    var judul = $("#judul-halaman");
    if (label) label.textContent = namaPapan;
    if (judul) judul.textContent = namaHalaman;
    document.title = aktif ? namaHalaman + " — KumiDeck" : "KumiDeck — papan tombol";
  }

  function renderHalaman() {
    var wadah = $("#daftar-halaman");
    var penghitung = $("#penghitung-halaman");
    if (!wadah) return;
    wadah.innerHTML = "";

    if (!S.deck || !S.deck.pages || !S.deck.pages.length) {
      if (penghitung) penghitung.textContent = "Halaman —";
      return;
    }

    var aktif = halamanAktif();
    var indeks = 0;

    S.deck.pages.forEach(function (h, i) {
      if (aktif && aktif.id === h.id) indeks = i;
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

    if (penghitung) {
      penghitung.textContent = "Halaman " + (indeks + 1) + " dari " + S.deck.pages.length;
    }
  }

  function renderPapan() {
    var papan = $("#papan");
    var kosong = $("#papan-kosong");
    if (!papan) return;

    var aktif = halamanAktif();
    if (!aktif) {
      S.adaWidgetWaktu = false;
      papan.hidden = true;
      if (kosong) kosong.hidden = true;
      return;
    }

    /* Interval 1 detik hanya perlu jalan bila papan memang punya widget waktu. */
    S.adaWidgetWaktu = aktif.keys.some(function (k) {
      return k && k.widget && (k.widget.type === "jam" || k.widget.type === "tanggal");
    });

    terapkanKolom();
    papan.innerHTML = "";

    var adaTombol = false;
    aktif.keys.forEach(function (key) {
      var tombol = KD.buatTombol(key, { sunting: false });
      /* Jangan pasang isyarat suara pada tombol papan: getaran adalah
         umpan balik utama di ponsel, suara berulang akan mengganggu. */
      tombol.removeAttribute("data-kumi-cue");
      if (key) {
        adaTombol = true;
        if (key.widget) {
          /* Widget: hanya tampilan, tidak ada aksi yang dikirim. */
          tombol.setAttribute("aria-disabled", "true");
        } else if (key.actionKedua) {
          /* Tekan lama = aksi kedua; ketuk = aksi utama. */
          tombol.setAttribute(
            "aria-label",
            key.label + " — ketuk: " + KD.jelaskan(key.action) + "; tekan lama: " + KD.jelaskan(key.actionKedua)
          );
          KD.pasangTekan(tombol, {
            ketuk: function () {
              tekanTombol(aktif.id, key.id, tombol, false);
            },
            lama: function () {
              getar([0, 18, 40, 18]);
              tekanTombol(aktif.id, key.id, tombol, true);
            },
          });
        } else {
          tombol.addEventListener("click", function () {
            tekanTombol(aktif.id, key.id, tombol, false);
          });
        }
      }
      papan.appendChild(tombol);
    });

    /* Skala tombol per halaman, sama seperti di desktop. */
    papan.style.setProperty("--kd-skala", String((aktif.skala || 100) / 100));

    papan.hidden = false;
    papan.setAttribute("aria-busy", "false");
    papan.setAttribute("aria-label", "Papan tombol halaman " + aktif.name);
    if (kosong) kosong.hidden = adaTombol;
    sembunyikanMemuat();
  }

  function renderAktivitasTerakhir() {
    var el = $("#info-aktivitas");
    if (!el) return;
    var a = S.aktivitas && S.aktivitas[0];
    if (!a) {
      el.textContent = "Belum ada aktivitas.";
      return;
    }
    var status = a.ok ? "berhasil" : "gagal";
    el.textContent = (a.label || "Tombol") + " · " + status + " · " + KD.relatif(a.time);
  }

  function renderSemua() {
    if (S.deck && S.deck.settings) KD.terapkanAksen(S.deck.settings.aksen);
    renderJudul();
    renderStatus();
    renderHalaman();
    renderPapan();
    renderAktivitasTerakhir();
    isiInfoPerangkat();
  }

  /* ------------------------------------------------------------- kolom --- */
  function hitungKolom() {
    var w = window.innerWidth || document.documentElement.clientWidth || 0;
    var h = window.innerHeight || document.documentElement.clientHeight || 0;
    var lanskap = w > h;
    var kolom;

    if (S.deck && S.deck.profile && w >= 700) {
      /* Layar lebar (tablet): ikuti setelan papan dari komputer. */
      kolom = S.deck.profile.columns;
    } else if (lanskap) {
      /* Ponsel mendatar: banyak tombol dalam satu baris. */
      kolom = 5;
    } else {
      /* Ponsel tegak: 4 kolom; layar sangat sempit (≤360 px) turun ke 3. */
      kolom = w <= 360 ? 3 : 4;
    }

    kolom = Math.round(Number(kolom));
    if (!kolom || kolom < 3) kolom = 3;
    if (kolom > 6) kolom = 6;
    return kolom;
  }

  function terapkanKolom() {
    var papan = $("#papan");
    if (!papan) return;
    papan.style.setProperty("--kd-cols", String(hitungKolom()));
  }

  function jadwalkanUbahUkuran() {
    if (S.raf) return;
    if (typeof window.requestAnimationFrame !== "function") {
      terapkanKolom();
      return;
    }
    S.raf = window.requestAnimationFrame(function () {
      S.raf = 0;
      if (S.deck) terapkanKolom();
    });
  }

  /* ---------------------------------------------------------------- state --- */
  function terapkanState(state) {
    if (!state || !state.deck || !Array.isArray(state.deck.pages) || !state.deck.pages.length) {
      return;
    }

    S.deck = state.deck;
    S.devices = state.devices || [];
    S.aktivitas = state.activity || [];
    if (state.live) KD.live = state.live;
    if (state.sinyal) KD.sinyal = state.sinyal;
    S.online = true;
    S.siap = true;

    /* Halaman awal perangkat ini menang atas setelan papan. */
    var awalPerangkat = bacaLokal(AWAL_KEY);
    var tersimpan = bacaLokal(HALAMAN_KEY);
    if (!halamanAda(S.halamanId)) {
      if (halamanAda(awalPerangkat)) S.halamanId = awalPerangkat;
      else if (halamanAda(tersimpan)) S.halamanId = tersimpan;
      else if (S.deck.settings && halamanAda(S.deck.settings.home)) S.halamanId = S.deck.settings.home;
      else S.halamanId = S.deck.pages[0].id;
    }

    sembunyikanPasangan();
    sembunyikanGalatMuat();
    renderSemua();
    terapkanKios();
    segarkanHalamanAwal();
  }

  function pesanGalat(galat) {
    if (galat && galat.status === 0) {
      return "Tidak dapat menghubungi server. Pastikan KumiDeck masih berjalan dan ponsel berada di jaringan Wi-Fi yang sama.";
    }
    if (galat && galat.status === 429) {
      return galat.message || "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.";
    }
    return (galat && galat.message) || "Papan tidak dapat dimuat. Coba lagi sebentar.";
  }

  function muatState() {
    return KD.api("/api/state")
      .then(function (state) {
        terapkanState(state);
        return state;
      })
      .catch(function (galat) {
        S.online = false;
        S.siap = false;
        renderStatus();

        if (galat && galat.status === 401) {
          tanganiButuhPasangan(
            "Kode pasangan tidak berlaku lagi. Masukkan kode baru dari layar komputer."
          );
          throw galat;
        }

        if (!S.deck) tampilkanGalatMuat(pesanGalat(galat));
        throw galat;
      });
  }

  /* ------------------------------------------------------------------ SSE --- */
  function sambungkan() {
    /* ?nostream=1 dipakai untuk tangkapan layar/pratinjau: tanpa SSE, peramban
       tanpa antarmuka tidak menunggu sambungan yang memang tak pernah tutup. */
    if (/[?&]nostream=1/.test(window.location.search)) return;
    if (S.stream) {
      try {
        S.stream.tutup();
      } catch (err) {
        /* diabaikan */
      }
      S.stream = null;
    }

    S.stream = KD.stream({
      onOpen: function () {
        S.online = true;
        renderStatus();
      },
      onClose: function () {
        S.online = false;
        renderStatus();
      },
      onSync: function (state) {
        terapkanState(state);
      },
      onDevices: function (devices) {
        S.devices = devices || [];
      },
      onActivity: function (aktivitas) {
        S.aktivitas = aktivitas || [];
        renderAktivitasTerakhir();
      },
      onLive: function (data) {
        KD.live = data;
        KD.segarkanWidget();
      },
      /* #20 penanda status + #16 profil otomatis di ponsel. */
      onSinyal: function (data) {
        KD.sinyal = data;
        KD.segarkanPenanda(data);
      },
      onProfil: function (data) {
        if (!data || !data.pageId) return;
        if (!halamanAda(data.pageId) || S.halamanId === data.pageId) return;
        S.halamanId = data.pageId;
        renderSemua();
        try {
          if (navigator.vibrate) navigator.vibrate(20);
        } catch (err) {
          /* diabaikan */
        }
      },
      onPress: function (ev) {
        /* Kilat kecil saat aksi datang dari perangkat lain; aksi sendiri
           sudah dikilatkan langsung saat diketuk. */
        if (!ev || ev.deviceId === KD.deviceId) return;
        if (!S.deck || ev.pageId !== S.halamanId) return;
        var tombol = document.querySelector('[data-key-id="' + ev.keyId + '"]');
        if (!tombol) return;
        KD.kilat(tombol);
        tombol.classList.add("kena-aksi");
        window.setTimeout(function () {
          tombol.classList.remove("kena-aksi");
        }, 520);
      },
    });
  }

  /* ---------------------------------------------------------------- tekan --- */
  function tekanTombol(pageId, keyId, tombol, kedua) {
    if (!pageId || !keyId || !tombol || tombol.disabled) return;

    KD.kilat(tombol);
    getar(kedua ? [0, 18, 40, 18] : 10);
    tombol.classList.add("kena-aksi");
    window.setTimeout(function () {
      tombol.classList.remove("kena-aksi");
    }, 520);

    KD.tekan(pageId, keyId, kedua)
      .then(function (hasil) {
        if (!hasil) return;
        if (Array.isArray(hasil.activity)) {
          S.aktivitas = hasil.activity;
          renderAktivitasTerakhir();
        }
        if (hasil.navigate) pindahHalaman(hasil.navigate);
        if (hasil.ok === false) {
          tolakTombol(tombol, hasil.message || "Aksi gagal dijalankan.");
        }
      })
      .catch(function (galat) {
        if (galat && galat.status === 401) {
          tanganiButuhPasangan(
            "Kode pasangan tidak berlaku lagi. Masukkan kode baru dari layar komputer."
          );
          return;
        }
        if (galat && galat.status === 409 && galat.code === "butuh-izin") {
          izinkanSkrip(pageId, keyId, kedua, galat.message, tombol);
          return;
        }
        if (galat && galat.status === 0) {
          S.online = false;
          renderStatus();
        }
        tolakTombol(tombol, (galat && galat.message) || "Server tidak menjawab. Coba lagi.");
      });
  }

  /* Skrip di komputer host butuh izin sekali; konfirmasi ditampilkan di sini. */
  function izinkanSkrip(pageId, keyId, kedua, pesan, tombol) {
    var teks =
      KD.t(pesan || "Jalankan skrip di komputer ini?") +
      "\n\n" +
      KD.t("Setujui hanya bila berkas skrip itu kamu pasang sendiri di komputer host.");
    if (!window.confirm(teks)) {
      KD.toast("Skrip tidak dijalankan.", "info");
      return;
    }
    KD.izinkanSkrip(pageId, keyId, kedua)
      .then(function (hasil) {
        if (hasil && hasil.ok) {
          KD.toast(hasil.message || "Skrip dijalankan.", "ok");
          getar([0, 20, 30, 20]);
          if (Array.isArray(hasil.activity)) {
            S.aktivitas = hasil.activity;
            renderAktivitasTerakhir();
          }
        } else {
          tolakTombol(tombol, (hasil && hasil.message) || "Skrip gagal dijalankan.");
        }
      })
      .catch(function (galat) {
        if (galat && galat.status === 401) {
          tanganiButuhPasangan(
            "Kode pasangan tidak berlaku lagi. Masukkan kode baru dari layar komputer."
          );
          return;
        }
        tolakTombol(tombol, (galat && galat.message) || "Skrip gagal dijalankan.");
      });
  }

  function tolakTombol(tombol, pesan) {
    if (tombol) {
      tombol.classList.add("is-ditolak");
      window.setTimeout(function () {
        tombol.classList.remove("is-ditolak");
      }, 480);
    }
    KD.toast(pesan || "Aksi gagal dijalankan.", "danger");
    getar([0, 30, 40, 30]);
  }

  function pindahHalaman(id) {
    if (!halamanAda(id)) return;
    S.halamanId = id;
    tulisLokal(HALAMAN_KEY, id);
    renderJudul();
    renderHalaman();
    renderPapan();
    segarkanHalamanAwal();
  }

  /* --------------------------------------------------------------- lapis --- */
  function tampilkanMemuat() {
    var memuat = $("#memuat");
    if (memuat) memuat.hidden = false;
    var papan = $("#papan");
    if (papan) papan.hidden = true;
    var kosong = $("#papan-kosong");
    if (kosong) kosong.hidden = true;
  }

  function sembunyikanMemuat() {
    var memuat = $("#memuat");
    if (memuat) memuat.hidden = true;
  }

  function tampilkanGalatMuat(pesan) {
    sembunyikanMemuat();
    var papan = $("#papan");
    if (papan) papan.hidden = true;
    var kosong = $("#papan-kosong");
    if (kosong) kosong.hidden = true;
    var teks = $("#galat-pesan");
    if (teks) teks.textContent = pesan || "Papan tidak dapat dimuat. Coba lagi.";
    var lapis = $("#lapis-galat");
    if (lapis) lapis.hidden = false;
    renderStatus();
  }

  function sembunyikanGalatMuat() {
    var lapis = $("#lapis-galat");
    if (lapis) lapis.hidden = true;
  }

  function tampilkanGalatPasangan(pesan) {
    var galat = $("#galat-pasangan");
    if (!galat) return;
    galat.textContent = pesan || "";
    galat.hidden = !pesan;
  }

  function tampilkanPasangan(pesan) {
    tutupSetelan();
    sembunyikanMemuat();
    sembunyikanGalatMuat();
    S.pairing = true;
    S.online = false;
    S.siap = false;
    renderStatus();

    var papan = $("#papan");
    if (papan) {
      papan.hidden = true;
      papan.innerHTML = "";
    }
    var kosong = $("#papan-kosong");
    if (kosong) kosong.hidden = true;

    var input = $("#input-kode");
    if (input) {
      input.value = "";
      input.removeAttribute("aria-invalid");
    }

    tampilkanGalatPasangan(pesan || "");

    var lapis = $("#lapis-pasangan");
    if (!lapis) return;
    lapis.hidden = false;
    window.setTimeout(function () {
      if (!input) return;
      try {
        input.focus();
      } catch (err) {
        /* fokus diabaikan bila peramban menolak */
      }
    }, 80);
  }

  function sembunyikanPasangan() {
    S.pairing = false;
    var lapis = $("#lapis-pasangan");
    if (lapis) lapis.hidden = true;
    var galat = $("#galat-pasangan");
    if (galat) {
      galat.hidden = true;
      galat.textContent = "";
    }
  }

  function tutupSetelan() {
    var lapis = $("#lapis-setelan");
    if (!lapis) return;
    lapis.classList.remove("is-open");
    lapis.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  /* -------------------------------------------------------------- pasangan --- */
  function bersihkanToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (err) {
      /* diabaikan */
    }
    KD.token = "";
  }

  function tanganiButuhPasangan(pesan) {
    bersihkanToken();
    if (S.stream) {
      try {
        S.stream.tutup();
      } catch (err) {
        /* diabaikan */
      }
      S.stream = null;
    }
    S.deck = null;
    S.siap = false;
    S.online = false;
    S.halamanId = "";
    renderStatus();
    renderJudul();
    renderHalaman();
    tampilkanPasangan(pesan || "");
  }

  function pesanGalatPasangan(galat) {
    if (!galat) return "Tidak dapat memasangkan perangkat.";
    if (galat.status === 401) return "Kode pasangan salah. Periksa kode di layar komputer.";
    if (galat.status === 429) {
      return galat.message || "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.";
    }
    if (galat.status === 0) return "Tidak dapat menghubungi server. Pastikan KumiDeck masih berjalan.";
    return galat.message || "Tidak dapat memasangkan perangkat.";
  }

  function mulaiMuat() {
    sembunyikanPasangan();
    tampilkanMemuat();
    muatState()
      .then(function () {
        sambungkan();
        KD.kirimHello().catch(function () {
          /* diabaikan: SSE sudah mendaftarkan perangkat */
        });
      })
      .catch(function () {
        /* galat muat atau pasangan sudah ditampilkan */
      });
  }

  function kirimKode(ev) {
    ev.preventDefault();
    var input = $("#input-kode");
    var tombol = $("#btn-pasangkan");
    if (!input || !tombol) return;

    var mentah = String(input.value || "")
      .trim()
      .toLowerCase()
      .replace(/[-\s]/g, "");

    if (!/^[a-z0-9]{8}$/.test(mentah)) {
      tampilkanGalatPasangan("Kode harus 8 karakter, misalnya abcd-efgh.");
      input.setAttribute("aria-invalid", "true");
      try {
        input.focus();
      } catch (err) {
        /* diabaikan */
      }
      getar([0, 30, 40, 30]);
      return;
    }

    tombol.disabled = true;
    tombol.classList.add("is-loading");
    tombol.textContent = "Memeriksa…";

    function pulihkan() {
      tombol.disabled = false;
      tombol.classList.remove("is-loading");
      tombol.textContent = "Pasangkan";
    }

    KD.api("/api/pair", {
      method: "POST",
      body: {
        code: mentah,
        /* Token per perangkat: mencabut satu ponsel tidak mengganggu yang lain. */
        deviceId: KD.deviceId,
        platform: KD.platform,
        nama: KD.namaPerangkat ? KD.namaPerangkat() : "",
      },
    })
      .then(function (hasil) {
        var token = hasil && hasil.token;
        if (!token) throw new Error("Server tidak mengirim kode pasangan.");
        tulisLokal(TOKEN_KEY, token);
        KD.token = token;
        pulihkan();
        mulaiMuat();
      })
      .catch(function (galat) {
        pulihkan();
        tampilkanGalatPasangan(pesanGalatPasangan(galat));
        input.setAttribute("aria-invalid", "true");
        try {
          input.focus();
        } catch (err) {
          /* diabaikan */
        }
        getar([0, 30, 40, 30]);
      });
  }

  function putuskanPasangan() {
    bersihkanToken();
    if (S.stream) {
      try {
        S.stream.tutup();
      } catch (err) {
        /* diabaikan */
      }
      S.stream = null;
    }
    S.deck = null;
    S.devices = [];
    S.aktivitas = [];
    S.siap = false;
    S.online = false;
    S.halamanId = "";
    renderStatus();
    renderJudul();
    renderHalaman();
    tampilkanPasangan("");
  }

  function cobaMuatUlang() {
    sembunyikanGalatMuat();
    tampilkanMemuat();
    muatState()
      .then(function () {
        sambungkan();
        KD.kirimHello().catch(function () {
          /* diabaikan */
        });
      })
      .catch(function () {
        /* pesan galat sudah diperbarui */
      });
  }

  /* ------------------------------------------------- halaman awal & kios --- */
  /* Favorit/halaman awal disimpan di perangkat, bukan di server, supaya tiap
     ponsel bisa punya halaman pembuka sendiri. */
  function segarkanHalamanAwal() {
    var info = $("#info-halaman-awal");
    var label = $("#label-halaman-awal");
    var btn = $("#btn-halaman-awal");
    var awal = bacaLokal(AWAL_KEY);
    var aktif = halamanAktif();
    if (info) {
      info.textContent = halamanAda(awal)
        ? "Halaman awal: " + (S.deck.pages.filter(function (h) { return h.id === awal; })[0] || {}).name
        : "Mengikuti setelan papan.";
    }
    if (btn && label) {
      var iniAwal = aktif && awal === aktif.id;
      label.textContent = iniAwal ? "Halaman ini awal (ketuk untuk lepas)" : "Jadikan halaman ini awal";
      btn.setAttribute("aria-pressed", iniAwal ? "true" : "false");
    }
  }

  function toggleHalamanAwal() {
    var aktif = halamanAktif();
    if (!aktif) return;
    if (bacaLokal(AWAL_KEY) === aktif.id) {
      tulisLokal(AWAL_KEY, "");
      KD.toast("Halaman awal mengikuti setelan papan.", "ok");
    } else {
      tulisLokal(AWAL_KEY, aktif.id);
      KD.toast("Halaman " + aktif.name + " jadi halaman awal perangkat ini.", "ok");
    }
    segarkanHalamanAwal();
    getar(12);
  }

  /* Mode kios: layar penuh. Wake Lock menjaga layar tetap menyala —
     hanya tersedia di secure context (HTTPS lokal) dan peramban yang setuju. */
  function terapkanKios(beriTahu) {
    var kios = bacaLokal(KIOS_KEY) === "1";
    var gagal = function () {
      if (beriTahu) {
        KD.toast("Layar penuh ditolak peramban. Ketuk sekali di halaman lalu coba lagi.", "danger");
      }
    };
    if (kios) {
      var el = document.documentElement;
      var minta =
        el.requestFullscreen ||
        el.webkitRequestFullscreen ||
        el.msRequestFullscreen;
      if (minta && !document.fullscreenElement) {
        try {
          var hasil = minta.call(el);
          if (hasil && typeof hasil.catch === "function") hasil.catch(gagal);
        } catch (err) {
          gagal();
        }
      }
    } else if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(function () {});
    }
    perbaruiWakeLock();
  }

  function perbaruiWakeLock() {
    var mau = bacaLokal(JAGA_KEY) === "1";
    if (!("wakeLock" in navigator)) {
      var info = $("#setelan-jaga-layar");
      if (info) info.disabled = true;
      return;
    }
    if (mau && S.siap && !S.wakeLock) {
      navigator.wakeLock
        .request("screen")
        .then(function (kunci) {
          S.wakeLock = kunci;
          kunci.addEventListener("release", function () {
            S.wakeLock = null;
          });
        })
        .catch(function () {
          /* peramban menolak (baterai rendah / bukan HTTPS) */
        });
    } else if (!mau && S.wakeLock) {
      S.wakeLock.release().catch(function () {});
      S.wakeLock = null;
    }
  }

  function isiSakelarPerangkat() {
    var kios = $("#setelan-kios");
    var jaga = $("#setelan-jaga-layar");
    if (kios) kios.checked = bacaLokal(KIOS_KEY) === "1";
    if (jaga) jaga.checked = bacaLokal(JAGA_KEY) === "1";
    segarkanHalamanAwal();
  }

  /* -------------------------------------------------------------- perangkat --- */
  function isiInfoPerangkat() {
    var el = $("#info-perangkat");
    if (el) {
      var id = KD.deviceId || "—";
      var pendek = id.length > 10 ? id.slice(0, 10) : id;
      var platform = KD.platform === "android" ? "Remote" : KD.t("Peramban");
      var status = KD.token ? KD.t("terpasang") : KD.t("belum terpasang");
      el.textContent = "ID " + pendek + " · " + platform + " · " + status;
    }
    var pilihBahasa = $("#pilih-bahasa-remote");
    if (pilihBahasa) pilihBahasa.value = KD.bahasa;
    renderAktivitasTerakhir();
  }

  /* Pemilih bahasa di pengaturan perangkat. */
  function ikatPemilihBahasa() {
    var pilih = $("#pilih-bahasa-remote");
    if (!pilih) return;
    pilih.addEventListener("change", function () {
      KD.pasangBahasa(pilih.value);
      renderSemua();
      KD.toast(pilih.value === "en" ? "Interface language: English." : "Bahasa antarmuka: Indonesia.", "ok");
    });
  }

  /* ----------------------------------------------------------------- tema --- */
  function temaGelap() {
    var root = document.documentElement;
    var mode = root.getAttribute("data-kumi-theme") || root.getAttribute("data-theme") || "";
    return mode === "dark";
  }

  function perbaruiIkonTema() {
    var nama = temaGelap() ? "i-sun" : "i-moon";
    $$("[data-ikon-tema] use").forEach(function (use) {
      use.setAttribute("href", "#" + nama);
    });
  }

  function pasangPengamatTema() {
    if (typeof window.MutationObserver !== "function") return;
    new window.MutationObserver(perbaruiIkonTema).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-kumi-theme", "data-theme"],
    });
  }

  /* -------------------------------------------------------------- banner --- */
  /* ----------------------------------------------------------- aplikasi web --- */
  /* Bagian kecil untuk PWA: daftarkan service worker, kenali mode layar penuh,
     dan buat tombol banner benar-benar memasang aplikasi bila peramban
     mendukung beforeinstallprompt. Tidak menyentuh logika papan. */
  function modeMandiri() {
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
    } catch (err) {
      /* matchMedia tidak tersedia: lanjut ke pemeriksaan berikut */
    }
    return navigator.standalone === true;
  }

  function tandaiModeLayar() {
    var mandiri = modeMandiri();
    if (document.body) document.body.classList.toggle("is-standalone", mandiri);
    /* Banner hanya berguna saat aplikasi belum terpasang. */
    if (mandiri) {
      var banner = $("#banner-pasang");
      if (banner) banner.hidden = true;
    }
    return mandiri;
  }

  function pasangPengamatTampilan() {
    if (!window.matchMedia) return;
    try {
      var kueri = window.matchMedia("(display-mode: standalone)");
      if (typeof kueri.addEventListener === "function") {
        kueri.addEventListener("change", tandaiModeLayar);
      } else if (typeof kueri.addListener === "function") {
        kueri.addListener(tandaiModeLayar);
      }
    } catch (err) {
      /* diabaikan */
    }
    tandaiModeLayar();
  }

  function daftarServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    var protokol = location.protocol;
    if (protokol !== "http:" && protokol !== "https:") return;
    try {
      navigator.serviceWorker.register("/sw.js").catch(function () {
        /* pendaftaran gagal: halaman tetap jalan tanpa cache */
      });
    } catch (err) {
      /* diabaikan */
    }
  }

  function siapkanPwa() {
    var samaran = { pasang: null };

    pasangPengamatTampilan();
    tandaiModeLayar();

    /* Konteks tidak aman (http://alamat-LAN): Chrome TIDAK akan
       menawarkan pemasangan PWA. Jelaskan jalan keluarnya, jangan biarkan
       pengguna menebak. */
    if (!window.isSecureContext) {
      var bannerTidakAman = $("#banner-pasang");
      if (bannerTidakAman && !bacaLokal(HINT_KEY)) {
        bannerTidakAman.hidden = false;
        bannerTidakAman.classList.add("kd-remote__banner--info");
        var judulTidakAman = bannerTidakAman.querySelector("strong");
        var hintTidakAman = bannerTidakAman.querySelector(".kd-hint");
        if (judulTidakAman) judulTidakAman.textContent = "Pemasangan butuh HTTPS";
        if (hintTidakAman) {
          hintTidakAman.textContent =
            "Chrome hanya bisa memasang aplikasi lewat HTTPS. Di desktop jalankan start-https.cmd, pasang sertifikat di perangkat Remote, lalu buka tautan https.";
        }
      }
    }

    /* Simpan peristiwa pemasangan agar tombol banner bisa memicunya. */
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      samaran.pasang = e;
      if (!bacaLokal(HINT_KEY)) {
        var banner = $("#banner-pasang");
        if (banner) banner.hidden = false;
        var judul = $("#banner-pasang strong");
        var hint = $("#banner-pasang .kd-hint");
        if (judul) judul.textContent = "Pasang KumiDeck";
        if (hint) hint.textContent = "Ketuk untuk memasang di layar utama.";
        var tutup = $("#btn-tutup-banner");
        if (tutup) tutup.setAttribute("aria-label", "Nanti saja");
      }
    });

    /* Bila peristiwa sudah tiba sebelum berkas ini selesai dimuat. */
    if (window.deferredPrompt) samaran.pasang = window.deferredPrompt;

    var banner = $("#banner-pasang");
    if (banner) {
      banner.addEventListener("click", function (e) {
        var target = e.target;
        if (!target || !target.closest) return;
        if (target.closest("#btn-tutup-banner")) return;
        if (!samaran.pasang) return; /* belum bisa dipasang: abaikan */
        samaran.pasang.prompt();
        var hasil = samaran.pasang.userChoice;
        samaran.pasang = null;
        if (hasil && typeof hasil.then === "function") {
          hasil.then(function (pilihan) {
            if (pilihan && pilihan.outcome === "accepted") {
              tutupBanner();
              tandaiModeLayar();
            } else {
              tulisLokal(HINT_KEY, "1");
              if (banner) banner.hidden = true;
            }
          });
        }
      });
    }

    /* Daftarkan setelah halaman selesai dimuat supaya tidak berebut bandwidth. */
    if (document.readyState === "complete") {
      daftarServiceWorker();
    } else {
      window.addEventListener("load", daftarServiceWorker);
    }
  }

  function renderBanner() {
    var banner = $("#banner-pasang");
    if (!banner) return;
    banner.hidden = !!bacaLokal(HINT_KEY) || modeMandiri();
  }

  function tutupBanner() {
    tulisLokal(HINT_KEY, "1");
    var banner = $("#banner-pasang");
    if (banner) banner.hidden = true;
  }

  /* -------------------------------------------------------------- ikat --- */
  function ikatPeristiwa() {
    var form = $("#form-pasangan");
    if (form) form.addEventListener("submit", kirimKode);

    var input = $("#input-kode");
    if (input) {
      input.addEventListener("input", function () {
        input.removeAttribute("aria-invalid");
        tampilkanGalatPasangan("");
      });
    }

    var btnSetelan = $("#btn-setelan");
    if (btnSetelan) {
      btnSetelan.addEventListener("click", function () {
        isiInfoPerangkat();
        isiSakelarPerangkat();
      });
    }

    var btnPutus = $("#btn-putuskan");
    if (btnPutus) btnPutus.addEventListener("click", putuskanPasangan);

    /* Halaman awal perangkat. */
    var btnAwal = $("#btn-halaman-awal");
    if (btnAwal) btnAwal.addEventListener("click", toggleHalamanAwal);

    /* Mode kios + layar tetap menyala. */
    var kios = $("#setelan-kios");
    if (kios) {
      kios.addEventListener("change", function () {
        tulisLokal(KIOS_KEY, kios.checked ? "1" : "0");
        terapkanKios(true);
      });
    }
    var jaga = $("#setelan-jaga-layar");
    if (jaga) {
      jaga.addEventListener("change", function () {
        tulisLokal(JAGA_KEY, jaga.checked ? "1" : "0");
        perbaruiWakeLock();
        if (jaga.checked && !("wakeLock" in navigator)) {
          KD.toast("Peramban ini belum mendukung Wake Lock.", "danger");
        }
      });
    }

    /* Wake lock dilepas saat tab disembunyikan; minta ulang saat tampil. */
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible") return;
      if (S.wakeLock) return;
      perbaruiWakeLock();
    });

    var btnCobaLagi = $("#btn-coba-lagi");
    if (btnCobaLagi) btnCobaLagi.addEventListener("click", cobaMuatUlang);

    var btnTutupBanner = $("#btn-tutup-banner");
    if (btnTutupBanner) btnTutupBanner.addEventListener("click", tutupBanner);

    window.addEventListener("resize", jadwalkanUbahUkuran);
    window.addEventListener("orientationchange", function () {
      window.setTimeout(terapkanKolom, 180);
    });
  }

  /* --------------------------------------------------------------- mulai --- */
  function mulai() {
    if (window.Kumi && Kumi.theme && typeof Kumi.theme.init === "function") {
      Kumi.theme.init();
    }
    if (typeof KD.siapkanIkon === "function") KD.siapkanIkon();

    ikatPeristiwa();
    ikatPemilihBahasa();
    KD.siapkanIkonTema();
    KD.amatiBahasa();
    KD.terapkanBahasa();
    pasangPengamatTema();
    perbaruiIkonTema();
    renderBanner();
    siapkanPwa();
    renderStatus();
    renderJudul();

    /* Jam dan tanggal diperbarui tiap detik, hanya bila widget waktu tampil. */
    window.setInterval(function () {
      if (S.adaWidgetWaktu) KD.segarkanWidget();
    }, 1000);

    if (!KD.token) {
      tampilkanPasangan("");
      return;
    }

    tampilkanMemuat();
    muatState()
      .then(function () {
        sambungkan();
        KD.kirimHello().catch(function () {
          /* diabaikan */
        });
      })
      .catch(function () {
        /* galat atau pasangan sudah ditampilkan di muatState */
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mulai);
  } else {
    mulai();
  }
})();







