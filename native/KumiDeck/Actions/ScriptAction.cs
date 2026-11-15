using System.Diagnostics;
using System.IO;

namespace KumiDeck.Actions;

/* Menjalankan skrip lokal yang dipilih pengguna (.bat, .cmd, .ps1, .exe).
   Konfirmasi sekali per tombol ditangani KumiServer sebelum aksi ini dipanggil;
   skrip berjalan tanpa jendela konsol dan tanpa perantara PowerShell untuk
   .bat/.exe. */
internal static class ScriptAction
{
    private static readonly string[] Ekstensi = { ".bat", ".cmd", ".ps1", ".exe" };

    public static (bool Ok, string Pesan) Jalankan(string? target, string? args)
    {
        var jalur = Launch.Perluas(target);
        if (jalur.Length == 0) return (false, "Skrip belum dipilih.");
        if (!File.Exists(jalur)) return (false, "Berkas skrip tidak ditemukan.");

        var ext = Path.GetExtension(jalur).ToLowerInvariant();
        if (!Ekstensi.Contains(ext))
        {
            return (false, "Skrip harus berjenis .bat, .cmd, .ps1, atau .exe.");
        }

        try
        {
            var tambahan = string.IsNullOrWhiteSpace(args) ? "" : " " + args.Trim();
            ProcessStartInfo info = ext switch
            {
                ".ps1" => new ProcessStartInfo(
                    "powershell.exe",
                    "-NoProfile -ExecutionPolicy Bypass -File \"" + jalur + "\"" + tambahan),
                ".bat" or ".cmd" => new ProcessStartInfo("cmd.exe", "/c \"" + jalur + "\"" + tambahan),
                _ => new ProcessStartInfo(jalur, tambahan),
            };
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.WindowStyle = ProcessWindowStyle.Hidden;
            Process.Start(info)?.Dispose();
            return (true, "Skrip dijalankan: " + Path.GetFileName(jalur));
        }
        catch (Exception ex)
        {
            return (false, "Skrip gagal dijalankan: " + ex.Message);
        }
    }
}
