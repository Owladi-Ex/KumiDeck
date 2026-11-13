using System.Diagnostics;
using KumiDeck.Platform;

namespace KumiDeck.Actions;

/* Tindakan jendela depan: sembunyikan, maksimalkan, snap, pindah monitor,
   task view, tampilkan desktop, dan tutup jendela (padanan window-actions.js). */
internal static class WindowActions
{
    private const uint SWP_BENDERA = Native.SWP_NOZORDER | Native.SWP_NOACTIVATE | Native.SWP_SHOWWINDOW;

    public static (bool Ok, string Pesan) Jalankan(string? cmd)
    {
        var perintah = (cmd ?? "").Trim().ToLowerInvariant();
        var h = Native.GetForegroundWindow();
        if (h == IntPtr.Zero) return (false, "Tidak ada jendela aktif.");

        switch (perintah)
        {
            case "minimize":
                Native.ShowWindow(h, Native.SW_MINIMIZE);
                return (true, "Menyembunyikan jendela");

            case "maximize":
                Native.ShowWindow(h, Native.SW_MAXIMIZE);
                return (true, "Memaksimalkan jendela");

            case "restore":
                Native.ShowWindow(h, Native.SW_RESTORE);
                return (true, "Mengembalikan jendela");

            case "kiri":
            case "kanan":
            {
                var info = Native.InfoMonitor(h);
                var kerja = info.Kerja;
                var setengah = Math.Max(1, kerja.Lebar / 2);
                var x = perintah == "kiri" ? kerja.Kiri : kerja.Kiri + setengah;
                Native.SetWindowPos(h, IntPtr.Zero, x, kerja.Atas, setengah, kerja.Tinggi, SWP_BENDERA);
                return (true, perintah == "kiri" ? "Snap kiri" : "Snap kanan");
            }

            case "monitor-berikut":
                return PindahMonitor(h);

            case "task-view":
                Keys.KirimCombo("win+tab");
                return (true, "Task View");

            case "tampilkan-desktop":
                Keys.KirimCombo("win+d");
                return (true, "Tampilkan desktop");

            case "tutup-jendela":
            {
                Native.ShowWindow(h, Native.SW_RESTORE);
                Thread.Sleep(80);
                Keys.KirimCombo("alt+f4");
                return (true, "Tutup jendela");
            }

            default:
                return (false, "Perintah jendela tidak dikenal.");
        }
    }

    private static (bool Ok, string Pesan) PindahMonitor(IntPtr h)
    {
        try
        {
            var layar = System.Windows.Forms.Screen.AllScreens;
            if (layar.Length < 2) return (true, "Pindah monitor");

            var info = Native.InfoMonitor(h);
            var posisi = 0;
            for (var i = 0; i < layar.Length; i++)
            {
                var batas = layar[i].Bounds;
                if (batas.Left == info.Monitor.Kiri && batas.Top == info.Monitor.Atas) posisi = i;
            }

            var tujuan = layar[(posisi + 1) % layar.Length];
            Native.GetWindowRect(h, out var kotak);
            var lebar = Math.Max(200, kotak.Lebar);
            var tinggi = Math.Max(150, kotak.Tinggi);
            Native.SetWindowPos(
                h,
                IntPtr.Zero,
                tujuan.Bounds.Left + 40,
                tujuan.Bounds.Top + 40,
                lebar,
                tinggi,
                SWP_BENDERA);
            return (true, "Pindah monitor");
        }
        catch (Exception ex)
        {
            return (false, "Gagal memindahkan monitor: " + ex.Message);
        }
    }
}

/* Kontrol daya Windows (padanan jalankanDaya). */
internal static class PowerActions
{
    public static (bool Ok, string Pesan) Jalankan(string? cmd)
    {
        switch ((cmd ?? "").Trim().ToLowerInvariant())
        {
            case "tidur":
                try
                {
                    Native.SetSuspendState(false, false, false);
                    return (true, "Tidur");
                }
                catch (Exception ex)
                {
                    return (false, "Tidur gagal: " + ex.Message);
                }

            case "kunci":
                return Native.LockWorkStation()
                    ? (true, "Kunci layar")
                    : (false, "Layar tidak dapat dikunci.");

            case "restart":
                return JalankanShutdown("/r /t 5", "Mulai ulang dalam 5 detik");

            case "matikan":
                return JalankanShutdown("/s /t 5", "Matikan dalam 5 detik");

            case "batal":
                return JalankanShutdown("/a", "Batalkan timer");

            default:
                return (false, "Perintah daya tidak dikenal.");
        }
    }

    private static (bool Ok, string Pesan) JalankanShutdown(string argumen, string nama)
    {
        try
        {
            var info = new ProcessStartInfo("shutdown.exe", argumen)
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
            };
            using var proses = Process.Start(info);
            return (true, nama);
        }
        catch (Exception ex)
        {
            return (false, nama + " gagal: " + ex.Message);
        }
    }
}
