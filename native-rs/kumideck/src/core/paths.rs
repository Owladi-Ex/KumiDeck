//! Folder aplikasi. Padanan `native/KumiDeck/Core/AppPaths.cs`.
//! Versi portabel: `data/` di samping exe; kalau tidak bisa ditulis, jatuh ke
//! `%LOCALAPPDATA%\KumiDeck\data`.

use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct Paths {
    pub root: PathBuf,
    pub data: PathBuf,
    pub portabel: bool,
}

impl Paths {
    pub fn init() -> Self {
        let root = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(Path::to_path_buf))
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

        let (data, portabel) = if bisa_ditulis(&root) {
            (root.join("data"), true)
        } else {
            let lokal = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| root.display().to_string());
            (PathBuf::from(lokal).join("KumiDeck").join("data"), false)
        };

        let paths = Self {
            root,
            data,
            portabel,
        };
        for d in [
            paths.data.clone(),
            paths.ikon(),
            paths.suara(),
            paths.tls(),
            paths.jendela(),
            paths.webview(),
            paths.cadangan(),
        ] {
            let _ = std::fs::create_dir_all(d);
        }
        paths
    }

    pub fn ikon(&self) -> PathBuf {
        self.data.join("ikon")
    }
    pub fn suara(&self) -> PathBuf {
        self.data.join("suara")
    }
    pub fn tls(&self) -> PathBuf {
        self.data.join("tls")
    }
    pub fn jendela(&self) -> PathBuf {
        self.data.join("jendela")
    }
    pub fn webview(&self) -> PathBuf {
        self.data.join("webview2")
    }
    pub fn cadangan(&self) -> PathBuf {
        self.data.join("cadangan")
    }
    pub fn deck_berkas(&self) -> PathBuf {
        self.data.join("deck.json")
    }
    pub fn rahasia_berkas(&self) -> PathBuf {
        self.data.join("secret.json")
    }
    pub fn log_berkas(&self) -> PathBuf {
        self.data.join("kumideck.log")
    }
}

fn bisa_ditulis(dir: &Path) -> bool {
    let uji = dir.join(format!(".kd-uji-{}", &uuid::Uuid::new_v4().simple().to_string()[..8]));
    match std::fs::File::create(&uji) {
        Ok(_) => {
            let _ = std::fs::remove_file(&uji);
            true
        }
        Err(_) => false,
    }
}
