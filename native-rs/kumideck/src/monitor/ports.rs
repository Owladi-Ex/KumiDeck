//! Daftar port yang sedang terbuka dan pemilik prosesnya.
//! Padanan layar baru 2.4.0; hanya baca, kecuali `akhiri` yang butuh konfirmasi UI.

use serde::Serialize;
use std::collections::HashMap;
use std::net::Ipv4Addr;
use windows::core::PWSTR;
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::NetworkManagement::IpHelper::{
    GetExtendedTcpTable, GetExtendedUdpTable, MIB_TCPTABLE_OWNER_PID, MIB_UDPTABLE_OWNER_PID,
    TCP_TABLE_OWNER_PID_ALL, UDP_TABLE_OWNER_PID,
};
use windows::Win32::System::ProcessStatus::{
    GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, TerminateProcess, PROCESS_NAME_WIN32,
    PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortRow {
    pub port: u16,
    pub protokol: String,
    pub alamat: String,
    pub status: String,
    pub pid: u32,
    pub proses: String,
    /// Bita working set; `None` kalau proses tidak bisa dibuka.
    pub memori: Option<u64>,
    pub dilindungi: bool,
}

const DILINDUNGI: &[&str] = &[
    "system",
    "idle",
    "csrss.exe",
    "wininit.exe",
    "winlogon.exe",
    "services.exe",
    "lsass.exe",
    "smss.exe",
    "kumideck.exe",
];

pub fn daftar() -> Vec<PortRow> {
    let mut hasil = Vec::new();
    let mut memori: HashMap<u32, Option<u64>> = HashMap::new();

    for baris in tcp_rows() {
        let proses = nama_proses(baris.dwOwningPid);
        let mem = *memori
            .entry(baris.dwOwningPid)
            .or_insert_with(|| memori_proses(baris.dwOwningPid));
        hasil.push(PortRow {
            port: port_dari(baris.dwLocalPort),
            protokol: "TCP".into(),
            alamat: alamat_dari(baris.dwLocalAddr),
            status: status_tcp(baris.dwState),
            pid: baris.dwOwningPid,
            dilindungi: dilindungi(baris.dwOwningPid, &proses),
            proses,
            memori: mem,
        });
    }

    for baris in udp_rows() {
        let proses = nama_proses(baris.dwOwningPid);
        let mem = *memori
            .entry(baris.dwOwningPid)
            .or_insert_with(|| memori_proses(baris.dwOwningPid));
        hasil.push(PortRow {
            port: port_dari(baris.dwLocalPort),
            protokol: "UDP".into(),
            alamat: alamat_dari(baris.dwLocalAddr),
            status: "Dengarkan".into(),
            pid: baris.dwOwningPid,
            dilindungi: dilindungi(baris.dwOwningPid, &proses),
            proses,
            memori: mem,
        });
    }

    hasil.sort_by(|a, b| a.port.cmp(&b.port).then(a.protokol.cmp(&b.protokol)));
    hasil.dedup_by(|a, b| a.port == b.port && a.protokol == b.protokol && a.pid == b.pid);
    hasil
}

pub fn akhiri(pid: u32) -> Result<(), String> {
    if pid == 0 {
        return Err("PID tidak valid.".into());
    }
    let nama = nama_proses(pid);
    if dilindungi(pid, &nama) {
        return Err("Proses ini dilindungi dan tidak boleh diakhiri.".into());
    }
    unsafe {
        let h: HANDLE = OpenProcess(PROCESS_TERMINATE, false, pid)
            .map_err(|_| "Proses tidak bisa dibuka. Jalankan KumiDeck sebagai administrator.".to_string())?;
        let r = TerminateProcess(h, 1);
        let _ = CloseHandle(h);
        r.map_err(|e| format!("Proses gagal diakhiri: {e}"))
    }
}

fn dilindungi(pid: u32, nama: &str) -> bool {
    /* PID 0-4 adalah proses sistem (System, Idle, smss) yang namanya sering tak
       terbaca; jangan bergantung pada nama saja. */
    if pid <= 4 {
        return true;
    }
    let n = nama.trim().to_lowercase();
    n.is_empty() || n == "tidak diketahui" || DILINDUNGI.iter().any(|d| *d == n)
}

fn tcp_rows() -> Vec<windows::Win32::NetworkManagement::IpHelper::MIB_TCPROW_OWNER_PID> {
    let mut ukuran = 0u32;
    unsafe {
        GetExtendedTcpTable(None, &mut ukuran, false, 2, TCP_TABLE_OWNER_PID_ALL, 0);
    }
    if ukuran == 0 {
        return Vec::new();
    }
    let mut buf = vec![0u8; ukuran as usize + 4096];
    let rc = unsafe {
        GetExtendedTcpTable(
            Some(buf.as_mut_ptr() as *mut _),
            &mut ukuran,
            false,
            2,
            TCP_TABLE_OWNER_PID_ALL,
            0,
        )
    };
    if rc != 0 {
        return Vec::new();
    }
    unsafe {
        let tabel = &*(buf.as_ptr() as *const MIB_TCPTABLE_OWNER_PID);
        let jumlah = tabel.dwNumEntries as usize;
        std::slice::from_raw_parts(tabel.table.as_ptr(), jumlah).to_vec()
    }
}

fn udp_rows() -> Vec<windows::Win32::NetworkManagement::IpHelper::MIB_UDPROW_OWNER_PID> {
    let mut ukuran = 0u32;
    unsafe {
        GetExtendedUdpTable(None, &mut ukuran, false, 2, UDP_TABLE_OWNER_PID, 0);
    }
    if ukuran == 0 {
        return Vec::new();
    }
    let mut buf = vec![0u8; ukuran as usize + 4096];
    let rc = unsafe {
        GetExtendedUdpTable(
            Some(buf.as_mut_ptr() as *mut _),
            &mut ukuran,
            false,
            2,
            UDP_TABLE_OWNER_PID,
            0,
        )
    };
    if rc != 0 {
        return Vec::new();
    }
    unsafe {
        let tabel = &*(buf.as_ptr() as *const MIB_UDPTABLE_OWNER_PID);
        let jumlah = tabel.dwNumEntries as usize;
        std::slice::from_raw_parts(tabel.table.as_ptr(), jumlah).to_vec()
    }
}

fn port_dari(nilai: u32) -> u16 {
    u16::from_be(nilai as u16)
}

fn alamat_dari(nilai: u32) -> String {
    Ipv4Addr::from(nilai.to_ne_bytes()).to_string()
}

fn status_tcp(nilai: u32) -> String {
    // MIB_TCP_STATE
    match nilai {
        1 => "Tertutup",
        2 => "Dengarkan",
        3 => "Menunggu sinkron",
        4 => "Menunggu sinkron",
        5 => "Terbentuk",
        6 => "Menunggu tutup",
        7 => "Menunggu tutup",
        8 => "Tutup tunggu",
        9 => "Tutup terakhir",
        10 => "Tutup waktu",
        11 => "Hapus TCB",
        12 => "Tertutup",
        _ => "Tidak dikenal",
    }
    .to_string()
}

fn nama_proses(pid: u32) -> String {
    if pid == 0 {
        return "System Idle Process".into();
    }
    unsafe {
        let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
            return "Tidak diketahui".into();
        };
        let mut buf = [0u16; 1024];
        let mut ukuran = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(
            h,
            PROCESS_NAME_WIN32,
            PWSTR(buf.as_mut_ptr()),
            &mut ukuran,
        )
        .is_ok();
        let _ = CloseHandle(h);
        if !ok {
            return "Tidak diketahui".into();
        }
        let jalur = String::from_utf16_lossy(&buf[..ukuran as usize]);
        jalur
            .rsplit(['\\', '/'])
            .next()
            .unwrap_or(&jalur)
            .to_string()
    }
}

fn memori_proses(pid: u32) -> Option<u64> {
    if pid == 0 {
        return None;
    }
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut c = PROCESS_MEMORY_COUNTERS {
            cb: std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
            ..Default::default()
        };
        let ok = GetProcessMemoryInfo(h, &mut c, c.cb).is_ok();
        let _ = CloseHandle(h);
        if ok {
            Some(c.WorkingSetSize as u64)
        } else {
            None
        }
    }
}

#[cfg(test)]
mod uji {
    use super::dilindungi;

    #[test]
    fn proses_sistem_dilindungi() {
        assert!(dilindungi(0, "System"));
        assert!(dilindungi(4, "System"));
    }

    #[test]
    fn nama_tak_terbaca_dilindungi() {
        assert!(dilindungi(500, ""));
        assert!(dilindungi(500, "tidak diketahui"));
        assert!(dilindungi(500, "  "));
    }

    #[test]
    fn aplikasi_biasa_boleh_diakiri() {
        assert!(!dilindungi(5000, "chrome.exe"));
        assert!(!dilindungi(5000, "notepad.exe"));
    }
}
