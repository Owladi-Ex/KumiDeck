# KumiDeck

Papan tombol (stream deck) lokal untuk Windows: tombol-tombol di layar komputer
menjalankan aksi di komputer itu sendiri, dan ponsel/tablet bisa dipakai sebagai
papan tombol nirkabel lewat Wi-Fi.

Mulai versi 2.0.0 KumiDeck adalah **aplikasi native Windows 11** (C#/.NET 10 +
WPF + WebView2): satu berkas `KumiDeck.exe` mandiri, tanpa Node.js, tanpa
konsol, dan tanpa peramban `--app`. Antarmukanya tetap UI web KumiDeck
(**Kumi Design System**) yang dibawa di dalam exe.

## Unduh

Rilis siap pakai tersedia di halaman **Releases**:

- **Pemasang:** `KumiDeck-<versi>-setup.exe` (mis. `KumiDeck-2.0.1-setup.exe`) —
  pasang, lalu jalankan KumiDeck dari
  menu Mulai. Bisa juga membuat pintasan Desktop dan mulai otomatis.
- **Portabel (tanpa pemasangan):** `KumiDeck-<versi>-portabel.zip` — ekstrak,
  lalu klik dua kali **`Jalankan KumiDeck.cmd`** (atau `KumiDeck.exe`).

Sidik jari berkas rilis ada di `SHA256.txt`.

Lihat rilis terbaru: https://github.com/Owladi-Ex/KumiDeck/releases/latest

## Isi repo

| Path | Isi |
|---|---|
| `native/KumiDeck/` | **Aplikasi native**: server lokal (HTTP/HTTPS, SSE, API), eksekusi aksi, pemindai aplikasi, soundboard, mikrofon, ikon, tray, autostart, QR, jendela WPF + WebView2 |
| `public/` | Antarmuka web: UI desktop (`index.html`), UI Remote (`remote.html`), CSS/JS aplikasi, PWA (manifest + service worker), `kumi/` (paket desain) |
| `assets/` | Ikon aplikasi & ikon baki sistem (`.ico`) |
| `server/` | Server Node.js versi lama (1.x) sebagai rujukan; tidak dipakai aplikasi native |
| `scripts/` | Perkakas build rilis (internal, tidak ikut ke repositori) |
| `CHANGELOG.md` | Riwayat versi |
| `LICENSE` | Lisensi MIT |
| `data/` | **tidak** ada di repo — dibuat saat pertama dijalankan (papan, token pasangan, ikon & suara unggahan, sertifikat) |

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
- Jendela native Windows 11: title bar sendiri (perkecil/perbesar/tutup),
  kepala aplikasi dipakai untuk menggeser jendela, tata letak padat tanpa
  batang gulir halaman.
- Mode terang/gelap, riwayat aktivitas, daftar perangkat, bahasa Indonesia/English.

## Syarat

- Windows 10 (1809+) / Windows 11, 64-bit
- **Microsoft Edge WebView2 Runtime** — Windows 11 sudah menyertakannya; bila
  belum ada, KumiDeck menawarkan tautan unduhnya saat pertama dijalankan.

Tidak perlu memasang .NET, Node.js, maupun peramban tambahan.

## Menjalankan

Dari paket rilis: ekstrak ZIP lalu jalankan `Jalankan KumiDeck.cmd` (atau
`KumiDeck.exe`). Papan terbuka di jendela aplikasi sendiri; untuk klien Remote,
buka `http://<ip-komputer>:4173/remote` dari perangkat di Wi-Fi yang sama, lalu
pasangkan dengan kode yang tampil di layar komputer.

Dari kode sumber (butuh .NET SDK 10):

```powershell
git clone https://github.com/Owladi-Ex/KumiDeck.git
cd KumiDeck
dotnet run --project native\KumiDeck
```

Membuat `KumiDeck.exe` tunggal:

```powershell
pwsh -File scripts\buat-exe.ps1      # -> _exe\KumiDeck.exe
```

Mode HTTPS lokal (diperlukan agar ponsel Android mau memasang PWA):

```powershell
$env:KD_HTTPS = "1"
dotnet run --project native\KumiDeck
```

Buka `https://127.0.0.1:4173`, pasang sertifikat yang disajikan di
`http://<ip-komputer>:4174/sertifikat.cer`, lalu buka
`https://<ip-komputer>:4173/remote`.

## Data & keamanan

- Data disimpan di `data/` **di samping exe** (mode portabel). Bila folder itu
  tidak bisa ditulis (mis. dipasang di `Program Files`), data dipindah otomatis
  ke `%LOCALAPPDATA%\KumiDeck\data`.
- Karena ini server lokal, akses dari perangkat lain di jaringan yang sama
  memakai **kode pasangan** (token) yang dibuat otomatis saat pertama dijalankan
  dan disimpan di `data/secret.json`.
- Folder `data/` **tidak** masuk repositori (`.gitignore`): berisi papan, token,
  ikon unggahan, suara, dan sertifikat TLS. Mencopot pemasangan tidak
  menghapusnya.
- Server hanya untuk jaringan lokal tepercaya; jangan diekspos langsung ke
  internet.

## Uji

Uji lama untuk server Node (versi 1.x) masih bisa dijalankan:

```powershell
node server/qr.test.js
node server/apps.test.js
node server/appicons.test.js
node server/audio.test.js
```

Tidak ada langkah build untuk antarmuka: berkas di `public/` dibawa apa adanya
ke dalam exe.

## Lisensi

MIT — lihat `LICENSE`.

---

Kumi Design System adalah paket desain terpisah yang disertakan di
`public/kumi/`; jangan mengubah isinya dari dalam repo ini.
