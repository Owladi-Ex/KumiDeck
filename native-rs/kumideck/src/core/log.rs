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
    eprintln!("{baris}");
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
