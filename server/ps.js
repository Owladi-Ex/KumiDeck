/* Lingkungan bersih untuk memanggil Windows PowerShell 5.1.

   Bila KumiDeck dijalankan dari shell yang sudah memuat PowerShell 7 (mis. dari
   Windows Terminal terbaru), variabel PSModulePath ikut terbawa dan berisi modul
   PowerShell 7. Windows PowerShell 5.1 lalu gagal memuat modul bawaannya
   (mis. Security) — akibatnya drive `Cert:` tidak ada dan
   `New-SelfSignedCertificate` gagal.

   Helper ini hanya meneruskan jalur modul milik Windows PowerShell 5.1. */

import path from "node:path";

export function envPowerShell(tambahan = {}) {
  const env = { ...process.env, ...tambahan };
  if (process.platform !== "win32") return env;
  const windir = process.env.WINDIR || "C:\\WINDOWS";
  const profil = process.env.USERPROFILE || "";
  const jalur = [
    profil ? path.join(profil, "Documents", "WindowsPowerShell", "Modules") : "",
    path.join(process.env.ProgramFiles || "C:\\Program Files", "WindowsPowerShell", "Modules"),
    path.join(windir, "system32", "WindowsPowerShell", "v1.0", "Modules"),
  ].filter(Boolean);
  env.PSModulePath = jalur.join(";");
  return env;
}
