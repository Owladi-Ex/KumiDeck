using System.IO;
using System.Text;

namespace KumiDeck.Core;

/* Log ringan: selalu ke berkas (data/kumideck.log) dan ke debugger saat dev.
   Tidak ada konsol karena aplikasi berjalan sebagai aplikasi jendela. */
public static class Log
{
    private static readonly object Kunci = new();
    private static string _berkas = "";
    private static bool _siap;

    public static void Initialize()
    {
        _berkas = AppPaths.LogBerkas;
        _siap = true;
        try
        {
            if (File.Exists(_berkas) && new FileInfo(_berkas).Length > 1024 * 1024)
            {
                var lama = _berkas + ".lama";
                File.Move(_berkas, lama, true);
            }
        }
        catch
        {
            /* diabaikan */
        }
    }

    public static void Info(string pesan) => Tulis("info", pesan);
    public static void Warn(string pesan) => Tulis("warn", pesan);

    public static void Error(string pesan, Exception? ex = null)
    {
        Tulis("error", ex == null ? pesan : pesan + ": " + ex);
    }

    private static void Tulis(string tingkat, string pesan)
    {
        var baris = DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss.fff") + " [" + tingkat + "] " + pesan;
        System.Diagnostics.Debug.WriteLine(baris);
        if (!_siap) return;
        lock (Kunci)
        {
            try
            {
                File.AppendAllText(_berkas, baris + Environment.NewLine, Encoding.UTF8);
            }
            catch
            {
                /* diabaikan */
            }
        }
    }
}
