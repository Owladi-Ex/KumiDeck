using System;
using System.Collections.Generic;
using System.Diagnostics;
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

/* Keadaan unduhan satu tautan soundboard untuk UI:
   "siap" (ada di cache), "mengunduh" (persen 0-100 atau -1), "gagal",
   "belum" (belum pernah diunduh). */
public sealed record StatusUnduh(string Sumber, string Status, int Persen, string Pesan);

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

    /* Balas cepat: media yang belum selesai dibuka tetap dianggap berhasil
       dimulai, jadi permintaan tidak menahan UI ~0,5 detik setiap kali putar.
       Jendela singkat ini masih cukup untuk menangkap MediaFailed. */
    private const int BatasBalasMs = 120;

    /* Bila tautan sedang diunduh di latar, tunggu sebentar saja; selebihnya
       balas dengan persentase supaya UI tidak menggantung. */
    private const int BatasTungguUnduhMs = 5000;
    private const int BatasUnduhDetik = 120;

    /* Laju unduhan dibatasi supaya tautan tidak menyedot seluruh bandwidth
       (ping game melonjak) saat unduhan berjalan di latar. */
    private const int KecepatanUnduhBps = 2 * 1024 * 1024;

    private static readonly HashSet<string> Ekstensi = new(StringComparer.OrdinalIgnoreCase)
    {
        ".mp3", ".wav", ".m4a", ".ogg", ".flac",
    };

    /* MediaPlayer WPF tidak bisa membuka URL jaringan ("Only site-of-origin
       pack URIs are supported for media"), jadi tautan http(s) diunduh dulu ke
       cache lokal lalu diputar dari sana. Unduhan dimulai saat item disimpan
       (pra-unduh), berjalan di thread berprioritas rendah dengan laju dibatasi.
       Batas 40 MB dan cache dibersihkan setelah 30 hari. */
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

    /* Satu unduhan tautan yang sedang berjalan. Tugas yang sama dipakai ulang
       oleh pra-unduh (saat disimpan) dan oleh permintaan putar, jadi tautan
       tidak pernah diunduh dua kali bersamaan. */
    private sealed class UnduhanBerjalan
    {
        public readonly TaskCompletionSource<Unduhan> Tugas =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public int Persen = -1;
        public bool Selesai;
        public bool Gagal;
        public string Jalur = "";
        public string Pesan = "";
    }

    private static readonly object KunciUnduh = new();
    private static readonly Dictionary<string, UnduhanBerjalan> _unduhan =
        new(StringComparer.OrdinalIgnoreCase);

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

            /* Tautan http(s) dipakai dari cache; MediaPlayer hanya menerima
               berkas lokal. Bila cache belum ada, unduhan latar ditunggu
               sebentar saja supaya permintaan tidak menggantung. Sumber yang
               dilaporkan tetap URL aslinya. */
            string jalurMain = cek.Jalur;
            if (cek.Tautan)
            {
                var tersimpan = BerkasCache(cek.Jalur);
                if (tersimpan == null)
                {
                    var tugas = AmbilUnduhan(cek.Jalur);
                    if (!tugas.IsCompleted)
                    {
                        var menang = await Task
                            .WhenAny(tugas, Task.Delay(BatasTungguUnduhMs))
                            .ConfigureAwait(false);
                        if (!ReferenceEquals(menang, tugas))
                            return new PutarHasil(false, PesanUnduhBerjalan(cek.Jalur));
                    }
                    var unduh = await tugas.ConfigureAwait(false);
                    if (!unduh.Ok) return new PutarHasil(false, unduh.Pesan);
                    tersimpan = unduh.Jalur;
                }
                jalurMain = tersimpan;
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

            bool siap = await TungguSiapAsync(mulai.Siap, BatasBalasMs).ConfigureAwait(false);

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

    /* Siapkan pemutar saat aplikasi mulai: thread audio dan Media Foundation
       dibuka sekali memakai wav senyap. Tanpa ini, pemutaran pertama memakan
       ~100 ms CPU tepat saat pengguna sedang bermain game. */
    public static void Panaskan()
    {
        _ = Task.Run(async () =>
        {
            string? berkas = null;
            try
            {
                berkas = BuatWavSenyap();
                if (berkas == null) return;
                await MainkanAsync(berkas, -1).ConfigureAwait(false);
                await HentikanAsync().ConfigureAwait(false);
                Log.Info("soundboard: pemutar audio siap");
            }
            catch
            {
                /* diabaikan: pemanasan hanya pengoptimalan */
            }
            finally
            {
                if (berkas != null) HapusBerkas(berkas);
            }
        });
    }

    /* Mulai unduh tautan di latar belakang supaya ketukan pertama tidak perlu
       menunggu unduhan penuh. Aman dipanggil berulang: tugas yang sama dipakai
       ulang, dan tautan yang sudah ada di cache tidak diunduh lagi. */
    public static void MulaiUnduhLatar(string? sumber)
    {
        try
        {
            if (Mati()) return;
            var cek = PeriksaSumber(sumber);
            if (!cek.Ok || !cek.Tautan) return;
            if (BerkasCache(cek.Jalur) != null) return;
            _ = AmbilUnduhan(cek.Jalur);
        }
        catch
        {
            /* diabaikan: pra-unduh hanya pemanasan */
        }
    }

    /* Status unduhan untuk daftar tautan soundboard. "siap" berarti berkas ada
       di cache, jadi pemutaran tidak menyentuh jaringan sama sekali. */
    public static List<StatusUnduh> StatusUnduhan(IEnumerable<string> sumber)
    {
        var hasil = new List<StatusUnduh>();
        var aktif = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var url in sumber)
        {
            if (string.IsNullOrWhiteSpace(url)) continue;
            var cek = PeriksaSumber(url);
            if (!cek.Ok || !cek.Tautan) continue;
            aktif.Add(cek.Jalur);

            UnduhanBerjalan? catatan;
            lock (KunciUnduh) _unduhan.TryGetValue(cek.Jalur, out catatan);

            if (catatan is { Selesai: false })
            {
                hasil.Add(new StatusUnduh(url, "mengunduh", catatan.Persen, ""));
                continue;
            }
            if (catatan is { Gagal: true })
            {
                hasil.Add(new StatusUnduh(url, "gagal", -1, catatan.Pesan));
                continue;
            }

            var jalur = catatan?.Jalur is { Length: > 0 } j && File.Exists(j) ? j : BerkasCache(cek.Jalur);
            hasil.Add(jalur != null
                ? new StatusUnduh(url, "siap", 100, "")
                : new StatusUnduh(url, "belum", -1, ""));
        }

        /* Buang catatan yang sudah selesai untuk tautan yang tidak lagi ada di
           soundboard supaya map tidak menumpuk seiring waktu. Unduhan yang
           masih berjalan dibiarkan sampai tuntas. */
        lock (KunciUnduh)
        {
            var basi = _unduhan
                .Where(p => p.Value.Selesai && !aktif.Contains(p.Key))
                .Select(p => p.Key)
                .ToList();
            foreach (var k in basi) _unduhan.Remove(k);
        }
        return hasil;
    }

    /* Buang cache tautan milik satu suara, dipanggil saat item dihapus supaya
       data/suara/tautan tidak menumpuk. */
    public static void LupakanSuara(string? sumber)
    {
        try
        {
            var cek = PeriksaSumber(sumber);
            if (!cek.Ok || !cek.Tautan) return;
            lock (KunciUnduh) _unduhan.Remove(cek.Jalur);
            foreach (var berkas in BerkasUntuk(cek.Jalur)) HapusBerkas(berkas);
        }
        catch
        {
            /* diabaikan */
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

    /* Jalankan satu unduhan di thread khusus berprioritas rendah. Unduhan
       berjalan sinkron di thread itu (bukan thread pool) supaya prioritasnya
       benar-benar di bawah normal dan CPU tidak direbut dari game. */
    private static Task<Unduhan> AmbilUnduhan(string url)
    {
        lock (KunciUnduh)
        {
            if (_unduhan.TryGetValue(url, out var ada))
            {
                /* Unduhan yang masih berjalan atau sudah sukses dipakai ulang.
                   Unduhan yang gagal dibiarkan tercatat (agar UI sempat
                   menampilkan "Unduhan gagal") tapi boleh dicoba lagi. */
                if (!ada.Selesai || !ada.Gagal) return ada.Tugas.Task;
            }

            var catatan = new UnduhanBerjalan();
            _unduhan[url] = catatan;

            var pekerja = new Thread(() => JalankanUnduh(url, catatan))
            {
                IsBackground = true,
                Name = "KumiDeck-UnduhSuara",
                Priority = ThreadPriority.BelowNormal,
            };
            pekerja.Start();
            return catatan.Tugas.Task;
        }
    }

    private static void JalankanUnduh(string url, UnduhanBerjalan catatan)
    {
        Unduhan hasil;
        try
        {
            hasil = UnduhSinkron(url, catatan);
        }
        catch (Exception ex)
        {
            Log.Warn("soundboard: unduh tautan gagal (" + url + "): " + ex);
            hasil = new Unduhan(false, "", "Tautan suara tidak dapat diunduh.");
        }

        catatan.Jalur = hasil.Jalur;
        catatan.Pesan = hasil.Pesan;
        catatan.Gagal = !hasil.Ok;
        catatan.Selesai = true;

        /* Catatan gagal sengaja tidak dibuang supaya UI bisa menampilkan
           "Unduhan gagal". AmbilUnduhan akan mencoba lagi bila statusnya
           gagal, dan MembersihkanUnduhan membuangnya agar map tidak menumpuk. */
        catatan.Tugas.TrySetResult(hasil);
    }

    /* Unduh tautan http(s) ke cache lokal. Berkas yang sama dipakai ulang
       (hash URL menjadi nama berkas) dan cache lebih dari 30 hari dibuang.
       Laju dibatasi KecepatanUnduhBps supaya ping game tidak melonjak. */
    private static Unduhan UnduhSinkron(string url, UnduhanBerjalan catatan)
    {
        string sementara = "";
        try
        {
            string cache = CacheTautan;
            Directory.CreateDirectory(cache);
            BersihkanCache(cache);

            var tersimpan = BerkasCache(url);
            if (tersimpan != null) return new Unduhan(true, tersimpan, "");

            using var permintaan = new HttpRequestMessage(HttpMethod.Get, url);
            permintaan.Headers.UserAgent.ParseAdd("KumiDeck/2.0");
            /* Batas waktu juga menutup koneksi yang menggantung sebelum data
               pertama datang. */
            using var batal = new CancellationTokenSource(TimeSpan.FromSeconds(BatasUnduhDetik));
            using var jawaban = Klien.Send(permintaan, HttpCompletionOption.ResponseHeadersRead, batal.Token);

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

            string ekstensi = EkstensiDariTipe(tipe) ?? EkstensiDariUrl(url) ?? ".mp3";
            string tujuan = Path.Combine(cache, HashUrl(url) + ekstensi);
            sementara = tujuan + ".part";

            long total = 0;
            bool terlalu = false;
            bool kedaluwarsa = false;
            var jam = Stopwatch.StartNew();

            using (var masukan = jawaban.Content.ReadAsStream())
            using (var keluaran = new FileStream(sementara, FileMode.Create, FileAccess.Write,
                FileShare.None, 81920))
            {
                var buffer = new byte[81920];
                while (true)
                {
                    if (jam.Elapsed.TotalSeconds > BatasUnduhDetik)
                    {
                        kedaluwarsa = true;
                        break;
                    }

                    int n = masukan.Read(buffer, 0, buffer.Length);
                    if (n <= 0) break;

                    total += n;
                    if (total > BatasUnduh)
                    {
                        terlalu = true;
                        break;
                    }
                    keluaran.Write(buffer, 0, n);

                    catatan.Persen = panjang is > 0
                        ? (int)Math.Min(100, total * 100 / panjang.Value)
                        : -1;

                    /* Rem laju: tidur sepanjang sisa waktu yang "terutang"
                       terhadap target byte per detik. */
                    double harusnyaMs = total * 1000.0 / KecepatanUnduhBps;
                    double sisaMs = harusnyaMs - jam.Elapsed.TotalMilliseconds;
                    if (sisaMs > 4) Thread.Sleep((int)Math.Min(sisaMs, 250));
                }
            }

            if (kedaluwarsa)
            {
                HapusBerkas(sementara);
                return new Unduhan(false, "", "Tautan suara terlalu lama diunduh.");
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
            foreach (var lama in BerkasUntuk(url))
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

    /* Pesan singkat saat pengguna menekan suara yang tautannya masih diunduh. */
    private static string PesanUnduhBerjalan(string url)
    {
        int persen = -1;
        lock (KunciUnduh)
        {
            if (_unduhan.TryGetValue(url, out var catatan)) persen = catatan.Persen;
        }
        return persen >= 0
            ? $"Suara sedang diunduh ({persen}%). Coba lagi sebentar."
            : "Suara sedang diunduh. Coba lagi sebentar.";
    }

    /* Semua berkas cache milik satu URL (termasuk sisa .part). */
    private static string[] BerkasUntuk(string url)
    {
        try
        {
            string cache = CacheTautan;
            if (!Directory.Exists(cache)) return Array.Empty<string>();
            return Directory.GetFiles(cache, HashUrl(url) + ".*");
        }
        catch
        {
            return Array.Empty<string>();
        }
    }

    /* Berkas cache yang utuh untuk satu URL, atau null bila belum ada. */
    private static string? BerkasCache(string url)
    {
        foreach (var berkas in BerkasUntuk(url))
        {
            if (berkas.EndsWith(".part", StringComparison.OrdinalIgnoreCase)) continue;
            try
            {
                if (new FileInfo(berkas).Length > 0) return berkas;
            }
            catch
            {
                /* berkas rusak: perlakukan sebagai belum ada */
            }
        }
        return null;
    }

    /* Wav senyap 50 ms di folder temp untuk pemanasan Media Foundation. */
    private static string? BuatWavSenyap()
    {
        try
        {
            const int rate = 22050;
            const int sampel = rate / 20;
            int dataBytes = sampel * 2;
            string jalur = Path.Combine(
                Path.GetTempPath(),
                "kumideck-panas-" + Environment.ProcessId + ".wav");

            using (var berkas = new FileStream(jalur, FileMode.Create, FileAccess.Write, FileShare.None))
            using (var tulis = new BinaryWriter(berkas))
            {
                tulis.Write(Encoding.ASCII.GetBytes("RIFF"));
                tulis.Write(36 + dataBytes);
                tulis.Write(Encoding.ASCII.GetBytes("WAVEfmt "));
                tulis.Write(16);
                tulis.Write((short)1);
                tulis.Write((short)1);
                tulis.Write(rate);
                tulis.Write(rate * 2);
                tulis.Write((short)2);
                tulis.Write((short)16);
                tulis.Write(Encoding.ASCII.GetBytes("data"));
                tulis.Write(dataBytes);
                tulis.Write(new byte[dataBytes]);
            }
            return jalur;
        }
        catch
        {
            return null;
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
        /* Batas waktu diatur per unduhan lewat CancellationTokenSource, jadi
           klien tidak perlu batas sendiri. */
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
