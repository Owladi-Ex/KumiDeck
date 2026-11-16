using System.Collections.Concurrent;
using System.IO;
using System.Security.Cryptography;
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

    /* Token pasangan milik perangkat ini (kosong untuk klien loopback).
       Disimpan di data/perangkat.json agar bertahan setelah aplikasi ditutup. */
    public string Token { get; set; } = "";

    /* Tombol "Lupakan perangkat": token langsung ditolak walau perangkat
       menyambung lagi dengan token lama. */
    public bool Dicabut { get; set; }
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
    private volatile bool _volumeTersedia = true;
    private long _volumeCekBerikut;
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

    /* Diisi App setelah jendela dibuat. Dipakai untuk ekspor PNG papan. */
    public Func<int, int, int, int, Task<byte[]?>>? TangkapPapan { get; set; }

    public event Action? MintaTampilJendela;
    public event Action? MintaKeluar;
    /* Setelan "selalu di atas" berubah: App meneruskannya ke jendela. */
    public event Action<bool>? MintaSelaluDiAtas;
    private bool _selaluDiAtas;
    public bool SelaluDiAtas => Store.Deck.Settings.Teratas;

    public KumiServer()
    {
        Store = new DeckStore();
        Lan = NetInfo.AlamatLan();
        MuatPerangkat();
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
                .Select(p => (object)new
                {
                    id = p.Id,
                    platform = p.Platform,
                    name = p.Name,
                    lastSeen = p.LastSeen,
                    dicabut = p.Dicabut,
                })
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
                versi = VersiRingkas(),
                port = Port,
                lan = Lan,
                lanUrl = Skema + "://" + Lan + ":" + Port + "/remote",
                connected = _hub.Jumlah,
            },
        };
    }

    public void SiarState()
    {
        /* Pin jendela ikut setelan papan; hanya dikirim saat nilainya berubah. */
        var teratas = Store.Deck.Settings.Teratas;
        if (teratas != _selaluDiAtas)
        {
            _selaluDiAtas = teratas;
            MintaSelaluDiAtas?.Invoke(teratas);
        }
        _hub.Siar("sync", MuatanState());
    }

    public void SiarPerangkat()
    {
        List<object> devices;
        lock (_perangkat)
        {
            devices = _perangkat.Values
                .Select(p => (object)new
                {
                    id = p.Id,
                    platform = p.Platform,
                    name = p.Name,
                    lastSeen = p.LastSeen,
                    dicabut = p.Dicabut,
                })
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
            var lama = _perangkat.TryGetValue(id, out var p) ? p : null;
            var data = new Perangkat
            {
                Id = id,
                Platform = jenis,
                Name = tampil,
                LastSeen = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                Sambungan = lama?.Sambungan ?? 0,
                /* Token dan status cabut tidak hilang saat perangkat sambung ulang. */
                Token = lama?.Token ?? "",
                Dicabut = lama?.Dicabut ?? false,
            };
            _perangkat[id] = data;
            return data;
        }
    }

    /* Token pasangan milik satu perangkat. Dibuat saat pertama kali dipakai. */
    public string TokenPerangkat(string deviceId)
    {
        if (string.IsNullOrWhiteSpace(deviceId)) return "";
        lock (_perangkat)
        {
            if (!_perangkat.TryGetValue(deviceId, out var p) || p.Dicabut) return "";
            if (p.Token.Length == 0)
            {
                p.Token = Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant();
                SimpanPerangkat();
            }
            return p.Token;
        }
    }

    /* Token milik perangkat yang dipasangkan lewat kode. Kode pasangan adalah
       persetujuan pengguna di layar desktop, jadi perangkat yang pernah
       dilupakan boleh kembali dengan token baru setelah memasukkan kode. */
    public string TokenUntukPasangan(string deviceId, string platform, string nama)
    {
        if (string.IsNullOrWhiteSpace(deviceId)) return "";
        var data = CatatPerangkat(deviceId, platform, nama);
        if (data is null) return "";
        lock (_perangkat)
        {
            if (data.Dicabut || data.Token.Length == 0)
            {
                /* Dicabut = token lama mati; kode baru memberi token baru. */
                data.Dicabut = false;
                data.Token = Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant();
                SimpanPerangkat();
            }
            return data.Token;
        }
    }

    /* Token dicocokkan ke perangkat mana pun yang masih aktif. */
    public bool TokenPerangkatSah(string token)
    {
        if (string.IsNullOrWhiteSpace(token)) return false;
        lock (_perangkat)
        {
            return _perangkat.Values.Any(p => !p.Dicabut && p.Token.Length > 0 &&
                                              string.Equals(p.Token, token, StringComparison.Ordinal));
        }
    }

    /* Lupakan perangkat: tokennya langsung ditolak. Entri tetap disimpan
       dengan tanda dicabut supaya ponsel itu harus memasang ulang. */
    public void CabutPerangkat(string id)
    {
        lock (_perangkat)
        {
            var data = _perangkat.TryGetValue(id, out var p) ? p : null;
            if (data is null) return;
            data.Dicabut = true;
            data.Token = "";
            SimpanPerangkat();
            /* Putuskan sambungan SSE perangkat itu supaya status berubah. */
            _hub.Siar("devices", _perangkat.Values
                .Select(x => (object)new
                {
                    id = x.Id,
                    platform = x.Platform,
                    name = x.Name,
                    lastSeen = x.LastSeen,
                    dicabut = x.Dicabut,
                })
                .ToList());
        }
        SiarState();
    }

    private void MuatPerangkat()
    {
        try
        {
            var jalur = Path.Combine(AppPaths.Data, "perangkat.json");
            if (!File.Exists(jalur)) return;
            var daftar = JsonSerializer.Deserialize<List<Perangkat>>(File.ReadAllText(jalur), Json.Opsi);
            if (daftar is null) return;
            lock (_perangkat)
            {
                foreach (var p in daftar)
                {
                    if (string.IsNullOrWhiteSpace(p.Id)) continue;
                    p.Sambungan = 0;
                    _perangkat[p.Id] = p;
                }
            }
        }
        catch (Exception ex)
        {
            Log.Warn("Daftar perangkat tidak terbaca: " + ex.Message);
        }
    }

    private void SimpanPerangkat()
    {
        try
        {
            Directory.CreateDirectory(AppPaths.Data);
            var jalur = Path.Combine(AppPaths.Data, "perangkat.json");
            var daftar = _perangkat.Values.Where(p => p.Token.Length > 0 || p.Dicabut).ToList();
            File.WriteAllText(jalur, JsonSerializer.Serialize(daftar, Json.Opsi));
        }
        catch (Exception ex)
        {
            Log.Warn("Daftar perangkat tidak dapat disimpan: " + ex.Message);
        }
    }

    private static string VersiRingkas()
    {
        try
        {
            return typeof(KumiServer).Assembly.GetName().Version?.ToString(3) ?? "0.0.0";
        }
        catch
        {
            return "0.0.0";
        }
    }


    public void CatatAktivitas(Aktivitas entri)
    {
        List<Aktivitas> salinan;
        lock (_kunciAktivitas)
        {
            _aktivitas.Insert(0, entri);
            if (_aktivitas.Count > 30) _aktivitas.RemoveRange(30, _aktivitas.Count - 30);
            /* Ambil salinan di dalam lock supaya siaran tidak membaca daftar
               yang sedang diubah permintaan lain. */
            salinan = _aktivitas.ToList();
        }
        _hub.Siar("activity", salinan);
    }

    private void BersihkanPerangkat()
    {
        var batas = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - 45000;
        var berubah = false;
        lock (_perangkat)
        {
            foreach (var (id, data) in _perangkat.ToList())
            {
                /* Perangkat yang sudah dipasangkan (punya token) atau pernah
                   dilupakan tetap disimpan sampai pengguna menghapusnya; hanya
                   entri otomatis tanpa token yang dibersihkan. */
                if (data.Token.Length > 0 || data.Dicabut) continue;
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
       bila berubah, saat tombol ditekan, atau tiap 5 detik sebagai detak.
       Penjaga reentrasi: timer bisa menumpuk bila satu detak lambat (COM
       volume/media), jadi detak berikutnya dilewati sampai yang ini selesai. */
    private int _detakBerjalan;

    private void Detak()
    {
        if (Interlocked.CompareExchange(ref _detakBerjalan, 1, 0) != 0) return;
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
                    if (hasil.Ok)
                    {
                        _volumeTerakhir = hasil;
                    }
                    else
                    {
                        /* Endpoint tidak ada (mis. tanpa perangkat keluaran):
                           berhenti menanyakan tiap detak, coba lagi tiap 60 detik. */
                        _volumeTersedia = false;
                        _volumeCekBerikut = sekarang + 60000;
                    }
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
        finally
        {
            Interlocked.Exchange(ref _detakBerjalan, 0);
        }
    }

    /* Kontrol volume hanya ditanyakan bila endpoint-nya ada. Setelah gagal,
       tunggu 60 detik sebelum mencoba lagi supaya detak tidak memanggil COM
       tiap 700 ms di mesin tanpa perangkat keluaran. */
    private bool VolumeControlAda()
    {
        if (_volumeTersedia) return true;
        var sekarang = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (sekarang < Interlocked.Read(ref _volumeCekBerikut)) return false;
        _volumeTersedia = true;
        return true;
    }

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
        /* Jangan percaya Host kiriman klien: pengalih hanya menunjuk ke alamat
           LAN mesin ini. Target dibatasi ke jalur lokal ("/...", bukan "//...")
           supaya permintaan tidak bisa dipakai sebagai open redirect. */
        var tujuan = req.Target;
        if (string.IsNullOrEmpty(tujuan) ||
            tujuan[0] != '/' ||
            tujuan.StartsWith("//", StringComparison.Ordinal))
        {
            tujuan = "/";
        }
        res.Header["Location"] = "https://" + Lan + ":" + Port + tujuan;
        return Task.CompletedTask;
    }

    public TlsMaterial? Tls => _tls;

    /* ------------------------------------------------- pengunjung jendela -- */
    public static bool AlamatLokal(HttpPermintaan req) =>
        req.Lokal || req.AlamatRemote is "127.0.0.1" or "::1" or "::ffff:127.0.0.1";

    public bool Terautentikasi(HttpPermintaan req)
    {
        if (AlamatLokal(req)) return true;
        var token = TokenDari(req);
        if (token.Length == 0) return false;
        return token == Store.Token || TokenPerangkatSah(token);
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
