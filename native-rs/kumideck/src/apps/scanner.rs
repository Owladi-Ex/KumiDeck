//! Daftar aplikasi terpasang untuk pemilih aplikasi di editor tombol.
//!
//! Sumber: pintasan `*.lnk` di Start Menu pengguna dan All Users (COM
//! `IShellLinkW`), ditambah aplikasi terkenal yang dipasang di luar Start Menu.
//! Hasil di-cache 5 menit. Fungsi tidak pernah gagal keras: bila satu sumber
//! tidak terbaca, aplikasi lain tetap dikembalikan bersama pesan galat.

use std::collections::HashSet;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::{json, Value};
use windows::core::{Interface, PCWSTR};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    IPersistFile,
};
use windows::Win32::System::Com::STGM_READ;
use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

const UMUR_CACHE_MS: i64 = 5 * 60 * 1000;
const BATAS_BUTIR: usize = 500;

struct Cache {
    waktu: i64,
    daftar: Vec<Value>,
    galat: String,
}

static CACHE: Mutex<Option<Cache>> = Mutex::new(None);

fn sekarang_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// `(daftar, diambil, galat)` seperti `/api/apps` 2.3.0.
pub fn daftar(paksa: bool) -> (Vec<Value>, i64, Value) {
    let sekarang = sekarang_ms();
    if !paksa {
        if let Some(c) = CACHE.lock().unwrap().as_ref() {
            if sekarang - c.waktu < UMUR_CACHE_MS {
                return (c.daftar.clone(), c.waktu, teks_atau_null(&c.galat));
            }
        }
    }

    let (mut butir, galat) = pindai_semua();    /* Aplikasi klasik diutamakan; nama ganda dibuang. */
    let mut kunci = HashSet::new();
    butir.retain(|b| {
        let k = b.kunci.clone();
        !k.is_empty() && kunci.insert(k)
    });
    butir.sort_by(|a, b| bandingkan_nama(&a.nama, &b.nama));

    let daftar: Vec<Value> = butir.iter().take(BATAS_BUTIR).map(|b| b.json()).collect();
    *CACHE.lock().unwrap() = Some(Cache {
        waktu: sekarang,
        daftar: daftar.clone(),
        galat: galat.clone(),
    });
    (daftar, sekarang, teks_atau_null(&galat))
}

fn teks_atau_null(teks: &str) -> Value {
    if teks.is_empty() {
        Value::Null
    } else {
        json!(teks)
    }
}

/* ------------------------------------------------------------------ butir --- */

struct Kandidat {
    nama: String,
    target: String,
    sumber: &'static str,
    kunci: String,
}

impl Kandidat {
    fn baru(nama: &str, target: String, sumber: &'static str) -> Option<Self> {
        let nama = bersihkan_nama(nama);
        let kunci = kunci_nama(&nama);
        if nama.is_empty() || kunci.is_empty() {
            return None;
        }
        Some(Self {
            nama,
            target,
            sumber,
            kunci,
        })
    }

    fn json(&self) -> Value {
        let ikon = pilih_ikon(&self.nama, &self.target);
        let id = format!("a_{}", sidik8(&format!("{}|{}", self.nama, self.target)));
        json!({
            "id": id,
            "name": self.nama,
            "target": menentukan_target(&self.nama, &self.target),
            "icon": ikon,
            "sumber": self.sumber,
        })
    }
}

fn pindai_semua() -> (Vec<Kandidat>, String) {
    let mut butir = Vec::new();
    let mut galat = Vec::new();

    match pindai_klasik() {
        Ok(d) => butir.extend(d),
        Err(e) => galat.push(e),
    }
    match pindai_store() {
        Ok(d) => butir.extend(d),
        Err(e) => galat.push(e),
    }
    butir.extend(terkenal());

    let mut kunci = HashSet::new();
    butir.retain(|b| kunci.insert(b.kunci.clone()));

    let daftar = butir
        .into_iter()
        .filter(|b| !b.target.is_empty())
        .take(BATAS_BUTIR)
        .collect();
    (daftar, galat.join(" "))
}

/* ---------------------------------------------- sumber 2: aplikasi Store --- */

/// `Get-StartApps` memberi nama dan AppUserModelID untuk aplikasi Store maupun
/// desktop. Satu panggilan, di-cache 5 menit bersama hasil lain.
fn pindai_store() -> Result<Vec<Kandidat>, String> {
    let keluaran = std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            "Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress",
        ])
        .output();

    let out = match keluaran {
        Ok(o) => o,
        Err(e) => return Err(format!("Pemindaian aplikasi Start gagal: {e}.")),
    };
    if !out.status.success() {
        return Err("Pemindaian aplikasi Start gagal dijalankan.".into());
    }

    let teks = String::from_utf8_lossy(&out.stdout);
    let teks = teks.trim();
    if teks.is_empty() {
        return Ok(Vec::new());
    }
    let nilai: Value = match serde_json::from_str(teks) {
        Ok(v) => v,
        Err(_) => return Err("Daftar aplikasi Start tidak dapat dibaca.".into()),
    };
    let butir = match &nilai {
        Value::Array(a) => a.clone(),
        Value::Object(_) => vec![nilai.clone()],
        _ => Vec::new(),
    };

    let mut hasil = Vec::new();
    for b in butir {
        let nama = b.get("Name").and_then(|v| v.as_str()).unwrap_or("").trim();
        let app_id = b.get("AppID").and_then(|v| v.as_str()).unwrap_or("").trim();
        if nama.is_empty() || app_id.is_empty() {
            continue;
        }
        if lewati(nama) || sistem_store(nama) {
            continue;
        }
        let target = if app_id.contains('\\') && Path::new(app_id).is_file() {
            app_id.to_string()
        } else {
            format!("shell:AppsFolder\\{app_id}")
        };
        let sumber = if target.starts_with("shell:") {
            "store"
        } else {
            "klasik"
        };
        if let Some(k) = Kandidat::baru(nama, target, sumber) {
            hasil.push(k);
        }
        if hasil.len() >= BATAS_BUTIR {
            break;
        }
    }
    Ok(hasil)
}

fn sistem_store(nama: &str) -> bool {
    const AWALAN: [&str; 10] = [
        "settings",
        "cortana",
        "search",
        "security",
        "get help",
        "tips",
        "mixed reality",
        "quick assist",
        "phone link",
        "xbox game bar",
    ];
    let n = nama.to_lowercase();
    AWALAN.iter().any(|a| n.starts_with(a))
}

/* ------------------------------------------------- sumber 1: Start Menu --- */

fn akar_start_menu() -> Vec<PathBuf> {
    let mut hasil = Vec::new();
    if let Some(appdata) = std::env::var_os("APPDATA") {
        hasil.push(
            PathBuf::from(appdata)
                .join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs"),
        );
    }
    if let Some(programdata) = std::env::var_os("ProgramData") {
        hasil.push(
            PathBuf::from(programdata)
                .join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs"),
        );
    }
    hasil
}

fn pindai_klasik() -> Result<Vec<Kandidat>, String> {
    let mut hasil = Vec::new();
    let terpasang = Pintasan::baru();
    let Ok(pintasan) = terpasang else {
        return Err("COM IShellLink tidak tersedia sehingga pintasan Start Menu tidak dapat dibaca.".into());
    };

    for akar in akar_start_menu() {
        if !akar.is_dir() {
            continue;
        }
        for berkas in berkas_lnk(&akar, 0) {
            if hasil.len() >= BATAS_BUTIR {
                break;
            }
            let nama = berkas
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let Some(target) = pintasan.target(&berkas) else {
                continue;
            };
            if !target.to_ascii_lowercase().ends_with(".exe") || !Path::new(&target).is_file() {
                continue;
            }
            if lewati(&nama) || lewati(&target) {
                continue;
            }
            if let Some(k) = Kandidat::baru(&nama, target, "klasik") {
                hasil.push(k);
            }
        }
    }
    Ok(hasil)
}

fn berkas_lnk(akar: &Path, dalam: usize) -> Vec<PathBuf> {
    let mut hasil = Vec::new();
    if dalam > 4 {
        return hasil;
    }
    let Ok(baca) = std::fs::read_dir(akar) else {
        return hasil;
    };
    for e in baca.flatten() {
        let jalur = e.path();
        if jalur.is_dir() {
            hasil.extend(berkas_lnk(&jalur, dalam + 1));
        } else if jalur
            .extension()
            .map(|x| x.eq_ignore_ascii_case("lnk"))
            .unwrap_or(false)
        {
            hasil.push(jalur);
            if hasil.len() >= BATAS_BUTIR {
                break;
            }
        }
    }
    hasil
}

/// Satu objek ShellLink dipakai berulang pada satu thread.
struct Pintasan {
    link: IShellLinkW,
    persist: IPersistFile,
    _com: bool,
}

impl Pintasan {
    fn baru() -> Result<Self, ()> {
        /* Setiap pemindaian berjalan di thread sendiri; COM diinisialisasi
           sekali di sini dan dilepas saat objek jatuh. */
        let com = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok() };
        let hasil = unsafe {
            let kosong: Option<&windows::core::IUnknown> = None;
            CoCreateInstance::<_, IShellLinkW>(&ShellLink, kosong, CLSCTX_INPROC_SERVER)
        };
        let Ok(link) = hasil else {
            if com {
                unsafe { CoUninitialize() };
            }
            return Err(());
        };
        let persist: IPersistFile = link.cast().map_err(|_| {
            if com {
                unsafe { CoUninitialize() };
            }
        })?;
        Ok(Self {
            link,
            persist,
            _com: com,
        })
    }

    fn target(&self, berkas: &Path) -> Option<String> {
        let lebar: Vec<u16> = berkas.as_os_str().encode_wide().chain([0]).collect();
        unsafe {
            self.persist.Load(PCWSTR(lebar.as_ptr()), STGM_READ).ok()?;
            let mut buf = [0u16; 1024];
            self.link.GetPath(&mut buf, std::ptr::null_mut(), 0).ok()?;
            let akhir = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
            let teks = String::from_utf16_lossy(&buf[..akhir]);
            let teks = teks.trim().trim_matches('"').to_string();
            if teks.is_empty() {
                None
            } else {
                Some(teks)
            }
        }
    }
}

impl Drop for Pintasan {
    fn drop(&mut self) {
        if self._com {
            unsafe { CoUninitialize() };
        }
    }
}

/* ------------------------------------------- sumber 2: aplikasi terkenal --- */

fn terkenal() -> Vec<Kandidat> {
    let appdata = std::env::var_os("APPDATA").map(PathBuf::from);
    let lokal = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    let pf = std::env::var_os("ProgramFiles").map(PathBuf::from);
    let pfx86 = std::env::var_os("ProgramFiles(x86)").map(PathBuf::from);

    let ada = |akar: Option<PathBuf>, bagian: &[&str]| -> bool {
        let Some(mut p) = akar else { return false };
        for b in bagian {
            p.push(b);
        }
        p.is_file()
    };

    let mut hasil = Vec::new();
    if ada(appdata.clone(), &["Spotify", "Spotify.exe"]) {
        if let Some(k) = Kandidat::baru("Spotify", "spotify:".into(), "klasik") {
            hasil.push(k);
        }
    }
    if ada(lokal.clone(), &["Discord", "Update.exe"]) || ada(lokal, &["Discord", "Discord.exe"]) {
        if let Some(k) = Kandidat::baru("Discord", "discord:".into(), "klasik") {
            hasil.push(k);
        }
    }
    if ada(pfx86.clone(), &["Steam", "steam.exe"]) || ada(pf, &["Steam", "steam.exe"]) {
        if let Some(k) = Kandidat::baru("Steam", "steam:".into(), "klasik") {
            hasil.push(k);
        }
    }
    hasil
}

/* --------------------------------------------------------------- bentuk --- */

const LEWATI: [&str; 10] = [
    "uninstall",
    "uninst",
    "setup",
    "update",
    "readme",
    "help",
    "license",
    "documentation",
    "website",
    "changelog",
];

fn lewati(teks: &str) -> bool {
    let t = teks.to_lowercase();
    LEWATI.iter().any(|p| t.contains(p))
}

fn rapikan_spasi(teks: &str) -> String {
    teks.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn bersihkan_nama(nama: &str) -> String {
    let mut hasil = rapikan_spasi(nama);
    let kecil = hasil.to_lowercase();
    if let Some(potong) = kecil.strip_suffix(" - shortcut") {
        hasil.truncate(potong.len());
        hasil = hasil.trim().to_string();
    }
    if hasil.chars().count() > 40 {
        hasil = hasil.chars().take(40).collect::<String>().trim().to_string();
    }
    hasil
}

fn kunci_nama(nama: &str) -> String {
    rapikan_spasi(&nama.to_lowercase())
}

fn menentukan_target(nama: &str, target: &str) -> String {
    let n = nama.to_lowercase();
    if n.contains("spotify") {
        return "spotify:".into();
    }
    if n.contains("discord") {
        return "discord:".into();
    }
    if n.contains("steam") {
        return "steam:".into();
    }
    let rapi = n.trim().trim_start_matches("windows ").trim();
    if rapi == "settings" {
        return "ms-settings:".into();
    }
    target.to_string()
}

/// Heuristik ikon, urutan sama dengan `apps.js` 2.3.0.
fn pilih_ikon(nama: &str, target: &str) -> &'static str {
    let t = format!("{nama} {target}").to_lowercase();
    let aturan: [(&[&str], &'static str); 25] = [
        (&["spotify"], "i-play"),
        (&["discord"], "i-users"),
        (&["steam", "epic games", "gog galaxy", "gog"], "i-gamepad"),
        (
            &[
                "visual studio code",
                "vscode",
                "sublime",
                "notepad++",
                "intellij",
                "pycharm",
                "webstorm",
                "android studio",
                "opencode",
                "cursor",
                "code",
            ],
            "i-code",
        ),
        (
            &["chrome", "edge", "brave", "firefox", "opera", "vivaldi", "browser"],
            "i-globe",
        ),
        (&["notepad"], "i-file"),
        (&["calculator", "calc"], "i-plus"),
        (
            &[
                "paint", "photoshop", "gimp", "figma", "blender", "affinity", "canva",
                "inkscape", "krita", "obs", "image", "photo", "camera",
            ],
            "i-image",
        ),
        (
            &["vlc", "foobar", "itunes", "media player", "winamp", "music", "audio player"],
            "i-play",
        ),
        (
            &["terminal", "powershell", "cmd", "command prompt", "windows terminal"],
            "i-code",
        ),
        (&["explorer", "file manager"], "i-folder"),
        (&["word", "excel", "powerpoint", "libreoffice", "acrobat", "pdf"], "i-file"),
        (
            &[
                "whatsapp", "telegram", "signal", "zoom", "teams", "slack", "meet",
                "chatgpt", "claude",
            ],
            "i-users",
        ),
        (&["thunderbird", "outlook", "mail"], "i-mail"),
        (&["onedrive", "dropbox", "google drive", "cloud"], "i-cloud"),
        (&["todoist", "notion", "obsidian", "onenote", "evernote", "book"], "i-book"),
        (&["database", "sql", "mongodb", "redis"], "i-database"),
        (&["antivirus", "defender", "security", "vpn", "shield"], "i-shield"),
        (&["settings", "control panel"], "i-settings"),
        (&["volume", "realtek", "audio console"], "i-volume"),
        (&["chart", "statistic", "graph"], "i-chart-bar"),
        (&["notification", "alarm", "reminder"], "i-bell"),
        (&["game", "gaming", "roblox", "bloxstrap", "xbox"], "i-gamepad"),
        (&["power", "battery", "energy", "bolt"], "i-bolt"),
        (&[], "i-grid"),
    ];
    for (kata, ikon) in aturan {
        if ikon == "i-grid" || kata.iter().any(|k| t.contains(k)) {
            return ikon;
        }
    }
    "i-grid"
}

fn sidik8(teks: &str) -> String {
    /* FNV-1a 32-bit: cukup untuk id stabil, tanpa ketergantungan hash tambahan. */
    let mut h: u32 = 0x811c_9dc5;
    for b in teks.as_bytes() {
        h ^= *b as u32;
        h = h.wrapping_mul(0x0100_0193);
    }
    format!("{h:08x}")
}

/// Bandingkan nama seperti `localeCompare("id", { numeric: true })`: angka
/// dibandingkan sebagai bilangan, sisanya tanpa peduli besar-kecil huruf.
fn bandingkan_nama(a: &str, b: &str) -> std::cmp::Ordering {
    use std::cmp::Ordering;
    let (a, b) = (a.to_lowercase(), b.to_lowercase());
    let (av, bv): (Vec<char>, Vec<char>) = (a.chars().collect(), b.chars().collect());
    let (mut i, mut j) = (0, 0);
    while i < av.len() && j < bv.len() {
        let (da, db) = (av[i].is_ascii_digit(), bv[j].is_ascii_digit());
        if da && db {
            let (si, sj) = (i, j);
            while i < av.len() && av[i].is_ascii_digit() {
                i += 1;
            }
            while j < bv.len() && bv[j].is_ascii_digit() {
                j += 1;
            }
            let ta: String = av[si..i].iter().collect::<String>().trim_start_matches('0').to_string();
            let tb: String = bv[sj..j].iter().collect::<String>().trim_start_matches('0').to_string();
            match ta.len().cmp(&tb.len()).then_with(|| ta.cmp(&tb)) {
                Ordering::Equal => continue,
                lain => return lain,
            }
        }
        if !da && !db {
            let (si, sj) = (i, j);
            while i < av.len() && !av[i].is_ascii_digit() {
                i += 1;
            }
            while j < bv.len() && !bv[j].is_ascii_digit() {
                j += 1;
            }
            let ta: String = av[si..i].iter().collect();
            let tb: String = bv[sj..j].iter().collect();
            match ta.cmp(&tb) {
                Ordering::Equal => continue,
                lain => return lain,
            }
        }
        return a[i..].cmp(&b[j..]);
    }
    av.len().cmp(&bv.len())
}
