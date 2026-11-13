using System.Security.Cryptography;
using System.Text.Json;

namespace KumiDeck.Data;

/* Normalisasi papan: semua masukan dari klien (termasuk berkas impor) dibersihkan
   dan dibatasi di sini supaya papan yang tersimpan selalu berbentuk sah.
   Port langsung dari server/store.js versi Node. */
public static class DeckNormalizer
{
    public static readonly string[] Varian = { "default", "tint", "accent", "lime", "dark" };
    public static readonly string[] Media = { "playpause", "next", "prev", "volup", "voldown", "mute" };
    public static readonly string[] Jendela =
    {
        "minimize", "maximize", "restore", "kiri", "kanan", "monitor-berikut",
        "task-view", "tampilkan-desktop", "tutup-jendela",
    };
    public static readonly string[] Daya = { "tidur", "kunci", "restart", "matikan", "batal" };
    public static readonly string[] Volume = { "naik", "turun", "mute", "set", "baca" };
    public static readonly string[] Mic = { "togel", "senyap", "nyala" };
    public static readonly string[] WidgetSah = { "jam", "tanggal", "media" };
    private static readonly string[] Metode = { "GET", "POST", "PUT", "PATCH", "DELETE" };

    private static readonly System.Text.RegularExpressions.Regex IkonSah =
        new(@"^i-[a-z0-9-]+$", System.Text.RegularExpressions.RegexOptions.Compiled);

    private static readonly System.Text.RegularExpressions.Regex IkonKustom =
        new(@"^kst_[a-z0-9]{4,16}$", System.Text.RegularExpressions.RegexOptions.Compiled);

    private static readonly System.Text.RegularExpressions.Regex SumberSuara =
        new(@"^(https?://|(?:[A-Za-z]:\\)|(?:\\\\|%))", System.Text.RegularExpressions.RegexOptions.Compiled);

    private static readonly System.Text.RegularExpressions.Regex WarnaSah =
        new(@"^#[0-9a-f]{6}$", System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.Compiled);

    public static string IdBaru(string prefix, int byteAcak = 4) =>
        prefix + Convert.ToHexString(RandomNumberGenerator.GetBytes(byteAcak)).ToLowerInvariant();

    /* ------------------------------------------------------------- teks ---- */
    private static bool Objek(JsonElement? e) => e is { ValueKind: JsonValueKind.Object };

    private static JsonElement? Prop(JsonElement? e, string nama)
    {
        if (!Objek(e)) return null;
        return e!.Value.TryGetProperty(nama, out var v) ? v : null;
    }

    public static string Teks(JsonElement? e, int maks, string bawaan = "")
    {
        if (e is not { ValueKind: JsonValueKind.String }) return bawaan;
        var bersih = new string(e.Value.GetString()!
            .Select(c => c < 0x20 || c == 0x7f ? ' ' : c)
            .ToArray())
            .Trim();
        if (bersih.Length > maks) bersih = bersih[..maks].TrimEnd();
        return bersih.Length == 0 ? bawaan : bersih;
    }

    private static int AngkaBulat(JsonElement? e, int bawaan)
    {
        if (e is not { ValueKind: JsonValueKind.Number }) return bawaan;
        if (!e.Value.TryGetDouble(out var d) || double.IsNaN(d) || double.IsInfinity(d)) return bawaan;
        return (int)Math.Round(d, MidpointRounding.AwayFromZero);
    }

    public static bool Bool(JsonElement? e, bool bawaan) => e switch
    {
        { ValueKind: JsonValueKind.True } => true,
        { ValueKind: JsonValueKind.False } => false,
        _ => bawaan,
    };

    public static string TeksBiasa(string? nilai, int maks, string bawaan = "")
    {
        if (nilai is null) return bawaan;
        var bersih = new string(nilai.Select(c => c < 0x20 || c == 0x7f ? ' ' : c).ToArray()).Trim();
        if (bersih.Length > maks) bersih = bersih[..maks].TrimEnd();
        return bersih.Length == 0 ? bawaan : bersih;
    }

    /* ------------------------------------------------------------ aksi ----- */
    private static Syarat? NormalSyarat(JsonElement? syarat)
    {
        if (!Objek(syarat)) return null;
        var proses = Teks(Prop(syarat, "proses"), 64);
        var jendela = Teks(Prop(syarat, "jendela"), 80);
        if (proses.Length == 0 && jendela.Length == 0) return null;
        return new Syarat { Proses = proses, Jendela = jendela };
    }

    public static Aksi NormalAksi(JsonElement? aksi, int kedalaman = 0)
    {
        if (!Objek(aksi) || kedalaman > 3) return Aksi.Kosong();
        var tipe = Teks(Prop(aksi, "type"), 24).ToLowerInvariant();

        switch (tipe)
        {
            case "hotkey":
            {
                var combo = Teks(Prop(aksi, "combo"), 64);
                return combo.Length == 0 ? Aksi.Kosong() : new Aksi { Type = "hotkey", Combo = combo };
            }
            case "teks":
            {
                var isi = Prop(aksi, "text") is { ValueKind: JsonValueKind.String } t
                    ? t.GetString()!
                    : "";
                if (isi.Length > 200) isi = isi[..200];
                return isi.Length == 0 ? Aksi.Kosong() : new Aksi { Type = "teks", Text = isi };
            }
            case "buka":
            {
                var target = Teks(Prop(aksi, "target"), 500);
                return target.Length == 0 ? Aksi.Kosong() : new Aksi { Type = "buka", Target = target };
            }
            case "http":
            {
                var url = Teks(Prop(aksi, "url"), 500);
                if (!url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
                    !url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                {
                    return Aksi.Kosong();
                }
                string host;
                try
                {
                    host = new Uri(url).Host;
                }
                catch
                {
                    return Aksi.Kosong();
                }
                if (string.IsNullOrWhiteSpace(host)) return Aksi.Kosong();

                var metode = Teks(Prop(aksi, "method"), 12).ToUpperInvariant();
                if (!Metode.Contains(metode)) metode = "GET";

                var headers = new List<HeaderHttp>();
                if (Prop(aksi, "headers") is { ValueKind: JsonValueKind.Array } arr)
                {
                    foreach (var h in arr.EnumerateArray().Take(10))
                    {
                        var nama = Teks(Prop(h, "name"), 64);
                        if (nama.Length == 0) continue;
                        var nilai = Prop(h, "value") is { ValueKind: JsonValueKind.String } v
                            ? v.GetString()!
                            : "";
                        headers.Add(new HeaderHttp { Name = nama, Value = TeksBiasa(nilai, 300) });
                    }
                }

                var body = metode is "GET" or "HEAD"
                    ? ""
                    : TeksBiasa(Prop(aksi, "body") is { ValueKind: JsonValueKind.String } b ? b.GetString() : "", 4000);

                return new Aksi { Type = "http", Method = metode, Url = url, Body = body, Headers = headers };
            }
            case "media":
            {
                var cmd = Teks(Prop(aksi, "cmd"), 24);
                if (!Media.Contains(cmd)) cmd = "playpause";
                return new Aksi { Type = "media", Cmd = cmd };
            }
            case "jendela":
            {
                var cmd = Teks(Prop(aksi, "cmd"), 32);
                return Jendela.Contains(cmd) ? new Aksi { Type = "jendela", Cmd = cmd } : Aksi.Kosong();
            }
            case "daya":
            {
                var cmd = Teks(Prop(aksi, "cmd"), 24);
                return Daya.Contains(cmd) ? new Aksi { Type = "daya", Cmd = cmd } : Aksi.Kosong();
            }
            case "volume":
            {
                var mode = Teks(Prop(aksi, "mode"), 16);
                if (!Volume.Contains(mode)) mode = Teks(Prop(aksi, "cmd"), 16);
                if (!Volume.Contains(mode)) mode = "naik";
                if (mode == "set")
                {
                    var nilai = Math.Clamp(AngkaBulat(Prop(aksi, "nilai"), 50), 0, 100);
                    return new Aksi { Type = "volume", Mode = "set", Nilai = nilai };
                }
                return new Aksi { Type = "volume", Mode = mode };
            }
            case "mic":
            {
                var cmd = Teks(Prop(aksi, "cmd"), 16);
                if (!Mic.Contains(cmd)) cmd = "togel";
                return new Aksi { Type = "mic", Cmd = cmd };
            }
            case "suara":
            {
                var id = Teks(Prop(aksi, "soundId"), 40);
                return id.Length == 0 ? Aksi.Kosong() : new Aksi { Type = "suara", SoundId = id };
            }
            case "halaman":
            {
                var id = Teks(Prop(aksi, "pageId"), 64);
                return id.Length == 0 ? Aksi.Kosong() : new Aksi { Type = "halaman", PageId = id };
            }
            case "urutan":
            {
                var langkah = new List<Langkah>();
                if (Prop(aksi, "steps") is { ValueKind: JsonValueKind.Array } langkahArr)
                {
                    foreach (var l in langkahArr.EnumerateArray().Take(12))
                    {
                        var delay = Math.Clamp(AngkaBulat(Prop(l, "delay"), 0), 0, 5000);
                        var isi = NormalAksi(Prop(l, "action"), kedalaman + 1);
                        if (isi.Type == "kosong") continue;
                        langkah.Add(new Langkah { Delay = delay, Action = isi });
                    }
                }
                return langkah.Count == 0 ? Aksi.Kosong() : new Aksi { Type = "urutan", Steps = langkah };
            }
            case "kondisional":
            {
                var syarat = NormalSyarat(Prop(aksi, "syarat"));
                var aktif = NormalAksi(Prop(aksi, "aktif"));
                var tidak = NormalAksi(Prop(aksi, "tidakAktif"));
                if (syarat is null || (aktif.Type == "kosong" && tidak.Type == "kosong"))
                {
                    return Aksi.Kosong();
                }
                return new Aksi { Type = "kondisional", Syarat = syarat, Aktif = aktif, TidakAktif = tidak };
            }
            default:
                return Aksi.Kosong();
        }
    }

    /* ----------------------------------------------------------- widget ---- */
    private static Widget? NormalWidget(JsonElement? widget)
    {
        if (!Objek(widget)) return null;
        var tipe = Teks(Prop(widget, "type"), 16);
        return WidgetSah.Contains(tipe) ? new Widget { Type = tipe } : null;
    }

    private static Warna? NormalWarna(JsonElement? warna)
    {
        if (!Objek(warna)) return null;
        var bg = Teks(Prop(warna, "bg"), 7);
        var fg = Teks(Prop(warna, "fg"), 7);
        if (!WarnaSah.IsMatch(bg)) return null;
        return new Warna
        {
            Bg = bg.ToLowerInvariant(),
            Fg = WarnaSah.IsMatch(fg) ? fg.ToLowerInvariant() : "",
        };
    }

    private static Penanda? NormalTandaAktif(JsonElement? tanda)
    {
        if (!Objek(tanda)) return null;
        var proses = Teks(Prop(tanda, "proses"), 64);
        var jendela = Teks(Prop(tanda, "jendela"), 80);
        if (proses.Length == 0 && jendela.Length == 0) return null;
        return new Penanda { Proses = proses, Jendela = jendela };
    }

    /* ----------------------------------------------------------- tombol ---- */
    public static Tombol? NormalTombol(JsonElement? tombol, string idFallback)
    {
        if (!Objek(tombol)) return null;
        var label = Teks(Prop(tombol, "label"), 24, "Tombol");

        var ikonMentah = Prop(tombol, "icon") is { ValueKind: JsonValueKind.String } im ? im.GetString()! : "";
        var ikon = IkonSah.IsMatch(ikonMentah) || IkonKustom.IsMatch(ikonMentah) ? ikonMentah : "i-grid";

        var varian = Teks(Prop(tombol, "variant"), 16);
        if (!Varian.Contains(varian)) varian = "default";

        var widget = NormalWidget(Prop(tombol, "widget"));
        return new Tombol
        {
            Id = Teks(Prop(tombol, "id"), 40, idFallback),
            Label = label,
            Icon = ikon,
            Variant = varian,
            Warna = NormalWarna(Prop(tombol, "warna")),
            Widget = widget,
            TandaiAktif = widget is null ? NormalTandaAktif(Prop(tombol, "tandaiAktif")) : null,
            Action = widget is null ? NormalAksi(Prop(tombol, "action")) : Aksi.Kosong(),
        };
    }

    /* ---------------------------------------------------------- halaman ---- */
    private static Halaman NormalHalaman(JsonElement? halaman, int kolom, int baris, List<string> halamanSah)
    {
        var jumlah = kolom * baris;
        var halamanBaru = new Halaman
        {
            Id = Teks(Prop(halaman, "id"), 40, IdBaru("p_")),
            Name = Teks(Prop(halaman, "name"), 24, "Halaman"),
        };

        var sumber = Prop(halaman, "keys") is { ValueKind: JsonValueKind.Array } arr
            ? arr
            : (JsonElement?)null;

        for (var i = 0; i < jumlah; i++)
        {
            JsonElement? butir = null;
            if (sumber is { } s && i < s.GetArrayLength()) butir = s[i];
            var tombol = NormalTombol(butir, IdBaru("k_", 3));
            if (tombol is not null)
            {
                tombol.Action = RapikanHalamanDiAksi(tombol.Action, halamanSah);
            }
            halamanBaru.Keys.Add(tombol);
        }
        return halamanBaru;
    }

    private static Aksi RapikanHalamanDiAksi(Aksi aksi, List<string> halamanSah)
    {
        if (aksi.Type == "halaman" && !halamanSah.Contains(aksi.PageId ?? ""))
        {
            return Aksi.Kosong();
        }
        if (aksi.Type == "urutan" && aksi.Steps is not null)
        {
            var bersih = new List<Langkah>();
            foreach (var l in aksi.Steps)
            {
                var baru = RapikanHalamanDiAksi(l.Action, halamanSah);
                if (baru.Type == "kosong") continue;
                bersih.Add(new Langkah { Delay = l.Delay, Action = baru });
            }
            return bersih.Count == 0 ? Aksi.Kosong() : new Aksi { Type = "urutan", Steps = bersih };
        }
        if (aksi.Type == "kondisional")
        {
            if (aksi.Aktif is not null) aksi.Aktif = RapikanHalamanDiAksi(aksi.Aktif, halamanSah);
            if (aksi.TidakAktif is not null) aksi.TidakAktif = RapikanHalamanDiAksi(aksi.TidakAktif, halamanSah);
        }
        return aksi;
    }

    /* ------------------------------------------------------------- deck ---- */
    private static List<AturanOtomatis> NormalProfilOtomatis(JsonElement? daftar, List<string> halamanSah)
    {
        var hasil = new List<AturanOtomatis>();
        if (daftar is not { ValueKind: JsonValueKind.Array } arr) return hasil;
        foreach (var r in arr.EnumerateArray().Take(20))
        {
            var aturan = new AturanOtomatis
            {
                Proses = Teks(Prop(r, "proses"), 64),
                Jendela = Teks(Prop(r, "jendela"), 80),
                PageId = Teks(Prop(r, "pageId"), 40),
                Aktif = Bool(Prop(r, "aktif"), true),
            };
            if (aturan.Proses.Length == 0 && aturan.Jendela.Length == 0) continue;
            if (!halamanSah.Contains(aturan.PageId)) continue;
            hasil.Add(aturan);
        }
        return hasil;
    }

    public static SuaraItem? NormalSuara(JsonElement? item, string idFallback)
    {
        if (!Objek(item)) return null;
        var sumber = (Prop(item, "sumber") is { ValueKind: JsonValueKind.String } s ? s.GetString()! : "")
            .Trim();
        if (sumber.Length > 500) sumber = sumber[..500];
        if (sumber.Length == 0 || !SumberSuara.IsMatch(sumber)) return null;

        return new SuaraItem
        {
            Id = Teks(Prop(item, "id"), 40, idFallback),
            Name = Teks(Prop(item, "name"), 32, "Suara"),
            Sumber = sumber,
            Jenis = sumber.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                    sumber.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
                ? "url"
                : "berkas",
            Volume = Math.Clamp(AngkaBulat(Prop(item, "volume"), 100), 0, 100),
            PerangkatId = Teks(Prop(item, "perangkatId"), 200),
        };
    }

    private static List<SuaraItem> NormalSoundboard(JsonElement? daftar)
    {
        var hasil = new List<SuaraItem>();
        if (daftar is not { ValueKind: JsonValueKind.Array } arr) return hasil;
        var idTerpakai = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in arr.EnumerateArray().Take(40))
        {
            var suara = NormalSuara(item, IdBaru("s_", 3));
            if (suara is null) continue;
            if (!idTerpakai.Add(suara.Id)) suara.Id = IdBaru("s_", 3);
            idTerpakai.Add(suara.Id);
            hasil.Add(suara);
        }
        return hasil;
    }

    public static Deck NormalDeck(JsonElement? masukan, Deck? deckLama = null)
    {
        var sumber = Objek(masukan) ? masukan : null;

        var kolom = Math.Clamp(
            AngkaBulat(Prop(Prop(sumber, "profile"), "columns") ?? Prop(Prop(sumber, "settings"), "columns"), 5),
            3, 6);
        var baris = Math.Clamp(AngkaBulat(Prop(Prop(sumber, "profile"), "rows"), 3), 2, 6);
        var namaProfil = Teks(Prop(Prop(sumber, "profile"), "name"), 32, "Meja Kerja");

        var halamanMasukan = new List<JsonElement>();
        if (Prop(sumber, "pages") is { ValueKind: JsonValueKind.Array } daftarHalaman)
        {
            halamanMasukan.AddRange(daftarHalaman.EnumerateArray().Take(12).Select(e => e.Clone()));
        }

        List<JsonElement> sumberHalaman;
        if (halamanMasukan.Count == 0 && deckLama is not null)
        {
            /* Halaman lama dipakai bila masukan tidak membawa halaman sama sekali. */
            var teks = JsonSerializer.Serialize(deckLama, Json.Opsi);
            using var dok = JsonDocument.Parse(teks);
            sumberHalaman = dok.RootElement.GetProperty("pages")
                .EnumerateArray()
                .Select(e => e.Clone())
                .ToList();
        }
        else
        {
            sumberHalaman = halamanMasukan;
        }

        var idSah = new List<string>();
        foreach (var h in sumberHalaman)
        {
            var id = Teks(Prop(h, "id"), 40);
            if (id.Length > 0) idSah.Add(id);
        }

        var pages = sumberHalaman.Select(h => NormalHalaman(h, kolom, baris, idSah)).ToList();
        if (pages.Count == 0)
        {
            pages.Add(NormalHalaman(null, kolom, baris, idSah));
        }

        var terpakai = new HashSet<string>(StringComparer.Ordinal);
        foreach (var h in pages)
        {
            if (!terpakai.Add(h.Id)) h.Id = IdBaru("p_");
            terpakai.Add(h.Id);
        }

        var idTombol = new HashSet<string>(StringComparer.Ordinal);
        foreach (var h in pages)
        {
            foreach (var k in h.Keys)
            {
                if (k is null) continue;
                if (k.Id.Length == 0 || !idTombol.Add(k.Id)) k.Id = IdBaru("k_", 3);
                idTombol.Add(k.Id);
            }
        }

        var homeDiminta = Teks(Prop(Prop(sumber, "settings"), "home"), 40);
        var homeId = pages.Any(h => h.Id == homeDiminta) ? homeDiminta : pages[0].Id;
        var idHalamanFinal = pages.Select(h => h.Id).ToList();

        return new Deck
        {
            Version = 1,
            Profile = new Profil { Name = namaProfil, Columns = kolom, Rows = baris },
            Pages = pages,
            Otomatis = NormalProfilOtomatis(Prop(sumber, "otomatis"), idHalamanFinal),
            Soundboard = NormalSoundboard(Prop(sumber, "soundboard")),
            Settings = new Setelan
            {
                Sound = Bool(Prop(Prop(sumber, "settings"), "sound"), true),
                Home = homeId,
                Terkunci = Bool(Prop(Prop(sumber, "settings"), "terkunci"), false),
                AutoProfil = Bool(Prop(Prop(sumber, "settings"), "autoProfil"), false),
                MulaiOtomatis = Bool(Prop(Prop(sumber, "settings"), "mulaiOtomatis"), false),
            },
        };
    }

    /* ------------------------------------------------------------ contoh ---- */
    private static Tombol Tombol(string label, string ikon, Aksi aksi, string varian = "default") => new()
    {
        Id = IdBaru("k_"),
        Label = label,
        Icon = ikon,
        Variant = varian,
        Action = aksi,
    };

    private static Tombol WidgetTombol(string label, string ikon, string tipe, string varian = "dark") => new()
    {
        Id = IdBaru("k_"),
        Label = label,
        Icon = ikon,
        Variant = varian,
        Widget = new Widget { Type = tipe },
        Action = Aksi.Kosong(),
    };

    private static List<Tombol?> Lengkapi(IEnumerable<Tombol> tombol, int jumlah)
    {
        var hasil = tombol.Take(jumlah).Cast<Tombol?>().ToList();
        while (hasil.Count < jumlah) hasil.Add(null);
        return hasil;
    }

    public static Deck DeckContoh()
    {
        const int kolom = 5;
        const int baris = 3;
        var n = kolom * baris;

        var pUtama = new Halaman
        {
            Id = IdBaru("p_"),
            Name = "Utama",
            Keys = Lengkapi(new[]
            {
                Tombol("Putar / Jeda", "i-play", new Aksi { Type = "media", Cmd = "playpause" }, "accent"),
                Tombol("Lagu Berikut", "i-arrow-right", new Aksi { Type = "media", Cmd = "next" }),
                Tombol("Volume Naik", "i-volume", new Aksi { Type = "media", Cmd = "volup" }),
                Tombol("Volume Turun", "i-volume-off", new Aksi { Type = "media", Cmd = "voldown" }),
                Tombol("Senyapkan", "i-volume-off", new Aksi { Type = "media", Cmd = "mute" }),
                Tombol("Tangkapan Layar", "i-image", new Aksi { Type = "hotkey", Combo = "win+shift+s" }),
                Tombol("Buka Peramban", "i-globe", new Aksi { Type = "buka", Target = "https://www.google.com" }, "tint"),
                Tombol("Unduhan", "i-download", new Aksi { Type = "buka", Target = "%USERPROFILE%\\Downloads" }),
                Tombol("Kalkulator", "i-plus", new Aksi { Type = "buka", Target = "calc" }),
                Tombol("Kunci Layar", "i-lock", new Aksi { Type = "hotkey", Combo = "win+l" }),
                Tombol("Aplikasi", "i-grid", new Aksi { Type = "halaman", PageId = "" }, "dark"),
                Tombol("Web", "i-link", new Aksi { Type = "halaman", PageId = "" }, "dark"),
                Tombol("Catatan Cepat", "i-pencil", new Aksi { Type = "buka", Target = "notepad" }),
                WidgetTombol("Sekarang", "i-clock", "jam"),
                WidgetTombol("Sedang Diputar", "i-play", "media"),
            }, n),
        };

        var pAplikasi = new Halaman
        {
            Id = IdBaru("p_"),
            Name = "Aplikasi",
            Keys = Lengkapi(new[]
            {
                Tombol("Explorer", "i-folder", new Aksi { Type = "buka", Target = "explorer" }, "tint"),
                Tombol("Terminal", "i-code", new Aksi { Type = "buka", Target = "wt" }),
                Tombol("VS Code", "i-file", new Aksi { Type = "buka", Target = "code" }),
                Tombol("Paint", "i-image", new Aksi { Type = "buka", Target = "mspaint" }),
                Tombol("Task Manager", "i-database", new Aksi { Type = "hotkey", Combo = "ctrl+shift+esc" }),
                Tombol("Salin", "i-copy", new Aksi { Type = "hotkey", Combo = "ctrl+c" }),
                Tombol("Tempel", "i-upload", new Aksi { Type = "hotkey", Combo = "ctrl+v" }),
                Tombol("Kembali", "i-arrow-left", new Aksi { Type = "halaman", PageId = "" }, "dark"),
            }, n),
        };

        var pWeb = new Halaman
        {
            Id = IdBaru("p_"),
            Name = "Web",
            Keys = Lengkapi(new[]
            {
                Tombol("YouTube", "i-play", new Aksi { Type = "buka", Target = "https://www.youtube.com" }),
                Tombol("GitHub", "i-code", new Aksi { Type = "buka", Target = "https://github.com" }),
                Tombol("WhatsApp", "i-mail", new Aksi { Type = "buka", Target = "https://web.whatsapp.com" }),
                Tombol("Spotify", "i-volume", new Aksi { Type = "buka", Target = "https://open.spotify.com" }),
                Tombol("Fokus Kerja", "i-bolt", new Aksi
                {
                    Type = "urutan",
                    Steps = new List<Langkah>
                    {
                        new() { Delay = 300, Action = new Aksi { Type = "buka", Target = "code" } },
                        new() { Delay = 900, Action = new Aksi { Type = "buka", Target = "https://github.com" } },
                    },
                }, "lime"),
                Tombol("Kembali", "i-arrow-left", new Aksi { Type = "halaman", PageId = "" }, "dark"),
            }, n),
        };

        foreach (var key in pUtama.Keys)
        {
            if (key is null || key.Action.Type != "halaman") continue;
            if (key.Label == "Aplikasi") key.Action.PageId = pAplikasi.Id;
            if (key.Label == "Web") key.Action.PageId = pWeb.Id;
        }
        foreach (var halaman in new[] { pAplikasi, pWeb })
        {
            foreach (var key in halaman.Keys)
            {
                if (key is not null && key.Action.Type == "halaman") key.Action.PageId = pUtama.Id;
            }
        }

        return new Deck
        {
            Version = 1,
            Profile = new Profil { Name = "Meja Kerja", Columns = kolom, Rows = baris },
            Pages = new List<Halaman> { pUtama, pAplikasi, pWeb },
            Settings = new Setelan
            {
                Sound = true,
                Home = pUtama.Id,
                Terkunci = false,
                AutoProfil = false,
                MulaiOtomatis = false,
            },
        };
    }
}
