/* Disuntikkan di awal bundel .exe portabel (esbuild --inject).
   Menentukan folder aplikasi = folder tempat KumiDeck.exe berada, lalu
   menyalakan peramban otomatis saat server siap. */
import path from "node:path";

globalThis.__KD_BASE = path.dirname(process.execPath);
if (process.env.KD_OPEN === undefined) process.env.KD_OPEN = "1";
