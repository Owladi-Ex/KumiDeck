using System.Threading;
using KumiDeck.Core;
using KumiDeck.Platform;

namespace KumiDeck;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        using var kunci = new Mutex(true, @"Local\KumiDeck.SatuContoh", out var baru);
        if (!baru)
        {
            /* Aplikasi sudah berjalan: tampilkan jendela yang ada, lalu keluar. */
            Native.TampilkanJendelaKumiDeck();
            return;
        }

        AppPaths.Initialize();
        Log.Initialize();

        var app = new App();
        app.InitializeComponent();
        app.Run();
    }
}
