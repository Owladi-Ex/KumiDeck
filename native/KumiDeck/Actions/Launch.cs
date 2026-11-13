using System.Diagnostics;
using System.Text.RegularExpressions;

namespace KumiDeck.Actions;

/* Membuka aplikasi, berkas, folder, URL, atau target shell: dengan ShellExecute.
   Tidak ada PowerShell: Windows sendiri yang menyelesaikan targetnya. */
internal static class Launch
{
    private static readonly Regex Variabel = new(@"%([^%]+)%", RegexOptions.Compiled);

    public static string Perluas(string? target)
    {
        var hasil = (target ?? "").Trim();
        if (hasil.Length == 0) return hasil;

        hasil = Variabel.Replace(hasil, cocok =>
        {
            var nama = cocok.Groups[1].Value;
            var nilai = Environment.GetEnvironmentVariable(nama);
            if (nilai is null)
            {
                foreach (System.Collections.DictionaryEntry entri in Environment.GetEnvironmentVariables())
                {
                    if (string.Equals(entri.Key as string, nama, StringComparison.OrdinalIgnoreCase))
                    {
                        nilai = entri.Value as string;
                        break;
                    }
                }
            }
            return nilai ?? cocok.Value;
        });

        if (hasil.StartsWith('~'))
        {
            var rumah = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (rumah.Length > 0) hasil = rumah + hasil[1..];
        }
        return hasil;
    }

    public static (bool Ok, string Pesan) Buka(string? target)
    {
        var jalur = Perluas(target);
        if (jalur.Length == 0) return (false, "Target buka kosong.");

        try
        {
            /* shell:AppsFolder dan protokol khusus harus lewat explorer.exe. */
            if (jalur.StartsWith("shell:", StringComparison.OrdinalIgnoreCase))
            {
                var info = new ProcessStartInfo("explorer.exe", "\"" + jalur + "\"")
                {
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                };
                Process.Start(info)?.Dispose();
                return (true, "Membuka " + jalur);
            }

            Process.Start(new ProcessStartInfo(jalur) { UseShellExecute = true })?.Dispose();
            return (true, "Membuka " + jalur);
        }
        catch (Exception ex)
        {
            return (false, "Tidak dapat membuka " + jalur + ": " + ex.Message);
        }
    }
}
