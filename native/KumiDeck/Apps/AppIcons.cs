using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace KumiDeck.Apps;

public sealed record IkonHasil(bool Ok, string? Id = null, string? Berkas = null, int Lebar = 128, int Tinggi = 128, string? Sumber = null, string? Exe = null, string? Alasan = null);

/* Ikon asli aplikasi terpasang.

   Mengambil ikon dari berkas .exe (atau dari pintasan .lnk yang ditunjuk)
   lewat System.Drawing, lalu menyimpannya sebagai PNG 128×128 transparan di
   folder tujuan. Hasil di-cache 10 menit di memori agar aplikasi yang sama
   tidak diekstrak berulang. Tidak pernah melempar galat. */
public static class AppIcons
{
    private const long UmurCacheMs = 10 * 60 * 1000;

    private static readonly object Kunci = new();

    /* Satu ekstraksi ikon sekaligus: System.Drawing/GDI+ dan COM tidak perlu
       dijalankan paralel, dan dua permintaan untuk target yang sama tidak
       menulis berkas yang sama bersamaan. */
    private static readonly SemaphoreSlim Gerbang = new(1, 1);

    /* target -> (hasil, kedaluwarsa). */
    private static readonly Dictionary<string, (IkonHasil Hasil, long Kedaluwarsa)> Cache =
        new(StringComparer.Ordinal);

    /* Peta aplikasi terkenal yang targetnya protokol/URI (bukan .exe). */
    private static readonly Dictionary<string, string[]> PetaProtokol =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["spotify:"] = new[] { @"%APPDATA%\Spotify\Spotify.exe" },
            ["discord:"] = new[]
            {
                @"%LOCALAPPDATA%\Discord\Update.exe",
                @"%LOCALAPPDATA%\Discord\Discord.exe",
            },
            ["steam:"] = new[]
            {
                @"C:\Program Files (x86)\Steam\steam.exe",
                @"C:\Program Files\Steam\steam.exe",
            },
        };

    private static readonly Regex PolaHttp = new(
        "^https?:",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex PolaShell = new(
        "^shell:",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex PolaProtokol = new(
        @"^[a-z][a-z0-9+.-]*:$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex PolaSpasi = new(
        @"\s+",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    /* API publik: target = jalur .exe/.lnk, nama di PATH, atau protokol
       (spotify:, discord:, steam:). Hasil disimpan sebagai PNG di tujuanDir. */
    public static async Task<IkonHasil> IkonAplikasiAsync(string target, string tujuanDir)
    {
        var mentah = (target ?? "").Trim();
        if (mentah.Length == 0) return new IkonHasil(false, Alasan: "Target aplikasi kosong.");

        /* Cache memori: hindari ekstraksi ulang aplikasi yang sama. */
        lock (Kunci)
        {
            if (Cache.TryGetValue(mentah, out var tersimpan))
            {
                if (SekarangMs() < tersimpan.Kedaluwarsa) return tersimpan.Hasil;
                Cache.Remove(mentah);
            }
        }

        if (!OperatingSystem.IsWindows())
            return new IkonHasil(false, Alasan: "Ikon aplikasi hanya tersedia di Windows.");

        IkonHasil hasil;
        try
        {
            /* Pekerjaan berat (COM + System.Drawing) di luar utas pemanggil. */
            await Gerbang.WaitAsync().ConfigureAwait(false);
            try
            {
                /* Periksa cache lagi: permintaan lain mungkin sudah selesai
                   saat menunggu gerbang. */
                lock (Kunci)
                {
                    if (Cache.TryGetValue(mentah, out var tersimpan))
                    {
                        if (SekarangMs() < tersimpan.Kedaluwarsa) return tersimpan.Hasil;
                        Cache.Remove(mentah);
                    }
                }

                hasil = await Task.Run(() => Kerjakan(mentah, tujuanDir)).ConfigureAwait(false);
            }
            finally
            {
                Gerbang.Release();
            }
        }
        catch (Exception ex)
        {
            hasil = new IkonHasil(false, Alasan: $"Ikon tidak dapat diekstrak. {PesanRamah(ex)}");
        }

        lock (Kunci)
        {
            BersihkanCache();
            Cache[mentah] = (hasil, SekarangMs() + UmurCacheMs);
        }

        return hasil;
    }

    /* ------------------------------------------------------------- pekerjaan --- */

    private static IkonHasil Kerjakan(string target, string tujuanDir)
    {
        var exe = CariExe(target);
        if (exe.Length == 0)
        {
            return new IkonHasil(
                false,
                Alasan: "Aplikasi ini tidak punya berkas .exe yang bisa dibaca ikonnya.");
        }

        var id = IdUntuk(target + "|" + exe);
        var folder = string.IsNullOrWhiteSpace(tujuanDir)
            ? Path.Combine(Path.GetTempPath(), "kumideck-ikon")
            : tujuanDir.Trim();

        string tujuan;
        try
        {
            tujuan = Path.Combine(folder, id + ".png");
        }
        catch
        {
            return new IkonHasil(false, Alasan: "Folder ikon tidak dapat dibuat.");
        }

        /* Berkas yang sudah ada dan berisi tidak perlu diekstrak ulang. */
        if (BerkasBerisi(tujuan))
            return new IkonHasil(true, id, tujuan, 128, 128, "exe", exe);

        try
        {
            Directory.CreateDirectory(folder);
        }
        catch
        {
            return new IkonHasil(false, Alasan: "Folder ikon tidak dapat dibuat.");
        }

        try
        {
            SimpanIkon(exe, tujuan);
            if (!BerkasBerisi(tujuan))
                return new IkonHasil(false, Alasan: "Ikon aplikasi tidak dapat disimpan.");

            return new IkonHasil(true, id, tujuan, 128, 128, "exe", exe);
        }
        catch (Exception ex)
        {
            return new IkonHasil(false, Alasan: $"Ikon tidak dapat diekstrak. {PesanRamah(ex)}");
        }
    }

    /* Resolusi target → jalur .exe. String kosong berarti tidak ada exe yang
       bisa dibaca (UWP/protokol lain). */
    private static string CariExe(string target)
    {
        if (target.Length == 0) return "";
        if (PolaHttp.IsMatch(target)) return "";

        if (PetaProtokol.TryGetValue(target, out var calon))
        {
            foreach (var satu in calon)
            {
                var jalur = Perluas(satu);
                if (jalur.Contains('*')) continue;
                if (BerkasBerisi(jalur)) return jalur;
            }
        }

        /* UWP / protocol lain: tidak ada exe yang bisa diekstrak. */
        if (PolaShell.IsMatch(target) || PolaProtokol.IsMatch(target)) return "";

        var diperluas = Perluas(target);
        if (diperluas.Length == 0) return "";

        if (diperluas.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase) && File.Exists(diperluas))
        {
            using var pintasan = PintasanShell.CobaBuat();
            var dituju = pintasan?.TargetDari(diperluas);
            if (!string.IsNullOrEmpty(dituju) && File.Exists(dituju)) return dituju;
            return "";
        }

        if (diperluas.Contains('\\') || diperluas.Contains('/'))
            return File.Exists(diperluas) ? diperluas : "";

        /* Nama aplikasi di PATH (mis. notepad). */
        var path = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (var dir in path.Split(';', StringSplitOptions.RemoveEmptyEntries))
        {
            var akar = dir.Trim().Trim('"');
            if (akar.Length == 0) continue;

            foreach (var ext in new[] { ".exe", "" })
            {
                try
                {
                    var kandidat = Path.Combine(
                        akar,
                        diperluas.EndsWith(ext, StringComparison.OrdinalIgnoreCase)
                            ? diperluas
                            : diperluas + ext);

                    if (File.Exists(kandidat)) return kandidat;
                }
                catch
                {
                    /* jalur PATH tidak sah: lanjut */
                }
            }
        }

        return "";
    }

    /* Perluas %VAR% seperti Node (variabel tak dikenal dibiarkan apa adanya). */
    private static string Perluas(string jalur)
    {
        try
        {
            return Environment.ExpandEnvironmentVariables(jalur).Trim();
        }
        catch
        {
            return jalur.Trim();
        }
    }

    /* Ekstrak ikon exe lalu gambar ke Bitmap 128×128 transparan dan simpan PNG. */
    private static void SimpanIkon(string exe, string tujuan)
    {
        using var ikon = BacaIkon(exe);
        using var asli = ikon.ToBitmap();
        using var bitmap = new Bitmap(128, 128, PixelFormat.Format32bppArgb);
        using (var grafis = Graphics.FromImage(bitmap))
        {
            grafis.InterpolationMode = InterpolationMode.HighQualityBicubic;
            grafis.SmoothingMode = SmoothingMode.HighQuality;
            grafis.PixelOffsetMode = PixelOffsetMode.HighQuality;
            grafis.CompositingQuality = CompositingQuality.HighQuality;
            grafis.Clear(Color.Transparent);
            grafis.DrawImage(asli, 0, 0, 128, 128);
        }

        bitmap.Save(tujuan, ImageFormat.Png);
    }

    /* Ikon besar dari exe; jatuh ke ikon terkait bila ukuran 128 tidak ada. */
    private static Icon BacaIkon(string exe)
    {
        Icon? ikon = null;
        try
        {
            ikon = new Icon(exe, 128, 128);
        }
        catch
        {
            /* exe tidak menyimpan ikon .ico besar: coba cara kedua */
        }

        if (ikon is null)
        {
            try
            {
                ikon = Icon.ExtractAssociatedIcon(exe);
            }
            catch
            {
                ikon = null;
            }
        }

        if (ikon is null)
            throw new InvalidOperationException("Ikon aplikasi tidak dapat dibaca.");

        return ikon;
    }

    /* ---------------------------------------------------------------- bantu --- */

    private static string IdUntuk(string teks)
    {
        var bita = SHA1.HashData(Encoding.UTF8.GetBytes(teks));
        return "kst_" + Convert.ToHexString(bita.AsSpan(0, 4)).ToLowerInvariant();
    }

    private static bool BerkasBerisi(string jalur)
    {
        try
        {
            var info = new FileInfo(jalur);
            return info.Exists && info.Length > 0;
        }
        catch
        {
            return false;
        }
    }

    private static long SekarangMs() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    /* Buang entri kedaluwarsa bila cache membengkak. */
    private static void BersihkanCache()
    {
        if (Cache.Count < 200) return;
        var sekarang = SekarangMs();
        var basi = new List<string>();
        foreach (var pasangan in Cache)
        {
            if (sekarang >= pasangan.Value.Kedaluwarsa) basi.Add(pasangan.Key);
        }

        foreach (var kunci in basi) Cache.Remove(kunci);
        if (Cache.Count >= 400) Cache.Clear();
    }

    /* Ringkas galat tak terduga menjadi satu baris. */
    private static string PesanRamah(Exception ex)
    {
        var teks = ex is AggregateException agg && agg.InnerException is not null
            ? agg.InnerException.Message
            : ex.Message;
        teks = PolaSpasi.Replace(teks ?? "", " ").Trim();
        if (teks.Length == 0) teks = ex.GetType().Name;
        if (teks.Length > 200) teks = teks[..200].Trim();
        return teks;
    }
}
