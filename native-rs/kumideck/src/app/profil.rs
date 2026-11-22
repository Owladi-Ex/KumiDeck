//! Profil otomatis 2.3.0: halaman papan pindah sendiri mengikuti jendela depan.
//! Aturan tersimpan di `deck.otomatis`; tidak ada endpoint baru.

use std::sync::Arc;
use std::time::Duration;

use serde_json::json;

use crate::server::state::App;

/// Jeda pemeriksaan. Cukup rapat supaya terasa langsung, cukup longgar supaya
/// tidak membebani CPU saat jendela tidak berganti.
const JEDA_MS: u64 = 1200;

pub fn pantau(app: Arc<App>) {
    let mut terakhir = String::new();
    loop {
        std::thread::sleep(Duration::from_millis(JEDA_MS));

        let deck = app.store.deck();
        if !deck.settings.auto_profile || deck.otomatis.is_empty() {
            terakhir.clear();
            continue;
        }

        let (proses, judul, ada) = crate::actions::keys::jendela_aktif();
        if !ada {
            continue;
        }

        let judul_kecil = judul.to_lowercase();
        let cocok = deck.otomatis.iter().find(|r| {
            r.aktif
                && !r.page_id.trim().is_empty()
                && (r.proses.trim().is_empty()
                    || r.proses.trim().eq_ignore_ascii_case(proses.trim()))
                && (r.jendela.trim().is_empty() || judul_kecil.contains(&r.jendela.to_lowercase()))
        });
        let Some(aturan) = cocok else {
            continue;
        };
        if terakhir == aturan.page_id {
            continue;
        }
        if !deck.pages.iter().any(|p| p.id == aturan.page_id) {
            continue;
        }

        terakhir = aturan.page_id.clone();
        let alasan = if proses.trim().is_empty() {
            judul.clone()
        } else {
            proses.clone()
        };
        app.hub.siar(
            "profil",
            &json!({
                "pageId": aturan.page_id,
                "alasan": alasan,
                "otomatis": true,
            }),
        );
        crate::core::log::info(&format!("profil otomatis: {} ({})", aturan.page_id, alasan));
    }
}
