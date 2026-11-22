pub mod assets;
pub mod router;
pub mod state;
pub mod tls;

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use axum::extract::ConnectInfo;
use tokio::net::TcpListener;

use state::App;

/// Jalankan server HTTP dan pengambil sampel monitor.
pub async fn serve(app: Arc<App>, listener: TcpListener) {
    let sampler = app.clone();
    let _ = std::thread::Builder::new()
        .name("monitor".into())
        .spawn(move || {
            let mut s = crate::monitor::metrics::Sampler::new();
            std::thread::sleep(Duration::from_secs(1));
            loop {
                let m = s.sample();
                *sampler.monitor.lock().unwrap() = m.clone();
                sampler.hub.siar("monitor", &m);
                std::thread::sleep(Duration::from_secs(3));
            }
        });

    crate::media::mulai(app.clone());

    let rute = router::router(app);
    let _ = axum::serve(
        listener,
        rute.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await;
}

/// Server HTTPS terpisah (port 4174). Dua jalur transport mengikuti asal
/// sertifikat: PFX 2.3.0 lewat SChannel, sertifikat buatan sendiri lewat rustls.
pub async fn serve_https(
    app: Arc<App>,
    listener: std::net::TcpListener,
    materi: tls::Materi,
) -> std::io::Result<()> {
    crate::media::mulai(app.clone());
    let listener = TcpListener::from_std(listener)?;
    let rute = router::router(app);

    match materi {
        tls::Materi::Pfx(identitas) => {
            let acceptor = tokio_native_tls::TlsAcceptor::from(
                native_tls::TlsAcceptor::new(identitas)
                    .map_err(|e| std::io::Error::other(format!("tls: {e}")))?,
            );
            loop {
                let (aliran, peer) = terima(&listener).await?;
                let acceptor = acceptor.clone();
                let svc = rute.clone().layer(axum::middleware::from_fn(
                    move |mut req: axum::extract::Request, next: axum::middleware::Next| async move {
                        req.extensions_mut().insert(ConnectInfo(peer));
                        next.run(req).await
                    },
                ));
                tokio::spawn(async move {
                    let Ok(tls) = acceptor.accept(aliran).await else {
                        return;
                    };
                    let svc = hyper_util::service::TowerToHyperService::new(svc);
                    let _ = hyper_util::server::conn::auto::Builder::new(
                        hyper_util::rt::TokioExecutor::new(),
                    )
                    .serve_connection_with_upgrades(hyper_util::rt::TokioIo::new(tls), svc)
                    .await;
                });
            }
        }
        tls::Materi::Baru(cfg) => {
            let acceptor = tokio_rustls::TlsAcceptor::from(cfg);
            loop {
                let (aliran, peer) = terima(&listener).await?;
                let acceptor = acceptor.clone();
                let svc = rute.clone().layer(axum::middleware::from_fn(
                    move |mut req: axum::extract::Request, next: axum::middleware::Next| async move {
                        req.extensions_mut().insert(ConnectInfo(peer));
                        next.run(req).await
                    },
                ));
                tokio::spawn(async move {
                    let Ok(tls) = acceptor.accept(aliran).await else {
                        return;
                    };
                    let svc = hyper_util::service::TowerToHyperService::new(svc);
                    let _ = hyper_util::server::conn::auto::Builder::new(
                        hyper_util::rt::TokioExecutor::new(),
                    )
                    .serve_connection_with_upgrades(hyper_util::rt::TokioIo::new(tls), svc)
                    .await;
                });
            }
        }
    }
}

async fn terima(listener: &TcpListener) -> std::io::Result<(tokio::net::TcpStream, SocketAddr)> {
    loop {
        match listener.accept().await {
            Ok(v) => return Ok(v),
            Err(e) => {
                crate::core::log::warn(&format!("tls: koneksi gagal diterima: {e}"));
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
        }
    }
}

/// Cari port kosong mulai dari 4173. HTTPS memakai port berikutnya.
pub fn dengar() -> std::io::Result<(std::net::TcpListener, u16)> {
    dengar_dari(4173)
}

pub fn dengar_dari(awal: u16) -> std::io::Result<(std::net::TcpListener, u16)> {
    let terakhir = std::io::Error::new(std::io::ErrorKind::AddrInUse, "semua port terpakai");
    for port in awal..awal.saturating_add(17) {
        match std::net::TcpListener::bind(("0.0.0.0", port)) {
            Ok(l) => {
                l.set_nonblocking(true)?;
                return Ok((l, port));
            }
            Err(_) => continue,
        }
    }
    Err(terakhir)
}
