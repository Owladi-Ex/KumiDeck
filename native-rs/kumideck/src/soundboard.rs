//! Soundboard: pemutaran lewat MCI Windows, cache tautan http(s), dan unggah
//! berkas suara. Padanan `native/KumiDeck/Audio/SoundBoard.cs`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Mutex, OnceLock};

use serde_json::{json, Value};
use windows::core::PCWSTR;
use windows::Win32::Media::Multimedia::{mciGetErrorStringW, mciSendStringW};

use crate::core::paths::Paths;
use crate::data::models::SuaraItem;

const ALIAS: &str = "kdsb";
const MAKS_SUARA: usize = 40;

struct Pemain {
    sumber: String,
    volume: i64,
}

static PEMAIN: Mutex<Option<Pemain>> = Mutex::new(None);
/// Catatan unduhan tautan: url -> (status, persen, pesan).
static UNDUHAN: Mutex<Option<HashMap<String, (String, i64, String)>>> = Mutex::new(None);
/// Semua perintah MCI dijalankan di satu thread: sebagian driver MCI hanya
/// menjawab status pada thread yang membuka perangkatnya.
static KANAL: OnceLock<Sender<Pesan>> = OnceLock::new();

enum Opsi {
    Mainkan(PathBuf, i64),
    Hentikan,
    Mode,
}

enum Balasan {
    Hasil(Result<(), String>),
    Mode(String),
}

struct Pesan {
    opsi: Opsi,
    balas: Sender<Balasan>,
}

/* -------------------------------------------------------------------- mci --- */

fn perintah(teks: &str) -> Result<(), String> {
    let cmd: Vec<u16> = teks.encode_utf16().chain(std::iter::once(0)).collect();
    let kode = unsafe { mciSendStringW(PCWSTR(cmd.as_ptr()), None, None) };
    if kode == 0 {
        return Ok(());
    }
    let mut pesan = [0u16; 256];
    unsafe {
        let _ = mciGetErrorStringW(kode, &mut pesan);
    }
    let akhir = pesan.iter().position(|&c| c == 0).unwrap_or(pesan.len());
    Err(String::from_utf16_lossy(&pesan[..akhir]))
}

fn tanya(teks: &str) -> Result<String, String> {
    let cmd: Vec<u16> = teks.encode_utf16().chain(std::iter::once(0)).collect();
    let mut buf = [0u16; 128];
    let kode = unsafe { mciSendStringW(PCWSTR(cmd.as_ptr()), Some(&mut buf), None) };
    if kode != 0 {
        return Err(format!("MCI {kode}"));
    }
    let akhir = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    Ok(String::from_utf16_lossy(&buf[..akhir]))
}

fn tutup() {
    let _ = perintah(&format!("stop {ALIAS}"));
    let _ = perintah(&format!("close {ALIAS}"));
}

/* ---------------------------------------------------------------- pekerja --- */

fn buka_dan_putar(jalur: &Path, volume: i64) -> Result<(), String> {
    let buka = |jenis: Option<&str>| -> Result<(), String> {
        let teks = match jenis {
            Some(j) => format!("open \"{}\" type {j} alias {ALIAS}", jalur.display()),
            None => format!("open \"{}\" alias {ALIAS}", jalur.display()),
        };
        perintah(&teks)
    };
    let wav = jalur
        .extension()
        .map(|e| e.eq_ignore_ascii_case("wav"))
        .unwrap_or(false);

    tutup();
    let mut hasil = if wav {
        buka(Some("waveaudio"))
    } else {
        buka(Some("mpegvideo"))
    };
    if hasil.is_err() {
        hasil = buka(Some("mpegvideo"));
    }
    if hasil.is_err() {
        hasil = buka(None);
    }
    if hasil.is_err() && wav {
        hasil = buka(Some("waveaudio"));
    }
    hasil?;
    let _ = perintah(&format!("setaudio {ALIAS} volume to {}", volume * 10));
    perintah(&format!("play {ALIAS}"))
}

fn kanal() -> &'static Sender<Pesan> {
    KANAL.get_or_init(|| {
        let (tx, rx) = channel::<Pesan>();
        std::thread::Builder::new()
            .name("soundboard".into())
            .spawn(move || {
                let mut ada = false;
                while let Ok(p) = rx.recv() {
                    let balas = match p.opsi {
                        Opsi::Mainkan(jalur, volume) => {
                            let hasil = buka_dan_putar(&jalur, volume);
                            ada = hasil.is_ok();
                            Balasan::Hasil(hasil)
                        }
                        Opsi::Hentikan => {
                            tutup();
                            ada = false;
                            Balasan::Hasil(Ok(()))
                        }
                        Opsi::Mode => {
                            let mode = if ada {
                                tanya(&format!("status {ALIAS} mode")).unwrap_or_default()
                            } else {
                                String::new()
                            };
                            Balasan::Mode(mode)
                        }
                    };
                    let _ = p.balas.send(balas);
                }
            })
            .expect("thread soundboard tidak bisa dibuat");
        tx
    })
}

fn kirim(opsi: Opsi) -> Option<Balasan> {
    let (tx, rx) = channel();
    if kanal().send(Pesan { opsi, balas: tx }).is_err() {
        return None;
    }
    rx.recv().ok()
}

/* --------------------------------------------------------------- sumber --- */

fn tautan(sumber: &str) -> bool {
    let s = sumber.trim().to_ascii_lowercase();
    s.starts_with("http://") || s.starts_with("https://")
}

fn ekstensi(sumber: &str) -> &'static str {
    let bersih = sumber.split(['?', '#']).next().unwrap_or(sumber);
    let ext = bersih
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "mp3" => "mp3",
        "wav" => "wav",
        "m4a" | "mp4" => "m4a",
        "ogg" | "oga" => "ogg",
        "flac" => "flac",
        "aac" => "aac",
        _ => "mp3",
    }
}

fn sidik(teks: &str) -> String {
    // FNV-1a 64-bit, cukup untuk nama berkas cache.
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in teks.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100_0000_01b3);
    }
    format!("{h:016x}")
}

fn folder_tautan(paths: &Paths) -> PathBuf {
    paths.suara().join("tautan")
}

fn berkas_cache(paths: &Paths, url: &str) -> Option<PathBuf> {
    let dir = folder_tautan(paths);
    let sidik = sidik(url);
    let Ok(isi) = std::fs::read_dir(&dir) else {
        return None;
    };
    for e in isi.flatten() {
        let nama = e.file_name().to_string_lossy().to_string();
        if nama.starts_with(&sidik) {
            let p = e.path();
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

fn catat_unduhan(url: &str, status: &str, persen: i64, pesan: &str) {
    let mut kunci = UNDUHAN.lock().unwrap();
    let peta = kunci.get_or_insert_with(HashMap::new);
    peta.insert(
        url.to_string(),
        (status.to_string(), persen, pesan.to_string()),
    );
}

fn unduh(url: &str, tujuan: &Path) -> Result<(), String> {
    use windows::core::HSTRING;
    use windows::Win32::System::Com::Urlmon::URLDownloadToFileW;
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};

    if let Some(induk) = tujuan.parent() {
        std::fs::create_dir_all(induk).map_err(|e| format!("Folder cache gagal dibuat: {e}"))?;
    }
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        URLDownloadToFileW(
            None,
            &HSTRING::from(url),
            &HSTRING::from(tujuan.to_string_lossy().to_string()),
            0,
            None,
        )
    }
    .map_err(|e| format!("Tautan tidak dapat diunduh: {e}"))?;
    if tujuan.is_file() {
        Ok(())
    } else {
        Err("Tautan tidak dapat diunduh.".into())
    }
}

/// Jalur lokal untuk sebuah sumber. Tautan diunduh dulu ke cache.
async fn jalur_lokal(paths: Paths, sumber: &str) -> Result<PathBuf, String> {
    if tautan(sumber) {
        if let Some(p) = berkas_cache(&paths, sumber) {
            return Ok(p);
        }
        catat_unduhan(sumber, "mengunduh", -1, "");
        let url = sumber.to_string();
        let tujuan = folder_tautan(&paths).join(format!("{}.{}", sidik(sumber), ekstensi(sumber)));
        let url2 = url.clone();
        let tujuan2 = tujuan.clone();
        let hasil = tokio::task::spawn_blocking(move || unduh(&url2, &tujuan2))
            .await
            .map_err(|e| format!("Unduhan gagal: {e}"))?;
        match hasil {
            Ok(()) => {
                catat_unduhan(sumber, "siap", 100, "");
                Ok(tujuan)
            }
            Err(e) => {
                catat_unduhan(sumber, "gagal", -1, &e);
                Err(e)
            }
        }
    } else {
        let p = PathBuf::from(sumber);
        if !p.is_file() {
            return Err("Berkas suara tidak ditemukan.".into());
        }
        Ok(p)
    }
}

/// Mulai unduh di latar supaya ketukan pertama tidak menunggu jaringan.
pub fn unduh_latar(paths: Paths, sumber: String) {
    if !tautan(&sumber) || berkas_cache(&paths, &sumber).is_some() {
        return;
    }
    catat_unduhan(&sumber, "mengunduh", -1, "");
    tokio::task::spawn_blocking(move || {
        let tujuan =
            folder_tautan(&paths).join(format!("{}.{}", sidik(&sumber), ekstensi(&sumber)));
        match unduh(&sumber, &tujuan) {
            Ok(()) => catat_unduhan(&sumber, "siap", 100, ""),
            Err(e) => catat_unduhan(&sumber, "gagal", -1, &e),
        }
    });
}

/* ------------------------------------------------------------- pemutaran --- */

/// `Ok(json)` berisi `{ok, message, volume}` seperti 2.3.0.
pub async fn mainkan(paths: Paths, sumber: &str, volume: i64) -> Value {
    let sumber = sumber.trim().to_string();
    if sumber.is_empty() {
        return json!({ "ok": false, "message": "Sumber suara kosong.", "volume": 0 });
    }
    if sumber.contains('"') {
        return json!({ "ok": false, "message": "Sumber suara tidak valid.", "volume": 0 });
    }
    let jalur = match jalur_lokal(paths, &sumber).await {
        Ok(p) => p,
        Err(e) => return json!({ "ok": false, "message": e, "volume": 0 }),
    };
    let volume = volume.clamp(0, 100);
    let jalur_kerja = jalur.clone();
    let hasil = tokio::task::spawn_blocking(move || {
        kirim(Opsi::Mainkan(jalur_kerja, volume))
    })
    .await
    .ok()
    .flatten();

    let hasil = match hasil {
        Some(Balasan::Hasil(r)) => r,
        _ => Err("Suara tidak dapat diputar.".to_string()),
    };
    if let Err(e) = hasil {
        return json!({ "ok": false, "message": format!("Suara tidak dapat diputar: {e}"), "volume": 0 });
    }

    *PEMAIN.lock().unwrap() = Some(Pemain { sumber, volume });
    json!({ "ok": true, "message": "", "volume": volume })
}

pub fn hentikan() -> Value {
    let ada = PEMAIN.lock().unwrap().is_some();
    let _ = kirim(Opsi::Hentikan);
    *PEMAIN.lock().unwrap() = None;
    json!({
        "ok": true,
        "message": if ada { "Pemutaran dihentikan." } else { "Tidak ada pemutaran." },
    })
}

pub fn status() -> Value {
    let kunci = PEMAIN.lock().unwrap();
    let volume = kunci.as_ref().map(|p| p.volume).unwrap_or(100);
    let Some(p) = kunci.as_ref() else {
        return json!({ "ok": true, "memutar": false, "sumber": "", "volume": volume });
    };
    let mode = match kirim(Opsi::Mode) {
        Some(Balasan::Mode(m)) => m,
        _ => String::new(),
    };
    let memutar = mode.trim().eq_ignore_ascii_case("playing");
    json!({
        "ok": true,
        "memutar": memutar,
        "sumber": p.sumber,
        "volume": volume,
    })
}

/* --------------------------------------------------------------- unduhan --- */

pub fn status_unduhan(paths: &Paths, daftar: &[SuaraItem]) -> Value {
    let mut hasil = Vec::new();
    for s in daftar {
        if !tautan(&s.sumber) {
            continue;
        }
        if berkas_cache(paths, &s.sumber).is_some() {
            hasil.push(json!({
                "sumber": s.sumber, "status": "siap", "persen": 100, "pesan": "",
            }));
            continue;
        }
        let catatan = UNDUHAN
            .lock()
            .unwrap()
            .as_ref()
            .and_then(|p| p.get(&s.sumber).cloned());
        match catatan {
            Some((status, persen, pesan)) => hasil.push(json!({
                "sumber": s.sumber, "status": status, "persen": persen, "pesan": pesan,
            })),
            None => hasil.push(json!({
                "sumber": s.sumber, "status": "belum", "persen": -1, "pesan": "",
            })),
        }
    }
    json!({ "ok": true, "unduhan": hasil })
}

/// Buang berkas cache milik satu tautan, dipanggil saat item dihapus.
pub fn lupakan(paths: &Paths, sumber: &str) {
    if !tautan(sumber) {
        return;
    }
    if let Some(p) = berkas_cache(paths, sumber) {
        let _ = std::fs::remove_file(p);
    }
    if let Some(peta) = UNDUHAN.lock().unwrap().as_mut() {
        peta.remove(sumber);
    }
}

/* ---------------------------------------------------------------- unggah --- */

pub fn dasar64(teks: &str) -> Option<Vec<u8>> {
    let mut hasil = Vec::with_capacity(teks.len() / 4 * 3);
    let mut buf: u32 = 0;
    let mut bit = 0;
    for c in teks.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' | b'\n' | b'\r' | b' ' | b'\t' => continue,
            _ => return None,
        } as u32;
        buf = (buf << 6) | v;
        bit += 6;
        if bit >= 8 {
            bit -= 8;
            hasil.push((buf >> bit) as u8);
        }
    }
    Some(hasil)
}

fn ekstensi_tipe(tipe: &str) -> Option<&'static str> {
    match tipe {
        "mpeg" | "mp3" => Some("mp3"),
        "wav" | "wave" | "x-wav" | "vnd.wave" => Some("wav"),
        "mp4" | "m4a" | "x-m4a" => Some("m4a"),
        "ogg" | "oga" => Some("ogg"),
        "flac" | "x-flac" => Some("flac"),
        _ => None,
    }
}

/// Simpan data URL `data:audio/<tipe>;base64,...` ke `data/suara`.
/// Mengembalikan jalur berkas untuk dipakai sebagai `sumber`.
pub fn unggah(paths: &Paths, data_url: &str) -> Result<String, String> {
    let sisa = data_url
        .strip_prefix("data:audio/")
        .ok_or_else(|| "Berkas suara tidak valid.".to_string())?;
    let (kepala, isi) = sisa
        .split_once(',')
        .ok_or_else(|| "Berkas suara tidak valid.".to_string())?;
    if !kepala.contains("base64") {
        return Err("Berkas suara tidak valid.".into());
    }
    let tipe = kepala.split(';').next().unwrap_or("").to_ascii_lowercase();
    let ext = ekstensi_tipe(&tipe)
        .ok_or_else(|| "Format suara tidak didukung (MP3, WAV, M4A, OGG, FLAC).".to_string())?;
    let data = dasar64(isi).ok_or_else(|| "Berkas suara tidak valid.".to_string())?;
    if data.is_empty() {
        return Err("Berkas suara kosong.".into());
    }
    if data.len() > 25 * 1024 * 1024 {
        return Err("Berkas suara maksimal 25 MB.".into());
    }
    let nama = format!("s_{}.{ext}", &uuid::Uuid::new_v4().simple().to_string()[..12]);
    let tujuan = paths.suara().join(nama);
    std::fs::create_dir_all(paths.suara())
        .map_err(|_| "Berkas suara tidak dapat disimpan.".to_string())?;
    std::fs::write(&tujuan, &data)
        .map_err(|_| "Berkas suara tidak dapat disimpan.".to_string())?;
    Ok(tujuan.to_string_lossy().to_string())
}

/* ------------------------------------------------------------------ sah --- */

/// Cocokkan item soundboard dari UI dengan aturan 2.3.0.
pub fn normal_item(nilai: &Value) -> Option<SuaraItem> {
    let sumber = nilai
        .get("sumber")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if sumber.is_empty() {
        return None;
    }
    let jenis = if tautan(&sumber) {
        "url"
    } else {
        let p = Path::new(&sumber);
        if !p.is_file() {
            return None;
        }
        "berkas"
    };
    let id = nilai
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let id = if id.is_empty() {
        format!("s_{}", &uuid::Uuid::new_v4().simple().to_string()[..6])
    } else {
        id
    };
    let nama = nilai
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Suara")
        .trim()
        .to_string();
    let volume = nilai.get("volume").and_then(|v| v.as_i64()).unwrap_or(100);
    Some(SuaraItem {
        id,
        name: if nama.is_empty() { "Suara".into() } else { nama },
        sumber,
        jenis: jenis.into(),
        volume: volume.clamp(0, 100),
    })
}

pub fn maks_suara() -> usize {
    MAKS_SUARA
}
