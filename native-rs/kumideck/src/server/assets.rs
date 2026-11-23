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
   langsung terlihat tanpa membangun ulang. Rilis tetap memakai berkas tertanam.
   Build rilis bisa memakai folder yang sama lewat KUMIDECK_PUBLIK=<folder>. */
fn isi(jalur: &str) -> Option<Vec<u8>> {
    let dari_disk = |akar: &std::path::Path| -> Option<Vec<u8>> {
        if !jalur_aman(jalur) {
            return None;
        }
        let berkas = akar.join(jalur);
        if !berkas.is_file() {
            return None;
        }
        std::fs::read(&berkas).ok()
    };
    if cfg!(debug_assertions) {
        let akar = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../public");
        if let Some(data) = dari_disk(&akar) {
            return Some(data);
        }
    }
    if let Ok(akar) = std::env::var("KUMIDECK_PUBLIK") {
        if let Some(data) = dari_disk(std::path::Path::new(&akar)) {
            return Some(data);
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
       terpakai di WebView2 maupun ponsel yang sudah memasang PWA. HTML, kode,
       dan gaya tidak disimpan sama sekali; gambar dan font divalidasi ulang. */
    let singgah = if jalur.ends_with(".html")
        || jalur.ends_with(".js")
        || jalur.ends_with(".css")
        || jalur.ends_with(".webmanifest")
    {
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

fn jalur_aman(jalur: &str) -> bool {
    use std::path::Component;
    if jalur.is_empty() || jalur.contains(':') {
        return false;
    }
    std::path::Path::new(jalur).components().all(|c| {
        matches!(c, Component::Normal(_) | Component::CurDir)
    })
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

#[cfg(test)]
mod uji {
    use super::jalur_aman;

    #[test]
    fn jalur_relatif_diterima() {
        assert!(jalur_aman("index.html"));
        assert!(jalur_aman("assets/app.css"));
        assert!(jalur_aman("assets\\app.css"));
    }

    #[test]
    fn jalur_keluar_folder_ditolak() {
        assert!(!jalur_aman(""));
        assert!(!jalur_aman("../secret.json"));
        assert!(!jalur_aman("assets/../../secret.json"));
        assert!(!jalur_aman("C:/Windows/win.ini"));
        assert!(!jalur_aman("/etc/passwd"));
        assert!(!jalur_aman("\\\\server\\share\\x"));
    }
}
