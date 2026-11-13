using System.Diagnostics;
using KumiDeck.Data;
using KumiDeck.Media;

namespace KumiDeck.Platform;

public readonly record struct InfoJendela(bool Ada, string Proses, string Judul, int Pid)
{
    public static readonly InfoJendela Kosong = new(false, "", "", 0);
}

/* Pengamat jendela depan (padanan server/window.js tanpa PowerShell).

   Dipakai untuk auto-profil (#16), aksi kondisional (#17), dan penanda status
   tombol (#20). Membaca GetForegroundWindow tiap ±700 ms di thread latar. */
public static class WindowWatcher
{
    private static readonly object Kunci = new();
    private static readonly Dictionary<uint, string> _namaProses = new();

    private static InfoJendela _info = InfoJendela.Kosong;
    private static CancellationTokenSource? _batal;
    private static Task? _tugas;
    private static int _sedangJalan;

    /* Dipanggil saat proses atau judul jendela depan berubah. */
    public static event Action<InfoJendela>? Berubah;

    public static InfoJendela Info()
    {
        lock (Kunci)
        {
            return _info;
        }
    }

    public static void Mulai()
    {
        if (Interlocked.Exchange(ref _sedangJalan, 1) == 1) return;

        _batal = new CancellationTokenSource();
        var token = _batal.Token;
        _tugas = Task.Run(() => PutaranAsync(token), CancellationToken.None);
    }

    public static void Hentikan()
    {
        try
        {
            _batal?.Cancel();
        }
        catch
        {
            /* diabaikan */
        }
        _batal = null;
        _tugas = null;
        Interlocked.Exchange(ref _sedangJalan, 0);

        lock (Kunci)
        {
            _info = InfoJendela.Kosong;
            _namaProses.Clear();
        }
    }

    private static async Task PutaranAsync(CancellationToken batal)
    {
        try
        {
            while (!batal.IsCancellationRequested)
            {
                InfoJendela baru;
                try
                {
                    baru = BacaSekarang();
                }
                catch
                {
                    baru = InfoJendela.Kosong;
                }

                var lama = Info();
                var berubah = lama.Proses != baru.Proses || lama.Judul != baru.Judul || lama.Ada != baru.Ada;
                if (berubah)
                {
                    lock (Kunci)
                    {
                        _info = baru;
                    }
                    try
                    {
                        Berubah?.Invoke(baru);
                    }
                    catch
                    {
                        /* pendengar tidak boleh mematikan pengamat */
                    }
                }

                try
                {
                    await Task.Delay(700, batal);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
        }
        finally
        {
            Interlocked.Exchange(ref _sedangJalan, 0);
        }
    }

    private static InfoJendela BacaSekarang()
    {
        var hwnd = Native.GetForegroundWindow();
        if (hwnd == IntPtr.Zero || !Native.IsWindowVisible(hwnd)) return InfoJendela.Kosong;

        Native.GetWindowThreadProcessId(hwnd, out var pid);
        if (pid == 0) return InfoJendela.Kosong;

        var proses = NamaProses(pid);
        var judul = Native.JudulJendela(hwnd);
        return new InfoJendela(true, proses.ToLowerInvariant(), judul, (int)pid);
    }

    private static string NamaProses(uint pid)
    {
        lock (Kunci)
        {
            if (_namaProses.TryGetValue(pid, out var tersimpan)) return tersimpan;
        }

        var nama = Native.NamaProses(pid);
        if (nama.Length == 0) return "";

        lock (Kunci)
        {
            if (_namaProses.Count > 256) _namaProses.Clear();
            _namaProses[pid] = nama;
        }
        return nama;
    }

    /* Cocokkan aturan { proses, jendela } dengan jendela depan. Aturan kosong
       dianggap tidak cocok supaya penanda tidak selalu menyala. */
    public static bool CocokJendela(Syarat? syarat, InfoJendela sekarang)
    {
        if (syarat is null || !sekarang.Ada) return false;

        var proses = (syarat.Proses ?? "").ToLowerInvariant().Trim();
        var jendela = (syarat.Jendela ?? "").ToLowerInvariant().Trim();
        if (proses.Length == 0 && jendela.Length == 0) return false;

        var prosesSekarang = (sekarang.Proses ?? "").Replace(".exe", "", StringComparison.OrdinalIgnoreCase);
        var judulSekarang = (sekarang.Judul ?? "").ToLowerInvariant();

        if (proses.Length > 0 &&
            !prosesSekarang.Contains(proses.Replace(".exe", "", StringComparison.OrdinalIgnoreCase), StringComparison.Ordinal))
        {
            return false;
        }

        if (jendela.Length > 0 && !judulSekarang.Contains(jendela, StringComparison.Ordinal)) return false;
        return true;
    }

    /* Nilai sebuah syarat: jendela cocok ATAU aplikasi media sedang memutar.
       Dua-duanya boleh diisi; proses saja tetap bisa cocok lewat media. */
    public static bool CocokSyarat(Syarat? syarat)
    {
        if (syarat is null) return false;
        if (string.IsNullOrWhiteSpace(syarat.Proses) && string.IsNullOrWhiteSpace(syarat.Jendela)) return false;

        if (CocokJendela(syarat, Info())) return true;

        if (!string.IsNullOrWhiteSpace(syarat.Proses))
        {
            var media = MediaWatcher.Info();
            if (media.Ada)
            {
                var app = (media.App ?? "").ToLowerInvariant();
                var cari = syarat.Proses.ToLowerInvariant().Replace(".exe", "", StringComparison.OrdinalIgnoreCase).Trim();
                if (cari.Length > 0 && app.Contains(cari, StringComparison.Ordinal)) return true;
            }
        }
        return false;
    }
}
