/* KumiDeck — service worker untuk klien Android (/remote).
   Aturan cache:
   - Aset statis same-origin (/css/, /js/, /kumi/, /icons/, favicon, manifest)
     dilayani cache-first supaya papan terbuka cepat dan tetap tampil saat
     jaringan Wi-Fi putus sebentar.
   - HTML selalu diambil dari jaringan (network-first, tanpa cache) supaya
     pembaruan aplikasi langsung terpakai.
   - /api/ TIDAK PERNAH disentuh: termasuk aliran SSE /api/events yang harus
     tetap mengalir langsung dari server.
   Naikkan CACHE_VERSION setiap kali aset statis berubah. */
const CACHE_VERSION = "kumideck-v4";
const PRA_CACHE = [
  "/favicon.svg",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/kumi/css/kumi.css",
  "/kumi/css/components.css",
  "/css/app.css",
  "/css/remote.css",
  "/kumi/js/kumi.js",
  "/js/bahasa.js",
  "/js/bahasa-tambahan.js",
  "/js/core.js",
  "/js/remote.js",
  "/kumi/fonts/inter-latin.woff2",
  "/kumi/fonts/space-grotesk-latin.woff2",
  "/kumi/assets/icons.svg",
];

/* Jalur yang boleh memakai cache-first. */
const AWALAN_BOLEH = ["/css/", "/js/", "/kumi/", "/icons/"];
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

  /* HTML: selalu jaringan, tidak pernah disimpan di cache. */
  if (request.mode === "navigate" || url.pathname === "/remote" || url.pathname === "/") {
    event.respondWith(fetch(request));
    return;
  }

  if (!bolehCache(url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const tersimpan = await cache.match(request, { ignoreSearch: false });
      if (tersimpan) return tersimpan;
      const respons = await fetch(request);
      /* Jangan arsipkan respons galat atau HTML (jaga agar update tidak macet). */
      if (respons && respons.ok && !adalahHtml(request, respons)) {
        cache.put(request, respons.clone()).catch(() => null);
      }
      return respons;
    })()
  );
});




