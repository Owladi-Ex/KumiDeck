using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Media;
using System.Windows.Threading;
using KumiDeck.Core;

namespace KumiDeck.Audio;

public sealed record PutarHasil(bool Ok, string Pesan, int Volume = 0);
public sealed record PemutarStatus(bool Ok, bool Memutar, string Sumber, int Volume, string? Pesan = null);

/* Pemutar soundboard native: berkas lokal / tautan http(s) dan volume per
   suara.

   MediaPlayer WPF (Media Foundation) hidup di satu thread STA dengan
   Dispatcher sendiri; semua perintah pemutaran dijalankan lewat dispatcher
   itu. Suara selalu keluar lewat perangkat default Windows: mengalihkan
   endpoint default (IPolicyConfig) membuat aplikasi lain -- termasuk game --
   membangun ulang mesin audionya dan berhenti sesaat, jadi jalur itu tidak
   dipakai. Pemisahan per channel dikerjakan aplikasi mixer (mis. Elgato Wave
   Link) yang mengarahkan KumiDeck.exe ke channel yang diinginkan. */
public static class SoundBoard
{
    private const string PesanMati = "Pemutar audio sudah dihentikan.";
    private const int BatasMulaiMs = 2500;

    private static readonly HashSet<string> Ekstensi = new(StringComparer.OrdinalIgnoreCase)
    {
        ".mp3", ".wav", ".m4a", ".ogg", ".flac",
    };

    /* MediaPlayer WPF tidak bisa membuka URL jaringan ("Only site-of-origin
       pack URIs are supported for media"), jadi tautan http(s) diunduh dulu ke
       cache lokal. Batas 40 MB dan cache dibersihkan setelah 30 hari. */
    private const long BatasUnduh = 40L * 1024 * 1024;
    private static readonly HttpClient Klien = BuatKlien();

    private static string CacheTautan => Path.Combine(AppPaths.Suara, "tautan");

    private static readonly object Kunci = new();

    private static Thread? _thread;
    private static Dispatcher? _dispatcher;
    private static MediaPlayer? _pemutar;
    private static bool _mati;

    /* Keadaan pemutaran: hanya disentuh di thread audio (dispatcher). */
    private static int _volume = 50;
    private static string _sumber = "";
    private static bool _memutar;
    private static int _sesi;

    /* Keadaan satu permintaan putar yang sedang berjalan. */
    private static string _sumberIni = "";
    private static bool _mediaTerbuka;
    private static bool _mediaGagal;
    private static TaskCompletionSource<bool>? _tungguMulai;

    private sealed record CekSumber(bool Ok, string Jalur, string Pesan, bool Tautan = false);
    private sealed record Unduhan(bool Ok, string Jalur, string Pesan);
    private sealed record MulaiInfo(bool Ok, string Pesan, Task<bool>? Siap, int Sesi);

    /* ---------- API publik ---------- */

    /* Putar suara dari berkas lokal atau alamat http(s). Suara selalu keluar
       lewat perangkat default Windows; endpoint default tidak pernah diubah. */
    public static async Task<PutarHasil> MainkanAsync(string sumber, int volume)
    {
        try
        {
            if (Mati()) return new PutarHasil(false, PesanMati);

            var cek = PeriksaSumber(sumber);
            if (!cek.Ok) return new PutarHasil(false, cek.Pesan);

            /* Tautan http(s) diunduh ke cache; MediaPlayer hanya menerima
               berkas lokal. Sumber yang dilaporkan tetap URL aslinya. */
            string jalurMain = cek.Jalur;
            if (cek.Tautan)
            {
                var unduh = await UnduhAsync(cek.Jalur).ConfigureAwait(false);
                if (!unduh.Ok) return new PutarHasil(false, unduh.Pesan);
                jalurMain = unduh.Jalur;
            }

            if (volume >= 0) Volatile.Write(ref _volume, NormaVolume(volume));
            int vol = Volatile.Read(ref _volume);

            var dispatcher = AmbilDispatcher();
            if (dispatcher == null)
                return new PutarHasil(false, Mati() ? PesanMati : "Suara tidak dapat diputar.");

            var mulai = await JalankanDiAsync(
                dispatcher,
                () => MulaiPutar(jalurMain, cek.Jalur, vol),
                new MulaiInfo(false, "Suara tidak dapat diputar.", null, -1)).ConfigureAwait(false);

            if (!mulai.Ok || mulai.Siap == null)
                return new PutarHasil(false, Mati() ? PesanMati : mulai.Pesan);

            bool siap = await TungguSiapAsync(mulai.Siap, BatasMulaiMs).ConfigureAwait(false);

            return await JalankanDiAsync(
                dispatcher,
                () => SelesaikanMulai(mulai.Sesi, siap),
                new PutarHasil(false, Mati() ? PesanMati : "Suara tidak dapat diputar.")).ConfigureAwait(false);
        }
        catch
        {
            return new PutarHasil(false, Mati() ? PesanMati : "Suara tidak dapat diputar.");
        }
    }

    /* Hentikan pemutaran dan pulihkan endpoint default bila sempat dialihkan. */
    public static Task<PutarHasil> HentikanAsync()
    {
        try
        {
            if (Mati()) return Task.FromResult(new PutarHasil(false, PesanMati));

            var dispatcher = AmbilDispatcher();
            if (dispatcher == null)
                return Task.FromResult(new PutarHasil(false, Mati() ? PesanMati : "Pemutaran tidak dapat dihentikan."));

            return JalankanDiAsync(
                dispatcher,
                () =>
                {
                    if (Mati()) return new PutarHasil(false, PesanMati);
                    bool ada = _memutar;
                    HentikanInti();
                    return new PutarHasil(true, ada ? "Pemutaran dihentikan." : "Tidak ada pemutaran.");
                },
                new PutarHasil(false, "Pemutaran tidak dapat dihentikan."));
        }
        catch
        {
            return Task.FromResult(new PutarHasil(false, "Pemutaran tidak dapat dihentikan."));
        }
    }

    /* Keadaan pemutar saat ini. */
    public static Task<PemutarStatus> StatusAsync()
    {
        try
        {
            int vol = Volatile.Read(ref _volume);
            if (Mati())
                return Task.FromResult(new PemutarStatus(false, false, "", vol, PesanMati));

            var dispatcher = AmbilDispatcher();
            if (dispatcher == null)
                return Task.FromResult(new PemutarStatus(false, false, "", vol, "Keadaan pemutar tidak dapat dibaca."));

            return JalankanDiAsync(
                dispatcher,
                () => new PemutarStatus(true, _memutar, _sumber, Volatile.Read(ref _volume)),
                new PemutarStatus(false, false, "", vol, "Keadaan pemutar tidak dapat dibaca."));
        }
        catch
        {
            return Task.FromResult(new PemutarStatus(false, false, "", Volatile.Read(ref _volume), "Keadaan pemutar tidak dapat dibaca."));
        }
    }

    /* Atur volume pemutar 0-100; berlaku juga untuk pemutaran berjalan. */
    public static void SetVolume(int volume)
    {
        try
        {
            int vol = NormaVolume(volume);
            Volatile.Write(ref _volume, vol);
            if (Mati()) return;

            Dispatcher? dispatcher;
            lock (Kunci)
            {
                if (_mati) return;
                dispatcher = _dispatcher;
            }
            if (dispatcher == null || dispatcher.HasShutdownStarted) return;

            dispatcher.InvokeAsync(() =>
            {
                try
                {
                    if (_pemutar != null) _pemutar.Volume = vol / 100.0;
                }
                catch
                {
                    /* diabaikan */
                }
            });
        }
        catch
        {
            /* diabaikan */
        }
    }

    /* Hentikan pemutaran, lalu matikan thread STA. Setelah ini semua operasi
       gagal dengan aman dan thread tidak dihidupkan lagi. */
    public static void Shutdown()
    {
        Thread? thread;
        Dispatcher? dispatcher;
        lock (Kunci)
        {
            if (_mati) return;
            _mati = true;
            thread = _thread;
            dispatcher = _dispatcher;
        }

        try
        {
            if (dispatcher != null)
            {
                if (dispatcher.Thread == Thread.CurrentThread)
                {
                    Bersihkan();
                }
                else
                {
                    var operasi = dispatcher.InvokeAsync(Bersihkan);
                    try { operasi.Task.Wait(1500); } catch { }
                }
                try { dispatcher.InvokeShutdown(); } catch { }
            }
        }
        catch
        {
            /* diabaikan */
        }

        if (thread != null && thread != Thread.CurrentThread)
        {
            try { thread.Join(1500); } catch { }
        }

        lock (Kunci)
        {
            _thread = null;
            _dispatcher = null;
            _pemutar = null;
            _memutar = false;
        }
    }

    /* ---------- thread audio ---------- */

    private static bool Mati() => Volatile.Read(ref _mati);

    private static int NormaVolume(int nilai) => Math.Clamp(nilai, 0, 100);

    /* Pastikan thread STA + MediaPlayer hidup; null bila sudah dimatikan
       atau thread gagal dibuat. */
    private static Dispatcher? AmbilDispatcher()
    {
        lock (Kunci)
        {
            if (_mati) return null;

            if (_thread != null && !_thread.IsAlive)
            {
                _thread = null;
                _dispatcher = null;
                _pemutar = null;
            }
            if (_thread != null && _dispatcher != null) return _dispatcher;

            bool siap = false;
            Dispatcher? dispatcher = null;
            MediaPlayer? pemutar = null;
            var tunggu = new ManualResetEventSlim(false);

            var t = new Thread(() =>
            {
                try
                {
                    pemutar = new MediaPlayer();
                    pemutar.MediaOpened += Pemutar_MediaOpened;
                    pemutar.MediaEnded += Pemutar_MediaEnded;
                    pemutar.MediaFailed += Pemutar_MediaFailed;
                    dispatcher = Dispatcher.CurrentDispatcher;
                    siap = true;
                }
                catch
                {
                    siap = false;
                }
                finally
                {
                    tunggu.Set();
                }

                if (!siap) return;
                try { Dispatcher.Run(); } catch { }
            });
            t.IsBackground = true;
            t.Name = "KumiDeck-Suara";
            try { t.SetApartmentState(ApartmentState.STA); } catch { }
            t.Start();

            try { tunggu.Wait(4000); } catch { }

            if (!siap || dispatcher == null || pemutar == null) return null;

            _thread = t;
            _dispatcher = dispatcher;
            _pemutar = pemutar;
            return dispatcher;
        }
    }

    /* Jalankan aksi sinkron di thread audio tanpa melempar ke pemanggil. */
    private static Task<T> JalankanDiAsync<T>(Dispatcher dispatcher, Func<T> kerja, T gagal)
    {
        try
        {
            var operasi = dispatcher.InvokeAsync(kerja);
            return operasi.Task.ContinueWith(
                tugas => tugas.Status == TaskStatus.RanToCompletion ? tugas.Result : gagal,
                CancellationToken.None,
                TaskContinuationOptions.ExecuteSynchronously,
                TaskScheduler.Default);
        }
        catch
        {
            return Task.FromResult(gagal);
        }
    }

    private static async Task<bool> TungguSiapAsync(Task<bool> tugas, int batasMs)
    {
        try
        {
            var pemenang = await Task.WhenAny(tugas, Task.Delay(batasMs)).ConfigureAwait(false);
            return ReferenceEquals(pemenang, tugas)
                && tugas.Status == TaskStatus.RanToCompletion
                && tugas.Result;
        }
        catch
        {
            return false;
        }
    }

    /* ---------- perintah pemutaran (thread audio) ---------- */

    /* Buka media dan kembalikan tugas "media mulai".
       jalur = berkas lokal yang dibuka; tampil = sumber asli (URL/berkas)
       yang dilaporkan ke UI. */
    private static MulaiInfo MulaiPutar(string jalur, string tampil, int vol)
    {
        if (Mati()) return new MulaiInfo(false, PesanMati, null, -1);
        if (_pemutar == null) return new MulaiInfo(false, "Suara tidak dapat diputar.", null, -1);

        HentikanInti();
        int sesi = ++_sesi;

        try
        {
            _pemutar.Volume = vol / 100.0;
        }
        catch
        {
            /* diabaikan */
        }

        _sumberIni = tampil;
        _mediaTerbuka = false;
        _mediaGagal = false;
        _memutar = true;

        var tcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        _tungguMulai = tcs;

        try
        {
            _pemutar.Open(BuatUri(jalur));
            /* Open hanya menyiapkan media; Play memulai pemutaran. */
            _pemutar.Play();
            _pemutar.Volume = vol / 100.0;
        }
        catch (Exception ex)
        {
            Log.Warn("soundboard: buka media gagal (" + jalur + "): " + ex);
            if (ReferenceEquals(_tungguMulai, tcs)) _tungguMulai = null;
            _memutar = false;
            return new MulaiInfo(false, "Suara tidak dapat diputar.", null, -1);
        }

        return new MulaiInfo(true, "", tcs.Task, sesi);
    }

    /* Tetapkan status akhir setelah media mulai / gagal / habis waktu. */
    private static PutarHasil SelesaikanMulai(int sesi, bool siap)
    {
        _tungguMulai = null;

        if (Mati())
        {
            HentikanInti();
            return new PutarHasil(false, PesanMati);
        }
        if (sesi != _sesi)
        {
            return new PutarHasil(false, "Suara tidak dapat diputar.");
        }
        if (_mediaGagal)
        {
            HentikanInti();
            return new PutarHasil(false, "Suara tidak dapat diputar.");
        }

        bool jalan = _memutar || _mediaTerbuka || siap || (_pemutar?.HasAudio ?? false);
        if (!jalan)
        {
            HentikanInti();
            return new PutarHasil(false, "Suara tidak dapat diputar.");
        }

        _sumber = _sumberIni;

        return new PutarHasil(true, "", Volatile.Read(ref _volume));
    }

    /* Hentikan media dan batalkan permintaan yang menggantung. */
    private static void HentikanInti()
    {
        _sesi++;
        _memutar = false;
        _mediaTerbuka = false;
        _mediaGagal = false;
        _tungguMulai?.TrySetResult(false);
        _tungguMulai = null;
        try { _pemutar?.Stop(); } catch { }
        try { _pemutar?.Close(); } catch { }
    }

    private static void Bersihkan()
    {
        _sesi++;
        _memutar = false;
        _tungguMulai?.TrySetResult(false);
        _tungguMulai = null;
        try { _pemutar?.Stop(); } catch { }
        try { _pemutar?.Close(); } catch { }
    }

    private static void Pemutar_MediaOpened(object? sender, EventArgs e)
    {
        _mediaTerbuka = true;
        _tungguMulai?.TrySetResult(true);
    }

    private static void Pemutar_MediaEnded(object? sender, EventArgs e)
    {
        if (_memutar)
        {
            _memutar = false;
            try { _pemutar?.Stop(); } catch { }
        }
        _tungguMulai?.TrySetResult(true);
    }

    private static void Pemutar_MediaFailed(object? sender, ExceptionEventArgs e)
    {
        if (!_memutar && _tungguMulai == null) return;
        Log.Warn("soundboard: media gagal dibuka (" + _sumberIni + "): " + e.ErrorException);
        _mediaGagal = true;
        if (_memutar)
        {
            _memutar = false;
            try { _pemutar?.Stop(); } catch { }
        }
        _tungguMulai?.TrySetResult(false);
    }

    /* ---------- validasi sumber ---------- */

    private static CekSumber PeriksaSumber(string? sumber)
    {
        if (string.IsNullOrWhiteSpace(sumber)) return new CekSumber(false, "", "Sumber suara kosong.");
        string nilai = sumber.Trim();

        if (nilai.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
            || nilai.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            if (!Uri.TryCreate(nilai, UriKind.Absolute, out var uri) || string.IsNullOrEmpty(uri.Host))
                return new CekSumber(false, "", "Alamat suara tidak valid.");
            if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
                return new CekSumber(false, "", "Hanya alamat http atau https yang didukung.");
            return new CekSumber(true, uri.AbsoluteUri, "", true);
        }

        if (PunyaSkema(nilai))
            return new CekSumber(false, "", "Hanya berkas lokal atau alamat http/https.");

        string penuh;
        try
        {
            penuh = Path.GetFullPath(nilai);
        }
        catch
        {
            return new CekSumber(false, "", "Berkas suara tidak ditemukan.");
        }

        try
        {
            var atribut = File.GetAttributes(penuh);
            if ((atribut & FileAttributes.Directory) != 0)
                return new CekSumber(false, "", "Sumber suara bukan berkas.");
        }
        catch
        {
            return new CekSumber(false, "", "Berkas suara tidak ditemukan.");
        }

        string ekstensi = Path.GetExtension(penuh);
        if (!Ekstensi.Contains(ekstensi))
            return new CekSumber(false, "", "Format suara tidak didukung (mp3, wav, m4a, ogg, flac).");

        return new CekSumber(true, penuh, "");
    }

    private static bool PunyaSkema(string nilai)
    {
        int i = nilai.IndexOf("://", StringComparison.Ordinal);
        if (i <= 0) return false;
        for (int j = 0; j < i; j++)
        {
            char c = nilai[j];
            if (j == 0)
            {
                if (!char.IsAsciiLetter(c)) return false;
            }
            else if (!char.IsAsciiLetterOrDigit(c) && c != '+' && c != '-' && c != '.')
            {
                return false;
            }
        }
        return true;
    }

    private static Uri BuatUri(string jalur)
    {
        if (Uri.TryCreate(jalur, UriKind.Absolute, out var uri)
            && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps))
        {
            return uri;
        }
        try
        {
            return new Uri(Path.GetFullPath(jalur), UriKind.Absolute);
        }
        catch
        {
            return new Uri(jalur, UriKind.Absolute);
        }
    }

    /* ---------- unduhan tautan ---------- */

    /* Unduh tautan http(s) ke cache lokal. Berkas yang sama dipakai ulang
       (hash URL menjadi nama berkas) dan cache lebih dari 30 hari dibuang. */
    private static async Task<Unduhan> UnduhAsync(string url)
    {
        string sementara = "";
        try
        {
            string cache = CacheTautan;
            Directory.CreateDirectory(cache);
            BersihkanCache(cache);

            string hash = HashUrl(url);
            foreach (var lama in Directory.EnumerateFiles(cache, hash + ".*"))
            {
                try
                {
                    if (new FileInfo(lama).Length > 0) return new Unduhan(true, lama, "");
                }
                catch
                {
                    /* berkas cache rusak: lanjut unduh ulang */
                }
            }

            using var batal = new CancellationTokenSource(TimeSpan.FromSeconds(90));
            using var permintaan = new HttpRequestMessage(HttpMethod.Get, url);
            permintaan.Headers.UserAgent.ParseAdd("KumiDeck/2.0");
            using var jawaban = await Klien
                .SendAsync(permintaan, HttpCompletionOption.ResponseHeadersRead, batal.Token)
                .ConfigureAwait(false);

            if (!jawaban.IsSuccessStatusCode)
            {
                int kode = (int)jawaban.StatusCode;
                return kode == 403
                    ? new Unduhan(false, "", "Tautan suara menolak unduhan (HTTP 403).")
                    : new Unduhan(false, "", $"Tautan suara menolak unduhan (HTTP {kode}).");
            }

            long? panjang = jawaban.Content.Headers.ContentLength;
            if (panjang.HasValue && panjang.Value > BatasUnduh)
                return new Unduhan(false, "", "Berkas suara dari tautan melebihi 40 MB.");

            /* Tolak halaman web atau berkas non-audio lebih awal. Sebagian
               server tidak mengirim tipe, jadi tipe kosong/octet-stream lolos. */
            string? tipe = jawaban.Content.Headers.ContentType?.MediaType;
            if (!TipeAudio(tipe))
                return new Unduhan(false, "", "Tautan suara bukan berkas audio.");

            string ekstensi = EkstensiDariTipe(jawaban.Content.Headers.ContentType?.MediaType)
                ?? EkstensiDariUrl(url)
                ?? ".mp3";
            string tujuan = Path.Combine(cache, hash + ekstensi);
            sementara = tujuan + ".part";

            long total = 0;
            bool terlalu = false;
            await using (var masukan = await jawaban.Content.ReadAsStreamAsync(batal.Token).ConfigureAwait(false))
            await using (var keluaran = new FileStream(sementara, FileMode.Create, FileAccess.Write,
                FileShare.None, 81920, useAsync: true))
            {
                var buffer = new byte[81920];
                while (true)
                {
                    int n = await masukan.ReadAsync(buffer, batal.Token).ConfigureAwait(false);
                    if (n <= 0) break;
                    total += n;
                    if (total > BatasUnduh)
                    {
                        terlalu = true;
                        break;
                    }
                    await keluaran.WriteAsync(buffer.AsMemory(0, n), batal.Token).ConfigureAwait(false);
                }
            }

            if (terlalu)
            {
                HapusBerkas(sementara);
                return new Unduhan(false, "", "Berkas suara dari tautan melebihi 40 MB.");
            }

            if (total == 0)
            {
                HapusBerkas(sementara);
                return new Unduhan(false, "", "Tautan suara tidak berisi data audio.");
            }

            /* Ganti berkas lama dengan ekstensi berbeda (bila ada). */
            foreach (var lama in Directory.EnumerateFiles(cache, hash + ".*"))
            {
                if (string.Equals(lama, sementara, StringComparison.OrdinalIgnoreCase)) continue;
                HapusBerkas(lama);
            }

            File.Move(sementara, tujuan, true);
            sementara = "";
            Log.Info("soundboard: tautan diunduh " + url + " -> " + tujuan);
            return new Unduhan(true, tujuan, "");
        }
        catch (OperationCanceledException)
        {
            if (sementara.Length > 0) HapusBerkas(sementara);
            return new Unduhan(false, "", "Tautan suara terlalu lama diunduh.");
        }
        catch (HttpRequestException ex)
        {
            if (sementara.Length > 0) HapusBerkas(sementara);
            Log.Warn("soundboard: unduh tautan gagal (" + url + "): " + ex.Message);
            return new Unduhan(false, "", "Tautan suara tidak dapat diunduh.");
        }
        catch (Exception ex)
        {
            if (sementara.Length > 0) HapusBerkas(sementara);
            Log.Warn("soundboard: unduh tautan gagal (" + url + "): " + ex);
            return new Unduhan(false, "", "Tautan suara tidak dapat diunduh.");
        }
    }

    private static HttpClient BuatKlien()
    {
        var penangan = new HttpClientHandler
        {
            AllowAutoRedirect = true,
            MaxAutomaticRedirections = 5,
            AutomaticDecompression = System.Net.DecompressionMethods.All,
        };
        /* Batas waktu diatur per unduhan lewat CancellationTokenSource. */
        return new HttpClient(penangan) { Timeout = Timeout.InfiniteTimeSpan };
    }

    private static string HashUrl(string url)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(url));
        return Convert.ToHexString(hash).ToLowerInvariant()[..16];
    }

    private static string? EkstensiDariTipe(string? tipe)
    {
        if (string.IsNullOrWhiteSpace(tipe)) return null;
        return tipe.Trim().ToLowerInvariant() switch
        {
            "audio/mpeg" or "audio/mp3" => ".mp3",
            "audio/wav" or "audio/wave" or "audio/x-wav" => ".wav",
            "audio/mp4" or "audio/m4a" or "audio/x-m4a" => ".m4a",
            "audio/ogg" or "application/ogg" => ".ogg",
            "audio/flac" or "audio/x-flac" => ".flac",
            _ => null,
        };
    }

    private static bool TipeAudio(string? tipe)
    {
        if (string.IsNullOrWhiteSpace(tipe)) return true;
        string nilai = tipe.Trim().ToLowerInvariant();
        return nilai.StartsWith("audio/", StringComparison.Ordinal)
            || nilai is "application/ogg" or "application/octet-stream" or "binary/octet-stream";
    }

    private static string? EkstensiDariUrl(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return null;
        string ekstensi = Path.GetExtension(uri.AbsolutePath).ToLowerInvariant();
        return Ekstensi.Contains(ekstensi) ? ekstensi : null;
    }

    private static void BersihkanCache(string cache)
    {
        try
        {
            var kedaluwarsa = DateTime.UtcNow.AddDays(-30);
            var sisa = DateTime.UtcNow.AddHours(-1);
            foreach (var berkas in Directory.EnumerateFiles(cache))
            {
                try
                {
                    var info = new FileInfo(berkas);
                    bool sebagian = berkas.EndsWith(".part", StringComparison.OrdinalIgnoreCase);
                    if (info.LastWriteTimeUtc < (sebagian ? sisa : kedaluwarsa)) info.Delete();
                }
                catch
                {
                    /* diabaikan */
                }
            }
        }
        catch
        {
            /* diabaikan */
        }
    }

    private static void HapusBerkas(string jalur)
    {
        try { File.Delete(jalur); } catch { /* diabaikan */ }
    }
}
