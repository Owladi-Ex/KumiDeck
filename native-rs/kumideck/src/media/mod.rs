//! Media yang sedang diputar lewat SMTC (Windows Media Control).
//! Padanan `native/KumiDeck/Media/MediaWatcher.cs`.

use std::sync::{Arc, Mutex};

use serde_json::{json, Value};
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSessionManager as Manager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
};

use crate::server::state::App;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Media {
    pub ada: bool,
    pub judul: String,
    pub artis: String,
    pub album: String,
    pub status: String,
    pub app: String,
}

impl Media {
    pub fn json(&self) -> Value {
        json!({
            "ada": self.ada,
            "judul": self.judul,
            "artis": self.artis,
            "album": self.album,
            "status": self.status,
            "app": self.app,
        })
    }

    fn kosong() -> Self {
        Self {
            status: "tertutup".into(),
            ..Default::default()
        }
    }
}

static TERAKHIR: Mutex<Option<Media>> = Mutex::new(None);

/// Info media terakhir yang terbaca; aman dipanggil dari mana saja.
pub fn info() -> Value {
    let kunci = TERAKHIR.lock().unwrap();
    match kunci.as_ref() {
        Some(m) => m.json(),
        None => Media::kosong().json(),
    }
}

fn potong(teks: String, maks: usize) -> String {
    let rapi = teks.split_whitespace().collect::<Vec<_>>().join(" ");
    if rapi.chars().count() > maks {
        rapi.chars().take(maks).collect::<String>().trim().to_string()
    } else {
        rapi
    }
}

fn status_teks(s: Status) -> &'static str {
    match s {
        Status::Playing => "memutar",
        Status::Paused => "jeda",
        Status::Stopped => "berhenti",
        Status::Closed => "tertutup",
        Status::Changing => "berganti",
        Status::Opened => "siap",
        _ => "siap",
    }
}

async fn baca() -> Media {
    let mgr = match Manager::RequestAsync() {
        Ok(op) => match op.await {
            Ok(m) => m,
            Err(_) => return Media::kosong(),
        },
        Err(_) => return Media::kosong(),
    };
    let Ok(sesi) = mgr.GetCurrentSession() else {
        return Media::kosong();
    };
    let mut hasil = Media {
        ada: true,
        ..Default::default()
    };
    if let Ok(props) = sesi.TryGetMediaPropertiesAsync() {
        if let Ok(p) = props.await {
            hasil.judul = potong(p.Title().map(|s| s.to_string()).unwrap_or_default(), 90);
            hasil.artis = potong(p.Artist().map(|s| s.to_string()).unwrap_or_default(), 60);
            hasil.album = potong(p.AlbumTitle().map(|s| s.to_string()).unwrap_or_default(), 60);
        }
    }
    if let Ok(info) = sesi.GetPlaybackInfo() {
        if let Ok(s) = info.PlaybackStatus() {
            hasil.status = status_teks(s).into();
        }
    }
    hasil.app = sesi
        .SourceAppUserModelId()
        .map(|s| s.to_string())
        .unwrap_or_default();
    if hasil.judul.is_empty() {
        /* Sesi ada tetapi tidak memberi judul: jangan tampilkan apa pun. */
        return Media::kosong();
    }
    hasil
}

/// Mulai pemantauan di thread sendiri; status dikirim ke UI hanya saat berubah.
pub fn mulai(app: Arc<App>) {
    let _ = std::thread::Builder::new()
        .name("media".into())
        .spawn(move || {
            /* WinRT butuh apartemen COM; MTA cukup untuk pembacaan pasif. */
            let _ = unsafe {
                windows::Win32::System::Com::CoInitializeEx(
                    None,
                    windows::Win32::System::Com::COINIT_MULTITHREADED,
                )
            };
            let Ok(rt) = tokio::runtime::Builder::new_current_thread().build() else {
                return;
            };
            loop {
                let m = rt.block_on(baca());
                let berubah = {
                    let mut kunci = TERAKHIR.lock().unwrap();
                    let beda = kunci.as_ref() != Some(&m);
                    if beda {
                        *kunci = Some(m.clone());
                    }
                    beda
                };
                if berubah {
                    app.hub.siar("sync", &app.state());
                }
                std::thread::sleep(std::time::Duration::from_secs(2));
            }
        });
}
