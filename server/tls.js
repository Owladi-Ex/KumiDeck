/* TLS lokal untuk memasang PWA di Android.

   Android Chrome hanya mengizinkan "Pasang aplikasi" (dan service worker) di
   konteks aman: HTTPS atau localhost. Akses LAN biasa (`http://192.168.x.x`)
   karena itu tidak bisa dipasang. Modul ini membuat sertifikat swa-tanda untuk
   alamat LAN + localhost, menyimpannya sebagai PFX untuk server, dan
   menyediakan berkas .cer agar bisa dipercaya di ponsel.

   Tanpa dependensi: sertifikat dibuat lewat PowerShell (New-SelfSignedCertificate)
   yang tersedia di Windows 10/11. */

import { execFile } from "node:child_process";
import { envPowerShell } from "./ps.js";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/* Kumpulkan nama yang harus ada di SAN sertifikat. */
function alamatSertifikat(alamatTambahan) {
  const daftarDns = new Set(["localhost"]);
  const daftarIp = new Set(["127.0.0.1"]);
  try {
    const host = os.hostname();
    if (host) daftarDns.add(host);
  } catch (err) {
    /* diabaikan */
  }
  for (const ip of Array.isArray(alamatTambahan) ? alamatTambahan : [alamatTambahan]) {
    if (!ip) continue;
    if (/^[\d.]+$/.test(ip)) daftarIp.add(ip);
    else daftarDns.add(String(ip));
  }
  return { dns: [...daftarDns], ip: [...daftarIp] };
}

function jalankanPowerShell(skrip, batasMs = 60000) {
  const berkas = path.join(os.tmpdir(), "kumideck-tls-" + crypto.randomBytes(4).toString("hex") + ".ps1");
  fs.writeFileSync(berkas, "\ufeff" + skrip.replace(/\r\n/g, "\n"), "utf8");
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", berkas],
      { timeout: batasMs, windowsHide: true, env: envPowerShell() },
      (err, stdout, stderr) => {
        try {
          fs.rmSync(berkas, { force: true });
        } catch (e) {
          /* diabaikan */
        }
        resolve({ ok: !err, keluaran: String(stdout || ""), galat: String(stderr || (err && err.message) || "") });
      }
    );
  });
}

/* Pastikan ada sertifikat; buat sekali lalu pakai ulang. */
export async function siapkanTls(dirData, alamatTambahan) {
  if (process.platform !== "win32") {
    return { ok: false, alasan: "HTTPS lokal hanya tersedia di Windows." };
  }
  const dir = path.join(dirData, "tls");
  const pfx = path.join(dir, "server.pfx");
  const berkasPass = path.join(dir, "pass.txt");
  const cer = path.join(dir, "kumideck.cer");

  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    return { ok: false, alasan: "Folder TLS tidak dapat dibuat." };
  }

  if (fs.existsSync(pfx) && fs.existsSync(berkasPass)) {
    try {
      const passphrase = fs.readFileSync(berkasPass, "utf8").trim();
      if (passphrase && fs.statSync(pfx).size > 0) {
        return { ok: true, pfx, passphrase, cer: fs.existsSync(cer) ? cer : null, baru: false };
      }
    } catch (err) {
      /* buat ulang */
    }
  }

  const { dns, ip } = alamatSertifikat(alamatTambahan);
  const passphrase = crypto.randomBytes(18).toString("base64url");
  const san =
    dns.map((d) => "DNS=" + d).join("&") + "&" + ip.map((i) => "IPAddress=" + i).join("&");
  const q = (v) => "'" + String(v).replace(/'/g, "''") + "'";

  const skrip = `
$ErrorActionPreference = "Stop"
Import-Module PKI -ErrorAction SilentlyContinue
$cert = New-SelfSignedCertificate -Subject "CN=KumiDeck" -CertStoreLocation ${q("Cert:" + String.fromCharCode(92) + "CurrentUser" + String.fromCharCode(92) + "My")} -FriendlyName "KumiDeck HTTPS lokal" -NotAfter (Get-Date).AddYears(5) -KeyExportPolicy Exportable -KeyLength 2048 -KeyAlgorithm RSA -HashAlgorithm SHA256 -TextExtension @(${q("2.5.29.17={text}" + san)})
$sandi = ConvertTo-SecureString -String ${q(passphrase)} -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath ${q(pfx)} -Password $sandi | Out-Null
Export-Certificate -Cert $cert -FilePath ${q(cer)} -Type CERT | Out-Null
Write-Output ("thumbprint=" + $cert.Thumbprint)
`;
  if (process.env.KD_TLS_DEBUG === "1") {
    try {
      fs.writeFileSync(path.join(os.tmpdir(), "kumideck-tls-debug.ps1"), "\ufeff" + skrip, "utf8");
    } catch (err) {
      /* diabaikan */
    }
  }

  const hasil = await jalankanPowerShell(skrip);
  if (!hasil.ok || !fs.existsSync(pfx)) {
    return {
      ok: false,
      alasan: "Sertifikat tidak dapat dibuat. " + (hasil.galat.split(/\r?\n/)[0] || hasil.keluaran.split(/\r?\n/)[0] || ""),
    };
  }

  try {
    fs.writeFileSync(berkasPass, passphrase, "utf8");
  } catch (err) {
    return { ok: false, alasan: "Kata sandi sertifikat tidak dapat disimpan." };
  }
  return { ok: true, pfx, passphrase, cer: fs.existsSync(cer) ? cer : null, baru: true };
}

/* Apakah pengguna sudah punya berkas sertifikat untuk dipasang di ponsel. */
export function adaSertifikat(dirData) {
  try {
    return fs.existsSync(path.join(dirData, "tls", "kumideck.cer"));
  } catch (err) {
    return false;
  }
}

export { alamatSertifikat };

