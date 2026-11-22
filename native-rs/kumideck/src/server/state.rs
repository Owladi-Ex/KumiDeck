//! Keadaan bersama: papan, hub peristiwa, aktivitas, perangkat, dan sampel monitor.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use serde::Serialize;
use serde_json::{json, Value};
use tokio::sync::broadcast;

use crate::core::paths::Paths;
use crate::data::store::Store;
use crate::monitor::metrics::Monitor;

#[derive(Clone, Debug)]
pub struct Pesan {
    pub nama: String,
    pub data: String,
}

pub struct Hub {
    tx: broadcast::Sender<Pesan>,
}

impl Hub {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(128);
        Self { tx }
    }

    pub fn siar<T: Serialize>(&self, nama: &str, data: &T) {
        let teks = serde_json::to_string(data).unwrap_or_else(|_| "null".into());
        let _ = self.tx.send(Pesan {
            nama: nama.into(),
            data: teks,
        });
    }

    pub fn langgan(&self) -> broadcast::Receiver<Pesan> {
        self.tx.subscribe()
    }

    pub fn jumlah(&self) -> usize {
        self.tx.receiver_count()
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Aktivitas {
    pub id: String,
    pub time: i64,
    #[serde(rename = "pageId")]
    pub page_id: String,
    #[serde(rename = "keyId")]
    pub key_id: String,
    pub label: String,
    pub ok: bool,
    pub message: String,
    pub platform: String,
    pub durasi: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Perangkat {
    pub id: String,
    pub platform: String,
    pub name: String,
    #[serde(rename = "lastSeen")]
    pub last_seen: i64,
    pub dicabut: bool,
}

pub struct App {
    pub store: Arc<Store>,
    pub paths: Paths,
    pub hub: Hub,
    pub mulai: Instant,
    pub port: u16,
    pub lan: String,
    /// Port HTTPS (4174). 0 berarti HTTPS tidak menyala.
    pub https_port: u16,
    pub monitor: Mutex<Monitor>,
    pub aktivitas: Mutex<VecDeque<Aktivitas>>,
    pub perangkat: Mutex<HashMap<String, Perangkat>>,
    /// Percobaan pasangan per alamat IP: (jumlah, jendela mulai ms).
    pub pasangan: Mutex<HashMap<String, (u32, i64)>>,
    /// Sertifikat DER untuk `/sertifikat.cer` (isi berkas yang sama).
    pub cer: Mutex<Vec<u8>>,
    /// Skrip jendela dari UI: perintah terakhir yang dikirim WebView2.
    pub jendela: Mutex<Option<String>>,
}

impl App {
    pub fn new(store: Arc<Store>, port: u16, https_port: u16) -> Arc<Self> {
        Arc::new(Self {
            paths: store.paths.clone(),
            store,
            hub: Hub::new(),
            mulai: Instant::now(),
            port,
            lan: lan_ip(),
            https_port,
            monitor: Mutex::new(Monitor::default()),
            aktivitas: Mutex::new(VecDeque::new()),
            perangkat: Mutex::new(HashMap::new()),
            pasangan: Mutex::new(HashMap::new()),
            cer: Mutex::new(Vec::new()),
            jendela: Mutex::new(None),
        })
    }

    pub fn versi(&self) -> &'static str {
        "2.4.0"
    }

    pub fn sinyal(&self) -> Value {
        let (proses, judul, ada) = crate::actions::keys::jendela_aktif();
        let volume = crate::actions::audio::baca()
            .map(|(p, m)| json!({ "persen": p, "mute": m }));
        json!({
            "jendela": { "ada": ada, "proses": proses, "judul": judul },
            "volume": volume.unwrap_or(Value::Null),
            "aktif": if ada { proses } else { String::new() },
        })
    }

    pub fn live(&self) -> Value {
        json!({
            "now": now_ms(),
            "media": crate::media::info(),
        })
    }

    pub fn state(&self) -> Value {
        let perangkat: Vec<_> = self
            .perangkat
            .lock()
            .unwrap()
            .values()
            .cloned()
            .collect();
        let aktivitas: Vec<_> = self.aktivitas.lock().unwrap().iter().cloned().collect();
        json!({
            "deck": self.store.deck(),
            "devices": perangkat,
            "activity": aktivitas,
            "live": self.live(),
            "sinyal": self.sinyal(),
            "server": {
                "name": "KumiDeck",
                "versi": self.versi(),
                "port": self.port,
                "httpsPort": self.https_port,
                "https": self.https_port > 0,
                "lan": self.lan,
                "lanUrl": format!("http://{}:{}/remote", self.lan, self.port),
                "lanUrlHttps": if self.https_port > 0 {
                    format!("https://{}:{}/remote", self.lan, self.https_port)
                } else {
                    String::new()
                },
                "connected": self.hub.jumlah(),
            }
        })
    }

    pub fn siar_state(&self) {
        self.hub.siar("sync", &self.state());
    }

    pub fn catat_aktivitas(&self, entri: Aktivitas) {
        let mut a = self.aktivitas.lock().unwrap();
        a.push_front(entri);
        a.truncate(50);
    }

    /// Perangkat yang dicabut langsung dibuang dari daftar pasangan.
    pub fn cabut_perangkat(&self, id: &str) {
        let mut p = self.perangkat.lock().unwrap();
        p.remove(id);
    }

    pub fn catat_perangkat(&self, id: &str, platform: &str, name: &str) {        if id.trim().is_empty() {
            return;
        }
        let mut p = self.perangkat.lock().unwrap();
        p.insert(
            id.to_string(),
            Perangkat {
                id: id.to_string(),
                platform: platform.to_string(),
                name: name.to_string(),
                last_seen: now_ms(),
                dicabut: false,
            },
        );
    }
    /// Batasi percobaan pasangan: 10 per menit per alamat IP.
    pub fn izinkan_pasangan(&self, ip: &str) -> bool {
        let sekarang = now_ms();
        let mut p = self.pasangan.lock().unwrap();
        if p.len() > 256 {
            p.retain(|_, (_, mulai)| sekarang - *mulai < 60_000);
        }
        let entri = p.entry(ip.to_string()).or_insert((0, sekarang));
        if sekarang - entri.1 > 60_000 {
            *entri = (0, sekarang);
        }
        if entri.0 >= 10 {
            return false;
        }
        entri.0 += 1;
        true
    }
}

pub fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn lan_ip() -> String {
    if let Ok(s) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if s.connect("8.8.8.8:80").is_ok() {
            if let Ok(alamat) = s.local_addr() {
                let ip = alamat.ip().to_string();
                if ip != "0.0.0.0" {
                    return ip;
                }
            }
        }
    }
    "127.0.0.1".into()
}
