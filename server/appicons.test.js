/* Uji ekstraksi ikon aplikasi. Jalankan: node server/appicons.test.js */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ikonAplikasi, ikonBanyak, hapusCache, idUntuk } from "./appicons.js";

let lulus = 0;
let gagal = 0;

function cek(nama, syarat, info = "") {
  if (syarat) {
    lulus += 1;
    console.log("[LULUS] " + nama + (info ? " -- " + info : ""));
  } else {
    gagal += 1;
    console.log("[GAGAL] " + nama + (info ? " -- " + info : ""));
  }
}

function dimensiPng(berkas) {
  try {
    const buf = fs.readFileSync(berkas);
    if (buf.length < 24) return null;
    const tanda = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i += 1) if (buf[i] !== tanda[i]) return null;
    return { lebar: buf.readUInt32BE(16), tinggi: buf.readUInt32BE(20) };
  } catch (err) {
    return null;
  }
}

console.log("Uji ikon aplikasi KumiDeck\n");

const tujuan = fs.mkdtempSync(path.join(os.tmpdir(), "kd-ikon-uji-"));

const notepad = await ikonAplikasi("notepad", { tujuanDir: tujuan });
cek("ekstrak ikon notepad", notepad.ok === true, notepad.ok ? notepad.id : notepad.alasan);
if (notepad.ok) {
  cek("berkas PNG ada", fs.existsSync(notepad.berkas));
  const dim = dimensiPng(notepad.berkas);
  cek("PNG valid >= 64x64", !!dim && dim.lebar >= 64 && dim.tinggi >= 64, dim ? dim.lebar + "x" + dim.tinggi : "tidak terbaca");
  cek("id cocok pola rute /ikon", /^kst_[a-z0-9]{4,16}$/.test(notepad.id), notepad.id);
  cek("id deterministik", notepad.id === idUntuk("notepad|" + notepad.exe));

  const mtime1 = fs.statSync(notepad.berkas).mtimeMs;
  const ulang = await ikonAplikasi("notepad", { tujuanDir: tujuan });
  const mtime2 = fs.statSync(ulang.berkas).mtimeMs;
  cek("cache mengembalikan ikon yang sama", ulang.id === notepad.id && mtime1 === mtime2);
}

const palsu = await ikonAplikasi("C:\\tidak-ada\\aplikasi-palsu.exe", { tujuanDir: tujuan });
cek("target palsu ditolak tanpa melempar", palsu.ok === false && typeof palsu.alasan === "string", palsu.alasan);

hapusCache();
const banyak = await ikonBanyak(["notepad", "C:\\tidak-ada\\x.exe"]);
cek("ikonBanyak memproses daftar campuran", banyak.length === 2 && banyak[0].ok && banyak[1].ok === false,
  banyak.map((b) => (b.ok ? "ok" : "gagal")).join(", "));

try {
  fs.rmSync(tujuan, { recursive: true, force: true });
} catch (err) {
  /* diabaikan */
}

console.log("\nRingkasan: " + lulus + " lulus, " + gagal + " gagal");
process.exit(gagal ? 1 : 0);
