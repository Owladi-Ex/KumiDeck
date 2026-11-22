//! Sampel pemakaian sistem: CPU, RAM, GPU, dan lalu lintas jaringan.
//! Tidak ada angka karangan: kalau penghitung tidak tersedia, nilainya `null`.

use serde::Serialize;
use std::time::Instant;
use windows::Win32::Foundation::FILETIME;
use windows::Win32::NetworkManagement::IpHelper::{FreeMibTable, GetIfTable2, MIB_IF_TABLE2};
use windows::Win32::NetworkManagement::Ndis::IfOperStatusUp;
use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
use windows::Win32::System::Threading::GetSystemTimes;

use super::gpu::Gpu;

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Monitor {
    /// Persen 0–100.
    pub cpu: f64,
    /// Gigabita terpakai.
    pub ram: f64,
    pub ram_total: f64,
    /// Persen 0–100, `None` kalau DXGI tidak terbaca.
    pub gpu: Option<f64>,
    /// Suhu tidak dibaca tanpa vendor SDK; jangan dikarang.
    pub gpu_temp: Option<f64>,
    /// Milidetik; `None` kalau ICMP tidak tersedia.
    pub ping: Option<f64>,
    /// Megabit per detik.
    pub down: f64,
    pub up: f64,
    pub waktu: i64,
}

pub struct Sampler {
    cpu_lalu: Option<(u64, u64, u64)>,
    net_lalu: Option<(u64, u64, Instant)>,
    gpu: Option<Gpu>,
}

impl Sampler {
    pub fn new() -> Self {
        Self {
            cpu_lalu: None,
            net_lalu: None,
            gpu: Gpu::new(),
        }
    }

    pub fn sample(&mut self) -> Monitor {
        let (cpu, ram, ram_total) = (cpu_persen(&mut self.cpu_lalu), ram(), ram_total());
        let (down, up) = jaringan(&mut self.net_lalu);
        let gpu = self.gpu.as_mut().and_then(|g| g.sample());
        Monitor {
            cpu,
            ram,
            ram_total,
            gpu,
            gpu_temp: None,
            ping: None,
            down,
            up,
            waktu: now_ms(),
        }
    }
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn waktu_ke_u64(ft: FILETIME) -> u64 {
    ((ft.dwHighDateTime as u64) << 32) | ft.dwLowDateTime as u64
}

fn cpu_persen(lalu: &mut Option<(u64, u64, u64)>) -> f64 {
    let (mut idle, mut kernel, mut user) = (FILETIME::default(), FILETIME::default(), FILETIME::default());
    let ok = unsafe { GetSystemTimes(Some(&mut idle), Some(&mut kernel), Some(&mut user)) };
    if ok.is_err() {
        return 0.0;
    }
    let (i, k, u) = (
        waktu_ke_u64(idle),
        waktu_ke_u64(kernel),
        waktu_ke_u64(user),
    );
    let hasil = if let Some((pi, pk, pu)) = *lalu {
        let di = i.saturating_sub(pi);
        let dk = k.saturating_sub(pk);
        let du = u.saturating_sub(pu);
        let total = dk + du; // kernel sudah termasuk idle
        if total == 0 {
            0.0
        } else {
            ((total.saturating_sub(di)) as f64 / total as f64) * 100.0
        }
    } else {
        0.0
    };
    *lalu = Some((i, k, u));
    hasil.clamp(0.0, 100.0)
}

fn mem_info() -> Option<MEMORYSTATUSEX> {
    let mut m = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        ..Default::default()
    };
    if unsafe { GlobalMemoryStatusEx(&mut m) }.is_ok() {
        Some(m)
    } else {
        None
    }
}

fn ram() -> f64 {
    mem_info()
        .map(|m| {
            let terpakai = m.ullTotalPhys.saturating_sub(m.ullAvailPhys);
            terpakai as f64 / 1024.0 / 1024.0 / 1024.0
        })
        .unwrap_or(0.0)
}

fn ram_total() -> f64 {
    mem_info()
        .map(|m| m.ullTotalPhys as f64 / 1024.0 / 1024.0 / 1024.0)
        .unwrap_or(0.0)
}

fn jaringan(lalu: &mut Option<(u64, u64, Instant)>) -> (f64, f64) {
    let mut tabel: *mut MIB_IF_TABLE2 = std::ptr::null_mut();
    let rc = unsafe { GetIfTable2(&mut tabel) };
    if rc.0 != 0 || tabel.is_null() {
        return (0.0, 0.0);
    }

    let (mut masuk, mut keluar) = (0u64, 0u64);
    unsafe {
        let jumlah = (*tabel).NumEntries as usize;
        let baris = std::slice::from_raw_parts((*tabel).Table.as_ptr(), jumlah);
        for r in baris {
            if r.OperStatus != IfOperStatusUp {
                continue;
            }
            // 24 = IF_TYPE_SOFTWARE_LOOPBACK
            if r.Type == 24 {
                continue;
            }
            masuk = masuk.saturating_add(r.InOctets);
            keluar = keluar.saturating_add(r.OutOctets);
        }
        FreeMibTable(tabel as *const _);
    }

    let sekarang = Instant::now();
    let hasil = if let Some((lama_masuk, lama_keluar, waktu)) = *lalu {
        let dt = sekarang.duration_since(waktu).as_secs_f64().max(0.001);
        let d_masuk = masuk.saturating_sub(lama_masuk) as f64 * 8.0 / 1_000_000.0;
        let d_keluar = keluar.saturating_sub(lama_keluar) as f64 * 8.0 / 1_000_000.0;
        (d_masuk / dt, d_keluar / dt)
    } else {
        (0.0, 0.0)
    };
    *lalu = Some((masuk, keluar, sekarang));
    hasil
}


