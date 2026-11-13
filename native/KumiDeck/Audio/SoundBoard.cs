using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Media;
using System.Windows.Threading;

namespace KumiDeck.Audio;

public sealed record AudioDevice(string Id, string Nama, bool Bawaan);
public sealed record PerangkatHasil(bool Ok, List<AudioDevice> Perangkat, string Galat);
public sealed record PutarHasil(bool Ok, string Pesan, bool RouteSementara = false, string PerangkatId = "", int Volume = 0);
public sealed record PemutarStatus(bool Ok, bool Memutar, string Sumber, int Volume, string PerangkatId, string? Pesan = null);

/* Pemutar soundboard native: berkas lokal / tautan http(s), volume per suara,
   dan perangkat output pilihan.

   MediaPlayer WPF (Media Foundation) hidup di satu thread STA dengan
   Dispatcher sendiri; semua perintah pemutaran dijalankan lewat dispatcher
   itu. Perangkat output dipilih dengan mengalihkan endpoint default sistem
   lewat IPolicyConfig (seperti versi PowerShell), lalu dipulihkan saat
   pemutaran selesai, dihentikan, atau gagal. Tidak ada proses eksternal. */
public static class SoundBoard
{
    private const string PesanMati = "Pemutar audio sudah dihentikan.";
    private const int BatasMulaiMs = 2500;

    private static readonly HashSet<string> Ekstensi = new(StringComparer.OrdinalIgnoreCase)
    {
        ".mp3", ".wav", ".m4a", ".ogg", ".flac",
    };

    private static readonly object Kunci = new();

    private static Thread? _thread;
    private static Dispatcher? _dispatcher;
    private static MediaPlayer? _pemutar;
    private static bool _mati;

    /* Keadaan pemutaran: hanya disentuh di thread audio (dispatcher). */
    private static int _volume = 50;
    private static string _sumber = "";
    private static string _perangkatId = "";
    private static bool _memutar;
    private static bool _ruteAktif;
    private static string _ruteSebelumnya = "";
    private static int _sesi;

    /* Keadaan satu permintaan putar yang sedang berjalan. */
    private static string _sumberIni = "";
    private static string _devIni = "";
    private static bool _ruteIni;
    private static bool _ruteGagalIni;
    private static string _namaRute = "";
    private static bool _mediaTerbuka;
    private static bool _mediaGagal;
    private static TaskCompletionSource<bool>? _tungguMulai;

    private sealed record CekSumber(bool Ok, string Jalur, string Pesan);
    private sealed record MulaiInfo(bool Ok, string Pesan, Task<bool>? Siap, int Sesi);

    /* ---------- API publik ---------- */

    /* Daftar perangkat output aktif beserta nama dan penanda bawaan. */
    public static PerangkatHasil DaftarPerangkat()
    {
        try
        {
            if (Mati()) return new PerangkatHasil(false, new List<AudioDevice>(), PesanMati);
            var hasil = new List<AudioDevice>();
            IMMDeviceEnumerator? en = null;
            IMMDeviceCollection? kumpulan = null;
            try
            {
                en = BuatEnumerator();
                int hr = en.EnumAudioEndpoints(0, 1, out kumpulan);
                if (hr != 0 || kumpulan == null)
                    return new PerangkatHasil(false, hasil, "Perangkat output tidak dapat dibaca.");

                if (kumpulan.GetCount(out int jumlah) != 0)
                    return new PerangkatHasil(false, hasil, "Perangkat output tidak dapat dibaca.");

                string bawaan = BacaDefaultId(en);
                for (int i = 0; i < jumlah; i++)
                {
                    IMMDevice? dev = null;
                    try
                    {
                        if (kumpulan.Item(i, out dev) != 0 || dev == null) continue;
                        if (dev.GetId(out string id) != 0) id = "";
                        id ??= "";
                        string nama = NamaPerangkat(dev);
                        bool utama = id.Length > 0 && string.Equals(id, bawaan, StringComparison.OrdinalIgnoreCase);
                        hasil.Add(new AudioDevice(id, nama, utama));
                    }
                    finally
                    {
                        Lepas(dev);
                    }
                }
            }
            finally
            {
                Lepas(kumpulan);
                Lepas(en);
            }
            return new PerangkatHasil(true, hasil, "");
        }
        catch
        {
            return new PerangkatHasil(false, new List<AudioDevice>(), "Perangkat output tidak dapat dibaca.");
        }
    }

    /* Putar suara dari berkas lokal atau alamat http(s). Bila perangkatId
       diisi dan berbeda dari default, endpoint default dialihkan sementara
       sampai suara selesai/stop/gagal. */
    public static async Task<PutarHasil> MainkanAsync(string sumber, int volume, string perangkatId)
    {
        try
        {
            if (Mati()) return new PutarHasil(false, PesanMati);

            var cek = PeriksaSumber(sumber);
            if (!cek.Ok) return new PutarHasil(false, cek.Pesan);

            if (volume >= 0) Volatile.Write(ref _volume, NormaVolume(volume));
            int vol = Volatile.Read(ref _volume);
            string dev = (perangkatId ?? "").Trim();

            var dispatcher = AmbilDispatcher();
            if (dispatcher == null)
                return new PutarHasil(false, Mati() ? PesanMati : "Suara tidak dapat diputar.");

            var mulai = await JalankanDiAsync(
                dispatcher,
                () => MulaiPutar(cek.Jalur, vol, dev),
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
                return Task.FromResult(new PemutarStatus(false, false, "", vol, "", PesanMati));

            var dispatcher = AmbilDispatcher();
            if (dispatcher == null)
                return Task.FromResult(new PemutarStatus(false, false, "", vol, "", "Keadaan pemutar tidak dapat dibaca."));

            return JalankanDiAsync(
                dispatcher,
                () => new PemutarStatus(true, _memutar, _sumber, Volatile.Read(ref _volume), _perangkatId),
                new PemutarStatus(false, false, "", vol, "", "Keadaan pemutar tidak dapat dibaca."));
        }
        catch
        {
            return Task.FromResult(new PemutarStatus(false, false, "", Volatile.Read(ref _volume), "", "Keadaan pemutar tidak dapat dibaca."));
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

    /* Hentikan pemutaran, pulihkan rute, lalu matikan thread STA. Setelah ini
       semua operasi gagal dengan aman dan thread tidak dihidupkan lagi. */
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

    /* Siapkan rute, buka media, dan kembalikan tugas "media mulai". */
    private static MulaiInfo MulaiPutar(string jalur, int vol, string dev)
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

        _ruteIni = false;
        _ruteGagalIni = false;
        _namaRute = "";

        if (dev.Length > 0)
        {
            string sekarang = BacaDefaultId();
            if (!string.Equals(sekarang, dev, StringComparison.OrdinalIgnoreCase))
            {
                if (SetDefault(dev, 1) == 0)
                {
                    _ruteAktif = true;
                    _ruteSebelumnya = sekarang;
                    _ruteIni = true;
                    _namaRute = BacaNama(dev);
                    /* Beri waktu Windows memindahkan aliran sebelum media dibuka. */
                    try { Thread.Sleep(200); } catch { }
                }
                else
                {
                    _ruteGagalIni = true;
                }
            }
        }

        _sumberIni = jalur;
        _devIni = dev;
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
        catch
        {
            if (ReferenceEquals(_tungguMulai, tcs)) _tungguMulai = null;
            _memutar = false;
            PulihkanRute();
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
        _perangkatId = _ruteIni ? _devIni : BacaDefaultId();

        string pesan;
        if (_ruteIni)
        {
            pesan = _namaRute.Length > 0
                ? "Memutar lewat " + _namaRute + "; perangkat default sistem dialihkan sementara."
                : "Memutar lewat perangkat pilihan; perangkat default sistem dialihkan sementara.";
        }
        else if (_ruteGagalIni)
        {
            pesan = "Perangkat output tidak dapat dipilih; memakai perangkat default.";
        }
        else
        {
            pesan = "Memutar lewat perangkat default.";
        }

        return new PutarHasil(true, pesan, _ruteIni, _perangkatId, Volatile.Read(ref _volume));
    }

    /* Hentikan media, batalkan permintaan yang menggantung, pulihkan rute. */
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
        PulihkanRute();
    }

    private static void Bersihkan()
    {
        _sesi++;
        _memutar = false;
        _tungguMulai?.TrySetResult(false);
        _tungguMulai = null;
        try { _pemutar?.Stop(); } catch { }
        PulihkanRute();
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
            PulihkanRute();
        }
        _tungguMulai?.TrySetResult(true);
    }

    private static void Pemutar_MediaFailed(object? sender, ExceptionEventArgs e)
    {
        if (!_memutar && _tungguMulai == null) return;
        _mediaGagal = true;
        if (_memutar)
        {
            _memutar = false;
            try { _pemutar?.Stop(); } catch { }
            PulihkanRute();
        }
        _tungguMulai?.TrySetResult(false);
    }

    private static void PulihkanRute()
    {
        if (!_ruteAktif) return;
        _ruteAktif = false;
        string id = _ruteSebelumnya;
        _ruteSebelumnya = "";
        if (id.Length > 0) SetDefault(id, 1);
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
            return new CekSumber(true, uri.AbsoluteUri, "");
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

    /* ---------- Windows Core Audio (COM) ---------- */

    private static IMMDeviceEnumerator BuatEnumerator()
    {
        var tipe = Type.GetTypeFromCLSID(new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E"));
        if (tipe == null) throw new InvalidOperationException("Enumerator audio tidak tersedia.");
        object? obj = Activator.CreateInstance(tipe);
        if (obj == null) throw new InvalidOperationException("Enumerator audio tidak tersedia.");
        return (IMMDeviceEnumerator)obj;
    }

    private static string BacaDefaultId() => BacaDefaultId(null);

    private static string BacaDefaultId(IMMDeviceEnumerator? en)
    {
        IMMDevice? dev = null;
        bool milikSendiri = false;
        try
        {
            if (en == null)
            {
                en = BuatEnumerator();
                milikSendiri = true;
            }
            if (en.GetDefaultAudioEndpoint(0, 1, out dev) != 0 || dev == null) return "";
            if (dev.GetId(out string id) != 0 || id == null) return "";
            return id;
        }
        catch
        {
            return "";
        }
        finally
        {
            Lepas(dev);
            if (milikSendiri) Lepas(en);
        }
    }

    private static string BacaNama(string id)
    {
        if (string.IsNullOrEmpty(id)) return "";
        IMMDeviceEnumerator? en = null;
        IMMDevice? dev = null;
        try
        {
            en = BuatEnumerator();
            if (en.GetDevice(id, out dev) != 0 || dev == null) return "";
            return NamaPerangkat(dev);
        }
        catch
        {
            return "";
        }
        finally
        {
            Lepas(dev);
            Lepas(en);
        }
    }

    private static string NamaPerangkat(IMMDevice dev)
    {
        IPropertyStore? store = null;
        try
        {
            if (dev.OpenPropertyStore(0, out store) != 0 || store == null) return "";

            var kunci = new PROPERTYKEY
            {
                fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"),
                pid = 14,
            };

            if (store.GetValue(ref kunci, out PROPVARIANT nilai) != 0) return "";
            try
            {
                /* VT_LPWSTR = 31: nama perangkat tersimpan sebagai string lebar. */
                if (nilai.vt == 31 && nilai.pointer != IntPtr.Zero)
                    return Marshal.PtrToStringUni(nilai.pointer) ?? "";
                return "";
            }
            finally
            {
                try { PropVariantClear(ref nilai); } catch { }
            }
        }
        catch
        {
            return "";
        }
        finally
        {
            Lepas(store);
        }
    }

    /* IPolicyConfig::SetDefaultEndpoint; 0 berarti berhasil. */
    private static int SetDefault(string id, int role)
    {
        object? obj = null;
        try
        {
            if (string.IsNullOrEmpty(id)) return -1;
            var tipe = Type.GetTypeFromCLSID(new Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9"));
            if (tipe == null) return -1;
            obj = Activator.CreateInstance(tipe);
            if (obj is not IPolicyConfig pc) return -1;
            return pc.SetDefaultEndpoint(id, role);
        }
        catch
        {
            return -1;
        }
        finally
        {
            Lepas(obj);
        }
    }

    private static void Lepas(object? obj)
    {
        if (obj == null) return;
        try
        {
            if (Marshal.IsComObject(obj)) Marshal.ReleaseComObject(obj);
        }
        catch
        {
            /* diabaikan */
        }
    }

    [DllImport("ole32.dll")]
    private static extern int PropVariantClear(ref PROPVARIANT pv);

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator
    {
        [PreserveSig]
        int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection? devices);

        [PreserveSig]
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice? device);

        [PreserveSig]
        int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice? device);

        [PreserveSig]
        int RegisterEndpointNotificationCallback(IntPtr client);

        [PreserveSig]
        int UnregisterEndpointNotificationCallback(IntPtr client);
    }

    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceCollection
    {
        [PreserveSig]
        int GetCount(out int count);

        [PreserveSig]
        int Item(int index, out IMMDevice? device);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice
    {
        [PreserveSig]
        int Activate(ref Guid iid, uint clsCtx, IntPtr activationParams,
            [MarshalAs(UnmanagedType.IUnknown)] out object? iface);

        [PreserveSig]
        int OpenPropertyStore(uint access, out IPropertyStore? store);

        [PreserveSig]
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);

        [PreserveSig]
        int GetState(out int state);
    }

    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    private struct PROPERTYKEY
    {
        public Guid fmtid;
        public int pid;
    }

    /* Ukuran eksplisit 24 byte (x64) agar native tidak menulis melewati
       buffer saat PROPVARIANT dimarshal balik. */
    [StructLayout(LayoutKind.Explicit, Size = 24)]
    private struct PROPVARIANT
    {
        [FieldOffset(0)] public ushort vt;
        [FieldOffset(8)] public IntPtr pointer;
    }

    [ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPropertyStore
    {
        [PreserveSig]
        int GetCount(out int count);

        [PreserveSig]
        int GetAt(int index, out PROPERTYKEY key);

        [PreserveSig]
        int GetValue(ref PROPERTYKEY key, out PROPVARIANT value);

        [PreserveSig]
        int SetValue(ref PROPERTYKEY key, ref PROPVARIANT value);

        [PreserveSig]
        int Commit();
    }

    [ComImport, Guid("f8679f50-850a-41cf-9c72-430f290290c8")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPolicyConfig
    {
        [PreserveSig]
        int GetMixFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceId, out IntPtr format);

        [PreserveSig]
        int GetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int bDefault, out IntPtr format);

        [PreserveSig]
        int ResetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceId);

        [PreserveSig]
        int SetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceId, IntPtr format, IntPtr endpointFormat);

        [PreserveSig]
        int GetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int bDefault, out long a, out long b);

        [PreserveSig]
        int SetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string deviceId, ref long period);

        [PreserveSig]
        int GetShareMode([MarshalAs(UnmanagedType.LPWStr)] string deviceId, out IntPtr mode);

        [PreserveSig]
        int SetShareMode([MarshalAs(UnmanagedType.LPWStr)] string deviceId, IntPtr mode);

        [PreserveSig]
        int GetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string deviceId, ref PROPERTYKEY key, out PROPVARIANT value);

        [PreserveSig]
        int SetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string deviceId, ref PROPERTYKEY key, ref PROPVARIANT value);

        [PreserveSig]
        int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int role);

        [PreserveSig]
        int SetEndpointVisibility([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int visible);
    }
}