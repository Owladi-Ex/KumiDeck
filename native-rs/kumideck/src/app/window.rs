//! Jendela KumiDeck: tao + WebView2 (wry), tanpa caption Windows.
//! Tombol jendela ada di dalam UI dan mengirim perintah lewat IPC.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{json, Value};
use tao::dpi::{LogicalPosition, LogicalSize};
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy};
use tao::window::{Window, WindowBuilder};
use tray_icon::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    Icon, TrayIcon, TrayIconBuilder,
};
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
};
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS, MOD_ALT, MOD_CONTROL, MOD_SHIFT, MOD_WIN,
};
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, PeekMessageW, TranslateMessage, MSG, PM_REMOVE, WM_HOTKEY,
};
use wry::{WebView, WebViewBuilder};

use crate::server::state::App;

/// Peristiwa dari thread di luar jendela.
#[derive(Debug, Clone)]
pub enum Pesan {
    Pintasan,
    Menu(String),
}

const ID_PINTASAN: i32 = 0x4B44;

/// 32x32 RGBA dari `assets/icon.png`, ditanam supaya baki sistem tetap punya
/// ikon walau berkas gambar tidak ikut terpasang.
const IKON_TRAY: &[u8] = include_bytes!("../../../../assets/tray32.rgba");

#[derive(Debug, Clone)]
struct Geometri {
    x: f64,
    y: f64,
    lebar: f64,
    tinggi: f64,
}

impl Default for Geometri {
    fn default() -> Self {
        Self {
            x: 120.0,
            y: 80.0,
            lebar: 1180.0,
            tinggi: 760.0,
        }
    }
}

/// Tinggi jendela yang pas dengan baris tombol, bukan ruang kosong di bawahnya.
/// Lebar tetap seperti tersimpan; ubin persegi mengikuti lebar itu.
fn tinggi_pas(app: &App, lebar: f64) -> f64 {
    let profil = app.store.deck().profile;
    let kolom = profil.columns.clamp(1, 12) as f64;
    let baris = profil.rows.clamp(1, 12) as f64;
    // Sama dengan token --kd-rail-w/--kd-side-w. Panel kanan selalu tampil di
    // bagian Papan, jadi lebarnya ikut dihitung di semua ukuran.
    let rel = if lebar <= 900.0 { 56.0 } else { 68.0 };
    let panel = 296.0;
    let bingkai = 56.0 + 30.0; // kepala + kaki
    let tepi = 28.0; // padding .kd-view kiri dan kanan
    let jarak = 8.0;
    let ubin = ((lebar - rel - panel - tepi - jarak * (kolom - 1.0)) / kolom)
        .clamp(84.0, 168.0);
    (bingkai + tepi + baris * ubin + jarak * (baris - 1.0)).max(300.0)
}

fn berkas_geometri(app: &App) -> std::path::PathBuf {
    app.paths.jendela().join("jendela.json")
}

fn muat_geometri(app: &App) -> Geometri {
    let bawaan = || {
        let lebar = 1180.0;
        Geometri {
            tinggi: tinggi_pas(app, lebar),
            ..Geometri::default()
        }
    };
    let Ok(teks) = std::fs::read_to_string(berkas_geometri(app)) else {
        return bawaan();
    };
    let Ok(v) = serde_json::from_str::<Value>(&teks) else {
        return bawaan();
    };
    let ambil = |k: &str, b: f64| v.get(k).and_then(|x| x.as_f64()).unwrap_or(b);
    let lebar = ambil("lebar", 1180.0).max(720.0);
    // versi 1 (2.3.0/2.4.0 awal) menyimpan tinggi apa adanya; sekali saja
    // tinggi dirapatkan ke isi tombol, sesudah itu ukuran pilihan pengguna
    // dihormati lagi.
    let versi = v.get("versi").and_then(|x| x.as_i64()).unwrap_or(1);
    let tinggi = if versi < 2 {
        tinggi_pas(app, lebar)
    } else {
        ambil("tinggi", 760.0).max(300.0)
    };
    Geometri {
        x: ambil("x", 120.0),
        y: ambil("y", 80.0),
        lebar,
        tinggi,
    }
}

fn simpan_geometri(app: &App, w: &Window) {
    let pos = w.outer_position().ok();
    // Simpan ukuran dalam (inner), karena saat dimuat dipasang lewat
    // `with_inner_size`. Memakai outer_size membuat jendela membesar
    // beberapa piksel setiap kali dibuka.
    let ukuran = w.inner_size();
    let skala = w.scale_factor();
    let Some(p) = pos else { return };
    let (x, y, lebar, tinggi) = (
        p.x as f64 / skala,
        p.y as f64 / skala,
        ukuran.width as f64 / skala,
        ukuran.height as f64 / skala,
    );
    let v = json!({ "versi": 2, "x": x, "y": y, "lebar": lebar, "tinggi": tinggi });
    let _ = std::fs::create_dir_all(app.paths.jendela());
    let _ = std::fs::write(
        berkas_geometri(app),
        serde_json::to_string_pretty(&v).unwrap_or_default(),
    );
}

const SKRIP_JENDELA: &str = r#"
(() => {
  const pendengar = [];
  const jembatan = {
    postMessage: (m) => { try { window.ipc.postMessage(String(m)); } catch (e) {} },
    addEventListener: (t, f) => { if (t === 'message') pendengar.push(f); },
    __emit: (d) => pendengar.forEach((f) => { try { f({ data: d }); } catch (e) {} }),
    __siap: false
  };
  window.chrome = window.chrome || {};
  window.chrome.webview = window.chrome.webview || jembatan;
  window.__kdJendela = jembatan;
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { try { jembatan.postMessage('siap'); } catch (e) {} }, 250);
  });
})();
"#;

fn urai_pintasan(teks: &str) -> Option<(HOT_KEY_MODIFIERS, u32)> {
    let mut mods = HOT_KEY_MODIFIERS(0);
    let mut vk = None;
    for bagian in teks.to_lowercase().split('+').map(str::trim) {
        match bagian {
            "ctrl" | "control" => mods |= MOD_CONTROL,
            "alt" => mods |= MOD_ALT,
            "shift" => mods |= MOD_SHIFT,
            "win" => mods |= MOD_WIN,
            "" => {}
            lain => {
                let kode = if lain.len() == 1 {
                    let c = lain.chars().next().unwrap().to_ascii_uppercase();
                    if c.is_ascii_alphanumeric() {
                        c as u32
                    } else {
                        return None;
                    }
                } else {
                    match lain {
                        "space" | "spasi" => 0x20,
                        "f1" => 0x70,
                        "f2" => 0x71,
                        "f3" => 0x72,
                        "f4" => 0x73,
                        "f5" => 0x74,
                        "f6" => 0x75,
                        "f7" => 0x76,
                        "f8" => 0x77,
                        "f9" => 0x78,
                        "f10" => 0x79,
                        "f11" => 0x7A,
                        "f12" => 0x7B,
                        _ => return None,
                    }
                };
                if vk.is_some() {
                    return None;
                }
                vk = Some(kode);
            }
        }
    }
    if mods.0 == 0 {
        return None;
    }
    vk.map(|v| (mods, v))
}

/// Thread pintasan global. Membaca setelan tiap 120 ms supaya perubahan di
/// layar Setelan langsung berlaku tanpa membuka ulang aplikasi.
fn mulai_pintasan(app: Arc<App>, proxy: EventLoopProxy<Pesan>) {
    std::thread::spawn(move || {
        let mut terpasang: Option<String> = None;
        loop {
            let ingin = app.store.deck().settings.pintasan.trim().to_lowercase();
            if terpasang.as_deref() != Some(ingin.as_str()) {
                unsafe {
                    if terpasang.is_some() {
                        let _ = UnregisterHotKey(None, ID_PINTASAN);
                    }
                    terpasang = None;
                    if !ingin.is_empty() {
                        match urai_pintasan(&ingin) {
                            Some((mods, vk)) => {
                                if RegisterHotKey(None, ID_PINTASAN, mods, vk).is_ok() {
                                    terpasang = Some(ingin.clone());
                                } else {
                                    crate::core::log::warn(&format!(
                                        "pintasan {ingin} tidak bisa didaftarkan (dipakai aplikasi lain?)"
                                    ));
                                    terpasang = Some(ingin.clone());
                                }
                            }
                            None => {
                                crate::core::log::warn(&format!("pintasan tidak dikenal: {ingin}"));
                                terpasang = Some(ingin.clone());
                            }
                        }
                    }
                }
            }

            unsafe {
                let mut msg = MSG::default();
                while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                    if msg.message == WM_HOTKEY {
                        let _ = proxy.send_event(Pesan::Pintasan);
                    }
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            }
            std::thread::sleep(Duration::from_millis(120));
        }
    });
}

/// Salin teks ke clipboard Windows. Dipakai menu baki sistem.
fn salin_teks(teks: &str) {
    unsafe {
        if OpenClipboard(None).is_err() {
            return;
        }
        let _ = EmptyClipboard();
        let data: Vec<u16> = teks.encode_utf16().chain(std::iter::once(0)).collect();
        let bytes = data.len() * 2;
        if let Ok(handle) = GlobalAlloc(GMEM_MOVEABLE, bytes) {
            let ptr = GlobalLock(handle);
            if !ptr.is_null() {
                std::ptr::copy_nonoverlapping(data.as_ptr() as *const u8, ptr as *mut u8, bytes);
                let _ = GlobalUnlock(handle);
                // CF_UNICODETEXT = 13
                let _ = SetClipboardData(
                    13,
                    Some(windows::Win32::Foundation::HANDLE(handle.0)),
                );
            }
        }
        let _ = CloseClipboard();
    }
}

/// Ikon baki sistem: menu Buka, Buka di peramban, Salin tautan Remote, Keluar.
fn siapkan_tray(proxy: EventLoopProxy<Pesan>) -> Option<TrayIcon> {
    let buka = MenuItem::with_id("buka", "Buka KumiDeck", true, None);
    let peramban = MenuItem::with_id("peramban", "Buka di peramban", true, None);
    let salin = MenuItem::with_id("salin", "Salin tautan Remote", true, None);
    let keluar = MenuItem::with_id("keluar", "Keluar", true, None);
    let pisah = PredefinedMenuItem::separator();
    let menu = Menu::new();
    menu.append_items(&[&buka, &peramban, &salin, &pisah, &keluar])
        .ok()?;
    let ikon = Icon::from_rgba(IKON_TRAY.to_vec(), 32, 32).ok()?;
    let tray = TrayIconBuilder::new()
        .with_menu(Box::new(menu))
        .with_icon(ikon)
        .with_tooltip("KumiDeck")
        .build()
        .ok()?;
    // Menu dikirim lewat kanal global muda; teruskan ke thread jendela.
    std::thread::spawn(move || {
        while let Ok(ev) = MenuEvent::receiver().recv() {
            if proxy.send_event(Pesan::Menu(ev.id.0)).is_err() {
                break;
            }
        }
    });
    Some(tray)
}

pub fn jalankan(app: Arc<App>) -> ! {
    let geo = muat_geometri(&app);
    let event_loop = EventLoopBuilder::<Pesan>::with_user_event().build();
    let proxy = event_loop.create_proxy();
    mulai_pintasan(app.clone(), proxy);
    let url = format!("http://127.0.0.1:{}/", app.port);
    let tautan_remote = if app.https_port > 0 {
        format!(
            "https://{}:{}/remote?kode={}",
            app.lan, app.https_port, app.store.token
        )
    } else {
        format!(
            "http://{}:{}/remote?kode={}",
            app.lan, app.port, app.store.token
        )
    };
    let tray = siapkan_tray(event_loop.create_proxy());
    if tray.is_none() {
        crate::core::log::warn("ikon baki sistem tidak bisa dibuat");
    }
    let teratas = app.store.deck().settings.teratas;
    let ikon_jendela = tao::window::Icon::from_rgba(IKON_TRAY.to_vec(), 32, 32).ok();
    let window = Arc::new(
        WindowBuilder::new()
            .with_title("KumiDeck")
            .with_decorations(false)
            .with_resizable(true)
            .with_always_on_top(teratas)
            .with_window_icon(ikon_jendela)
            .with_inner_size(LogicalSize::new(geo.lebar, geo.tinggi))
            .with_position(LogicalPosition::new(geo.x, geo.y))
            .with_min_inner_size(LogicalSize::new(720.0, 300.0))
            .build(&event_loop)
            .expect("jendela KumiDeck tidak bisa dibuat"),
    );

    let _ = std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", app.paths.webview());

    let webview: Arc<Mutex<Option<WebView>>> = Arc::new(Mutex::new(None));
    let wv_untuk_ipc = webview.clone();
    let win_untuk_ipc = window.clone();
    let app_untuk_ipc = app.clone();

    let wv = WebViewBuilder::new()
        .with_url(url.clone())
        .with_initialization_script(SKRIP_JENDELA)
        .with_background_color((247, 247, 250, 255))
        .with_devtools(cfg!(debug_assertions))
        .with_ipc_handler(move |req: wry::http::Request<String>| {
            let pesan = req.body().trim().to_string();
            match pesan.as_str() {
                "minimalkan" => win_untuk_ipc.set_minimized(true),
                "maksimalkan" => {
                    let penuh = !win_untuk_ipc.is_maximized();
                    if penuh {
                        win_untuk_ipc.set_maximized(true);
                    } else {
                        win_untuk_ipc.set_maximized(false);
                    }
                    if let Some(w) = wv_untuk_ipc.lock().unwrap().as_ref() {
                        let _ = w.evaluate_script(if penuh {
                            "window.__kdJendela && window.__kdJendela.__emit('maks');"
                        } else {
                            "window.__kdJendela && window.__kdJendela.__emit('normal');"
                        });
                    }
                }
                "tutup" => {
                    simpan_geometri(&app_untuk_ipc, &win_untuk_ipc);
                    std::process::exit(0);
                }
                "geser" => {
                    let _ = win_untuk_ipc.drag_window();
                }
                "siap" => {
                    if let Some(w) = wv_untuk_ipc.lock().unwrap().as_ref() {
                        let _ = w.evaluate_script(
                            "window.__kdJendela && window.__kdJendela.__emit('siap');",
                        );
                    }
                }
                lain if lain.starts_with("teratas:") => {
                    let _ = win_untuk_ipc.set_always_on_top(lain.ends_with('1'));
                }
                lain if lain.starts_with("warna:") => {}
                lain if lain.starts_with("ukuran:") => {
                    // UI meminta jendela menyesuaikan isi papan. Saat jendela
                    // sedang dimaksimalkan, ukuran tidak boleh diubah.
                    if win_untuk_ipc.is_maximized() {
                        return;
                    }
                    let sisa = lain.trim_start_matches("ukuran:");
                    let mut bagian = sisa.split(':');
                    if let (Some(w), Some(h)) = (bagian.next(), bagian.next()) {
                        if let (Ok(w), Ok(h)) = (w.parse::<f64>(), h.parse::<f64>()) {
                            if w.is_finite() && h.is_finite() {
                                let _ = win_untuk_ipc.set_inner_size(LogicalSize::new(
                                    w.clamp(720.0, 2400.0),
                                    h.clamp(300.0, 2000.0),
                                ));
                            }
                        }
                    }
                }
                _ => crate::core::log::warn(&format!("perintah jendela tidak dikenal: {pesan}")),
            }
        })
        .build(&*window)
        .expect("WebView2 tidak bisa dibuat. Pastikan Edge WebView2 Runtime terpasang.");
    *webview.lock().unwrap() = Some(wv);

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        // Baki sistem harus hidup selama jendela hidup.
        let _ = &tray;
        match event {
            Event::UserEvent(Pesan::Pintasan) => {
                let tampil = window.is_visible();
                window.set_visible(!tampil);
                if !tampil {
                    window.set_focus();
                }
            }
            Event::UserEvent(Pesan::Menu(aksi)) => match aksi.as_str() {
                "buka" => {
                    window.set_visible(true);
                    window.set_focus();
                }
                "peramban" => {
                    if let Err(e) = crate::actions::proses::buka(&url) {
                        crate::core::log::warn(&e);
                    }
                }
                "salin" => salin_teks(&tautan_remote),
                "keluar" => {
                    simpan_geometri(&app, &window);
                    *control_flow = ControlFlow::Exit;
                }
                lain => crate::core::log::warn(&format!("menu baki tidak dikenal: {lain}")),
            },
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => {
                simpan_geometri(&app, &window);
                *control_flow = ControlFlow::Exit;
            }
            Event::LoopDestroyed => {
                simpan_geometri(&app, &window);
            }
            _ => {}
        }
    })
}
