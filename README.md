# KumiDeck

Papan tombol (stream deck) lokal untuk Windows: tombol-tombol di layar komputer
menjalankan aksi di komputer itu sendiri, dan ponsel/tablet bisa dipakai sebagai
papan tombol nirkabel lewat Wi-Fi.

Dibangun dengan **Node.js tanpa dependensi runtime** dan memakai
**Kumi Design System** untuk tampilannya.

## Unduh

Rilis siap pakai tersedia di halaman **Releases**:

- **Windows, portabel (tanpa pemasangan):** `KumiDeck-1.0.0-portable.zip` —
  ekstrak, lalu klik dua kali **`Buka KumiDeck.cmd`**. Server berjalan tanpa
  jendela konsol dan antarmuka terbuka di jendela aplikasi sendiri.

Lihat rilis terbaru: https://github.com/Owladi-Ex/KumiDeck/releases/latest
## Isi repo

| Path | Isi |
|---|---|
| `server/` | Server lokal: HTTP/HTTPS, SSE, API, eksekusi aksi, pemindai aplikasi, soundboard, mikrofon, ikon aplikasi, QR |
| `public/` | Antarmuka web: UI desktop (`index.html`), UI Remote (`remote.html`), CSS/JS aplikasi, PWA (manifest + service worker), `kumi/` (paket desain) |
| `assets/` | Ikon aplikasi & ikon baki sistem (`.ico`) |
| `package.json` | Nama, versi, dan skrip `start` / `test` |
| `CHANGELOG.md` | Riwayat versi |
| `LICENSE` | Lisensi MIT |
| `data/` | **tidak** ada di repo — dibuat saat pertama dijalankan (papan, token pasangan, ikon & suara unggahan) |

## Fitur

- Papan tombol berhalaman (kolom 3–6, baris 2–4) dengan ikon, warna, dan varian tombol.
- Aksi: pintasan papan ketik, mengetik teks, buka aplikasi/berkas/tautan,
  permintaan HTTP, kontrol media, pindah halaman, urutan aksi, tindakan jendela,
  volume sistem, daya komputer, serta aksi bersyarat menurut aplikasi di depan.
- **Soundboard**: unggah berkas atau tautan, volume dan perangkat output per suara.
- **Mute/unmute mikrofon** dari tombol papan.
- **Ikon asli aplikasi** diekstrak otomatis saat menambah aplikasi terpasang.
- **Widget** jam, tanggal, dan lagu yang sedang diputar.
- **Tambah cepat**, daftar aplikasi terpasang, perekam pintasan.
- Kunci tata letak, seret & lepas, impor/ekspor papan (JSON).
- Profil otomatis, penanda status, tray icon, mulai otomatis.
- Klien Remote di ponsel/tablet (PWA, dipasangkan lewat kode QR), bisa dipasang
  sebagai aplikasi bila tersedia HTTPS.
- Mode terang/gelap, riwayat aktivitas, daftar perangkat, bahasa Indonesia/English.

## Syarat

- Windows 10/11
- Node.js **20 atau lebih baru**

## Menjalankan

```powershell
git clone https://github.com/Owladi-Ex/KumiDeck.git
cd KumiDeck
node server/index.js
```

Buka `http://localhost:4173` di komputer. Untuk klien Remote, buka
`http://<ip-komputer>:4173/remote` dari perangkat di Wi-Fi yang sama, lalu
pasangkan dengan kode yang tampil di layar komputer.

## Data & keamanan

- Karena ini server lokal, akses dari perangkat lain di jaringan yang sama
  memakai **kode pasangan** (token) yang dibuat otomatis saat pertama dijalankan
  dan disimpan di `data/secret.json`.
- Folder `data/` **tidak** masuk repositori (`.gitignore`): berisi papan, token,
  ikon unggahan, suara, dan sertifikat TLS.
- Server hanya untuk jaringan lokal tepercaya; jangan diekspos langsung ke
  internet.

## Uji

```powershell
node server/qr.test.js
node server/apps.test.js
node server/appicons.test.js
node server/audio.test.js
```

Tidak ada langkah build untuk antarmuka: berkas di `public/` dilayani apa adanya.

## Lisensi

MIT — lihat `LICENSE`.

---

Kumi Design System adalah paket desain terpisah yang disertakan di
`public/kumi/`; jangan mengubah isinya dari dalam repo ini.

