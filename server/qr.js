/* qr.js - pembuat kode QR SVG tanpa dependensi untuk QR pasangan Android.
   Mengikuti ISO/IEC 18004: mode numerik, alfanumerik, dan byte (UTF-8);
   versi 1-10; koreksi galat L/M/Q/H; mask dipilih dari skor penalti. */

/* Tabel QR. */

const MIN_VERSION = 1;
const MAX_VERSION = 10;

const ECC_LEVELS = ["L", "M", "Q", "H"];

/* Bit format untuk tiap tingkat koreksi galat: L=01, M=00, Q=11, H=10. */
const ECC_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

/* Total kata kode (data + ECC) per versi; indeks 0 tidak dipakai. */
const TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];

/* Posisi pusat alignment pattern per versi; versi 1 tidak punya. */
const ALIGNMENT_POSITIONS = [
  null,
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

/* Tabel blok per versi dan tingkat ECC. Bentuk tiap entri:
   [ECC per blok, jumlah blok grup 1, data per blok grup 1,
    jumlah blok grup 2, data per blok grup 2].
   Grup 1 selalu berisi blok yang lebih pendek. */
const BLOCKS = [
  null,
  {
    L: [7, 1, 19, 0, 0],
    M: [10, 1, 16, 0, 0],
    Q: [13, 1, 13, 0, 0],
    H: [17, 1, 9, 0, 0],
  },
  {
    L: [10, 1, 34, 0, 0],
    M: [16, 1, 28, 0, 0],
    Q: [22, 1, 22, 0, 0],
    H: [28, 1, 16, 0, 0],
  },
  {
    L: [15, 1, 55, 0, 0],
    M: [26, 1, 44, 0, 0],
    Q: [18, 2, 17, 0, 0],
    H: [22, 2, 13, 0, 0],
  },
  {
    L: [20, 1, 80, 0, 0],
    M: [18, 2, 32, 0, 0],
    Q: [26, 2, 24, 0, 0],
    H: [16, 4, 9, 0, 0],
  },
  {
    L: [26, 1, 108, 0, 0],
    M: [24, 2, 43, 0, 0],
    Q: [18, 2, 15, 2, 16],
    H: [22, 2, 11, 2, 12],
  },
  {
    L: [18, 2, 68, 0, 0],
    M: [16, 4, 27, 0, 0],
    Q: [24, 4, 19, 0, 0],
    H: [28, 4, 15, 0, 0],
  },
  {
    L: [20, 2, 78, 0, 0],
    M: [18, 4, 31, 0, 0],
    Q: [18, 2, 14, 4, 15],
    H: [26, 4, 13, 1, 14],
  },
  {
    L: [24, 2, 97, 0, 0],
    M: [22, 2, 38, 2, 39],
    Q: [22, 4, 18, 2, 19],
    H: [26, 4, 14, 2, 15],
  },
  {
    L: [30, 2, 116, 0, 0],
    M: [22, 3, 36, 2, 37],
    Q: [20, 4, 16, 4, 17],
    H: [24, 4, 12, 4, 13],
  },
  {
    L: [18, 2, 68, 2, 69],
    M: [26, 4, 43, 1, 44],
    Q: [24, 6, 19, 2, 20],
    H: [28, 6, 15, 2, 16],
  },
];

/* Karakter yang boleh dipakai mode alfanumerik (indeks = nilainya). */
const ALPHANUMERIC_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

/* Indikator mode 4 bit dan jumlah bit panjang data per rentang versi. */
const MODE_INDICATOR = { numeric: 0b0001, alphanumeric: 0b0010, byte: 0b0100 };
const MODE_COUNT_BITS = {
  numeric: [10, 12, 14],
  alphanumeric: [9, 11, 13],
  byte: [8, 16, 16],
};

/* Util. */

function assertText(text) {
  if (typeof text !== "string") {
    throw new TypeError("Teks QR harus berupa string");
  }
}

function normalizeEcc(ecc) {
  const level = String(ecc == null ? "M" : ecc).toUpperCase();
  if (!ECC_LEVELS.includes(level)) {
    throw new RangeError(`Tingkat ECC tidak dikenal: ${ecc} (pakai L, M, Q, atau H)`);
  }
  return level;
}

function utf8Bytes(text) {
  return Array.from(new TextEncoder().encode(text));
}

function countBitsForMode(mode, version) {
  const group = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  return MODE_COUNT_BITS[mode][group];
}

/* Ambil ringkasan blok (ECC per blok, jumlah blok, total data codeword). */
function blockInfo(version, ecc) {
  const row = BLOCKS[version] && BLOCKS[version][ecc];
  if (!row) {
    throw new RangeError(`Versi ${version} dengan ECC ${ecc} tidak didukung`);
  }
  const [eccPerBlock, num1, data1, num2, data2] = row;
  const numBlocks = num1 + num2;
  const dataCodewords = num1 * data1 + num2 * data2;
  const total = dataCodewords + eccPerBlock * numBlocks;
  if (total !== TOTAL_CODEWORDS[version]) {
    throw new Error(`Tabel QR tidak konsisten pada versi ${version}/${ecc}`);
  }
  return { eccPerBlock, numBlocks, dataCodewords };
}

/* Kapasitas bit data (setelah header mode dan panjang) untuk versi/ECC. */
function dataCapacityBits(version, ecc) {
  return blockInfo(version, ecc).dataCodewords * 8;
}

/* Pilih mode paling ringkas untuk seluruh teks. */
function chooseMode(text) {
  if (text === "") return "byte";
  if (/^[0-9]+$/.test(text)) return "numeric";
  let alnum = true;
  for (const ch of text) {
    if (!ALPHANUMERIC_CHARSET.includes(ch)) {
      alnum = false;
      break;
    }
  }
  return alnum ? "alphanumeric" : "byte";
}

/* Panjang bit payload (tanpa header mode dan field panjang). */
function payloadBitLength(mode, text) {
  const n = mode === "byte" ? utf8Bytes(text).length : text.length;
  if (mode === "numeric") {
    return Math.floor(n / 3) * 10 + [0, 4, 7][n % 3];
  }
  if (mode === "alphanumeric") {
    return Math.floor(n / 2) * 11 + (n % 2) * 6;
  }
  return n * 8;
}

/* Versi terkecil yang muat; lempar galat bila melebihi versi 10. */
function selectVersion(text, ecc, mode) {
  const n = mode === "byte" ? utf8Bytes(text).length : text.length;
  const payload = payloadBitLength(mode, text);
  for (let version = MIN_VERSION; version <= MAX_VERSION; version++) {
    /* Panjang data juga harus muat di field panjang (count bits). */
    if (n >= 1 << countBitsForMode(mode, version)) continue;
    if (4 + countBitsForMode(mode, version) + payload <= dataCapacityBits(version, ecc)) {
      return version;
    }
  }
  throw new RangeError(
    `Teks terlalu panjang: ${n} karakter tidak muat di QR versi 1-10 dengan ECC ${ecc}`
  );
}

/* Pastikan versi paksaan (untuk pengujian) tetap muat. */
function checkForcedVersion(text, ecc, mode, version) {
  if (!Number.isInteger(version) || version < MIN_VERSION || version > MAX_VERSION) {
    throw new RangeError(`Versi QR harus bilangan bulat ${MIN_VERSION}-${MAX_VERSION}`);
  }
  const n = mode === "byte" ? utf8Bytes(text).length : text.length;
  if (n >= 1 << countBitsForMode(mode, version)) {
    throw new RangeError(`Teks terlalu panjang untuk QR versi ${version}`);
  }
  if (4 + countBitsForMode(mode, version) + payloadBitLength(mode, text) > dataCapacityBits(version, ecc)) {
    throw new RangeError(`Teks tidak muat di QR versi ${version} dengan ECC ${ecc}`);
  }
  return version;
}

/* Data dan koreksi galat. */

/* Susun data codeword: header, payload, terminator, lalu padding 0xEC/0x11. */
function encodeDataCodewords(text, version, ecc, mode) {
  const capacity = dataCapacityBits(version, ecc);
  const bits = [];
  const append = (value, length) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };

  append(MODE_INDICATOR[mode], 4);
  const countBits = countBitsForMode(mode, version);

  if (mode === "numeric") {
    append(text.length, countBits);
    for (let i = 0; i < text.length; i += 3) {
      const chunk = text.slice(i, i + 3);
      const bitLen = chunk.length === 3 ? 10 : chunk.length === 2 ? 7 : 4;
      append(Number(chunk), bitLen);
    }
  } else if (mode === "alphanumeric") {
    append(text.length, countBits);
    let i = 0;
    for (; i + 1 < text.length; i += 2) {
      const value =
        ALPHANUMERIC_CHARSET.indexOf(text[i]) * 45 +
        ALPHANUMERIC_CHARSET.indexOf(text[i + 1]);
      append(value, 11);
    }
    if (i < text.length) append(ALPHANUMERIC_CHARSET.indexOf(text[i]), 6);
  } else {
    const bytes = utf8Bytes(text);
    append(bytes.length, countBits);
    for (const byte of bytes) append(byte, 8);
  }

  if (bits.length > capacity) {
    throw new RangeError("Data melebihi kapasitas kode QR");
  }

  /* Terminator 0000 (maksimal 4 bit) lalu ratakan ke batas byte. */
  for (let i = 0; i < Math.min(4, capacity - bits.length); i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j++) value = (value << 1) | bits[i + j];
    codewords.push(value);
  }

  /* Padding bergantian 0xEC dan 0x11 sampai kapasitas penuh. */
  const padBytes = [0xec, 0x11];
  const dataTotal = blockInfo(version, ecc).dataCodewords;
  let padIndex = 0;
  while (codewords.length < dataTotal) {
    codewords.push(padBytes[padIndex % 2]);
    padIndex++;
  }
  return codewords;
}

/* Perkalian pada GF(2^8) dengan polinomial 0x11D. */
function gfMultiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

/* Polinomial generator Reed-Solomon untuk sejumlah codeword ECC. */
function computeDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

/* Sisa pembagian data oleh polinomial generator = codeword ECC. */
function computeRemainder(data, divisor) {
  const result = new Array(divisor.length).fill(0);
  for (const byte of data) {
    const factor = byte ^ result.shift();
    result.push(0);
    for (let i = 0; i < divisor.length; i++) {
      result[i] ^= gfMultiply(divisor[i], factor);
    }
  }
  return result;
}

/* Bagi data menjadi blok, tambahkan ECC, lalu interleave. */
function addEccAndInterleave(dataCodewords, version, ecc) {
  const { eccPerBlock, numBlocks, dataCodewords: dataTotal } = blockInfo(version, ecc);
  if (dataCodewords.length !== dataTotal) {
    throw new Error("Jumlah data codeword tidak sesuai tabel");
  }

  const rawCodewords = TOTAL_CODEWORDS[version];
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const divisor = computeDivisor(eccPerBlock);

  const blocks = [];
  let offset = 0;
  for (let i = 0; i < numBlocks; i++) {
    const dataLen = shortBlockLen - eccPerBlock + (i < numShortBlocks ? 0 : 1);
    const chunk = dataCodewords.slice(offset, offset + dataLen);
    offset += dataLen;
    const block = new Array(shortBlockLen + 1).fill(0);
    for (let j = 0; j < chunk.length; j++) block[j] = chunk[j];
    const eccBytes = computeRemainder(chunk, divisor);
    for (let j = 0; j < eccBytes.length; j++) {
      block[block.length - eccPerBlock + j] = eccBytes[j];
    }
    blocks.push(block);
  }

  const result = [];
  for (let i = 0; i < blocks[0].length; i++) {
    for (let j = 0; j < numBlocks; j++) {
      /* Slot kosong pada blok pendek dilewati saat interleave. */
      if (i !== shortBlockLen - eccPerBlock || j >= numShortBlocks) {
        result.push(blocks[j][i]);
      }
    }
  }
  return result;
}

/* Matriks. */

function setFunction(sym, x, y, dark) {
  sym.modules[y][x] = !!dark;
  sym.isFunction[y][x] = true;
}

function drawFinder(sym, centerX, centerY) {
  /* Pola 7x7 plus separator: cincin luar gelap, cincin tengah terang,
     inti 3x3 gelap, lalu satu modul terang di sekelilingnya. */
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const x = centerX + dx;
      const y = centerY + dy;
      if (x < 0 || x >= sym.size || y < 0 || y >= sym.size) continue;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      setFunction(sym, x, y, dist !== 2 && dist !== 4);
    }
  }
}

function drawAlignment(sym, centerX, centerY) {
  /* Pola 5x5: gelap di tepi, terang di cincin dalam, gelap di pusat. */
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      setFunction(sym, centerX + dx, centerY + dy, dist !== 1);
    }
  }
}

/* Bit informasi format 15 bit: 5 bit data + BCH(15,5), XOR 0x5412. */
function formatBitsValue(ecc, mask) {
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/* Tulis informasi format di dua tempat (dekat finder kiri atas dan terbagi). */
function drawFormatBits(sym, mask) {
  const bits = formatBitsValue(sym.ecc, mask);
  const bit = (i) => ((bits >>> i) & 1) !== 0;
  const size = sym.size;

  for (let i = 0; i <= 5; i++) setFunction(sym, 8, i, bit(i));
  setFunction(sym, 8, 7, bit(6));
  setFunction(sym, 8, 8, bit(7));
  setFunction(sym, 7, 8, bit(8));
  for (let i = 9; i < 15; i++) setFunction(sym, 14 - i, 8, bit(i));

  for (let i = 0; i < 8; i++) setFunction(sym, size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) setFunction(sym, 8, size - 15 + i, bit(i));

  /* Modul gelap tetap di (8, size-8) atau (kolom 8, baris 4*versi+9). */
  setFunction(sym, 8, size - 8, true);
}

/* Informasi versi 18 bit (versi >= 7): 6 bit data + BCH(18,6). */
function drawVersionBits(sym) {
  const version = sym.version;
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (version << 12) | rem;
  const size = sym.size;

  for (let i = 0; i < 18; i++) {
    const bit = ((bits >>> i) & 1) !== 0;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFunction(sym, a, b, bit);
    setFunction(sym, b, a, bit);
  }
}

function drawFunctionPatterns(sym) {
  const size = sym.size;

  /* Timing pattern: modul gelap pada indeks genap. */
  for (let i = 0; i < size; i++) {
    setFunction(sym, 6, i, i % 2 === 0);
    setFunction(sym, i, 6, i % 2 === 0);
  }

  /* Tiga finder pattern + separator. */
  drawFinder(sym, 3, 3);
  drawFinder(sym, size - 4, 3);
  drawFinder(sym, 3, size - 4);

  /* Alignment pattern, kecuali yang bertabrakan dengan finder. */
  for (const y of ALIGNMENT_POSITIONS[sym.version]) {
    for (const x of ALIGNMENT_POSITIONS[sym.version]) {
      const nearTopLeft = x === 6 && y === 6;
      const nearTopRight = x === size - 7 && y === 6;
      const nearBottomLeft = x === 6 && y === size - 7;
      if (nearTopLeft || nearTopRight || nearBottomLeft) continue;
      drawAlignment(sym, x, y);
    }
  }

  /* Reservasi modul informasi format (nilai sementara mask 0). */
  drawFormatBits(sym, 0);

  if (sym.version >= 7) drawVersionBits(sym);
}

/* Letakkan codeword mengikuti pola zigzag dari kanan bawah. */
function drawCodewords(sym, codewords) {
  const { size, modules, isFunction } = sym;
  const totalBits = codewords.length * 8;
  let bitIndex = 0;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && bitIndex < totalBits) {
          const byte = codewords[bitIndex >>> 3];
          modules[y][x] = ((byte >>> (7 - (bitIndex & 7))) & 1) !== 0;
          bitIndex++;
        }
      }
    }
  }
  /* Sisa modul (remainder bits) dibiarkan terang lalu ikut ter-mask. */
}

/* Apakah modul (x, y) terkena mask tertentu; koordinat x = kolom, y = baris. */
function maskBit(mask, x, y) {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      throw new RangeError(`Mask ${mask} tidak dikenal`);
  }
}

/* Terapkan/lepas mask: hanya modul non-fungsi yang dibalik. */
function applyMask(sym, mask) {
  for (let y = 0; y < sym.size; y++) {
    for (let x = 0; x < sym.size; x++) {
      if (!sym.isFunction[y][x] && maskBit(mask, x, y)) {
        sym.modules[y][x] = !sym.modules[y][x];
      }
    }
  }
}

/* Hitung skor penalti seluruh simbol (empat aturan ISO/IEC 18004).
   Aturan 3 memakai pola 1:1:3:1:1 berukuran 7 modul (gelap-terang-gelap3-
   terang-gelap); interpretasi inilah yang menghasilkan mask 2 untuk simbol
   contoh standar "01234567" versi 1-M. */
function computePenalty(size, modules) {
  const N1 = 3;
  const N2 = 3;
  const N3 = 40;
  const N4 = 10;
  let penalty = 0;

  /* Aturan 1: deret >= 5 modul berwarna sama, arah baris. */
  for (let y = 0; y < size; y++) {
    let runLength = 1;
    for (let x = 1; x <= size; x++) {
      if (x < size && modules[y][x] === modules[y][x - 1]) {
        runLength++;
      } else {
        if (runLength >= 5) penalty += N1 + (runLength - 5);
        runLength = 1;
      }
    }
  }

  /* Aturan 1: arah kolom. */
  for (let x = 0; x < size; x++) {
    let runLength = 1;
    for (let y = 1; y <= size; y++) {
      if (y < size && modules[y][x] === modules[y - 1][x]) {
        runLength++;
      } else {
        if (runLength >= 5) penalty += N1 + (runLength - 5);
        runLength = 1;
      }
    }
  }

  /* Aturan 2: setiap blok 2x2 berwarna sama. */
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const color = modules[y][x];
      if (
        color === modules[y][x + 1] &&
        color === modules[y + 1][x] &&
        color === modules[y + 1][x + 1]
      ) {
        penalty += N2;
      }
    }
  }

  /* Aturan 3: pola mirip finder 1011101 pada baris atau kolom. */
  const hitungPolaFinder = (baca) => {
    for (let start = 0; start + 6 < size; start++) {
      if (
        baca(start) &&
        !baca(start + 1) &&
        baca(start + 2) &&
        baca(start + 3) &&
        baca(start + 4) &&
        !baca(start + 5) &&
        baca(start + 6)
      ) {
        penalty += N3;
      }
    }
  };
  for (let y = 0; y < size; y++) hitungPolaFinder((x) => modules[y][x]);
  for (let x = 0; x < size; x++) hitungPolaFinder((y) => modules[y][x]);

  /* Aturan 4: keseimbangan modul gelap/terang. */
  let dark = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y][x]) dark++;
    }
  }
  const total = size * size;
  const deviation = Math.abs(dark * 20 - total * 10);
  const k = Math.max(0, Math.ceil(deviation / total) - 1);
  penalty += k * N4;

  return penalty;
}

/* Siapkan matriks dasar: fungsi pola + codeword terpasang, belum ter-mask. */
function createBase(text, ecc, forcedVersion) {
  assertText(text);
  const level = normalizeEcc(ecc);
  const mode = chooseMode(text);
  const version =
    forcedVersion == null
      ? selectVersion(text, level, mode)
      : checkForcedVersion(text, level, mode, forcedVersion);

  const dataCodewords = encodeDataCodewords(text, version, level, mode);
  const codewords = addEccAndInterleave(dataCodewords, version, level);
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));
  const sym = { version, size, ecc: level, modules, isFunction };

  drawFunctionPatterns(sym);
  drawCodewords(sym, codewords);
  return { sym, mode, version, dataCodewords, codewords };
}

/* Bangun simbol lengkap: pilih versi, encode data, cari mask terbaik. */
function buildSymbol(text, ecc, forcedVersion) {
  const { sym, mode, version, dataCodewords, codewords } = createBase(
    text,
    ecc,
    forcedVersion
  );
  const size = sym.size;
  const modules = sym.modules;

  /* Coba 8 mask, hitung penalti masing-masing, ambil yang terkecil. */
  const penalties = [];
  let bestMask = 0;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(sym, mask);
    drawFormatBits(sym, mask);
    const score = computePenalty(size, modules);
    penalties.push(score);
    if (score < bestPenalty) {
      bestPenalty = score;
      bestMask = mask;
    }
    applyMask(sym, mask); /* lepas kembali sebelum mencoba mask berikutnya */
  }
  applyMask(sym, bestMask);
  drawFormatBits(sym, bestMask);

  return {
    version,
    ecc: sym.ecc,
    mode,
    size,
    mask: bestMask,
    modules,
    penalties,
    dataCodewords,
    codewords,
  };
}

/* SVG. */

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&apos;";
    }
  });
}

function assertColor(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`Opsi ${name} harus berupa string warna`);
  }
  return value;
}

export function qrSvg(text, options = {}) {
  if (options === null || typeof options !== "object") {
    throw new TypeError("Opsi QR harus berupa objek");
  }
  const {
    size = 256,
    margin = 4,
    dark = "#000000",
    light = "#ffffff",
    ecc = "M",
  } = options;

  if (!Number.isInteger(size) || size <= 0) {
    throw new RangeError("Opsi size harus bilangan bulat positif");
  }
  if (!Number.isInteger(margin) || margin < 0) {
    throw new RangeError("Opsi margin harus bilangan bulat >= 0");
  }
  assertColor(dark, "dark");
  assertColor(light, "light");

  const symbol = buildSymbol(text, ecc, null);
  const total = symbol.size + margin * 2;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"` +
      ` viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img">`,
    `<rect width="${total}" height="${total}" fill="${escapeXml(light)}"/>`,
  ];

  /* Gabungkan modul gelap yang berurutan dalam satu baris menjadi satu rect. */
  for (let y = 0; y < symbol.size; y++) {
    let x = 0;
    while (x < symbol.size) {
      if (!symbol.modules[y][x]) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < symbol.size && symbol.modules[y][x + run]) run++;
      parts.push(
        `<rect x="${margin + x}" y="${margin + y}" width="${run}" height="1"` +
          ` fill="${escapeXml(dark)}"/>`
      );
      x += run;
    }
  }

  parts.push("</svg>");
  return parts.join("");
}

/* API publik. */

/* Versi QR terkecil yang dipakai untuk teks dan tingkat ECC tertentu. */
export function qrVersion(text, ecc = "M") {
  assertText(text);
  const level = normalizeEcc(ecc);
  return selectVersion(text, level, chooseMode(text));
}

/* Matriks modul: { size, modules, version, mask, ecc, mode }. */
export function qrMatrix(text, ecc = "M") {
  const symbol = buildSymbol(text, ecc, null);
  return {
    size: symbol.size,
    modules: symbol.modules,
    version: symbol.version,
    mask: symbol.mask,
    ecc: symbol.ecc,
    mode: symbol.mode,
  };
}

/* Data codeword (setelah header, terminator, dan padding). */
export function qrDataCodewords(text, ecc = "M", version = null) {
  const symbol = buildSymbol(text, ecc, version);
  return symbol.dataCodewords.slice();
}

/* Codeword final (data + ECC, sudah diinterleave). */
export function qrCodewords(text, ecc = "M", version = null) {
  const symbol = buildSymbol(text, ecc, version);
  return symbol.codewords.slice();
}

/* Skor penalti untuk kedelapan mask; berguna untuk pengujian. */
export function qrPenalties(text, ecc = "M") {
  const symbol = buildSymbol(text, ecc, null);
  return symbol.penalties.slice();
}

export default qrSvg;
