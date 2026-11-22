/* ==========================================================================
   KumiDeck 2.4 — prototipe. Logika tampilan saja, tanpa jaringan.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var ic = function (id, cls) {
    return '<svg class="' + (cls || "icon") + '" aria-hidden="true"><use href="#' + id + '"></use></svg>';
  };
  /* Papan 2.3.0 menyimpan id ikon `i-*`; sprite 2.4.0 memakai `k-*`. */
  var ikon = function (id) {
    var v = String(id || "");
    if (v.indexOf("i-") === 0) {
      var k = "k-" + v.slice(2);
      if (document.getElementById(k)) return k;
    }
    return document.getElementById(v) ? v : "k-grid";
  };
  var syncRange = function (el) {
    if (!el) return;
    var min = Number(el.min) || 0;
    var max = Number(el.max) || 100;
    var v = ((Number(el.value) - min) / (max - min)) * 100;
    el.style.setProperty("--v", Math.max(0, Math.min(100, v)).toFixed(2) + "%");
  };

  /* ------------------------------------------------------------------ data */
  var MEDIA = {
    playpause: "Putar / jeda", next: "Lagu berikut", prev: "Lagu sebelumnya",
    volup: "Volume naik", voldown: "Volume turun", mute: "Senyapkan"
  };
  var JENDELA = { minimize: "Perkecil", maximize: "Perbesar", restore: "Pulihkan", kiri: "Ke kiri", kanan: "Ke kanan" };
  var DAYA = { tidur: "Tidur", kunci: "Kunci", restart: "Mulai ulang", matikan: "Matikan", batal: "Batalkan" };
  var VOLUME = { naik: "Naik", turun: "Turun", set: "Set nilai", mute: "Senyapkan" };
  var MIC = { togel: "Alihkan", mati: "Matikan", hidup: "Hidupkan" };

  var ACTIONS = {
    kosong: { label: "Tanpa aksi", fields: [] },
    hotkey: { label: "Pintasan papan ketik", fields: [{ k: "combo", l: "Kombinasi", ph: "ctrl+shift+s", help: "Pisahkan dengan tanda +. Contoh: win+l." }] },
    teks: { label: "Ketik teks", fields: [{ k: "text", l: "Teks", t: "textarea", ph: "Teks yang diketik" }] },
    buka: { label: "Buka aplikasi atau alamat", fields: [{ k: "target", l: "Target", ph: "notepad, code, https://..." }] },
    skrip: { label: "Jalankan skrip", fields: [{ k: "target", l: "Berkas", ph: "C:\\alat\\skrip.ps1" }, { k: "izin", l: "Izinkan skrip ini berjalan", t: "check" }] },
    http: { label: "Panggil alamat HTTP", fields: [{ k: "url", l: "Alamat", ph: "https://..." }, { k: "method", l: "Metode", t: "select", opts: ["GET", "POST"] }] },
    media: { label: "Kontrol media", fields: [{ k: "cmd", l: "Perintah", t: "select", opts: Object.keys(MEDIA).map(function (k) { return [k, MEDIA[k]]; }) }] },
    urutan: { label: "Urutan langkah", fields: [] },
    tunggu: { label: "Tunggu", fields: [{ k: "ms", l: "Milidetik", t: "number", ph: "500" }] },
    halaman: { label: "Pindah halaman", fields: [{ k: "pageId", l: "Halaman", t: "pages" }] },
    jendela: { label: "Kontrol jendela", fields: [{ k: "cmd", l: "Perintah", t: "select", opts: Object.keys(JENDELA).map(function (k) { return [k, JENDELA[k]]; }) }] },
    daya: { label: "Kontrol daya", fields: [{ k: "cmd", l: "Perintah", t: "select", opts: Object.keys(DAYA).map(function (k) { return [k, DAYA[k]]; }) }] },
    volume: { label: "Volume sistem", fields: [{ k: "mode", l: "Cara", t: "select", opts: Object.keys(VOLUME).map(function (k) { return [k, VOLUME[k]]; }) }, { k: "nilai", l: "Nilai", t: "number", ph: "50" }] },
    mic: { label: "Mikrofon", fields: [{ k: "cmd", l: "Perintah", t: "select", opts: Object.keys(MIC).map(function (k) { return [k, MIC[k]]; }) }] },
    suara: { label: "Putar suara", fields: [{ k: "soundId", l: "Suara", t: "sounds" }] },
    kondisional: { label: "Aksi kondisional", fields: [] }
  };

  var ICONS = [
    "k-play", "k-volume", "k-volume-off", "kd-mic", "kd-power", "kd-window", "kd-music",
    "k-globe", "k-folder", "k-code", "k-file", "k-image", "k-download", "k-upload",
    "k-copy", "k-lock", "k-grid", "k-link", "k-pencil", "k-plus", "k-clock", "k-star",
    "k-bolt", "k-shield", "k-settings", "k-search", "k-trash", "k-refresh", "kd-keyboard", "k-users"
  ];

  var WIDGET_NAMA = {
    jam: "Jam dan tanggal",
    media: "Media sedang diputar",
    cpu: "CPU",
    ram: "RAM",
    gpu: "GPU",
    jaringan: "Jaringan"
  };

  var VARIANTS = [
    { id: "default", label: "Default", bg: "var(--bg-card)", ink: "var(--text-1)" },
    { id: "tint", label: "Tint", bg: "var(--brand-soft)", ink: "var(--brand-text)" },
    { id: "accent", label: "Aksen", bg: "var(--brand-btn)", ink: "#fff" },
    { id: "dark", label: "Gelap", bg: "#1B2137", ink: "#F1F3FE" },
    { id: "lime", label: "Hijau", bg: "var(--ok-soft)", ink: "var(--ok)" }
  ];

  var VARS = ["%volume%", "%mic%", "%lagu%", "%artis%", "%jam%", "%tanggal%", "%halaman%", "%komputer%", "%clipboard%"];

  var AKSEN = ["#4F5FDB", "#17697A", "#2F6B4F", "#96601A", "#A63C55", "#6B4BB8"];

  var blankKey = function () {
    return { label: "", icon: "k-star", variant: "default", action: { type: "kosong" }, widget: null };
  };

  var k = function (label, icon, action, variant) {
    return { label: label, icon: icon, variant: variant || "default", action: action, widget: null };
  };


  /* ------------------------------------------------------------------ data */
  /* Nilai monitoring berasal dari SSE `monitor`. hist menyimpan 20 sampel
     terakhir (60 detik) untuk grafik garis di tile. */
  var MONITOR = {
    cpu: 0, ram: 0, ramTotal: 0, gpu: null, gpuTemp: null, ping: null,
    down: 0, up: 0, ada: false,
    hist: { cpu: [], ram: [], gpu: [], down: [] }
  };

  var S = {
    deck: null,
    pageId: "",
    view: "papan",
    editing: false,
    panel: true,
    dataState: "memuat",
    tema: "light",
    aksen: "",
    idx: -1,
    draft: null,
    folder: null,
    edFolder: null,
    histFilter: "semua",
    histSearch: "",
    histSort: { key: "waktu", dir: "desc" },
    playing: null,
    suara: [],
    riwayat: [],
    perangkat: [],
    proses: [],
    procFilter: "semua",
    procSearch: "",
    procIdx: -1,
    live: { media: { ada: false, judul: "", artis: "", status: "tertutup" } },
    sinyal: { jendela: { ada: false, proses: "", judul: "" }, volume: null },
    sw: {
      sound: true, lock: false, hotkey: false, hotkeyCombo: "ctrl+alt+k",
      top: false, auto: false, https: true, backup: true, update: true
    },
    versi: "2.4.0",
    kode: "",
    lan: "127.0.0.1",
    port: 4173,
    https: false,
    httpsPort: 0,
    simpan: null,
    siap: false
  };

  /* --------------------------------------------------------------- jaringan */
  var minta = function (jalur, opsi) {
    var o = opsi || {};
    o.headers = Object.assign({ "Content-Type": "application/json" }, o.headers || {});
    return fetch(jalur, o).then(function (r) {
      return r.json().catch(function () {
        return { ok: false, message: "Jawaban server tidak terbaca." };
      }).then(function (j) {
        j.status = r.status;
        return j;
      });
    });
  };

  /* Papan disimpan dengan bentuk 2.3.0: warna tombol berupa objek bg/fg dan
     widget berupa objek {type}. */
  var untukSimpan = function (deck) {
    var salinan = JSON.parse(JSON.stringify(deck || {}));
    var jelajah = function (keys) {
      (keys || []).forEach(function (k) {
        if (!k) return;
        if (typeof k.warna === "string") k.warna = k.warna ? { bg: k.warna, fg: "" } : null;
        if (typeof k.widget === "string") k.widget = k.widget ? { type: k.widget } : null;
        if (k.keys) jelajah(k.keys);
      });
    };
    (salinan.pages || []).forEach(function (p) { jelajah(p.keys); });
    return salinan;
  };

  /* Saat dimuat, warna objek dan widget objek dilipat menjadi nilai sederhana. */
  var pasangDeck = function (deck) {
    if (!deck) return;
    var jelajah = function (keys) {
      (keys || []).forEach(function (k) {
        if (!k) return;
        if (k.warna && typeof k.warna === "object") k.warna = k.warna.bg || "";
        if (k.widget && typeof k.widget === "object") k.widget = k.widget.type || null;
        if (k.keys) jelajah(k.keys);
      });
    };
    (deck.pages || []).forEach(function (p) { jelajah(p.keys); });
    S.deck = deck;
  };

  /* Tulis papan ke server. Ditunda sebentar supaya geser dan ketik tidak
     mengirim puluhan permintaan. */
  var simpanDeck = function (diam) {
    if (!S.deck) return;
    var isi = JSON.stringify({ deck: untukSimpan(S.deck) });
    clearTimeout(S.simpan);
    S.simpan = setTimeout(function () {
      minta("/api/deck", { method: "POST", body: isi }).then(function (j) {
        if (j.code === "terkunci") { toast(j.message, false); return; }
        if (!j.ok && !diam) toast(j.message || "Papan gagal disimpan.", false);
      }).catch(function () {
        if (!diam) toast("Papan gagal disimpan: server tidak menjawab.", false);
      });
    }, 180);
  };

  var jamDari = function (ms) {
    var d = new Date(Number(ms) || Date.now());
    var p = function (n) { return String(n).padStart(2, "0"); };
    return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  };

  var relatif = function (ms) {
    var beda = Date.now() - (Number(ms) || 0);
    if (beda < 60000) return "baru saja";
    if (beda < 3600000) return Math.floor(beda / 60000) + " menit lalu";
    if (beda < 86400000) return Math.floor(beda / 3600000) + " jam lalu";
    if (beda < 172800000) return "kemarin";
    return Math.floor(beda / 86400000) + " hari lalu";
  };

  var ukuranBerkas = function (bita) {
    if (bita == null) return "—";
    if (bita >= 1073741824) return (bita / 1073741824).toFixed(1).replace(".", ",") + " GB";
    if (bita >= 1048576) return Math.round(bita / 1048576) + " MB";
    return Math.max(1, Math.round(bita / 1024)) + " KB";
  };

  var pasangPerangkat = function (daftar) {
    S.perangkat = (daftar || []).filter(function (d) { return !d.dicabut; }).map(function (d) {
      return {
        id: d.id,
        nama: d.name || "Perangkat",
        jenis: d.platform === "android" ? "Android" : "Desktop",
        alamat: d.alamat || d.address || "jaringan lokal",
        terakhir: relatif(d.lastSeen)
      };
    });
  };

  var satuRiwayat = function (a) {
    var halaman = pageById(a.pageId);
    return {
      id: a.id || ("a" + (a.time || Date.now()) + Math.random().toString(36).slice(2, 6)),
      waktu: jamDari(a.time),
      aksi: a.label || "Tombol",
      halaman: halaman ? halaman.name : "—",
      sumber: a.platform === "android" ? "Ponsel" : "Papan",
      hasil: a.ok ? "Berhasil" : "Gagal",
      pesan: a.message || ""
    };
  };

  var pasangRiwayat = function (daftar) {
    S.riwayat = (daftar || []).map(satuRiwayat);
  };

  /* Soundboard: papan menyimpan sumber, status unduhan datang dari server. */
  var pasangSuara = function (status) {
    var daftar = (S.deck && S.deck.soundboard) || [];
    var unduhan = (status && status.unduhan) || [];
    S.suara = daftar.map(function (s) {
      var u = unduhan.filter(function (x) { return x.sumber === s.sumber; })[0] || {};
      var st = u.status === "mengunduh" ? "unduh" : u.status === "gagal" ? "gagal" : "siap";
      return {
        id: s.id,
        nama: s.name || "Suara",
        sumber: s.jenis === "url" ? "Tautan" : "Berkas",
        status: st,
        progres: u.persen > 0 ? u.persen : 0,
        pesan: u.pesan || "",
        durasi: "",
        ukuran: "",
        volume: s.volume
      };
    });
  };

  /* Port dan proses: satu baris per port, nama proses dari server. */
  var pasangPort = function (daftar) {
    S.proses = (daftar || []).map(function (r) {
      var status = r.status === "Dengarkan" ? "Mendengar" : r.status;
      return {
        port: r.port,
        proto: r.protokol,
        alamat: r.alamat,
        status: status,
        proses: r.proses || "Tidak diketahui",
        ket: r.pid === 4 ? "Proses sistem" : "",
        pid: r.pid,
        memori: ukuranBerkas(r.memori),
        kunci: !!r.dilindungi
      };
    });
  };

  /* Satu muatan keadaan dipakai untuk semua layar. */
  var pasangState = function (s) {
    if (s.deck) {
      pasangDeck(s.deck);
      if (!S.pageId || !pageById(S.pageId)) S.pageId = halamanAwal(s.deck);
      terapkanSetelan();
    }
    if (s.devices) pasangPerangkat(s.devices);
    if (s.activity) pasangRiwayat(s.activity);
    if (s.live) {
      S.live = s.live;
      if (s.live.mic) S.micMute = !!s.live.mic.senyap;
    }
    if (s.sinyal) S.sinyal = s.sinyal;
    if (s.server) {
      S.lan = s.server.lan || S.lan;
      S.port = s.server.port || S.port;
      S.https = !!s.server.https;
      S.httpsPort = Number(s.server.httpsPort) || 0;
      S.versi = s.server.versi || S.versi;
      if ($("#kdSetVersi")) $("#kdSetVersi").textContent = S.versi;
      if ($("#kdServed")) $("#kdServed").textContent = (s.server.connected || 0) + " klien";
    }
    S.dataState = S.deck && S.deck.pages && S.deck.pages.length ? "normal" : "kosong";
    pasangPair({ lan: S.lan, port: S.port });
  };

  var terapkanSetelan = function () {
    var st = (S.deck && S.deck.settings) || {};
    S.sw.sound = st.sound !== false;
    S.sw.lock = !!st.terkunci;
    S.sw.top = !!st.teratas;
    S.sw.auto = !!st.mulaiOtomatis;
    S.sw.hotkey = !!String(st.pintasan || "").trim();
    S.sw.hotkeyCombo = String(st.pintasan || "").trim() || "ctrl+alt+k";
    S.sw.https = st.https !== false;
    S.sw.update = st.periksaPembaruan !== false;
    var hex = String(st.aksen || "");
    S.aksen = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#4F5FDB";
    var sakelar = function (id, nyala) {
      var el = $(id);
      if (el) el.setAttribute("aria-checked", String(!!nyala));
    };
    sakelar("#kdSetSound", S.sw.sound);
    sakelar("#kdSetLock", S.sw.lock);
    sakelar("#kdSetTop", S.sw.top);
    sakelar("#kdSetAuto", S.sw.auto);
    sakelar("#kdSetHotkey", S.sw.hotkey);
    sakelar("#kdSetHttps", S.sw.https);
    sakelar("#kdSetUpdate", S.sw.update);
    if ($("#kdSetHotkeyRow")) $("#kdSetHotkeyRow").toggleAttribute("data-off", !S.sw.hotkey);
    if ($("#kdSetHotkeyCombo")) {
      $("#kdSetHotkeyCombo").value = S.sw.hotkeyCombo;
      $("#kdSetHotkeyCombo").disabled = !S.sw.hotkey;
    }
    var pin = $("#kdPin");
    if (pin) pin.setAttribute("aria-pressed", String(S.sw.top));
    $$("#kdSwatches .kd-swatch").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.aksen === S.aksen));
    });
    applyAccent(S.aksen);
  };

  /* Nilai variabel label memakai sinyal dan media yang terakhir diterima. */
  var nilaiVariabel = function () {
    var v = (S.sinyal && S.sinyal.volume) || null;
    var m = (S.live && S.live.media) || {};
    return {
      "%volume%": v ? v.persen + "%" : "—",
      "%mic%": S.micMute ? "Senyap" : "Aktif",
      "%lagu%": m.ada ? m.judul : "Tidak ada media",
      "%artis%": m.ada ? m.artis : "—",
      "%jam%": jamNow(),
      "%tanggal%": tglNow(),
      "%halaman%": (pageNow() || {}).name || "—",
      "%komputer%": "PC ini",
      "%clipboard%": "—"
    };
  };

  /* Bagian monitor dipakai bersama papan dan Remote. */
  var monMasuk = function (m) {
    if (!m) return;
    if (m.monitor) m = m.monitor;
    MONITOR.ada = true;
    MONITOR.cpu = Number(m.cpu) || 0;
    MONITOR.ram = Number(m.ram) || 0;
    MONITOR.ramTotal = Number(m.ramTotal) || 0;
    MONITOR.gpu = m.gpu == null ? null : Number(m.gpu);
    MONITOR.gpuTemp = m.gpuTemp == null ? null : Number(m.gpuTemp);
    MONITOR.ping = m.ping == null ? null : Number(m.ping);
    MONITOR.down = Number(m.down) || 0;
    MONITOR.up = Number(m.up) || 0;
    MONITOR.hist.cpu.push(MONITOR.cpu);
    MONITOR.hist.ram.push(MONITOR.ram);
    MONITOR.hist.down.push(MONITOR.down);
    if (MONITOR.gpu != null) MONITOR.hist.gpu.push(MONITOR.gpu);
    ["cpu", "ram", "gpu", "down"].forEach(function (k) {
      while (MONITOR.hist[k].length > 20) MONITOR.hist[k].shift();
    });
    monGambar();
  };

  var monGambar = function () {
    if (S.view !== "papan") return;
    $$('[data-widget="cpu"], [data-widget="ram"], [data-widget="gpu"], [data-widget="jaringan"]').forEach(monPerbarui);
  };

  /* -------------------------------------------------------------- operasi --- */
  /* Perintah jendela ke cangkang Rust. Di peramban biasa panggilan ini diabaikan. */
  var ipc = function (m) {
    try {
      if (window.chrome && window.chrome.webview) window.chrome.webview.postMessage(m);
    } catch (e) { /* di luar cangkang aplikasi */ }
  };

  var halamanAwal = function (deck) {
    var pages = (deck && deck.pages) || [];
    var home = pages.filter(function (p) { return p.id === ((deck.settings || {}).home); })[0];
    var simpan = "";
    try { simpan = localStorage.getItem("kumideck-halaman") || ""; } catch (e) { /* penyimpanan UI tidak wajib */ }
    var pilih = pages.filter(function (p) { return p.id === simpan; })[0];
    return (pilih || home || pages[0] || {}).id || "";
  };

  var alamatRemote = function () {
    if (S.https && S.httpsPort) {
      return "https://" + S.lan + ":" + S.httpsPort + "/remote";
    }
    return "http://" + S.lan + ":" + S.port + "/remote";
  };

  var unduh = function (jalur) {
    var a = document.createElement("a");
    a.href = jalur;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  var aturSetelan = function (kunci, nilai) {
    if (!S.deck) return;
    S.deck.settings = S.deck.settings || {};
    S.deck.settings[kunci] = nilai;
    simpanDeck();
  };

  var pulihkanCadangan = function () {
    minta("/api/cadangan").then(function (j) {
      var d = (j.daftar || j.cadangan || [])[0];
      if (!d) { toast("Belum ada cadangan.", false); return; }
      return minta("/api/cadangan/pulihkan", {
        method: "POST",
        body: JSON.stringify({ nama: d.nama })
      }).then(function (r) {
        if (!r.ok) { toast(r.message || "Cadangan tidak dapat dipulihkan.", false); return; }
        if (r.deck) { pasangDeck(r.deck); S.pageId = halamanAwal(r.deck); }
        S.dataState = "normal";
        renderTabs(); renderBoard(); renderSide();
        toast("Cadangan terakhir dipulihkan.", true);
      });
    }).catch(function () { toast("Cadangan tidak dapat dipulihkan.", false); });
  };

  var muatPort = function (diam) {
    minta("/api/ports").then(function (j) {
      if (!j.ok) { if (!diam) toast(j.message || "Daftar port gagal dibaca.", false); return; }
      pasangPort(j.daftar);
      renderProses();
      if (!diam) toast("Daftar port diperbarui.", true);
    }).catch(function () { if (!diam) toast("Daftar port gagal dibaca.", false); });
  };

  var muatUnduhan = function () {
    if (!S.deck) return;
    minta("/api/audio/unduhan").then(function (j) {
      pasangSuara(j);
      renderSuara();
    }).catch(function () { pasangSuara(); renderSuara(); });
  };

  var simpanSuara = function (item) {
    return minta("/api/soundboard/simpan", {
      method: "POST",
      body: JSON.stringify({ item: item })
    }).then(function (j) {
      if (!j.ok) { toast(j.message || "Suara tidak dapat disimpan.", false); return false; }
      if (S.deck && j.soundboard) S.deck.soundboard = j.soundboard;
      muatUnduhan();
      return true;
    }).catch(function () { toast("Suara tidak dapat disimpan.", false); return false; });
  };

  /* Alamat Remote ikut HTTPS bila server HTTPS menyala. */
  var alamatRemote = function () {
    if (S.https && S.httpsPort) {
      return "https://" + S.lan + ":" + S.httpsPort + "/remote";
    }
    return "http://" + S.lan + ":" + S.port + "/remote";
  };

  /* Kode pasangan, QR, dan alamat Remote. */
  var pasangPair = function (j) {
    if (!j) return;
    var kode = String(j.code || j.kode || "").toUpperCase();
    if (kode) {
      S.kode = kode;
      if ($("#kdPairCode")) $("#kdPairCode").textContent = kode;
      if ($("#kdSetCode")) $("#kdSetCode").textContent = kode;
    }
    if (j.lan) S.lan = j.lan;
    if (j.port) S.port = j.port;
    if (j.httpsPort != null) S.httpsPort = Number(j.httpsPort) || 0;
    var url = alamatRemote();
    if ($("#kdRemoteUrl")) $("#kdRemoteUrl").textContent = url;
    if ($("#kdPairUrlNote")) {
      $("#kdPairUrlNote").innerHTML = 'Alamat Remote: <code class="kd-mono">' + esc(url) + "</code>";
    }
    if ($("#kdSetAlamat")) $("#kdSetAlamat").textContent = url.replace(/^https?:\/\//, "");
    var img = $("#kdQrImg");
    /* Tautan HTTP selalu dipakai untuk QR: sertifikat HTTPS lokal belum tentu
       dipercaya ponsel, dan halaman peringatan sertifikat membuat pemindaian
       tampak gagal. */
    var qr = j.qrUrl || j.qrUrlHttps;
    if (img && qr) {
      img.src = qr;
      img.hidden = false;
      if ($("#kdQrNote")) $("#kdQrNote").textContent = "Pindai dengan kamera ponsel";
      if ($("#kdQrAddr")) $("#kdQrAddr").textContent = url.replace(/^https?:\/\//, "");
    }
  };

  /* Satu panggilan untuk semua data awal; dipakai saat mulai dan tombol coba lagi. */
  var muatAwal = function () {
    return minta("/api/state").then(function (s) {
      if (!s || s.ok === false) {
        S.dataState = "gagal";
        renderBoard(); renderSide();
        return;
      }
      pasangState(s);
      renderTabs(); renderHeader(); renderBoard(); renderSide();
      renderSuara(); renderRiwayat(); renderProses(); renderPerangkat();
      return minta("/api/pair-info").then(pasangPair).catch(function () { /* di luar loopback kode tidak diberikan */ });
    }).catch(function () {
      S.dataState = "gagal";
      renderBoard(); renderSide();
      toast("Server lokal tidak menjawab.", false);
    });
  };

  /* Peristiwa dari server: satu aliran untuk papan, perangkat, dan monitor. */
  var dengar = function () {
    if (!window.EventSource) return;
    var es = new EventSource("/api/events");
    var ambil = function (e) {
      try { return JSON.parse(e.data); } catch (err) { return null; }
    };
    es.addEventListener("sync", function (e) {
      var s = ambil(e);
      if (!s) return;
      pasangState(s);
      renderTabs(); renderHeader(); renderBoard(); renderSide();
      renderSuara(); renderRiwayat(); renderProses(); renderPerangkat();
      if (S.view === "riwayat") renderRiwayat();
    });
    es.addEventListener("sinyal", function (e) {
      var s = ambil(e);
      if (s) S.sinyal = s;
    });
    es.addEventListener("monitor", function (e) {
      var m = ambil(e);
      if (m) monMasuk(m);
    });
    es.addEventListener("devices", function (e) {
      var d = ambil(e);
      if (d) { pasangPerangkat(d.devices || d); renderPerangkat(); renderSide(); }
    });
    es.addEventListener("press", function () {
      /* Aktivitas baru datang lewat `sync`; tidak perlu render tambahan. */
    });
    /* Profil otomatis 2.3.0: halaman ikut jendela depan. */
    es.addEventListener("profil", function (e) {
      var p = ambil(e);
      if (!p || !p.pageId || !pageById(p.pageId)) return;
      S.pageId = p.pageId;
      S.folder = null;
      renderTabs(); renderBoard(); renderHeader(); renderSide();
      if (S.view === "papan") {
        toast("Halaman mengikuti " + (p.alasan || "jendela aktif") + ".");
      }
    });
    es.onerror = function () {
      /* EventSource menyambung ulang sendiri; beri jeda supaya tidak membanjiri log. */
      es.close();
      setTimeout(function () { dengar(); }, 3000);
    };
  };


  /* ---------------------------------------------------------------- helpers */
  var pageNow = function () {
    var pages = (S.deck && S.deck.pages) || [];
    return pages.filter(function (p) { return p.id === S.pageId; })[0] || pages[0] || null;
  };
  var dua = function (n) { return String(n).padStart(2, "0"); };
  var jamNow = function () {
    var d = new Date();
    return dua(d.getHours()) + ":" + dua(d.getMinutes());
  };
  var tglNow = function () {
    try { return new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short" }).format(new Date()); }
    catch (e) { return "Sab, 22 Nov"; }
  };
  var jamDetik = function () {
    var d = new Date();
    return dua(d.getHours()) + ":" + dua(d.getMinutes()) + ":" + dua(d.getSeconds());
  };
  var resolve = function (label) {
    var map = nilaiVariabel();
    return String(label || "").replace(/%[a-z]+%/g, function (m) { return map[m] != null ? map[m] : m; });
  };
  var aksiTeks = function (a) {
    if (!a || a.type === "kosong") return "Tanpa aksi";
    switch (a.type) {
      case "hotkey": return "Pintasan " + (a.combo || "—");
      case "teks": return "Ketik teks";
      case "buka": return "Buka " + (a.target || "—");
      case "skrip": return "Jalankan " + (a.target || "skrip");
      case "http": return "Panggil " + (a.method || "GET") + " " + (a.url || "—");
      case "media": return "Media: " + (MEDIA[a.cmd] || "—");
      case "urutan": return "Urutan " + ((a.steps || []).length) + " langkah";
      case "tunggu": return "Tunggu " + (a.ms || 0) + " ms";
      case "halaman": return "Pindah ke " + ((pageById(a.pageId) || {}).name || "halaman");
      case "jendela": return "Jendela: " + (JENDELA[a.cmd] || "—");
      case "daya": return "Daya: " + (DAYA[a.cmd] || "—");
      case "volume": return "Volume: " + (VOLUME[a.mode] || "—");
      case "mic": return "Mikrofon: " + (MIC[a.cmd] || "—");
      case "suara": return "Putar " + ((S.suara.filter(function (s) { return s.id === a.soundId; })[0] || {}).nama || "suara");
      case "kondisional": return "Aksi kondisional";
      default: return "Aksi";
    }
  };
  var pageById = function (id) {
    var pages = (S.deck && S.deck.pages) || [];
    return pages.filter(function (p) { return p.id === id; })[0];
  };
  var inkFor = function (hex) {
    var h = hex.replace("#", "");
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#191C28" : "#FFFFFF";
  };

  /* ------------------------------------------------------------------ toast */
  var toastTimer = null;
  var toast = function (text, ok) {
    var t = $("#kdToast");
    $("#kdToastText").textContent = text;
    t.classList.add("is-open");
    t.querySelector(".kd-toast-icon").style.color = ok === false ? "var(--danger)" : "";
    if (ok === false) bunyi(true);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("is-open"); }, 2600);
  };

  /* Bunyi pendek dari WebAudio. Konteks dibuat pada klik pertama supaya
     WebView2 mengizinkan pemutaran; tanpa ini sakelar menyala tapi diam. */
  var AUDIO = null;
  var bunyi = function (gagal) {
    if (!S.sw.sound) return;
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      if (!AUDIO) AUDIO = new C();
      if (AUDIO.state === "suspended") AUDIO.resume();
      var t = AUDIO.currentTime;
      var lama = gagal ? 0.16 : 0.055;
      var osc = AUDIO.createOscillator();
      var gain = AUDIO.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(gagal ? 240 : 880, t);
      if (gagal) osc.frequency.exponentialRampToValueAtTime(180, t + lama);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(gagal ? 0.07 : 0.045, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + lama);
      osc.connect(gain);
      gain.connect(AUDIO.destination);
      osc.start(t);
      osc.stop(t + lama + 0.02);
    } catch (e) { /* suara tidak wajib */ }
  };

  /* ------------------------------------------------------------------ pembaruan */
  var bandingVersi = function (a, b) {
    var pa = String(a).replace(/^v/i, "").split(".");
    var pb = String(b).replace(/^v/i, "").split(".");
    for (var i = 0; i < Math.max(pa.length, pb.length); i += 1) {
      var x = parseInt(pa[i], 10) || 0;
      var y = parseInt(pb[i], 10) || 0;
      if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
  };

  var cekPembaruan = function (manual) {
    return fetch("https://api.github.com/repos/Owladi-Ex/KumiDeck/releases/latest", {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store"
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (j) {
      var tag = String((j && j.tag_name) || "").replace(/^v/i, "");
      if (!tag) throw new Error("tag kosong");
      if (bandingVersi(tag, S.versi) > 0) {
        toast("KumiDeck " + tag + " tersedia. Unduh dari halaman rilis.", true);
      } else if (manual) {
        toast("KumiDeck " + S.versi + " adalah versi terbaru.", true);
      }
    }).catch(function () {
      if (manual) toast("Pemeriksaan pembaruan gagal. Periksa koneksi internet.", false);
    });
  };

  /* ------------------------------------------------------------------ tema */
  var applyAccent = function (hex) {
    var root = document.documentElement;
    var dark = root.getAttribute("data-theme") === "dark";
    var base = dark ? "#0F1424" : "#FFFFFF";
    root.style.setProperty("--brand", hex);
    root.style.setProperty("--brand-btn", hex);
    root.style.setProperty("--brand-hover", "color-mix(in srgb, " + hex + " 88%, " + (dark ? "#000" : "#000") + ")");
    root.style.setProperty("--brand-press", "color-mix(in srgb, " + hex + " 76%, #000)");
    root.style.setProperty("--brand-soft", "color-mix(in srgb, " + hex + " 12%, " + base + ")");
    root.style.setProperty("--brand-soft-2", "color-mix(in srgb, " + hex + " 20%, " + base + ")");
    root.style.setProperty("--brand-text", "color-mix(in srgb, " + hex + " " + (dark ? "62%, #FFFFFF" : "82%, #000000") + ")");
  };

  var applyTheme = function (mode, silent) {
    if (mode !== "system" && mode !== "dark" && mode !== "light") mode = "light";
    var resolved = mode;
    if (mode === "system") {
      resolved = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    S.tema = mode;
    try { localStorage.setItem("kumideck-tema", mode); } catch (e) { /* penyimpanan UI tidak wajib */ }
    document.documentElement.setAttribute("data-theme", resolved);
    applyAccent(S.aksen || "#4F5FDB");
    $$("#kdTheme use").forEach(function (u) { u.setAttribute("href", resolved === "dark" ? "#i-sun" : "#i-moon"); });
    $$("#kdThemeSeg button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.tema === mode)); });
    /* Papan digambar ulang agar lapisan container query ikut tema baru. */
    if ($("#kdBoard") && S.deck) { renderBoard(); }
    placeInk($("#kdThemeSeg"), "pill", 'button[aria-pressed="true"]', "");
    if (!silent) toast(mode === "system" ? "Tema mengikuti Windows." : "Tema " + (resolved === "dark" ? "gelap" : "terang") + " dipakai.");
  };

  /* ------------------------------------------------------------------ papan */
  var tileStyle = function (key) {
    var parts = [];
    if (key.span && (key.span.c > 1 || key.span.r > 1)) {
      parts.push("grid-column:span " + key.span.c);
      parts.push("grid-row:span " + key.span.r);
    }
    if (key.warna) {
      var ink = inkFor(key.warna);
      parts.push("--tile-bg:" + key.warna, "--tile-line:" + key.warna, "--tile-ink:" + ink,
        "--tile-ink-2:color-mix(in srgb, " + ink + " 78%, transparent)");
    }
    return parts.join(";");
  };

  var angka = function (n, desimal) {
    var teks = desimal ? Number(n).toFixed(desimal) : String(Math.round(n));
    return teks.replace(".", ",");
  };

  /* Widget monitoring: angka besar di tengah, label kecil di atas, grafik 60
     detik di bawah. Angka persen butuh arah, bukan cuma besar, jadi grafik
     garis lebih jujur daripada bilah progres yang terus penuh. */
  var monSpark = function (nilai, maks) {
    var n = nilai.length;
    if (n < 2) return { garis: "", area: "" };
    /* Skala mengikuti isi jendela (dengan sedikit ruang), bukan 0..maks.
       Tanpa ini gelombang 34–46% hanya jadi garis datar di dasar kotak. */
    var lo = Math.min.apply(null, nilai);
    var hi = Math.max.apply(null, nilai);
    var pad = Math.max((hi - lo) * 0.45, maks * 0.02);
    lo = Math.max(0, lo - pad);
    hi = Math.min(maks, hi + pad);
    if (hi - lo < maks * 0.01) hi = lo + maks * 0.01;
    var xs = function (i) { return (i / (n - 1)) * 100; };
    var ys = function (v) { return 28 - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * 26; };
    var p = function (x, y) { return (Math.round(x * 100) / 100) + "," + (Math.round(y * 100) / 100); };
    var garis = "M" + p(xs(0), ys(nilai[0]));
    for (var i = 1; i < n; i++) {
      garis += " Q" + p(xs(i - 1), ys(nilai[i - 1])) + " " +
        p((xs(i - 1) + xs(i)) / 2, (ys(nilai[i - 1]) + ys(nilai[i])) / 2);
    }
    garis += " L" + p(xs(n - 1), ys(nilai[n - 1]));
    return { garis: garis, area: garis + " L100,30 L0,30 Z" };
  };

  var monChart = function (kunci, maks, nilai) {
    var s = monSpark(MONITOR.hist[kunci], maks);
    var tingkat = nilai / maks >= 0.85 ? "high" : "normal";
    return '<span class="kd-mon-chart" data-level="' + tingkat + '">' +
      '<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">' +
      '<path class="kd-mon-area" d="' + s.area + '"></path>' +
      '<path class="kd-mon-line" d="' + s.garis + '"></path></svg></span>';
  };

  var monHTML = function (attrs, w) {
    var m = MONITOR;
    var top = function (ikon, label, ekstra) {
      return '<span class="kd-mon-top">' + ic(ikon) + '<span>' + label + '</span>' +
        (ekstra ? '<span class="kd-mon-extra">' + ekstra + '</span>' : "") + '</span>';
    };
    var grip = '<span class="kd-tile-grip" aria-hidden="true">' + ic("k-more") + '</span>';
    var laju = function (tanda, nilai) {
      return '<span class="kd-mon-rate" data-' + tanda + '>' +
        '<span aria-hidden="true">' + (tanda === "dl" ? "↓" : "↑") + '</span>' +
        '<b>' + angka(nilai, 1) + '</b></span>';
    };
    if (w === "cpu") {
      var cpu = m.ada ? Math.round(m.cpu) : null;
      return '<div ' + attrs + ' data-widget="cpu" role="img" aria-label="Penggunaan CPU ' + (cpu == null ? "tidak tersedia" : cpu + " persen") + '">' +
        top("kd-cpu", "CPU") +
        '<span class="kd-mon-val">' + (cpu == null ? "—" : cpu) + '<span class="kd-mon-unit">' + (cpu == null ? "" : "%") + '</span></span>' +
        monChart("cpu", 100, cpu || 0) + grip + '</div>';
    }
    if (w === "ram") {
      var total = m.ramTotal ? angka(m.ramTotal, 0) : "—";
      return '<div ' + attrs + ' data-widget="ram" role="img" aria-label="RAM terpakai ' + angka(m.ram, 1) + ' dari ' + total + ' gigabita">' +
        top("kd-ram", "RAM", m.ramTotal ? "dari " + total + " GB" : "tidak tersedia") +
        '<span class="kd-mon-val">' + (m.ada ? angka(m.ram, 1) : "—") + '<span class="kd-mon-unit">' + (m.ada ? "GB" : "") + '</span></span>' +
        monChart("ram", m.ramTotal || 1, m.ram) + grip + '</div>';
    }
    if (w === "gpu") {
      var gpu = Math.round(m.gpu);
      var suhu = m.gpuTemp == null ? "tidak tersedia" : Math.round(m.gpuTemp) + " °C";
      return '<div ' + attrs + ' data-widget="gpu" role="img" aria-label="Penggunaan GPU ' + gpu + ' persen, suhu ' + suhu + '">' +
        top("kd-gpu", "GPU", suhu) +
        '<span class="kd-mon-val">' + (m.gpu == null ? "—" : gpu) + '<span class="kd-mon-unit">' + (m.gpu == null ? "" : "%") + '</span></span>' +
        monChart("gpu", 100, gpu) + grip + '</div>';
    }
    var ping = m.ping == null ? null : Math.round(m.ping);
    return '<div ' + attrs + ' data-widget="jaringan" role="img" aria-label="Jaringan, unduh ' + angka(m.down, 1) + ', unggah ' + angka(m.up, 1) + ' megabit per detik' + (ping == null ? "" : ", " + ping + " milidetik") + '">' +
      top("kd-network", "Jaringan", laju("ul", m.up)) +
      '<span class="kd-mon-val">' + angka(m.down, 1) + '<span class="kd-mon-unit">Mb/s</span></span>' +
      monChart("down", 1000, m.down) + grip + '</div>';
  };

  /* Perbarui satu tile di tempat, tanpa menggambar ulang papan. */
  var monPerbarui = function (el) {
    var w = el.dataset.widget;
    var val = el.querySelector(".kd-mon-val");
    var chart = el.querySelector(".kd-mon-chart");
    var extra = el.querySelector(".kd-mon-extra");
    var lukis = function (kunci, maks, nilai) {
      if (!chart) return;
      var s = monSpark(MONITOR.hist[kunci], maks);
      chart.setAttribute("data-level", nilai / maks >= 0.85 ? "high" : "normal");
      chart.querySelector(".kd-mon-area").setAttribute("d", s.area);
      chart.querySelector(".kd-mon-line").setAttribute("d", s.garis);
    };
    if (w === "cpu") {
      var c = Math.round(MONITOR.cpu);
      if (val) val.innerHTML = (MONITOR.ada ? c : "—") + '<span class="kd-mon-unit">' + (MONITOR.ada ? "%" : "") + '</span>';
      lukis("cpu", 100, c);
      el.setAttribute("aria-label", "Penggunaan CPU " + c + " persen");
      return;
    }
    if (w === "ram") {
      if (val) val.innerHTML = (MONITOR.ada ? angka(MONITOR.ram, 1) : "—") + '<span class="kd-mon-unit">' + (MONITOR.ada ? "GB" : "") + '</span>';
      lukis("ram", MONITOR.ramTotal || 1, MONITOR.ram);
      if (extra) extra.textContent = MONITOR.ramTotal ? "dari " + angka(MONITOR.ramTotal, 0) + " GB" : "tidak tersedia";
      el.setAttribute("aria-label", "RAM terpakai " + angka(MONITOR.ram, 1) + " dari " + angka(MONITOR.ramTotal, 0) + " gigabita");
      return;
    }
    if (w === "gpu") {
      var g = Math.round(MONITOR.gpu);
      if (val) val.innerHTML = (MONITOR.gpu == null ? "—" : g) + '<span class="kd-mon-unit">' + (MONITOR.gpu == null ? "" : "%") + '</span>';
      lukis("gpu", 100, g);
      if (extra) extra.textContent = MONITOR.gpuTemp == null ? "tidak tersedia" : Math.round(MONITOR.gpuTemp) + " °C";
      el.setAttribute("aria-label", "Penggunaan GPU " + g + " persen");
      return;
    }
    var ping = MONITOR.ping == null ? null : Math.round(MONITOR.ping);
    if (val) val.innerHTML = angka(MONITOR.down, 1) + '<span class="kd-mon-unit">Mb/s</span>';
    lukis("down", 1000, MONITOR.down);
    var ul = el.querySelector("[data-ul] b");
    if (ul) ul.textContent = angka(MONITOR.up, 1);
    el.setAttribute("aria-label", "Jaringan, unduh " + angka(MONITOR.down, 1) + ", unggah " + angka(MONITOR.up, 1) + " megabit per detik" + (ping == null ? "" : ", " + ping + " milidetik"));
  };

  var tileHTML = function (key, idx) {
    var style = tileStyle(key);
    var attrs = 'class="kd-tile" data-variant="' + (key.variant || "default") + '"' +
      (idx >= 0 ? ' data-idx="' + idx + '"' : "") +
      (idx >= 0 && S.editing ? ' draggable="true"' : "") +
      (style ? ' style="' + style + '"' : "") +
      (key.span ? ' data-span="1"' : "");

    if (key.widget === "cpu" || key.widget === "ram" || key.widget === "gpu" || key.widget === "jaringan") {
      return monHTML(attrs, key.widget);
    }
    if (key.widget === "jam") {
      return '<div ' + attrs + ' data-widget="jam" role="img" aria-label="Jam ' + esc(jamNow()) + ', ' + esc(tglNow()) + '">' +
        '<span class="kd-tile-time">' + esc(jamNow()) + '</span>' +
        '<span class="kd-tile-date">' + esc(tglNow()) + '</span>' +
        '<span class="kd-tile-grip" aria-hidden="true">' + ic("k-more") + '</span></div>';
    }
    if (key.widget === "media") {
      /* Judul lagu dari SMTC; label tombol hanya dipakai saat tidak ada artis. */
      var md = (S.live && S.live.media) || {};
      var adaMedia = !!(md.ada && md.judul);
      var jeda = String(md.status || "").toLowerCase() === "paused";
      var judul = adaMedia ? md.judul : "Tidak ada media";
      var artis = adaMedia
        ? (md.artis || "Sedang diputar")
        : "Putar musik di komputer";
      var ikonMedia = adaMedia ? (jeda ? "k-pause" : "k-play") : (key.icon || "k-play");
      var ket = adaMedia
        ? "Sedang diputar: " + md.judul + (md.artis ? " — " + md.artis : "")
        : "Sedang diputar: tidak ada media";
      return '<div ' + attrs + ' data-widget="media" role="img" aria-label="' + esc(ket) + '">' +
        '<span class="kd-tile-ico">' + ic(ikon(ikonMedia)) + '</span>' +
        '<span class="kd-tile-media-val">' + esc(judul) + '</span>' +
        '<span class="kd-tile-label">' + esc(artis) + '</span>' +
        '<span class="kd-tile-grip" aria-hidden="true">' + ic("k-more") + '</span></div>';
    }

    var label = esc(resolve(key.label) || "Tanpa nama");
    var cond = key.kondisi ? '<span class="kd-tile-cond" title="Bersyarat"></span>' : "";
    var badge = key.folder ? '<span class="kd-tile-badge">' + (key.keys || []).length + '</span>' : "";
    var grip = '<span class="kd-tile-grip" aria-hidden="true">' + ic("k-more") + '</span>';

    if (!key.action || key.action.type === "kosong") {
      if (!key.folder) {
        return '<div ' + attrs + ' data-widget="none" role="img" aria-label="' + label + '">' +
          '<span class="kd-tile-ico">' + ic(ikon(key.icon)) + '</span>' +
          '<span class="kd-tile-label">' + label + '</span>' + cond + grip + '</div>';
      }
    }

    return '<button type="button" ' + attrs + ' aria-label="' + label + (key.folder ? ", folder" : "") + '">' +
      '<span class="kd-tile-ico">' + ic(ikon(key.icon)) + '</span>' +
      '<span class="kd-tile-label">' + label + '</span>' +
      cond + badge + grip + '</button>';
  };

  var emptyHTML = function (idx) {
    if (S.editing) {
      return '<button type="button" class="kd-empty" data-edit="1" data-add="' + idx + '" aria-label="Tambah tombol di slot ' + (idx + 1) + '">' + ic("k-plus") + '</button>';
    }
    return '<div class="kd-empty" aria-hidden="true">' + ic("k-plus") + '</div>';
  };

  var boardKeys = function (page) {
    var cols = (S.deck && S.deck.profile && S.deck.profile.columns) || 5;
    var rows = (S.deck && S.deck.profile && S.deck.profile.rows) || 3;
    var total = cols * rows;
    var keys = (page && page.keys ? page.keys : []).slice(0, total);
    while (keys.length < total) keys.push(null);
    return keys;
  };

  var boardSkeleton = function () {
    var total = ((S.deck && S.deck.profile && S.deck.profile.columns) || 5) *
      ((S.deck && S.deck.profile && S.deck.profile.rows) || 3);
    var out = "";
    for (var i = 0; i < total; i++) out += '<div class="kd-tile kd-tile--skel"><div class="skel"><span></span><span></span></div></div>';
    return out;
  };

  var boardMessage = function (kind) {
    var span = ' style="grid-column:1/-1"';
    if (kind === "gagal") {
      return '<div class="kd-error" ' + span + '><span class="glyph">' + ic("k-alert") + '</span>' +
        '<b>Papan tidak dapat dimuat</b><p>Berkas deck.json tidak terbaca. Cadangan terakhir tetap aman di folder data.</p>' +
        '<div style="display:flex;gap:8px;margin-top:2px"><button class="btn btn-sm" type="button" data-retry="1">Coba lagi</button>' +
        '<button class="btn btn-sm" type="button" data-pulihkan="1">Pulihkan cadangan</button></div></div>';
    }
    return '<div class="kd-empty-state" ' + span + '><div class="empty"><span class="glyph">' + ic("k-grid") + '</span>' +
      '<h4>Papan ini belum punya tombol</h4><p>Tambahkan tombol pertama, atau pulihkan papan dari cadangan.</p>' +
      '<div style="display:flex;gap:8px;justify-content:center"><button class="btn btn-sm btn-primary" type="button" data-add="0">Tambah tombol</button>' +
      '<button class="btn btn-sm" type="button" data-pulihkan="1">Pulihkan cadangan</button></div></div></div>';
  };

  var renderBoard = function () {
    var page = pageNow();
    var board = $("#kdBoard");
    if (!board) return;
    var cols = (S.deck && S.deck.profile && S.deck.profile.columns) || 5;
    board.style.setProperty("--kd-cols", cols);
    if (S.dataState === "memuat") {
      board.innerHTML = boardSkeleton();
    } else if (S.dataState === "gagal") {
      board.innerHTML = boardMessage("gagal");
    } else if (S.dataState === "kosong") {
      board.innerHTML = boardMessage("kosong");
    } else {
      board.innerHTML = boardKeys(page).map(function (key, i) {
        return key ? tileHTML(key, i) : emptyHTML(i);
      }).join("");
    }
    fitBoard();
  };

  /* Papan selalu muat: ukuran tombol dihitung dari sisi yang paling sempit.
     Saat jendela sedang diseret, ukuran dibiarkan pecahan supaya papan ikut
     membesar mengecil tanpa melompat per piksel. */
  var fitBoard = function (halus) {
    var view = $("#view-papan");
    if (!view || !view.clientWidth) return;
    var board = $("#kdBoard");
    if (!board) return;
    var cols = (S.deck && S.deck.profile && S.deck.profile.columns) || 5;
    var rows = (S.deck && S.deck.profile && S.deck.profile.rows) || 3;
    var gap = parseFloat(getComputedStyle(board).columnGap) || 8;
    var pad = (parseFloat(getComputedStyle(view).paddingLeft) || 14) * 2;
    var vw = view.clientWidth - pad;
    var vh = view.clientHeight - pad;
    var bar = $("#kdEditbar");
    if (bar && !bar.hidden) vh -= bar.offsetHeight + 10;
    var tw = (vw - gap * (cols - 1)) / cols;
    var th = (vh - gap * (rows - 1)) / rows;
    var pas = Math.min(tw, th);
    var tile = halus ? Math.max(84, pas) : Math.max(84, Math.floor(pas));
    var lebar = tile * cols + gap * (cols - 1);
    board.style.width = (halus ? lebar.toFixed(2) : Math.round(lebar)) + "px";
    board.style.maxWidth = "100%";
  };

  /* Jendela mengikuti isi papan: lebar dan tinggi dihitung dari kotak tombol
     yang sudah dipas, bukan dari ruang kosong yang tersisa. Dipanggil saat
     panel kanan dibuka/ditutup dan saat kembali ke bagian Papan. */
  var ukuranSekarang = { w: window.innerWidth, h: window.innerHeight };
  var animasiUkuranId = 0;
  var animasiJendela = false;
  var jedaSelesai = 0;

  var kirimUkuran = function (w, h) {
    ukuranSekarang.w = w;
    ukuranSekarang.h = h;
    ipc("ukuran:" + Math.round(w) + ":" + Math.round(h));
  };

  /* Perubahan ukuran jendela digerakkan bertahap, bukan sekali lompat, supaya
     panel dan papan tidak terlihat berkedip saat ukuran berubah. Windows
     menggabungkan beberapa permintaan ukuran berurutan, jadi langkahnya dibuat
     kecil dan merata: satu lompatan besar di awal terasa seperti patahan. */
  var animasiUkuran = function (w, h) {
    w = Math.round(w);
    h = Math.round(h);
    var mulaiW = ukuranSekarang.w;
    var mulaiH = ukuranSekarang.h;
    var id = ++animasiUkuranId;
    if (Math.abs(w - mulaiW) < 2 && Math.abs(h - mulaiH) < 2) {
      animasiJendela = false;
      return;
    }
    var kurangi = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (kurangi) {
      kirimUkuran(w, h);
      jedaSelesai = Date.now();
      ukuranSekarang.w = w;
      ukuranSekarang.h = h;
      setTimeout(fitBoard, 140);
      return;
    }
    animasiJendela = true;
    /* Windows hanya menerapkan sekitar satu permintaan ukuran tiap 30 ms;
       permintaan yang lebih rapat saling menimpa dan membuat tepi jendela
       melompat. Karena itu langkah dikirim dengan jeda 30 ms dan jarak yang
       merata, bukan sekaligus banyak dalam satu bingkai. */
    var jumlah = 12;
    var jeda = 30;
    var n = 0;
    var selesai = function () {
      animasiJendela = false;
      jedaSelesai = Date.now();
      kirimUkuran(w, h);
      ukuranSekarang.w = w;
      ukuranSekarang.h = h;
      /* Papan ditata setelah ukuran akhir benar-benar terpasang. Langkah
         terakhir kadang baru diterapkan beberapa milidetik kemudian, jadi
         penataan diulang sekali lagi agar ukuran ubin tidak meleset. */
      setTimeout(function () {
        if (id !== animasiUkuranId) return;
        fitBoard();
      }, 120);
      setTimeout(function () {
        if (id !== animasiUkuranId) return;
        fitBoard();
      }, 420);
    };
    var langkah = function () {
      if (id !== animasiUkuranId) return;
      n += 1;
      var p = n / jumlah;
      var e = p * p * (3 - 2 * p);
      kirimUkuran(mulaiW + (w - mulaiW) * e, mulaiH + (h - mulaiH) * e);
      if (n < jumlah) setTimeout(langkah, jeda);
      else selesai();
    };
    setTimeout(langkah, 16);
  };

  var pasJendela = function () {
    if (S.view !== "papan" || !S.deck) return;
    var view = $("#view-papan");
    var board = $("#kdBoard");
    var rail = document.querySelector(".kd-rail");
    var kepala = document.querySelector(".kd-top");
    var kaki = document.querySelector(".kd-foot");
    if (!view || !board || !kepala || !kaki) return;
    var kotak = board.getBoundingClientRect();
    if (!kotak.width || !kotak.height) return;
    var gaya = getComputedStyle(view);
    var padX = (parseFloat(gaya.paddingLeft) || 14) + (parseFloat(gaya.paddingRight) || 14);
    var padY = (parseFloat(gaya.paddingTop) || 14) + (parseFloat(gaya.paddingBottom) || 14);
    var panelTerbuka = $("#kdContent").dataset.panel === "open";
    var rel = rail ? rail.offsetWidth : 68;
    /* Di bawah 900 px panel dilipat oleh media query, jadi lebarnya nol. */
    var panel = panelTerbuka ? (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--kd-side-w")) || 0) : 0;
    var bar = $("#kdEditbar");
    var bilah = bar && !bar.hidden ? bar.offsetHeight + 10 : 0;
    var lebar = Math.round(rel + panel + padX + kotak.width);
    var tinggi = Math.round(kepala.offsetHeight + kaki.offsetHeight + padY + kotak.height + bilah);
    /* Selisih beberapa piksel hanya pembulatan tata letak; jangan digerakkan. */
    if (Math.abs(lebar - ukuranSekarang.w) < 10 && Math.abs(tinggi - ukuranSekarang.h) < 10) return;
    animasiUkuran(lebar, tinggi);
  };

  /* Menyeret tepi jendela tidak lagi memicu penyesuaian otomatis: ukuran
     pilihan pengguna dipertahankan, papan hanya ditata ulang agar muat.
     Penyesuaian jendela dilakukan saat panel dibuka/ditutup atau saat kembali
     ke Papan. */

  /* --------------------------------------------------- penanda geser aktif */
  var inkEl = function (host, kind, tone) {
    var cls = kind === "underline" ? "kd-tabs-ink" : "kd-pill-ink";
    var ink = host.querySelector(":scope > ." + cls);
    if (!ink) {
      ink = document.createElement("span");
      ink.className = cls;
      ink.setAttribute("aria-hidden", "true");
      host.appendChild(ink);
    }
    if (kind === "pill") {
      if (tone === "brand") ink.dataset.tone = "brand";
      else ink.removeAttribute("data-tone");
    }
    return ink;
  };

  var placeInk = function (host, kind, activeSel, tone) {
    if (!host) return;
    var ink = inkEl(host, kind, tone);
    var active = host.querySelector(activeSel || '.tab[aria-selected="true"]');
    if (!active || !active.getBoundingClientRect().width) { ink.classList.remove("is-on"); return; }
    var r = host.getBoundingClientRect();
    var a = active.getBoundingClientRect();
    var x = a.left - r.left - host.clientLeft + host.scrollLeft;
    var y = a.top - r.top - host.clientTop + host.scrollTop;
    if (kind === "underline") {
      ink.style.width = Math.max(0, a.width - 20) + "px";
      ink.style.transform = "translateX(" + (x + 10) + "px)";
    } else {
      ink.style.width = Math.round(a.width) + "px";
      ink.style.height = Math.round(a.height) + "px";
      ink.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";
    }
    ink.classList.add("is-on");
  };

  var moveRailInk = function () {
    var rail = $(".kd-rail");
    var ink = $("#kdRailInk");
    var btn = rail && rail.querySelector('.kd-rail-btn[aria-current="page"]');
    if (!rail || !ink) return;
    if (!btn || !btn.offsetHeight) { ink.classList.remove("is-on"); return; }
    var rr = rail.getBoundingClientRect();
    var br = btn.getBoundingClientRect();
    ink.style.height = "18px";
    ink.style.transform = "translateY(" + Math.round(br.top - rr.top - rail.clientTop + (br.height - 18) / 2) + "px)";
    ink.classList.add("is-on");
  };

  var syncTabHost = function (host, withCount, kind) {
    if (!host) return;
    var pages = (S.deck && S.deck.pages) || [];
    $$(".tab", host).forEach(function (b) {
      if (!pages.some(function (p) { return p.id === b.dataset.page; })) b.remove();
    });
    pages.forEach(function (p, i) {
      var b = host.querySelector('.tab[data-page="' + p.id + '"]');
      if (!b) {
        b = document.createElement("button");
        b.type = "button";
        b.className = "tab";
        b.setAttribute("role", "tab");
        b.dataset.page = p.id;
        b.innerHTML = '<span class="kd-tab-lbl"></span>' + (withCount ? '<span class="tab-count"></span>' : "");
        var at = $$(".tab", host)[i];
        host.insertBefore(b, at || null);
      }
      b.querySelector(".kd-tab-lbl").textContent = p.name;
      if (withCount) b.querySelector(".tab-count").textContent = p.keys.filter(Boolean).length;
      b.setAttribute("aria-selected", String(p.id === S.pageId));
      b.tabIndex = p.id === S.pageId ? 0 : -1;
    });
    placeInk(host, kind, null, kind === "pill" ? "brand" : "");
  };

  var renderTabs = function () {
    syncTabHost($("#kdTabs"), true, "underline");
  };

  var renderHeader = function () {
    var nama = (S.deck && S.deck.profile && S.deck.profile.name) || "Meja Kerja";
    var cols = (S.deck && S.deck.profile && S.deck.profile.columns) || 5;
    var rows = (S.deck && S.deck.profile && S.deck.profile.rows) || 3;
    var names = { papan: nama, soundboard: "KumiDeck", riwayat: "KumiDeck", proses: "KumiDeck", perangkat: "KumiDeck", setelan: "KumiDeck" };
    $("#kdTitle").textContent = names[S.view];
    $("#kdTitleTag").textContent = cols + " × " + rows;
    var onBoard = S.view === "papan";
    $("#kdTabs").style.display = onBoard ? "" : "none";
    $("#kdAddPage").style.display = onBoard ? "" : "none";
    $("#kdTitleTag").style.display = onBoard ? "" : "none";
    $("#kdEdit").style.display = onBoard ? "" : "none";
    $(".kd-top-sep").style.display = onBoard ? "" : "none";
  };

  /* ------------------------------------------------------------ panel kanan */
  var stateBlock = function (kind, kosong) {
    if (S.dataState === "memuat") {
      return '<div class="kd-skel-card"><div class="skel"><span></span><span></span><span></span></div></div>';
    }
    if (S.dataState === "gagal") {
      return '<div class="kd-inline-note" style="border-color:color-mix(in srgb,var(--danger) 30%,var(--line));background:var(--danger-soft);color:var(--danger)">' +
        ic("k-alert") + '<span>Data gagal dimuat. Coba lagi.</span></div>';
    }
    return kosong;
  };

  var renderSide = function () {
    var dev = $("#kdSideDevices");
    var act = $("#kdSideActivity");
    var nDev = S.dataState === "normal" ? S.perangkat.length : 0;
    var nAct = S.dataState === "normal" ? S.riwayat.length : 0;
    $("#kdSideDevCount").textContent = nDev;
    $("#kdSideActCount").textContent = nAct;
    $("#kdConnCount").textContent = nDev;
    $("#kdDevCount2").textContent = nDev + " perangkat";

    if (S.dataState !== "normal") {
      dev.innerHTML = stateBlock("dev", "");
      act.innerHTML = stateBlock("act", "");
      return;
    }

    dev.innerHTML = S.perangkat.slice(0, 2).map(function (d) {
      return '<div class="kd-side-row">' +
        '<span class="kd-ava">' + ic("kd-phone") + '</span>' +
        '<span class="kd-side-row-main">' +
        '<span class="kd-side-top"><b>' + esc(d.nama) + '</b><span class="status" data-s="done">Aktif</span></span>' +
        '<span>' + esc(d.alamat) + ' · ' + esc(d.terakhir) + '</span></span></div>';
    }).join("") || '<div class="empty" style="padding:14px 6px"><p>Belum ada perangkat terpasang.</p></div>';

    act.innerHTML = S.riwayat.slice(0, 3).map(function (r) {
      return '<div class="kd-side-row">' +
        '<span class="kd-ava">' + ic(r.hasil === "Gagal" ? "k-alert" : "k-play") + '</span>' +
        '<span class="kd-side-row-main"><b>' + esc(r.aksi) + '</b><span>' + esc(r.waktu) + ' · ' + esc(r.sumber) + '</span></span>' +
        (r.hasil === "Gagal" ? '<span class="status" data-s="fail">Gagal</span>' : '') +
        '</div>';
    }).join("") || '<div class="empty" style="padding:14px 6px"><p>Belum ada aktivitas.</p></div>';
  };

  /* ------------------------------------------------------------------ aksi */
  var catat = function (key, sumber, hasil, pesan) {
    S.riwayat.unshift({
      waktu: jamDetik(), aksi: key.label || "Tombol", halaman: (pageNow() || {}).name || "—",
      sumber: sumber || "Papan", hasil: hasil || "Berhasil", pesan: pesan || ""
    });
    if (S.riwayat.length > 60) S.riwayat.pop();
    renderSide();
    if (S.view === "riwayat") renderRiwayat();
  };

  var kirimTekan = function (key, el, sumber, kedua, izin) {
    var page = pageNow();
    if (!page) return;
    var isi = {
      pageId: page.id,
      keyId: key.id,
      deviceId: "desktop",
      platform: "desktop",
      kedua: kedua ? "1" : ""
    };
    var jalur = izin ? "/api/press/izinkan" : "/api/press";
    if (el) {
      el.classList.add("is-down");
      setTimeout(function () { el.classList.remove("is-down"); }, 160);
    }
    minta(jalur, { method: "POST", body: JSON.stringify(isi) }).then(function (j) {
      if (j.code === "butuh-izin") {
        var pesan = (j.message || "Jalankan skrip ini?") + "\n\n" + (j.alasan || "");
        if (window.confirm(pesan)) kirimTekan(key, el, sumber, kedua, true);
        return;
      }
      if (j.navigate) switchPage(j.navigate);
      if (Array.isArray(j.activity)) {
        /* Server mengirim daftar aktivitas terbaru; pakai apa adanya. */
        pasangRiwayat(j.activity);
        renderSide();
        if (S.view === "riwayat") renderRiwayat();
      } else if (j.activity) {
        var baru = satuRiwayat(j.activity);
        S.riwayat = [baru].concat(S.riwayat.filter(function (r) { return r.id !== baru.id; }));
        if (S.riwayat.length > 60) S.riwayat.pop();
        renderSide();
        if (S.view === "riwayat") renderRiwayat();
      } else {
        catat(key, sumber, j.ok === false ? "Gagal" : "Berhasil", j.message);
      }
      toast(j.message || (key.label + " dijalankan."), j.ok !== false);
    }).catch(function () {
      catat(key, sumber, "Gagal", "Server tidak menjawab.");
      toast("Server lokal tidak menjawab.", false);
    });
  };

  var jalankan = function (key, el, sumber, kedua) {
    if (!key || S.editing) return;
    if (key.widget) { toast("Tombol widget hanya menampilkan data."); return; }
    if (key.folder) { openFolder(key); return; }
    if (kedua && !key.actionKedua) return;
    if (!kedua && (!key.action || key.action.type === "kosong")) return;
    bunyi(false);
    kirimTekan(key, el, sumber, kedua, false);
  };

  /* ---------------------------------------------------------------- folder */
  var renderFolder = function () {
    var key = S.folder;
    if (!key) return;
    var isi = (key.keys || []);
    $("#kdFolderTitle").textContent = key.label;
    $("#kdFolderMeta").textContent = S.editing
      ? isi.length + " tombol · ketuk untuk menyunting, slot kosong untuk menambah"
      : isi.length + " tombol · ketuk untuk menjalankan";
    $("#kdFolderEdit").hidden = !S.editing;
    var html = isi.map(function (c, i) {
      if (!c) {
        return '<button class="kd-empty" type="button" data-fadd="' + i + '" aria-label="Tambah isi folder">' + ic("k-plus") + '</button>';
      }
      return tileHTML(c, -1).replace('class="kd-tile"', 'class="kd-tile" data-fidx="' + i + '"');
    }).join("");
    if (isi.length === 0 && S.editing) {
      html += '<button class="kd-empty" type="button" data-fadd="0" aria-label="Tambah isi folder">' + ic("k-plus") + '</button>';
    } else if (S.editing && isi.every(Boolean)) {
      html += '<button class="kd-empty" type="button" data-fadd="' + isi.length + '" aria-label="Tambah isi folder">' + ic("k-plus") + '</button>';
    }
    $("#kdFolderGrid").innerHTML = html;
  };

  var openFolder = function (key) {
    S.folder = key;
    renderFolder();
    $("#kdFolder").hidden = false;
    $("#kdFolderBack").focus();
  };
  var closeFolder = function () {
    S.folder = null;
    S.edFolder = null;
    $("#kdFolder").hidden = true;
  };

  /* --------------------------------------------------------------- riwayat */
  var hasilStatus = function (h) {
    return h === "Gagal"
      ? '<span class="status" data-s="fail">Gagal</span>'
      : '<span class="status" data-s="done">Berhasil</span>';
  };

  var riwayatSaring = function () {
    var rows = S.riwayat.slice();
    if (S.histFilter === "papan") rows = rows.filter(function (r) { return r.sumber === "Papan"; });
    if (S.histFilter === "remote") rows = rows.filter(function (r) { return r.sumber !== "Papan"; });
    if (S.histFilter === "gagal") rows = rows.filter(function (r) { return r.hasil === "Gagal"; });
    if (S.histSearch) {
      var q = S.histSearch.toLowerCase();
      rows = rows.filter(function (r) {
        return (r.aksi + " " + r.halaman + " " + r.sumber).toLowerCase().indexOf(q) >= 0;
      });
    }
    var dir = S.histSort.dir === "asc" ? 1 : -1;
    rows.sort(function (a, b) {
      var x = a[S.histSort.key], y = b[S.histSort.key];
      return x < y ? -dir : x > y ? dir : 0;
    });
    return rows;
  };

  var renderRiwayat = function () {
    var body = $("#kdHistBody");
    if (S.dataState === "memuat") {
      body.innerHTML = '<div style="padding:14px"><div class="skel"><span></span><span></span><span></span><span></span><span></span></div></div>';
      $("#kdHistCount").textContent = "Memuat";
      return;
    }
    if (S.dataState === "gagal") {
      body.innerHTML = '<div style="padding:14px"><div class="kd-error"><span class="glyph">' + ic("k-alert") + '</span><b>Riwayat tidak dapat dimuat</b><p>Berkas log sedang dipakai proses lain. Coba lagi.</p><button class="btn btn-sm" type="button" data-retry="1">Coba lagi</button></div></div>';
      $("#kdHistCount").textContent = "Gagal";
      return;
    }
    if (S.dataState === "kosong" || !S.riwayat.length) {
      body.innerHTML = '<div class="empty"><span class="glyph">' + ic("k-clock") + '</span><h4>Belum ada aktivitas</h4><p>Tekan tombol di papan atau di Remote, dan jejaknya muncul di sini.</p></div>';
      $("#kdHistCount").textContent = "0 aksi";
      return;
    }

    var rows = riwayatSaring();
    $("#kdHistCount").textContent = rows.length + " aksi";
    if (!rows.length) {
      body.innerHTML = '<div class="empty"><span class="glyph">' + ic("i-search") + '</span><h4>Tidak ada yang cocok</h4><p>Ubah kata pencarian atau saringan.</p></div>';
      return;
    }
    var sortBtn = function (key, label) {
      var active = S.histSort.key === key;
      var aria = active ? (S.histSort.dir === "asc" ? "ascending" : "descending") : "none";
      return '<th aria-sort="' + aria + '"><button class="sort-btn" type="button" data-sort="' + key + '">' +
        label + '<svg class="sort-i icon" aria-hidden="true"><use href="#i-chev"></use></svg></button></th>';
    };
    body.innerHTML = '<table class="dtable kd-dtable-hist"><thead><tr>' +
      sortBtn("waktu", "Waktu") + sortBtn("aksi", "Aksi") + '<th>Halaman</th><th>Sumber</th><th>Hasil</th>' +
      '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr><td><span class="kd-mono">' + esc(r.waktu) + '</span></td>' +
          '<td><span class="dtable-title">' + esc(r.aksi) + '</span></td>' +
          '<td>' + esc(r.halaman) + '</td>' +
          '<td>' + esc(r.sumber) + '</td>' +
          '<td>' + hasilStatus(r.hasil) + '</td></tr>';
      }).join("") + '</tbody></table>';
  };

  /* ------------------------------------------------------------ port/proses */
  var procSaring = function () {
    var rows = S.proses.slice();
    if (S.procFilter === "dengar") rows = rows.filter(function (r) { return r.status === "Mendengar"; });
    if (S.procFilter === "tcp") rows = rows.filter(function (r) { return r.proto === "TCP"; });
    if (S.procFilter === "udp") rows = rows.filter(function (r) { return r.proto === "UDP"; });
    if (S.procSearch) {
      var q = S.procSearch.toLowerCase();
      rows = rows.filter(function (r) {
        return (r.proses + " " + r.ket + " " + r.port + " " + r.pid).toLowerCase().indexOf(q) >= 0;
      });
    }
    return rows;
  };

  var renderProses = function () {
    var body = $("#kdProcBody");
    if (S.dataState === "memuat") {
      body.innerHTML = '<div style="padding:14px"><div class="skel"><span></span><span></span><span></span><span></span><span></span><span></span></div></div>';
      $("#kdProcCount").textContent = "Memuat";
      return;
    }
    if (S.dataState === "gagal") {
      body.innerHTML = '<div style="padding:14px"><div class="kd-error"><span class="glyph">' + ic("k-alert") + '</span><b>Daftar port tidak dapat dibaca</b><p>Pemindaian port butuh izin baca tabel jaringan Windows. Coba lagi.</p><button class="btn btn-sm" type="button" data-retry="1">Coba lagi</button></div></div>';
      $("#kdProcCount").textContent = "Gagal";
      return;
    }
    if (S.dataState === "kosong" || !S.proses.length) {
      body.innerHTML = '<div class="empty"><span class="glyph">' + ic("kd-process") + '</span><h4>Tidak ada port terbuka</h4><p>Belum ada proses yang membuka port TCP atau UDP di komputer ini.</p></div>';
      $("#kdProcCount").textContent = "0 entri";
      return;
    }

    var rows = procSaring();
    $("#kdProcCount").textContent = rows.length + " entri";
    if (!rows.length) {
      body.innerHTML = '<div class="empty"><span class="glyph">' + ic("i-search") + '</span><h4>Tidak ada yang cocok</h4><p>Ubah kata pencarian atau saringan protokol.</p></div>';
      return;
    }
    body.innerHTML = '<table class="dtable kd-dtable-proc"><thead><tr><th>Port</th><th>Protokol</th><th>Alamat</th><th>Status</th><th>Proses</th><th>PID</th><th>Memori</th><th class="c-act">Aksi</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var i = S.proses.indexOf(r);
        var aksi = r.kunci
          ? '<button class="btn btn-sm kd-proc-stop" type="button" disabled title="Proses sistem atau KumiDeck tidak bisa diakhiri dari sini" aria-label="' + esc(r.proses) + ' dilindungi">' + ic("k-lock") + '<span>Dilindungi</span></button>'
          : '<button class="btn btn-sm kd-proc-stop" type="button" data-akhiri="' + i + '" aria-label="Akhiri ' + esc(r.proses) + '">' + ic("kd-power") + '<span>Akhiri</span></button>';
        return '<tr><td><span class="kd-mono">' + r.port + '</span></td>' +
          '<td><span class="tag">' + r.proto + '</span></td>' +
          '<td><span class="kd-mono">' + esc(r.alamat) + '</span></td>' +
          '<td><span class="kd-proc-state" data-s="' + (r.status === "Mendengar" ? "dengar" : "hubung") + '">' + esc(r.status) + '</span></td>' +
          '<td><span class="dtable-title">' + esc(r.proses) + '</span><span class="dtable-sub">' + esc(r.ket) + '</span></td>' +
          '<td><span class="kd-mono">' + r.pid + '</span></td>' +
          '<td><span class="kd-mono">' + esc(r.memori) + '</span></td>' +
          '<td class="c-act">' + aksi + '</td></tr>';
      }).join("") + '</tbody></table>';
  };

  /* -------------------------------------------------------------- perangkat */
  var renderPerangkat = function () {
    var body = $("#kdDevBody");
    if (S.dataState === "memuat") {
      body.innerHTML = '<div style="padding:14px"><div class="skel"><span></span><span></span><span></span></div></div>';
      return;
    }
    if (S.dataState === "gagal") {
      body.innerHTML = '<div style="padding:14px"><div class="kd-error"><span class="glyph">' + ic("k-alert") + '</span><b>Daftar perangkat tidak dapat dimuat</b><p>Server lokal belum menjawab. Coba lagi setelah aplikasi siap.</p><button class="btn btn-sm" type="button" data-retry="1">Coba lagi</button></div></div>';
      return;
    }
    if (S.dataState === "kosong" || !S.perangkat.length) {
      body.innerHTML = '<div class="empty"><span class="glyph">' + ic("kd-phone") + '</span><h4>Belum ada perangkat terpasang</h4><p>Pindai QR atau masukkan kode di halaman Remote pada ponsel.</p></div>';
      return;
    }
    body.innerHTML = '<table class="dtable kd-dtable-dev"><thead><tr><th>Perangkat</th><th>Jenis</th><th>Alamat</th><th>Terakhir aktif</th><th class="c-act">Aksi</th></tr></thead><tbody>' +
      S.perangkat.map(function (d, i) {
        return '<tr><td><span class="dtable-title">' + esc(d.nama) + '</span><span class="dtable-sub">Dipasangkan di jaringan ini</span></td>' +
          '<td>' + esc(d.jenis) + '</td><td><span class="kd-mono">' + esc(d.alamat) + '</span></td>' +
          '<td>' + esc(d.terakhir) + '</td>' +
          '<td class="c-act"><button class="kd-ghost-btn kd-ghost-xs" type="button" data-lupakan="' + i + '" aria-label="Lupakan ' + esc(d.nama) + '" title="Lupakan perangkat">' + ic("k-trash") + '</button></td></tr>';
      }).join("") + '</tbody></table>';
  };

  /* ------------------------------------------------------------- soundboard */
  var renderSuara = function () {
    var body = $("#kdSbBody");
    if (S.dataState === "memuat") {
      body.innerHTML = '<div class="kd-sb">' + [1, 2, 3].map(function () {
        return '<div class="kd-skel-card"><div class="skel"><span></span><span></span></div></div>';
      }).join("") + '</div>';
      return;
    }
    if (S.dataState === "gagal") {
      body.innerHTML = '<div class="kd-error"><span class="glyph">' + ic("k-alert") + '</span><b>Daftar suara tidak dapat dimuat</b><p>Folder suara tidak dapat dibaca. Periksa izin folder data.</p><button class="btn btn-sm" type="button" data-retry="1">Coba lagi</button></div>';
      return;
    }
    if (S.dataState === "kosong" || !S.suara.length) {
      body.innerHTML = '<div class="kd-empty-state"><div class="empty"><span class="glyph">' + ic("k-volume") + '</span><h4>Belum ada suara</h4><p>Unggah berkas audio atau tambahkan tautan. Suara bisa dipasang ke tombol lewat editor.</p><button class="btn btn-sm btn-primary" type="button" data-unggah="1">Unggah suara</button></div></div>';
      return;
    }
    body.innerHTML = '<div class="kd-sb">' + S.suara.map(function (s) {
      var state = "";
      if (s.status === "siap") state = '<span class="status" data-s="done">Siap diputar</span>';
      if (s.status === "unduh") state = '<span class="status" data-s="progress">Mengunduh ' + s.progres + '%</span>';
      if (s.status === "gagal") state = '<span class="status" data-s="fail">Unduhan gagal</span>';
      var meta = s.sumber + (s.durasi ? " · " + s.durasi : "") + (s.ukuran ? " · " + s.ukuran : "");
      if (s.status === "gagal") meta = s.sumber + " · " + s.pesan;
      var bar = s.status === "unduh" ? '<div class="kd-sb-bar"><i style="width:' + s.progres + '%"></i></div>' : "";
      return '<div class="kd-sb-row' + (S.playing === s.id ? " is-playing" : "") + '" data-id="' + s.id + '">' +
        '<button class="kd-play" type="button" data-mainkan="' + s.id + '" aria-label="' + (S.playing === s.id ? "Hentikan " : "Putar ") + esc(s.nama) + '">' +
        ic(S.playing === s.id ? "k-pause" : "k-play") + '</button>' +
        '<div class="kd-sb-main"><b>' + esc(s.nama) + '</b><span class="kd-sb-meta">' + esc(meta) + '</span>' + bar + '</div>' +
        '<div class="kd-sb-state">' + state + '</div>' +
        '<button class="kd-ghost-btn kd-ghost-xs" type="button" data-ubahsuara="' + s.id + '" aria-label="Ubah ' + esc(s.nama) + '">' + ic("k-pencil") + '</button>' +
        '<button class="kd-ghost-btn kd-ghost-xs" type="button" data-hapussuara="' + s.id + '" aria-label="Hapus ' + esc(s.nama) + '">' + ic("k-trash") + '</button>' +
        '</div>';
    }).join("") + '</div>';
  };

  /* ------------------------------------------------------------------ navigasi */
  var animateView = function (el) {
    if (!el) return;
    el.classList.remove("is-enter");
    void el.offsetWidth;
    el.classList.add("is-enter");
  };

  var showView = function (view) {
    var prev = S.view;
    S.view = view;
    $$(".kd-rail-btn[data-nav]").forEach(function (b) {
      if (b.dataset.nav === view) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    ["papan", "soundboard", "riwayat", "proses", "perangkat", "setelan"].forEach(function (v) {
      $("#view-" + v).hidden = v !== view;
    });
    var onBoard = view === "papan";
    $("#kdContent").dataset.panel = onBoard && S.panel ? "open" : "off";
    $("#kdContent").dataset.view = view;
    $("#kdEdit").hidden = !onBoard;
    renderHeader();
    if (view === "riwayat") renderRiwayat();
    if (view === "proses") renderProses();
    if (view === "perangkat") renderPerangkat();
    if (view === "soundboard") renderSuara();
    if (onBoard) {
      fitBoard();
      /* Masuk ke Papan dari bagian lain: jendela menyesuaikan diri ke papan
         sekali, dengan animasi yang sama seperti saat panel dibuka. */
      requestAnimationFrame(function () {
        if (S.view === "papan") pasJendela();
      });
    }
    if (prev !== view) animateView($("#view-" + view));
    moveRailInk();
    if (onBoard) placeInk($("#kdTabs"), "underline");
    placeInk($("#kdThemeSeg"), "pill", 'button[aria-pressed="true"]', "");

    /* Panel kanan membuka atau menutup bersamaan; ukuran kartu baru terbaca
       setelah transisinya selesai, jadi tinta dihitung ulang sekali lagi. */
    clearTimeout(showView._t);
    showView._t = setTimeout(function () {
      if (S.view !== view) return;
      moveRailInk();
      if (S.view === "papan") {
        fitBoard();
        placeInk($("#kdTabs"), "underline");
      }
      placeInk($("#kdThemeSeg"), "pill", 'button[aria-pressed="true"]', "");
    }, 280);
  };

  var staggerBoard = function () {
    var board = $("#kdBoard");
    if (board) {
      board.classList.remove("is-swap");
      void board.offsetWidth;
      board.classList.add("is-swap");
    }
    clearTimeout(staggerBoard._t);
    staggerBoard._t = setTimeout(function () {
      $$(".kd-board.is-swap").forEach(function (b) { b.classList.remove("is-swap"); });
    }, 320);
  };

  var switchPage = function (id) {
    if (!id || id === S.pageId) return;
    S.pageId = id;
    try { localStorage.setItem("kumideck-halaman", id); } catch (e) { /* penyimpanan UI tidak wajib */ }
    /* Papan digambar lebih dulu, garis tab menyusul: transisi garis bawah
       dimulai setelah tata letak papan baru selesai, bukan di tengahnya. */
    renderBoard();
    renderTabs();
    staggerBoard();
  };

  /* ------------------------------------------------------------------ editor */
  var setDraft = function (patch) {
    Object.keys(patch).forEach(function (key) { S.draft[key] = patch[key]; });
    updatePreview();
  };

  var fieldHTML = function (f, aksi, kind) {
    var v = aksi[f.k] == null ? "" : aksi[f.k];
    var id = "kd-f-" + kind + "-" + f.k;
    if (f.t === "check") {
      return '<label class="list-row is-link" style="padding-left:2px;min-height:34px"><input type="checkbox" data-ak="' + f.k + '" data-kind="' + kind + '"' + (v ? " checked" : "") + '><span class="list-title">' + esc(f.l) + '</span></label>';
    }
    var control;
    if (f.t === "select") {
      control = '<select id="' + id + '" data-ak="' + f.k + '" data-kind="' + kind + '">' + f.opts.map(function (o) {
        var val = Array.isArray(o) ? o[0] : o;
        var lbl = Array.isArray(o) ? o[1] : o;
        return '<option value="' + esc(val) + '"' + (String(v) === String(val) ? " selected" : "") + '>' + esc(lbl) + '</option>';
      }).join("") + '</select>';
    } else if (f.t === "textarea") {
      control = '<textarea id="' + id + '" rows="2" data-ak="' + f.k + '" data-kind="' + kind + '" placeholder="' + esc(f.ph || "") + '">' + esc(v) + '</textarea>';
    } else if (f.t === "pages") {
      control = '<select id="' + id + '" data-ak="' + f.k + '" data-kind="' + kind + '">' + S.deck.pages.map(function (p) {
        return '<option value="' + p.id + '"' + (v === p.id ? " selected" : "") + '>' + esc(p.name) + '</option>';
      }).join("") + '</select>';
    } else if (f.t === "sounds") {
      control = '<select id="' + id + '" data-ak="' + f.k + '" data-kind="' + kind + '">' + S.suara.map(function (s) {
        return '<option value="' + s.id + '"' + (v === s.id ? " selected" : "") + '>' + esc(s.nama) + '</option>';
      }).join("") + '</select>';
    } else {
      control = '<input id="' + id + '" type="' + (f.t === "number" ? "number" : "text") + '" data-ak="' + f.k + '" data-kind="' + kind + '" value="' + esc(v) + '" placeholder="' + esc(f.ph || "") + '" spellcheck="false">';
    }
    return '<div class="field"><label for="' + id + '">' + esc(f.l) + '</label>' + control +
      (f.help ? '<span class="help">' + esc(f.help) + '</span>' : "") + '</div>';
  };

  var stepsHTML = function (aksi, kind) {
    var steps = aksi.steps || [];
    return '<div class="kd-steps" data-steps="' + kind + '">' + steps.map(function (st, i) {
      var at = (st.action && st.action.type) || "buka";
      return '<div class="kd-step" data-step="' + i + '">' +
        '<div class="field"><input type="number" data-sk="delay" value="' + (st.delay || 0) + '" aria-label="Jeda langkah ' + (i + 1) + ' milidetik"></div>' +
        '<div class="field"><input type="text" data-sk="target" value="' + esc((st.action && (st.action.target || st.action.combo)) || "") + '" placeholder="Target langkah ' + (i + 1) + '" aria-label="Target langkah ' + (i + 1) + '"></div>' +
        '<button class="kd-ghost-btn" type="button" data-delstep="' + i + '" aria-label="Hapus langkah ' + (i + 1) + '">' + ic("k-close") + '</button>' +
        '<input type="hidden" data-sk="type" value="' + esc(at) + '">' +
        '</div>';
    }).join("") + '</div>' +
      '<button class="btn btn-sm" type="button" data-addstep="1">' + ic("k-plus") + 'Tambah langkah</button>';
  };

  var kondisionalHTML = function (aksi, kind) {
    var pair = function (which, label) {
      var sub = aksi[which] || { type: "kosong" };
      var opts = ["kosong", "buka", "hotkey", "media"];
      return '<div class="kd-form-2"><div class="field"><label>' + label + '</label><select data-cond-ak="' + which + '.type">' +
        opts.map(function (o) { return '<option value="' + o + '"' + (sub.type === o ? " selected" : "") + '>' + ACTIONS[o].label + '</option>'; }).join("") +
        '</select></div><div class="field"><label>Target</label><input type="text" data-cond-ak="' + which + '.value" value="' +
        esc(sub.target || sub.combo || "") + '" placeholder="' + (sub.type === "hotkey" ? "ctrl+c" : "code") + '"></div></div>';
    };
    return pair("aktif", "Bila syarat terpenuhi") + pair("tidakAktif", "Bila tidak terpenuhi");
  };

  var renderFields = function (container, aksi, kind) {
    var spec = ACTIONS[aksi.type] || ACTIONS.kosong;
    var html = spec.fields.map(function (f) { return fieldHTML(f, aksi, kind); }).join("");
    if (aksi.type === "urutan") html += stepsHTML(aksi, kind);
    if (aksi.type === "kondisional") html += kondisionalHTML(aksi, kind);
    if (!html) html = '<div class="kd-inline-note">' + ic("k-info") + '<span>Jenis aksi ini tidak butuh isian tambahan.</span></div>';
    container.innerHTML = html;
    upgradeSelects();
    refreshPicks();
  };

  var updatePreview = function () {
    if (!S.draft) return;
    var key = S.draft;
    var host = $("#kdEdPreview");
    var html = tileHTML(key, -1);
    host.innerHTML = html;
    var tile = host.querySelector(".kd-tile");
    if (tile) {
      tile.style.aspectRatio = "1 / 1";
      tile.style.pointerEvents = "none";
      tile.removeAttribute("data-idx");
    }
    var sum = aksiTeks(key.action);
    if (key.kondisi) sum += " · bersyarat (" + key.kondisi.jenis + ")";
    if (key.widget) sum = "Widget " + (WIDGET_NAMA[key.widget] || key.widget);
    if (key.folder) sum = "Folder berisi " + (key.keys || []).length + " tombol";
    $("#kdEdSummary").textContent = sum;
    $$("#kdEdVariants button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.varian === (key.variant || "default"))); });
    $$("#kdEdIcons button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.ikon === key.icon)); });
  };

  /* Widget memakai label, ikon, dan aksinya sendiri, jadi bagian itu disembunyikan. */
  var syncWidgetMode = function () {
    var on = !!$("#kdEdWidget").value;
    $("#kdEdLabelField").hidden = on;
    $("#kdEdIconField").hidden = on;
    $("#kdEdWidgetNote").hidden = !on;
    $("#kdEdMainBlock").hidden = on;
    $("#kdEdSecondBlock").hidden = on;
    $("#kdEdCondBlock").hidden = on;
  };

  /* Slot yang sedang disunting: halaman, atau isi folder bila dibuka dari
     panel folder. Satu jalur supaya simpan dan hapus tidak bercabang. */
  var slotKeys = function () {
    if (S.edFolder) {
      if (!Array.isArray(S.edFolder.keys)) S.edFolder.keys = [];
      return S.edFolder.keys;
    }
    return pageNow().keys;
  };

  var openEditor = function (idx, folder) {
    var page = pageNow();
    S.edFolder = folder || null;
    S.edFolderIdx = folder ? idx : -1;
    var daftar = slotKeys();
    var lama = daftar[idx] || null;
    var key = lama ? JSON.parse(JSON.stringify(lama)) : blankKey();
    S.idx = idx;
    S.draft = key;
    $("#kdEdTitle").textContent = lama ? "Sunting tombol" : "Tombol baru";
    $("#kdEdSub").textContent = folder
      ? "Folder " + (folder.label || "") + " · isi " + (idx + 1)
      : "Halaman " + page.name + " · slot " + (idx + 1);
    $("#kdEdDelete").hidden = !lama;

    $("#kdEdLabel").value = key.label || "";
    $("#kdEdLabel").closest(".field").querySelector(".help").textContent =
      "Variabel diisi saat papan berjalan. Pratinjau memakai nilai contoh.";

    $("#kdEdVars").innerHTML = VARS.map(function (v) {
      return '<button class="kd-var" type="button" data-var="' + v + '">' + v + '</button>';
    }).join("");

    $("#kdEdIcons").innerHTML = ICONS.map(function (id) {
      return '<button class="kd-ico-btn" type="button" data-ikon="' + id + '" aria-pressed="' + (key.icon === id) + '" aria-label="Ikon ' + id.replace(/^(k|kd)-/, "") + '">' + ic(id) + '</button>';
    }).join("");

    $("#kdEdVariants").innerHTML = VARIANTS.map(function (v) {
      return '<button class="kd-variant" type="button" data-varian="' + v.id + '" aria-pressed="' + ((key.variant || "default") === v.id) + '">' +
        '<i style="background:' + v.bg + '"></i>' + v.label + '</button>';
    }).join("");

    $("#kdEdAccent").value = key.warna || "#4f5fdb";
    var span = key.span || { c: 1, r: 1 };
    $("#kdEdSize").value = span.c + "x" + span.r;
    $("#kdEdWidget").value = key.widget || "";
    syncWidgetMode();

    var types = Object.keys(ACTIONS).map(function (id) {
      return '<option value="' + id + '">' + esc(ACTIONS[id].label) + '</option>';
    }).join("");
    $("#kdEdType").innerHTML = types;
    $("#kdEdSecondType").innerHTML = types;
    $("#kdEdType").value = key.action ? key.action.type : "kosong";
    var second = key.actionKedua;
    $("#kdEdSecondType").value = second ? second.type : "buka";
    $("#kdEdSecondOn").setAttribute("aria-checked", String(!!second));
    $("#kdEdSecondBlock").toggleAttribute("data-off", !second);

    renderFields($("#kdEdFields"), key.action || { type: "kosong" }, "main");
    renderFields($("#kdEdSecondFields"), second || { type: "buka", target: "" }, "second");

    var cond = key.kondisi || {};
    $("#kdEdCond").value = cond.jenis || "";
    $("#kdEdCondVal").disabled = !cond.jenis;
    $("#kdEdCondVal").value = cond.nilai || "";
    syncCondInput();

    updatePreview();
    refreshPicks();
    $("#kdDlgEditor").showModal();
    setTimeout(function () { if (!$("#kdEdLabelField").hidden) $("#kdEdLabel").focus(); }, 40);
  };

  var syncCondInput = function () {
    var jenis = $("#kdEdCond").value;
    var input = $("#kdEdCondVal");
    var wrap = $("#kdEdCondValWrap");
    input.disabled = !jenis;
    var map = {
      jam: { ph: "08:00-17:00", lbl: "Rentang jam", val: "08:00-17:00" },
      hari: { ph: "senin-jumat", lbl: "Hari", val: "senin-jumat" },
      jaringan: { ph: "NamaWiFi", lbl: "Nama jaringan", val: "" },
      proses: { ph: "code.exe", lbl: "Nama proses", val: "" },
      mikrofon: { ph: "mati", lbl: "Status mikrofon", val: "mati" },
      halaman: { ph: "Utama", lbl: "Nama halaman", val: pageNow().name }
    };
    var m = map[jenis];
    wrap.querySelector("label").textContent = m ? m.lbl : "Nilai";
    input.placeholder = m ? m.ph : "Isi syarat";
    if (!input.value && m && m.val) input.value = m.val;
  };

  var saveEditor = function () {
    var page = pageNow();
    var key = S.draft;
    key.label = $("#kdEdLabel").value.trim() || "Tombol";
    var span = ($("#kdEdSize").value || "1x1").split("x");
    key.span = { c: Number(span[0]), r: Number(span[1]) };
    key.widget = $("#kdEdWidget").value || null;
    if (key.widget) {
      key.action = { type: "kosong" };
    } else {
      key.action = key.action || { type: "kosong" };
      key.action.type = $("#kdEdType").value;
      if (key.action.type === "urutan" && !key.action.steps) key.action.steps = [];
    }
    if ($("#kdEdSecondOn").getAttribute("aria-checked") === "true") {
      key.actionKedua = key.actionKedua || { type: $("#kdEdSecondType").value };
      key.actionKedua.type = $("#kdEdSecondType").value;
    } else {
      delete key.actionKedua;
    }
    var jenis = $("#kdEdCond").value;
    key.kondisi = jenis ? { jenis: jenis, nilai: $("#kdEdCondVal").value.trim() } : null;
    if (!key.kondisi) delete key.kondisi;

    slotKeys()[S.idx] = key;
    if (S.edFolder) {
      /* Folder ikut diperbarui di dekat halaman asalnya. */
      S.folder = S.edFolder;
      renderFolder();
    } else if (S.folder && key.folder && pageNow().keys[S.idx] === key) {
      S.folder = key;
      renderFolder();
    }
    S.edFolder = null;
    renderBoard();
    renderTabs();
    simpanDeck();
    $("#kdDlgEditor").close();
    toast("Tombol disimpan.", true);
  };

  /* ------------------------------------------------------------------ init */
  var bind = function () {
    /* rail + navigasi */
    $$(".kd-rail-btn[data-nav]").forEach(function (b) {
      b.addEventListener("click", function () { showView(b.dataset.nav); });
    });
    $$("[data-go]").forEach(function (b) {
      b.addEventListener("click", function () { showView(b.dataset.go); });
    });

    /* tema */
    $("#kdTheme").addEventListener("click", function () {
      applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
    });
    $$("#kdThemeSeg button").forEach(function (b) {
      b.addEventListener("click", function () { applyTheme(b.dataset.tema); });
    });

    /* papan: klik, drag, tambah */
    $("#kdBoard").addEventListener("click", function (e) {
      var add = e.target.closest("[data-add]");
      if (add) { openEditor(Number(add.dataset.add)); return; }
      if (e.target.closest("[data-retry]")) {
        muatAwal();
        toast("Papan dimuat ulang.", true);
        return;
      }
      if (e.target.closest("[data-pulihkan]")) {
        pulihkanCadangan();
        return;
      }
      var el = e.target.closest(".kd-tile[data-idx]");
      if (!el) return;
      var idx = Number(el.dataset.idx);
      var key = pageNow().keys[idx];
      if (!key) return;
      if (S.editing && key.folder) { openFolder(key); return; }
      if (S.editing) { openEditor(idx); return; }
      if (key.folder) { openFolder(key); return; }
      jalankan(key, el, "Papan");
    });

    var dragIdx = -1;
    $("#kdBoard").addEventListener("dragstart", function (e) {
      var el = e.target.closest(".kd-tile[data-idx]");
      if (!el || !S.editing) { e.preventDefault(); return; }
      dragIdx = Number(el.dataset.idx);
      el.classList.add("is-drag");
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", String(dragIdx)); } catch (err) {}
    });
    $("#kdBoard").addEventListener("dragend", function () {
      $$("#kdBoard .kd-tile").forEach(function (t) { t.classList.remove("is-drag", "is-drop"); });
      dragIdx = -1;
    });
    $("#kdBoard").addEventListener("dragover", function (e) {
      if (!S.editing) return;
      var el = e.target.closest(".kd-tile[data-idx], .kd-empty[data-add]");
      if (!el) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      $$("#kdBoard .is-drop").forEach(function (t) { t.classList.remove("is-drop"); });
      el.classList.add("is-drop");
    });
    $("#kdBoard").addEventListener("drop", function (e) {
      var el = e.target.closest(".kd-tile[data-idx], .kd-empty[data-add]");
      if (!el || !S.editing || dragIdx < 0) return;
      e.preventDefault();
      var to = Number(el.dataset.idx != null ? el.dataset.idx : el.dataset.add);
      var keys = pageNow().keys;
      var moved = keys[dragIdx];
      keys[dragIdx] = keys[to] || null;
      keys[to] = moved;
      renderBoard();
      simpanDeck();
      toast("Posisi tombol ditukar.", true);
    });

    $("#kdEdit").addEventListener("click", function () {
      S.editing = !S.editing;
      $("#kdEditLabel").textContent = S.editing ? "Selesai" : "Sunting meja";
      $("#kdEditbar").hidden = !S.editing;
      document.body.classList.toggle("kd-editing", S.editing);
      renderBoard();
      if (S.folder) renderFolder();
      if (S.editing) toast("Mode sunting aktif. Klik tombol untuk mengubah.");
    });
    $("#kdEditAdd").addEventListener("click", function () {
      var keys = pageNow().keys;
      var free = keys.findIndex(function (k) { return !k; });
      openEditor(free >= 0 ? free : 0);
    });
    $("#kdEditFolder").addEventListener("click", function () {
      var keys = pageNow().keys;
      var free = keys.findIndex(function (k) { return !k; });
      if (free < 0) { toast("Tidak ada slot kosong di halaman ini.", false); return; }
      keys[free] = { label: "Folder baru", icon: "k-folder", variant: "tint", action: { type: "kosong" }, folder: true, keys: [] };
      renderBoard();
      openEditor(free);
    });
    $("#kdFolderEdit").addEventListener("click", function () {
      if (!S.folder) return;
      var idx = pageNow().keys.indexOf(S.folder);
      if (idx < 0) return;
      openEditor(idx);
    });

    /* halaman */
    $("#kdTabs").addEventListener("click", function (e) {
      var t = e.target.closest("[data-page]");
      if (!t) return;
      switchPage(t.dataset.page);
    });
    $("#kdAddPage").addEventListener("click", function () {
      $("#kdPgName").value = "";
      $("#kdDlgPage").showModal();
      setTimeout(function () { $("#kdPgName").focus(); }, 40);
    });
    $("#kdPgSave").addEventListener("click", function () {
      var nama = $("#kdPgName").value.trim();
      if (!nama) { $("#kdPgName").focus(); return; }
      var total = ((S.deck.profile && S.deck.profile.columns) || 5) * ((S.deck.profile && S.deck.profile.rows) || 3);
      var id = "p" + (S.deck.pages.length + 1) + "-" + Date.now().toString(36);
      S.deck.pages.push({ id: id, name: nama, keys: new Array(total).fill(null) });
      S.pageId = id;
      $("#kdDlgPage").close();
      renderTabs(); renderBoard();
      staggerBoard();
      simpanDeck();
      toast("Halaman " + nama + " ditambahkan.", true);
    });
    $("#kdPgClose").addEventListener("click", function () { $("#kdDlgPage").close(); });

    /* panel kanan */
    var lepasPapan = 0;
    var setPanel = function (open) {
      if (S.panel === open) return;
      S.panel = open;
      $("#kdContent").dataset.panel = open && S.view === "papan" ? "open" : "off";
      if (S.view !== "papan") return;
      /* Selama panel meluncur, jendela menyusul dalam beberapa langkah. Papan
         dikunci di posisinya supaya tidak ikut bergeser saat lebar isi
         berubah sedikit lebih cepat dari tepi jendela. */
      var board = $("#kdBoard");
      var view = $("#view-papan");
      var isi = $("#kdContent");
      isi.classList.add("is-geser");
      if (board && view) {
        var gaya = getComputedStyle(view);
        var isiKiri = view.getBoundingClientRect().left + (parseFloat(gaya.borderLeftWidth) || 0) + (parseFloat(gaya.paddingLeft) || 0);
        var kiri = Math.round(board.getBoundingClientRect().left - isiKiri);
        board.style.marginLeft = Math.max(0, kiri) + "px";
        board.style.marginRight = "0px";
        clearTimeout(lepasPapan);
        lepasPapan = setTimeout(function () {
          board.style.marginLeft = "";
          board.style.marginRight = "";
          isi.classList.remove("is-geser");
        }, 560);
      }
      /* Lebar jendela bergerak tepat sebesar lebar panel, searah dengan
         transisinya. Papan lalu ditata sekali setelah keduanya selesai, jadi
         ukurannya tidak melompat dua kali. */
      var sisi = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--kd-side-w"));
      if (!isFinite(sisi)) sisi = 296;
      var rel = document.querySelector(".kd-rail");
      var relSekarang = rel ? rel.offsetWidth : 68;
      var lebarBaru = ukuranSekarang.w + (open ? sisi : -sisi);
      /* Rel menyempit di bawah 900 px. Imbangi selisihnya supaya ukuran ubin
         tidak berubah hanya karena panel dibuka atau ditutup. */
      var relBaru = lebarBaru > 900 ? 68 : 56;
      animasiUkuran(lebarBaru + (relBaru - relSekarang), ukuranSekarang.h);
    };
    $("#kdSideClose").addEventListener("click", function () { setPanel(false); });
    $("#kdPanelOpen").addEventListener("click", function () { setPanel(true); });

    /* folder */
    $("#kdFolderBack").addEventListener("click", closeFolder);
    $("#kdFolderScrim").addEventListener("click", closeFolder);
    $("#kdFolderGrid").addEventListener("click", function (e) {
      var tambah = e.target.closest("[data-fadd]");
      if (tambah && S.folder) {
        openEditor(Number(tambah.dataset.fadd), S.folder);
        return;
      }
      var el = e.target.closest("[data-fidx]");
      if (!el || !S.folder) return;
      var idx = Number(el.dataset.fidx);
      var child = S.folder.keys[idx];
      if (!child) return;
      if (S.editing) {
        openEditor(idx, S.folder);
        return;
      }
      jalankan(child, el, "Papan");
    });

    /* jendela: perintah ke cangkang Rust lewat IPC WebView2 */
    $("#kdMin").addEventListener("click", function () { ipc("minimalkan"); });
    $("#kdMax").addEventListener("click", function () { ipc("maksimalkan"); });
    $("#kdClose").addEventListener("click", function () { $("#kdDlgClose").showModal(); });
    $("#kdClX").addEventListener("click", function () { $("#kdDlgClose").close(); });
    $("#kdClYes").addEventListener("click", function () {
      $("#kdDlgClose").close();
      ipc("tutup");
    });

    /* geser jendela dari bilah atas, kecuali tombol dan tab */
    $(".kd-top").addEventListener("mousedown", function (e) {
      if (e.button !== 0) return;
      if (e.target.closest("button, input, select, a, [role='tab']")) return;
      ipc("geser");
    });

    /* header */
    $("#kdRemoteChip").addEventListener("click", function () { showView("perangkat"); });
    $("#kdPin").addEventListener("click", function () {
      var on = $("#kdPin").getAttribute("aria-pressed") === "true";
      $("#kdPin").setAttribute("aria-pressed", String(!on));
      $("#kdSetTop").setAttribute("aria-checked", String(!on));
      S.sw.top = !on;
      aturSetelan("teratas", !on);
      ipc("teratas:" + (!on ? "1" : "0"));
      toast(on ? "Jendela tidak lagi selalu di atas." : "Jendela selalu di atas.");
    });
    $("#kdCopyUrl").addEventListener("click", function () { salin($("#kdRemoteUrl").textContent); });

    /* soundboard */
    syncRange($("#kdSbVol"));
    $("#kdSbVol").addEventListener("input", function () {
      $("#kdSbVolVal").textContent = $("#kdSbVol").value + "%";
      syncRange($("#kdSbVol"));
    });
    $("#kdSbUpload").addEventListener("click", function () { $("#kdFileSuara").click(); });
    $("#kdFileSuara").addEventListener("change", function () {
      var f = $("#kdFileSuara").files && $("#kdFileSuara").files[0];
      $("#kdFileSuara").value = "";
      if (!f) return;
      if (f.size > 25 * 1024 * 1024) { toast("Berkas suara maksimal 25 MB.", false); return; }
      var pembaca = new FileReader();
      pembaca.onload = function () {
        minta("/api/suara/unggah", {
          method: "POST",
          body: JSON.stringify({ nama: f.name, dataUrl: String(pembaca.result || "") })
        }).then(function (j) {
          if (!j.ok) { toast(j.message || "Berkas suara gagal disimpan.", false); return; }
          return simpanSuara({
            name: f.name.replace(/\.[^.]+$/, "").slice(0, 32),
            sumber: j.sumber,
            volume: 100
          }).then(function () { toast("Berkas " + f.name + " ditambahkan.", true); });
        }).catch(function () { toast("Berkas suara gagal disimpan.", false); });
      };
      pembaca.readAsDataURL(f);
    });
    $("#kdSbLink").addEventListener("click", function () {
      $("#kdLkNama").value = "";
      $("#kdLkUrl").value = "";
      $("#kdDlgLink").showModal();
      setTimeout(function () { $("#kdLkNama").focus(); }, 40);
    });
    $("#kdLkSave").addEventListener("click", function () {
      var nama = $("#kdLkNama").value.trim();
      var url = $("#kdLkUrl").value.trim();
      if (!nama || !/^https?:\/\//.test(url)) {
        if (!nama) $("#kdLkNama").focus(); else $("#kdLkUrl").focus();
        toast("Nama dan alamat http atau https wajib diisi.", false);
        return;
      }
      simpanSuara({ name: nama, sumber: url, volume: 100 }).then(function (ok) {
        if (!ok) return;
        $("#kdDlgLink").close();
        toast("Tautan " + nama + " ditambahkan, unduhan dimulai.", true);
      });
    });
    $("#kdLkClose").addEventListener("click", function () { $("#kdDlgLink").close(); });

    $("#kdSbBody").addEventListener("click", function (e) {
      var play = e.target.closest("[data-mainkan]");
      if (play) {
        var id = play.dataset.mainkan;
        if (S.playing === id) {
          minta("/api/audio/hentikan", { method: "POST", body: "{}" });
          S.playing = null;
          renderSuara();
          return;
        }
        minta("/api/audio/mainkan", {
          method: "POST",
          body: JSON.stringify({ id: id, volume: Number($("#kdSbVol") ? $("#kdSbVol").value : 100) })
        }).then(function (j) {
          if (!j.ok) { toast(j.message || "Suara tidak dapat diputar.", false); return; }
          S.playing = id;
          renderSuara();
          toast("Memutar " + (S.suara.filter(function (s) { return s.id === id; })[0] || {}).nama + ".", true);
        }).catch(function () { toast("Suara tidak dapat diputar.", false); });
        return;
      }
      var del = e.target.closest("[data-hapussuara]");
      if (del) {
        minta("/api/soundboard/hapus", { method: "POST", body: JSON.stringify({ id: del.dataset.hapussuara }) })
          .then(function (j) {
            if (!j.ok) { toast(j.message || "Suara tidak dapat dihapus.", false); return; }
            if (S.deck && j.soundboard) S.deck.soundboard = j.soundboard;
            pasangSuara();
            renderSuara();
            toast("Suara dihapus.", true);
          }).catch(function () { toast("Suara tidak dapat dihapus.", false); });
        return;
      }
      var up = e.target.closest("[data-unggah]");
      if (up) $("#kdFileSuara").click();
      if (e.target.closest("[data-retry]")) { muatUnduhan(); toast("Data dimuat ulang.", true); }
    });

    /* riwayat */
    $("#kdHistSearch").addEventListener("input", function () {
      S.histSearch = $("#kdHistSearch").value.trim();
      renderRiwayat();
    });
    $("#kdHistChips").addEventListener("click", function (e) {
      var c = e.target.closest("[data-filter]");
      if (!c) return;
      S.histFilter = c.dataset.filter;
      $$("#kdHistChips .chip").forEach(function (b) { b.setAttribute("aria-pressed", String(b === c)); });
      renderRiwayat();
    });
    $("#kdHistBody").addEventListener("click", function (e) {
      var s = e.target.closest("[data-sort]");
      if (s) {
        if (S.histSort.key === s.dataset.sort) S.histSort.dir = S.histSort.dir === "asc" ? "desc" : "asc";
        else S.histSort = { key: s.dataset.sort, dir: "asc" };
        renderRiwayat();
        return;
      }
      if (e.target.closest("[data-retry]")) {
        muatAwal(); toast("Riwayat dimuat ulang.", true);
      }
    });
    $("#kdLogUnduh").addEventListener("click", function () { unduh("/api/log/unduh"); });

    /* port dan proses */
    $("#kdProcSearch").addEventListener("input", function () {
      S.procSearch = $("#kdProcSearch").value.trim();
      renderProses();
    });
    $("#kdProcChips").addEventListener("click", function (e) {
      var c = e.target.closest("[data-proc]");
      if (!c) return;
      S.procFilter = c.dataset.proc;
      $$("#kdProcChips .chip").forEach(function (b) { b.setAttribute("aria-pressed", String(b === c)); });
      renderProses();
    });
    $("#kdProcRefresh").addEventListener("click", function () {
      muatPort();
    });
    $("#kdProcBody").addEventListener("click", function (e) {
      var a = e.target.closest("[data-akhiri]");
      if (a) {
        S.procIdx = Number(a.dataset.akhiri);
        var r = S.proses[S.procIdx];
        if (!r) return;
        $("#kdPrProc").textContent = r.proses;
        $("#kdPrPid").textContent = "PID " + r.pid;
        $("#kdDlgProses").showModal();
        return;
      }
      if (e.target.closest("[data-retry]")) {
        muatPort(true);
      }
    });
    $("#kdPrClose").addEventListener("click", function () { $("#kdDlgProses").close(); });
    $("#kdPrSave").addEventListener("click", function () {
      var r = S.proses[S.procIdx];
      if (!r) { $("#kdDlgProses").close(); return; }
      $("#kdPrSave").disabled = true;
      minta("/api/proc/end", { method: "POST", body: JSON.stringify({ pid: r.pid }) })
        .then(function (j) {
          $("#kdPrSave").disabled = false;
          $("#kdDlgProses").close();
          if (!j.ok) { toast(j.message || "Proses tidak dapat diakhiri.", false); return; }
          muatPort();
          toast(r.proses + " diakhiri, port dilepas.", true);
        }).catch(function () {
          $("#kdPrSave").disabled = false;
          toast("Proses tidak dapat diakhiri.", false);
        });
    });

    /* perangkat */
    $("#kdDevBody").addEventListener("click", function (e) {
      var l = e.target.closest("[data-lupakan]");
      if (l) {
        var d = S.perangkat[Number(l.dataset.lupakan)];
        if (!d) return;
        minta("/api/devices/revoke", { method: "POST", body: JSON.stringify({ deviceId: d.id }) })
          .then(function (j) {
            if (!j.ok) { toast(j.message || "Perangkat tidak dapat dilupakan.", false); return; }
            muatAwal();
            toast((d.nama || "Perangkat") + " dilupakan.", true);
          }).catch(function () { toast("Perangkat tidak dapat dilupakan.", false); });
        return;
      }
      if (e.target.closest("[data-retry]")) {
        muatAwal();
        toast("Daftar perangkat dimuat ulang.", true);
      }
    });
    $("#kdNewCode").addEventListener("click", function () {
      minta("/api/pair-info").then(function (j) {
        var kode = (j.kode || "").toUpperCase();
        if (!kode) { toast("Kode pairing tidak tersedia.", false); return; }
        S.kode = kode;
        $("#kdPairCode").textContent = kode;
        $("#kdSetCode").textContent = kode;
        salin(kode);
        toast("Kode pairing disalin: " + kode, true);
      }).catch(function () { toast("Kode pairing tidak tersedia.", false); });
    });
    $("#kdCopyCode").addEventListener("click", function () { salin(S.kode); });
    $("#kdSetCodeCopy").addEventListener("click", function () { salin(S.kode); });
    $("#kdPairSertifikat").addEventListener("click", function () { unduh("/api/sertifikat"); });

    /* setelan */
    var sw = function (id, kunci, label) {
      var el = $(id);
      el.addEventListener("click", function () {
        var on = el.getAttribute("aria-checked") === "true";
        var baru = !on;
        el.setAttribute("aria-checked", String(baru));
        if (kunci) S.sw[kunci] = baru;
        if (kunci === "hotkey") {
          $("#kdSetHotkeyRow").toggleAttribute("data-off", !baru);
          $("#kdSetHotkeyCombo").disabled = !baru;
        }
        if (kunci === "top") {
          $("#kdPin").setAttribute("aria-pressed", String(baru));
          ipc("teratas:" + (baru ? "1" : "0"));
        }
        if (kunci === "https") {
          $("#kdPairHttps").textContent = baru ? "HTTPS aktif" : "HTTP saja";
          $("#kdRemoteUrl").textContent = new URL("/remote", alamatRemote()).href;
        }
        if (kunci === "update" && baru) cekPembaruan(true);
        var peta = { sound: "sound", lock: "terkunci", top: "teratas", auto: "mulaiOtomatis", update: "periksaPembaruan" };
        if (peta[kunci]) aturSetelan(peta[kunci], baru);
        toast(label + (baru ? " diaktifkan." : " dimatikan."));
      });
    };
    sw("#kdSetSound", "sound", "Umpan balik suara");
    sw("#kdSetLock", "lock", "Kunci tata letak");
    sw("#kdSetHotkey", "hotkey", "Pintasan global");
    sw("#kdSetTop", "top", "Selalu di atas");
    sw("#kdSetAuto", "auto", "Mulai otomatis");
    sw("#kdSetHttps", "https", "HTTPS");
    sw("#kdSetBackup", "backup", "Cadangan otomatis");
    sw("#kdSetUpdate", "update", "Periksa pembaruan");
    $("#kdSetCheckUpdate").addEventListener("click", function () { cekPembaruan(true); });

    var simpanPintasan = function (teks) {
      var nilai = String(teks || "").trim().toLowerCase();
      aturSetelan("pintasan", nilai);
      S.sw.hotkey = !!nilai;
      S.sw.hotkeyCombo = nilai || "ctrl+alt+k";
      $("#kdSetHotkey").setAttribute("aria-checked", String(!!nilai));
      $("#kdSetHotkeyRow").toggleAttribute("data-off", !nilai);
      $("#kdSetHotkeyCombo").disabled = !nilai;
      $("#kdSetHotkeyCombo").value = S.sw.hotkeyCombo;
    };
    $("#kdSetHotkey").addEventListener("click", function () {
      var nyala = $("#kdSetHotkey").getAttribute("aria-checked") === "true";
      simpanPintasan(nyala ? (S.sw.hotkeyCombo || "ctrl+alt+k") : "");
      toast(nyala ? "Pintasan global aktif: " + S.sw.hotkeyCombo + "." : "Pintasan global dimatikan.");
    });
    $("#kdSetHotkeyCombo").addEventListener("change", function () {
      var teks = $("#kdSetHotkeyCombo").value.trim().toLowerCase();
      if (!/^(ctrl|alt|shift|win)\+/.test(teks)) {
        toast("Tulis kombinasi seperti ctrl+alt+k.", false);
        $("#kdSetHotkeyCombo").value = S.sw.hotkeyCombo || "ctrl+alt+k";
        return;
      }
      simpanPintasan(teks);
      toast("Pintasan global: " + teks + ".");
    });
    $("#kdSetHttps").addEventListener("click", function () {
      var nyala = $("#kdSetHttps").getAttribute("aria-checked") === "true";
      aturSetelan("https", nyala);
      toast(nyala ? "HTTPS aktif setelah KumiDeck dibuka ulang." : "HTTP saja setelah KumiDeck dibuka ulang.");
    });

    $("#kdSwatches").innerHTML = AKSEN.map(function (hex) {
      return '<button class="kd-swatch" type="button" data-aksen="' + hex + '" aria-pressed="' + (hex === S.aksen) + '" aria-label="Aksen ' + hex + '" style="background:' + hex + '"></button>';
    }).join("");
    $("#kdSwatches").addEventListener("click", function (e) {
      var b = e.target.closest("[data-aksen]");
      if (!b) return;
      S.aksen = b.dataset.aksen;
      $$("#kdSwatches .kd-swatch").forEach(function (s) { s.setAttribute("aria-pressed", String(s === b)); });
      applyAccent(S.aksen);
      aturSetelan("aksen", S.aksen);
      toast("Warna aksen diganti.");
    });

    $("#kdSetExport").addEventListener("click", function () { $("#kdDlgExport").showModal(); });
    $("#kdExClose").addEventListener("click", function () { $("#kdDlgExport").close(); });
    $("#kdExSave").addEventListener("click", function () {
      var isi = $$("#kdDlgExport input[data-exp]").filter(function (c) { return c.checked; }).map(function (c) { return c.dataset.exp; });
      $("#kdDlgExport").close();
      if (!isi.length) { toast("Pilih dulu yang mau diekspor.", false); return; }
      var a = document.createElement("a");
      a.href = "/api/cadangan/arsip?isi=" + encodeURIComponent(isi.join(","));
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast("Arsip zip disiapkan: " + isi.join(", ") + ".", true);
    });
    $("#kdSetRestore").addEventListener("click", function () { $("#kdFileArsip").click(); });
    $("#kdFileArsip").addEventListener("change", function () {
      var f = $("#kdFileArsip").files && $("#kdFileArsip").files[0];
      $("#kdFileArsip").value = "";
      if (!f) return;

      /* Jenis berkas dibaca dari empat byte pertama: arsip 2.4.0 selalu `PK`. */
      var pembaca = new FileReader();
      pembaca.onload = function () {
        var isi = pembaca.result;
        var kepala = new Uint8Array(isi, 0, Math.min(4, isi.byteLength));
        var zip = kepala.length === 4 && kepala[0] === 0x50 && kepala[1] === 0x4b;

        if (zip) {
          if (!window.confirm("Pulihkan semua data dari " + f.name + "? Data sekarang diganti.")) return;
          fetch("/api/cadangan/arsip", {
            method: "POST",
            headers: { "content-type": "application/zip" },
            body: isi
          }).then(function (r) { return r.json(); }).then(function (j) {
            if (!j.ok) { toast(j.message || "Arsip tidak dapat dipulihkan.", false); return; }
            if (j.deck) { pasangDeck(j.deck); S.pageId = halamanAwal(j.deck); }
            renderTabs(); renderBoard(); renderSide(); renderHeader();
            muatAwal();
            toast("Arsip dipulihkan: " + (j.ikon || 0) + " ikon, " + (j.suara || 0) + " suara.", true);
          }).catch(function () { toast("Arsip tidak dapat dipulihkan.", false); });
          return;
        }

        var deck;
        try { deck = JSON.parse(new TextDecoder("utf-8").decode(new Uint8Array(isi))); } catch (e) { deck = null; }
        if (!deck) { toast("Berkas arsip tidak terbaca.", false); return; }
        minta("/api/deck/import", { method: "POST", body: JSON.stringify(deck) }).then(function (j) {
          if (!j.ok) { toast(j.message || "Arsip tidak dapat dipulihkan.", false); return; }
          if (j.deck) { pasangDeck(j.deck); S.pageId = halamanAwal(j.deck); }
          renderTabs(); renderBoard(); renderSide(); renderHeader();
          muatAwal();
          toast("Arsip " + f.name + " dipulihkan.", true);
        }).catch(function () { toast("Arsip tidak dapat dipulihkan.", false); });
      };
      pembaca.readAsArrayBuffer(f);
    });
    $("#kdSetLog").addEventListener("click", function () { unduh("/api/log/unduh"); });

    /* editor */
    $("#kdEdClose").addEventListener("click", function () { $("#kdDlgEditor").close(); });
    $("#kdEdSave").addEventListener("click", saveEditor);
    $("#kdEdDelete").addEventListener("click", function () {
      if (!pageNow()) return;
      var hapusFolder = S.folder && !S.edFolder && pageNow().keys[S.idx] === S.folder;
      slotKeys()[S.idx] = null;
      if (hapusFolder) closeFolder();
      if (S.edFolder) {
        S.folder = S.edFolder;
        renderFolder();
      }
      S.edFolder = null;
      renderBoard(); renderTabs();
      simpanDeck();
      $("#kdDlgEditor").close();
      toast("Tombol dihapus.", true);
    });
    $("#kdEdLabel").addEventListener("input", function () {
      S.draft.label = $("#kdEdLabel").value;
      updatePreview();
    });
    $("#kdEdVars").addEventListener("click", function (e) {
      var b = e.target.closest("[data-var]");
      if (!b) return;
      var input = $("#kdEdLabel");
      var start = input.selectionStart == null ? input.value.length : input.selectionStart;
      var end = input.selectionEnd == null ? start : input.selectionEnd;
      input.value = input.value.slice(0, start) + b.dataset.var + input.value.slice(end);
      input.focus();
      input.selectionStart = input.selectionEnd = start + b.dataset.var.length;
      S.draft.label = input.value;
      updatePreview();
    });
    $("#kdEdIcons").addEventListener("click", function (e) {
      var b = e.target.closest("[data-ikon]");
      if (!b) return;
      S.draft.icon = b.dataset.ikon;
      updatePreview();
    });
    $("#kdEdVariants").addEventListener("click", function (e) {
      var b = e.target.closest("[data-varian]");
      if (!b) return;
      S.draft.variant = b.dataset.varian;
      updatePreview();
    });
    $("#kdEdAccent").addEventListener("input", function () {
      S.draft.warna = $("#kdEdAccent").value;
      updatePreview();
    });
    $("#kdEdAccentReset").addEventListener("click", function () {
      delete S.draft.warna;
      $("#kdEdAccent").value = "#4f5fdb";
      updatePreview();
    });
    $("#kdEdSize").addEventListener("change", function () {
      var v = $("#kdEdSize").value.split("x");
      S.draft.span = { c: Number(v[0]), r: Number(v[1]) };
      updatePreview();
    });
    $("#kdEdWidget").addEventListener("change", function () {
      S.draft.widget = $("#kdEdWidget").value || null;
      if (S.draft.widget) S.draft.action = { type: "kosong" };
      $("#kdEdType").value = S.draft.action.type;
      renderFields($("#kdEdFields"), S.draft.action, "main");
      syncWidgetMode();
      updatePreview();
    });
    $("#kdEdType").addEventListener("change", function () {
      S.draft.action = S.draft.action || {};
      S.draft.action.type = $("#kdEdType").value;
      if (S.draft.action.type === "urutan" && !S.draft.action.steps) {
        S.draft.action.steps = [{ delay: 300, action: { type: "buka", target: "" } }];
      }
      renderFields($("#kdEdFields"), S.draft.action, "main");
      updatePreview();
    });
    $("#kdEdSecondOn").addEventListener("click", function () {
      var on = $("#kdEdSecondOn").getAttribute("aria-checked") === "true";
      $("#kdEdSecondOn").setAttribute("aria-checked", String(!on));
      $("#kdEdSecondBlock").toggleAttribute("data-off", on);
      if (on) delete S.draft.actionKedua;
      else S.draft.actionKedua = S.draft.actionKedua || { type: $("#kdEdSecondType").value, target: "" };
      updatePreview();
    });
    $("#kdEdSecondType").addEventListener("change", function () {
      S.draft.actionKedua = S.draft.actionKedua || {};
      S.draft.actionKedua.type = $("#kdEdSecondType").value;
      renderFields($("#kdEdSecondFields"), S.draft.actionKedua, "second");
      updatePreview();
    });
    $("#kdEdCond").addEventListener("change", function () {
      syncCondInput();
      if (!$("#kdEdCond").value) delete S.draft.kondisi;
      else S.draft.kondisi = { jenis: $("#kdEdCond").value, nilai: $("#kdEdCondVal").value };
      updatePreview();
    });
    $("#kdEdCondVal").addEventListener("input", function () {
      if ($("#kdEdCond").value) S.draft.kondisi = { jenis: $("#kdEdCond").value, nilai: $("#kdEdCondVal").value };
      updatePreview();
    });

    /* field aksi dinamis */
    var onActionInput = function (e) {
      var t = e.target;
      var kind = t.dataset.kind;
      if (!kind) return;
      var target = kind === "second" ? S.draft.actionKedua : S.draft.action;
      if (!target) return;
      var key = t.dataset.ak;
      target[key] = t.type === "checkbox" ? t.checked : t.value;
      if (key === "type") renderFields(kind === "second" ? $("#kdEdSecondFields") : $("#kdEdFields"), target, kind);
      updatePreview();
    };
    $("#kdEdFields").addEventListener("input", onActionInput);
    $("#kdEdFields").addEventListener("change", onActionInput);
    $("#kdEdSecondFields").addEventListener("input", onActionInput);
    $("#kdEdSecondFields").addEventListener("change", onActionInput);

    /* langkah urutan */
    var stepHost = function (kind) {
      return kind === "second" ? S.draft.actionKedua : S.draft.action;
    };
    var onSteps = function (e, kind) {
      var add = e.target.closest("[data-addstep]");
      if (add) {
        var a = stepHost(kind);
        a.steps = a.steps || [];
        a.steps.push({ delay: 300, action: { type: "buka", target: "" } });
        renderFields(kind === "second" ? $("#kdEdSecondFields") : $("#kdEdFields"), a, kind);
        updatePreview();
        return;
      }
      var del = e.target.closest("[data-delstep]");
      if (del) {
        var b = stepHost(kind);
        b.steps.splice(Number(del.dataset.delstep), 1);
        renderFields(kind === "second" ? $("#kdEdSecondFields") : $("#kdEdFields"), b, kind);
        updatePreview();
        return;
      }
      var input = e.target.closest("[data-sk]");
      if (input) {
        var row = input.closest("[data-step]");
        var c = stepHost(kind);
        var st = c.steps[Number(row.dataset.step)];
        if (!st) return;
        if (input.dataset.sk === "delay") st.delay = Number(input.value);
        else st.action.target = input.value;
        updatePreview();
      }
    };
    $("#kdEdFields").addEventListener("click", function (e) { onSteps(e, "main"); });
    $("#kdEdSecondFields").addEventListener("click", function (e) { onSteps(e, "second"); });
    $("#kdEdFields").addEventListener("input", function (e) { onSteps(e, "main"); });
    $("#kdEdSecondFields").addEventListener("input", function (e) { onSteps(e, "second"); });

    /* kondisional */
    var onCond = function (e, kind) {
      var t = e.target.closest("[data-cond-ak]");
      if (!t) return;
      var a = kind === "second" ? S.draft.actionKedua : S.draft.action;
      var parts = t.dataset.condAk.split(".");
      a[parts[0]] = a[parts[0]] || { type: "kosong" };
      if (parts[1] === "type") a[parts[0]].type = t.value;
      else a[parts[0]].target = t.value;
      updatePreview();
    };
    $("#kdEdFields").addEventListener("change", function (e) { onCond(e, "main"); });
    $("#kdEdSecondFields").addEventListener("change", function (e) { onCond(e, "second"); });

    /* tutup folder dengan Escape */
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && S.folder) closeFolder();
    });

    /* jam hidup */
    setInterval(function () {
      if (S.view !== "papan") return;
      $$('#kdBoard [data-widget="jam"]').forEach(function (el) {
        el.querySelector(".kd-tile-time").textContent = jamNow();
        el.querySelector(".kd-tile-date").textContent = tglNow();
      });
      /* Label bervariabel ikut berganti tanpa menggambar ulang seluruh papan. */
      $$("#kdBoard .kd-tile[data-idx]").forEach(function (el) {
        var key = pageNow() && pageNow().keys[Number(el.dataset.idx)];
        if (!key || !/%[a-z]+%/.test(String(key.label || ""))) return;
        var span = el.querySelector(".kd-tile-label");
        if (span) span.textContent = resolve(key.label);
      });
    }, 30000);

    /* widget monitoring hidup: angka bergerak pelan, tanpa menggambar ulang papan */
    setInterval(function () {
      if (S.view !== "papan") return;
      monGambar();
    }, 30000);

    /* Menyeret tepi jendela mengirim puluhan peristiwa resize. Semua pekerjaan
       tata letak digabung jadi satu per bingkai supaya tidak ada reflow
       berulang yang membuat seretan terasa tersendat. */
    var tataTerjadwal = false;
    var tataReda = 0;
    var rapikanTata = function (halus) {
      if (S.view === "papan") fitBoard(halus);
      moveRailInk();
      placeInk($("#kdTabs"), "underline");
      placeInk($("#kdThemeSeg"), "pill", 'button[aria-pressed="true"]', "");
    };
    window.addEventListener("resize", function () {
      ukuranSekarang.w = window.innerWidth;
      ukuranSekarang.h = window.innerHeight;
      if (animasiJendela || Date.now() - jedaSelesai < 320) return;
      /* Setelah seretan berhenti, ukuran ubin dibulatkan lagi. */
      clearTimeout(tataReda);
      tataReda = setTimeout(function () {
        if (animasiJendela) return;
        rapikanTata(false);
      }, 140);
      if (tataTerjadwal) return;
      tataTerjadwal = true;
      requestAnimationFrame(function () {
        tataTerjadwal = false;
        if (animasiJendela) return;
        rapikanTata(true);
      });
    });
  };

  var salin = function (teks) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(teks).then(function () { toast("Disalin: " + teks, true); },
        function () { toast("Tidak bisa menyalin. Salin manual: " + teks, false); });
    } else {
      toast("Disalin: " + teks, true);
    }
  };

  /* ---------------------------------------------- dropdown sendiri (Rangka) */
  var PICKS = [];

  var refreshPick = function (p) {
    p.opts = $$("option", p.sel);
    p.pop.innerHTML = p.opts.map(function (o) {
      return '<div class="pick-opt" role="option" data-v="' + esc(o.value) + '" tabindex="-1">' +
        esc(o.textContent) + ic("i-check", "pick-tick") + '</div>';
    }).join("");
    p.nodes = $$(".pick-opt", p.pop);
    var cur = p.opts.filter(function (o) { return o.value === p.sel.value; })[0] || p.opts[0];
    p.active = Math.max(0, p.opts.indexOf(cur));
    p.val.textContent = cur ? cur.textContent : "";
    p.nodes.forEach(function (n, i) { n.setAttribute("aria-selected", String(i === p.active)); });
    p.btn.disabled = p.sel.disabled;
  };

  var refreshPicks = function () {
    PICKS = PICKS.filter(function (p) { return p.root.isConnected; });
    PICKS.forEach(refreshPick);
  };

  var buildPick = function (sel) {
    if (sel.dataset.kdPick) return;
    sel.dataset.kdPick = "1";

    var root = document.createElement("div");
    root.className = "pick";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pick-btn";
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = '<span class="pick-val"></span>' + ic("i-chev", "pick-i");
    var pop = document.createElement("div");
    pop.className = "pick-pop";
    pop.setAttribute("role", "listbox");
    pop.tabIndex = -1;
    pop.hidden = true;

    sel.parentNode.insertBefore(root, sel);
    root.appendChild(sel);
    root.appendChild(btn);
    root.appendChild(pop);
    sel.classList.add("kd-select-native");

    var p = { root: root, sel: sel, btn: btn, pop: pop, val: btn.firstChild, opts: [], nodes: [], active: 0 };
    PICKS.push(p);
    refreshPick(p);

    var place = function (fresh) {
      var r = btn.getBoundingClientRect();
      var gap = 6;
      var w = Math.round(r.width);
      var ox, oy, h;
      if (fresh) {
        pop.style.animation = "none";
        pop.style.left = "0px";
        pop.style.top = "0px";
        pop.style.width = w + "px";
        var b0 = pop.getBoundingClientRect();
        ox = b0.left; oy = b0.top; h = b0.height;
        pop.style.animation = "";
      } else {
        var c = pop.getBoundingClientRect();
        ox = c.left - (parseFloat(pop.style.left) || 0);
        oy = c.top - (parseFloat(pop.style.top) || 0);
        h = pop.offsetHeight;
      }
      var below = window.innerHeight - r.bottom - gap;
      var above = r.top - gap;
      var up = below < Math.min(h, 236) && above > below;
      pop.classList.toggle("is-up", up);
      var top = up ? Math.max(8, r.top - gap - h) : r.bottom + gap;
      pop.style.width = w + "px";
      pop.style.left = Math.round(r.left - ox) + "px";
      pop.style.top = Math.round(top - oy) + "px";
    };
    var onMove = function () { if (!pop.hidden) place(false); };

    var setActive = function (i) {
      p.active = (i + p.nodes.length) % p.nodes.length;
      p.nodes.forEach(function (n, k) { n.classList.toggle("is-active", k === p.active); });
      var n = p.nodes[p.active];
      pop.setAttribute("aria-activedescendant", n.id || "");
      if (n.offsetTop < pop.scrollTop) pop.scrollTop = n.offsetTop;
      else if (n.offsetTop + n.offsetHeight > pop.scrollTop + pop.clientHeight) {
        pop.scrollTop = n.offsetTop + n.offsetHeight - pop.clientHeight;
      }
    };

    var open = function () {
      if (!pop.hidden) return;
      refreshPick(p);
      pop.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      place(true);
      setActive(p.active);
      pop.focus({ preventScroll: true });
      window.addEventListener("scroll", onMove, true);
      window.addEventListener("resize", onMove);
    };

    var close = function (focusBtn) {
      if (pop.hidden) return;
      pop.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      pop.removeAttribute("aria-activedescendant");
      p.nodes.forEach(function (n) { n.classList.remove("is-active"); });
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
      if (focusBtn) btn.focus();
    };

    var choose = function (i) {
      var o = p.opts[i];
      if (!o) return;
      sel.value = o.value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      refreshPick(p);
      close(true);
    };

    btn.addEventListener("click", function () { pop.hidden ? open() : close(true); });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(); }
    });
    pop.addEventListener("click", function (e) {
      var o = e.target.closest(".pick-opt");
      if (o) choose(p.nodes.indexOf(o));
    });
    pop.addEventListener("keydown", function (e) {
      var k = e.key;
      if (k === "ArrowDown") { e.preventDefault(); setActive(p.active + 1); }
      else if (k === "ArrowUp") { e.preventDefault(); setActive(p.active - 1); }
      else if (k === "Home") { e.preventDefault(); setActive(0); }
      else if (k === "End") { e.preventDefault(); setActive(p.nodes.length - 1); }
      else if (k === "Enter" || k === " ") { e.preventDefault(); choose(p.active); }
      else if (k === "Escape") { e.preventDefault(); close(true); }
      else if (k === "Tab") { close(false); }
      else if (k.length === 1 && /\S/.test(k)) {
        var q = k.toLowerCase(), hit = -1;
        for (var n = 1; n <= p.nodes.length; n += 1) {
          var cand = p.nodes[(p.active + n) % p.nodes.length];
          if ((cand.dataset.v || "").toLowerCase().indexOf(q) === 0) { hit = (p.active + n) % p.nodes.length; break; }
        }
        if (hit >= 0) setActive(hit);
      }
    });
    document.addEventListener("pointerdown", function (e) {
      if (!root.contains(e.target)) close(false);
    });
  };

  var upgradeSelects = function () {
    $$("select").forEach(buildPick);
  };

  /* ------------------------------------------------------------------ start */
  var tema = "light";
  try { tema = localStorage.getItem("kumideck-tema") || "light"; } catch (e) { /* penyimpanan UI tidak wajib */ }
  applyTheme(tema, true);
  upgradeSelects();
  syncRange($("#kdSbVol"));
  bind();
  renderTabs();
  renderBoard();
  renderSide();
  renderSuara();
  renderRiwayat();
  renderProses();
  renderPerangkat();
  moveRailInk();
  placeInk($("#kdTabs"), "underline");
  placeInk($("#kdThemeSeg"), "pill", 'button[aria-pressed="true"]', "");

  /* Muat keadaan, lalu sambung aliran peristiwa. */
  muatAwal().then(function () {
    dengar();
    muatUnduhan();
    muatPort(true);
    minta("/api/monitor").then(function (j) {
      monMasuk(j && j.monitor ? j.monitor : j);
    }).catch(function () { /* monitor menyusul lewat SSE */ });
    if (S.sw.update) cekPembaruan(false);
  });
})();
