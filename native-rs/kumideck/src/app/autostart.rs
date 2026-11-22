//! Mulai otomatis lewat `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`,
//! tanpa hak admin. Padanan `native/KumiDeck/Platform/Autostart.cs`.

use std::sync::atomic::{AtomicI8, Ordering};

use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::ERROR_SUCCESS;
use windows::Win32::System::Registry::{
    RegCloseKey, RegCreateKeyExW, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW,
    HKEY, HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, REG_OPTION_NON_VOLATILE, REG_SZ,
};

const NAMA: PCWSTR = w!("KumiDeck");

/// Keadaan terakhir yang sudah ditulis: -1 belum diketahui, 0 mati, 1 nyala.
static TERTULIS: AtomicI8 = AtomicI8::new(-1);

fn kunci_run() -> PCWSTR {
    w!("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
}

/// Nyala kalau nilai registry ada dan berkasnya masih ada.
pub fn aktif() -> bool {
    let mut kunci = HKEY::default();
    let buka = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            kunci_run(),
            Some(0),
            KEY_READ,
            &mut kunci,
        )
    };
    if buka != ERROR_SUCCESS {
        return false;
    }
    let mut tipe = REG_SZ;
    let mut ukuran: u32 = 0;
    let tanya = unsafe {
        RegQueryValueExW(kunci, NAMA, None, Some(&mut tipe), None, Some(&mut ukuran))
    };
    if tanya != ERROR_SUCCESS || ukuran < 4 {
        unsafe {
            let _ = RegCloseKey(kunci);
        }
        return false;
    }
    let mut buf = vec![0u8; ukuran as usize + 2];
    let baca = unsafe {
        RegQueryValueExW(
            kunci,
            NAMA,
            None,
            Some(&mut tipe),
            Some(buf.as_mut_ptr()),
            Some(&mut ukuran),
        )
    };
    unsafe {
        let _ = RegCloseKey(kunci);
    }
    if baca != ERROR_SUCCESS {
        return false;
    }
    let teks = String::from_utf16_lossy(
        &buf[..ukuran as usize]
            .chunks_exact(2)
            .map(|p| u16::from_le_bytes([p[0], p[1]]))
            .collect::<Vec<u16>>(),
    );
    let teks = teks.trim_matches(char::from(0)).trim();
    let jalur = teks.trim_matches('"');
    let jalur = jalur.split("\" ").next().unwrap_or(jalur);
    std::path::Path::new(jalur).is_file()
}

/// Tulis atau hapus kunci autostart. Hasil `Ok(true)` berarti kini nyala.
pub fn terapkan(nyala: bool) -> Result<bool, String> {
    let mut kunci = HKEY::default();
    let buat = unsafe {
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            kunci_run(),
            Some(0),
            None,
            REG_OPTION_NON_VOLATILE,
            KEY_READ | KEY_WRITE,
            None,
            &mut kunci,
            None,
        )
    };
    if buat != ERROR_SUCCESS {
        return Err("Kunci registry mulai otomatis tidak dapat dibuka.".into());
    }

    let hasil = if !nyala {
        let hapus = unsafe { RegDeleteValueW(kunci, NAMA) };
        /* Nilai yang memang belum ada bukan kegagalan. */
        if hapus == ERROR_SUCCESS || hapus == windows::Win32::Foundation::ERROR_FILE_NOT_FOUND {
            Ok(false)
        } else {
            Err("Nilai mulai otomatis tidak dapat dihapus.".to_string())
        }
    } else {
        let exe = std::env::current_exe()
            .map_err(|_| "Lokasi KumiDeck.exe tidak ditemukan.".to_string())?;
        let isi = format!("\"{}\"", exe.display());
        let mut bytes: Vec<u8> = isi.encode_utf16().flat_map(u16::to_le_bytes).collect();
        bytes.extend_from_slice(&[0, 0]);
        let tulis = unsafe {
            RegSetValueExW(kunci, NAMA, Some(0), REG_SZ, Some(&bytes))
        };
        if tulis == ERROR_SUCCESS {
            Ok(true)
        } else {
            Err("Mulai otomatis gagal diatur.".to_string())
        }
    };

    unsafe {
        let _ = RegCloseKey(kunci);
    }
    if let Ok(v) = &hasil {
        TERTULIS.store(i8::from(*v), Ordering::SeqCst);
    }
    hasil
}

/// Terapkan hanya kalau setelan berbeda dari yang sudah ditulis. Dipanggil saat
/// aplikasi mulai dan setiap papan disimpan, jadi tidak menulis registry terus.
pub fn selaraskan(nyala: bool) {
    let sudah = TERTULIS.load(Ordering::SeqCst);
    if sudah == i8::from(nyala) {
        return;
    }
    if sudah < 0 && aktif() == nyala {
        TERTULIS.store(i8::from(nyala), Ordering::SeqCst);
        return;
    }
    match terapkan(nyala) {
        Ok(_) => crate::core::log::info(&format!(
            "autostart: {}",
            if nyala { "dinyalakan" } else { "dimatikan" }
        )),
        Err(e) => crate::core::log::warn(&format!("autostart: {e}")),
    }
}
