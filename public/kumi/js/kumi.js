/* ==========================================================================
   KUMI DESIGN SYSTEM — kumi.js
   Interaksi opsional, tanpa dependensi. Semua lewat atribut data-* supaya
   tidak perlu menulis JavaScript di setiap app.

     <html data-kumi-theme="light">          tema halaman
     <button data-kumi-toggle-theme>         tombol ganti tema
     <div class="kumi-reveal">               muncul saat di-scroll
     <div class="kumi-reveal kumi-reveal--left">  varian arah/zoom/blur/…
     <div data-kumi-stagger="70">            anak-anaknya muncul berurutan
     <h1 data-kumi-split="words">Kumi</h1>  teks naik per kata (atau "chars")
     <span data-kumi-count="1280">0</span>  angka berjalan saat masuk layar
     <div class="kumi-tile kumi-spotlight">     sorotan ikut kursor
     <div data-kumi-tilt>                    efek miring 3D
     <div data-kumi-parallax="0.3">          bergeser mengikuti gulir
     <div class="kumi-bg" data-kumi-cursor-glow>  cahaya yang mengikuti kursor
     <header class="kumi-header">            mengecil saat digulir
     <button data-kumi-copy="teks">          salin ke clipboard + toast
     <button data-kumi-open="modal-1">       buka .kumi-overlay#modal-1
     <button data-kumi-close>                tutup overlay terdekat
     <div class="kumi-progress__bar" data-kumi-value="60">  bar 60%
     <div data-kumi-scroll-progress>         progress bar gulir halaman
     <button data-kumi-toggle-sound>         nyala/mati suara (tersimpan)
     <button data-kumi-cue="success">        mainkan satu isyarat suara

   Suara disintesis lewat Web Audio (tanpa berkas). Default menyala, bisa
   dimatikan; pilihan disimpan di localStorage kunci kumi-sound. Isyarat:
   tap, click, toggle, open, close, success, error, notify, tick.

   API: Kumi.toast("pesan"), Kumi.copy("teks"), Kumi.theme.set("dark"),
        Kumi.theme.toggle(), Kumi.sound.play("notify"), Kumi.sound.toggle(),
        Kumi.sound.set(false), Kumi.init(), Kumi.refresh(wadah)
   ========================================================================== */

(function () {
  "use strict";

  var STORAGE_KEY = "kumi-theme";
  var root = document.documentElement;
  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer =
    window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  function $(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }

  function $$(sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  }

  /* ------------------------------------------------------------- toast -- */
  var toastEl = null;
  var toastTimer = 0;

  function toast(message, variant) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "kumi-toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
    }
    toastEl.className = "kumi-toast" + (variant ? " kumi-toast--" + variant : "");
    toastEl.innerHTML =
      '<span class="kumi-toast__dot" aria-hidden="true"></span>' +
      String(message == null ? "" : message);
    toastEl.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.classList.remove("is-visible");
    }, 2400);
  }

  /* -------------------------------------------------------------- copy -- */
  function copy(text, message) {
    function done() {
      toast(message || "Disalin ke clipboard");
    }

    function fallback() {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.cssText = "position:fixed;top:-1000px;opacity:0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
      } catch (err) {
        /* diabaikan */
      }
      document.body.removeChild(area);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        fallback();
        done();
      });
      return;
    }
    fallback();
    done();
  }

  /* -------------------------------------------------------------- suara -- */
  /* Audio disintesis langsung lewat Web Audio API — tanpa berkas, jadi tidak
     menambah permintaan jaringan dan aman terhadap kebijakan CSP yang ketat.
     Default MENYALA; pengguna bisa mematikannya dan pilihan itu disimpan.

     Kontrol:
       <button data-kumi-toggle-sound>            nyala/mati, tersimpan
       <button data-kumi-cue="success">           mainkan satu isyarat
       Kumi.sound.play("click")                   via API
     Isyarat: tap, click, toggle, open, close, success, error, notify, tick.

     Atribut KEADAAN ada di <html>: data-kumi-sound="on|off" (dipakai CSS untuk
     menukar ikon). Atribut PEMICU ada di elemen yang diklik: data-kumi-cue.
     Keduanya sengaja dipisah supaya `closest()` tidak salah menangkap <html>.

     Browser hanya mengizinkan suara setelah ada interaksi pengguna, jadi
     AudioContext dibuat malas (lazy) dan di-resume pada interaksi pertama. */
  var SOUND_KEY = "kumi-sound";

  var sound = (function () {
    var ctx = null;
    var master = null;
    var enabled = true;
    var lastTick = 0;

    function supported() {
      return !!(window.AudioContext || window.webkitAudioContext);
    }

    function load() {
      try {
        var v = localStorage.getItem(SOUND_KEY);
        if (v === "off") enabled = false;
        else if (v === "on") enabled = true;
      } catch (err) {
        /* diabaikan */
      }
    }

    function save() {
      try {
        localStorage.setItem(SOUND_KEY, enabled ? "on" : "off");
      } catch (err) {
        /* diabaikan */
      }
    }

    /* Siapkan (sekali) dan lanjutkan konteks audio. */
    function ensure() {
      if (!supported()) return null;
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.85;
        master.connect(ctx.destination);
      }
      if (ctx.state === "suspended" && ctx.resume) {
        try { ctx.resume(); } catch (err) { /* diabaikan */ }
      }
      return ctx;
    }

    /* Satu nada pendek dengan amplop naik-turun (tanpa "klik" kasar). */
    function blip(freq, opts) {
      var c = ensure();
      if (!c) return;
      opts = opts || {};
      var t0 = c.currentTime;
      var dur = opts.dur || 0.12;
      var peak = opts.gain == null ? 0.05 : opts.gain;
      var osc = c.createOscillator();
      var g = c.createGain();
      osc.type = opts.type || "sine";
      osc.frequency.setValueAtTime(freq, t0);
      if (opts.slideTo) {
        osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
      }
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    }

    /* Beberapa nada berurutan pendek (untuk isyarat "berhasil"). */
    function arpeggio(freqs, opts) {
      freqs.forEach(function (f, i) {
        window.setTimeout(function () {
          blip(f, opts);
        }, i * 46);
      });
    }

    var cues = {
      tap: function () { blip(440, { type: "triangle", gain: 0.04, dur: 0.07, slideTo: 400 }); },
      click: function () { blip(320, { type: "triangle", gain: 0.05, dur: 0.09, slideTo: 250 }); },
      toggle: function () { blip(560, { type: "sine", gain: 0.05, dur: 0.1, slideTo: 760 }); },
      open: function () { blip(300, { type: "sine", gain: 0.05, dur: 0.17, slideTo: 540 }); },
      close: function () { blip(540, { type: "sine", gain: 0.05, dur: 0.17, slideTo: 300 }); },
      success: function () { arpeggio([523.25, 659.25, 783.99], { type: "sine", gain: 0.05, dur: 0.15 }); },
      error: function () { blip(196, { type: "sawtooth", gain: 0.04, dur: 0.22, slideTo: 130 }); },
      notify: function () { arpeggio([783.99, 1046.5], { type: "sine", gain: 0.045, dur: 0.13 }); },
      tick: function () {
        var now = Date.now();
        if (now - lastTick < 45) return;
        lastTick = now;
        blip(1180, { type: "square", gain: 0.018, dur: 0.03 });
      }
    };

    load();

    return {
      supported: supported,
      isOn: function () { return enabled; },
      list: function () { return Object.keys(cues); },
      play: function (name) {
        if (!enabled) return;
        (cues[name] || cues.tap)();
      },
      set: function (on) {
        on = !!on;
        if (!on) sound.play("toggle"); /* dengar dulu sebelum mati */
        enabled = on;
        save();
        if (on) cues.toggle();
        syncSoundButtons();
        return enabled;
      },
      toggle: function () { return sound.set(!enabled); },
      /* Lanjutkan konteks audio pada gesture pertama (kalau perlu). */
      resume: function () { if (enabled) ensure(); },
      sync: function () { syncSoundButtons(); }
    };
  })();

  /* Menyelaraskan atribut <html> dan tombol suara dengan keadaan sekarang. */
  function syncSoundButtons() {
    root.setAttribute("data-kumi-sound", sound.isOn() ? "on" : "off");
    $$("[data-kumi-toggle-sound]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", sound.isOn() ? "true" : "false");
      btn.setAttribute(
        "aria-label",
        sound.isOn() ? "Matikan suara antarmuka" : "Nyalakan suara antarmuka"
      );
    });
  }

  /* ------------------------------------------------------------- tema --- */
  var theme = {
    current: function () {
      return root.getAttribute("data-kumi-theme") || root.getAttribute("data-theme") || "light";
    },
    set: function (mode) {
      root.setAttribute("data-kumi-theme", mode);
      try {
        localStorage.setItem(STORAGE_KEY, mode);
      } catch (err) {
        /* diabaikan */
      }
      if (mode === "light" || mode === "dark") root.style.colorScheme = mode;
      syncThemeButtons();
      var meta = $('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", mode === "dark" ? "#0E0E11" : "#EEEDE8");
      return mode;
    },
    toggle: function () {
      return theme.set(theme.current() === "dark" ? "light" : "dark");
    },
    /* Terapkan tema tersimpan / preferensi sistem. Panggil manual kalau app
       punya sistem tema sendiri dan tidak ingin ditimpa. */
    init: function () {
      var saved = null;
      try {
        saved = localStorage.getItem(STORAGE_KEY);
      } catch (err) {
        /* diabaikan */
      }
      /* Urutan prioritas: pilihan tersimpan pengguna → tema yang ditulis
         penulis halaman (data-kumi-theme / data-theme) → preferensi sistem.
         Kalau penulis tidak menulis atribut apa pun, tema ikut sistem. */
      var authored =
        root.getAttribute("data-kumi-theme") || root.getAttribute("data-theme") || null;
      var mode =
        saved ||
        authored ||
        (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light");
      return theme.set(mode);
    },
  };

  function syncThemeButtons() {
    var dark = theme.current() === "dark";
    $$("[data-kumi-toggle-theme]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(dark));
      btn.setAttribute("aria-label", dark ? "Ganti ke tema terang" : "Ganti ke tema gelap");
      btn.setAttribute("title", dark ? "Tema terang" : "Tema gelap");
    });
  }

  /* ------------------------------------------------------------ reveal -- */
  /* Wadah ber-atribut data-kumi-stagger otomatis memberi .kumi-reveal dan
     jeda bertingkat ke anak-anaknya — sekali tulis untuk satu grid penuh. */
  function initStagger(scope) {
    $$("[data-kumi-stagger]", scope).forEach(function (group) {
      if (group.__kumiStaggerDone) return;
      group.__kumiStaggerDone = true;
      var step = Number(group.getAttribute("data-kumi-stagger")) || 70;
      Array.prototype.slice.call(group.children).forEach(function (child, i) {
        child.classList.add("kumi-reveal");
        if (!child.hasAttribute("data-kumi-delay")) {
          child.style.setProperty("--kumi-delay", Math.min(i, 12) * step + "ms");
        }
      });
    });
  }

  function initReveal(scope) {
    initStagger(scope);
    var items = $$(".kumi-reveal:not(.is-in)", scope);

    /* Teks yang dipecah ikut aturan reveal yang sama. */
    var splits = $$("[data-kumi-split]:not(.is-in)", scope);

    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.concat(splits).forEach(function (el) {
        el.classList.add("is-in");
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          if (!el.style.getPropertyValue("--kumi-delay") && !el.hasAttribute("data-kumi-delay")) {
            el.style.setProperty("--kumi-delay", (el.__kumiIndex || 0) * 60 + "ms");
          }
          if (el.hasAttribute("data-kumi-delay")) {
            el.style.setProperty("--kumi-delay", el.getAttribute("data-kumi-delay") + "ms");
          }
          el.classList.add("is-in");
          observer.unobserve(el);
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.1 }
    );

    items.concat(splits).forEach(function (el, i) {
      if (!el.__kumiIndex) el.__kumiIndex = Math.min(i, 8);
      observer.observe(el);
    });
  }

  /* ------------------------------------------------------------- split -- */
  /* <h1 data-kumi-split="words">Kumi Design</h1> — tiap kata (atau huruf)
     dibungkus mask + span, lalu naik berurutan. Teks asli tetap utuh untuk
     pembaca layar lewat aria-label. */
  function initSplit(scope) {
    $$("[data-kumi-split]", scope).forEach(function (el) {
      if (el.__kumiSplitDone) return;
      el.__kumiSplitDone = true;

      var mode = el.getAttribute("data-kumi-split") || "words";
      var step = Number(el.getAttribute("data-kumi-split-delay")) || 55;
      var text = el.textContent.replace(/\s+/g, " ").trim();
      if (!text) return;

      var tokens = mode === "chars" ? text.split("") : text.split(" ");
      el.setAttribute("aria-label", text);
      el.classList.add("kumi-split");
      el.textContent = "";

      tokens.forEach(function (token, i) {
        var mask = document.createElement("span");
        mask.className = "kumi-split__mask";
        mask.setAttribute("aria-hidden", "true");
        var part = document.createElement("span");
        part.className = "kumi-split__part";
        part.style.setProperty("--kumi-delay", i * step + "ms");
        part.textContent = token === " " ? "\u00a0" : token;
        mask.appendChild(part);
        el.appendChild(mask);
        if (mode !== "chars" && i < tokens.length - 1) {
          el.appendChild(document.createTextNode(" "));
        }
      });
    });
  }

  /* ------------------------------------------------------------- count -- */
  /* <span data-kumi-count="1280">0</span> — angka berjalan saat masuk layar.
     Atribut tambahan: data-kumi-count-prefix / -suffix / -decimals. */
  function initCount(scope) {
    var els = $$("[data-kumi-count]", scope);
    if (!els.length) return;

    function easing(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function format(el, value) {
      var decimals = Number(el.getAttribute("data-kumi-count-decimals")) || 0;
      var prefix = el.getAttribute("data-kumi-count-prefix") || "";
      var suffix = el.getAttribute("data-kumi-count-suffix") || "";
      var sep = (el.getAttribute("data-kumi-count-sep") || ".").slice(0, 1);
      var num = value.toFixed(decimals).split(".");
      num[0] = num[0].replace(/\B(?=(\d{3})+(?!\d))/g, sep);
      return prefix + num.join(",") + suffix;
    }

    function run(el) {
      if (el.__kumiCounted) return;
      el.__kumiCounted = true;
      var target = Number(el.getAttribute("data-kumi-count")) || 0;
      var duration = Number(el.getAttribute("data-kumi-count-duration")) || 1100;
      if (reduceMotion) {
        el.textContent = format(el, target);
        return;
      }
      el.classList.add("kumi-count", "is-counting");
      var t0 = 0;
      function frame(now) {
        if (!t0) t0 = now;
        var p = Math.min((now - t0) / duration, 1);
        el.textContent = format(el, target * easing(p));
        if (p < 1) {
          window.requestAnimationFrame(frame);
        } else {
          el.textContent = format(el, target);
          el.classList.remove("is-counting");
        }
      }
      window.requestAnimationFrame(frame);
    }

    if (!("IntersectionObserver" in window)) {
      els.forEach(run);
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          run(entry.target);
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.4 }
    );

    els.forEach(function (el) {
      observer.observe(el);
    });
  }

  /* ------------------------------------------------------- spotlight/tilt */
  /* Sorotan dan kemiringan dihaluskan dengan lerp di dalam requestAnimationFrame
     supaya gerakannya tidak "kaku" mengikuti pointer mentah.
     Daftar elemen disimpan di tingkat modul supaya Kumi.refresh() boleh dipanggil
     berkali-kali tanpa menggandakan listener atau loop. */
  var pointerState = null;

  function initPointerFx() {
    if (reduceMotion || !finePointer) return;

    if (!pointerState) pointerState = { spots: [], tilts: [], bound: false };

    $$(".kumi-spotlight").forEach(function (el) {
      if (el.__kumiSpot) return;
      el.__kumiSpot = true;
      pointerState.spots.push({ el: el, tx: 0, ty: 0, cx: 0, cy: 0, active: false });
    });

    $$("[data-kumi-tilt]").forEach(function (el) {
      if (el.__kumiTilt) return;
      el.__kumiTilt = true;
      el.classList.add("kumi-tilt");
      var item = { el: el, tx: 0, ty: 0, cx: 0, cy: 0 };
      pointerState.tilts.push(item);
      el.addEventListener("pointerleave", function () {
        item.tx = 0;
        item.ty = 0;
      });
    });

    if (!pointerState.spots.length && !pointerState.tilts.length) return;
    if (pointerState.bound) return;
    pointerState.bound = true;

    var spots = pointerState.spots;
    var tilts = pointerState.tilts;

    document.addEventListener("pointermove", function (event) {
      spots.forEach(function (item) {
        if (!item.active) return;
        var rect = item.el.getBoundingClientRect();
        item.tx = event.clientX - rect.left;
        item.ty = event.clientY - rect.top;
      });
      tilts.forEach(function (item) {
        var rect = item.el.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right ||
            event.clientY < rect.top || event.clientY > rect.bottom) {
          item.tx = 0;
          item.ty = 0;
          return;
        }
        item.tx = ((event.clientX - rect.left) / rect.width - 0.5);
        item.ty = ((event.clientY - rect.top) / rect.height - 0.5);
      });
    });

    document.addEventListener("pointerover", function (event) {
      spots.forEach(function (item) {
        item.active = !!(event.target.closest && event.target.closest(".kumi-spotlight") === item.el);
      });
    });

    (function loop() {
      spots.forEach(function (item) {
        item.cx += (item.tx - item.cx) * 0.16;
        item.cy += (item.ty - item.cy) * 0.16;
        if (!item.cx && !item.cy) return;
        item.el.style.setProperty("--kumi-mx", item.cx + "px");
        item.el.style.setProperty("--kumi-my", item.cy + "px");
      });
      tilts.forEach(function (item) {
        item.cx += (item.tx - item.cx) * 0.1;
        item.cy += (item.ty - item.cy) * 0.1;
        item.el.style.setProperty("--kumi-ry", (item.cx * 8).toFixed(2) + "deg");
        item.el.style.setProperty("--kumi-rx", (-item.cy * 6).toFixed(2) + "deg");
      });
      window.requestAnimationFrame(loop);
    })();
  }

  /* ---------------------------------------------------------- parallax -- */
  /* <div data-kumi-parallax="0.25"> — bergeser halus mengikuti gulir.
     Nilai positif = bergerak lebih cepat dari halaman, negatif = tertinggal. */
  var parallaxState = null;

  function initParallax(scope) {
    if (reduceMotion) return;

    if (!parallaxState) parallaxState = { items: [], bound: false };

    $$("[data-kumi-parallax]", scope).forEach(function (el) {
      if (el.__kumiParallax) return;
      el.__kumiParallax = true;
      var speed = Number(el.getAttribute("data-kumi-parallax"));
      parallaxState.items.push({
        el: el,
        speed: isNaN(speed) ? 0.25 : speed,
        axis: el.getAttribute("data-kumi-parallax-axis") || "y",
        target: 0,
        cur: 0,
      });
    });

    var items = parallaxState.items;
    if (!items.length) return;

    function measure() {
      var vh = window.innerHeight;
      items.forEach(function (item) {
        var rect = item.el.getBoundingClientRect();
        var center = rect.top + rect.height / 2;
        item.target = (center - vh / 2) * item.speed * -1;
      });
    }

    if (parallaxState.bound) {
      measure();
      return;
    }
    parallaxState.bound = true;

    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    measure();

    (function loop() {
      items.forEach(function (item) {
        item.cur += (item.target - item.cur) * 0.12;
        if (item.axis === "x") {
          item.el.style.transform = "translate3d(" + item.cur.toFixed(2) + "px,0,0)";
        } else {
          item.el.style.transform = "translate3d(0," + item.cur.toFixed(2) + "px,0)";
        }
      });
      window.requestAnimationFrame(loop);
    })();
  }

  /* ------------------------------------------------------------ ripple -- */
  /* Riak di titik klik untuk tombol, chip, dan tile yang bisa diklik. */
  function initRipple() {
    if (reduceMotion) return;

    document.addEventListener("pointerdown", function (event) {
      var host = event.target.closest &&
        event.target.closest(".kumi-btn, .kumi-chip, .kumi-tile--link, .kumi-list__item--interactive");
      if (!host) return;
      var rect = host.getBoundingClientRect();
      var ripple = document.createElement("span");
      ripple.className = "kumi-ripple";
      ripple.setAttribute("aria-hidden", "true");
      var size = Math.max(rect.width, rect.height) * 2.2;
      ripple.style.width = ripple.style.height = size + "px";
      ripple.style.margin = -size / 2 + "px 0 0 " + -size / 2 + "px";
      ripple.style.left = event.clientX - rect.left + "px";
      ripple.style.top = event.clientY - rect.top + "px";
      host.appendChild(ripple);
      window.setTimeout(function () {
        if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
      }, 620);
    });
  }

  /* ------------------------------------------------------------ header -- */
  /* .kumi-header mengecil + mengabur setelah halaman digulir sedikit. */
  function initHeader() {
    var header = $(".kumi-header");
    if (!header) return;
    var threshold = Number(header.getAttribute("data-kumi-sticky")) || 12;
    function update() {
      header.classList.toggle("is-stuck", (window.scrollY || 0) > threshold);
    }
    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  /* ------------------------------------------------------ cahaya kursor -- */
  /* Aktif kalau ada elemen ber-atribut data-kumi-cursor-glow (biasanya
     .kumi-bg). Elemen .kumi-cursor-glow dibuat otomatis kalau belum ada. */
  function initCursorGlow() {
    if (reduceMotion || !finePointer) return;

    var host = $("[data-kumi-cursor-glow]");
    if (!host || host.__kumiGlowBound) return;
    host.__kumiGlowBound = true;

    var glow = $(".kumi-cursor-glow");
    if (!glow) {
      glow = document.createElement("div");
      glow.className = "kumi-cursor-glow";
      glow.setAttribute("aria-hidden", "true");
      document.body.appendChild(glow);
    }

    var targetX = window.innerWidth / 2;
    var targetY = window.innerHeight / 2;
    var curX = targetX;
    var curY = targetY;

    document.addEventListener("pointermove", function (event) {
      targetX = event.clientX;
      targetY = event.clientY;
    });

    (function loop() {
      curX += (targetX - curX) * 0.12;
      curY += (targetY - curY) * 0.12;
      glow.style.transform = "translate3d(" + curX + "px," + curY + "px,0)";
      window.requestAnimationFrame(loop);
    })();

    document.addEventListener("pointerover", function (event) {
      var interactive = event.target.closest && event.target.closest("a, button");
      glow.classList.toggle("is-active", !!interactive);
    });
  }

  /* --------------------------------------------------------------- bar -- */
  /* Bar mengisi saat masuk layar. Kalau sudah terlihat sejak awal (mis. di
     atas lipatan) diamati sekali dan langsung terisi. */
  function initBars(scope) {
    var bars = $$(".kumi-progress__bar[data-kumi-value]", scope);

    function fill(bar) {
      if (bar.__kumiFilled) return;
      bar.__kumiFilled = true;
      var value = Math.max(0, Math.min(100, Number(bar.getAttribute("data-kumi-value")) || 0));
      window.requestAnimationFrame(function () {
        bar.style.width = value + "%";
      });
    }

    if (!("IntersectionObserver" in window) || reduceMotion) {
      bars.forEach(fill);
    } else {
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            fill(entry.target);
            observer.unobserve(entry.target);
          });
        },
        { threshold: 0.3 }
      );
      bars.forEach(function (bar) {
        observer.observe(bar);
      });
    }

    var scrollBars = $$("[data-kumi-scroll-progress]");
    if (scrollBars.length && !document.documentElement.__kumiScrollBound) {
      document.documentElement.__kumiScrollBound = true;
      var max = 0;
      var update = function () {
        if (!max) max = document.documentElement.scrollHeight - window.innerHeight;
        var ratio = max > 0 ? Math.min((window.scrollY || 0) / max, 1) : 0;
        scrollBars.forEach(function (el) {
          el.style.transform = "scaleX(" + ratio + ")";
        });
      };
      window.addEventListener("scroll", update, { passive: true });
      window.addEventListener("resize", function () { max = 0; });
      update();
    }
  }

  /* -------------------------------------------------------------- grafik -- */
  /* Grafik (css/charts.css) memakai satu class .is-in untuk memicu animasi
     masuk: batang tumbuh, garis tergambar, titik muncul. Elemen tanpa
     atribut data-kumi-chart tidak diapa-apakan. */
  function initCharts(scope) {
    var charts = $$("[data-kumi-chart]", scope);

    function show(chart) {
      if (chart.__kumiShown) return;
      chart.__kumiShown = true;
      chart.classList.add("is-in");
    }

    if (!("IntersectionObserver" in window) || reduceMotion) {
      charts.forEach(show);
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          show(entry.target);
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.15 }
    );
    charts.forEach(function (chart) {
      observer.observe(chart);
    });
  }

  /* ------------------------------------------------------------- modal -- */
  /* Elemen fokusable di dalam satu wadah, sesuai urutan Tab. Elemen yang
     disembunyikan (mis. ikon bertukar) dilewati. */
  var FOCUSABLE =
    "a[href], button:not([disabled]), input:not([disabled]), " +
    "select:not([disabled]), textarea:not([disabled]), " +
    "[tabindex]:not([tabindex='-1'])";

  function focusablesIn(container) {
    return $$(FOCUSABLE, container).filter(function (el) {
      return el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement;
    });
  }

  function openOverlay(overlay) {
    if (!overlay) return;
    overlay.__kumiLastFocus = document.activeElement;
    overlay.classList.add("is-open");
    overlay.removeAttribute("aria-hidden");
    document.body.style.overflow = "hidden";
    var focusable = focusablesIn(overlay);
    if (focusable.length) focusable[0].focus();
  }

  function closeOverlay(overlay) {
    if (!overlay) return;
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (overlay.__kumiLastFocus && overlay.__kumiLastFocus.focus) {
      overlay.__kumiLastFocus.focus();
    }
  }

  function initActions(scope) {
    /* Konteks audio perlu satu gesture pengguna untuk mulai berbunyi. */
    document.addEventListener(
      "pointerdown",
      function () { sound.resume(); },
      { once: true, passive: true }
    );

    document.addEventListener("click", function (event) {
      var target = event.target;

      var copyBtn = target.closest("[data-kumi-copy]");
      if (copyBtn) {
        event.preventDefault();
        copy(
          copyBtn.getAttribute("data-kumi-copy"),
          copyBtn.getAttribute("data-kumi-copy-message")
        );
        copyBtn.classList.add("is-copied");
        sound.play("success");
        window.setTimeout(function () {
          copyBtn.classList.remove("is-copied");
        }, 1400);
        return;
      }

      var soundBtn = target.closest("[data-kumi-toggle-sound]");
      if (soundBtn) {
        event.preventDefault();
        sound.toggle();
        return;
      }

      var cueBtn = target.closest("[data-kumi-cue]");
      if (cueBtn) {
        event.preventDefault();
        sound.play(cueBtn.getAttribute("data-kumi-cue"));
        return;
      }

      var toggleBtn = target.closest("[data-kumi-toggle-theme]");
      if (toggleBtn) {
        event.preventDefault();
        theme.toggle();
        sound.play("toggle");
        return;
      }

      var openBtn = target.closest("[data-kumi-open]");
      if (openBtn) {
        event.preventDefault();
        openOverlay(document.getElementById(openBtn.getAttribute("data-kumi-open")));
        sound.play("open");
        return;
      }

      var closeBtn = target.closest("[data-kumi-close]");
      if (closeBtn) {
        event.preventDefault();
        closeOverlay(closeBtn.closest(".kumi-overlay"));
        sound.play("close");
        return;
      }

      var overlay = target.classList && target.classList.contains("kumi-overlay")
        ? target
        : null;
      if (overlay) {
        closeOverlay(overlay);
        sound.play("close");
        return;
      }

      /* Bunyi halus untuk tombol, chip, dan baris yang bisa diklik. */
      if (target.closest(".kumi-btn, .kumi-chip, .kumi-switch, .kumi-list__item--interactive")) {
        sound.play("tap");
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        var open = $$(".kumi-overlay.is-open");
        if (open.length) sound.play("close");
        open.forEach(closeOverlay);
        return;
      }

      /* Jebakan fokus: Tab berputar di dalam modal yang sedang terbuka. */
      if (event.key === "Tab") {
        var modal = $(".kumi-overlay.is-open");
        if (!modal) return;
        var items = focusablesIn(modal);
        if (!items.length) {
          event.preventDefault();
          return;
        }
        var first = items[0];
        var last = items[items.length - 1];
        var active = document.activeElement;
        if (event.shiftKey && (active === first || !modal.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || !modal.contains(active))) {
          event.preventDefault();
          first.focus();
        }
      }
    });

    /* Bar yang diperbarui lewat data-kumi-value saat atributnya berubah. */
    void scope;
  }

  /* -------------------------------------------------------------- init -- */
  function init(scope) {
    initSplit(scope);
    initReveal(scope);
    initCount(scope);
    initPointerFx();
    initCursorGlow();
    initParallax(scope);
    initRipple();
    initHeader();
    initBars(scope);
    initCharts(scope);
    syncThemeButtons();
    syncSoundButtons();
  }

  /* Panggil setelah menambah/mengganti isi halaman (mis. render di React/Vue)
     supaya elemen baru ikut hidup. Contoh: Kumi.refresh("#app"). */
  function refresh(scope) {
    initSplit(scope);
    initReveal(scope);
    initCount(scope);
    initPointerFx();
    initCursorGlow();
    initParallax(scope);
    initBars(scope);
    initCharts(scope);
  }

  var Kumi = {
    version: "1.1.0",
    init: init,
    refresh: refresh,
    toast: toast,
    copy: copy,
    theme: theme,
    sound: sound,
    reducedMotion: reduceMotion,
  };

  window.Kumi = Kumi;

  /* Tandai keadaan suara sedini mungkin supaya ikon tombolnya tidak berkedip. */
  root.setAttribute("data-kumi-sound", sound.isOn() ? "on" : "off");

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initActions();
      init();
    });
  } else {
    initActions();
    init();
  }
})();
