/* qr.test.js - pengujian qr.js tanpa kerangka tes pihak ketiga.
   Jalankan: node server/qr.test.js (kode keluar 0 = lulus, 1 = gagal).
   Import dinamis dipakai agar berkas ini juga jalan tanpa package.json. */

(async () => {
  const { qrSvg, qrVersion, qrMatrix, qrDataCodewords, qrCodewords, qrPenalties } =
    await import("./qr.js");

  /* Utilitas. */

  let jumlahCek = 0;

  function ok(kondisi, pesan) {
    jumlahCek++;
    if (!kondisi) throw new Error(pesan);
  }

  function eq(actual, expected, pesan) {
    ok(Object.is(actual, expected), `${pesan}: diharapkan ${expected}, dapat ${actual}`);
  }

  function deepEq(actual, expected, pesan) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    ok(a === b, `${pesan}: diharapkan ${b}, dapat ${a}`);
  }

  function harusGagal(fn, ctor, pesan) {
    let gagal = false;
    try {
      fn();
    } catch (err) {
      gagal = true;
      ok(err instanceof ctor, `${pesan}: tipe galat ${err.constructor.name}, diharapkan ${ctor.name}`);
    }
    ok(gagal, `${pesan}: seharusnya melempar galat`);
  }

  function hitungGelap(modules) {
    let jumlah = 0;
    for (const baris of modules) for (const sel of baris) if (sel) jumlah++;
    return jumlah;
  }

  /* Cetak matriks sebagai teks; margin = quiet zone dalam modul. */
  function cetakMatriks(modules, margin = 2) {
    const size = modules.length;
    const baris = [];
    for (let y = -margin; y < size + margin; y++) {
      let teks = "";
      for (let x = -margin; x < size + margin; x++) {
        const gelap = y >= 0 && y < size && x >= 0 && x < size && modules[y][x];
        teks += gelap ? "##" : "..";
      }
      baris.push(teks);
    }
    console.log(baris.join("\n"));
  }

  /* Pembaca format dan versi. */

  const ECC_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  /* Baca kedua salinan informasi format, kembalikan nilai 15 bit masing-masing. */
  function bacaFormat(modules, size) {
    const ambil = (x, y) => (modules[y][x] ? 1 : 0);
    const pertama = [];
    for (let i = 0; i <= 5; i++) pertama.push(ambil(8, i));
    pertama.push(ambil(8, 7), ambil(8, 8), ambil(7, 8));
    for (let i = 9; i < 15; i++) pertama.push(ambil(14 - i, 8));

    const kedua = [];
    for (let i = 0; i < 8; i++) kedua.push(ambil(size - 1 - i, 8));
    for (let i = 8; i < 15; i++) kedua.push(ambil(8, size - 15 + i));

    const nilai = (arr) => arr.reduce((acc, bit, i) => acc | (bit << i), 0);
    return { pertama: nilai(pertama), kedua: nilai(kedua) };
  }

  /* Dekode 15 bit informasi format: BCH(15,5), XOR 0x5412. */
  function dekodeFormat(nilai) {
    const mentah = nilai ^ 0x5412;
    const data = mentah >>> 10;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return { data, eccBits: data >>> 3, mask: data & 7, valid: ((data << 10) | rem) === mentah };
  }

  /* Baca kedua salinan informasi versi (18 bit, hanya versi >= 7). */
  function bacaVersi(modules, size) {
    const atas = [];
    const bawah = [];
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      atas.push(modules[b][a] ? 1 : 0);
      bawah.push(modules[a][b] ? 1 : 0);
    }
    const nilai = (arr) => arr.reduce((acc, bit, i) => acc | (bit << i), 0);
    return { atas: nilai(atas), bawah: nilai(bawah) };
  }

  function cekBchVersi(nilai) {
    const data = nilai >>> 12;
    let rem = data;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    return { data, valid: ((data << 12) | rem) === nilai };
  }

  /* Invarian struktural. */

  function cekFinder(modules, kiri, atas, versi) {
    const size = modules.length;
    for (let dy = 0; dy < 7; dy++) {
      for (let dx = 0; dx < 7; dx++) {
        const gelap =
          dx === 0 || dx === 6 || dy === 0 || dy === 6 ||
          (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
        ok(
          modules[atas + dy][kiri + dx] === gelap,
          `pola finder di (${kiri},${atas}) salah pada modul (${dx},${dy}) versi ${versi}`
        );
      }
    }
  }

  /* Finder di tiga sudut + separator (satu modul terang di sekelilingnya). */
  function cekFinderDanSeparator(modules, versi) {
    const size = modules.length;
    cekFinder(modules, 0, 0, versi);
    cekFinder(modules, size - 7, 0, versi);
    cekFinder(modules, 0, size - 7, versi);

    for (let i = 0; i < 8; i++) {
      ok(!modules[7][i], `separator atas-kiri (baris 7, kolom ${i}) harus terang`);
      ok(!modules[i][7], `separator atas-kiri (kolom 7, baris ${i}) harus terang`);
      ok(!modules[7][size - 1 - i], `separator atas-kanan (baris 7) harus terang`);
      ok(!modules[i][size - 8], `separator atas-kanan (kolom ${size - 8}) harus terang`);
      ok(!modules[size - 8][i], `separator bawah-kiri (baris ${size - 8}) harus terang`);
      ok(!modules[size - 1 - i][7], `separator bawah-kiri (kolom 7) harus terang`);
    }
  }

  function cekTiming(modules, versi) {
    const size = modules.length;
    for (let i = 8; i < size - 8; i++) {
      const diharapkan = i % 2 === 0;
      ok(modules[6][i] === diharapkan, `timing baris 6 kolom ${i} salah (versi ${versi})`);
      ok(modules[i][6] === diharapkan, `timing kolom 6 baris ${i} salah (versi ${versi})`);
    }
  }

  function cekAlignment(modules, versi) {
    const posisi = {
      2: [6, 18],
      3: [6, 22],
      4: [6, 26],
      5: [6, 30],
      6: [6, 34],
      7: [6, 22, 38],
      8: [6, 24, 42],
      9: [6, 26, 46],
      10: [6, 28, 50],
    }[versi];
    ok(Array.isArray(posisi), `tabel alignment versi ${versi} tidak ada di tes`);
    const size = modules.length;
    /* Semua kombinasi pusat, kecuali tiga yang menabrak finder. */
    for (const cy of posisi) {
      for (const cx of posisi) {
        if (
          (cx === 6 && cy === 6) ||
          (cx === 6 && cy === size - 7) ||
          (cx === size - 7 && cy === 6)
        ) {
          continue;
        }
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const diharapkan = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
            ok(
              modules[cy + dy][cx + dx] === diharapkan,
              `alignment di (${cx},${cy}) salah pada modul (${dx},${dy}) versi ${versi}`
            );
          }
        }
      }
    }
  }

  /* Seluruh invarian struktur + format + versi untuk satu simbol. */
  function cekSimbol(teks, ecc) {
    const simbol = qrMatrix(teks, ecc);
    const { size, modules, version, mask } = simbol;

    ok(Number.isInteger(version) && version >= 1 && version <= 10, "versi di luar 1-10");
    eq(size, 17 + 4 * version, `ukuran matriks untuk versi ${version}`);
    eq(modules.length, size, "jumlah baris matriks");
    ok(modules.every((baris) => baris.length === size), "jumlah kolom matriks");
    ok(
      modules.every((baris) => baris.every((sel) => typeof sel === "boolean")),
      "modul harus boolean"
    );

    cekFinderDanSeparator(modules, version);
    cekTiming(modules, version);
    if (version >= 2) cekAlignment(modules, version);

    /* Modul gelap tetap di kolom 8, baris 4*versi+9. */
    ok(modules[4 * version + 9][8] === true, `modul gelap (8, 4*versi+9) versi ${version}`);

    /* Informasi format: dua salinan identik, BCH valid, ECC dan mask cocok. */
    const format = bacaFormat(modules, size);
    eq(format.pertama, format.kedua, "dua salinan informasi format harus sama");
    const dekode = dekodeFormat(format.pertama);
    ok(dekode.valid, "BCH informasi format tidak valid");
    eq(dekode.eccBits, ECC_BITS[ecc], `bit ECC informasi format (${ecc})`);
    eq(dekode.mask, mask, "mask pada informasi format harus sama dengan mask terpilih");

    /* Informasi versi hanya ada mulai versi 7. */
    if (version >= 7) {
      const versiInfo = bacaVersi(modules, size);
      eq(versiInfo.atas, versiInfo.bawah, "dua salinan informasi versi harus sama");
      const cek = cekBchVersi(versiInfo.atas);
      ok(cek.valid, "BCH informasi versi tidak valid");
      eq(cek.data, version, "data informasi versi");
    }

    /* Determinisme: pemanggilan kedua menghasilkan matriks identik. */
    const ulang = qrMatrix(teks, ecc);
    eq(ulang.mask, mask, "mask harus deterministik");
    deepEq(ulang.modules, modules, "matriks harus deterministik");

    return simbol;
  }

  /* Aritmetika GF(2^8) untuk uji Reed-Solomon. */

  function gfKali(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  function gfPangkat(eksponen) {
    let hasil = 1;
    for (let i = 0; i < eksponen; i++) hasil = gfKali(hasil, 0x02);
    return hasil;
  }

  /* Pisahkan codeword terinterleave menjadi blok sesuai struktur versi. */
  function pecahBlok(codewords, dataLens, eccLen) {
    const jumlahBlok = dataLens.length;
    const maxData = Math.max(...dataLens);
    const blok = dataLens.map(() => []);
    let k = 0;
    for (let i = 0; i < maxData; i++) {
      for (let j = 0; j < jumlahBlok; j++) {
        if (i < dataLens[j]) blok[j].push(codewords[k++]);
      }
    }
    for (let i = 0; i < eccLen; i++) {
      for (let j = 0; j < jumlahBlok; j++) blok[j].push(codewords[k++]);
    }
    eq(k, codewords.length, "jumlah codeword saat pecah blok");
    return blok;
  }

  /* Evaluasi polinomial blok di akar generator: harus nol untuk blok valid. */
  function blokReedSolomonValid(blok, eccLen) {
    const n = blok.length;
    for (let i = 0; i < eccLen; i++) {
      let jumlah = 0;
      for (let j = 0; j < n; j++) {
        jumlah ^= gfKali(blok[j], gfPangkat((i * (n - 1 - j)) % 255));
      }
      if (jumlah !== 0) return false;
    }
    return true;
  }

  /* Kelompok tes. */

  const TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];

  const URL_UTAMA = "http://192.168.1.64:4173/remote?kode=ab12cd34";

  const CONTOH_STRUKTUR = [
    "01234567",
    URL_UTAMA,
    "https://example.local/some/path?x=1&y=2#frag",
    "Halo, dunia! 123",
    "A".repeat(120),
    "KUMIDECK-REMOTE:4173",
  ];

  const daftarTes = [];

  function tes(nama, fn) {
    daftarTes.push({ nama, fn });
  }

  /* 1. Contoh numerik ISO/IEC 18004: "01234567" versi 1-M. */
  tes("contoh ISO 01234567 1-M: data, ECC, mask, matriks", () => {
    eq(qrVersion("01234567", "M"), 1, "versi otomatis");

    const data = qrDataCodewords("01234567", "M");
    deepEq(
      data,
      [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11],
      "data codeword 01234567 1-M"
    );

    /* ECC Reed-Solomon yang diketahui untuk contoh ini (10 codeword). */
    const codewords = qrCodewords("01234567", "M");
    eq(codewords.length, 26, "total codeword versi 1");
    deepEq(codewords.slice(16), [165, 36, 212, 193, 237, 54, 199, 135, 44, 85], "codeword ECC 1-M");

    const simbol = qrMatrix("01234567", "M");
    eq(simbol.version, 1, "versi simbol");
    eq(simbol.size, 21, "ukuran simbol");
    eq(simbol.mode, "numeric", "mode numerik");
    eq(simbol.mask, 2, "mask contoh standar (010)");

    cekFinderDanSeparator(simbol.modules, 1);
    cekTiming(simbol.modules, 1);

    /* Format informasi: M (00) + mask 2 (010) => data 00010. */
    const format = dekodeFormat(bacaFormat(simbol.modules, 21).pertama);
    eq(format.data, 0b00010, "data informasi format M/mask 2");

    console.log("\nMatriks simbol contoh ISO (01234567, versi 1-M, mask 2):");
    cetakMatriks(simbol.modules, 2);
    console.log("");
  });

  /* 2. Contoh alfanumerik "HELLO WORLD". */
  tes("contoh alfanumerik HELLO WORLD", () => {
    const HARAP = [
      0x20, 0x5b, 0x0b, 0x78, 0xd1, 0x72, 0xdc, 0x4d, 0x43, 0x40, 0xec, 0x11, 0xec,
    ];
    /* Simbol standar memakai 13 data codeword = versi 1-Q. */
    eq(qrVersion("HELLO WORLD", "Q"), 1, "versi 1-Q");
    eq(qrMatrix("HELLO WORLD", "Q").mode, "alphanumeric", "mode alfanumerik");
    deepEq(qrDataCodewords("HELLO WORLD", "Q"), HARAP, "data codeword HELLO WORLD 1-Q");

    /* Versi 1-M punya 16 data codeword: 13 sama + lanjutan padding. */
    deepEq(
      qrDataCodewords("HELLO WORLD", "M"),
      HARAP.concat([0x11, 0xec, 0x11]),
      "data codeword HELLO WORLD 1-M"
    );
  });

  /* 3. Invarian struktur pada berbagai teks dan semua tingkat ECC. */
  tes("invarian struktur semua teks & ECC", () => {
    for (const teks of CONTOH_STRUKTUR) {
      for (const ecc of ["L", "M", "Q", "H"]) {
        cekSimbol(teks, ecc);
      }
    }
  });

  /* 4. Skor penalti: 8 mask, dan mask terpilih harus yang minimal. */
  tes("skor penalti 8 mask & pilihan minimal", () => {
    const kasus = [
      ["01234567", "M"],
      [URL_UTAMA, "M"],
      ["Halo, dunia! 123", "Q"],
      ["A".repeat(120), "L"],
    ];
    for (const [teks, ecc] of kasus) {
      const skor = qrPenalties(teks, ecc);
      eq(skor.length, 8, "jumlah skor penalti");
      ok(
        skor.every((nilai) => Number.isInteger(nilai) && nilai >= 0),
        "skor penalti harus bilangan bulat >= 0"
      );
      const minimal = Math.min(...skor);
      const pilihan = qrMatrix(teks, ecc).mask;
      eq(skor[pilihan], minimal, "mask terpilih harus yang penalti minimal");
      eq(skor.indexOf(minimal), pilihan, "mask minimal pertama = mask terpilih");
      deepEq(qrPenalties(teks, ecc), skor, "skor penalti deterministik");
    }
  });

  /* 5. Reed-Solomon: total codeword + sindrom nol pada versi multi-blok. */
  tes("Reed-Solomon per blok & panjang codeword", () => {
    for (let versi = 1; versi <= 10; versi++) {
      for (const ecc of ["L", "M", "Q", "H"]) {
        const codewords = qrCodewords("KUMIDECK", ecc, versi);
        eq(codewords.length, TOTAL_CODEWORDS[versi], `total codeword versi ${versi}/${ecc}`);
      }
    }

    const kasus = [
      { versi: 5, ecc: "Q", dataLens: [15, 15, 16, 16], eccLen: 18 },
      { versi: 7, ecc: "H", dataLens: [13, 13, 13, 13, 14], eccLen: 26 },
      { versi: 10, ecc: "M", dataLens: [43, 43, 43, 43, 44], eccLen: 26 },
    ];
    for (const { versi, ecc, dataLens, eccLen } of kasus) {
      const codewords = qrCodewords("KUMIDECK REMOTE LINK", ecc, versi);
      eq(codewords.length, TOTAL_CODEWORDS[versi], `total codeword versi ${versi}/${ecc}`);
      const blok = pecahBlok(codewords, dataLens, eccLen);
      blok.forEach((isi, indeks) => {
        ok(
          blokReedSolomonValid(isi, eccLen),
          `sindrom Reed-Solomon blok ${indeks} versi ${versi}/${ecc} tidak nol`
        );
      });
    }
  });

  /* 6. Pemilihan versi & mode. */
  tes("pemilihan versi dan mode", () => {
    eq(qrVersion("01234567", "M"), 1, "teks pendek -> versi 1");
    eq(qrMatrix("01234567", "M").mode, "numeric", "digit -> numerik");
    eq(qrMatrix("HELLO WORLD", "M").mode, "alphanumeric", "huruf kapital -> alfanumerik");
    eq(qrMatrix(URL_UTAMA, "M").mode, "byte", "URL huruf kecil -> byte");

    /* Optimasi mode: 41 digit muat di versi 2, byte mode butuh versi 3. */
    eq(qrVersion("1".repeat(41), "M"), 2, "41 digit -> versi 2 (numerik)");

    /* Batas kapasitas ECC L (byte): versi 9 = 232 data codeword. */
    eq(qrVersion("x".repeat(230), "L"), 9, "230 byte -> versi 9-L");
    eq(qrVersion("x".repeat(231), "L"), 10, "231 byte -> versi 10-L");

    harusGagal(() => qrVersion("x".repeat(300), "M"), RangeError, "teks 300 byte 1-M");
    harusGagal(() => qrVersion("x".repeat(275), "L"), RangeError, "teks 275 byte 1-L");

    /* Versi 10 tetap valid secara struktur (termasuk info versi). */
    const simbol = qrMatrix("x".repeat(270), "L");
    eq(simbol.version, 10, "versi 10 untuk 270 byte L");
    cekSimbol("x".repeat(270), "L");
  });

  /* 7. SVG: bentuk string, atribut, dan kecocokan dengan matriks. */
  tes("SVG valid & sesuai matriks", () => {
    const svg = qrSvg(URL_UTAMA);
    ok(svg.startsWith("<svg"), "SVG harus dimulai dengan <svg");
    ok(svg.endsWith("</svg>"), "SVG harus diakhiri </svg>");
    ok(!svg.includes("\n"), "SVG satu baris");

    const tag = svg.match(/^<svg\s([^>]*)>/);
    ok(tag, "tag <svg> harus punya atribut");
    const atribut = {};
    for (const cocok of tag[1].matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) {
      atribut[cocok[1]] = cocok[2];
    }
    eq(atribut.xmlns, "http://www.w3.org/2000/svg", "xmlns");
    eq(atribut.width, "256", "lebar default");
    eq(atribut.height, "256", "tinggi default");
    eq(atribut["shape-rendering"], "crispEdges", "shape-rendering");

    const simbol = qrMatrix(URL_UTAMA, "M");
    const total = simbol.size + 8; /* margin default 4 di tiap sisi */
    eq(atribut.viewBox, `0 0 ${total} ${total}`, "viewBox default");

    const rects = [];
    for (const cocok of svg.matchAll(/<rect\s([^>]*?)\/>/g)) {
      const isi = {};
      for (const attr of cocok[1].matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) isi[attr[1]] = attr[2];
      rects.push(isi);
    }
    ok(rects.length > 1, "harus ada rect latar + rect modul gelap");
    eq(rects[0].width, String(total), "rect latar lebar");
    eq(rects[0].height, String(total), "rect latar tinggi");
    eq(rects[0].fill, "#ffffff", "warna latar default");

    let luasGelap = 0;
    for (let i = 1; i < rects.length; i++) {
      const r = rects[i];
      ok(r.fill === "#000000", "rect modul harus memakai warna gelap default");
      ok(/^\d+$/.test(r.x) && /^\d+$/.test(r.y), "koordinat rect harus bilangan bulat");
      ok(r.height === "1", "tinggi rect modul harus 1");
      ok(Number(r.width) >= 1, "lebar rect modul minimal 1");
      const x = Number(r.x);
      const y = Number(r.y);
      const w = Number(r.width);
      ok(x >= 4 && y >= 4, "rect harus di dalam quiet zone");
      ok(x + w <= total - 4, "rect tidak boleh melewati batas kanan");
      ok(y + 1 <= total - 4, "rect tidak boleh melewati batas bawah");
      luasGelap += w;
    }
    eq(luasGelap, hitungGelap(simbol.modules), "luas rect gelap = jumlah modul gelap");

    /* Determinisme keluaran SVG. */
    eq(qrSvg(URL_UTAMA), svg, "keluaran SVG deterministik");
  });

  /* 8. SVG opsi kustom + validasi masukan. */
  tes("SVG opsi kustom & validasi masukan", () => {
    const svg = qrSvg("https://example.local/some/path?x=1&y=2#frag", {
      size: 512,
      margin: 2,
      dark: "#112233",
      light: "#f0f0f0",
      ecc: "H",
    });
    const tag = svg.match(/^<svg\s([^>]*)>/);
    const atribut = {};
    for (const cocok of tag[1].matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) {
      atribut[cocok[1]] = cocok[2];
    }
    eq(atribut.width, "512", "lebar kustom");
    eq(atribut.height, "512", "tinggi kustom");

    const simbol = qrMatrix("https://example.local/some/path?x=1&y=2#frag", "H");
    const total = simbol.size + 4;
    eq(atribut.viewBox, `0 0 ${total} ${total}`, "viewBox kustom");
    ok(svg.includes('fill="#112233"'), "warna gelap kustom");
    ok(svg.includes('fill="#f0f0f0"'), "warna latar kustom");

    /* Margin nol juga diizinkan. */
    const nol = qrMatrix("abc", "M").size;
    ok(qrSvg("abc", { margin: 0 }).includes(`viewBox="0 0 ${nol} ${nol}"`), "margin nol");

    harusGagal(() => qrSvg(123), TypeError, "teks bukan string");
    harusGagal(() => qrSvg("abc", null), TypeError, "opsi null");
    harusGagal(() => qrSvg("abc", { ecc: "X" }), RangeError, "ECC tidak dikenal");
    harusGagal(() => qrSvg("abc", { size: 0 }), RangeError, "size nol");
    harusGagal(() => qrSvg("abc", { size: 12.5 }), RangeError, "size bukan bilangan bulat");
    harusGagal(() => qrSvg("abc", { margin: -1 }), RangeError, "margin negatif");
    harusGagal(() => qrSvg("abc", { dark: "" }), TypeError, "warna gelap kosong");
    harusGagal(() => qrSvg("x".repeat(300), { ecc: "M" }), RangeError, "teks terlalu panjang");
  });

  /* Jalankan tes. */

  console.log("== Tes QR Code (server/qr.js) ==");
  let gagal = 0;
  for (const { nama, fn } of daftarTes) {
    try {
      fn();
      console.log(`lulus  ${nama}`);
    } catch (err) {
      gagal++;
      console.error(`GAGAL  ${nama}: ${err.message}`);
    }
  }
  console.log(
    `\n${daftarTes.length - gagal}/${daftarTes.length} kelompok tes lulus, ${jumlahCek} pemeriksaan.`
  );
  if (gagal > 0) process.exitCode = 1;
})().catch((err) => {
  console.error("GAGAL tak terduga:", err);
  process.exitCode = 1;
});
