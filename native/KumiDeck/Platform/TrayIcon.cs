using System.IO;
using System.Drawing;
using System.Windows.Forms;

namespace KumiDeck.Platform;

/* Ikon baki sistem native (pengganti skrip PowerShell tray.js).

   Menu: Buka KumiDeck, Buka di peramban, Salin tautan Remote, Keluar.
   Dibuat di thread UI WPF; pesan Windows ditangani oleh Dispatcher WPF. */
public sealed class TrayIcon : IDisposable
{
    private readonly NotifyIcon _ikon;
    private bool _dibuang;

    public TrayIcon(string judul, Action buka, Action peramban, Func<bool> salinTautan, Action keluar)
    {
        _ikon = new NotifyIcon
        {
            Text = judul,
            Icon = AmbilIkon(),
            Visible = true,
        };

        var menu = new ContextMenuStrip();
        var butirBuka = menu.Items.Add("Buka KumiDeck");
        butirBuka.Font = new Font(butirBuka.Font, FontStyle.Bold);
        butirBuka.Click += (_, _) => Aman(buka);

        var butirPeramban = menu.Items.Add("Buka di peramban");
        butirPeramban.Click += (_, _) => Aman(peramban);

        var butirSalin = menu.Items.Add("Salin tautan Remote");
        butirSalin.Click += (_, _) =>
        {
            if (salinTautan())
            {
                _ikon.ShowBalloonTip(2000, "KumiDeck", "Tautan Remote disalin.", ToolTipIcon.None);
            }
            else
            {
                _ikon.ShowBalloonTip(2000, "KumiDeck", "Tautan tidak dapat disalin.", ToolTipIcon.Warning);
            }
        };

        menu.Items.Add(new ToolStripSeparator());

        var butirKeluar = menu.Items.Add("Keluar KumiDeck");
        butirKeluar.Click += (_, _) => Aman(keluar);

        _ikon.ContextMenuStrip = menu;
        _ikon.DoubleClick += (_, _) => Aman(buka);

        _ikon.ShowBalloonTip(
            2500,
            "KumiDeck berjalan",
            "Klik dua kali ikon untuk membuka papan.",
            ToolTipIcon.None);
    }

    private static void Aman(Action aksi)
    {
        try
        {
            aksi();
        }
        catch
        {
            /* menu tidak boleh mematikan aplikasi */
        }
    }

    private static Icon AmbilIkon()
    {
        /* Ikon baki sistem ditanam di dalam .exe (assets/tray.ico). */
        var tertanam = IkonBytes();
        if (tertanam is not null)
        {
            try
            {
                using var alir = new MemoryStream(tertanam);
                using var ikon = new Icon(alir);
                return (Icon)ikon.Clone();
            }
            catch
            {
                /* jatuh ke ikon .exe */
            }
        }

        try
        {
            var exe = Environment.ProcessPath;
            if (!string.IsNullOrEmpty(exe))
            {
                var ikon = Icon.ExtractAssociatedIcon(exe);
                if (ikon is not null) return ikon;
            }
        }
        catch
        {
            /* pakai ikon bawaan */
        }
        return SystemIcons.Application;
    }

    /* Isi berkas ikon baki yang ditanam, atau null bila tidak ada. */
    public static byte[]? IkonBytes()
    {
        try
        {
            using var alir = typeof(TrayIcon).Assembly.GetManifestResourceStream("tray.ico");
            if (alir is null) return null;
            using var memori = new MemoryStream();
            alir.CopyTo(memori);
            return memori.ToArray();
        }
        catch
        {
            return null;
        }
    }

    public void BeriTahu(string judul, string pesan)
    {
        if (_dibuang) return;
        try
        {
            _ikon.ShowBalloonTip(2500, judul, pesan, ToolTipIcon.None);
        }
        catch
        {
            /* diabaikan */
        }
    }

    public void Dispose()
    {
        if (_dibuang) return;
        _dibuang = true;
        try
        {
            _ikon.Visible = false;
            _ikon.ContextMenuStrip?.Dispose();
            _ikon.Dispose();
        }
        catch
        {
            /* diabaikan */
        }
    }
}
