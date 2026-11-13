using System;
using System.Threading;
using System.Threading.Tasks;
using KumiDeck.Core;
using Windows.Media.Control;

namespace KumiDeck.Media;

public sealed record MediaInfo(bool Ada, string Judul, string Artis, string Album, string Status, string App)
{
    public static readonly MediaInfo Kosong = new(false, "", "", "", "tertutup", "");
}

/* Pembaca media Windows (GlobalSystemMediaTransportControlsSessionManager).

   Versi native dari server/media.js: satu loop latar membaca sesi media yang
   sedang aktif tiap ~1200 ms. Tidak ada proses eksternal. Semua kegagalan
   dilaporkan sebagai MediaInfo tanpa melempar exception ke pemanggil.

   Info() hanya membaca snapshot, jadi aman dipanggil dari UI/HTTP kapan saja. */
public static class MediaWatcher
{
    private const int JedaNormalMs = 1200;
    private const int JedaGalatMs = 8000;
    private const int JedaPeringatanMs = 5 * 60 * 1000;

    private const int MaksJudul = 120;
    private const int MaksArtis = 80;
    private const int MaksAlbum = 80;
    private const int MaksApp = 80;

    private static readonly MediaInfo Galat = new(false, "", "", "", "galat", "");
    private static readonly object Kunci = new();

    private static MediaInfo _info = MediaInfo.Kosong;
    private static CancellationTokenSource? _cts;
    private static int _peringatanTerakhir;
    private static bool _keluarTerdaftar;

    /* Mulai pemantauan latar. Idempoten: panggilan kedua tidak menambah loop. */
    public static void Mulai()
    {
        lock (Kunci)
        {
            if (_cts != null) return;

            var cts = new CancellationTokenSource();
            _cts = cts;

            if (!_keluarTerdaftar)
            {
                _keluarTerdaftar = true;
                try
                {
                    /* Aplikasi bisa ditutup tanpa Hentikan(); batalkan loop agar
                       tidak ada pekerjaan yang menggantung saat proses keluar. */
                    AppDomain.CurrentDomain.ProcessExit += (_, _) => Batalkan();
                }
                catch
                {
                    /* diabaikan */
                }
            }

            _ = Task.Run(() => JalankanAsync(cts));
        }
    }

    /* Hentikan pemantauan dan kembalikan Info() ke Kosong. Aman dipanggil
       berkali-kali. */
    public static void Hentikan()
    {
        CancellationTokenSource? cts;
        lock (Kunci)
        {
            cts = _cts;
            _cts = null;
            Volatile.Write(ref _info, MediaInfo.Kosong);
        }

        if (cts == null) return;
        try
        {
            cts.Cancel();
        }
        catch
        {
            /* diabaikan */
        }
        /* Tidak di-Dispose di sini: loop yang sedang berhenti masih memegang token.
           Dispose dilakukan di finally loop. */
    }

    /* Snapshot terakhir. Cepat dan tidak memblokir. */
    public static MediaInfo Info() => Volatile.Read(ref _info);

    private static async Task JalankanAsync(CancellationTokenSource cts)
    {
        var token = cts.Token;
        GlobalSystemMediaTransportControlsSessionManager? manajer = null;

        try
        {
            while (!token.IsCancellationRequested)
            {
                var jeda = JedaNormalMs;

                if (manajer == null)
                {
                    try
                    {
                        manajer = await GlobalSystemMediaTransportControlsSessionManager
                            .RequestAsync()
                            .AsTask(token)
                            .ConfigureAwait(false);
                    }
                    catch (OperationCanceledException)
                    {
                        break;
                    }
                    catch (Exception ex)
                    {
                        /* Layanan media mati/terkunci: laporkan galat, coba lagi
                           tiap 8 detik tanpa membanjiri log. */
                        Simpan(Galat, cts);
                        Peringatkan("RequestAsync gagal", ex);
                        jeda = JedaGalatMs;
                        if (await TungguAsync(jeda, token).ConfigureAwait(false)) break;
                        continue;
                    }
                }

                try
                {
                    Simpan(await BacaAsync(manajer, token).ConfigureAwait(false), cts);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    /* Sesi bisa hilang di tengah pembacaan. Buang manajer agar
                       tick berikutnya meminta manajer baru setelah jeda. */
                    Simpan(Galat, cts);
                    Peringatkan("baca sesi media gagal", ex);
                    manajer = null;
                    jeda = JedaGalatMs;
                }

                if (await TungguAsync(jeda, token).ConfigureAwait(false)) break;
            }
        }
        catch (Exception ex)
        {
            Simpan(Galat, cts);
            Peringatkan("loop media berhenti", ex);
        }
        finally
        {
            try
            {
                cts.Dispose();
            }
            catch
            {
                /* diabaikan */
            }
        }
    }

    private static async Task<MediaInfo> BacaAsync(
        GlobalSystemMediaTransportControlsSessionManager manajer,
        CancellationToken token)
    {
        /* Selalu ambil sesi saat ini: pengguna bisa berganti pemutar kapan saja. */
        var sesi = manajer.GetCurrentSession();
        if (sesi == null) return MediaInfo.Kosong;

        var properti = await sesi.TryGetMediaPropertiesAsync().AsTask(token).ConfigureAwait(false);
        if (token.IsCancellationRequested) return MediaInfo.Kosong;

        var putar = sesi.GetPlaybackInfo();
        var status = putar?.PlaybackStatus.ToString().ToLowerInvariant() ?? "";
        var app = sesi.SourceAppUserModelId;

        return new MediaInfo(
            true,
            Potong(properti?.Title, MaksJudul),
            Potong(properti?.Artist, MaksArtis),
            Potong(properti?.AlbumTitle, MaksAlbum),
            status,
            Potong(app, MaksApp));
    }

    /* Hanya tulis snapshot bila loop ini masih pemilik pemantauan. Mencegah
       loop lama menimpa Kosong setelah Hentikan() lalu Mulai(). */
    private static void Simpan(MediaInfo info, CancellationTokenSource pemilik)
    {
        lock (Kunci)
        {
            if (!ReferenceEquals(_cts, pemilik)) return;
            Volatile.Write(ref _info, info);
        }
    }

    private static async Task<bool> TungguAsync(int milidetik, CancellationToken token)
    {
        try
        {
            await Task.Delay(milidetik, token).ConfigureAwait(false);
            return token.IsCancellationRequested;
        }
        catch (OperationCanceledException)
        {
            return true;
        }
    }

    private static void Peringatkan(string pesan, Exception ex)
    {
        var sekarang = Environment.TickCount;
        var terakhir = Volatile.Read(ref _peringatanTerakhir);
        if (terakhir != 0 && sekarang - terakhir < JedaPeringatanMs) return;
        Volatile.Write(ref _peringatanTerakhir, sekarang);

        try
        {
            Log.Warn("MediaWatcher: " + pesan + ": " + ex.Message);
        }
        catch
        {
            /* log tidak boleh menjatuhkan pemantauan */
        }
    }

    private static void Batalkan()
    {
        try
        {
            Volatile.Read(ref _cts)?.Cancel();
        }
        catch
        {
            /* diabaikan */
        }
    }

    private static string Potong(string? teks, int maks)
    {
        if (string.IsNullOrEmpty(teks)) return "";
        if (teks.Length <= maks) return teks;

        var panjang = maks;
        /* Jangan belah pasangan surrogate. */
        if (panjang > 0 && char.IsHighSurrogate(teks[panjang - 1])) panjang--;
        return teks[..panjang];
    }
}
