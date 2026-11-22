//! Baca/tulis `data/deck.json` dan `data/secret.json`.
//! Tulis atomik: `.tmp` lalu rename. Cadangan 10 versi terakhir di `data/cadangan`.

use std::fs;
use std::io::Write;
use std::sync::{Arc, Mutex};

use serde_json::json;

use super::models::{Aksi, Deck, Halaman, Langkah, Profil, Setelan, Tombol, Widget};
use crate::core::paths::Paths;

pub struct Store {
    pub paths: Paths,
    pub token: String,
    deck: Mutex<Deck>,
}

impl Store {
    pub fn open(paths: Paths) -> Arc<Self> {
        let deck = muat(&paths);
        let token = muat_token(&paths);
        Arc::new(Self {
            paths,
            token,
            deck: Mutex::new(deck),
        })
    }

    pub fn deck(&self) -> Deck {
        self.deck.lock().unwrap().clone()
    }

    pub fn ubah<T>(&self, kerja: impl FnOnce(&mut Deck) -> T) -> T {
        let mut kunci = self.deck.lock().unwrap();
        let hasil = kerja(&mut kunci);
        if let Err(e) = simpan(&self.paths, &kunci) {
            crate::core::log::warn(&format!("gagal menyimpan deck: {e}"));
        }
        hasil
    }

    pub fn ganti(&self, baru: Deck) {
        let mut kunci = self.deck.lock().unwrap();
        *kunci = baru;
        if let Err(e) = simpan(&self.paths, &kunci) {
            crate::core::log::warn(&format!("gagal menyimpan deck: {e}"));
        }
    }

    /// Kode tampil untuk pasangan: `abcd-efgh`.
    pub fn kode_tampil(&self) -> String {
        let t = &self.token;
        if t.len() >= 8 {
            format!("{}-{}", &t[..4], &t[4..8]).to_uppercase()
        } else {
            t.to_uppercase()
        }
    }
}

fn muat(paths: &Paths) -> Deck {
    let berkas = paths.deck_berkas();
    let teks = match fs::read_to_string(&berkas) {
        Ok(t) => t,
        Err(_) => {
            // Pemasangan baru: papan contoh, disimpan supaya bisa langsung disunting.
            let mut deck = contoh();
            normalisasi(&mut deck);
            if let Err(e) = simpan(paths, &deck) {
                crate::core::log::warn(&format!("gagal menulis deck contoh: {e}"));
            }
            return deck;
        }
    };
    let mut deck: Deck = serde_json::from_str(&teks).unwrap_or_else(|e| {
        crate::core::log::warn(&format!("deck.json tidak terbaca: {e}"));
        Deck::default()
    });
    normalisasi(&mut deck);
    deck
}

fn simpan(paths: &Paths, deck: &Deck) -> std::io::Result<()> {
    fs::create_dir_all(&paths.data)?;
    let teks = serde_json::to_string_pretty(deck)?;

    if let Ok(lama) = fs::read_to_string(paths.deck_berkas()) {
        cadangkan(paths, &lama);
    }

    let sementara = paths.deck_berkas().with_extension("json.tmp");
    {
        let mut f = fs::File::create(&sementara)?;
        f.write_all(teks.as_bytes())?;
        f.sync_all()?;
    }
    fs::rename(&sementara, paths.deck_berkas())
}

fn cadangkan(paths: &Paths, isi: &str) {
    let _ = fs::create_dir_all(paths.cadangan());
    let cap = crate::core::waktu::cap();
    let nama = format!("deck-{cap}.json");
    let _ = fs::write(paths.cadangan().join(nama), isi);

    let mut berkas: Vec<_> = fs::read_dir(paths.cadangan())
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| {
            e.file_name()
                .to_string_lossy()
                .starts_with("deck-")
        })
        .collect();
    berkas.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
    for lama in berkas.into_iter().skip(10) {
        let _ = fs::remove_file(lama.path());
    }
}

fn muat_token(paths: &Paths) -> String {
    if let Ok(teks) = fs::read_to_string(paths.rahasia_berkas()) {
        if let Ok(dok) = serde_json::from_str::<serde_json::Value>(&teks) {
            if let Some(t) = dok.get("token").and_then(|v| v.as_str()) {
                let t = t.trim().to_lowercase();
                if t.len() >= 8 && t.chars().all(|c| c.is_ascii_hexdigit()) {
                    return t;
                }
            }
        }
    }

    let baru = &uuid::Uuid::new_v4().simple().to_string()[..8];
    let isi = json!({ "token": baru });
    let _ = fs::create_dir_all(&paths.data);
    let _ = fs::write(
        paths.rahasia_berkas(),
        serde_json::to_string_pretty(&isi).unwrap_or_default(),
    );
    baru.to_string()
}

/// Batas dan isi bawaan supaya papan yang tersimpan selalu sah.
pub fn normalisasi(deck: &mut Deck) {
    if deck.version < 1 {
        deck.version = 1;
    }
    let kolom = deck.profile.columns.clamp(1, 8);
    let baris = deck.profile.rows.clamp(1, 6);
    deck.profile.columns = kolom;
    deck.profile.rows = baris;
    if deck.profile.name.trim().is_empty() {
        deck.profile.name = "Meja Kerja".into();
    }

    if deck.pages.is_empty() {
        deck.pages.push(Halaman::default());
    }
    deck.pages.truncate(24);

    for (pi, h) in deck.pages.iter_mut().enumerate() {
        if h.id.trim().is_empty() {
            h.id = format!("h{}", pi + 1);
        }
        h.skala = h.skala.clamp(50, 160);
        let total = (kolom * baris) as usize;
        h.keys.resize(total, None);
        for (ki, slot) in h.keys.iter_mut().enumerate() {
            if let Some(t) = slot {
                if t.id.trim().is_empty() {
                    t.id = format!("{}-k{}", h.id, ki + 1);
                }
                if t.label.is_empty() {
                    t.label = "Tombol".into();
                }
                if t.icon.is_empty() {
                    t.icon = "i-grid".into();
                }
                if t.variant == "hijau" {
                    /* Nama varian 2.x lama untuk warna hijau. */
                    t.variant = "lime".into();
                }
                if !matches!(
                    t.variant.as_str(),
                    "default" | "tint" | "accent" | "lime" | "dark"
                ) {
                    t.variant = "default".into();
                }
                if let Some(s) = &mut t.span {
                    s.c = s.c.clamp(1, kolom);
                    s.r = s.r.clamp(1, baris);
                }
            }
        }
    }

    deck.soundboard.truncate(200);
    for s in deck.soundboard.iter_mut() {
        s.volume = s.volume.clamp(0, 100);
    }
    deck.otomatis.truncate(50);
}

fn tombol(id: &str, label: &str, icon: &str, aksi: Aksi, variant: &str) -> Option<Tombol> {
    Some(Tombol {
        id: id.into(),
        label: label.into(),
        icon: icon.into(),
        variant: variant.into(),
        action: aksi,
        ..Tombol::default()
    })
}

fn widget(id: &str, label: &str, icon: &str, tipe: &str) -> Option<Tombol> {
    Some(Tombol {
        id: id.into(),
        label: label.into(),
        icon: icon.into(),
        variant: "dark".into(),
        widget: Some(Widget { tipe: tipe.into() }),
        action: Aksi::kosong(),
        ..Tombol::default()
    })
}

fn halaman_ke(id: &str) -> Aksi {
    Aksi {
        tipe: "halaman".into(),
        page_id: Some(id.into()),
        ..Aksi::kosong()
    }
}

fn buka(target: &str) -> Aksi {
    Aksi {
        tipe: "buka".into(),
        target: Some(target.into()),
        ..Aksi::kosong()
    }
}

fn media(cmd: &str) -> Aksi {
    Aksi {
        tipe: "media".into(),
        cmd: Some(cmd.into()),
        ..Aksi::kosong()
    }
}

fn hotkey(combo: &str) -> Aksi {
    Aksi {
        tipe: "hotkey".into(),
        combo: Some(combo.into()),
        ..Aksi::kosong()
    }
}

fn halaman(id: &str, nama: &str, keys: Vec<Option<Tombol>>) -> Halaman {
    Halaman {
        id: id.into(),
        name: nama.into(),
        keys,
        ..Halaman::default()
    }
}

/// Papan bawaan 2.3.0: 5 x 3, tiga halaman, isi sama persis.
pub fn contoh() -> Deck {
    let mut utama = vec![
        tombol("k1", "Putar / Jeda", "i-play", media("playpause"), "accent"),
        tombol("k2", "Lagu Berikut", "i-arrow-right", media("next"), "default"),
        tombol("k3", "Volume Naik", "i-volume", media("volup"), "default"),
        tombol("k4", "Volume Turun", "i-volume-off", media("voldown"), "default"),
        tombol("k5", "Senyapkan", "i-volume-off", media("mute"), "default"),
        tombol("k6", "Tangkapan Layar", "i-image", hotkey("win+shift+s"), "default"),
        tombol("k7", "Buka Peramban", "i-globe", buka("https://www.google.com"), "tint"),
        tombol("k8", "Unduhan", "i-download", buka("%USERPROFILE%\\Downloads"), "default"),
        tombol("k9", "Kalkulator", "i-plus", buka("calc"), "default"),
        tombol("k10", "Kunci Layar", "i-lock", hotkey("win+l"), "default"),
        tombol("k11", "Aplikasi", "i-grid", halaman_ke("p_aplikasi"), "dark"),
        tombol("k12", "Web", "i-link", halaman_ke("p_web"), "dark"),
        tombol("k13", "Catatan Cepat", "i-pencil", buka("notepad"), "default"),
        widget("k14", "Sekarang", "i-clock", "jam"),
        widget("k15", "Sedang Diputar", "i-play", "media"),
    ];
    utama.resize(15, None);

    let aplikasi = vec![
        tombol("a1", "Explorer", "i-folder", buka("explorer"), "tint"),
        tombol("a2", "Terminal", "i-code", buka("wt"), "default"),
        tombol("a3", "VS Code", "i-file", buka("code"), "default"),
        tombol("a4", "Paint", "i-image", buka("mspaint"), "default"),
        tombol("a5", "Task Manager", "i-database", hotkey("ctrl+shift+esc"), "default"),
        tombol("a6", "Salin", "i-copy", hotkey("ctrl+c"), "default"),
        tombol("a7", "Tempel", "i-upload", hotkey("ctrl+v"), "default"),
        tombol("a8", "Kembali", "i-arrow-left", halaman_ke("p_utama"), "dark"),
        None, None, None, None, None, None, None,
    ];

    let fokus = Aksi {
        tipe: "urutan".into(),
        steps: Some(vec![
            Langkah {
                delay: 300,
                action: buka("code"),
            },
            Langkah {
                delay: 900,
                action: buka("https://github.com"),
            },
        ]),
        ..Aksi::kosong()
    };
    let web = vec![
        tombol("w1", "YouTube", "i-play", buka("https://www.youtube.com"), "default"),
        tombol("w2", "GitHub", "i-code", buka("https://github.com"), "default"),
        tombol("w3", "WhatsApp", "i-mail", buka("https://web.whatsapp.com"), "default"),
        tombol("w4", "Spotify", "i-volume", buka("https://open.spotify.com"), "default"),
        tombol("w5", "Fokus Kerja", "i-bolt", fokus, "lime"),
        tombol("w6", "Kembali", "i-arrow-left", halaman_ke("p_utama"), "dark"),
        None, None, None, None, None, None, None, None, None,
    ];

    Deck {
        version: 1,
        profile: Profil {
            name: "Meja Kerja".into(),
            columns: 5,
            rows: 3,
        },
        pages: vec![
            halaman("p_utama", "Utama", utama),
            halaman("p_aplikasi", "Aplikasi", aplikasi),
            halaman("p_web", "Web", web),
        ],
        settings: Setelan {
            sound: true,
            home: "p_utama".into(),
            ..Setelan::default()
        },
        ..Deck::default()
    }
}

/// Papan baru untuk satu tombol kosong (dipakai pengujian dan papan bawaan).
pub fn tombol_contoh(id: &str, label: &str) -> Tombol {
    Tombol {
        id: id.into(),
        label: label.into(),
        ..Tombol::default()
    }
}
