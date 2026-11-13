using System.IO;

namespace KumiDeck.Core;

/* Menentukan folder aplikasi (tempat data/ disimpan) dan folder berkas web.
   Versi portabel: data/ di samping exe. Bila folder itu tidak bisa ditulis
   (mis. dipasang di Program Files), data dipindah ke %LOCALAPPDATA%\KumiDeck. */
public static class AppPaths
{
    public static string Root { get; private set; } = AppContext.BaseDirectory;
    public static string Data { get; private set; } = Path.Combine(AppContext.BaseDirectory, "data");
    public static bool Portabel { get; private set; } = true;

    public static string Ikon => Path.Combine(Data, "ikon");
    public static string Suara => Path.Combine(Data, "suara");
    public static string Tls => Path.Combine(Data, "tls");
    public static string Jendela => Path.Combine(Data, "jendela");
    public static string WebView => Path.Combine(Data, "webview2");
    public static string DeckBerkas => Path.Combine(Data, "deck.json");
    public static string RahasiaBerkas => Path.Combine(Data, "secret.json");
    public static string LogBerkas => Path.Combine(Data, "kumideck.log");

    public static void Initialize()
    {
        Root = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        if (string.IsNullOrWhiteSpace(Root)) Root = Environment.CurrentDirectory;

        var portabel = Path.Combine(Root, "data");
        if (BisaDitulis(Root))
        {
            Data = portabel;
            Portabel = true;
        }
        else
        {
            var lokal = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            Data = Path.Combine(lokal, "KumiDeck", "data");
            Portabel = false;
        }

        foreach (var dir in new[] { Data, Ikon, Suara, Tls, Jendela, WebView })
        {
            try
            {
                Directory.CreateDirectory(dir);
            }
            catch
            {
                /* folder lain akan gagal dengan pesan yang lebih jelas saat dipakai */
            }
        }
    }

    private static bool BisaDitulis(string dir)
    {
        try
        {
            var uji = Path.Combine(dir, ".kd-uji-" + Guid.NewGuid().ToString("N")[..8]);
            using (var fs = File.Create(uji, 1, FileOptions.DeleteOnClose)) { }
            return true;
        }
        catch
        {
            return false;
        }
    }
}
