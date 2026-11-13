using System.IO;
using Microsoft.Win32;

namespace KumiDeck.Platform;

public sealed record HasilAutostart(bool Ok, bool Aktif, string? Alasan = null);

/* Jalan otomatis saat Windows menyala, lewat HKCU\...\CurrentVersion\Run
   (tanpa hak admin). Pintasan .lnk lama dari versi Node dibersihkan. */
public static class Autostart
{
    private const string KunciRun = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string Nama = "KumiDeck";

    public static bool Aktif()
    {
        try
        {
            using var kunci = Registry.CurrentUser.OpenSubKey(KunciRun, false);
            var nilai = kunci?.GetValue(Nama) as string;
            if (string.IsNullOrWhiteSpace(nilai)) return false;

            var exe = BersihkanKutip(nilai);
            return File.Exists(exe);
        }
        catch
        {
            return false;
        }
    }

    public static HasilAutostart Atur(bool aktif)
    {
        try
        {
            HapusPintasanLama();

            using var kunci = Registry.CurrentUser.CreateSubKey(KunciRun, true);
            if (kunci is null)
            {
                return new HasilAutostart(false, false, "Kunci registry mulai otomatis tidak dapat dibuka.");
            }

            if (!aktif)
            {
                kunci.DeleteValue(Nama, false);
                return new HasilAutostart(true, false);
            }

            var exe = Environment.ProcessPath;
            if (string.IsNullOrWhiteSpace(exe) || !File.Exists(exe))
            {
                return new HasilAutostart(false, false, "Lokasi KumiDeck.exe tidak ditemukan.");
            }

            kunci.SetValue(Nama, "\"" + exe + "\"", RegistryValueKind.String);
            return new HasilAutostart(true, true);
        }
        catch (Exception ex)
        {
            return new HasilAutostart(false, false, "Mulai otomatis gagal diatur: " + ex.Message);
        }
    }

    private static string BersihkanKutip(string nilai)
    {
        var bersih = nilai.Trim();
        if (bersih.Length >= 2 && bersih[0] == '"' && bersih[^1] == '"') bersih = bersih[1..^1];
        var pisah = bersih.IndexOf("\" ", StringComparison.Ordinal);
        if (pisah > 0) bersih = bersih[..pisah];
        return bersih;
    }

    /* Versi lama memakai pintasan di folder Startup. Hapus supaya tidak ada
       dua entri yang menjalankan KumiDeck sekaligus. */
    private static void HapusPintasanLama()
    {
        try
        {
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            var berkas = Path.Combine(
                appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "KumiDeck.lnk");
            if (File.Exists(berkas)) File.Delete(berkas);
        }
        catch
        {
            /* bukan masalah besar */
        }
    }
}
