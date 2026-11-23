//! Log ringkas ke `data/kumideck.log` dan stderr.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::OnceLock;

static BERKAS: OnceLock<PathBuf> = OnceLock::new();

pub fn init(berkas: PathBuf) {
    let _ = BERKAS.set(berkas);
}

fn tulis(tanda: &str, pesan: &str) {
    let baris = format!("{tanda} {pesan}");
    // Exe rilis tidak punya konsol, jadi stderr bisa tidak ada. Tulis tanpa
    // peduli hasilnya supaya log tidak pernah membuat proses berhenti.
    let _ = writeln!(std::io::stderr(), "{baris}");
    if let Some(b) = BERKAS.get() {
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(b) {
            let _ = writeln!(f, "{baris}");
        }
    }
}

pub fn info(pesan: &str) {
    tulis("[info]", pesan);
}

pub fn warn(pesan: &str) {
    tulis("[warn]", pesan);
}

pub fn error(pesan: &str) {
    tulis("[galat]", pesan);
}

/// Panik di thread mana pun dicatat ke log sebelum proses mati. Tanpa ini exe
/// rilis (tanpa konsol) hilang begitu saja tanpa jejak.
pub fn pasang_penangkap_panik() {
    std::panic::set_hook(Box::new(|info| {
        let lokasi = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "?".to_string());
        let pesan = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "panik tanpa pesan".to_string());
        tulis("[panik]", &format!("{pesan} ({lokasi})"));
    }));
}

#[cfg(test)]
mod uji {
    use super::*;

    #[test]
    fn panik_tertulis_ke_log() {
        let berkas = std::env::temp_dir().join(format!(
            "kd-uji-panik-{}.log",
            uuid::Uuid::new_v4().simple()
        ));
        init(berkas.clone());
        pasang_penangkap_panik();

        let hasil = std::panic::catch_unwind(|| panic!("uji panik sengaja"));
        assert!(hasil.is_err());

        let isi = std::fs::read_to_string(&berkas).unwrap_or_default();
        assert!(isi.contains("[panik] uji panik sengaja"), "isi log: {isi}");
        let _ = std::fs::remove_file(&berkas);
    }
}
