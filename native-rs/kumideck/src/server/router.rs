//! Seluruh rute HTTP. Nama dan bentuk muatan mengikuti 2.3.0; yang belum
//! dipindahkan menjawab 501 dengan pesan jelas, bukan pura-pura berhasil.

use std::collections::HashMap;
use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::Arc;

use axum::extract::{ConnectInfo, Path as AxumPath, Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Serialize;
use serde_json::{json, Value};
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

use super::assets;
use super::state::{now_ms, Aktivitas, App};
use crate::data::models::Deck;
use crate::data::store::normalisasi;

type Shared = Arc<App>;

pub fn router(app: Shared) -> Router {
    Router::new()
        .route("/api/pwa", get(pwa))
        .route("/api/state", get(state))
        .route("/api/events", get(events))
        .route("/api/pair-info", get(pair_info))
        .route("/api/qr.svg", get(qr_svg))
        .route("/api/pair", post(pair))
        .route("/api/hello", post(hello))
        .route("/api/press", post(press))
        .route("/api/press/izinkan", post(press_izinkan))
        .route("/api/devices/revoke", post(devices_revoke))
        .route("/api/sertifikat", get(sertifikat))
        .route("/sertifikat.cer", get(sertifikat))
        .route("/api/tekan/{halaman}/{slot}", post(press_slot))
        .route("/api/aksi", post(aksi))
        .route("/api/aksi/hentikan", post(aksi_hentikan))
        .route("/api/mic", get(mic_baca).post(mic_ubah))
        .route("/api/papan/ekspor", get(papan_ekspor).post(papan_ekspor))
        .route("/api/appicon", get(appicon))
        .route("/api/tray", get(tray).post(tray))
        .route("/api/tray/ikon", get(tray_ikon))
        .route("/api/deck", get(deck_get).post(deck_post))
        .route("/api/deck/pindah", post(deck_pindah))
        .route("/api/deck/export", get(deck_export))
        .route("/api/deck/import", post(deck_import))
        .route("/api/cadangan", get(cadangan))
        .route("/api/cadangan/pulihkan", post(cadangan_pulihkan))
        .route(
            "/api/cadangan/arsip",
            get(cadangan_arsip).post(cadangan_pulihkan_arsip),
        )
        .route("/api/otomatis", get(otomatis_get).post(otomatis_post))
        .route("/api/icons", get(icons).post(icons_post))
        .route("/api/apps", get(apps))
        .route("/api/sinyal", get(sinyal))
        .route("/api/monitor", get(monitor))
        .route("/api/ports", get(ports))
        .route("/api/proc/end", post(proc_end))
        .route("/api/audio/status", get(audio_status))
        .route("/api/audio/unduhan", get(audio_unduhan))
        .route("/api/audio/mainkan", post(audio_mainkan))
        .route("/api/audio/hentikan", post(audio_hentikan))
        .route("/api/suara/unggah", post(suara_unggah))
        .route("/api/soundboard/simpan", post(soundboard_simpan))
        .route("/api/soundboard/hapus", post(soundboard_hapus))
        .route("/api/log/unduh", get(log_unduh))
        .fallback(assets::fallback)
        .layer(axum::middleware::from_fn_with_state(
            app.clone(),
            gerbang,
        ))
        .with_state(app)
}

/// Gerbang token 2.3.0: desktop (loopback) bebas, perangkat LAN harus membawa
/// `x-kumi-token` atau `?kode=`. Berkas statis tetap terbuka supaya halaman
/// Remote bisa dimuat sebelum dipasangkan.
async fn gerbang(
    State(app): State<Shared>,
    ConnectInfo(alamat): ConnectInfo<SocketAddr>,
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> Response {
    let jalur = req.uri().path().to_string();
    if alamat.ip().is_loopback() || !jalur.starts_with("/api/") || jalur == "/api/pair" {
        return next.run(req).await;
    }

    let dari_header = req
        .headers()
        .get("x-kumi-token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .trim()
        .to_lowercase();
    let dari_query = param_query(req.uri(), "kode")
        .trim()
        .replace(['-', ' '], "")
        .to_lowercase();
    let token = if dari_header.is_empty() {
        dari_query
    } else {
        dari_header
    };

    if !token.is_empty() && token == app.store.token {
        return next.run(req).await;
    }
    ok_json(
        StatusCode::UNAUTHORIZED,
        json!({ "ok": false, "code": "butuh-pasangan", "message": "Perlu kode pasangan." }),
    )
}

/// Baca satu parameter query tanpa crate tambahan.
fn param_query(uri: &axum::http::Uri, kunci: &str) -> String {
    let Some(q) = uri.query() else {
        return String::new();
    };
    for pasangan in q.split('&') {
        let Some((k, v)) = pasangan.split_once('=') else {
            continue;
        };
        if k == kunci {
            return dekode_persen(v);
        }
    }
    String::new()
}

fn dekode_persen(s: &str) -> String {
    let b = s.as_bytes();
    let mut keluar = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'%' if i + 2 < b.len() => {
                let potong = std::str::from_utf8(&b[i + 1..i + 3]).unwrap_or("");
                match u8::from_str_radix(potong, 16) {
                    Ok(v) => {
                        keluar.push(v);
                        i += 3;
                        continue;
                    }
                    Err(_) => {
                        keluar.push(b[i]);
                        i += 1;
                    }
                }
            }
            b'+' => {
                keluar.push(b' ');
                i += 1;
            }
            c => {
                keluar.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&keluar).to_string()
}

/* --------------------------------------------------- syarat kontekstual --- */

/// Syarat yang lebih kaya dari `Aksi.syarat`: jam, hari, proses, mikrofon,
/// jaringan, dan halaman. `Err` berisi alasan yang ditampilkan ke pengguna.
fn kondisi_terpenuhi(
    kondisi: &crate::data::models::Kondisi,
    halaman: &crate::data::models::Halaman,
) -> Result<(), String> {
    let jenis = kondisi.jenis.trim().to_lowercase();
    let nilai = kondisi.nilai.trim().to_lowercase();
    if jenis.is_empty() {
        return Ok(());
    }

    let terpenuhi = match jenis.as_str() {
        "jam" => dalam_rentang_jam(&nilai),
        "hari" => hari_cocok(&nilai),
        "proses" => crate::actions::proses::berjalan(&nilai),
        "mikrofon" => {
            let senyap = crate::actions::audio::mikrofon_senyap();
            match (senyap, nilai.as_str()) {
                (Some(s), "mati" | "senyap" | "mute") => s,
                (Some(s), "hidup" | "nyala") => !s,
                (None, _) => true,
                _ => true,
            }
        }
        "jaringan" => jaringan_cocok(&nilai),
        "halaman" => halaman.name.trim().to_lowercase() == nilai,
        _ => true,
    };

    if terpenuhi {
        Ok(())
    } else {
        Err(format!(
            "Syarat \"{}\" belum terpenuhi{}.",
            kondisi.jenis,
            if kondisi.nilai.trim().is_empty() {
                String::new()
            } else {
                format!(" ({})", kondisi.nilai)
            }
        ))
    }
}

fn menit_sekarang() -> i64 {
    let t = crate::core::waktu::lokal();
    t.hour as i64 * 60 + t.minute as i64
}

fn menit_dari(teks: &str) -> Option<i64> {
    let (j, m) = teks.trim().split_once(':')?;
    let j: i64 = j.trim().parse().ok()?;
    let m: i64 = m.trim().parse().ok()?;
    if !(0..24).contains(&j) || !(0..60).contains(&m) {
        return None;
    }
    Some(j * 60 + m)
}

fn dalam_rentang_jam(nilai: &str) -> bool {
    let Some((a, b)) = nilai.split_once('-') else {
        return true;
    };
    let (Some(mulai), Some(selesai)) = (menit_dari(a), menit_dari(b)) else {
        return true;
    };
    let kini = menit_sekarang();
    if mulai <= selesai {
        kini >= mulai && kini < selesai
    } else {
        /* Lewat tengah malam, mis. 22:00-06:00. */
        kini >= mulai || kini < selesai
    }
}

fn indeks_hari(nama: &str) -> Option<i64> {
    let daftar = [
        "minggu", "senin", "selasa", "rabu", "kamis", "jumat", "sabtu",
    ];
    daftar.iter().position(|d| *d == nama).map(|i| i as i64)
}

fn hari_cocok(nilai: &str) -> bool {
    if nilai.is_empty() {
        return true;
    }
    /* Nama hari Windows: 0 = Minggu. */
    let kini = crate::core::waktu::lokal().day_of_week as i64;
    if nilai == "hari-kerja" || nilai == "kerja" {
        return (1..=5).contains(&kini);
    }
    if nilai == "akhir-pekan" || nilai == "weekend" {
        return kini == 0 || kini == 6;
    }
    if let Some((a, b)) = nilai.split_once('-') {
        if let (Some(awal), Some(akhir)) = (indeks_hari(a.trim()), indeks_hari(b.trim())) {
            return if awal <= akhir {
                (awal..=akhir).contains(&kini)
            } else {
                kini >= awal || kini <= akhir
            };
        }
    }
    nilai
        .split(',')
        .filter_map(|d| indeks_hari(d.trim()))
        .any(|d| d == kini)
}

fn jaringan_cocok(nilai: &str) -> bool {
    if nilai.is_empty() {
        return true;
    }
    if nilai == "kabel" || nilai == "ethernet" {
        use windows::Win32::NetworkManagement::IpHelper::{
            GetAdaptersAddresses, GAA_FLAG_SKIP_ANYCAST, GAA_FLAG_SKIP_DNS_SERVER,
            GAA_FLAG_SKIP_MULTICAST, IP_ADAPTER_ADDRESSES_LH,
        };
        let mut ukuran = 16 * 1024u32;
        let mut buf = vec![0u8; ukuran as usize];
        unsafe {
            let kode = GetAdaptersAddresses(
                0,
                GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_DNS_SERVER | GAA_FLAG_SKIP_MULTICAST,
                None,
                Some(buf.as_mut_ptr() as *mut IP_ADAPTER_ADDRESSES_LH),
                &mut ukuran,
            );
            if kode != 0 {
                return false;
            }
            let mut kini = buf.as_ptr() as *const IP_ADAPTER_ADDRESSES_LH;
            while !kini.is_null() {
                let a = &*kini;
                if a.OperStatus == windows::Win32::NetworkManagement::Ndis::IF_OPER_STATUS(1)
                    && a.IfType != 71
                    && !a.FirstUnicastAddress.is_null()
                {
                    return true;
                }
                kini = a.Next;
            }
        }
        return false;
    }

    /* Cari SSID lewat netsh; hanya dipakai saat tombol bersyarat ditekan. */
    let mut netsh = std::process::Command::new("netsh");
    netsh.args(["wlan", "show", "interfaces"]);
    crate::core::tanpa_jendela(&mut netsh);
    let keluaran = netsh.output();
    match keluaran {
        Ok(o) => String::from_utf8_lossy(&o.stdout)
            .lines()
            .filter(|l| l.trim_start().to_lowercase().starts_with("ssid"))
            .any(|l| {
                l.split_once(':')
                    .map(|(_, v)| v.trim().to_lowercase().contains(&nilai))
                    .unwrap_or(false)
            }),
        Err(_) => false,
    }
}

fn ok_json(status: StatusCode, v: impl Serialize) -> Response {
    (status, Json(v)).into_response()
}

fn galat(status: StatusCode, pesan: &str) -> Response {
    ok_json(
        status,
        json!({ "ok": false, "message": pesan }),
    )
}

fn belum_tersedia(nama: &str) -> Response {
    ok_json(
        StatusCode::NOT_IMPLEMENTED,
        json!({
            "ok": false,
            "code": "belum-tersedia",
            "message": format!("{nama} belum dipindahkan ke inti Rust pada build ini.")
        }),
    )
}

fn token_dari(headers: &HeaderMap, q: &HashMap<String, String>) -> String {
    if let Some(v) = headers.get("x-kumi-token").and_then(|v| v.to_str().ok()) {
        return v.trim().to_lowercase();
    }
    q.get("kode")
        .map(|v| v.trim().to_lowercase().replace('-', "").replace(' ', ""))
        .unwrap_or_default()
}

fn butuh_token(
    app: &App,
    alamat: SocketAddr,
    headers: &HeaderMap,
    q: &HashMap<String, String>,
) -> Option<Response> {
    if alamat.ip().is_loopback() {
        return None;
    }
    let token = token_dari(headers, q);
    if !token.is_empty() && token == app.store.token {
        return None;
    }
    Some(ok_json(
        StatusCode::UNAUTHORIZED,
        json!({
            "ok": false,
            "code": "butuh-pasangan",
            "message": "Perlu kode pasangan."
        }),
    ))
}

fn lokal_saja(alamat: SocketAddr) -> Option<Response> {
    if alamat.ip().is_loopback() {
        None
    } else {
        Some(galat(StatusCode::FORBIDDEN, "Hanya untuk desktop."))
    }
}

/* ------------------------------------------------------------------- dasar --- */

async fn pwa() -> Response {
    ok_json(StatusCode::OK, json!({ "ok": true, "pwa": false }))
}

/* --------------------------------------- rute 2.3.0 di luar UI baru (2.4.0) --- */

async fn aksi_hentikan() -> Response {
    let aktif = crate::actions::hentikan_urutan();
    ok_json(
        StatusCode::OK,
        json!({
            "ok": true,
            "aktif": aktif,
            "message": if aktif {
                "Urutan dihentikan."
            } else {
                "Tidak ada urutan yang sedang berjalan."
            },
        }),
    )
}

async fn mic_baca() -> Response {
    let senyap = crate::actions::audio::mikrofon_senyap();
    ok_json(
        StatusCode::OK,
        json!({ "ok": true, "senyap": senyap, "tersedia": senyap.is_some() }),
    )
}

async fn mic_ubah(State(app): State<Shared>, Json(body): Json<Value>) -> Response {
    let mode = body
        .get("mode")
        .and_then(|v| v.as_str())
        .unwrap_or("togel")
        .to_string();
    match crate::actions::audio::mikrofon(&mode) {
        Ok(senyap) => {
            app.siar_state();
            ok_json(
                StatusCode::OK,
                json!({ "ok": true, "senyap": senyap, "message": if senyap { "Mikrofon disenyapkan." } else { "Mikrofon dinyalakan." } }),
            )
        }
        Err(e) => galat(StatusCode::BAD_GATEWAY, &e),
    }
}

/// Ekspor PNG papan adalah tangkapan layar WebView2 di 2.3.0. Inti Rust belum
/// punya penangkap gambar, jadi rute ini menjawab terus terang.
async fn papan_ekspor() -> Response {
    belum_tersedia("Ekspor PNG papan")
}

async fn appicon() -> Response {
    belum_tersedia("Ikon aplikasi dari .exe/.lnk")
}

async fn tray() -> Response {
    ok_json(
        StatusCode::OK,
        json!({
            "ok": true,
            "tray": false,
            "message": "Tray diganti pintasan global di 2.4.0.",
        }),
    )
}

async fn tray_ikon() -> Response {
    ok_json(
        StatusCode::OK,
        json!({
            "ok": true,
            "berkas": "(tidak dipakai di 2.4.0)",
            "ukuran": 0,
            "log": "Tray diganti pintasan global.",
        }),
    )
}

async fn state(
    State(app): State<Shared>,
    ConnectInfo(alamat): ConnectInfo<SocketAddr>,
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    if let Some(r) = butuh_token(&app, alamat, &headers, &q) {
        return r;
    }
    ok_json(StatusCode::OK, app.state())
}

async fn sinyal(State(app): State<Shared>) -> Response {
    ok_json(StatusCode::OK, app.sinyal())
}

async fn events(
    State(app): State<Shared>,
    ConnectInfo(alamat): ConnectInfo<SocketAddr>,
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    if let Some(r) = butuh_token(&app, alamat, &headers, &q) {
        return r;
    }
    let rx = app.hub.langgan();
    let stream = BroadcastStream::new(rx).filter_map(|hasil| match hasil {
        Ok(p) => Some(Ok::<Event, Infallible>(
            Event::default().event(p.nama).data(p.data),
        )),
        Err(_) => None,
    });
    Sse::new(stream)
        .keep_alive(KeepAlive::default())
        .into_response()
}

/* ----------------------------------------------------------------- pasangan --- */

async fn pair_info(
    State(app): State<Shared>,
    ConnectInfo(alamat): ConnectInfo<SocketAddr>,
) -> Response {
    if let Some(r) = lokal_saja(alamat) {
        return r;
    }
    let url = format!("http://{}:{}/remote", app.lan, app.port);
    let url_https = if app.https_port > 0 {
        format!("https://{}:{}/remote", app.lan, app.https_port)
    } else {
        String::new()
    };
    /* QR langsung memasangkan: Remote membawa kode di query, jadi pindai lalu
       papan terbuka tanpa mengetik ulang kode di ponsel. */
    let tautan = format!("{url}?kode={}", app.store.token);
    let tautan_https = if url_https.is_empty() {
        String::new()
    } else {
        format!("{url_https}?kode={}", app.store.token)
    };
    ok_json(
        StatusCode::OK,
        json!({
            "url": url,
            "urlHttps": url_https,
            "qrUrl": format!("/api/qr.svg?data={}", urlencoding(&tautan)),
            "qrUrlHttps": if tautan_https.is_empty() {
                String::new()
            } else {
                format!("/api/qr.svg?data={}", urlencoding(&tautan_https))
            },
            "code": app.store.kode_tampil(),
            "kode": app.store.kode_tampil(),
            "token": app.store.token,
            "lan": app.lan,
            "port": app.port,
            "httpsPort": app.https_port,
            "qrSiap": true,
        }),
    )
}

async fn qr_svg(
    State(app): State<Shared>,
    ConnectInfo(alamat): ConnectInfo<SocketAddr>,
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    if let Some(r) = butuh_token(&app, alamat, &headers, &q) {
        return r;
    }
    let data = q
        .get("data")
        .cloned()
        .unwrap_or_else(|| format!("http://{}:{}/remote", app.lan, app.port));
    let data: String = data.chars().take(180).collect();
    match qrcode::QrCode::new(data.as_bytes()) {
        Ok(kode) => {
            let svg = kode
                .render::<qrcode::render::svg::Color>()
                .min_dimensions(320, 320)
                .quiet_zone(true)
                .dark_color(qrcode::render::svg::Color("#111111"))
                .light_color(qrcode::render::svg::Color("#ffffff"))
                .build();
            (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "image/svg+xml")],
                svg,
            )
                .into_response()
        }
        Err(_) => galat(StatusCode::UNPROCESSABLE_ENTITY, "Data terlalu panjang untuk kode QR."),
    }
}

fn urlencoding(teks: &str) -> String {
    let mut hasil = String::new();
    for b in teks.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                hasil.push(b as char)
            }
            _ => hasil.push_str(&format!("%{b:02X}")),
        }
    }
    hasil
}

async fn pair(
    State(app): State<Shared>,
    ConnectInfo(alamat): ConnectInfo<SocketAddr>,
    Json(body): Json<Value>,
) -> Response {
    let ip = alamat.ip().to_string();
    if !app.izinkan_pasangan(&ip) {
        return galat(
            StatusCode::TOO_MANY_REQUESTS,
            "Terlalu banyak percobaan. Coba lagi sebentar lagi.",
        );
    }
    let kode = body
        .get("kode")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_lowercase()
        .replace('-', "")
        .replace(' ', "");
    if kode != app.store.token {
        return galat(StatusCode::UNAUTHORIZED, "Kode pasangan salah.");
    }
    let id = body
        .get("deviceId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let platform = body
        .get("platform")
        .and_then(|v| v.as_str())
        .unwrap_or("android");
    let nama = body
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Perangkat");
    app.catat_perangkat(&id, platform, nama);
    app.siar_state();
    ok_json(
        StatusCode::OK,
        json!({ "ok": true, "token": app.store.token, "state": app.state() }),
    )
}

async fn hello(State(app): State<Shared>, ConnectInfo(alamat): ConnectInfo<SocketAddr>, headers: HeaderMap) -> Response {
    if let Some(r) = butuh_token(&app, alamat, &headers, &HashMap::new()) {
        return r;
    }
    ok_json(
        StatusCode::OK,
        json!({ "ok": true, "versi": app.versi(), "lan": app.lan, "port": app.port }),
    )
}

/* -------------------------------------------------------------------- tekan --- */

async fn press(State(app): State<Shared>, ConnectInfo(alamat): ConnectInfo<SocketAddr>, headers: HeaderMap, Json(body): Json<Value>) -> Response {
    if let Some(r) = butuh_token(&app, alamat, &headers, &HashMap::new()) {
        return r;
    }
    let page_id = body.get("pageId").and_then(|v| v.as_str()).unwrap_or("");
    let key_id = body.get("keyId").and_then(|v| v.as_str()).unwrap_or("");
    tekan_kerja(&app, page_id, key_id, &body)
}

async fn press_slot(
    State(app): State<Shared>,
    ConnectInfo(alamat): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    AxumPath((halaman, slot)): AxumPath<(String, usize)>,
) -> Response {
    if let Some(r) = butuh_token(&app, alamat, &headers, &HashMap::new()) {
        return r;
    }
    let deck = app.store.deck();
    let Some(p) = deck.pages.iter().find(|p| p.id == halaman) else {
        return galat(StatusCode::NOT_FOUND, "Halaman tidak ditemukan.");
    };
    let Some(Some(k)) = p.keys.get(slot) else {
        return galat(StatusCode::NOT_FOUND, "Tombol tidak ditemukan.");
    };
    tekan_kerja(&app, &halaman, &k.id, &json!({}))
}

/* Tanda tangan pengguna untuk skrip: jalankan sekali, lalu simpan izinnya. */
async fn press_izinkan(State(app): State<Shared>, Json(body): Json<Value>) -> Response {
    let page_id = body.get("pageId").and_then(|v| v.as_str()).unwrap_or("");
    let key_id = body.get("keyId").and_then(|v| v.as_str()).unwrap_or("");
    let kedua = body
        .get("kedua")
        .and_then(|v| v.as_str())
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);

    let deck = app.store.deck();
    let Some(key) = deck
        .pages
        .iter()
        .find(|h| h.id == page_id)
        .and_then(|h| h.keys.iter().flatten().find(|k| k.id == key_id))
    else {
        return galat(StatusCode::NOT_FOUND, "Tombol skrip tidak ditemukan.");
    };
    let sumber_aksi = if kedua {
        key.action_kedua.clone()
    } else {
        Some(key.action.clone())
    };
    let Some(aksi) = sumber_aksi else {
        return galat(StatusCode::NOT_FOUND, "Tombol skrip tidak ditemukan.");
    };
    if aksi.tipe != "skrip" {
        return galat(StatusCode::NOT_FOUND, "Tombol skrip tidak ditemukan.");
    }

    let mulai = now_ms();
    let ctx = crate::actions::Konteks {
        halaman: deck.pages.iter().map(|h| h.id.clone()).collect(),
        port: app.port,
        paths: app.paths.clone(),
        suara: deck.soundboard.clone(),
    };
    let (ok, pesan, navigate) = tokio::task::block_in_place(|| {
        crate::actions::jalankan(&aksi, &ctx)
    });

    if ok {
        /* Izin disimpan supaya tidak bertanya tiap kali tombol ditekan. */
        let (page, kid) = (page_id.to_string(), key_id.to_string());
        app.store.ubah(|deck| {
            if let Some(k) = deck
                .pages
                .iter_mut()
                .find(|h| h.id == page)
                .and_then(|h| h.keys.iter_mut().flatten().find(|k| k.id == kid))
            {
                if kedua {
                    if let Some(a) = k.action_kedua.as_mut() {
                        a.izin = true;
                    }
                } else {
                    k.action.izin = true;
                }
            }
        });
    }

    app.catat_aktivitas(Aktivitas {
        id: uuid::Uuid::new_v4().simple().to_string()[..8].to_string(),
        time: now_ms(),
        page_id: page_id.into(),
        key_id: key_id.into(),
        label: key.label.clone(),
        ok,
        message: pesan.clone(),
        platform: "desktop".into(),
        durasi: now_ms() - mulai,
    });
    app.siar_state();
    ok_json(
        StatusCode::OK,
        json!({ "ok": ok, "message": pesan, "navigate": navigate }),
    )
}

async fn devices_revoke(State(app): State<Shared>, Json(body): Json<Value>) -> Response {
    let id = body.get("deviceId").and_then(|v| v.as_str()).unwrap_or("");
    if id.trim().is_empty() {
        return galat(StatusCode::BAD_REQUEST, "Perangkat tidak dipilih.");
    }
    app.cabut_perangkat(id);
    let daftar: Vec<_> = app.perangkat.lock().unwrap().values().cloned().collect();
    app.hub.siar("devices", &json!({ "devices": daftar }));
    ok_json(StatusCode::OK, json!({ "ok": true }))
}

async fn sertifikat(State(app): State<Shared>) -> Response {
    let isi = {
        let ingatan = app.cer.lock().unwrap();
        if ingatan.is_empty() {
            std::fs::read(app.paths.tls().join("kumideck.cer")).ok()
        } else {
            Some(ingatan.clone())
        }
    };
    match isi {
        Some(isi) => (
            StatusCode::OK,
            [
                (header::CONTENT_TYPE, "application/x-x509-ca-cert"),
                (
                    header::CONTENT_DISPOSITION,
                    "attachment; filename=\"kumideck.cer\"",
                ),
            ],
            isi,
        )
            .into_response(),
        None => galat(StatusCode::NOT_FOUND, "Sertifikat belum dibuat."),
    }
}

fn tekan_kerja(app: &App, page_id: &str, key_id: &str, body: &Value) -> Response {
    let deck = app.store.deck();
    let Some(halaman) = deck.pages.iter().find(|h| h.id == page_id) else {
        return galat(StatusCode::NOT_FOUND, "Halaman tidak ditemukan.");
    };
    let kunci = halaman
        .keys
        .iter()
        .flatten()
        .find(|k| k.id == key_id)
        /* Tombol anak folder ikut dicari supaya Remote bisa menekannya. */
        .or_else(|| {
            halaman
                .keys
                .iter()
                .flatten()
                .filter(|k| k.folder)
                .flat_map(|k| k.keys.iter().flatten())
                .find(|k| k.id == key_id)
        });
    let Some(key) = kunci else {
        return galat(StatusCode::NOT_FOUND, "Tombol tidak ditemukan.");
    };

    if key.widget.is_some() {
        return ok_json(
            StatusCode::OK,
            json!({
                "ok": true,
                "message": "Tombol widget hanya menampilkan data.",
                "navigate": Value::Null,
            }),
        );
    }

    /* Syarat kontekstual (2.4.0): kalau tidak terpenuhi, aksi tidak dijalankan. */
    if let Some(kondisi) = &key.kondisi {
        if let Err(alasan) = kondisi_terpenuhi(kondisi, halaman) {
            app.catat_aktivitas(Aktivitas {
                id: uuid::Uuid::new_v4().simple().to_string()[..8].to_string(),
                time: now_ms(),
                page_id: page_id.into(),
                key_id: key_id.into(),
                label: key.label.clone(),
                ok: false,
                message: alasan.clone(),
                platform: "desktop".into(),
                durasi: 0,
            });
            app.siar_state();
            return ok_json(
                StatusCode::OK,
                json!({ "ok": false, "message": alasan, "navigate": Value::Null }),
            );
        }
    }

    let kedua = body
        .get("kedua")
        .and_then(|v| v.as_str())
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);
    let aksi = if kedua {
        match &key.action_kedua {
            Some(a) => a.clone(),
            None => {
                return ok_json(
                    StatusCode::OK,
                    json!({ "ok": true, "message": "Tombol ini belum punya aksi kedua." }),
                )
            }
        }
    } else {
        key.action.clone()
    };

    if aksi.tipe == "skrip" && !aksi.izin {
        let alat = aksi
            .target
            .as_deref()
            .and_then(|p| p.rsplit(['\\', '/']).next())
            .unwrap_or("");
        return ok_json(
            StatusCode::CONFLICT,
            json!({
                "ok": false,
                "code": "butuh-izin",
                "message": format!("Jalankan skrip {alat}? Komputer akan menjalankan berkas ini."),
                "skrip": alat,
                "alasan": "Tekan setuju hanya bila berkas ini kamu pasang sendiri.",
            }),
        );
    }

    let platform = match body.get("platform").and_then(|v| v.as_str()) {
        Some("android") => "android",
        _ => "desktop",
    };
    app.catat_perangkat(
        body.get("deviceId").and_then(|v| v.as_str()).unwrap_or(""),
        platform,
        body.get("name").and_then(|v| v.as_str()).unwrap_or(""),
    );

    let mulai = now_ms();
    let deck = app.store.deck();
    let ctx = crate::actions::Konteks {
        halaman: deck.pages.iter().map(|h| h.id.clone()).collect(),
        port: app.port,
        paths: app.paths.clone(),
        suara: deck.soundboard.clone(),
    };
    let (ok, pesan, navigate) = tokio::task::block_in_place(|| {
        crate::actions::jalankan(&aksi, &ctx)
    });
    let entri = Aktivitas {
        id: uuid::Uuid::new_v4().simple().to_string()[..8].to_string(),
        time: now_ms(),
        page_id: page_id.into(),
        key_id: key.id.clone(),
        label: key.label.clone(),
        ok,
        message: pesan.clone(),
        platform: platform.into(),
        durasi: now_ms() - mulai,
    };
    app.catat_aktivitas(entri);

    app.hub.siar(
        "press",
        &json!({
            "pageId": page_id,
            "keyId": key.id,
            "deviceId": body.get("deviceId").and_then(|v| v.as_str()).unwrap_or(""),
            "platform": platform,
            "ok": ok,
            "message": pesan,
            "navigate": navigate,
            "time": now_ms(),
            "volume": Value::Null,
        }),
    );

    let mut sinyal = app.sinyal();
    sinyal["kedip"] = json!({ "pageId": page_id, "keyId": key.id });
    app.hub.siar("sinyal", &sinyal);

    let aktivitas: Vec<_> = app.aktivitas.lock().unwrap().iter().cloned().collect();
    ok_json(
        StatusCode::OK,
        json!({
            "ok": ok,
            "message": pesan,
            "navigate": navigate,
            "volume": Value::Null,
            "activity": aktivitas,
        }),
    )
}

async fn aksi(State(app): State<Shared>, Json(body): Json<Value>) -> Response {
    let tipe = body
        .get("type")
        .or_else(|| body.get("tipe"))
        .and_then(|v| v.as_str())
        .unwrap_or("kosong");
    let aksi = crate::data::models::Aksi {
        tipe: tipe.to_string(),
        combo: body.get("combo").and_then(|v| v.as_str()).map(str::to_string),
        text: body.get("text").and_then(|v| v.as_str()).map(str::to_string),
        target: body.get("target").and_then(|v| v.as_str()).map(str::to_string),
        cmd: body.get("cmd").and_then(|v| v.as_str()).map(str::to_string),
        args: body.get("args").and_then(|v| v.as_str()).map(str::to_string),
        page_id: body.get("pageId").and_then(|v| v.as_str()).map(str::to_string),
        mode: body.get("mode").and_then(|v| v.as_str()).map(str::to_string),
        nilai: body.get("nilai").and_then(|v| v.as_i64()),
        steps: body
            .get("steps")
            .and_then(|v| serde_json::from_value::<Vec<crate::data::models::Langkah>>(v.clone()).ok()),
        ..crate::data::models::Aksi::kosong()
    };
    let deck = app.store.deck();
    let ctx = crate::actions::Konteks {
        halaman: deck.pages.iter().map(|h| h.id.clone()).collect(),
        port: app.port,
        paths: app.paths.clone(),
        suara: deck.soundboard.clone(),
    };
    let (ok, pesan, navigate) = tokio::task::block_in_place(|| {
        crate::actions::jalankan(&aksi, &ctx)
    });
    ok_json(
        StatusCode::OK,
        json!({ "ok": ok, "message": pesan, "navigate": navigate }),
    )
}

/* --------------------------------------------------------------------- deck --- */

async fn deck_get(State(app): State<Shared>) -> Response {
    ok_json(StatusCode::OK, json!({ "ok": true, "deck": app.store.deck() }))
}

async fn deck_post(State(app): State<Shared>, Json(body): Json<Value>) -> Response {
    let Some(nilai) = body.get("deck") else {
        return galat(StatusCode::BAD_REQUEST, "Deck tidak valid.");
    };
    let Ok(mut baru) = serde_json::from_value::<Deck>(nilai.clone()) else {
        return galat(StatusCode::BAD_REQUEST, "Deck tidak valid.");
    };
    if app.store.deck().settings.terkunci {
        /* Papan terkunci tetap boleh menyimpan setelan (mis. membuka kunci),
           asalkan tata letak dan profil tidak berubah. */
        let lama = app.store.deck();
        let tata_letak_sama = serde_json::to_value(&lama.pages).ok()
            == serde_json::to_value(&baru.pages).ok()
            && serde_json::to_value(&lama.profile).ok()
                == serde_json::to_value(&baru.profile).ok();
        if !tata_letak_sama {
            return ok_json(
                StatusCode::LOCKED,
                json!({
                    "ok": false,
                    "code": "terkunci",
                    "message": "Tata letak terkunci. Buka kunci dulu untuk mengubah papan.",
                    "deck": app.store.deck(),
                }),
            );
        }
    }
    normalisasi(&mut baru);
    app.store.ganti(baru);
    /* Setelan mulai otomatis langsung berlaku tanpa membuka ulang aplikasi. */
    crate::app::autostart::selaraskan(app.store.deck().settings.mulai_otomatis);
    app.siar_state();
    ok_json(StatusCode::OK, json!({ "ok": true, "deck": app.store.deck() }))
}

async fn deck_pindah(State(app): State<Shared>, Json(body): Json<Value>) -> Response {
    let page_id = body.get("pageId").and_then(|v| v.as_str()).unwrap_or("");
    let dari = body.get("dari").and_then(|v| v.as_i64()).unwrap_or(-1);
    let ke = body.get("ke").and_then(|v| v.as_i64()).unwrap_or(-1);
    if dari < 0 || ke < 0 {
        return galat(StatusCode::BAD_REQUEST, "Permintaan tidak valid.");
    }
    if app.store.deck().settings.terkunci {
        return ok_json(
            StatusCode::LOCKED,
            json!({
                "ok": false, "code": "terkunci",
                "message": "Tata letak terkunci. Buka kunci dulu untuk menukar posisi.",
            }),
        );
    }
    let (dari, ke) = (dari as usize, ke as usize);
    let hasil = app.store.ubah(|deck| {
        let Some(h) = deck.pages.iter_mut().find(|h| h.id == page_id) else {
            return false;
        };
        if dari >= h.keys.len() || ke >= h.keys.len() {
            return false;
        }
        h.keys.swap(dari, ke);
        true
    });
    if !hasil {
        return galat(StatusCode::BAD_REQUEST, "Posisi tidak valid.");
    }
    app.siar_state();
    ok_json(StatusCode::OK, json!({ "ok": true, "deck": app.store.deck() }))
}

async fn deck_export(State(app): State<Shared>) -> Response {
    let isi = serde_json::to_string_pretty(&app.store.deck()).unwrap_or_default();
    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/json; charset=utf-8"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"kumideck-deck.json\"",
            ),
        ],
        isi,
    )
        .into_response()
}

async fn deck_import(State(app): State<Shared>, Json(body): Json<Value>) -> Response {
    let nilai = body.get("deck").cloned().unwrap_or(body);
    let Ok(mut baru) = serde_json::from_value::<Deck>(nilai) else {
        return galat(StatusCode::BAD_REQUEST, "Berkas deck tidak valid.");
    };
    normalisasi(&mut baru);
    app.store.ganti(baru);
    app.siar_state();
    ok_json(StatusCode::OK, json!({ "ok": true, "deck": app.store.deck() }))
}

async fn cadangan(State(app): State<Shared>) -> Response {
    let mut daftar = Vec::new();
    if let Ok(baca) = std::fs::read_dir(app.paths.cadangan()) {
        for e in baca.flatten() {
            let nama = e.file_name().to_string_lossy().to_string();
            if !nama.starts_with("deck-") || !nama.ends_with(".json") {
                continue;
            }
            let meta = e.metadata().ok();
            daftar.push(json!({
                "nama": nama,
                "waktu": meta.as_ref().and_then(|m| m.modified().ok())
                    .and_then(|w| w.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as i64).unwrap_or(0),
                "ukuran": meta.map(|m| m.len()).unwrap_or(0),
            }));
        }
    }
    daftar.sort_by(|a, b| {
        b["nama"].as_str().unwrap_or("").cmp(a["nama"].as_str().unwrap_or(""))
    });
    ok_json(StatusCode::OK, json!({ "ok": true, "cadangan": daftar }))
}

async fn cadangan_pulihkan(State(app): State<Shared>, Json(body): Json<Value>) -> Response {
    let nama = body.get("nama").and_then(|v| v.as_str()).unwrap_or("");
    if nama.is_empty()
        || !nama.starts_with("deck-")
        || !nama.ends_with(".json")
        || nama.contains('/')
        || nama.contains('\\')
    {
        return galat(StatusCode::BAD_REQUEST, "Nama cadangan tidak valid.");
    }
    let Ok(teks) = std::fs::read_to_string(app.paths.cadangan().join(nama)) else {
        return galat(StatusCode::NOT_FOUND, "Cadangan tidak ditemukan.");
    };
    let Ok(mut deck) = serde_json::from_str::<Deck>(&teks) else {
        return galat(StatusCode::UNPROCESSABLE_ENTITY, "Cadangan tidak dapat dibaca.");
    };
    normalisasi(&mut deck);
    app.store.ganti(deck);
    app.siar_state();
    ok_json(StatusCode::OK, json!({ "ok": true, "deck": app.store.deck() }))
}

/* --------------------------------------- arsip zip semua data (2.4.0) ---- */

/// Nama entri arsip harus relatif dan tidak boleh keluar dari folder data.
fn nama_aman(nama: &str) -> Option<&str> {
    let nama = nama.trim_start_matches('/');
    if nama.is_empty() || nama.contains("..") || nama.contains('\\') || nama.contains(':') {
        return None;
    }
    Some(nama)
}

fn zip_tulis(z: &mut zip::ZipWriter<std::io::Cursor<Vec<u8>>>, nama: &str, isi: &[u8]) {
    use std::io::Write;
    let opsi = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);
    if z.start_file(nama, opsi).is_ok() {
        let _ = z.write_all(isi);
    }
}

/// `GET /api/cadangan/arsip?isi=papan,ikon,suara`
async fn cadangan_arsip(
    State(app): State<Shared>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let diminta: Vec<String> = q
        .get("isi")
        .map(|s| {
            s.split(',')
                .map(|x| x.trim().to_lowercase())
                .filter(|x| !x.is_empty())
                .collect()
        })
        .unwrap_or_else(|| vec!["papan".into(), "ikon".into(), "suara".into()]);
    let mau = |k: &str| diminta.is_empty() || diminta.iter().any(|x| x == k);

    let mut z = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));

    if mau("papan") {
        let teks = serde_json::to_string_pretty(&app.store.deck()).unwrap_or_default();
        zip_tulis(&mut z, "deck.json", teks.as_bytes());
    }
    if mau("ikon") {
        if let Ok(baca) = std::fs::read_dir(app.paths.ikon()) {
            for e in baca.flatten() {
                if !e.path().is_file() {
                    continue;
                }
                let nama = e.file_name().to_string_lossy().to_string();
                if let Ok(isi) = std::fs::read(e.path()) {
                    zip_tulis(&mut z, &format!("ikon/{nama}"), &isi);
                }
            }
        }
    }
    if mau("suara") {
        if let Ok(baca) = std::fs::read_dir(app.paths.suara()) {
            for e in baca.flatten() {
                if !e.path().is_file() {
                    continue;
                }
                let nama = e.file_name().to_string_lossy().to_string();
                if let Ok(isi) = std::fs::read(e.path()) {
                    zip_tulis(&mut z, &format!("suara/{nama}"), &isi);
                }
            }
        }
    }

    let Ok(cursor) = z.finish() else {
        return galat(StatusCode::INTERNAL_SERVER_ERROR, "Arsip gagal disusun.");
    };
    let berkas = format!("kumideck-cadangan-{}.zip", crate::core::waktu::cap());
    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/zip".to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{berkas}\""),
            ),
        ],
        cursor.into_inner(),
    )
        .into_response()
}

/// `POST /api/cadangan/arsip` — isi badan: bytes zip.
async fn cadangan_pulihkan_arsip(State(app): State<Shared>, badan: axum::body::Bytes) -> Response {
    if badan.len() < 22 {
        return galat(StatusCode::BAD_REQUEST, "Arsip kosong atau rusak.");
    }
    let Ok(mut arsip) = zip::ZipArchive::new(std::io::Cursor::new(badan.to_vec())) else {
        return galat(StatusCode::BAD_REQUEST, "Berkas ini bukan arsip zip.");
    };

    let mut deck: Option<Deck> = None;
    let mut ikon = 0usize;
    let mut suara = 0usize;

    for i in 0..arsip.len() {
        let Ok(mut entri) = arsip.by_index(i) else {
            continue;
        };
        if entri.is_dir() {
            continue;
        }
        let Some(nama) = nama_aman(entri.name()).map(str::to_string) else {
            continue;
        };

        if nama == "deck.json" {
            let mut teks = String::new();
            if std::io::Read::read_to_string(&mut entri, &mut teks).is_ok() {
                deck = serde_json::from_str::<Deck>(&teks).ok();
            }
            continue;
        }
        let (folder, sisa) = if let Some(s) = nama.strip_prefix("ikon/") {
            (app.paths.ikon(), s)
        } else if let Some(s) = nama.strip_prefix("suara/") {
            (app.paths.suara(), s)
        } else {
            continue;
        };
        let Some(sisa) = nama_aman(sisa) else {
            continue;
        };
        if sisa.contains('/') {
            continue;
        }
        let Ok(mut berkas) = std::fs::File::create(folder.join(sisa)) else {
            continue;
        };
        if std::io::copy(&mut entri, &mut berkas).is_ok() {
            if nama.starts_with("ikon/") {
                ikon += 1;
            } else {
                suara += 1;
            }
        }
    }

    let Some(mut baru) = deck else {
        return galat(
            StatusCode::UNPROCESSABLE_ENTITY,
            "Arsip tidak berisi deck.json yang bisa dibaca.",
        );
    };
    normalisasi(&mut baru);
    app.store.ganti(baru);
    app.siar_state();
    ok_json(
        StatusCode::OK,
        json!({ "ok": true, "deck": app.store.deck(), "ikon": ikon, "suara": suara }),
    )
}

/// `/api/otomatis` di 2.3.0 adalah mulai otomatis Windows, bukan aturan profil.
async fn otomatis_get(State(app): State<Shared>) -> Response {
    ok_json(
        StatusCode::OK,
        json!({
            "ok": true,
            "aktif": crate::app::autostart::aktif(),
            "tercatat": app.store.deck().settings.mulai_otomatis,
            "tray": false,
        }),
    )
}

async fn otomatis_post(State(app): State<Shared>, Json(body): Json<Value>) -> Response {
    let Some(aktif) = body.get("aktif").and_then(|v| v.as_bool()) else {
        return galat(StatusCode::BAD_REQUEST, "Permintaan tidak valid.");
    };
    match crate::app::autostart::terapkan(aktif) {
        Ok(nyala) => {
            app.store
                .ubah(|deck| deck.settings.mulai_otomatis = nyala);
            app.siar_state();
            ok_json(StatusCode::OK, json!({ "ok": true, "aktif": nyala }))
        }
        Err(e) => ok_json(
            StatusCode::INTERNAL_SERVER_ERROR,
            json!({ "ok": false, "aktif": false, "message": e }),
        ),
    }
}

/* -------------------------------------------------------------------- ikon --- */

async fn icons(State(app): State<Shared>) -> Response {
    ok_json(StatusCode::OK, json!({ "ok": true, "ikon": daftar_ikon(&app) }))
}

fn daftar_ikon(app: &App) -> Vec<Value> {
    let mut daftar = Vec::new();
    let Ok(baca) = std::fs::read_dir(app.paths.ikon()) else {
        return daftar;
    };
    for e in baca.flatten() {
        let nama = e.file_name().to_string_lossy().to_string();
        let Some((id, ext)) = nama.rsplit_once('.') else {
            continue;
        };
        let ext = ext.to_ascii_lowercase();
        if !id.starts_with("kst_") || !matches!(ext.as_str(), "svg" | "png" | "webp") {
            continue;
        }
        let tipe = match ext.as_str() {
            "svg" => "image/svg+xml",
            "webp" => "image/webp",
            _ => "image/png",
        };
        let ukuran = e.metadata().map(|m| m.len()).unwrap_or(0);
        daftar.push(json!({
            "id": id,
            "url": format!("/ikon/{id}"),
            "tipe": tipe,
            "ukuran": ukuran,
        }));
    }
    daftar.sort_by(|a, b| {
        a["id"]
            .as_str()
            .unwrap_or("")
            .cmp(b["id"].as_str().unwrap_or(""))
    });
    daftar
}

async fn icons_post(State(app): State<Shared>, Json(body): Json<Value>) -> Response {
    let data_url = body.get("dataUrl").and_then(|v| v.as_str()).unwrap_or("");
    let Some((tipe, isi64)) = data_url
        .strip_prefix("data:")
        .and_then(|s| s.split_once(";base64,"))
    else {
        return galat(StatusCode::BAD_REQUEST, "Pilih berkas SVG, PNG, atau WebP.");
    };
    let tipe = tipe.to_ascii_lowercase();
    let ext = match tipe.as_str() {
        "image/svg+xml" => "svg",
        "image/webp" => "webp",
        "image/png" => "png",
        _ => return galat(StatusCode::BAD_REQUEST, "Pilih berkas SVG, PNG, atau WebP."),
    };
    let Some(isi) = crate::soundboard::dasar64(isi64) else {
        return galat(StatusCode::BAD_REQUEST, "Berkas ikon tidak valid.");
    };
    if isi.is_empty() {
        return galat(StatusCode::BAD_REQUEST, "Berkas ikon kosong.");
    }
    if isi.len() > 256 * 1024 {
        return galat(StatusCode::PAYLOAD_TOO_LARGE, "Ikon maksimal 256 KB.");
    }
    let _ = std::fs::create_dir_all(app.paths.ikon());
    let akhiran: String = uuid::Uuid::new_v4().simple().to_string().chars().take(8).collect();
    let id = format!("kst_{akhiran}");
    let tujuan = app.paths.ikon().join(format!("{id}.{ext}"));
    if std::fs::write(&tujuan, &isi).is_err() {
        return galat(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Ikon tidak dapat disimpan.",
        );
    }
    ok_json(
        StatusCode::OK,
        json!({ "ok": true, "id": id, "ikon": daftar_ikon(&app) }),
    )
}

async fn apps(State(app): State<Shared>, q: Query<HashMap<String, String>>) -> Response {
    let _ = &app;
    let ulang = q.get("ulang").map(|v| v == "1" || v == "true").unwrap_or(false);
    match tokio::task::spawn_blocking(move || crate::apps::scanner::daftar(ulang)).await {
        Ok((daftar, diambil, galat)) => ok_json(
            StatusCode::OK,
            json!({ "ok": true, "aplikasi": daftar, "diambil": diambil, "galat": galat }),
        ),
        Err(e) => ok_json(
            StatusCode::INTERNAL_SERVER_ERROR,
            json!({
                "ok": false,
                "aplikasi": [],
                "galat": format!("Daftar aplikasi tidak dapat dibaca: {e}"),
            }),
        ),
    }
}

/* ------------------------------------------------------------------ monitor --- */

async fn monitor(State(app): State<Shared>) -> Response {
    let m = app.monitor.lock().unwrap().clone();
    ok_json(StatusCode::OK, json!({ "ok": true, "monitor": m }))
}

async fn ports(State(app): State<Shared>) -> Response {
    let _ = &app;
    match tokio::task::spawn_blocking(crate::monitor::ports::daftar).await {
        Ok(daftar) => ok_json(StatusCode::OK, json!({ "ok": true, "daftar": daftar })),
        Err(e) => galat(StatusCode::INTERNAL_SERVER_ERROR, &format!("Daftar port gagal dibaca: {e}")),
    }
}

async fn proc_end(Json(body): Json<Value>) -> Response {
    let pid = body.get("pid").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    match tokio::task::spawn_blocking(move || crate::monitor::ports::akhiri(pid)).await {
        Ok(Ok(())) => ok_json(StatusCode::OK, json!({ "ok": true, "message": "Proses diakhiri." })),
        Ok(Err(pesan)) => ok_json(StatusCode::OK, json!({ "ok": false, "message": pesan })),
        Err(e) => galat(StatusCode::INTERNAL_SERVER_ERROR, &format!("Gagal: {e}")),
    }
}

/* ------------------------------------------------------------------- audio --- */

async fn audio_status() -> Response {
    ok_json(StatusCode::OK, crate::soundboard::status())
}

async fn audio_unduhan(State(app): State<Shared>) -> Response {
    let daftar = app.store.deck().soundboard;
    ok_json(
        StatusCode::OK,
        crate::soundboard::status_unduhan(&app.paths, &daftar),
    )
}

async fn audio_mainkan(State(app): State<Shared>, Json(body): Json<Value>) -> Response {
    let id = body.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let deck = app.store.deck();
    let item = deck.soundboard.iter().find(|s| s.id == id);
    let sumber = match item {
        Some(s) => s.sumber.clone(),
        None => body
            .get("sumber")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string(),
    };
    if sumber.is_empty() {
        return galat(StatusCode::BAD_REQUEST, "Pilih suara atau isi sumber suara.");
    }
    let volume_item = item.map(|s| s.volume).unwrap_or(100).clamp(0, 100);
    /* Slider di halaman Soundboard adalah pengali master untuk pemutaran cepat:
       hasilnya tidak pernah melebihi volume yang disetel per suara, jadi nilai
       kecil yang disengaja tidak bisa terdengar lebih keras dari setelannya. */
    let volume_master = body
        .get("volume")
        .and_then(|v| v.as_i64())
        .unwrap_or(100)
        .clamp(0, 100);
    let volume = if item.is_some() {
        (volume_item * volume_master + 50) / 100
    } else {
        volume_master
    };
    let hasil = crate::soundboard::mainkan(app.paths.clone(), &sumber, volume).await;
    let ok = hasil.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
    ok_json(
        if ok {
            StatusCode::OK
        } else {
            StatusCode::BAD_GATEWAY
        },
        hasil,
    )
}

async fn audio_hentikan() -> Response {
    ok_json(StatusCode::OK, crate::soundboard::hentikan())
}

async fn suara_unggah(State(app): State<Shared>, Json(body): Json<Value>) -> Response {
    let data_url = body.get("dataUrl").and_then(|v| v.as_str()).unwrap_or("");
    match crate::soundboard::unggah(&app.paths, data_url) {
        Ok(sumber) => ok_json(StatusCode::OK, json!({ "ok": true, "sumber": sumber })),
        Err(pesan) => galat(StatusCode::BAD_REQUEST, &pesan),
    }
}

async fn soundboard_simpan(State(app): State<Shared>, Json(body): Json<Value>) -> Response {
    if app.store.deck().settings.terkunci {
        return ok_json(
            StatusCode::LOCKED,
            json!({
                "ok": false,
                "code": "terkunci",
                "message": "Tata letak terkunci. Buka kunci dulu untuk mengubah soundboard.",
            }),
        );
    }
    let nilai = body.get("item").cloned().unwrap_or(Value::Null);
    let Some(item) = crate::soundboard::normal_item(&nilai) else {
        return galat(
            StatusCode::BAD_REQUEST,
            "Sumber suara tidak sah. Gunakan jalur berkas lokal atau tautan http(s).",
        );
    };

    let lama_terkunci = app.store.deck();
    let posisi = lama_terkunci.soundboard.iter().position(|s| s.id == item.id);
    if posisi.is_none() && lama_terkunci.soundboard.len() >= crate::soundboard::maks_suara() {
        return galat(StatusCode::BAD_REQUEST, "Soundboard maksimal 40 suara.");
    }
    let hasil = app.store.ubah(|deck| {
        match deck.soundboard.iter().position(|s| s.id == item.id) {
            Some(i) => deck.soundboard[i] = item.clone(),
            None => deck.soundboard.push(item.clone()),
        }
        deck.soundboard.clone()
    });

    crate::soundboard::unduh_latar(app.paths.clone(), item.sumber.clone());
    app.siar_state();
    ok_json(
        StatusCode::OK,
        json!({ "ok": true, "soundboard": hasil, "item": item }),
    )
}

async fn soundboard_hapus(State(app): State<Shared>, Json(body): Json<Value>) -> Response {
    if app.store.deck().settings.terkunci {
        return ok_json(
            StatusCode::LOCKED,
            json!({ "ok": false, "code": "terkunci", "message": "Tata letak terkunci." }),
        );
    }
    let id = body.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let dihapus = app.store.deck().soundboard.iter().find(|s| s.id == id).cloned();
    let hasil = app.store.ubah(|deck| {
        deck.soundboard.retain(|s| s.id != id);
        deck.soundboard.clone()
    });
    if let Some(s) = dihapus {
        crate::soundboard::lupakan(&app.paths, &s.sumber);
    }
    app.siar_state();
    ok_json(StatusCode::OK, json!({ "ok": true, "soundboard": hasil }))
}

/* --------------------------------------------------------------------- log --- */
async fn log_unduh(State(app): State<Shared>) -> Response {
    let isi = std::fs::read_to_string(app.paths.log_berkas()).unwrap_or_default();
    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "text/plain; charset=utf-8"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"kumideck.log\"",
            ),
        ],
        isi,
    )
        .into_response()
}
