/* Uji lapisan audio KumiDeck (papan suara + bisu mikrofon).

   Jalankan: node server/audio.test.js

   Menyentuh perangkat audio sungguhan: WAV senyap 1 detik diputar dan mute
   mikrofon dibalik dua kali agar kembali ke keadaan semula. */

import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  daftarPerangkatOutput,
  mainkan,
  hentikan,
  statusPemutar,
  aturVolume,
  hentikanAudio,
} from "./audio.js";
import { bacaMic, aturMic, hentikanMic } from "./mic.js";

let lulus = 0;
let gagal = 0;
const berkasSementara = [];

function lapor(ok, judul, rincian) {
  if (ok) {
    lulus += 1;
    console.log("[LULUS] " + judul + (rincian ? " -- " + rincian : ""));
  } else {
    gagal += 1;
    console.log("[GAGAL] " + judul + (rincian ? " -- " + rincian : ""));
  }
}

function tidur(ms) {
  return new Promise((selesai) => setTimeout(selesai, ms));
}

function buatWavSenyap() {
  const laju = 8000;
  const detik = 1;
  const kanal = 1;
  const bit = 16;
  const data = Buffer.alloc((laju * detik * kanal * bit) / 8);
  const kepala = Buffer.alloc(44);
  kepala.write("RIFF", 0);
  kepala.writeUInt32LE(36 + data.length, 4);
  kepala.write("WAVE", 8);
  kepala.write("fmt ", 12);
  kepala.writeUInt32LE(16, 16);
  kepala.writeUInt16LE(1, 20);
  kepala.writeUInt16LE(kanal, 22);
  kepala.writeUInt32LE(laju, 24);
  kepala.writeUInt32LE((laju * kanal * bit) / 8, 28);
  kepala.writeUInt16LE((kanal * bit) / 8, 32);
  kepala.writeUInt16LE(bit, 34);
  kepala.write("data", 36);
  kepala.writeUInt32LE(data.length, 40);
  const jalur = path.join(
    tmpdir(),
    "kumideck-uji-" + process.pid + "-" + Date.now().toString(36) + ".wav"
  );
  writeFileSync(jalur, Buffer.concat([kepala, data]));
  berkasSementara.push(jalur);
  return jalur;
}

function prosesPowerShell() {
  try {
    const keluaran = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress",
      ],
      { encoding: "utf8", timeout: 20000, windowsHide: true }
    );
    const teks = (keluaran || "").trim();
    if (!teks) return [];
    const data = JSON.parse(teks);
    return Array.isArray(data) ? data : [data];
  } catch {
    return [];
  }
}

async function ujiDaftarPerangkat() {
  const hasil = await daftarPerangkatOutput();
  const perangkat = Array.isArray(hasil.perangkat) ? hasil.perangkat : [];
  const bawaan = perangkat.filter((p) => p && p.bawaan === true);
  const sah =
    hasil.ok === true &&
    perangkat.length >= 1 &&
    perangkat.every((p) => p && typeof p.id === "string" && p.id.length > 0) &&
    perangkat.every((p) => typeof p.nama === "string") &&
    bawaan.length >= 1;
  lapor(
    sah,
    "daftarPerangkatOutput",
    "ok=" + hasil.ok + ", jumlah=" + perangkat.length + ", bawaan=" + bawaan.length
  );
  console.log("       Daftar perangkat output:");
  for (const p of perangkat) {
    console.log(
      "       - " + (p.nama || "(tanpa nama)") + (p.bawaan ? " [bawaan]" : "") + " " + p.id
    );
  }
  if (!sah) console.log("       galat: " + (hasil.galat || "-"));
}

async function ujiVolume() {
  const set = await aturVolume(30);
  const status = await statusPemutar();
  const sah =
    set.ok === true &&
    Number(set.volume) === 30 &&
    status.ok === true &&
    Math.abs(Number(status.volume) - 30) <= 2;
  lapor(
    sah,
    "aturVolume(30) lalu statusPemutar()",
    "set=" + set.volume + ", status=" + status.volume
  );
}

async function ujiPutarDanHentikan() {
  const wav = buatWavSenyap();
  const main = await mainkan({ sumber: wav, volume: 60 });
  await tidur(150);
  const saat = await statusPemutar();
  let memutar = saat.memutar === true;
  if (!memutar) {
    /* beri satu kesempatan lagi bila mesin lambat */
    await tidur(120);
    const ulang = await statusPemutar();
    memutar = ulang.memutar === true;
  }
  const berhenti = await hentikan();
  await tidur(200);
  const akhir = await statusPemutar();
  const sah =
    main.ok === true &&
    main.routeSementara === false &&
    memutar &&
    berhenti.ok === true &&
    akhir.memutar === false;
  lapor(
    sah,
    "mainkan(wav 1 dtk) lalu hentikan()",
    "main.ok=" +
      main.ok +
      ", routeSementara=" +
      main.routeSementara +
      ", memutar=" +
      memutar +
      ", hentikan.ok=" +
      berhenti.ok +
      ", akhir.memutar=" +
      akhir.memutar +
      ", volume=" +
      akhir.volume
  );
  if (main.ok) console.log("       pesan: " + main.pesan);
}

async function ujiSumberTidakValid() {
  const hilang = path.join(
    tmpdir(),
    "kumideck-tidak-ada-" + process.pid + "-" + Date.now().toString(36) + ".mp3"
  );
  const hasil = await mainkan({ sumber: hilang });
  const sah = hasil.ok === false && typeof hasil.pesan === "string" && hasil.pesan.length > 0;
  lapor(sah, "sumber tidak valid ditolak", "ok=" + hasil.ok + ", pesan=" + hasil.pesan);
}

async function ujiMic() {
  const awal = await bacaMic();
  const aman = typeof awal.ok === "boolean" && typeof awal.mute === "boolean";
  lapor(
    aman,
    "bacaMic() tanpa melempar galat",
    "ok=" + awal.ok + ", mute=" + awal.mute + ", volume=" + awal.volume
  );
  if (!awal.ok) {
    lapor(false, "aturMic(togel) dua kali", "mikrofon tidak terdeteksi: " + (awal.pesan || "-"));
    return;
  }
  const t1 = await aturMic("togel");
  await tidur(180);
  const t2 = await aturMic("togel");
  await tidur(180);
  const cek = await bacaMic();
  const sah =
    t1.ok === true &&
    t2.ok === true &&
    t1.mute !== t2.mute &&
    t2.mute === awal.mute &&
    cek.mute === awal.mute;
  lapor(
    sah,
    "aturMic(togel) dua kali memulihkan mute",
    "awal=" + awal.mute + ", setelah=" + t1.mute + ", pulih=" + t2.mute
  );
  hentikanMic();
}

async function ujiTidakHidupLagi() {
  hentikanAudio();
  await tidur(10000);
  const daftar = prosesPowerShell();
  /* Hanya proses anak milik uji ini; proses aplikasi lain yang memakai modul
     yang sama tidak dihitung. */
  const sisa = daftar.filter(
    (p) =>
      String((p && p.ParentProcessId) || "") === String(process.pid) &&
      /kumideck-audio-|kumideck-mic-/.test(String((p && p.CommandLine) || ""))
  );
  const sah = sisa.length === 0;
  lapor(
    sah,
    "hentikanAudio() tidak menghidupkan proses lagi",
    "sisa proses anak=" + sisa.length
  );
  for (const p of sisa) {
    console.log("       masih hidup: pid " + p.ProcessId + " " + p.CommandLine);
  }
}

async function utama() {
  console.log("Uji lapisan audio KumiDeck");
  console.log("Node " + process.version + " (" + process.platform + "/" + process.arch + ")");
  console.log("");

  try {
    await ujiDaftarPerangkat();
    await ujiVolume();
    await ujiPutarDanHentikan();
    await ujiSumberTidakValid();
    await ujiMic();
    await ujiTidakHidupLagi();
  } finally {
    hentikanMic();
    hentikanAudio();
    for (const berkas of berkasSementara) {
      try {
        unlinkSync(berkas);
      } catch {
        /* diabaikan */
      }
    }
  }

  console.log("");
  console.log("Ringkasan: " + lulus + " lulus, " + gagal + " gagal");
  process.exitCode = gagal === 0 ? 0 : 1;
}

await utama();
