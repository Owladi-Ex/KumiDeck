/* apps.test.js - pengujian apps.js tanpa kerangka tes pihak ketiga.
   Jalankan: node server/apps.test.js (kode keluar 0 = lulus, 1 = gagal).
   Memindai mesin sungguhan, jadi butuh Windows dengan PowerShell dan Start
   Menu; hasil dicetak ringkas. Import dinamis agar juga jalan tanpa
   package.json. */

(async () => {
  const { daftarAplikasi, kosongkanCache } = await import("./apps.js");

  /* Daftar ikon yang diizinkan. */

  /* Harus sama dengan daftar ikon yang diizinkan di apps.js. */
  const IKON_DIIZINKAN = new Set([
    "i-play",
    "i-volume",
    "i-gamepad",
    "i-code",
    "i-image",
    "i-globe",
    "i-mail",
    "i-users",
    "i-chart-bar",
    "i-folder",
    "i-file",
    "i-plus",
    "i-settings",
    "i-database",
    "i-bell",
    "i-cloud",
    "i-bolt",
    "i-shield",
    "i-book",
    "i-grid",
  ]);

  const SUMBER_DIIZINKAN = new Set(["klasik", "store"]);

  /* Utilitas. */

  let jumlahCek = 0;
  const kegagalan = [];

  function cek(kondisi, pesan) {
    jumlahCek++;
    if (!kondisi) kegagalan.push(pesan);
  }

  try {
    /* Pemindaian awal. */

    kosongkanCache();
    const awal = await daftarAplikasi();

    cek(awal !== null && typeof awal === "object", "hasil harus berupa objek");
    cek(Array.isArray(awal.aplikasi), "medan aplikasi harus berupa array");

    const aplikasi = Array.isArray(awal.aplikasi) ? awal.aplikasi : [];
    cek(aplikasi.length > 5, `jumlah aplikasi harus lebih dari 5, dapat ${aplikasi.length}`);

    cek(typeof awal.diambil === "number" && Number.isFinite(awal.diambil), "diambil harus angka");
    cek(
      Math.abs(Date.now() - awal.diambil) < 5 * 60 * 1000,
      "diambil harus berupa epoch ms terbaru"
    );
    cek(awal.diambil <= Date.now(), "diambil tidak boleh di masa depan");
    cek(awal.galat === null || typeof awal.galat === "string", "galat harus null atau string");

    /* Periksa setiap entri: medan terisi, ikon sah, sumber sah, id unik. */
    const idTerpakai = new Set();
    const pesanBerikut = [];
    let jumlahKlasik = 0;
    let jumlahStore = 0;

    for (const app of aplikasi) {
      if (!app || typeof app !== "object") {
        pesanBerikut.push("entri bukan objek");
        continue;
      }
      for (const medan of ["id", "name", "target", "icon", "sumber"]) {
        if (typeof app[medan] !== "string" || app[medan].trim() === "") {
          pesanBerikut.push(`medan ${medan} kosong pada entri ${app.name || "(tanpa nama)"}`);
        }
      }
      if (typeof app.target === "string" && app.target.trim() === "") {
        pesanBerikut.push(`target kosong pada entri ${app.name || "(tanpa nama)"}`);
      }
      if (!IKON_DIIZINKAN.has(app.icon)) {
        pesanBerikut.push(`ikon tidak dikenal: ${app.icon}`);
      }
      if (!SUMBER_DIIZINKAN.has(app.sumber)) {
        pesanBerikut.push(`sumber tidak dikenal: ${app.sumber}`);
      }
      if (typeof app.id === "string") idTerpakai.add(app.id);
      if (app.sumber === "store") jumlahStore++;
      else if (app.sumber === "klasik") jumlahKlasik++;
    }

    cek(pesanBerikut.length === 0, `entri aplikasi tidak sah (${pesanBerikut.length}): ${pesanBerikut.slice(0, 3).join("; ")}`);
    cek(idTerpakai.size === aplikasi.length, "id aplikasi harus unik");
    cek(
      aplikasi.every((app) => typeof app.target === "string" && app.target.length > 0),
      "target setiap aplikasi harus string tidak kosong"
    );

    /* Urutan akhir harus menurut nama (localeCompare "id", numerik). */
    const urutanSalah = aplikasi.findIndex(
      (app, i) =>
        i > 0 &&
        aplikasi[i - 1].name.localeCompare(app.name, "id", {
          numeric: true,
          sensitivity: "base",
        }) > 0
    );
    cek(urutanSalah === -1, "daftar aplikasi harus terurut menurut nama");

    /* Spotify. */

    /* Spotify khusus mesin pengembang; di mesin lain cukup dilewati. */
    const spotify =
      aplikasi.find((app) => app.name.toLowerCase() === "spotify") ||
      aplikasi.find((app) => /spotify/i.test(app.name) || /spotify/i.test(app.target));

    if (spotify) {
      cek(spotify.target === "spotify:", `target Spotify harus "spotify:", dapat ${spotify.target}`);
    } else {
      console.log("[LEWAT] Spotify tidak terpasang di mesin ini — pemeriksaan target dilewati.");
    }

    /* Aplikasi Store. */

    if (jumlahStore === 0) {
      console.log(
        "Info: tidak ada entri Store/UWP terdeteksi di mesin ini (bukan kegagalan pengujian)."
      );
    }

    /* Cache. */

    const kedua = await daftarAplikasi();
    cek(
      kedua.diambil === awal.diambil,
      `panggilan kedua dalam TTL harus memakai cache (${awal.diambil} vs ${kedua.diambil})`
    );
    cek(
      Array.isArray(kedua.aplikasi) && kedua.aplikasi.length === aplikasi.length,
      "cache harus mengembalikan daftar yang sama"
    );

    const ketiga = await daftarAplikasi({ paksa: true });
    cek(ketiga !== kedua, "paksa harus mengembalikan hasil pemindaian baru");
    cek(
      ketiga.diambil >= kedua.diambil,
      `paksa harus memindai ulang: diambil ${ketiga.diambil} >= ${kedua.diambil}`
    );
    cek(Array.isArray(ketiga.aplikasi), "hasil paksa harus berisi array aplikasi");

    /* kosongkanCache. */

    kosongkanCache();
    const keempat = await daftarAplikasi();
    cek(
      keempat.diambil > ketiga.diambil,
      `kosongkanCache harus memaksa pemindaian baru (${keempat.diambil} > ${ketiga.diambil})`
    );
    cek(Array.isArray(keempat.aplikasi), "hasil setelah kosongkanCache harus berisi array");

    /* Laporan. */

    const spotifyTeks = spotify
      ? `${spotify.name} -> ${spotify.target} (${spotify.icon})`
      : "(tidak ditemukan)";

    console.log("");
    console.log("Uji pemindai aplikasi KumiDeck");
    console.log(`  jumlah aplikasi : ${aplikasi.length} (klasik ${jumlahKlasik}, store ${jumlahStore})`);
    console.log(`  spotify         : ${spotifyTeks}`);
    console.log(`  galat           : ${awal.galat === null ? "tidak ada" : awal.galat}`);
    console.log(
      `  cache           : diambil tetap ${kedua.diambil === awal.diambil ? "ya" : "tidak"} (${awal.diambil})`
    );
    console.log(
      `  paksa           : pemindaian baru ${kedua.diambil} -> ${ketiga.diambil} (${ketiga.diambil >= kedua.diambil ? "ok" : "gagal"})`
    );
    console.log(
      `  kosongkan cache : pemindaian baru ${ketiga.diambil} -> ${keempat.diambil} (${keempat.diambil > ketiga.diambil ? "ok" : "gagal"})`
    );
    console.log("");

    if (kegagalan.length === 0) {
      console.log(`LULUS - ${jumlahCek} pemeriksaan`);
      process.exitCode = 0;
    } else {
      console.log(`GAGAL - ${kegagalan.length} dari ${jumlahCek} pemeriksaan`);
      for (const pesan of kegagalan) console.log(`  - ${pesan}`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.log("");
    console.log(`GAGAL - galat tak terduga: ${err && err.message ? err.message : err}`);
    process.exitCode = 1;
  }
})();
