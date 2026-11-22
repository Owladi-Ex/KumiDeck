//! KumiDeck 2.4.0 — inti Rust + WebView2.

// Rilis berjalan sebagai aplikasi jendela: tidak ada konsol yang ikut terbuka.
// Build debug tetap memakai konsol supaya log gampang dibaca saat mengembangkan.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod actions;
mod app;
mod apps;
mod core;
mod data;
mod media;
mod monitor;
mod server;
mod soundboard;

use std::sync::Arc;

use windows::core::w;
use windows::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
use windows::Win32::System::Threading::CreateMutexW;

use core::paths::Paths;
use data::store::Store;
use server::state::App;

fn main() {
    // Satu proses saja. Instance kedua langsung keluar.
    unsafe {
        let _ = CreateMutexW(None, false, w!("KumiDeck.Instance"));
        if GetLastError() == ERROR_ALREADY_EXISTS {
            return;
        }
    }

    let paths = Paths::init();
    core::log::init(paths.log_berkas());
    core::log::info("KumiDeck 2.4.0 mulai");

    let store = Store::open(paths);
    // Mulai otomatis diselaraskan dengan setelan tersimpan (bukan setelan baru).
    app::autostart::selaraskan(store.deck().settings.mulai_otomatis);
    let (listener_std, port) = match server::dengar() {
        Ok(v) => v,
        Err(e) => {
            core::log::error(&format!("server tidak bisa mendengar: {e}"));
            return;
        }
    };

    // HTTPS 4174 hanya menyala bila setelan mengizinkannya dan sertifikat siap.
    let ingin_https = store.deck().settings.https;
    let tls = if ingin_https {
        match server::tls::siapkan(&store.paths) {
            Some(siap) => match server::dengar_dari(port + 1) {
                Ok((l, p)) => Some((l, p, siap)),
                Err(e) => {
                    core::log::warn(&format!("https: port tidak tersedia: {e}"));
                    None
                }
            },
            None => None,
        }
    } else {
        None
    };
    let https_port = tls.as_ref().map(|(_, p, _)| *p).unwrap_or(0);

    let app = App::new(store, port, https_port);
    if let Some((_, _, siap)) = &tls {
        *app.cer.lock().unwrap() = siap.cer.clone();
    }

    /* Profil otomatis berjalan di thread sendiri; tidak memblokir server. */
    {
        let app_profil = Arc::clone(&app);
        std::thread::spawn(move || app::profil::pantau(app_profil));
    }

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("runtime tokio gagal dibuat");

    let listener = listener_std;

    let app_server = Arc::clone(&app);
    runtime.spawn(async move {
        match tokio::net::TcpListener::from_std(listener) {
            Ok(l) => {
                server::serve(app_server, l).await;
            }
            Err(e) => core::log::error(&format!("listener gagal: {e}")),
        }
    });

    if let Some((l, p, siap)) = tls {
        let app_https = Arc::clone(&app);
        runtime.spawn(async move {
            if let Err(e) = server::serve_https(app_https, l, siap.materi).await {
                core::log::error(&format!("https gagal: {e}"));
            }
        });
        core::log::info(&format!("https://127.0.0.1:{p}/"));
    }

    core::log::info(&format!(
        "server http://127.0.0.1:{port}/  ({} data: {})",
        if app.store.paths.portabel {
            "portabel"
        } else {
            "lokal"
        },
        app.store.paths.data.display()
    ));

    // Jendela memakai thread utama; runtime tetap hidup sampai proses berakhir.
    let _runtime = runtime;
    app::window::jalankan(app);
}
