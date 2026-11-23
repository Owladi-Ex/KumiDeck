/* Remote ponsel 2.4.0 (Rangka).
   Kontraknya sama dengan 2.3.0: token di header x-kumi-token, SSE /api/events,
   tekan lewat /api/press, suara lewat /api/audio/*. Tidak ada akses data lokal
   selain token dan tema milik perangkat ini. */
(function () {
  "use strict";

  var TOKEN = "kumideck-token-remote";
  var TEMA = "kumideck-tema";
  var DEVICE = "kumideck-perangkat";

  var S = {
    deck: null,
    token: "",
    pageId: "",
    view: "papan",
    theme: "light",
    live: { media: { ada: false, judul: "", artis: "" } },
    sinyal: { volume: null },
    monitor: { ada: false, cpu: 0, ram: 0, ramTotal: 0, gpu: null, down: 0, up: 0, ping: null },
    suara: [],
    memutar: false,
    folder: null,
    server: null
  };

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  var esc = function (t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  var ic = function (id) {
    return '<svg class="icon" aria-hidden="true"><use href="#' + id + '"></use></svg>';
  };

  /* Ikon papan 2.3.0 memakai awalan i-; sprite 2.4.0 memakai k-. */
  var ikon = function (id) {
    var nama = String(id || "").trim();
    if (!nama) return "k-grid";
    if (nama.indexOf("i-") === 0) nama = "k-" + nama.slice(2);
    if (!nama || nama === "k-") return "k-grid";
    if (!(nama.indexOf("k-") === 0 || nama.indexOf("kd-") === 0)) nama = "k-" + nama;
    return nama;
  };

  var simpanLokal = function (kunci, nilai) {
    try { localStorage.setItem(kunci, nilai); } catch (e) { /* mode privat */ }
  };
  var ambilLokal = function (kunci) {
    try { return localStorage.getItem(kunci) || ""; } catch (e) { return ""; }
  };

  var perangkatId = (function () {
    var id = ambilLokal(DEVICE);
    if (!id) {
      id = "d_" + Math.random().toString(36).slice(2, 10);
      simpanLokal(DEVICE, id);
    }
    return id;
  })();

  var namaPerangkat = function () {
    var ua = navigator.userAgent || "";
    if (/iPhone/i.test(ua)) return "iPhone";
    if (/iPad/i.test(ua)) return "iPad";
    if (/Android/i.test(ua)) return "Ponsel Android";
    return "Peramban";
  };

  /* ------------------------------------------------------------- jaringan --- */

  var api = function (jalur, opsi) {
    opsi = opsi || {};
    var headers = { accept: "application/json" };
    if (S.token) headers["x-kumi-token"] = S.token;
    var init = { method: opsi.method || "GET", headers: headers };
    if (opsi.body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(opsi.body);
    }
    return fetch(jalur, init).then(function (res) {
      return res.text().then(function (teks) {
        var data = null;
        try { data = teks ? JSON.parse(teks) : null; } catch (e) { data = null; }
        if (res.status === 401 || res.status === 403) {
          if (!opsi.diam) mintaPasangan("Kode pasangan tidak berlaku lagi.");
          var galat = new Error("Tidak berwenang.");
          galat.status = res.status;
          throw galat;
        }
        if (!res.ok) {
          var g = new Error((data && data.message) || "Permintaan gagal.");
          g.status = res.status;
          g.data = data;
          throw g;
        }
        return data || {};
      });
    });
  };

  /* ------------------------------------------------------------- tampilan --- */

  var toast = function (pesan, ok) {
    var el = $("#kdRmToast");
    if (!el) return;
    el.textContent = pesan;
    el.setAttribute("data-s", ok ? "ok" : "fail");
    el.classList.add("is-on");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove("is-on"); }, 2600);
  };

  var pasangTema = function (tema) {
    S.theme = tema === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = S.theme;
    simpanLokal(TEMA, S.theme);
    $$("#kdRmTema button").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.tema === S.theme ? "true" : "false");
    });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", S.theme === "dark" ? "#14161a" : "#eeede8");
  };

  var halamanAktif = function () {
    if (!S.deck || !S.deck.pages) return null;
    var ketemu = S.deck.pages.filter(function (p) { return p.id === S.pageId; })[0];
    return ketemu || S.deck.pages[0] || null;
  };

  var angka = function (n, desimal) {
    if (n == null || isNaN(n)) return "—";
    var t = desimal ? Number(n).toFixed(desimal) : String(Math.round(n));
    return t.replace(".", ",");
  };

  var jamNow = function () {
    var d = new Date();
    return String(d.getHours()).padStart(2, "0") + "." + String(d.getMinutes()).padStart(2, "0");
  };
  var tglNow = function () {
    var d = new Date();
    return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
  };

  var widgetHTML = function (attrs, key) {
    var w = key.widget;
    var m = S.monitor;
    if (w === "jam") {
      return '<div ' + attrs + ' data-widget="jam" role="img" aria-label="Jam ' + jamNow() + '">' +
        '<span class="kd-tile-time">' + jamNow() + '</span>' +
        '<span class="kd-tile-date">' + esc(tglNow()) + '</span></div>';
    }
    if (w === "media") {
      var md = S.live.media || {};
      var ada = !!(md.ada && md.judul);
      return '<div ' + attrs + ' data-widget="media" role="img" aria-label="Sedang diputar: ' +
        esc(ada ? md.judul : "tidak ada media") + '">' +
        '<span class="kd-tile-ico">' + ic(ikon(key.icon || "k-music")) + '</span>' +
        '<span class="kd-tile-media-val">' + esc(ada ? md.judul : "Tidak ada media") + '</span>' +
        '<span class="kd-tile-label">' + esc(ada && md.artis ? md.artis : "Media") + '</span></div>';
    }
    var peta = {
      cpu: { label: "CPU", ikon: "kd-cpu", nilai: m.ada ? angka(m.cpu) + "%" : "—" },
      ram: { label: "RAM", ikon: "kd-ram", nilai: m.ada ? angka(m.ram, 1) + " GB" : "—" },
      gpu: { label: "GPU", ikon: "kd-gpu", nilai: m.gpu == null ? "—" : angka(m.gpu) + "%" },
      jaringan: { label: "Jaringan", ikon: "kd-network", nilai: m.ada ? angka(m.down, 1) + " Mb/s" : "—" }
    };
    var info = peta[w];
    if (!info) return "";
    return '<div ' + attrs + ' data-widget="' + w + '" role="img" aria-label="' + info.label + ' ' + info.nilai + '">' +
      '<span class="kd-mon-top">' + ic(info.ikon) + '<span>' + info.label + '</span></span>' +
      '<span class="kd-mon-val">' + esc(info.nilai) + '</span></div>';
  };

  var tileStyle = function (key) {
    var bagian = [];
    if (key.span && key.span.c > 1) bagian.push("grid-column:span " + key.span.c);
    if (key.span && key.span.r > 1) bagian.push("grid-row:span " + key.span.r);
    if (key.warna && key.warna.bg) {
      bagian.push("--tile-bg:" + key.warna.bg);
      bagian.push("--tile-line:" + key.warna.bg);
      bagian.push("--tile-ink:" + (key.warna.fg || "#fff"));
    }
    return bagian.join(";");
  };

  var tileHTML = function (key, idx) {
    var attrs = 'class="kd-tile" data-variant="' + esc(key.variant || "default") + '"' +
      ' data-idx="' + idx + '"' + (tileStyle(key) ? ' style="' + tileStyle(key) + '"' : "");
    if (key.widget) {
      var w = widgetHTML(attrs, key);
      if (w) return w;
    }
    var label = esc(key.label || "Tanpa nama");
    if (key.folder) {
      return '<button type="button" ' + attrs + ' data-folder="1" aria-label="' + label + ', folder">' +
        '<span class="kd-tile-ico">' + ic(ikon(key.icon)) + '</span>' +
        '<span class="kd-tile-label">' + label + '</span>' +
        '<span class="kd-tile-badge">' + (key.keys ? key.keys.filter(Boolean).length : 0) + '</span></button>';
    }
    if (!key.action || key.action.type === "kosong") {
      return '<div ' + attrs + ' data-widget="none" role="img" aria-label="' + label + '">' +
        '<span class="kd-tile-ico">' + ic(ikon(key.icon)) + '</span>' +
        '<span class="kd-tile-label">' + label + '</span></div>';
    }
    return '<button type="button" ' + attrs + ' aria-label="' + label + '">' +
      '<span class="kd-tile-ico">' + ic(ikon(key.icon)) + '</span>' +
      '<span class="kd-tile-label">' + label + '</span></button>';
  };

  var renderTabs = function () {
    var host = $("#kdRmTabs");
    if (!host) return;
    var pages = (S.deck && S.deck.pages) || [];
    var isi = pages.map(function (p) {
      var aktif = p.id === S.pageId;
      return '<button class="tab" type="button" role="tab" data-page="' + esc(p.id) + '"' +
        ' aria-selected="' + (aktif ? "true" : "false") + '">' + esc(p.name || "Halaman") + '</button>';
    }).join("");

    /* Kapsul aktif tidak ikut dibuang saat tombol digambar ulang, supaya ia
       bisa meluncur dari tab lama ke tab baru. */
    var ink = host.querySelector(".kd-pill-ink");
    if (ink) {
      while (host.firstChild && host.firstChild !== ink) host.removeChild(host.firstChild);
      ink.insertAdjacentHTML("beforebegin", isi);
      while (ink.nextSibling) host.removeChild(ink.nextSibling);
    } else {
      host.innerHTML = isi;
      ink = document.createElement("span");
      ink.className = "kd-pill-ink";
      host.appendChild(ink);
    }

    var aktifEl = host.querySelector('.tab[aria-selected="true"]');
    if (!aktifEl) { ink.classList.remove("is-on"); return; }
    ukurKapsul(host, ink, aktifEl);
  };

  /* Tempatkan kapsul tepat di atas tab aktif. Tidak ada animasi saat pertama
     tampil; setelah itu perpindahan transform yang membuatnya meluncur. */
  var ukurKapsul = function (host, ink, aktifEl) {
    var r = host.getBoundingClientRect();
    var a = aktifEl.getBoundingClientRect();
    if (!a.width || !a.height) return;
    ink.style.width = Math.round(a.width) + "px";
    ink.style.height = Math.round(a.height) + "px";
    ink.style.transform = "translate(" + Math.round(a.left - r.left - host.clientLeft + host.scrollLeft) +
      "px," + Math.round(a.top - r.top - host.clientTop + host.scrollTop) + "px)";
    ink.classList.add("is-on");
  };

  var renderBoardIsi = function () {
    var host = $("#kdRmBoard");
    var kosong = $("#kdRmKosong");
    var barFolder = $("#kdRmFolderBar");
    if (!host) return;
    var page = halamanAktif();
    var kolom = (S.deck && S.deck.profile && S.deck.profile.columns) || 5;
    var baris = (S.deck && S.deck.profile && S.deck.profile.rows) || 3;
    host.style.setProperty("--kd-cols-rm", kolom);
    host.dataset.kolom = kolom;
    host.dataset.baris = baris;

    if (S.folder) {
      if (barFolder) {
        barFolder.hidden = false;
        if ($("#kdRmFolderNama")) $("#kdRmFolderNama").textContent = S.folder.nama;
      }
      if (kosong) kosong.hidden = true;
      host.innerHTML = S.folder.keys.map(function (k, i) { return tileHTML(k, i); }).join("");
      if ($("#kdRmJudul")) $("#kdRmJudul").textContent = S.folder.nama;
      return;
    }
    if (barFolder) barFolder.hidden = true;
    if (!page) {
      host.innerHTML = "";
      if (kosong) kosong.hidden = false;
      return;
    }
    S.pageId = page.id;
    var total = kolom * baris;
    var keys = (page.keys || []).slice(0, total);
    while (keys.length < total) keys.push(null);
    var terisi = keys.filter(Boolean).length;
    if (!terisi) {
      host.innerHTML = "";
      if (kosong) kosong.hidden = false;
      return;
    }
    if (kosong) kosong.hidden = true;
    host.innerHTML = keys.map(function (k, i) {
      if (!k) return '<div class="kd-empty" aria-hidden="true">' + ic("k-plus") + '</div>';
      return tileHTML(k, i);
    }).join("");
    if ($("#kdRmJudul")) $("#kdRmJudul").textContent = (S.deck.profile && S.deck.profile.name) || "KumiDeck";
  };

  /* Papan Remote selalu muat di layar: ukuran dihitung dari ruang tegak dan
     lebar nyata tanpa memicu overflow, diposisikan di tengah. */
  var pasPapan = function () {
    var host = $("#kdRmBoard");
    if (!host) return;
    var stage = host.parentElement;
    var body = host.closest(".kd-phone-body");
    if (!stage || !body) return;
    var kolom = Number(host.dataset.kolom) || 5;
    var baris = Number(host.dataset.baris) || 3;

    var bodyH = body.clientHeight;
    var bodyPad = (parseFloat(getComputedStyle(body).paddingTop) || 0) +
      (parseFloat(getComputedStyle(body).paddingBottom) || 0);
    var saudaraH = 0;
    var hitungSaudara = 0;
    Array.from(body.children).forEach(function (ch) {
      if (ch !== stage && !ch.hidden && getComputedStyle(ch).display !== "none") {
        saudaraH += ch.offsetHeight;
        hitungSaudara++;
      }
    });
    var gapBody = parseFloat(getComputedStyle(body).rowGap) || 0;
    var tinggiMaks = Math.max(60, bodyH - bodyPad - saudaraH - (gapBody * hitungSaudara));
    var lebarMaks = stage.clientWidth || (body.clientWidth - 16);

    var celah = 6;
    var tw = (lebarMaks - celah * (kolom - 1)) / kolom;
    var th = (tinggiMaks - celah * (baris - 1)) / baris;
    /* Batas bawah 64 px: tombol lebih kecil dari itu sulit disentuh dan
       labelnya pecah di tengah kata (mis. "Terimakasi|h" di ponsel mendatar).
       Bila tidak cukup tinggi, papan menggulir alih-alih mengecil. */
    var tile = Math.floor(Math.max(64, Math.min(tw, th)));
    if (tile > tw) tile = Math.floor(tw);
    /* Di tablet/ponsel mendatar, kolom 5 bisa jadi 150 px dan terlihat
       kegemukan. 112 px sudah nyaman disentuh dan papan tetap terbaca. */
    if (tile > 112) tile = 112;
    if (tile <= 0) return;

    var lebarPapan = Math.max(0, tile * kolom + celah * (kolom - 1));
    host.style.width = lebarPapan + "px";
    host.style.maxWidth = "100%";
    host.style.marginInline = "auto";
  };

  var renderBoard = function () {
    renderBoardIsi();
    requestAnimationFrame(pasPapan);
  };

  var renderMedia = function () {
    var md = S.live.media || {};
    var ada = !!(md.ada && md.judul);
    if ($("#kdRmLagu")) $("#kdRmLagu").textContent = ada ? md.judul : "Tidak ada media";
    if ($("#kdRmArtis")) {
      $("#kdRmArtis").textContent = ada
        ? (md.artis || "Sedang diputar")
        : "Putar lagu di komputer untuk melihat judulnya di sini.";
    }
    var tombol = $("#kdRmMain");
    if (tombol) {
      var memutar = md.status === "memutar";
      tombol.innerHTML = ic(memutar ? "k-pause" : "k-play");
      tombol.setAttribute("aria-label", memutar ? "Jeda" : "Putar");
    }
  };

  /* Isi lintasan slider mengikuti nilai, bukan hanya posisi bulatan. */
  var isiRange = function (input) {
    if (!input) return;
    var min = Number(input.min) || 0;
    var max = Number(input.max) || 100;
    var v = ((Number(input.value) - min) / (max - min)) * 100;
    input.style.setProperty("--v", Math.max(0, Math.min(100, v)).toFixed(2) + "%");
  };

  var renderVolume = function () {
    var v = S.sinyal && S.sinyal.volume;
    if (!v) return;
    var input = $("#kdRmVol");
    if (input) {
      if (document.activeElement !== input) input.value = v.persen;
      isiRange(input);
    }
    if ($("#kdRmVolVal")) $("#kdRmVolVal").textContent = v.persen + "%";
  };

  var renderSuara = function () {
    var host = $("#kdRmSuaraList");
    if (!host) return;
    if (!S.suara.length) {
      host.innerHTML = "";
      if ($("#kdRmSuaraKosong")) $("#kdRmSuaraKosong").hidden = false;
      return;
    }
    if ($("#kdRmSuaraKosong")) $("#kdRmSuaraKosong").hidden = true;
    host.innerHTML = S.suara.map(function (s) {
      return '<button class="kd-sb-row" type="button" data-suara="' + esc(s.id) + '">' +
        '<span class="kd-play">' + ic("k-play") + '</span>' +
        '<span class="kd-sb-main"><b>' + esc(s.name || "Suara") + '</b>' +
        '<span class="kd-sb-meta">' + esc(s.jenis === "tautan" ? "Tautan" : "Berkas") + '</span></span></button>';
    }).join("");
  };

  var renderSetelan = function () {
    if ($("#kdRmHost")) $("#kdRmHost").textContent = location.host;
    if ($("#kdRmVersi")) $("#kdRmVersi").textContent = (S.server && S.server.versi) || "2.4.0";
    $$("#kdRmTema button").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.tema === S.theme ? "true" : "false");
    });
  };

  var renderSemua = function () {
    renderTabs();
    renderBoard();
    renderMedia();
    renderVolume();
    renderSuara();
    renderSetelan();
  };

  /* ---------------------------------------------------------------- aksi --- */

  var kirimTekan = function (key, el) {
    var page = halamanAktif();
    if (!page || !key) return;
    if (el) {
      el.classList.add("is-down");
      setTimeout(function () { el.classList.remove("is-down"); }, 160);
    }
    api("/api/press", {
      method: "POST",
      body: {
        pageId: page.id,
        keyId: key.id,
        deviceId: perangkatId,
        platform: "android",
        kedua: ""
      }
    }).then(function (j) {
      if (j.code === "butuh-izin") {
        toast(j.message || "Aksi ini butuh izin di komputer.", false);
        return;
      }
      if (j.navigate) {
        S.pageId = j.navigate;
        renderTabs();
        renderBoard();
      }
      if (j.ok === false) toast(j.message || "Aksi gagal.", false);
      else if (j.message) toast(j.message, true);
    }).catch(function () {
      toast("Server lokal tidak menjawab.", false);
    });
  };

  var switchPage = function (id) {
    S.pageId = id;
    S.folder = null;
    renderTabs();
    renderBoard();
  };

  var switchTab = function (tab) {
    S.view = tab;
    $$("#kdRmTabbar button").forEach(function (b) {
      b.setAttribute("aria-current", b.dataset.rmTab === tab ? "page" : "false");
    });
    $("#kdRmPapan").hidden = tab !== "papan";
    $("#kdRmSuara").hidden = tab !== "suara";
    $("#kdRmSetelan").hidden = tab !== "setelan";
    var baris = $("#kdRmTabs");
    if (baris) baris.hidden = tab !== "papan";
    if (tab === "papan") requestAnimationFrame(pasPapan);
  };

  /* Layar penuh: kepala, tab, media, volume, dan kaki disembunyikan; tinggal
     papan dan satu tombol bulat untuk keluar. */
  var setKiosk = function (aktif) {
    var akar = $("#kdRm");
    if (!akar) return;
    if (aktif && S.view !== "papan") switchTab("papan");
    akar.classList.toggle("is-kiosk", aktif);
    var btn = $("#kdRmKios");
    if (btn) {
      btn.setAttribute("aria-pressed", aktif ? "true" : "false");
      btn.innerHTML = ic(aktif ? "k-minimize" : "k-maximize");
      var label = aktif ? "Keluar layar penuh" : "Layar penuh";
      btn.setAttribute("aria-label", label);
      btn.setAttribute("title", label);
    }
    requestAnimationFrame(pasPapan);
  };

  /* --------------------------------------------------------------- muatan --- */

  var pasangState = function (s) {
    if (!s) return;
    if (s.deck) {
      S.deck = s.deck;
      S.suara = s.deck.soundboard || [];
      if (!S.pageId || !s.deck.pages.some(function (p) { return p.id === S.pageId; })) {
        S.pageId = (s.deck.settings && s.deck.settings.home) || (s.deck.pages[0] || {}).id || "";
      }
      if (S.folder) {
        /* Folder terbuka ikut data terbaru; tutup bila induknya sudah hilang. */
        var hal = halamanAktif();
        var induk = ((hal && hal.keys) || []).filter(Boolean).filter(function (k) {
          return k.id === S.folder.id;
        })[0];
        S.folder = induk
          ? { id: induk.id, nama: induk.label || "Folder", keys: (induk.keys || []).filter(Boolean) }
          : null;
      }
    }
    if (s.live) S.live = s.live;
    if (s.sinyal) S.sinyal = s.sinyal;
    if (s.server) S.server = s.server;
    renderSemua();
  };

  var sambung = function () {
    if (!S.token) return;
    var es = new EventSource("/api/events?kode=" + encodeURIComponent(S.token) +
      "&device=" + encodeURIComponent(perangkatId) +
      "&platform=android&nama=" + encodeURIComponent(namaPerangkat()));
    es.addEventListener("sync", function (e) {
      var data = null;
      try { data = JSON.parse(e.data); } catch (err) { return; }
      pasangState(data);
    });
    es.addEventListener("monitor", function (e) {
      var m = null;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (!m) return;
      if (m.monitor) m = m.monitor;
      S.monitor.ada = true;
      S.monitor.cpu = Number(m.cpu) || 0;
      S.monitor.ram = Number(m.ram) || 0;
      S.monitor.ramTotal = Number(m.ramTotal) || 0;
      S.monitor.gpu = m.gpu == null ? null : Number(m.gpu);
      S.monitor.down = Number(m.down) || 0;
      S.monitor.up = Number(m.up) || 0;
      S.monitor.ping = m.ping == null ? null : Number(m.ping);
      renderBoard();
    });
    /* Profil otomatis 2.3.0: halaman Remote ikut jendela depan. */
    es.addEventListener("profil", function (e) {
      var p = null;
      try { p = JSON.parse(e.data); } catch (err) { return; }
      if (!p || !p.pageId) return;
      if (!(S.deck.pages || []).some(function (x) { return x.id === p.pageId; })) return;
      S.pageId = p.pageId;
      S.folder = null;
      renderTabs();
      renderBoard();
    });
    es.addEventListener("error", function () {
      if ($("#kdRmSub")) $("#kdRmSub").textContent = "Menyambung ulang…";
    });
    es.addEventListener("open", function () {
      if ($("#kdRmSub")) $("#kdRmSub").textContent = "Terhubung ke " + location.host;
    });
    setInterval(function () {
      if (es.readyState === 1 && $("#kdRmSub")) $("#kdRmSub").textContent = "Terhubung ke " + location.host;
    }, 5000);
  };

  var muat = function () {
    return api("/api/state").then(function (s) {
      pasangState(s);
      return s;
    });
  };

  /* ------------------------------------------------------------- pasangan --- */

  var mintaPasangan = function (pesan) {
    S.token = "";
    simpanLokal(TOKEN, "");
    var veil = $("#kdRmVeil");
    if (veil) veil.hidden = false;
    var galat = $("#kdRmGalat");
    if (galat && pesan) {
      galat.textContent = pesan;
      galat.hidden = false;
    }
  };

  var pasangkan = function (kode) {
    var bersih = String(kode || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (bersih.length < 6) {
      var galat = $("#kdRmGalat");
      if (galat) {
        galat.textContent = "Kode terlalu pendek. Salin 8 karakter dari layar komputer.";
        galat.hidden = false;
      }
      return;
    }
    api("/api/pair", {
      method: "POST",
      diam: true,
      body: { kode: bersih, deviceId: perangkatId, platform: "android", name: namaPerangkat() }
    }).then(function (j) {
      if (!j || !j.token) throw new Error("Server tidak mengirim kode pasangan.");
      S.token = j.token;
      simpanLokal(TOKEN, j.token);
      var veil = $("#kdRmVeil");
      if (veil) veil.hidden = true;
      var galat = $("#kdRmGalat");
      if (galat) galat.hidden = true;
      if (j.state) pasangState(j.state);
      else muat();
      sambung();
      toast("Perangkat terpasang.", true);
    }).catch(function (e) {
      mintaPasangan((e && e.message) || "Kode pasangan salah.");
    });
  };

  /* ---------------------------------------------------------------- ikatan --- */

  var bind = function () {
    document.addEventListener("click", function (ev) {
      var tab = ev.target.closest("[data-page]");
      if (tab) { switchPage(tab.dataset.page); return; }

      var bagian = ev.target.closest("[data-rm-tab]");
      if (bagian) { switchTab(bagian.dataset.rmTab); return; }

      var tema = ev.target.closest("#kdRmTema [data-tema]");
      if (tema) { pasangTema(tema.dataset.tema); return; }

      var suara = ev.target.closest("[data-suara]");
      if (suara) {
        api("/api/audio/mainkan", {
          method: "POST",
          body: { id: suara.dataset.suara }
        }).then(function (j) {
          toast(j.ok === false ? (j.message || "Suara gagal diputar.") : "Memutar suara.", j.ok !== false);
        }).catch(function () { toast("Server lokal tidak menjawab.", false); });
        return;
      }

      var tile = ev.target.closest("#kdRmBoard .kd-tile");
      if (tile && S.view === "papan") {
        var idx = Number(tile.dataset.idx);
        var daftar = S.folder ? S.folder.keys : (halamanAktif() || {}).keys || [];
        var key = daftar[idx];
        if (!key) return;
        if (key.folder) {
          bukaFolder(key);
          return;
        }
        kirimTekan(key, tile);
      }
    });

    $("#kdRmFolderBack").addEventListener("click", tutupFolder);

    $("#kdRmForm").addEventListener("submit", function (e) {
      e.preventDefault();
      pasangkan($("#kdRmKode").value);
    });

    $("#kdRmVol").addEventListener("input", function (e) {
      var nilai = Number(e.target.value);
      isiRange(e.target);
      if ($("#kdRmVolVal")) $("#kdRmVolVal").textContent = nilai + "%";
      clearTimeout(bind._vol);
      bind._vol = setTimeout(function () {
        api("/api/aksi", { method: "POST", body: { type: "volume", mode: "set", nilai: nilai } })
          .catch(function () { toast("Volume gagal diubah.", false); });
      }, 220);
    });

    isiRange($("#kdRmVol"));

    $("#kdRmMain").addEventListener("click", function () {
      api("/api/aksi", { method: "POST", body: { type: "media", cmd: "playpause" } })
        .catch(function () { toast("Aksi media gagal.", false); });
    });

    $("#kdRmHenti").addEventListener("click", function () {
      api("/api/audio/hentikan", { method: "POST", body: {} })
        .then(function () { toast("Pemutaran dihentikan.", true); })
        .catch(function () { toast("Server lokal tidak menjawab.", false); });
    });

    $("#kdRmUlang").addEventListener("click", function () {
      muat().then(function () { toast("Papan dimuat ulang.", true); })
        .catch(function () { toast("Server lokal tidak menjawab.", false); });
    });

    $("#kdRmKios").addEventListener("click", function () {
      var mau = !$("#kdRm").classList.contains("is-kiosk");
      setKiosk(mau);
      var el = document.documentElement;
      if (mau) {
        if (!document.fullscreenElement && el.requestFullscreen) {
          el.requestFullscreen().catch(function () {});
        }
      } else if (document.fullscreenElement) {
        document.exitFullscreen().catch(function () {});
      }
    });

    /* Keluar dari layar penuh lewat gestur sistem juga harus mengembalikan
       kepala, tab, dan kaki papan. */
    document.addEventListener("fullscreenchange", function () {
      if (!document.fullscreenElement) setKiosk(false);
    });

    $("#kdRmPutus").addEventListener("click", function () {
      mintaPasangan("Perangkat diputus. Masukkan kode baru dari layar komputer.");
      toast("Pasangan diputus.", true);
    });

    window.addEventListener("resize", function () { renderTabs(); });
  };

  /* Folder di ponsel: papan sementara berisi tombol anak, tanpa mengubah deck. */
  var bukaFolder = function (key) {
    var anak = (key.keys || []).filter(Boolean);
    if (!anak.length) return;
    S.folder = { id: key.id, nama: key.label || "Folder", keys: anak };
    renderBoard();
  };

  var tutupFolder = function () {
    S.folder = null;
    renderBoard();
  };

  /* ----------------------------------------------------------------- mulai --- */

  var mulai = function () {
    pasangTema(ambilLokal(TEMA));
    bind();
    switchTab("papan");
    window.addEventListener("resize", pasPapan);
    window.addEventListener("orientationchange", function () { setTimeout(pasPapan, 180); });
    var url = new URL(location.href);
    var kode = url.searchParams.get("kode");
    /* QR membawa kode di tautan: selalu pasangkan ulang supaya ponsel yang
       pernah tertaut tidak memakai token lama. Kode dibuang dari URL agar muat
       ulang berikutnya tidak memicu percobaan pasangan baru. */
    if (kode) {
      try {
        url.searchParams.delete("kode");
        history.replaceState(null, "", url.toString());
      } catch (e) { /* abaikan */ }
      pasangkan(kode);
      return;
    }
    S.token = ambilLokal(TOKEN);
    if (!S.token) {
      mintaPasangan("");
      return;
    }
    muat().then(function (s) {
      if (s && s.server) $("#kdRmSub").textContent = "Terhubung ke " + location.host;
      sambung();
    }).catch(function (e) {
      if (e && e.status === 401) return;
      if ($("#kdRmSub")) $("#kdRmSub").textContent = "Server tidak menjawab";
      setTimeout(function () {
        muat().then(function (s) {
          if (s && s.server) $("#kdRmSub").textContent = "Terhubung ke " + location.host;
          sambung();
        }).catch(function () {});
      }, 4000);
    });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mulai);
  else mulai();

  /* Service worker hanya untuk pemasangan PWA di ponsel; kegagalan diabaikan. */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    });
  }
})();
