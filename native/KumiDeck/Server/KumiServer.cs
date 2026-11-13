using System.Collections.Concurrent;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using KumiDeck.Apps;
using KumiDeck.Actions;
using KumiDeck.Audio;
using KumiDeck.Core;
using KumiDeck.Data;
using KumiDeck.Media;
using KumiDeck.Platform;

namespace KumiDeck.Server;

public sealed class Perangkat
{
    public string Id { get; set; } = "";
    public string Platform { get; set; } = "desktop";
    public string Name { get; set; } = "Desktop";
    public long LastSeen { get; set; }
    public int Sambungan { get; set; }
}

public sealed class Aktivitas
{
    public string Id { get; set; } = "";
    public long Time { get; set; }
    public string PageId { get; set; } = "";
    public string KeyId { get; set; } = "";
    public string Label { get; set; } = "";
    public bool Ok { get; set; }
    public string Message { get; set; } = "";
    public string Platform { get; set; } = "desktop";
    public long Durasi { get; set; }
}

/* Inti aplikasi: papan, SSE, server HTTP, baki sistem, dan data hidup.
   Padanan native dari server/index.js versi Node. */
public sealed partial class KumiServer
{
    private readonly WebAssets _aset = new();
    private HttpServer? _http;
    private HttpServer? _httpAlih;
    private readonly SseHub _hub = new();
    private readonly Dictionary<string, Perangkat> _perangkat = new();
    private readonly List<Aktivitas> _aktivitas = new();
    private readonly object _kunciAktivitas = new();
    private readonly Dictionary<string, (int Jumlah, long Reset)> _percobaanPasangan = new();
    private readonly Random _acak = new();

    private readonly System.Threading.Timer _timerLive;
    private readonly System.Threading.Timer _timerBersih;

    private VolumeState? _volumeTerakhir;
    private string _liveTerakhir = "";
    private string _sinyalTerakhir = "";
    private long _akhirLive;
    private long _akhirSinyal;
    private long _akhirKirimSinyal;
    private long _kedipTerakhir;
    private int _aksiBerjalan;

    private TlsMaterial? _tls;
    private long _kedipTerakhirTombol;

    public DeckStore Store { get; }
    public SseHub Hub => _hub;
    public WebAssets Aset => _aset;
    public int Port => _http?.Port ?? 0;
    public bool Https => _http?.Https ?? false;
    public string Skema => Https ? "https" : "http";
    public string Lan { get; private set; } = "127.0.0.1";
    public string Url => Skema + "://localhost:" + Port + "/";
    public string TautanRemote => Skema + "://" + Lan + ":" + Port + "/remote?kode=" + Store.Token;
    public string KodeTampil => Store.KodeTampil;
    public TrayIcon? Tray { get; private set; }

    public event Action? MintaTampilJendela;
    public event Action? MintaKeluar;

    public KumiServer()
    {
        Store = new DeckStore();
        Lan = NetInfo.AlamatLan();
        _timerLive = new System.Threading.Timer(_ => Detak(), null, 500, 500);
        _timerBersih = new System.Threading.Timer(_ => BersihkanPerangkat(), null, 15000, 15000);
    }

    public async Task<string> MulaiAsync()
    {
        Lan = NetInfo.AlamatLan();

        /* HTTPS opsional (KD_HTTPS=1) untuk pemasangan PWA di perangkat Remote. */
        if (Environment.GetEnvironmentVariable("KD_HTTPS") == "1")
        {
            try
            {
                _tls = TlsMaterial.Siapkan(AppPaths.Tls, Lan, NetInfo.NamaMesin());
            }
            catch (Exception ex)
            {
                Log.Warn("HTTPS tidak dapat disiapkan: " + ex.Message);
                _tls = null;
            }
        }

        _http = new HttpServer(TanganiPermintaanAsync);
        await _http.MulaiAsync(4173, _tls?.Sertifikat);

        /* Pengalihan HTTP → HTTPS hanya bila sertifikat siap. */
        if (_tls is not null)
        {
            try
            {
                _httpAlih = new HttpServer(TanganiAlihHttps);
                await _httpAlih.MulaiAsync(Port + 1);
            }
            catch (Exception ex)
            {
                Log.Warn("pengalihan HTTP tidak dapat dimulai: " + ex.Message);
                _httpAlih = null;
            }
        }

        Log.Info("KumiDeck " + Skema + "://localhost:" + Port + " (LAN " + Lan + ")");

        SiapkanTray();
        PerbaruiDataHidup();
        PeriksaPengamatJendela();
        WindowWatcher.Berubah += SaatJendelaDepanBerubah;

        return Url;
    }

    public void Berhenti()
    {
        try
        {
            _timerLive.Dispose();
            _timerBersih.Dispose();
        }
        catch
        {
            /* diabaikan */
        }

        try
        {
            MediaWatcher.Hentikan();
        }
        catch
        {
            /* diabaikan */
        }
        try
        {
            WindowWatcher.Hentikan();
        }
        catch
        {
            /* diabaikan */
        }
        try
        {
            SoundBoard.Shutdown();
        }
        catch
        {
            /* diabaikan */
        }

        Tray?.Dispose();
        Tray = null;

        try
        {
            Store.Simpan();
        }
        catch
        {
            /* diabaikan */
        }

        try
        {
            _hub.TutupSemua();
        }
        catch
        {
            /* diabaikan */
        }

        _http?.BerhentiAsync().GetAwaiter().GetResult();
        _httpAlih?.BerhentiAsync().GetAwaiter().GetResult();
    }

    public void BukaDiPeramban()
    {
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(Url) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            Log.Warn("peramban tidak dapat dibuka: " + ex.Message);
        }
    }

    /* ------------------------------------------------------------ tray ---- */
    private void SiapkanTray()
    {
        if (Environment.GetEnvironmentVariable("KD_TRAY") == "0") return;
        if (!TrayPreferensi()) return;
        PastikanTray(true);
    }

    private bool TrayPreferensi()
    {
        try
        {
            var berkas = Path.Combine(AppPaths.Data, "tray.on");
            return !File.Exists(berkas) || File.ReadAllText(berkas).Trim() != "0";
        }
        catch
        {
            return true;
        }
    }

    public bool PastikanTray(bool aktif)
    {
        try
        {
            if (!aktif)
            {
                Tray?.Dispose();
                Tray = null;

                /* Tanpa ikon baki, jendela adalah satu-satunya jalan masuk.
                   Pastikan jendela tidak tertinggal tersembunyi. */
                MintaTampilJendela?.Invoke();
                return false;
            }
            if (Tray is not null) return true;
            Tray = new TrayIcon(
                "KumiDeck",
                () => MintaTampilJendela?.Invoke(),
                BukaDiPeramban,
                () =>
                {
                    try
                    {
                        System.Windows.Clipboard.SetText(TautanRemote);
                        return true;
                    }
                    catch
                    {
                        return false;
                    }
                },
                () => MintaKeluar?.Invoke());
            return true;
        }
        catch (Exception ex)
        {
            Log.Warn("baki sistem gagal: " + ex.Message);
            return false;
        }
    }

    /* ------------------------------------------------------------ data ---- */
    public object MuatanSinyal()
    {
        var j = WindowWatcher.Info();
        var volume = _volumeTerakhir is { } v
            ? new { persen = v.Volume, mute = v.Mute }
            : null;
        return new
        {
            jendela = new { ada = j.Ada, proses = j.Proses, judul = j.Judul },
            volume,
            aktif = j.Ada ? j.Proses : "",
        };
    }

    public object MuatanLive()
    {
        return new
        {
            now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            media = MediaWatcher.Info(),
        };
    }

    public object MuatanState()
    {
        List<object> devices;
        lock (_perangkat)
        {
            devices = _perangkat.Values
                .Select(p => (object)new { id = p.Id, platform = p.Platform, name = p.Name, lastSeen = p.LastSeen })
                .ToList();
        }
        List<Aktivitas> aktivitas;
        lock (_kunciAktivitas)
        {
            aktivitas = _aktivitas.ToList();
        }
        return new
        {
            deck = Store.Deck,
            devices,
            activity = aktivitas,
            live = MuatanLive(),
            sinyal = MuatanSinyal(),
            server = new
            {
                name = "KumiDeck",
                port = Port,
                lan = Lan,
                lanUrl = Skema + "://" + Lan + ":" + Port + "/remote",
                connected = _hub.Jumlah,
            },
        };
    }

    public void SiarState() => _hub.Siar("sync", MuatanState());

    public void SiarPerangkat()
    {
        List<object> devices;
        lock (_perangkat)
        {
            devices = _perangkat.Values
                .Select(p => (object)new { id = p.Id, platform = p.Platform, name = p.Name, lastSeen = p.LastSeen })
                .ToList();
        }
        _hub.Siar("devices", devices);
    }

    public Perangkat? CatatPerangkat(string id, string platform, string nama)
    {
        if (string.IsNullOrWhiteSpace(id)) return null;

        var jenis = platform == "android" ? "android" : "desktop";
        var tampil = (nama ?? "").Trim();
        if (tampil.Length == 0) tampil = jenis == "android" ? "Perangkat Remote" : "Desktop";
        if (tampil.Length > 32) tampil = tampil[..32].TrimEnd();

        lock (_perangkat)
        {
            var data = new Perangkat
            {
                Id = id,
                Platform = jenis,
                Name = tampil,
                LastSeen = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                Sambungan = _perangkat.TryGetValue(id, out var lama) ? lama.Sambungan : 0,
            };
            _perangkat[id] = data;
            return data;
        }
    }

    public void CatatAktivitas(Aktivitas entri)
    {
        lock (_kunciAktivitas)
        {
            _aktivitas.Insert(0, entri);
            if (_aktivitas.Count > 30) _aktivitas.RemoveRange(30, _aktivitas.Count - 30);
        }
        _hub.Siar("activity", _aktivitas.ToList());
    }

    private void BersihkanPerangkat()
    {
        var batas = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - 45000;
        var berubah = false;
        lock (_perangkat)
        {
            foreach (var (id, data) in _perangkat.ToList())
            {
                if (data.Sambungan <= 0 && data.LastSeen < batas)
                {
                    _perangkat.Remove(id);
                    berubah = true;
                }
            }
        }
        if (berubah) SiarPerangkat();
    }

    /* ------------------------------------------------------ data hidup ----- */
    private bool AdaWidgetMedia() =>
        Store.Deck.Pages.Any(h => h.Keys.Any(k => k?.Widget?.Type == "media"));

    private bool AdaTandaAktif() =>
        Store.Deck.Pages.Any(h => h.Keys.Any(k => k?.TandaiAktif is not null));

    private bool AdaAksiBersyarat()
    {
        static bool Cek(Aksi? aksi)
        {
            if (aksi is null) return false;
            if (aksi.Type == "kondisional") return true;
            if (aksi.Type == "urutan" && aksi.Steps is not null) return aksi.Steps.Any(l => Cek(l.Action));
            return false;
        }
        return Store.Deck.Pages.Any(h => h.Keys.Any(k => Cek(k?.Action)));
    }

    public void PeriksaPengamatJendela()
    {
        if (AdaTandaAktif() || Store.Deck.Settings.AutoProfil || AdaAksiBersyarat())
        {
            WindowWatcher.Mulai();
        }
    }

    private void PerbaruiDataHidup()
    {
        var perluMedia = AdaWidgetMedia();
        if (perluMedia) MediaWatcher.Mulai();
        else MediaWatcher.Hentikan();
        PeriksaPengamatJendela();
    }

    /* Satu detak 500 ms: widget media + sinyal (jendela/volume) hanya dikirim
       bila berubah, saat tombol ditekan, atau tiap 5 detik sebagai detak. */
    private void Detak()
    {
        try
        {
            var sekarang = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            if (AdaWidgetMedia())
            {
                MediaWatcher.Mulai();
                var muatan = MuatanLive();
                var kunci = JsonSerializer.Serialize(MediaWatcher.Info(), Json.Ringkas);
                if (kunci != _liveTerakhir || sekarang - _akhirLive > 15000)
                {
                    _liveTerakhir = kunci;
                    _akhirLive = sekarang;
                    _hub.Siar("live", muatan);
                }
            }

            if (sekarang - _akhirSinyal >= 700)
            {
                _akhirSinyal = sekarang;
                if (VolumeControlAda())
                {
                    var hasil = VolumeControl.Baca();
                    if (hasil.Ok) _volumeTerakhir = hasil;
                }

                var sinyal = MuatanSinyal();
                var kunciSinyal = JsonSerializer.Serialize(sinyal, Json.Ringkas);
                var adaTekan = sekarang - _kedipTerakhirTombol < 900;
                if (kunciSinyal != _sinyalTerakhir ||
                    (adaTekan && sekarang - _kedipTerakhir > 300) ||
                    sekarang - _akhirKirimSinyal > 5000)
                {
                    _sinyalTerakhir = kunciSinyal;
                    _kedipTerakhir = sekarang;
                    _akhirKirimSinyal = sekarang;
                    _hub.Siar("sinyal", sinyal);
                }
            }
        }
        catch (Exception ex)
        {
            Log.Warn("detak live: " + ex.Message);
        }
    }

    private static bool VolumeControlAda() => true;

    public void TandaiTekan()
    {
        _kedipTerakhirTombol = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }

    /* ------------------------------------------------------ otomatisasi ---- */
    public void PeriksaProfilOtomatis()
    {
        if (!Store.Deck.Settings.AutoProfil) return;
        var j = WindowWatcher.Info();
        var aturan = Store.Deck.Otomatis.FirstOrDefault(r =>
            r.Aktif && WindowWatcher.CocokJendela(new Syarat { Proses = r.Proses, Jendela = r.Jendela }, j));
        if (aturan is null) return;
        _hub.Siar("profil", new { pageId = aturan.PageId, alasan = j.Proses.Length > 0 ? j.Proses : j.Judul, otomatis = true });
    }

    /* Dipanggil WindowWatcher saat jendela depan berganti. */
    private void SaatJendelaDepanBerubah(InfoJendela info)
    {
        try
        {
            PeriksaProfilOtomatis();
        }
        catch (Exception ex)
        {
            Log.Warn("profil otomatis: " + ex.Message);
        }
    }

    /* --------------------------------------------------------- pasangan ---- */
    public bool IzinPasangan(string ip)
    {
        var sekarang = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        lock (_percobaanPasangan)
        {
            if (!_percobaanPasangan.TryGetValue(ip, out var data) || sekarang > data.Reset)
            {
                _percobaanPasangan[ip] = (1, sekarang + 60000);
                return true;
            }
            var jumlah = data.Jumlah + 1;
            _percobaanPasangan[ip] = (jumlah, data.Reset);
            return jumlah <= 10;
        }
    }

    public void TambahAksi()
    {
        Interlocked.Increment(ref _aksiBerjalan);
    }

    public void KurangiAksi()
    {
        Interlocked.Decrement(ref _aksiBerjalan);
    }

    public int AksiBerjalan => Volatile.Read(ref _aksiBerjalan);

    /* ------------------------------------------------------------ HTTPS --- */
    private Task TanganiAlihHttps(HttpPermintaan req, HttpJawaban res)
    {
        if (req.Jalur == "/sertifikat.cer" && _tls is not null)
        {
            try
            {
                var isi = File.ReadAllBytes(_tls.BerkasCer);
                res.Status = 200;
                res.Tipe = "application/x-x509-ca-cert";
                res.Isi = isi;
                res.Header["Content-Disposition"] = "attachment; filename=\"kumideck.cer\"";
                return Task.CompletedTask;
            }
            catch
            {
                res.Status = 404;
                res.Tipe = "text/plain; charset=utf-8";
                res.Isi = Encoding.UTF8.GetBytes("Sertifikat belum dibuat.");
                return Task.CompletedTask;
            }
        }

        res.Status = 308;
        res.Tipe = "text/plain; charset=utf-8";
        res.Isi = Array.Empty<byte>();
        res.Header["Location"] = "https://" + (string.IsNullOrEmpty(req.Host) ? Lan + ":" + Port : req.Host) + req.Target;
        return Task.CompletedTask;
    }

    public TlsMaterial? Tls => _tls;

    /* ------------------------------------------------- pengunjung jendela -- */
    public static bool AlamatLokal(HttpPermintaan req) =>
        req.Lokal || req.AlamatRemote is "127.0.0.1" or "::1" or "::ffff:127.0.0.1";

    public bool Terautentikasi(HttpPermintaan req)
    {
        if (AlamatLokal(req)) return true;
        return TokenDari(req) == Store.Token;
    }

    private static string TokenDari(HttpPermintaan req)
    {
        if (req.Header.TryGetValue("x-kumi-token", out var header) && !string.IsNullOrWhiteSpace(header))
        {
            return header.Trim().ToLowerInvariant();
        }
        var dariQuery = req.Q("kode");
        return dariQuery is null ? "" : dariQuery.Trim().ToLowerInvariant().Replace("-", "").Replace(" ", "");
    }

    /* ------------------------------------------------------------- asal --- */
    public bool HostDiizinkan(string host)
    {
        if (string.IsNullOrWhiteSpace(host)) return true;
        var nama = host.Split(':')[0].Trim('[', ']').ToLowerInvariant();
        if (nama.Length == 0) return true;
        if (nama is "localhost" or "127.0.0.1" or "::1") return true;
        if (nama == Lan.ToLowerInvariant()) return true;
        if (nama == NetInfo.NamaMesin().ToLowerInvariant()) return true;
        return false;
    }

    public (bool Ok, string Pesan) PeriksaAsal(HttpPermintaan req)
    {
        if (req.Header.TryGetValue("sec-fetch-site", out var situs) &&
            situs.Equals("cross-site", StringComparison.OrdinalIgnoreCase))
        {
            return (false, "Permintaan dari situs lain ditolak.");
        }

        if (req.Header.TryGetValue("origin", out var origin) && !string.IsNullOrWhiteSpace(origin))
        {
            string hostOrigin;
            try
            {
                hostOrigin = new Uri(origin).Authority;
            }
            catch
            {
                return (false, "Origin tidak valid.");
            }
            if (!string.Equals(hostOrigin, req.Host, StringComparison.OrdinalIgnoreCase))
            {
                return (false, "Origin tidak cocok dengan server ini.");
            }
        }

        if (!HostDiizinkan(req.Host))
        {
            return (false, "Host tidak dikenal. Buka lewat localhost atau alamat LAN.");
        }
        return (true, "");
    }

    /* ---------------------------------------------------------- berkas ----- */
    public static bool HanyaMembukaKunci(JsonElement deckBaru, Deck deckSekarang)
    {
        if (deckBaru.ValueKind != JsonValueKind.Object) return false;
        if (!deckBaru.TryGetProperty("settings", out var setelan) ||
            setelan.ValueKind != JsonValueKind.Object)
        {
            return false;
        }
        if (!setelan.TryGetProperty("terkunci", out var terkunci) || terkunci.ValueKind != JsonValueKind.False)
        {
            return false;
        }

        try
        {
            /* Bandingkan bentuk ternormalisasi, bukan teks mentah: urutan kunci
               dan escape dari klien bisa berbeda tanpa mengubah arti. */
            var baru = DeckNormalizer.NormalDeck(deckBaru, deckSekarang);
            baru.Settings.Terkunci = false;

            var lama = DeckNormalizer.NormalDeck(
                JsonSerializer.SerializeToElement(deckSekarang, Json.Opsi));
            lama.Settings.Terkunci = false;

            var teksBaru = JsonSerializer.Serialize(baru, Json.Opsi);
            var teksLama = JsonSerializer.Serialize(lama, Json.Opsi);
            return teksBaru == teksLama;
        }
        catch
        {
            return false;
        }
    }

    /* --------------------------------------------------- ikon & suara ----- */
    public static readonly Dictionary<string, string> TipeIkon = new()
    {
        [".svg"] = "image/svg+xml",
        [".png"] = "image/png",
        [".webp"] = "image/webp",
    };

    public List<object> DaftarIkon()
    {
        var hasil = new List<object>();
        try
        {
            if (!Directory.Exists(AppPaths.Ikon)) return hasil;
            foreach (var berkas in Directory.GetFiles(AppPaths.Ikon)
                         .Where(f => System.Text.RegularExpressions.Regex.IsMatch(
                             Path.GetFileName(f), @"^kst_[a-z0-9]{4,16}\.(svg|png|webp)$"))
                         .OrderBy(f => f, StringComparer.Ordinal))
            {
                var id = Path.GetFileNameWithoutExtension(berkas);
                var ext = Path.GetExtension(berkas).ToLowerInvariant();
                hasil.Add(new
                {
                    id,
                    url = "/ikon/" + id,
                    tipe = TipeIkon.TryGetValue(ext, out var t) ? t : "application/octet-stream",
                    ukuran = new FileInfo(berkas).Length,
                });
            }
        }
        catch
        {
            /* folder ikon belum ada */
        }
        return hasil;
    }

    public static bool SimpanIkon(string id, byte[] isi, string ekstensi)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(id, "^kst_[a-z0-9]{4,16}$")) return false;
        if (!TipeIkon.ContainsKey("." + ekstensi)) return false;
        try
        {
            Directory.CreateDirectory(AppPaths.Ikon);
            File.WriteAllBytes(Path.Combine(AppPaths.Ikon, id + "." + ekstensi), isi);
            return true;
        }
        catch
        {
            return false;
        }
    }

    public static (byte[] Isi, string Tipe, string Ekstensi)? BacaIkon(string id)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(id, "^kst_[a-z0-9]{4,16}$")) return null;
        foreach (var (ext, tipe) in TipeIkon)
        {
            var berkas = Path.Combine(AppPaths.Ikon, id + ext);
            try
            {
                if (File.Exists(berkas)) return (File.ReadAllBytes(berkas), tipe, ext[1..]);
            }
            catch
            {
                /* coba ekstensi berikutnya */
            }
        }
        return null;
    }
}
