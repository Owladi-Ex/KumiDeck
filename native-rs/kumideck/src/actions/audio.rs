//! Volume sistem dan mute mikrofon lewat Core Audio (WASAPI).

use windows::core::GUID;
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{eCapture, eConsole, eRender, IMMDeviceEnumerator};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
};

const CLSID_MMDEVICE_ENUMERATOR: GUID = GUID::from_u128(0xBCDE0395_E52F_467C_8E3D_C4579291692E);

fn endpoint(mic: bool) -> Result<IAudioEndpointVolume, String> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let pencacah: IMMDeviceEnumerator =
            CoCreateInstance(&CLSID_MMDEVICE_ENUMERATOR, None, CLSCTX_ALL)
                .map_err(|e| format!("Audio Windows tidak tersedia: {e}"))?;
        let arah = if mic { eCapture } else { eRender };
        let perangkat = pencacah
            .GetDefaultAudioEndpoint(arah, eConsole)
            .map_err(|e| format!("Perangkat audio tidak ditemukan: {e}"))?;
        let volume: IAudioEndpointVolume = perangkat
            .Activate(CLSCTX_ALL, None)
            .map_err(|e| format!("Volume tidak bisa dibuka: {e}"))?;
        Ok(volume)
    }
}

pub fn baca() -> Option<(i64, bool)> {
    let v = endpoint(false).ok()?;
    unsafe {
        let skala = v.GetMasterVolumeLevelScalar().ok()?;
        let mute = v.GetMute().ok()?.as_bool();
        Some(((skala as f64 * 100.0).round() as i64, mute))
    }
}

/// `naik`, `turun`, `mute`, `set` (dengan nilai 0â€“100), atau `baca`.
pub fn atur(mode: &str, nilai: Option<i64>) -> Result<Option<(i64, bool)>, String> {
    let v = endpoint(false)?;
    unsafe {
        match mode {
            "naik" => {
                let skala = v.GetMasterVolumeLevelScalar().unwrap_or(0.5);
                let baru = (skala + 0.05).min(1.0);
                v.SetMasterVolumeLevelScalar(baru, std::ptr::null())
                    .map_err(|e| format!("Volume gagal diubah: {e}"))?;
            }
            "turun" => {
                let skala = v.GetMasterVolumeLevelScalar().unwrap_or(0.5);
                let baru = (skala - 0.05).max(0.0);
                v.SetMasterVolumeLevelScalar(baru, std::ptr::null())
                    .map_err(|e| format!("Volume gagal diubah: {e}"))?;
            }
            "mute" => {
                let mute = v.GetMute().unwrap_or_default().as_bool();
                v.SetMute(!mute, std::ptr::null())
                    .map_err(|e| format!("Mute gagal diubah: {e}"))?;
            }
            "set" => {
                let skala = (nilai.unwrap_or(50).clamp(0, 100) as f32) / 100.0;
                v.SetMasterVolumeLevelScalar(skala, std::ptr::null())
                    .map_err(|e| format!("Volume gagal diubah: {e}"))?;
            }
            "baca" => {}
            lain => return Err(format!("Perintah volume \"{lain}\" tidak dikenal.")),
        }
        let skala = v.GetMasterVolumeLevelScalar().unwrap_or(0.0);
        let mute = v.GetMute().unwrap_or_default().as_bool();
        Ok(Some(((skala as f64 * 100.0).round() as i64, mute)))
    }
}

/// Status senyap mikrofon tanpa mengubahnya.
pub fn mikrofon_senyap() -> Option<bool> {
    let v = endpoint(true).ok()?;
    unsafe { v.GetMute().ok().map(|b| b.as_bool()) }
}

/// `togel`, `senyap`, atau `nyala`.
pub fn mikrofon(mode: &str) -> Result<bool, String> {
    let v = endpoint(true)?;
    unsafe {
        let sekarang = v.GetMute().unwrap_or_default().as_bool();
        let baru = match mode {
            "togel" => !sekarang,
            "senyap" => true,
            "nyala" => false,
            lain => return Err(format!("Perintah mikrofon \"{lain}\" tidak dikenal.")),
        };
        v.SetMute(baru, std::ptr::null())
            .map_err(|e| format!("Mikrofon gagal diubah: {e}"))?;
        Ok(baru)
    }
}
