//! Pemakaian GPU lewat penghitung PDH `\GPU Engine(*)\Utilization Percentage`.
//! Kalau driver tidak menyediakan penghitung ini, hasilnya `None` — UI menulis
//! "tidak tersedia", bukan angka karangan.

use windows::core::w;
use windows::Win32::System::Performance::{
    PdhAddEnglishCounterW, PdhCloseQuery, PdhCollectQueryData, PdhGetFormattedCounterArrayW,
    PdhOpenQueryW, PDH_FMT_COUNTERVALUE_ITEM_W, PDH_FMT_DOUBLE, PDH_HCOUNTER, PDH_HQUERY,
};

pub struct Gpu {
    query: PDH_HQUERY,
    counter: PDH_HCOUNTER,
    siap: bool,
}

impl Gpu {
    pub fn new() -> Option<Self> {
        let mut query = PDH_HQUERY::default();
        let mut counter = PDH_HCOUNTER::default();
        unsafe {
            if PdhOpenQueryW(None, 0, &mut query) != 0 {
                return None;
            }
            if PdhAddEnglishCounterW(
                query,
                w!("\\GPU Engine(*)\\Utilization Percentage"),
                0,
                &mut counter,
            ) != 0
            {
                let _ = PdhCloseQuery(query);
                return None;
            }
            // Sampel pertama hanya pembanding.
            let _ = PdhCollectQueryData(query);
        }
        Some(Self {
            query,
            counter,
            siap: true,
        })
    }

    pub fn sample(&mut self) -> Option<f64> {
        if !self.siap {
            return None;
        }
        unsafe {
            if PdhCollectQueryData(self.query) != 0 {
                return None;
            }
            let mut ukuran = 0u32;
            let mut jumlah = 0u32;
            let rc = PdhGetFormattedCounterArrayW(
                self.counter,
                PDH_FMT_DOUBLE,
                &mut ukuran,
                &mut jumlah,
                None,
            );
            // 0x800007D2 = PDH_MORE_DATA
            if rc != 0x800007D2 {
                return if rc == 0 && jumlah == 0 { Some(0.0) } else { None };
            }
            let mut buf = vec![0u8; ukuran as usize + 32];
            let rc = PdhGetFormattedCounterArrayW(
                self.counter,
                PDH_FMT_DOUBLE,
                &mut ukuran,
                &mut jumlah,
                Some(buf.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W),
            );
            if rc != 0 {
                return None;
            }
            let item = std::slice::from_raw_parts(
                buf.as_ptr() as *const PDH_FMT_COUNTERVALUE_ITEM_W,
                jumlah as usize,
            );
            let mut total = 0.0f64;
            for i in item {
                if i.FmtValue.CStatus == 0 {
                    let v = i.FmtValue.Anonymous.doubleValue;
                    if v.is_finite() && v > 0.0 {
                        total += v;
                    }
                }
            }
            Some(total.clamp(0.0, 100.0))
        }
    }
}

impl Drop for Gpu {
    fn drop(&mut self) {
        unsafe {
            let _ = PdhCloseQuery(self.query);
        }
    }
}
