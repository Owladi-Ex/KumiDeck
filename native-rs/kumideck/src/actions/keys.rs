//! Kirim tombol dan teks ke jendela yang sedang aktif.

use windows::Win32::UI::Input::KeyboardAndMouse::{
    keybd_event, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE,
};

const KEYUP: KEYBD_EVENT_FLAGS = KEYEVENTF_KEYUP;

fn turun(vk: u8) {
    unsafe { keybd_event(vk, 0, KEYBD_EVENT_FLAGS(0), 0) };
}

fn naik(vk: u8) {
    unsafe { keybd_event(vk, 0, KEYUP, 0) };
}

fn vk_bagian(nama: &str) -> Option<Vec<u8>> {
    let n = nama.trim().to_lowercase();
    let satu = match n.as_str() {
        "ctrl" | "control" => 0x11,
        "shift" => 0x10,
        "alt" => 0x12,
        "win" | "meta" | "super" => 0x5B,
        "enter" | "return" => 0x0D,
        "tab" => 0x09,
        "esc" | "escape" => 0x1B,
        "space" | "spasi" => 0x20,
        "backspace" => 0x08,
        "delete" | "del" => 0x2E,
        "insert" | "ins" => 0x2D,
        "home" => 0x24,
        "end" => 0x23,
        "pageup" | "pgup" => 0x21,
        "pagedown" | "pgdn" => 0x22,
        "left" | "kiri" => 0x25,
        "up" | "atas" => 0x26,
        "right" | "kanan" => 0x27,
        "down" | "bawah" => 0x28,
        "capslock" => 0x14,
        "printscreen" | "prtsc" => 0x2C,
        "playpause" | "media-play" => 0xB3,
        "next" | "media-next" => 0xB0,
        "prev" | "media-prev" => 0xB1,
        "mute" | "volume-mute" => 0xAD,
        "volup" | "volume-up" => 0xAF,
        "voldown" | "volume-down" => 0xAE,
        _ => {
            let bytes = n.as_bytes();
            if (bytes.len() == 2 || bytes.len() == 3) && bytes[0] == b'f' {
                if let Ok(no) = n[1..].parse::<u8>() {
                    if (1..=24).contains(&no) {
                        return Some(vec![0x6F + no]);
                    }
                }
            }
            if n.chars().count() == 1 {
                return vk_karakter(n.chars().next().unwrap());
            }
            return None;
        }
    };
    Some(vec![satu])
}

fn vk_karakter(c: char) -> Option<Vec<u8>> {
    use windows::Win32::UI::Input::KeyboardAndMouse::VkKeyScanW;
    let hasil = unsafe { VkKeyScanW(c as u16) };
    if hasil == -1 {
        return None;
    }
    let vk = (hasil & 0xFF) as u8;
    let shift = hasil >> 8;
    let mut urutan = Vec::new();
    if shift & 1 != 0 {
        urutan.push(0x10);
    }
    if shift & 2 != 0 {
        urutan.push(0x11);
    }
    if shift & 4 != 0 {
        urutan.push(0x12);
    }
    urutan.push(vk);
    Some(urutan)
}

/// Contoh: `ctrl+shift+esc`, `win+l`, `f5`, `a`.
pub fn hotkey(combo: &str) -> Result<(), String> {
    let bagian: Vec<&str> = combo.split('+').filter(|b| !b.trim().is_empty()).collect();
    if bagian.is_empty() {
        return Err("Pintasan kosong.".into());
    }
    let mut urutan = Vec::new();
    for (i, b) in bagian.iter().enumerate() {
        let vk = vk_bagian(b)
            .ok_or_else(|| format!("Tombol \"{}\" tidak dikenal.", b.trim()))?;
        if i == bagian.len() - 1 {
            urutan.extend(vk);
        } else {
            // Bagian modifier: hanya kode utamanya.
            urutan.push(vk[0]);
        }
    }

    // Tekan berurutan, lepas terbalik.
    for vk in &urutan {
        turun(*vk);
        std::thread::sleep(std::time::Duration::from_millis(12));
    }
    for vk in urutan.iter().rev() {
        naik(*vk);
        std::thread::sleep(std::time::Duration::from_millis(8));
    }
    Ok(())
}

/// Ketik teks apa adanya lewat KEYEVENTF_UNICODE.
pub fn ketik(teks: &str) -> Result<(), String> {
    for unit in teks.encode_utf16() {
        unsafe {
            keybd_event(0, unit as u8, KEYEVENTF_UNICODE, 0);
            keybd_event(0, unit as u8, KEYEVENTF_UNICODE | KEYUP, 0);
        }
        std::thread::sleep(std::time::Duration::from_millis(4));
    }
    Ok(())
}

pub fn tombol_media(cmd: &str) -> Result<(), String> {
    let vk = match cmd {
        "playpause" => 0xB3,
        "next" => 0xB0,
        "prev" => 0xB1,
        "mute" => 0xAD,
        "volup" => 0xAF,
        "voldown" => 0xAE,
        lain => return Err(format!("Perintah media \"{lain}\" tidak dikenal.")),
    };
    turun(vk);
    std::thread::sleep(std::time::Duration::from_millis(30));
    naik(vk);
    Ok(())
}

/// Jendela aktif: proses dan judul.
pub fn jendela_aktif() -> (String, String, bool) {
    use windows::Win32::Foundation::MAX_PATH;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
    };
    unsafe {
        let h = GetForegroundWindow();
        if h.0.is_null() {
            return (String::new(), String::new(), false);
        }
        let mut buf = [0u16; MAX_PATH as usize];
        let n = GetWindowTextW(h, &mut buf);
        let judul = String::from_utf16_lossy(&buf[..n as usize]);
        let mut pid = 0u32;
        let _ = GetWindowThreadProcessId(h, Some(&mut pid));
        let proses = crate::actions::proses::nama(pid);
        (proses, judul, true)
    }
}
