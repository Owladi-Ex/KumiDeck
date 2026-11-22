//! Materi TLS lokal untuk HTTPS port 4174.
//!
//! Dua jalur, keduanya disengaja:
//!   1. `data/tls/kumideck.pfx` dari 2.3.0 (kata sandi `kumideck`) dipakai lewat
//!      SChannel (`native-tls`) apa adanya, supaya ponsel yang sudah memasang
//!      sertifikat 2.3.0 tetap percaya tanpa memasang ulang. SChannel hanya mau
//!      kunci RSA, dan membaca PFX tanpa mengubah format adalah satu-satunya cara
//!      menjamin sidik jari sertifikatnya sama.
//!   2. Kalau belum ada PFX, sertifikat baru dibuat dengan `rcgen` (ECDSA) dan
//!      disajikan lewat `rustls`. Berkas `kumideck.cer` (DER) dipakai Android.

use std::path::Path;
use std::sync::Arc;

use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};

use crate::core::paths::Paths;

pub enum Materi {
    /// Sertifikat 2.3.0 apa adanya, dibaca SChannel.
    Pfx(native_tls::Identity),
    /// Sertifikat buatan 2.4.0, disajikan rustls.
    Baru(Arc<rustls::ServerConfig>),
}

pub struct Siap {
    pub materi: Materi,
    /// Sertifikat DER untuk `/sertifikat.cer`.
    pub cer: Vec<u8>,
}

fn baca(path: &Path) -> Option<Vec<u8>> {
    std::fs::read(path).ok().filter(|b| !b.is_empty())
}

fn konfigurasi_rustls(der: Vec<u8>, kunci: Vec<u8>) -> Option<Arc<rustls::ServerConfig>> {
    // rustls 0.23 butuh penyedia kripto dipilih sekali per proses.
    let _ = rustls::crypto::ring::default_provider().install_default();
    let sertifikat = CertificateDer::from(der);
    let kunci = PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(kunci));
    rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(vec![sertifikat], kunci)
        .ok()
        .map(Arc::new)
}

/// Siapkan materi TLS. `None` berarti HTTPS tidak bisa dinyalakan; server HTTP
/// tetap jalan seperti biasa.
pub fn siapkan(paths: &Paths) -> Option<Siap> {
    let dir = paths.tls();
    let _ = std::fs::create_dir_all(&dir);
    let berkas_cer = dir.join("kumideck.cer");

    let pfx = dir.join("kumideck.pfx");
    if let Some(isi) = baca(&pfx) {
        if let Ok(identitas) = native_tls::Identity::from_pkcs12(&isi, "kumideck") {
            crate::core::log::info("tls: memakai kumideck.pfx dari 2.3.0");
            return Some(Siap {
                materi: Materi::Pfx(identitas),
                cer: baca(&berkas_cer).unwrap_or_default(),
            });
        }
        crate::core::log::warn("tls: kumideck.pfx ada tapi tidak bisa dibaca; membuat baru");
    }

    let berkas_kunci = dir.join("kumideck-key.der");
    if let (Some(der), Some(kunci)) = (baca(&berkas_cer), baca(&berkas_kunci)) {
        if let Some(cfg) = konfigurasi_rustls(der.clone(), kunci) {
            crate::core::log::info("tls: memakai sertifikat lokal yang sudah ada");
            return Some(Siap {
                materi: Materi::Baru(cfg),
                cer: der,
            });
        }
        crate::core::log::warn("tls: sertifikat lokal rusak; membuat sertifikat baru");
    }

    let nama = vec![
        "localhost".to_string(),
        "127.0.0.1".to_string(),
        crate::server::state::lan_ip(),
        "kumideck.local".to_string(),
    ];
    let buatan = match rcgen::generate_simple_self_signed(nama) {
        Ok(v) => v,
        Err(e) => {
            crate::core::log::error(&format!("tls: sertifikat lokal gagal dibuat: {e}"));
            return None;
        }
    };
    let der = buatan.cert.der().to_vec();
    let kunci = buatan.key_pair.serialize_der();

    let _ = std::fs::write(&berkas_cer, &der);
    let _ = std::fs::write(&berkas_kunci, &kunci);

    match konfigurasi_rustls(der.clone(), kunci) {
        Some(cfg) => {
            crate::core::log::info("tls: sertifikat lokal baru dibuat");
            Some(Siap {
                materi: Materi::Baru(cfg),
                cer: der,
            })
        }
        None => {
            crate::core::log::error("tls: konfigurasi rustls gagal disusun");
            None
        }
    }
}
