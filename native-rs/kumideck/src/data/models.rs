//! Bentuk data papan (deck.json) — padanan `native/KumiDeck/Data/Models.cs`.
//! Nama bidang JSON dipertahankan persis supaya papan 2.3.0 terbaca apa adanya.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Deck {
    #[serde(default = "satu")]
    pub version: i64,
    #[serde(default)]
    pub profile: Profil,
    #[serde(default)]
    pub pages: Vec<Halaman>,
    #[serde(default)]
    pub otomatis: Vec<AturanOtomatis>,
    #[serde(default)]
    pub soundboard: Vec<SuaraItem>,
    #[serde(default)]
    pub settings: Setelan,
}

fn satu() -> i64 {
    1
}

impl Default for Deck {
    fn default() -> Self {
        Self {
            version: 1,
            profile: Profil::default(),
            pages: vec![Halaman::default()],
            otomatis: Vec::new(),
            soundboard: Vec::new(),
            settings: Setelan::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profil {
    #[serde(default = "meja")]
    pub name: String,
    #[serde(default = "lima")]
    pub columns: i64,
    #[serde(default = "tiga")]
    pub rows: i64,
}

fn meja() -> String {
    "Meja Kerja".into()
}
fn lima() -> i64 {
    5
}
fn tiga() -> i64 {
    3
}

impl Default for Profil {
    fn default() -> Self {
        Self {
            name: meja(),
            columns: 5,
            rows: 3,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Halaman {
    #[serde(default)]
    pub id: String,
    #[serde(default = "halaman")]
    pub name: String,
    #[serde(default = "seratus")]
    pub skala: i64,
    #[serde(default)]
    pub warna: String,
    #[serde(default)]
    pub keys: Vec<Option<Tombol>>,
}

fn halaman() -> String {
    "Halaman".into()
}
fn seratus() -> i64 {
    100
}

impl Default for Halaman {
    fn default() -> Self {
        Self {
            id: "h1".into(),
            name: halaman(),
            skala: 100,
            warna: String::new(),
            keys: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tombol {
    #[serde(default)]
    pub id: String,
    #[serde(default = "tombol")]
    pub label: String,
    #[serde(default = "grid")]
    pub icon: String,
    #[serde(default = "default_variant")]
    pub variant: String,
    #[serde(default)]
    pub warna: Option<Warna>,
    #[serde(default)]
    pub widget: Option<Widget>,
    #[serde(default, rename = "tandaiAktif")]
    pub tandai_aktif: Option<Penanda>,
    #[serde(default)]
    pub span: Option<Rentang>,
    #[serde(default)]
    pub action: Aksi,
    #[serde(default, rename = "actionKedua")]
    pub action_kedua: Option<Aksi>,
    /// Tombol folder: membuka kumpulan tombol anak, bukan menjalankan aksi.
    #[serde(default)]
    pub folder: bool,
    #[serde(default)]
    pub keys: Vec<Option<Tombol>>,
    /// Syarat tampil/jalan yang lebih kaya daripada `Aksi.syarat`.
    #[serde(default)]
    pub kondisi: Option<Kondisi>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Kondisi {
    #[serde(default)]
    pub jenis: String,
    #[serde(default)]
    pub nilai: String,
}

fn tombol() -> String {
    "Tombol".into()
}
fn grid() -> String {
    "i-grid".into()
}
fn default_variant() -> String {
    "default".into()
}

impl Default for Tombol {
    fn default() -> Self {
        Self {
            id: String::new(),
            label: tombol(),
            icon: grid(),
            variant: default_variant(),
            warna: None,
            widget: None,
            tandai_aktif: None,
            span: None,
            action: Aksi::kosong(),
            action_kedua: None,
            folder: false,
            keys: Vec::new(),
            kondisi: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Rentang {
    #[serde(default = "satu_i")]
    pub c: i64,
    #[serde(default = "satu_i")]
    pub r: i64,
}

fn satu_i() -> i64 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Warna {
    #[serde(default)]
    pub bg: String,
    #[serde(default)]
    pub fg: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Widget {
    #[serde(default = "jam", rename = "type")]
    pub tipe: String,
}

fn jam() -> String {
    "jam".into()
}

impl Default for Widget {
    fn default() -> Self {
        Self { tipe: jam() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Penanda {
    #[serde(default)]
    pub proses: String,
    #[serde(default)]
    pub jendela: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Syarat {
    #[serde(default)]
    pub proses: String,
    #[serde(default)]
    pub jendela: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HeaderHttp {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Langkah {
    #[serde(default)]
    pub delay: i64,
    #[serde(default)]
    pub action: Aksi,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Aksi {
    #[serde(default = "kosong_tipe", rename = "type")]
    pub tipe: String,
    #[serde(default)]
    pub combo: Option<String>,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub target: Option<String>,
    #[serde(default)]
    pub method: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub headers: Option<Vec<HeaderHttp>>,
    #[serde(default)]
    pub cmd: Option<String>,
    #[serde(default)]
    pub args: Option<String>,
    #[serde(default)]
    pub izin: bool,
    #[serde(default, rename = "pageId")]
    pub page_id: Option<String>,
    #[serde(default)]
    pub steps: Option<Vec<Langkah>>,
    #[serde(default, rename = "soundId")]
    pub sound_id: Option<String>,
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub nilai: Option<i64>,
    #[serde(default)]
    pub syarat: Option<Syarat>,
    #[serde(default)]
    pub aktif: Option<Box<Aksi>>,
    #[serde(default, rename = "tidakAktif")]
    pub tidak_aktif: Option<Box<Aksi>>,
}

fn kosong_tipe() -> String {
    "kosong".into()
}

impl Default for Aksi {
    fn default() -> Self {
        Self::kosong()
    }
}

impl Aksi {
    pub fn kosong() -> Self {
        Self {
            tipe: kosong_tipe(),
            combo: None,
            text: None,
            target: None,
            method: None,
            url: None,
            body: None,
            headers: None,
            cmd: None,
            args: None,
            izin: false,
            page_id: None,
            steps: None,
            sound_id: None,
            mode: None,
            nilai: None,
            syarat: None,
            aktif: None,
            tidak_aktif: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AturanOtomatis {
    #[serde(default)]
    pub proses: String,
    #[serde(default)]
    pub jendela: String,
    #[serde(default, rename = "pageId")]
    pub page_id: String,
    #[serde(default = "benar")]
    pub aktif: bool,
}

fn benar() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuaraItem {
    #[serde(default)]
    pub id: String,
    #[serde(default = "suara")]
    pub name: String,
    #[serde(default)]
    pub sumber: String,
    #[serde(default = "berkas")]
    pub jenis: String,
    #[serde(default = "seratus")]
    pub volume: i64,
}

fn suara() -> String {
    "Suara".into()
}
fn berkas() -> String {
    "berkas".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Setelan {
    #[serde(default = "benar")]
    pub sound: bool,
    #[serde(default)]
    pub home: String,
    #[serde(default)]
    pub terkunci: bool,
    #[serde(default)]
    pub teratas: bool,
    #[serde(default, rename = "autoProfil")]
    pub auto_profile: bool,
    #[serde(default, rename = "mulaiOtomatis")]
    pub mulai_otomatis: bool,
    #[serde(default)]
    pub aksen: String,
    #[serde(default)]
    pub aksen2: String,
    /// Pintasan global tampil/sembunyikan, mis. `ctrl+alt+k`. Kosong = mati.
    #[serde(default)]
    pub pintasan: String,
    /// HTTPS di port 4174. Dibaca saat aplikasi mulai.
    #[serde(default = "benar")]
    pub https: bool,
    /// Periksa rilis baru di GitHub saat aplikasi dibuka.
    #[serde(default = "benar", rename = "periksaPembaruan")]
    pub periksa_pembaruan: bool,
}

impl Default for Setelan {
    fn default() -> Self {
        Self {
            sound: true,
            home: String::new(),
            terkunci: false,
            teratas: false,
            auto_profile: false,
            mulai_otomatis: false,
            aksen: String::new(),
            aksen2: String::new(),
            pintasan: String::new(),
            https: true,
            periksa_pembaruan: true,
        }
    }
}
