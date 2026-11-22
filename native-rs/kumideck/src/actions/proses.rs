//! Buka berkas/URL, proses aktif, dan tindakan jendela.

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use windows::core::PCWSTR;
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_MAXIMIZE, SW_MINIMIZE, SW_RESTORE};

fn wide(teks: &str) -> Vec<u16> {
    OsStr::new(teks)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

/// Apakah proses dengan nama itu sedang berjalan? Dipakai syarat `proses`.
pub fn berjalan(cari: &str) -> bool {
    use windows::Win32::System::ProcessStatus::K32EnumProcesses;
    let cari = cari.trim().to_lowercase();
    if cari.is_empty() {
        return true;
    }
    let target = if cari.ends_with(".exe") {
        cari.clone()
    } else {
        format!("{cari}.exe")
    };
    let mut pids = vec![0u32; 4096];
    let mut perlu = 0u32;
    unsafe {
        if !K32EnumProcesses(
            pids.as_mut_ptr(),
            (pids.len() * std::mem::size_of::<u32>()) as u32,
            &mut perlu,
        )
        .as_bool()
        {
            return false;
        }
    }
    let jumlah = (perlu as usize / std::mem::size_of::<u32>()).min(pids.len());
    pids.truncate(jumlah);
    pids.iter().any(|pid| nama(*pid).to_lowercase() == target)
}

pub fn nama(pid: u32) -> String {    if pid == 0 {
        return "System Idle Process".into();
    }
    if pid == 4 {
        return "System".into();
    }
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    unsafe {
        let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
            return "Tidak diketahui".into();
        };
        let mut buf = [0u16; 1024];
        let mut ukuran = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut ukuran)
            .is_ok();
        let _ = CloseHandle(h);
        if !ok {
            return "Tidak diketahui".into();
        }
        let jalur = String::from_utf16_lossy(&buf[..ukuran as usize]);
        jalur.rsplit(['\\', '/']).next().unwrap_or(&jalur).to_string()
    }
}

/// Buka URL, folder, atau aplikasi. `%VARIABEL%` diperluas lebih dulu.
pub fn buka(target: &str) -> Result<(), String> {
    let target = perluas_lingkungan(target);
    if target.trim().is_empty() {
        return Err("Target buka kosong.".into());
    }
    let op = wide("open");
    let berkas = wide(&target);
    let hasil = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(op.as_ptr()),
            PCWSTR(berkas.as_ptr()),
            None,
            None,
            windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
        )
    };
    // ShellExecuteW mengembalikan nilai > 32 kalau berhasil.
    if hasil.0 as isize > 32 {
        Ok(())
    } else {
        Err(format!("Tidak bisa membuka {target}."))
    }
}

pub fn jalankan_skrip(target: &str, args: Option<&str>) -> Result<(), String> {
    let target = perluas_lingkungan(target);
    if target.trim().is_empty() {
        return Err("Target skrip kosong.".into());
    }
    let mut cmd = std::process::Command::new(&target);
    if let Some(a) = args {
        for bagian in a.split_whitespace() {
            cmd.arg(bagian);
        }
    }
    cmd.spawn()
        .map(|_| ())
        .map_err(|e| format!("Skrip gagal dijalankan: {e}"))
}

pub fn perluas_lingkungan(teks: &str) -> String {
    use windows::Win32::System::Environment::ExpandEnvironmentStringsW;
    let sumber = wide(teks);
    let mut buf = vec![0u16; 4096];
    let n = unsafe { ExpandEnvironmentStringsW(PCWSTR(sumber.as_ptr()), Some(&mut buf)) };
    if n == 0 || n as usize > buf.len() {
        return teks.to_string();
    }
    String::from_utf16_lossy(&buf[..n as usize - 1])
}

pub fn jendela(perintah: &str) -> Result<(), String> {
    use crate::actions::keys;
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, IsZoomed};
    unsafe {
        let h = GetForegroundWindow();
        match perintah {
            "minimize" => {
                let _ = ShowWindow(h, SW_MINIMIZE);
            }
            "maximize" => {
                let _ = ShowWindow(h, SW_MAXIMIZE);
            }
            "restore" => {
                let _ = ShowWindow(h, SW_RESTORE);
            }
            "kiri" => keys::hotkey("win+left")?,
            "kanan" => keys::hotkey("win+right")?,
            "monitor-berikut" => keys::hotkey("win+shift+right")?,
            "task-view" => keys::hotkey("win+tab")?,
            "tampilkan-desktop" => keys::hotkey("win+d")?,
            "tutup-jendela" => {
                let _ = IsZoomed(h);
                keys::hotkey("alt+f4")?
            }
            lain => return Err(format!("Perintah jendela \"{lain}\" tidak dikenal.")),
        }
    }
    Ok(())
}

pub fn daya(perintah: &str) -> Result<(), String> {
    use windows::Win32::System::Power::SetSuspendState;
    use windows::Win32::System::Shutdown::LockWorkStation;
    match perintah {
        "tidur" => {
            unsafe { SetSuspendState(false, false, false) };
            Ok(())
        }
        "kunci" => unsafe { LockWorkStation() }.map_err(|e| format!("Kunci layar gagal: {e}")),
        "restart" => shutdown("/r"),
        "matikan" => shutdown("/s"),
        "batal" => shutdown("/a"),
        lain => Err(format!("Perintah daya \"{lain}\" tidak dikenal.")),
    }
}

fn shutdown(arg: &str) -> Result<(), String> {
    std::process::Command::new("shutdown.exe")
        .args([arg, "/t", "0"])
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Perintah daya gagal: {e}"))
}
