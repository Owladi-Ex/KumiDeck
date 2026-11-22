pub mod log;
pub mod paths;
pub mod waktu;

/// Jalankan proses anak tanpa jendela konsol.
///
/// Exe rilis tidak punya konsol sendiri, jadi tanpa bendera ini Windows
/// membuat jendela hitam sekilas setiap kali `curl`, `netsh`, `powershell`,
/// atau `shutdown` dipanggil.
pub fn tanpa_jendela(cmd: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}
