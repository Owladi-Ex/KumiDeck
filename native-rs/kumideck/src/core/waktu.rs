//! Waktu lokal tanpa crate tambahan.

#[repr(C)]
#[derive(Default, Clone, Copy)]
pub struct SystemTime {
    pub year: u16,
    pub month: u16,
    pub day_of_week: u16,
    pub day: u16,
    pub hour: u16,
    pub minute: u16,
    pub second: u16,
    pub milliseconds: u16,
}

#[link(name = "kernel32")]
extern "system" {
    fn GetLocalTime(waktu: *mut SystemTime);
}

pub fn lokal() -> SystemTime {
    let mut t = SystemTime::default();
    unsafe { GetLocalTime(&mut t) };
    t
}

/// `yyyyMMdd-HHmmss-msc`, bentuk nama cadangan 2.3.0.
pub fn cap() -> String {
    let t = lokal();
    format!(
        "{:04}{:02}{:02}-{:02}{:02}{:02}-{:03}",
        t.year, t.month, t.day, t.hour, t.minute, t.second, t.milliseconds
    )
}

/// `dd/mm/yyyy hh:mm` untuk log dan aktivitas.
pub fn tampil() -> String {
    let t = lokal();
    format!(
        "{:02}/{:02}/{:04} {:02}:{:02}",
        t.day, t.month, t.year, t.hour, t.minute
    )
}
