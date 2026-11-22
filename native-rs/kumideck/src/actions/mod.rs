//! Penggerak aksi 2.3.0. Setiap cabang melakukan pekerjaan sungguhan atau
//! menjawab terus terang bahwa bagian itu belum dipindahkan.

pub mod audio;
pub mod keys;
pub mod proses;

use std::sync::atomic::{AtomicBool, Ordering};

use serde_json::{json, Value};

use crate::data::models::{Aksi, Langkah};

/// Urutan yang berjalan sekarang bisa dihentikan dari Remote atau desktop.
static ADA_URUTAN: AtomicBool = AtomicBool::new(false);
static BATAL: AtomicBool = AtomicBool::new(false);

/// `true` kalau ada urutan yang benar-benar sedang berjalan.
pub fn hentikan_urutan() -> bool {
    BATAL.store(true, Ordering::SeqCst);
    ADA_URUTAN.swap(false, Ordering::SeqCst)
}

fn dibatalkan() -> bool {
    BATAL.load(Ordering::SeqCst)
}

pub struct Konteks {
    pub halaman: Vec<String>,
    pub port: u16,
    pub paths: crate::core::paths::Paths,
    pub suara: Vec<crate::data::models::SuaraItem>,
}

pub fn jalankan(aksi: &Aksi, ctx: &Konteks) -> (bool, String, Value) {
    match aksi.tipe.as_str() {
        "kosong" => (true, "Tombol kosong.".into(), Value::Null),
        "hotkey" => hasil(keys::hotkey(aksi.combo.as_deref().unwrap_or(""))),
        "teks" => hasil(keys::ketik(aksi.text.as_deref().unwrap_or(""))),
        "buka" => hasil(proses::buka(aksi.target.as_deref().unwrap_or(""))),
        "skrip" => hasil(proses::jalankan_skrip(
            aksi.target.as_deref().unwrap_or(""),
            aksi.args.as_deref(),
        )),
        "media" => hasil(keys::tombol_media(aksi.cmd.as_deref().unwrap_or(""))),
        "jendela" => hasil(proses::jendela(aksi.cmd.as_deref().unwrap_or(""))),
        "daya" => hasil(proses::daya(aksi.cmd.as_deref().unwrap_or(""))),
        "volume" => match audio::atur(aksi.mode.as_deref().unwrap_or("baca"), aksi.nilai) {
            Ok(v) => (
                true,
                "Volume diubah.".into(),
                v.map(|(p, m)| json!({ "persen": p, "mute": m }))
                    .unwrap_or(Value::Null),
            ),
            Err(e) => (false, e, Value::Null),
        },
        "mic" => match audio::mikrofon(aksi.mode.as_deref().unwrap_or("togel")) {
            Ok(nyala) => (
                true,
                if nyala {
                    "Mikrofon disenyapkan.".into()
                } else {
                    "Mikrofon dinyalakan.".into()
                },
                Value::Null,
            ),
            Err(e) => (false, e, Value::Null),
        },
        "halaman" => {
            let id = aksi.page_id.clone().unwrap_or_default();
            if id.is_empty() || !ctx.halaman.iter().any(|h| *h == id) {
                (false, "Halaman tujuan tidak ditemukan.".into(), Value::Null)
            } else {
                (true, "Pindah halaman.".into(), json!(id))
            }
        }
        "urutan" => jalankan_urutan(aksi.steps.as_deref().unwrap_or(&[]), ctx),
        "kondisional" => {
            let (proses_aktif, judul, ada) = keys::jendela_aktif();
            if !ada {
                return (false, "Tidak ada jendela aktif.".into(), Value::Null);
            }
            let syarat = aksi.syarat.clone().unwrap_or_default();
            let cocok_proses = syarat.proses.trim().is_empty()
                || proses_aktif
                    .to_lowercase()
                    .contains(&syarat.proses.to_lowercase());
            let cocok_judul = syarat.jendela.trim().is_empty()
                || judul.to_lowercase().contains(&syarat.jendela.to_lowercase());
            let cabang = if cocok_proses && cocok_judul {
                aksi.aktif.as_deref()
            } else {
                aksi.tidak_aktif.as_deref()
            };
            match cabang {
                Some(a) => {
                    let (ok, pesan, nav) = jalankan(a, ctx);
                    (ok, format!("Bersyarat: {pesan}"), nav)
                }
                None => (true, "Tidak ada aksi yang cocok.".into(), Value::Null),
            }
        }
        "tunggu" => {
            let ms = aksi.nilai.unwrap_or(0).clamp(0, 60_000);
            std::thread::sleep(std::time::Duration::from_millis(ms as u64));
            (true, format!("Menunggu {ms} ms."), Value::Null)
        }
        "http" => http(aksi),
        "suara" => {
            let id = aksi.sound_id.clone().unwrap_or_default();
            let Some(item) = ctx.suara.iter().find(|s| s.id == id) else {
                return (false, "Suara tidak ditemukan di soundboard.".into(), Value::Null);
            };
            let sumber = item.sumber.clone();
            let volume = item.volume;
            let paths = ctx.paths.clone();
            /* Pemutaran butuh unduhan tautan, yang berjalan di runtime Tokio. */
            let hasil = tokio::runtime::Handle::try_current()
                .map(|h| h.block_on(crate::soundboard::mainkan(paths, &sumber, volume)))
                .unwrap_or_else(|_| json!({ "ok": false, "message": "Runtime tidak tersedia." }));
            let ok = hasil.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
            let pesan = if ok {
                format!("Memutar suara: {}", item.name)
            } else {
                hasil
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Suara tidak dapat diputar.")
                    .to_string()
            };
            (ok, pesan, Value::Null)
        }
        lain => (
            false,
            format!("Aksi \"{lain}\" tidak dikenal."),
            Value::Null,
        ),
    }
}

fn hasil(r: Result<(), String>) -> (bool, String, Value) {
    match r {
        Ok(()) => (true, "Aksi dijalankan.".into(), Value::Null),
        Err(e) => (false, e, Value::Null),
    }
}

fn jalankan_urutan(langkah: &[Langkah], ctx: &Konteks) -> (bool, String, Value) {
    if langkah.is_empty() {
        return (false, "Urutan belum punya langkah.".into(), Value::Null);
    }
    BATAL.store(false, Ordering::SeqCst);
    ADA_URUTAN.store(true, Ordering::SeqCst);
    let (mut terakhir_ok, mut pesan, mut nav) = (true, String::new(), Value::Null);
    for (i, l) in langkah.iter().enumerate() {
        /* Jeda panjang dipotong per 50 ms supaya tombol Hentikan cepat reaksi. */
        let mut sisa = l.delay.clamp(0, 30_000) as u64;
        while sisa > 0 {
            if dibatalkan() {
                ADA_URUTAN.store(false, Ordering::SeqCst);
                return (false, "Urutan dihentikan.".into(), nav);
            }
            let potong = sisa.min(50);
            std::thread::sleep(std::time::Duration::from_millis(potong));
            sisa -= potong;
        }
        if dibatalkan() {
            ADA_URUTAN.store(false, Ordering::SeqCst);
            return (false, "Urutan dihentikan.".into(), nav);
        }
        let (ok, p, n) = jalankan(&l.action, ctx);
        if !n.is_null() {
            nav = n;
        }
        terakhir_ok = ok;
        pesan = format!("Langkah {}/{}: {p}", i + 1, langkah.len());
        if !ok {
            ADA_URUTAN.store(false, Ordering::SeqCst);
            return (false, pesan, nav);
        }
    }
    ADA_URUTAN.store(false, Ordering::SeqCst);
    (terakhir_ok, pesan, nav)
}

fn http(aksi: &Aksi) -> (bool, String, Value) {
    let url = aksi.url.as_deref().unwrap_or("").trim();
    if url.is_empty() {
        return (false, "URL kosong.".into(), Value::Null);
    }
    let metode = aksi.method.as_deref().unwrap_or("GET").to_uppercase();
    let mut cmd = std::process::Command::new("curl.exe");
    cmd.args(["-s", "-S", "--max-time", "20", "-o", "NUL", "-w", "%{http_code}"]);
    cmd.args(["-X", &metode]);
    if let Some(headers) = &aksi.headers {
        for h in headers {
            cmd.arg("-H").arg(format!("{}: {}", h.name, h.value));
        }
    }
    if let Some(body) = &aksi.body {
        if metode != "GET" && metode != "HEAD" {
            cmd.arg("--data-raw").arg(body);
        }
    }
    cmd.arg(url);
    match cmd.output() {
        Ok(out) => {
            let kode = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let ok = kode.starts_with('2') || kode.starts_with('3');
            let pesan = if kode.is_empty() {
                format!("HTTP gagal: {}", String::from_utf8_lossy(&out.stderr).trim())
            } else {
                format!("HTTP {kode}")
            };
            (ok, pesan, Value::Null)
        }
        Err(e) => (false, format!("HTTP gagal: {e}"), Value::Null),
    }
}
