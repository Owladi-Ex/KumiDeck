using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace KumiDeck.Apps;

public sealed record Aplikasi(string Id, string Name, string Target, string Icon, string Sumber);

public sealed record DaftarAplikasi(List<Aplikasi> Aplikasi, long Diambil, string? Galat);

/* Pemindai aplikasi terpasang di Windows untuk pemilih aplikasi.

   Sumber data:
   - Aplikasi desktop klasik: pintasan *.lnk di folder Start Menu pengguna dan
     All Users, diselesaikan lewat COM IShellLink + IPersistFile.
   - Aplikasi Store/UWP: enumerasi shell:AppsFolder lewat COM Shell.Application
     (late-bound IDispatch), targetnya "shell:AppsFolder\<AppUserModelID>".
   - Cadangan: Spotify/Discord/Steam bila berkasnya nyata (target protokol).

   Hasil di-cache 5 menit. Fungsi utama tidak pernah melempar galat: bila
   sebagian pemindaian gagal, aplikasi yang berhasil tetap dikembalikan
   bersama pesan Galat. */
public static class AppScanner
{
    private const long UmurCacheMs = 5 * 60 * 1000;

    /* Batas jumlah butir agar pemindaian tetap cepat pada sistem yang lambat
       atau folder Start Menu yang membengkak. */
    private const int BatasButir = 500;

    /* Batas waktu satu sumber pemindaian (klasik / Store). */
    private const int BatasWaktuPindaiMs = 25000;

    /* Cache hasil pemindaian. */
    private static readonly object Kunci = new();
    private static DaftarAplikasi? _cache;
    private static long _kedaluwarsa;
    private static Task<DaftarAplikasi>? _sedang;

    /* Pola yang sama dengan apps.js. */
    private static readonly Regex PolaLewati = new(
        "uninstall|uninst|setup|update|readme|help|license|documentation|website|changelog",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex PolaSistemStore = new(
        "^(settings|cortana|search|security|get help|tips|mixed reality|quick assist|phone link|xbox game bar)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex PolaUrl = new(
        "^[a-z]+://",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex PolaSpasi = new(
        @"\s+",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex PolaShortcut = new(
        @"\s*-\s*shortcut$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex PolaSettings = new(
        @"^(windows\s+)?settings$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);

    /* Ikon yang dikenal antarmuka papan tombol. */
    private static readonly HashSet<string> IkonDiizinkan = new(StringComparer.Ordinal)
    {
        "i-play", "i-volume", "i-gamepad", "i-code", "i-image", "i-globe", "i-mail",
        "i-users", "i-chart-bar", "i-folder", "i-file", "i-plus", "i-settings",
        "i-database", "i-bell", "i-cloud", "i-bolt", "i-shield", "i-book", "i-grid",
    };

    /* Heuristik ikon: diperiksa berurutan, yang pertama cocok menang.
       Daftar disalin apa adanya dari apps.js. */
    private static readonly (Regex Pola, string Ikon)[] PetunjukIkon =
    {
        (new Regex("spotify", Opsi), "i-play"),
        (new Regex("discord", Opsi), "i-users"),
        (new Regex(@"steam|epic games|gog galaxy|\bgog\b", Opsi), "i-gamepad"),
        (new Regex(@"visual studio code|vscode|sublime|notepad\+\+|intellij|pycharm|webstorm|android studio|opencode|cursor|\bcode\b", Opsi), "i-code"),
        (new Regex("chrome|edge|brave|firefox|opera|vivaldi|browser", Opsi), "i-globe"),
        (new Regex("notepad", Opsi), "i-file"),
        (new Regex(@"calculator|\bcalc\b", Opsi), "i-plus"),
        (new Regex(@"paint|photoshop|gimp|figma|blender|affinity|canva|inkscape|krita|\bobs\b|image|photo|camera", Opsi), "i-image"),
        (new Regex("vlc|foobar|itunes|media player|winamp|music|audio player", Opsi), "i-play"),
        (new Regex(@"terminal|powershell|\bcmd\b|command prompt|windows terminal|\bwt\b", Opsi), "i-code"),
        (new Regex("explorer|file manager", Opsi), "i-folder"),
        (new Regex(@"\bword\b|excel|powerpoint|libreoffice|acrobat|pdf", Opsi), "i-file"),
        (new Regex(@"whatsapp|telegram|signal|zoom|teams|slack|discord|meet\b|chatgpt|claude", Opsi), "i-users"),
        (new Regex(@"thunderbird|outlook|\bmail\b", Opsi), "i-mail"),
        (new Regex(@"onedrive|dropbox|google drive|\bcloud\b", Opsi), "i-cloud"),
        (new Regex(@"todoist|notion|obsidian|onenote|evernote|\bbook\b", Opsi), "i-book"),
        (new Regex(@"database|\bsql\b|mongodb|redis", Opsi), "i-database"),
        (new Regex(@"antivirus|defender|security|vpn|\bshield\b", Opsi), "i-shield"),
        (new Regex(@"\bsettings\b|control panel", Opsi), "i-settings"),
        (new Regex(@"\bvolume\b|realtek|audio console", Opsi), "i-volume"),
        (new Regex("chart|statistic|graph", Opsi), "i-chart-bar"),
        (new Regex("notification|alarm|reminder", Opsi), "i-bell"),
        (new Regex("game|gaming|roblox|bloxstrap|xbox", Opsi), "i-gamepad"),
        (new Regex(@"power|battery|energy|\bbolt\b", Opsi), "i-bolt"),
    };

    private const RegexOptions Opsi =
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant;

    /* Aplikasi terkenal dengan protokol URI yang terdaftar di Windows. */
    private static readonly (Regex Pola, string Protokol)[] ProtokolTerkenal =
    {
        (new Regex(@"\bspotify\b", Opsi), "spotify:"),
        (new Regex(@"\bdiscord\b", Opsi), "discord:"),
        (new Regex(@"\bsteam\b", Opsi), "steam:"),
    };

    /* API publik: daftar aplikasi terpasang. Hasil di-cache 5 menit; paksa=true
       memaksa pemindaian ulang. Tidak pernah melempar galat. */
    public static Task<DaftarAplikasi> DaftarAsync(bool paksa)
    {
        try
        {
            lock (Kunci)
            {
                if (!paksa && _cache is not null && SekarangMs() < _kedaluwarsa)
                    return Task.FromResult(_cache);

                /* Permintaan kedua menunggu pemindaian yang sama agar tidak ada
                   dua pemindaian penuh yang saling menimpa cache. */
                if (_sedang is not null) return _sedang;

                return MulaiPindai();
            }
        }
        catch (Exception ex)
        {
            /* Jaring pengaman terakhir: tetap kembalikan bentuk hasil yang sah. */
            return Task.FromResult(GagalTotal(ex));
        }
    }

    private static Task<DaftarAplikasi> MulaiPindai()
    {
        var tcs = new TaskCompletionSource<DaftarAplikasi>(TaskCreationOptions.RunContinuationsAsynchronously);
        _sedang = tcs.Task; /* dipanggil di dalam lock */

        _ = Task.Run(async () =>
        {
            DaftarAplikasi hasil;
            try
            {
                hasil = await PindaiSemuaAsync().ConfigureAwait(false);
                lock (Kunci)
                {
                    _cache = hasil;
                    _kedaluwarsa = SekarangMs() + UmurCacheMs;
                }
            }
            catch (Exception ex)
            {
                /* Kegagalan total tidak di-cache agar percobaan berikutnya
                   bisa memindai ulang. */
                hasil = GagalTotal(ex);
            }
            finally
            {
                lock (Kunci)
                {
                    if (ReferenceEquals(_sedang, tcs.Task)) _sedang = null;
                }
            }

            tcs.TrySetResult(hasil);
        });

        return tcs.Task;
    }

    /* ------------------------------------------------------------ pemindaian --- */

    private sealed record Kandidat(string Nama, string Target, string Sumber);

    private sealed record HasilSumber(List<Kandidat> Daftar, string? Galat);

    private static async Task<DaftarAplikasi> PindaiSemuaAsync()
    {
        var galat = new List<string>();

        var tugasKlasik = PindaiKlasikAsync();
        var tugasStore = PindaiStoreAsync();
        var hasil = await Task.WhenAll(tugasKlasik, tugasStore).ConfigureAwait(false);

        var klasik = hasil[0];
        var store = hasil[1];
        if (!string.IsNullOrEmpty(klasik.Galat)) galat.Add(klasik.Galat!);
        if (!string.IsNullOrEmpty(store.Galat)) galat.Add(store.Galat!);

        /* Aplikasi klasik diutamakan karena targetnya berupa jalur exe/protokol. */
        var mentah = new List<Kandidat>();
        var kunci = new HashSet<string>(StringComparer.Ordinal);

        void Tambah(Kandidat kandidat)
        {
            if (mentah.Count >= BatasButir) return;
            var nama = BersihkanNama(kandidat.Nama);
            var k = KunciNama(nama);
            if (nama.Length == 0 || k.Length == 0) return;
            if (!kunci.Add(k)) return;
            mentah.Add(new Kandidat(nama, kandidat.Target ?? "", kandidat.Sumber));
        }

        foreach (var butir in klasik.Daftar) Tambah(butir);
        foreach (var butir in store.Daftar) Tambah(butir);
        foreach (var butir in KandidatTerkenal()) Tambah(butir);

        var aplikasi = new List<Aplikasi>(mentah.Count);
        foreach (var butir in mentah)
        {
            try
            {
                var satu = BentukAplikasi(butir);
                if (satu is not null) aplikasi.Add(satu);
            }
            catch
            {
                /* satu butir rusak tidak boleh menggagalkan seluruh daftar */
            }
        }

        aplikasi.Sort((kiri, kanan) => PembandingNama.Instance.Compare(kiri.Name, kanan.Name));

        return new DaftarAplikasi(
            aplikasi,
            SekarangMs(),
            galat.Count > 0 ? string.Join(" ", galat) : null);
    }

    /* ------------------------------------------------- sumber 1: Start Menu --- */

    private static async Task<HasilSumber> PindaiKlasikAsync()
    {
        try
        {
            return await JalankanStaAsync(PindaiKlasik)
                .WaitAsync(TimeSpan.FromMilliseconds(BatasWaktuPindaiMs))
                .ConfigureAwait(false);
        }
        catch (TimeoutException)
        {
            return new HasilSumber(
                new List<Kandidat>(),
                $"Pemindaian pintasan Start Menu melebihi batas waktu {BatasWaktuPindaiMs / 1000} detik.");
        }
        catch (Exception ex)
        {
            return new HasilSumber(
                new List<Kandidat>(),
                $"Pemindaian pintasan Start Menu gagal: {PesanRamah(ex)}.");
        }
    }

    private static HasilSumber PindaiKlasik()
    {
        using var pintasan = PintasanShell.CobaBuat();
        if (pintasan is null)
        {
            return new HasilSumber(
                new List<Kandidat>(),
                "COM IShellLink tidak tersedia sehingga pintasan Start Menu tidak dapat dibaca.");
        }

        var akar = new[]
        {
            (Jalur: Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "Microsoft", "Windows", "Start Menu", "Programs"),
                Skop: 0),
            (Jalur: Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                    "Microsoft", "Windows", "Start Menu", "Programs"),
                Skop: 1),
        };

        var opsi = new EnumerationOptions
        {
            RecurseSubdirectories = true,
            IgnoreInaccessible = true,
            ReturnSpecialDirectories = false,
            AttributesToSkip = FileAttributes.Hidden | FileAttributes.System,
        };

        var mentah = new List<(string Nama, string Target, int Skop)>();

        foreach (var (jalur, skop) in akar)
        {
            if (mentah.Count >= BatasButir) break;
            try
            {
                if (!Directory.Exists(jalur)) continue;
                foreach (var berkas in Directory.EnumerateFiles(jalur, "*.lnk", opsi))
                {
                    if (mentah.Count >= BatasButir) break;
                    try
                    {
                        var nama = Path.GetFileNameWithoutExtension(berkas);
                        var target = pintasan.TargetDari(berkas);
                        if (string.IsNullOrWhiteSpace(target)) continue;
                        if (!target.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) continue;
                        if (!File.Exists(target)) continue;
                        if (PolaLewati.IsMatch(nama) || PolaLewati.IsMatch(target)) continue;
                        mentah.Add((nama, target, skop));
                    }
                    catch
                    {
                        /* pintasan rusak / COM menolak satu berkas: lanjut */
                    }
                }
            }
            catch
            {
                /* folder tidak terbaca: lanjut ke akar berikutnya */
            }
        }

        /* Utamakan pintasan lingkup pengguna bila ada nama yang sama. */
        var hasil = new List<Kandidat>();
        var kunci = new HashSet<string>(StringComparer.Ordinal);
        foreach (var butir in mentah.OrderBy(x => x.Skop))
        {
            var nama = BersihkanNama(butir.Nama);
            var k = KunciNama(nama);
            if (nama.Length == 0 || k.Length == 0) continue;
            if (!kunci.Add(k)) continue;
            hasil.Add(new Kandidat(nama, butir.Target, "klasik"));
        }

        return new HasilSumber(hasil, null);
    }

    /* ------------------------------------------------- sumber 2: AppsFolder --- */

    private static async Task<HasilSumber> PindaiStoreAsync()
    {
        try
        {
            return await JalankanStaAsync(PindaiStore)
                .WaitAsync(TimeSpan.FromMilliseconds(BatasWaktuPindaiMs))
                .ConfigureAwait(false);
        }
        catch (TimeoutException)
        {
            return new HasilSumber(
                new List<Kandidat>(),
                $"Pemindaian aplikasi Store melebihi batas waktu {BatasWaktuPindaiMs / 1000} detik.");
        }
        catch (Exception ex)
        {
            return new HasilSumber(
                new List<Kandidat>(),
                $"Pemindaian aplikasi Store gagal: {PesanRamah(ex)}.");
        }
    }

    /* Enumerasi shell:AppsFolder lewat Shell.Application (IDispatch). Tidak
       memakai Get-StartApps/PowerShell; setiap butir dibungkus try/catch
       karena properti COM bisa gagal pada aplikasi yang rusak. */
    private static HasilSumber PindaiStore()
    {
        var hasil = new List<Kandidat>();
        var kunci = new HashSet<string>(StringComparer.Ordinal);

        object? shell = null;
        object? folder = null;
        object? items = null;

        try
        {
            var tipe = Type.GetTypeFromProgID("Shell.Application");
            if (tipe is null)
                return new HasilSumber(hasil, "COM Shell.Application tidak tersedia.");

            shell = Activator.CreateInstance(tipe);
            if (shell is null)
                return new HasilSumber(hasil, "COM Shell.Application tidak dapat dibuat.");

            dynamic dshell = shell;
            folder = dshell.NameSpace("shell:AppsFolder");
            if (folder is null)
                return new HasilSumber(hasil, "Folder shell:AppsFolder tidak dapat dibuka.");

            dynamic dfolder = folder;
            items = dfolder.Items();
            if (items is null)
                return new HasilSumber(hasil, "Daftar aplikasi shell:AppsFolder tidak dapat dibaca.");

            dynamic ditems = items;
            int jumlah;
            try
            {
                jumlah = Convert.ToInt32(ditems.Count, CultureInfo.InvariantCulture);
            }
            catch (Exception ex)
            {
                return new HasilSumber(
                    hasil,
                    $"Jumlah aplikasi shell:AppsFolder tidak dapat dibaca: {PesanRamah(ex)}.");
            }

            var batas = Math.Min(Math.Max(jumlah, 0), BatasButir);

            for (var i = 0; i < batas; i++)
            {
                try
                {
                    dynamic butir = ditems.Item(i);
                    if (butir is null) continue;

                    string nama;
                    try
                    {
                        nama = (Convert.ToString(butir.Name, CultureInfo.InvariantCulture) ?? "").Trim();
                    }
                    catch
                    {
                        continue;
                    }

                    if (nama.Length == 0) continue;

                    /* AppUserModelID: properti resmi lebih andal, Path dipakai
                       sebagai cadangan (pada shell:AppsFolder berisi AUMID). */
                    var appId = "";
                    try
                    {
                        appId = (Convert.ToString(
                            butir.ExtendedProperty("System.AppUserModel.ID"),
                            CultureInfo.InvariantCulture) ?? "").Trim();
                    }
                    catch
                    {
                        /* properti tidak tersedia untuk butir ini */
                    }

                    if (appId.Length == 0)
                    {
                        try
                        {
                            appId = (Convert.ToString(butir.Path, CultureInfo.InvariantCulture) ?? "").Trim();
                        }
                        catch
                        {
                            appId = "";
                        }
                    }

                    if (appId.Length == 0) continue;

                    /* Lewati AppID berbentuk URL (bukan aplikasi sungguhan) dan
                       AppID yang ternyata jalur berkas, bukan AUMID. */
                    if (PolaUrl.IsMatch(appId)) continue;
                    if (appId.Contains('\\') || appId.Contains('/')) continue;
                    if (PolaLewati.IsMatch(nama)) continue;
                    if (PolaSistemStore.IsMatch(nama)) continue;

                    var bersih = BersihkanNama(nama);
                    var k = KunciNama(bersih);
                    if (bersih.Length == 0 || k.Length == 0) continue;
                    if (!kunci.Add(k)) continue;

                    hasil.Add(new Kandidat(bersih, "shell:AppsFolder\\" + appId, "store"));
                    if (hasil.Count >= BatasButir) break;
                }
                catch
                {
                    /* butir rusak: lanjut */
                }
            }
        }
        catch (Exception ex)
        {
            return new HasilSumber(hasil, $"Pemindaian aplikasi Store gagal: {PesanRamah(ex)}.");
        }
        finally
        {
            Lepas(items);
            Lepas(folder);
            Lepas(shell);
        }

        return new HasilSumber(hasil, null);
    }

    /* --------------------------------------------- sumber 3: aplikasi terkenal --- */

    /* Aplikasi terkenal yang dipasang di luar Start Menu. Hanya ditambahkan
       bila berkasnya benar-benar ada. */
    private static List<Kandidat> KandidatTerkenal()
    {
        var daftar = new List<Kandidat>();
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        var lokal = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        var programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);

        bool Ada(string akar, params string[] bagian)
        {
            if (string.IsNullOrEmpty(akar)) return false;
            try
            {
                return File.Exists(Path.Combine(akar, Path.Combine(bagian)));
            }
            catch
            {
                return false;
            }
        }

        if (Ada(appData, "Spotify", "Spotify.exe"))
            daftar.Add(new Kandidat("Spotify", "spotify:", "klasik"));

        if (Ada(lokal, "Discord", "Update.exe") || Ada(lokal, "Discord", "Discord.exe"))
            daftar.Add(new Kandidat("Discord", "discord:", "klasik"));

        if (Ada(programFilesX86, "Steam", "steam.exe") || Ada(programFiles, "Steam", "steam.exe"))
            daftar.Add(new Kandidat("Steam", "steam:", "klasik"));

        return daftar;
    }

    /* --------------------------------------------------------------- bentuk --- */

    private static Aplikasi? BentukAplikasi(Kandidat butir)
    {
        var nama = BersihkanNama(butir.Nama);
        if (nama.Length == 0) return null;

        var target = TentukanTarget(nama, butir.Target ?? "");
        if (target.Length == 0) return null;

        var ikon = PilihIkon(nama, target);
        var id = "a_" + Hash8($"{nama}|{target}");
        return new Aplikasi(id, nama, target, ikon, butir.Sumber);
    }

    /* Kunci pembanding nama aplikasi: huruf kecil, spasi dirapikan. */
    private static string KunciNama(string? nama) =>
        PolaSpasi.Replace((nama ?? "").ToLowerInvariant(), " ").Trim();

    /* Rapikan nama tampilan: hapus akhiran " - Shortcut", rapikan spasi,
       batasi 40 karakter. */
    private static string BersihkanNama(string? nama)
    {
        var hasil = PolaSpasi.Replace(nama ?? "", " ").Trim();
        hasil = PolaShortcut.Replace(hasil, "").Trim();
        if (hasil.Length > 40) hasil = hasil[..40].Trim();
        return hasil;
    }

    /* Target protokol untuk aplikasi terkenal; selain itu pakai target asli. */
    private static string TentukanTarget(string nama, string target)
    {
        foreach (var (pola, protokol) in ProtokolTerkenal)
        {
            if (pola.IsMatch(nama)) return protokol;
        }

        /* Settings memakai protokol ms-settings: hanya bila memang aplikasi Settings. */
        if (PolaSettings.IsMatch(nama.Trim())) return "ms-settings:";

        return target;
    }

    private static string PilihIkon(string nama, string target)
    {
        var teks = (nama + " " + target).ToLowerInvariant();
        foreach (var (pola, ikon) in PetunjukIkon)
        {
            if (pola.IsMatch(teks))
                return IkonDiizinkan.Contains(ikon) ? ikon : "i-grid";
        }

        return "i-grid";
    }

    private static string Hash8(string teks)
    {
        var bita = SHA1.HashData(Encoding.UTF8.GetBytes(teks));
        return Convert.ToHexString(bita.AsSpan(0, 4)).ToLowerInvariant();
    }

    /* ----------------------------------------------------------------- bantu --- */

    private static long SekarangMs() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    /* Jalankan pekerjaan COM di utas STA tersendiri; hasil diteruskan lewat Task. */
    private static Task<T> JalankanStaAsync<T>(Func<T> kerja)
    {
        var tcs = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        var utas = new Thread(() =>
        {
            try
            {
                tcs.TrySetResult(kerja());
            }
            catch (Exception ex)
            {
                tcs.TrySetException(ex);
            }
        })
        {
            IsBackground = true,
            Name = "KumiDeck-apps-scan",
        };
        utas.SetApartmentState(ApartmentState.STA);
        utas.Start();
        return tcs.Task;
    }

    private static void Lepas(object? obj)
    {
        if (obj is null) return;
        try
        {
            if (Marshal.IsComObject(obj)) Marshal.ReleaseComObject(obj);
        }
        catch
        {
            /* sudah dilepas / bukan RCW: abaikan */
        }
    }

    private static DaftarAplikasi GagalTotal(Exception ex) =>
        new(new List<Aplikasi>(), SekarangMs(), $"Pemindaian aplikasi gagal: {PesanRamah(ex)}.");

    /* Ringkas galat tak terduga menjadi satu baris. */
    private static string PesanRamah(Exception ex)
    {
        var teks = ex is AggregateException agg && agg.InnerException is not null
            ? agg.InnerException.Message
            : ex.Message;
        teks = PolaSpasi.Replace(teks ?? "", " ").Trim();
        if (teks.Length == 0) teks = ex.GetType().Name;
        if (teks.Length > 200) teks = teks[..200].Trim();
        return teks;
    }

    /* ------------------------------------------------- pembanding nama (id-ID) --- */

    /* Bandingkan nama seperti localeCompare("id", numeric: true):
       teks memakai StringComparer budaya id-ID (abaikan besar-kecil huruf),
       deretan angka dibandingkan sebagai bilangan. */
    private sealed class PembandingNama : IComparer<string>
    {
        public static readonly PembandingNama Instance = new();

        private static readonly StringComparer Dasar = BuatPembanding();

        private static StringComparer BuatPembanding()
        {
            try
            {
                return StringComparer.Create(new CultureInfo("id-ID"), ignoreCase: true);
            }
            catch
            {
                return StringComparer.OrdinalIgnoreCase;
            }
        }

        public int Compare(string? a, string? b)
        {
            if (ReferenceEquals(a, b)) return 0;
            if (a is null) return -1;
            if (b is null) return 1;

            var hasil = BandingkanToken(a, b);
            return hasil != 0 ? hasil : Dasar.Compare(a, b);
        }

        private static int BandingkanToken(string a, string b)
        {
            var i = 0;
            var j = 0;

            while (i < a.Length && j < b.Length)
            {
                var angkaA = char.IsAsciiDigit(a[i]);
                var angkaB = char.IsAsciiDigit(b[j]);

                if (angkaA && angkaB)
                {
                    var mulaiA = i;
                    while (i < a.Length && char.IsAsciiDigit(a[i])) i++;
                    var mulaiB = j;
                    while (j < b.Length && char.IsAsciiDigit(b[j])) j++;

                    var ta = a[mulaiA..i].TrimStart('0');
                    var tb = b[mulaiB..j].TrimStart('0');

                    if (ta.Length != tb.Length) return ta.Length < tb.Length ? -1 : 1;

                    var cmp = string.CompareOrdinal(ta, tb);
                    if (cmp != 0) return cmp < 0 ? -1 : 1;
                    continue;
                }

                if (!angkaA && !angkaB)
                {
                    var mulaiA = i;
                    while (i < a.Length && !char.IsAsciiDigit(a[i])) i++;
                    var mulaiB = j;
                    while (j < b.Length && !char.IsAsciiDigit(b[j])) j++;

                    var cmp = Dasar.Compare(a[mulaiA..i], b[mulaiB..j]);
                    if (cmp != 0) return cmp < 0 ? -1 : 1;
                    continue;
                }

                /* Satu sisi angka, satu sisi bukan: serahkan sisa teks ke budaya. */
                return Dasar.Compare(a[i..], b[j..]);
            }

            if (i < a.Length) return 1;
            if (j < b.Length) return -1;
            return 0;
        }
    }
}

/* Resolusi pintasan .lnk lewat COM IShellLinkW + IPersistFile (tanpa
   PowerShell). Dipakai juga oleh AppIcons.cs; satu objek aman dipakai
   berulang pada satu utas STA. */
internal sealed class PintasanShell : IDisposable
{
    private const uint StgmRead = 0;

    private static readonly Guid ClsidShellLink = new("00021401-0000-0000-C000-000000000046");

    [ComImport]
    [Guid("000214F9-0000-0000-C000-000000000046")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellLinkW
    {
        void GetPath(
            [Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszFile,
            int cch,
            IntPtr pfd,
            uint fFlags);

        void GetIDList(out IntPtr ppidl);
        void SetIDList(IntPtr pidl);

        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, int cch);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);

        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszDir, int cch);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);

        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszArgs, int cch);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);

        void GetHotkey(out short pwHotkey);
        void SetHotkey(short wHotkey);

        void GetShowCmd(out int piShowCmd);
        void SetShowCmd(int iShowCmd);

        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cch, out int piIcon);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);

        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, uint dwReserved);
        void Resolve(IntPtr hwnd, uint fFlags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
    }

    [ComImport]
    [Guid("0000010b-0000-0000-C000-000000000046")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPersistFile
    {
        void GetClassID(out Guid pClassID);

        [PreserveSig]
        int IsDirty();

        void Load([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, uint dwMode);

        void Save([MarshalAs(UnmanagedType.LPWStr)] string? pszFileName, [MarshalAs(UnmanagedType.Bool)] bool fRemember);

        void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string pszFileName);

        void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string ppszFileName);
    }

    private readonly object? _obj;
    private readonly IShellLinkW? _link;
    private readonly IPersistFile? _persist;
    private bool _dilepas;

    private PintasanShell(object obj)
    {
        _obj = obj;
        _link = (IShellLinkW)obj;
        _persist = (IPersistFile)obj;
    }

    /* Buat objek ShellLink; null bila COM tidak tersedia. */
    public static PintasanShell? CobaBuat()
    {
        object? obj = null;
        try
        {
            var tipe = Type.GetTypeFromCLSID(ClsidShellLink);
            if (tipe is null) return null;
            obj = Activator.CreateInstance(tipe);
            if (obj is null) return null;
            return new PintasanShell(obj);
        }
        catch
        {
            if (obj is not null) AplikasiLepas(obj);
            return null;
        }
    }

    /* Target sebenarnya dari sebuah .lnk; null bila pintasan tidak menunjuk
       berkas atau gagal dibaca. */
    public string? TargetDari(string berkas)
    {
        if (_link is null || _persist is null) return null;
        try
        {
            _persist.Load(berkas, StgmRead);
            var buffer = new StringBuilder(1024);
            _link.GetPath(buffer, buffer.Capacity, IntPtr.Zero, 0);
            var jalur = buffer.ToString().Trim().Trim('"');
            return jalur.Length == 0 ? null : jalur;
        }
        catch
        {
            return null;
        }
    }

    public void Dispose()
    {
        if (_dilepas) return;
        _dilepas = true;
        if (_obj is not null) AplikasiLepas(_obj);
    }

    private static void AplikasiLepas(object obj)
    {
        try
        {
            if (Marshal.IsComObject(obj)) Marshal.ReleaseComObject(obj);
        }
        catch
        {
            /* abaikan */
        }
    }
}
