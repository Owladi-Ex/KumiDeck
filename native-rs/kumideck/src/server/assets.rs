//! Menyajikan `public/` yang ditanam di exe, plus ikon pengguna dari `data/ikon`.

use axum::body::Body;
use axum::extract::State;
use axum::http::{header, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use include_dir::{include_dir, Dir};
use std::sync::Arc;

use super::state::App;

static PUBLIK: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../../public");

/* Saat pengembangan, berkas dibaca dari folder `public/` supaya suntingan UI
   langsung terlihat tanpa membangun ulang. Rilis tetap memakai berkas tertanam. */
fn isi(jalur: &str) -> Option<Vec<u8>> {
    if cfg!(debug_assertions) {
        let akar = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../public");
        let berkas = akar.join(jalur);
        if berkas.is_file() {
            if let Ok(data) = std::fs::read(&berkas) {
                return Some(data);
            }
        }
    }
    PUBLIK.get_file(jalur).map(|f| f.contents().to_vec())
}

pub async fn fallback(State(app): State<Arc<App>>, uri: Uri) -> Response {
    let jalur = uri.path().trim_start_matches('/');

    if let Some(id) = jalur.strip_prefix("ikon/") {
        return ikon_pengguna(&app, id);
    }

    let jalur = match jalur {
        "" | "index.html" => "index.html",
        "remote" | "remote.html" => "remote.html",
        lain => lain,
    };

    let Some(data) = isi(jalur) else {
        return (StatusCode::NOT_FOUND, "Berkas tidak ditemukan.").into_response();
    };

    let tipe = mime(jalur);
    /* Berkas ikut ke dalam exe dan dilayani dari komputer ini, jadi tidak ada
       untungnya menyimpan salinan lama: setiap versi baru harus langsung
       terpakai di WebView2 maupun ponsel yang sudah memasang PWA. HTML dan
       service worker tidak disimpan sama sekali; berkas lain divalidasi ulang. */
    let singgah = if jalur.ends_with(".html") || jalur.ends_with("sw.js") {
        "no-store"
    } else {
        "no-cache"
    };

    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, tipe),
            (header::CACHE_CONTROL, singgah),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        ],
        Body::from(data),
    )
        .into_response()
}

fn ikon_pengguna(app: &App, id: &str) -> Response {
    // Tolak jalur keluar folder.
    if id.contains("..") || id.contains('/') || id.contains('\\') {
        return (StatusCode::BAD_REQUEST, "Nama ikon tidak valid.").into_response();
    }
    let jalur = app.paths.ikon().join(id);
    let jalur = if jalur.extension().is_some() {
        jalur
    } else {
        /* Daftar ikon memberi id tanpa ekstensi; server mencari berkasnya. */
        ["svg", "png", "webp"]
            .iter()
            .map(|e| jalur.with_extension(e))
            .find(|p| p.is_file())
            .unwrap_or(jalur)
    };
    let Ok(isi) = std::fs::read(&jalur) else {
        return (StatusCode::NOT_FOUND, "Ikon tidak ditemukan.").into_response();
    };
    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, mime(id)),
            (header::CACHE_CONTROL, "public, max-age=86400"),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        ],
        Body::from(isi),
    )
        .into_response()
}

fn mime(jalur: &str) -> &'static str {
    let ext = jalur.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "webmanifest" => "application/manifest+json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "webp" => "image/webp",
        "jpg" | "jpeg" => "image/jpeg",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}
