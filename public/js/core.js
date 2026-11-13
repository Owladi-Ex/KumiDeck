/* KumiDeck — inti klien bersama untuk UI desktop dan UI Remote (ponsel/tablet).
   Menyediakan: token/pairing, panggilan API, aliran SSE, render tombol papan,
   injeksi sprite ikon, dan pembantu kecil lain. */
(function () {
  "use strict";

  var TOKEN_KEY = "kumideck-token";
  var DEVICE_KEY = "kumideck-device";

  /* ------------------------------------------------------------ util --- */
  function parseQuery(name) {
    try {
      return new URLSearchParams(window.location.search).get(name) || "";
    } catch (err) {
      return "";
    }
  }

  function readStore(kunci) {
    try {
      return localStorage.getItem(kunci) || "";
    } catch (err) {
      return "";
    }
  }

  function writeStore(kunci, nilai) {
    try {
      localStorage.setItem(kunci, nilai);
    } catch (err) {
      /* penyimpanan diblokir: abaikan */
    }
  }

  function buatId(prefix) {
    var acak = "";
    try {
      var buf = new Uint8Array(6);
      crypto.getRandomValues(buf);
      acak = Array.prototype.map
        .call(buf, function (b) {
          return b.toString(16).padStart(2, "0");
        })
        .join("");
    } catch (err) {
      acak = Math.random().toString(16).slice(2, 14);
    }
    return prefix + acak;
  }

  /* Token bisa datang dari tautan QR (/?kode=xxxx). Setelah dibaca, parameter
     dihapus dari address bar supaya rapi dan tidak ikut tersalin. */
  function ambilTokenAwal() {
    var dariTautan = parseQuery("kode");
    if (dariTautan) {
      writeStore(TOKEN_KEY, dariTautan);
      try {
        var url = new URL(window.location.href);
        url.searchParams.delete("kode");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      } catch (err) {
        /* diabaikan */
      }
      return dariTautan;
    }
    return readStore(TOKEN_KEY);
  }

  function deteksiPlatform() {
    if (document.body && document.body.dataset.kdPlatform) return document.body.dataset.kdPlatform;
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ? "android" : "desktop";
  }

  var KD = {
    token: "",
    deviceId: readStore(DEVICE_KEY) || "",
    platform: "desktop",
    state: null,
    iconSiap: null,

    /* ---------------------------------------------------------- api --- */
    /* api("/api/state") → Promise<objek>. Galat membawa properti .status dan
       .code ("butuh-pasangan" saat token salah/tidak ada). */
    api: async function (jalur, opsi) {
      opsi = opsi || {};
      var headers = {};
      if (KD.token) headers["x-kumi-token"] = KD.token;
      var init = { method: opsi.method || "GET", headers: headers };
      if (opsi.body !== undefined) {
        headers["content-type"] = "application/json";
        init.body = JSON.stringify(opsi.body);
      }
      var res;
      try {
        res = await fetch(jalur, init);
      } catch (err) {
        var galat = new Error("Tidak dapat menghubungi server.");
        galat.status = 0;
        throw galat;
      }
      var data = null;
      try {
        data = await res.json();
      } catch (err) {
        data = null;
      }
      if (!res.ok) {
        var e = new Error((data && data.message) || "Permintaan gagal (" + res.status + ").");
        e.status = res.status;
        e.code = data && data.code;
        throw e;
      }
      return data;
    },

    /* ---------------------------------------------------------- SSE --- */
    /* KD.stream({ onSync, onPress, onDevices, onActivity, onOpen, onClose })
       → { tutup() }. EventSource menyambung ulang otomatis saat putus. */
    stream: function (pengendali) {
      pengendali = pengendali || {};
      var sumber = new EventSource(
        "/api/events?kode=" +
          encodeURIComponent(KD.token) +
          "&device=" +
          encodeURIComponent(KD.deviceId) +
          "&platform=" +
          encodeURIComponent(KD.platform) +
          "&nama=" +
          encodeURIComponent(namaPerangkat())
      );
      sumber.addEventListener("sync", function (ev) {
        KD.state = JSON.parse(ev.data);
        if (pengendali.onSync) pengendali.onSync(KD.state);
      });
      sumber.addEventListener("press", function (ev) {
        if (pengendali.onPress) pengendali.onPress(JSON.parse(ev.data));
      });
      sumber.addEventListener("devices", function (ev) {
        if (pengendali.onDevices) pengendali.onDevices(JSON.parse(ev.data));
      });
      sumber.addEventListener("activity", function (ev) {
        if (pengendali.onActivity) pengendali.onActivity(JSON.parse(ev.data));
      });
      /* Sinyal (#20): jendela depan, volume, dan kedip tombol. */
      sumber.addEventListener("sinyal", function (ev) {
        var data = JSON.parse(ev.data);
        KD.sinyal = data;
        if (pengendali.onSinyal) pengendali.onSinyal(data);
      });
      /* Profil otomatis (#16). */
      sumber.addEventListener("profil", function (ev) {
        var data = JSON.parse(ev.data);
        if (pengendali.onProfil) pengendali.onProfil(data);
      });
      /* Data hidup untuk tombol widget (jam, media yang diputar). */
      sumber.addEventListener("live", function (ev) {
        var data = JSON.parse(ev.data);
        KD.live = data;
        if (pengendali.onLive) pengendali.onLive(data);
      });
      sumber.addEventListener("open", function () {
        if (pengendali.onOpen) pengendali.onOpen();
      });
      sumber.addEventListener("error", function () {
        if (pengendali.onClose) pengendali.onClose();
      });
      return {
        sumber: sumber,
        tutup: function () {
          sumber.close();
        },
      };
    },

    /* -------------------------------------------------------- aksi --- */
    tekan: function (pageId, keyId) {
      return KD.api("/api/press", {
        method: "POST",
        body: {
          pageId: pageId,
          keyId: keyId,
          deviceId: KD.deviceId,
          platform: KD.platform,
        },
      });
    },

    simpanDeck: function (deck) {
      return KD.api("/api/deck", { method: "POST", body: { deck: deck } });
    },

    /* Tukar posisi dua tombol (#2). */
    pindahTombol: function (pageId, dari, ke) {
      return KD.api("/api/deck/pindah", { method: "POST", body: { pageId: pageId, dari: dari, ke: ke } });
    },

    kirimHello: function () {
      return KD.api("/api/hello", {
        method: "POST",
        body: { deviceId: KD.deviceId, platform: KD.platform, name: namaPerangkat() },
      });
    },

    /* -------------------------------------------------------- ikon --- */
    /* Sprite ikon disuntik sekali ke dalam dokumen supaya <use href="#i-...">
       berwarna mengikuti currentColor dan tidak bergantung pada impor silang. */
    siapkanIkon: function () {
      if (KD.iconSiap) return KD.iconSiap;
      KD.iconSiap = fetch("/kumi/assets/icons.svg")
        .then(function (res) {
          if (!res.ok) throw new Error("sprite ikon tidak ditemukan");
          return res.text();
        })
        .then(function (teks) {
          var wadah = document.createElement("div");
          wadah.setAttribute("aria-hidden", "true");
          wadah.style.display = "none";
          wadah.innerHTML = teks;
          document.body.insertBefore(wadah, document.body.firstChild);
          /* Sprite tambahan aplikasi (gembok terbuka/terkunci, lonceng isi,
             pengeras suara isi). Parameter versi mencegah cache lama. */
          return fetch("/assets/kd-icons.svg?v=1.4.4")
            .then(function (r2) {
              return r2.ok ? r2.text() : "";
            })
            .then(function (tambahan) {
              if (!tambahan) return;
              var wadah2 = document.createElement("div");
              wadah2.setAttribute("aria-hidden", "true");
              wadah2.style.display = "none";
              wadah2.innerHTML = tambahan;
              document.body.insertBefore(wadah2, document.body.firstChild);
            });
        })
        .catch(function () {
          /* biarkan: <use href="..."> tetap dicoba lewat jalur berkas */
        });
      return KD.iconSiap;
    },

    /* ------------------------------------------------------ ikon -------- */
    /* Inline satu ikon dari sprite (i-...) atau ikon kustom tersimpan
       (kst_...) yang disajikan lewat /ikon/<id>. */
    ikon: function (nama, kelas) {
      var kelasSvg = "kumi-icon " + (kelas || "");
      if (nama && /^kst_/.test(nama)) {
        return (
          '<img class="' +
          kelasSvg +
          ' kd-ikon-kustom" src="/ikon/' +
          encodeURIComponent(nama) +
          '" alt="" loading="lazy" decoding="async">'
        );
      }
      return (
        '<svg class="' +
        kelasSvg +
        '" aria-hidden="true"><use href="#' +
        (nama || "i-grid") +
        '"></use></svg>'
      );
    },

    /* --------------------------------------------------- ikon tema -------- */
    /* Tombol ganti tema menampilkan ikon MATAHARI saat tema gelap (klik untuk
       terang) dan BULAN saat tema terang. Kumi hanya menyelaraskan label, jadi
       ikonnya diselaraskan di sini. */
    siapkanIkonTema: function () {
      var terapkan = function () {
        var mode = document.documentElement.getAttribute("data-kumi-theme") ||
          document.documentElement.getAttribute("data-theme") || "light";
        var gelap = mode === "dark";
        var pakai = document.querySelectorAll("[data-kumi-toggle-theme] use");
        Array.prototype.forEach.call(pakai, function (use) {
          use.setAttribute("href", gelap ? "#i-sun" : "#i-moon");
        });
      };
      terapkan();
      if (typeof MutationObserver === "function") {
        new MutationObserver(terapkan).observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["data-kumi-theme", "data-theme"],
        });
      }
      document.addEventListener("click", function (ev) {
        if (ev.target.closest && ev.target.closest("[data-kumi-toggle-theme]")) {
          window.setTimeout(terapkan, 0);
        }
      });
    },
    /* ------------------------------------------------------- bahasa ----- */
    /* Bahasa antarmuka: "id" (bawaan) atau "en". Teks Indonesia menjadi kunci
       kamus di bahasa.js. */
    _bahasa: "id",
    _teksAsli: typeof WeakMap === "function" ? new WeakMap() : null,
    _atributAsli: typeof WeakMap === "function" ? new WeakMap() : null,
    _pengamatBahasa: null,
    _diganti: false,

    t: function (teks) {
      var nilai = teks === undefined || teks === null ? "" : String(teks);
      if (KD.bahasa !== "en") return nilai;
      var kamus = window.KD_EN || {};
      if (Object.prototype.hasOwnProperty.call(kamus, nilai)) return kamus[nilai];
      var pola = window.KD_EN_POLA || [];
      for (var i = 0; i < pola.length; i += 1) {
        if (pola[i][0].test(nilai)) return nilai.replace(pola[i][0], pola[i][1]);
      }
      return nilai;
    },

    muatBahasa: function () {
      var bhs = "id";
      try {
        bhs = localStorage.getItem("kumideck-bahasa") || "";
      } catch (err) {
        bhs = "";
      }
      if (bhs !== "id" && bhs !== "en") {
        /* Ikuti bahasa peramban hanya bila jelas berbahasa Inggris. */
        var nav = (navigator.language || "id").toLowerCase();
        bhs = nav.indexOf("en") === 0 ? "en" : "id";
      }
      KD.bahasa = bhs;
      document.documentElement.lang = bhs;
      return bhs;
    },

    pasangBahasa: function (bhs) {
      KD.bahasa = bhs === "en" ? "en" : "id";
      try {
        localStorage.setItem("kumideck-bahasa", KD.bahasa);
      } catch (err) {
        /* penyimpanan penuh: abaikan */
      }
      document.documentElement.lang = KD.bahasa;
      KD.terapkanBahasa();
      try {
        window.dispatchEvent(new CustomEvent("kd:bahasa", { detail: { bahasa: KD.bahasa } }));
      } catch (err) {
        /* diabaikan */
      }
    },

    /* Sapu DOM: teks dan atribut yang cocok kamus diterjemahkan. */
    terapkanBahasa: function (akar) {
      var dasar = akar || document.body;
      if (!dasar) return;
      var jalan = function (simpul) {
        if (simpul.nodeType === 3) {
          KD._terjemahTeks(simpul);
          return;
        }
        if (simpul.nodeType !== 1) return;
        /* Jangan menyentuh isi skrip/gaya. */
        var tag = simpul.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "SYMBOL" || tag === "svg") {
          if (tag === "svg") return;
          return;
        }
        KD._terjemahAtribut(simpul);
        var anak = simpul.childNodes;
        for (var i = 0; i < anak.length; i += 1) jalan(anak[i]);
      };
      jalan(dasar);
    },

    _terjemahTeks: function (simpul) {
      var asli = KD._teksAsli ? KD._teksAsli.get(simpul) : undefined;
      var kini = simpul.nodeValue || "";
      if (asli === undefined) {
        var bersih = kini.trim();
        if (!bersih) return;
        if (!Object.prototype.hasOwnProperty.call(window.KD_EN || {}, bersih)) return;
        if (!KD._teksAsli) return;
        KD._teksAsli.set(simpul, kini);
        asli = kini;
      }
      var teksAsli = asli;
      if (KD.bahasa !== "en") {
        if (kini !== teksAsli) simpul.nodeValue = teksAsli;
        return;
      }
      var baru = teksAsli.replace(/^\s*/, "").replace(/\s*$/, "");
      var terjemahan = KD.t(baru);
      var akhir = teksAsli.replace(baru, terjemahan);
      if (kini !== akhir) simpul.nodeValue = akhir;
    },

    _terjemahAtribut: function (el) {
      var atribut = ["aria-label", "title", "placeholder", "alt", "value"];
      var simpan = KD._atributAsli && KD._atributAsli.get(el);
      if (!simpan) {
        simpan = {};
        if (KD._atributAsli) KD._atributAsli.set(el, simpan);
      }
      /* Lengkapi atribut baru yang cocok kamus: sebuah tombol bisa
         mendapat aria-label lebih dulu dan title beberapa saat kemudian. */
      for (var i = 0; i < atribut.length; i += 1) {
        var nama = atribut[i];
        if (Object.prototype.hasOwnProperty.call(simpan, nama)) continue;
        if (!el.hasAttribute || !el.hasAttribute(nama)) continue;
        var nilai = el.getAttribute(nama);
        if (!nilai || !Object.prototype.hasOwnProperty.call(window.KD_EN || {}, nilai)) continue;
        simpan[nama] = nilai;
      }
      for (var nama2 in simpan) {
        if (!Object.prototype.hasOwnProperty.call(simpan, nama2)) continue;
        var tujuan = KD.bahasa === "en" ? KD.t(simpan[nama2]) : simpan[nama2];
        if (el.getAttribute(nama2) !== tujuan) el.setAttribute(nama2, tujuan);
      }
    },

    /* Amati perubahan DOM supaya teks dinamis ikut diterjemahkan. */
    amatiBahasa: function () {
      if (KD._pengamatBahasa || typeof MutationObserver !== "function") return;
      KD._pengamatBahasa = new MutationObserver(function (daftar) {
        /* Tanpa pengaman "sedang memproses": hasil terjemahan tidak lagi cocok
           dengan kamus, sehingga pemrosesan ulang berhenti sendiri. Pengaman
           lama membuat perubahan yang datang saat memproses hilang. */
        for (var i = 0; i < daftar.length; i += 1) {
          var m = daftar[i];
          if (m.type === "childList") {
            for (var j = 0; j < m.addedNodes.length; j += 1) {
              var tambah = m.addedNodes[j];
              if (tambah.nodeType === 3) KD._terjemahTeks(tambah);
              else if (tambah.nodeType === 1) KD.terapkanBahasa(tambah);
            }
          } else if (m.type === "characterData") {
            KD._terjemahTeks(m.target);
          } else if (m.type === "attributes") {
            KD._terjemahAtribut(m.target);
          }
        }
      });
      KD._pengamatBahasa.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["aria-label", "title", "placeholder", "alt", "value"],
      });
    },

    /* ------------------------------------------------------- tombol --- */    /* KD.buatTombol(key, { kosong, sunting, aktif, indeks }) → <button> */
    buatTombol: function (key, opsi) {
      opsi = opsi || {};
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "kd-key kd-key--" + (key && key.variant ? key.variant : "default");
      if (!key) {
        btn.classList.add("kd-key--empty");
        btn.setAttribute("aria-label", "Slot kosong" + (opsi.sunting ? " — klik untuk mengisi" : ""));
        btn.disabled = !opsi.sunting;
        btn.innerHTML = '<span class="kd-key__plus" aria-hidden="true"></span>';
        return btn;
      }
      btn.dataset.keyId = key.id;

      if (key.widget) {
        /* Tombol widget: menampilkan data hidup, tidak menjalankan aksi. */
        btn.classList.add("kd-key--widget");
        btn.dataset.widget = key.widget.type;
        btn.innerHTML =
          '<span class="kd-key__widget">' +
          '<span class="kd-key__nilai"></span>' +
          '<span class="kd-key__sub"></span>' +
          "</span>";
        btn.setAttribute("aria-label", labelWidget(key));
        KD.gambarWidget(btn);
        return btn;
      }

      btn.setAttribute("data-kumi-cue", "tap");
      var label = key.label || "Tanpa nama";
      btn.innerHTML =
        '<span class="kd-key__icon">' +
        KD.ikon(key.icon, "kd-key__glyph") +
        '</span><span class="kd-key__label">' +
        escapeHtml(label) +
        "</span>";
      KD.terapkanWarna(btn, key);
      /* Penanda status (#20): menyala bila aplikasi/jendela cocok. */
      if (key.tandaiAktif && (key.tandaiAktif.proses || key.tandaiAktif.jendela)) {
        btn.setAttribute("data-tanda", "1");
        btn.setAttribute("data-tanda-proses", key.tandaiAktif.proses || "");
        btn.setAttribute("data-tanda-jendela", key.tandaiAktif.jendela || "");
        if (KD.sinyal) KD.segarkanPenanda(KD.sinyal);
      }
      btn.setAttribute("aria-label", label + " — " + jelaskanAksi(key.action));
      return btn;
    },

    /* --------------------------------------------------- penanda aktif --- */
    /* Perbarui semua tombol bertanda sesuai jendela depan terbaru. */
    segarkanPenanda: function (sinyal) {
      var aktif = (sinyal && sinyal.jendela) || (KD.sinyal && KD.sinyal.jendela) || null;
      var proses = aktif && aktif.ada ? String(aktif.proses || "").toLowerCase() : "";
      var judul = aktif && aktif.ada ? String(aktif.judul || "").toLowerCase() : "";
      var daftar = document.querySelectorAll("[data-tanda]");
      Array.prototype.forEach.call(daftar, function (el) {
        var p = (el.getAttribute("data-tanda-proses") || "").toLowerCase();
        var j = (el.getAttribute("data-tanda-jendela") || "").toLowerCase();
        var cocok =
          !!aktif &&
          !!aktif.ada &&
          (!p || proses.indexOf(p.replace(/\.exe$/, "")) !== -1) &&
          (!j || judul.indexOf(j) !== -1) &&
          !!(p || j);
        el.classList.toggle("is-aktif", cocok);
      });
    },

    /* ------------------------------------------------------ widget ---- */
    /* Isi satu tombol widget sesuai data terbaru. Dipanggil ulang berkala
       oleh halaman (jam) dan saat event `live` tiba (media). */
    gambarWidget: function (elemen) {
      var tipe = elemen.dataset ? elemen.dataset.widget : "";
      var nilai = elemen.querySelector(".kd-key__nilai");
      var sub = elemen.querySelector(".kd-key__sub");
      if (!nilai || !sub) return;

      if (tipe === "jam") {
        var sekarang = new Date();
        nilai.textContent = sekarang.toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        });
        sub.textContent = sekarang.toLocaleDateString("id-ID", {
          weekday: "short",
          day: "numeric",
          month: "short",
        });
      } else if (tipe === "tanggal") {
        var d = new Date();
        nilai.textContent = d.toLocaleDateString("id-ID", {
          weekday: "long",
          day: "numeric",
        });
        sub.textContent = d.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
      } else if (tipe === "media") {
        var media = (KD.live && KD.live.media) || { ada: false };
        if (!media.ada) {
          nilai.textContent = "Tidak ada";
          sub.textContent = "Sedang diputar";
        } else {
          nilai.textContent = media.judul || "Tanpa judul";
          var sumber = media.artis || namaAplikasiMedia(media.app);
          sub.textContent = (sumber || "Diputar") + (media.status === "paused" ? " · Jeda" : "");
        }
      }
    },

    /* Perbarui semua tombol widget yang sedang terlihat. */
    segarkanWidget: function (akar) {
      var daftar = (akar || document).querySelectorAll("[data-widget]");
      Array.prototype.forEach.call(daftar, function (el) {
        KD.gambarWidget(el);
      });
    },

    /* ------------------------------------------------------ ikon -------- */
    /* Inline satu ikon dari sprite (i-...) atau ikon kustom tersimpan
       (kst_...) yang disajikan lewat /ikon/<id>. */


    /* Warna khusus tombol (#19): data-warna="kustom" + variabel --warna-*. */
    terapkanWarna: function (btn, key) {
      if (!key || !key.warna || !key.warna.bg) {
        btn.removeAttribute("data-warna");
        btn.style.removeProperty("--warna-bg");
        btn.style.removeProperty("--warna-fg");
        return;
      }
      btn.setAttribute("data-warna", "kustom");
      btn.style.setProperty("--warna-bg", key.warna.bg);
      if (key.warna.fg) btn.style.setProperty("--warna-fg", key.warna.fg);
      else btn.style.removeProperty("--warna-fg");
    },

    /* Kilat tekan singkat; dipakai desktop dan remote supaya terasa sama. */
    kilat: function (btn) {
      if (!btn) return;
      btn.classList.add("is-pressed");
      window.setTimeout(function () {
        btn.classList.remove("is-pressed");
      }, 220);
    },

    /* ------------------------------------------------------ format --- */
    jam: function (waktu) {
      var d = new Date(waktu || Date.now());
      return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    },

    relatif: function (waktu) {
      var detik = Math.max(0, Math.round((Date.now() - waktu) / 1000));
      if (detik < 10) return "baru saja";
      if (detik < 60) return detik + " detik lalu";
      var menit = Math.round(detik / 60);
      if (menit < 60) return menit + " menit lalu";
      var jam = Math.round(menit / 60);
      return jam + " jam lalu";
    },

    kodePasangan: function (token) {
      if (!token) return "—";
      var t = String(token).toLowerCase();
      return t.length === 8 ? t.slice(0, 4) + "-" + t.slice(4) : t;
    },

    /* ------------------------------------------------------- toast --- */
    toast: function (pesan, jenis) {
      /* Kumi.toast menulis pesan lewat innerHTML. Semua pesan di aplikasi ini
         bisa memuat data dari deck (nama halaman, label tombol) yang berasal
         dari berkas impor — jadi WAJIB di-escape di sini, sekali, bukan di tiap
         pemanggil. Pesan juga diterjemahkan di sini supaya pemanggil tidak perlu
         mengurus bahasa. */
      var teks = pesan == null ? "" : KD.t(String(pesan));
      if (window.Kumi && typeof Kumi.toast === "function") {
        Kumi.toast(escapeHtml(teks), jenis === "danger" ? "danger" : "ok");
        return;
      }
      var el = document.createElement("div");
      el.textContent = pesan;
      el.style.cssText =
        "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99;" +
        "padding:12px 20px;border-radius:999px;font:500 15px/1.4 Inter,sans-serif;" +
        "background:var(--kumi-ink-surface);color:var(--kumi-ink-fg)";
      document.body.appendChild(el);
      window.setTimeout(function () {
        el.remove();
      }, 2600);
    },
  };

  /* ------------------------------------------------------------- nama --- */
  function namaPerangkat() {
    var p = KD.platform === "android" ? "Remote" : "Desktop";
    var tersimpan = readStore("kumideck-nama");
    if (tersimpan) return tersimpan;
    if (KD.platform === "android") return "Perangkat Remote";
    return p;
  }

  function escapeHtml(teks) {
    return String(teks)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  var NAMA_TIPE = {
    hotkey: "Pintasan papan ketik",
    teks: "Mengetik teks",
    buka: "Membuka aplikasi atau tautan",
    http: "Permintaan HTTP",
    media: "Kontrol media",
    halaman: "Membuka halaman",
    urutan: "Urutan aksi",
    jendela: "Tindakan jendela",
    volume: "Volume sistem",
    daya: "Daya komputer",
    kondisional: "Aksi bersyarat",
    widget: "Widget",
    kosong: "Belum diatur",
  };

  var NAMA_JENDELA = {
    minimize: "sembunyikan",
    maximize: "maksimalkan",
    restore: "kembalikan ukuran",
    kiri: "snap kiri",
    kanan: "snap kanan",
    "monitor-berikut": "pindah monitor",
    "task-view": "Task View",
    "tampilkan-desktop": "tampilkan desktop",
    "tutup-jendela": "tutup jendela",
  };

  var NAMA_MIC = {
    togel: "balik senyap/nyala",
    senyap: "senyapkan",
    nyala: "nyalakan",
  };

  var NAMA_DAYA = {
    tidur: "tidurkan komputer",
    kunci: "kunci layar",
    restart: "mulai ulang",
    matikan: "matikan",
    batal: "batalkan timer",
  };

  var NAMA_VOLUME = {
    naik: "naik",
    turun: "turun",
    mute: "senyap",
    set: "atur nilai",
    baca: "baca nilai",
  };

  var NAMA_WIDGET = {
    jam: "Jam dan tanggal",
    tanggal: "Tanggal lengkap",
    media: "Media yang diputar",
  };

  function labelWidget(key) {
    var nama = NAMA_WIDGET[key.widget.type] || "Widget";
    return (key.label || nama) + " — " + nama.toLowerCase() + " (hanya tampilan)";
  }

  /* "Spotify.exe" / "MSEdge" → "Spotify" / "MSEdge" untuk keterangan widget. */
  function namaAplikasiMedia(app) {
    if (!app) return "";
    var bersih = String(app)
      .replace(/^.*[\\/]/, "")
      .replace(/\.exe$/i, "")
      .replace(/^Microsoft\./i, "")
      .replace(/[.!_].*$/, "");
    if (!bersih) return "";
    return bersih.charAt(0).toUpperCase() + bersih.slice(1);
  }

  function jelaskanAksi(action) {
    if (!action || action.type === "kosong") return KD.t("belum diatur");
    var nama = KD.t(NAMA_TIPE[action.type] || action.type);
    if (action.type === "hotkey" && action.combo) return nama + " " + action.combo;
    if (action.type === "buka" && action.target) return nama + " " + action.target;
    if (action.type === "http" && action.url) return nama + " " + action.method + " " + action.url;
    if (action.type === "media" && action.cmd) return nama + " " + action.cmd;
    if (action.type === "jendela") return nama + ": " + KD.t(NAMA_JENDELA[action.cmd] || action.cmd);
    if (action.type === "daya") return nama + ": " + KD.t(NAMA_DAYA[action.cmd] || action.cmd);
    if (action.type === "volume") {
      return nama + ": " + KD.t(NAMA_VOLUME[action.mode] || action.mode) +
        (action.mode === "set" ? " " + action.nilai + "%" : "");
    }
    if (action.type === "mic") return nama + ": " + KD.t(NAMA_MIC[action.cmd] || action.cmd);
    if (action.type === "suara") return nama;
    if (action.type === "kondisional") {
      var syarat = action.syarat || {};
      var siapa = syarat.proses || syarat.jendela || KD.t("jendela");
      var aktif = action.aktif && action.aktif.type !== "kosong" ? jelaskanAksi(action.aktif) : KD.t("kosong");
      var tidak = action.tidakAktif && action.tidakAktif.type !== "kosong" ? jelaskanAksi(action.tidakAktif) : KD.t("kosong");
      return KD.t("bila") + " " + siapa + ": " + aktif + "; " + KD.t("selain itu") + ": " + tidak;
    }
    if (action.type === "urutan") {
      return nama + " (" + (action.steps || []).length + " " + KD.t("langkah") + ")";
    }
    return nama;
  }

  /* ------------------------------------------------------------- init --- */
  KD.token = ambilTokenAwal();
  KD.platform = deteksiPlatform();
  if (!KD.deviceId) {
    KD.deviceId = buatId("d_");
    writeStore(DEVICE_KEY, KD.deviceId);
  }

  KD.escapeHtml = escapeHtml;
  KD.jelaskanAksi = function (action) {
    return KD.t(jelaskanAksi(action));
  };
  KD.jelaskan = KD.jelaskanAksi;
  /* Inisialisasi bahasa sebelum render pertama. */
  KD.muatBahasa();
  KD.namaTipe = NAMA_TIPE;
  KD.namaWidget = NAMA_WIDGET;
  KD.bacaStore = readStore;
  KD.tulisStore = writeStore;
  KD.parseQuery = parseQuery;

  window.KD = KD;
})();













