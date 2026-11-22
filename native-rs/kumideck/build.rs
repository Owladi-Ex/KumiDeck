//! Ikon dan keterangan versi untuk `KumiDeck.exe`.

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=../../assets/icon.ico");
    println!("cargo:rerun-if-changed=../../assets/tray32.rgba");

    #[cfg(target_os = "windows")]
    {
        let ikon = std::path::Path::new("../../assets/icon.ico");
        let mut res = winresource::WindowsResource::new();
        if ikon.exists() {
            res.set_icon(ikon.to_string_lossy().as_ref());
        }
        res.set("ProductName", "KumiDeck");
        res.set("FileDescription", "KumiDeck");
        res.set("CompanyName", "Owladi");
        res.set("LegalCopyright", "Owladi");
        res.set("OriginalFilename", "KumiDeck.exe");
        res.set("ProductVersion", "2.4.0");
        res.set("FileVersion", "2.4.0.0");
        if let Err(e) = res.compile() {
            println!("cargo:warning=ikon exe tidak tertanam: {e}");
        }
    }
}
