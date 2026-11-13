using System.Windows;
using KumiDeck.Core;
using KumiDeck.Server;

namespace KumiDeck;

public partial class App : System.Windows.Application
{
    private MainWindow? _jendela;
    private KumiServer? _server;

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        try
        {
            _server = new KumiServer();
            var alamat = await _server.MulaiAsync();
            Log.Info($"server siap: {alamat}");
        }
        catch (Exception ex)
        {
            Log.Error("server gagal dimulai", ex);
            System.Windows.MessageBox.Show(
                "KumiDeck tidak dapat memulai server lokal.\n\n" + ex.Message,
                "KumiDeck",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            Shutdown();
            return;
        }

        _jendela = new MainWindow(_server);
        _server.MintaTampilJendela += () => _jendela?.Tampilkan();
        _server.MintaKeluar += Keluar;
        _jendela.Show();

        if (Environment.GetEnvironmentVariable("KD_OPEN") == "1")
        {
            _server.BukaDiPeramban();
        }
    }

    protected override void OnExit(ExitEventArgs e)
    {
        try
        {
            _server?.Berhenti();
        }
        catch (Exception ex)
        {
            Log.Error("gagal menutup server", ex);
        }
        Log.Info("selesai");
        base.OnExit(e);
    }

    public void Keluar()
    {
        _jendela?.TutupPaksa();
        Shutdown();
    }
}


