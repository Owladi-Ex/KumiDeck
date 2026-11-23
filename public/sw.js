/* KumiDeck Ã¢â‚¬â€ service worker untuk klien Android (/remote).
   Aturan cache:
   - Aset statis same-origin (/assets/, /js/, /icons/, favicon, manifest)
     dilayani cache-first supaya papan terbuka cepat dan tetap tampil saat
     jaringan Wi-Fi putus sebentar.
   - HTML selalu diambil dari jaringan (network-first, tanpa cache) supaya
     pembaruan aplikasi langsung terpakai.
   - /api/ TIDAK PERNAH disentuh: termasuk aliran SSE /api/events yang harus
     tetap mengalir langsung dari server.
   Naikkan CACHE_VERSION setiap kali aset statis berubah. */
const CACHE_VERSION = "kumideck-v47";
const PRA_CACHE = [
  "/favicon.svg",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/assets/rangka.css",
  "/assets/app.css",
  "/assets/remote.css",
  "/assets/sprite.svg",
  "/js/app.js",
  "/js/remote-rangka.js",
];

/* Jalur yang boleh memakai cache-first. */
const AWALAN_BOLEH = ["/assets/", "/js/", "/icons/"];
const BERKAS_BOLEH = ["/favicon.svg", "/favicon.ico", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      /* addAll gagal total bila satu berkas hilang; tambahkan satu per satu. */
      .then((cache) =>
        Promise.all(
          PRA_CACHE.map((jalur) =>
            cache.add(new Request(jalur, { cache: "reload" })).catch(() => null)
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const nama = await caches.keys();
      await Promise.all(
        nama.map((kunci) => (kunci === CACHE_VERSION ? null : caches.delete(kunci)))
      );
      await self.clients.claim();
    })()
  );
});

function bolehCache(url) {
  if (url.origin !== self.location.origin) return false;
  const jalur = url.pathname;
  if (jalur.startsWith("/api/")) return false;
  if (BERKAS_BOLEH.indexOf(jalur) !== -1) return true;
  return AWALAN_BOLEH.some((awal) => jalur.startsWith(awal));
}

function adalahHtml(request, respons) {
  if (request.mode === "navigate") return true;
  if (!respons) return false;
  const tipe = respons.headers.get("content-type") || "";
  return tipe.indexOf("text/html") !== -1;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  /* Hanya halaman Remote yang boleh dilayani dari cache. Desktop (/index.html
     dan "/") adalah klien lokal yang selalu satu mesin dengan servernya, jadi
     berkasnya harus datang langsung dari server: cache di sini pernah menyajikan
     app.js lama sampai fitur baru tampak "tidak ada". */
  const remotePath = (p) => p === "/remote" || p === "/remote.html" || p.startsWith("/remote/");
  if (!remotePath(url.pathname)) {
    if (request.mode === "navigate") {
      event.respondWith(fetch(request));
      return;
    }
    if (!event.clientId) return;
    event.respondWith(
      (async () => {
        try {
          const klien = await self.clients.get(event.clientId);
          if (!klien || !remotePath(new URL(klien.url).pathname)) return fetch(request);
        } catch (err) {
          return fetch(request);
        }
        return ambilBolehCache(event, request, url);
      })()
    );
    return;
  }

  /* HTML Remote: selalu jaringan, tidak pernah disimpan di cache. */
  if (request.mode === "navigate") {
    event.respondWith(fetch(request));
    return;
  }

  if (!bolehCache(url)) return;
  event.respondWith(ambilBolehCache(event, request, url));
});

function ambilBolehCache(event, request, url) {
  return (async () => {
    const cache = await caches.open(CACHE_VERSION);
    const tersimpan = await cache.match(request, { ignoreSearch: false });

    /* Ambil salinan baru di latar belakang (stale-while-revalidate): papan
       tetap terbuka cepat dari cache, tetapi aset yang berubah ikut terpakai
       pada pembukaan berikutnya tanpa harus menaikkan CACHE_VERSION. */
    const segarkan = fetch(request)
      .then((respons) => {
        if (respons && respons.ok && !adalahHtml(request, respons)) {
          cache.put(request, respons.clone()).catch(() => null);
        }
        return respons;
      })
      .catch(() => null);

    if (tersimpan) {
      event.waitUntil(segarkan);
      return tersimpan;
    }

    const respons = await segarkan;
    return respons || Response.error();
  })();
}




