using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using KumiDeck.Actions;
using KumiDeck.Apps;
using KumiDeck.Audio;
using KumiDeck.Core;
using KumiDeck.Data;
using KumiDeck.Platform;

namespace KumiDeck.Server;

/* Router API + berkas statis (padanan handler di server/index.js). */
public sealed partial class KumiServer
{
    private const int BatasAksiBersamaan = 4;

    private static void KirimJson(HttpJawaban res, int status, object data)
    {
        res.Status = status;
        res.Tipe = "application/json; charset=utf-8";
        res.Isi = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(data, Json.Ringkas));
        res.Header["Cache-Control"] = "no-store";
    }

    private static void KirimTeks(HttpJawaban res, int status, string teks, string tipe = "text/plain; charset=utf-8")
    {
        res.Status = status;
        res.Tipe = tipe;
        res.Isi = Encoding.UTF8.GetBytes(teks);
        res.Header["Cache-Control"] = "no-store";
    }

    private static JsonDocument? BodyJson(HttpPermintaan req)
    {
        var tipe = req.Header.TryGetValue("content-type", out var ct) ? ct.ToLowerInvariant() : "";
        if (tipe.Length > 0 && !tipe.Contains("application/json")) return null;
        if (req.Body.Length == 0) return JsonDocument.Parse("{}");
        try
        {
            return JsonDocument.Parse(req.Body);
        }
        catch
        {
            return null;
        }
    }

    private static bool ButuhToken(HttpPermintaan req, HttpJawaban res, KumiServer server)
    {
        if (server.Terautentikasi(req)) return false;
        KirimJson(res, 401, new { ok = false, code = "butuh-pasangan", message = "Perlu kode pasangan." });
        return true;
    }

    public async Task TanganiPermintaanAsync(HttpPermintaan req, HttpJawaban res)
    {
        var asal = PeriksaAsal(req);
        if (!asal.Ok)
        {
            KirimJson(res, 403, new { ok = false, code = "asal-ditolak", message = asal.Pesan });
            return;
        }

        var jalur = req.Jalur;

        /* --- PWA ------------------------------------------------------- */
        if (jalur == "/api/pwa")
        {
            var httpsAktif = Https;
            KirimJson(res, 200, new
            {
                ok = true,
                https = httpsAktif,
                sertifikat = _tls is not null && File.Exists(_tls.BerkasCer) ? "/sertifikat.cer" : null,
                alamat = Skema + "://" + Lan + ":" + Port,
                tautan = TautanRemote,
                petunjuk = httpsAktif
                    ? "Pasang sertifikat di perangkat Remote, lalu buka tautan HTTPS dan pilih “Pasang aplikasi”."
                    : "Jalankan KumiDeck dengan HTTPS (KD_HTTPS=1) agar perangkat Remote bisa memasang aplikasinya.",
            });
            return;
        }

        if (jalur == "/sertifikat.cer")
        {
            try
            {
                var berkas = Path.Combine(AppPaths.Tls, "kumideck.cer");
                var isi = File.ReadAllBytes(berkas);
                res.Status = 200;
                res.Tipe = "application/x-x509-ca-cert";
                res.Isi = isi;
                res.Header["Cache-Control"] = "no-store";
                res.Header["Content-Disposition"] = "attachment; filename=\"kumideck.cer\"";
            }
            catch
            {
                KirimTeks(res, 404, "Sertifikat belum dibuat. Jalankan mode HTTPS lebih dulu.");
            }
            return;
        }

        try
        {
            /* --- halaman ------------------------------------------------- */
            if (jalur is "/" or "/index.html")
            {
                SajikanAset(res, "index.html");
                return;
            }
            if (jalur is "/remote" or "/remote.html")
            {
                SajikanAset(res, "remote.html");
                return;
            }

            /* --- API ------------------------------------------------------ */
            if (jalur == "/api/state")
            {
                if (ButuhToken(req, res, this)) return;
                KirimJson(res, 200, MuatanState());
                return;
            }

            if (jalur == "/api/events")
            {
                await TanganiSse(req, res);
                return;
            }

            if (jalur == "/api/pair")
            {
                if (!IzinPasangan(req.AlamatRemote))
                {
                    KirimJson(res, 429, new { ok = false, message = "Terlalu banyak percobaan. Coba lagi sebentar." });
                    return;
                }
                using var dok = BodyJson(req);
                var kode = "";
                if (dok is not null &&
                    dok.RootElement.ValueKind == JsonValueKind.Object &&
                    dok.RootElement.TryGetProperty("code", out var c) &&
                    c.ValueKind == JsonValueKind.String)
                {
                    kode = c.GetString() ?? "";
                }
                kode = (kode.Length == 0 ? req.Q("code") ?? "" : kode)
                    .Trim().ToLowerInvariant().Replace("-", "").Replace(" ", "");
                if (kode.Length > 0 && kode == Store.Token)
                {
                    KirimJson(res, 200, new { ok = true, token = Store.Token });
                }
                else
                {
                    KirimJson(res, 401, new
                    {
                        ok = false,
                        code = "butuh-pasangan",
                        message = "Kode pasangan salah. Periksa layar desktop.",
                    });
                }
                return;
            }

            if (jalur == "/api/hello")
            {
                if (ButuhToken(req, res, this)) return;
                using var dok = BodyJson(req);
                if (dok is not null && dok.RootElement.ValueKind == JsonValueKind.Object)
                {
                    var body = dok.RootElement;
                    var data = CatatPerangkat(Teks(body, "deviceId"), Teks(body, "platform"), Teks(body, "name"));
                    if (data is not null)
                    {
                        data.LastSeen = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                        SiarPerangkat();
                    }
                }
                KirimJson(res, 200, new { ok = true });
                return;
            }

            if (jalur == "/api/press")
            {
                if (ButuhToken(req, res, this)) return;
                await TanganiPress(req, res);
                return;
            }

            /* --- ekspor / impor ------------------------------------------ */
            if (jalur == "/api/deck/export")
            {
                if (ButuhToken(req, res, this)) return;

                var ikon = new Dictionary<string, string>(StringComparer.Ordinal);
                foreach (var h in Store.Deck.Pages)
                {
                    foreach (var k in h.Keys)
                    {
                        if (k?.Icon is null || !k.Icon.StartsWith("kst_", StringComparison.Ordinal)) continue;
                        if (ikon.ContainsKey(k.Icon)) continue;
                        var data = BacaIkon(k.Icon);
                        if (data is null) continue;
                        ikon[k.Icon] = "data:" + data.Value.Tipe + ";base64," +
                                       Convert.ToBase64String(data.Value.Isi);
                    }
                }

                var paket = new
                {
                    format = "kumideck",
                    versiFormat = 1,
                    aplikasi = "KumiDeck " + VersiAplikasi(),
                    dibuat = DateTimeOffset.UtcNow.ToString("o"),
                    deck = Store.Deck,
                    ikon,
                };

                res.Status = 200;
                res.Tipe = "application/json; charset=utf-8";
                res.Isi = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(paket, Json.Opsi));
                res.Header["Cache-Control"] = "no-store";
                res.Header["Content-Disposition"] =
                    "attachment; filename=\"kumideck-" + NamaBerkasAman(Store.Deck.Profile.Name) + ".json\"";
                return;
            }

            if (jalur == "/api/deck/import")
            {
                if (ButuhToken(req, res, this)) return;
                if (Store.Deck.Settings.Terkunci)
                {
                    KirimJson(res, 423, new
                    {
                        ok = false,
                        code = "terkunci",
                        message = "Tata letak terkunci. Buka kunci dulu untuk mengimpor papan.",
                    });
                    return;
                }

                using var dok = BodyJson(req);
                if (dok is null || dok.RootElement.ValueKind != JsonValueKind.Object)
                {
                    KirimJson(res, 400, new { ok = false, message = "Berkas impor tidak valid." });
                    return;
                }

                /* Paket ekspor berbentuk { format, deck, ikon }; berkas deck
                   langsung juga diterima. */
                var akar = dok.RootElement;
                JsonElement paket;
                if (akar.TryGetProperty("format", out var format) && format.ValueKind == JsonValueKind.String &&
                    format.GetString() == "kumideck")
                {
                    paket = akar.TryGetProperty("deck", out var deckPaket) ? deckPaket : default;
                }
                else
                {
                    paket = akar.TryGetProperty("deck", out var deckLangsung) ? deckLangsung : akar;
                }

                if (paket.ValueKind != JsonValueKind.Object ||
                    !paket.TryGetProperty("pages", out var pages) ||
                    pages.ValueKind != JsonValueKind.Array)
                {
                    KirimJson(res, 400, new { ok = false, message = "Berkas ini bukan deck KumiDeck." });
                    return;
                }

                var ikonTersimpan = 0;
                var petaIkon = new HashSet<string>(StringComparer.Ordinal);
                if (akar.TryGetProperty("ikon", out var ikonPaket) && ikonPaket.ValueKind == JsonValueKind.Object)
                {
                    foreach (var entri in ikonPaket.EnumerateObject().Take(60))
                    {
                        if (!System.Text.RegularExpressions.Regex.IsMatch(entri.Name, "^kst_[a-z0-9]{4,16}$")) continue;
                        if (entri.Value.ValueKind != JsonValueKind.String) continue;
                        var cocok = System.Text.RegularExpressions.Regex.Match(
                            entri.Value.GetString() ?? "",
                            @"^data:(image/(?:svg\+xml|png|webp));base64,(.+)$",
                            System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                        if (!cocok.Success) continue;
                        byte[] isi;
                        try
                        {
                            isi = Convert.FromBase64String(cocok.Groups[2].Value);
                        }
                        catch
                        {
                            continue;
                        }
                        if (isi.Length == 0 || isi.Length > 512 * 1024) continue;
                        var tipe = cocok.Groups[1].Value.ToLowerInvariant();
                        var ext = tipe.Contains("svg") ? "svg" : tipe.Contains("webp") ? "webp" : "png";
                        if (SimpanIkon(entri.Name, isi, ext))
                        {
                            ikonTersimpan++;
                            petaIkon.Add(entri.Name);
                        }
                    }
                }

                using var salinan = JsonDocument.Parse(paket.GetRawText());
                var deckBaru = DeckNormalizer.NormalDeck(salinan.RootElement, Store.Deck);
                foreach (var h in deckBaru.Pages)
                {
                    foreach (var k in h.Keys)
                    {
                        if (k is null) continue;
                        if (k.Icon.StartsWith("kst_", StringComparison.Ordinal) && !petaIkon.Contains(k.Icon))
                        {
                            k.Icon = "i-grid";
                        }
                    }
                }

                Store.Ganti(deckBaru);
                PerbaruiDataHidup();
                SiarState();
                KirimJson(res, 200, new { ok = true, deck = Store.Deck, ikon = ikonTersimpan });
                return;
            }

            /* --- audio --------------------------------------------------- */
            if (jalur == "/api/audio/perangkat")
            {
                if (ButuhToken(req, res, this)) return;
                var hasil = await Task.Run(() => SoundBoard.DaftarPerangkat());
                KirimJson(res, 200, new { ok = hasil.Ok, perangkat = hasil.Perangkat, galat = hasil.Galat });
                return;
            }

            if (jalur == "/api/audio/status")
            {
                if (ButuhToken(req, res, this)) return;
                var status = await SoundBoard.StatusAsync();
                KirimJson(res, 200, status);
                return;
            }

            if (jalur == "/api/audio/mainkan")
            {
                if (ButuhToken(req, res, this)) return;
                using var dok = BodyJson(req);
                var body = dok?.RootElement;
                if (body is null || body.Value.ValueKind != JsonValueKind.Object)
                {
                    KirimJson(res, 400, new { ok = false, message = "Isi permintaan tidak valid." });
                    return;
                }

                var item = default(SuaraItem);
                var id = Teks(body.Value, "id");
                if (id.Length > 0)
                {
                    item = Store.Deck.Soundboard.FirstOrDefault(s => s.Id == id);
                }
                var sumber = item is not null ? item.Sumber : Teks(body.Value, "sumber").Trim();
                if (sumber.Length == 0)
                {
                    KirimJson(res, 400, new { ok = false, message = "Pilih suara atau isi sumber suara." });
                    return;
                }

                var hasil = await SoundBoard.MainkanAsync(
                    sumber,
                    item?.Volume ?? Angka(body.Value, "volume", 100),
                    item?.PerangkatId ?? Teks(body.Value, "perangkatId"));
                KirimJson(res, hasil.Ok ? 200 : 502, hasil);
                return;
            }

            if (jalur == "/api/audio/hentikan")
            {
                if (ButuhToken(req, res, this)) return;
                KirimJson(res, 200, await SoundBoard.HentikanAsync());
                return;
            }

            /* --- mikrofon ------------------------------------------------ */
            if (jalur == "/api/mic")
            {
                if (ButuhToken(req, res, this)) return;
                if (req.Metode == "POST")
                {
                    using var dok = BodyJson(req);
                    var mode = dok is null ? "togel" : Teks(dok.RootElement, "mode");
                    if (mode is not ("togel" or "senyap" or "nyala")) mode = "togel";
                    var hasil = await Task.Run(() => MicControl.Atur(mode));
                    if (hasil.Ok) SiarState();
                    KirimJson(res, hasil.Ok ? 200 : 502, hasil);
                    return;
                }
                KirimJson(res, 200, await Task.Run(() => MicControl.Baca()));
                return;
            }

            /* --- unggah suara -------------------------------------------- */
            if (jalur == "/api/suara/unggah")
            {
                if (ButuhToken(req, res, this)) return;
                using var dok = BodyJson(req);
                var dataUrl = dok is null ? "" : Teks(dok.RootElement, "dataUrl");
                var cocok = System.Text.RegularExpressions.Regex.Match(
                    dataUrl, @"^data:audio/([a-z0-9.+-]+);base64,(.+)$",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.Singleline);
                if (!cocok.Success)
                {
                    KirimJson(res, 400, new { ok = false, message = "Berkas suara tidak valid." });
                    return;
                }

                var peta = new Dictionary<string, string>
                {
                    ["mpeg"] = "mp3", ["mp3"] = "mp3", ["wav"] = "wav", ["x-wav"] = "wav", ["wave"] = "wav",
                    ["mp4"] = "m4a", ["m4a"] = "m4a", ["ogg"] = "ogg", ["flac"] = "flac", ["x-flac"] = "flac",
                };
                var tipeAudio = cocok.Groups[1].Value.ToLowerInvariant();
                if (!peta.TryGetValue(tipeAudio, out var ext))
                {
                    KirimJson(res, 400, new { ok = false, message = "Format suara tidak didukung (MP3, WAV, M4A, OGG, FLAC)." });
                    return;
                }
                byte[] isi;
                try
                {
                    isi = Convert.FromBase64String(cocok.Groups[2].Value);
                }
                catch
                {
                    KirimJson(res, 400, new { ok = false, message = "Berkas suara tidak valid." });
                    return;
                }
                if (isi.Length == 0)
                {
                    KirimJson(res, 400, new { ok = false, message = "Berkas suara kosong." });
                    return;
                }
                if (isi.Length > 25 * 1024 * 1024)
                {
                    KirimJson(res, 413, new { ok = false, message = "Berkas suara maksimal 25 MB." });
                    return;
                }

                try
                {
                    Directory.CreateDirectory(AppPaths.Suara);
                    var id = Convert.ToHexString(RandomNumberGenerator.GetBytes(6)).ToLowerInvariant();
                    var berkas = Path.Combine(AppPaths.Suara, id + "." + ext);
                    File.WriteAllBytes(berkas, isi);
                    KirimJson(res, 200, new
                    {
                        ok = true,
                        sumber = berkas,
                        nama = dok is null
                            ? "Suara"
                            : Teks(dok.RootElement, "nama") is { Length: > 0 } n
                                ? n[..Math.Min(32, n.Length)]
                                : "Suara",
                    });
                }
                catch
                {
                    KirimJson(res, 500, new { ok = false, message = "Berkas suara tidak dapat disimpan." });
                }
                return;
            }

            /* --- soundboard ---------------------------------------------- */
            if (jalur == "/api/soundboard/simpan")
            {
                if (ButuhToken(req, res, this)) return;
                if (Store.Deck.Settings.Terkunci)
                {
                    KirimJson(res, 423, new
                    {
                        ok = false,
                        code = "terkunci",
                        message = "Tata letak terkunci. Buka kunci dulu untuk mengubah soundboard.",
                    });
                    return;
                }

                using var dok = BodyJson(req);
                var itemEl = default(JsonElement?);
                if (dok is not null && dok.RootElement.ValueKind == JsonValueKind.Object &&
                    dok.RootElement.TryGetProperty("item", out var it))
                {
                    itemEl = it;
                }
                var item = DeckNormalizer.NormalSuara(itemEl, DeckNormalizer.IdBaru("s_", 3));
                if (item is null)
                {
                    KirimJson(res, 400, new
                    {
                        ok = false,
                        message = "Sumber suara tidak sah. Gunakan jalur berkas lokal atau tautan http(s).",
                    });
                    return;
                }

                var daftar = Store.Deck.Soundboard.ToList();
                var posisi = daftar.FindIndex(s => s.Id == item.Id);
                if (posisi >= 0)
                {
                    daftar[posisi] = item;
                }
                else
                {
                    if (daftar.Count >= 40)
                    {
                        KirimJson(res, 400, new { ok = false, message = "Soundboard maksimal 40 suara." });
                        return;
                    }
                    daftar.Add(item);
                }
                Store.Deck.Soundboard = daftar;
                Store.Simpan();

                try
                {
                    var status = await SoundBoard.StatusAsync();
                    if (status.Ok && status.Memutar && status.Sumber == item.Sumber)
                    {
                        SoundBoard.SetVolume(item.Volume);
                    }
                }
                catch
                {
                    /* pemutar tidak tersedia */
                }

                SiarState();
                KirimJson(res, 200, new { ok = true, soundboard = daftar, item });
                return;
            }

            if (jalur == "/api/soundboard/hapus")
            {
                if (ButuhToken(req, res, this)) return;
                if (Store.Deck.Settings.Terkunci)
                {
                    KirimJson(res, 423, new { ok = false, code = "terkunci", message = "Tata letak terkunci." });
                    return;
                }
                using var dok = BodyJson(req);
                var id = dok is null ? "" : Teks(dok.RootElement, "id");
                Store.Deck.Soundboard = Store.Deck.Soundboard.Where(s => s.Id != id).ToList();
                Store.Simpan();
                SiarState();
                KirimJson(res, 200, new { ok = true, soundboard = Store.Deck.Soundboard });
                return;
            }

            /* --- ikon aplikasi & ikon kustom ------------------------------ */
            if (jalur == "/api/appicon")
            {
                if (ButuhToken(req, res, this)) return;
                var target = (req.Q("target") ?? "").Trim();
                if (target.Length == 0)
                {
                    KirimJson(res, 400, new { ok = false, alasan = "Target aplikasi kosong." });
                    return;
                }
                var hasil = await AppIcons.IkonAplikasiAsync(target, AppPaths.Ikon);
                if (hasil.Ok)
                {
                    KirimJson(res, 200, new
                    {
                        ok = true,
                        id = hasil.Id,
                        berkas = hasil.Berkas,
                        lebar = hasil.Lebar,
                        tinggi = hasil.Tinggi,
                        sumber = hasil.Sumber,
                        exe = hasil.Exe,
                    });
                }
                else
                {
                    KirimJson(res, 422, new { ok = false, alasan = hasil.Alasan ?? "Ikon tidak dapat diekstrak." });
                }
                return;
            }

            if (jalur == "/api/icons")
            {
                if (req.Metode == "GET")
                {
                    KirimJson(res, 200, new { ok = true, ikon = DaftarIkon() });
                    return;
                }
                if (req.Metode != "POST")
                {
                    KirimJson(res, 405, new { ok = false, message = "Metode tidak didukung." });
                    return;
                }
                if (ButuhToken(req, res, this)) return;

                using var dok = BodyJson(req);
                var dataUrl = dok is null ? "" : Teks(dok.RootElement, "dataUrl");
                var cocok = System.Text.RegularExpressions.Regex.Match(
                    dataUrl, @"^data:(image/(?:svg\+xml|png|webp));base64,(.+)$",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.Singleline);
                if (!cocok.Success)
                {
                    KirimJson(res, 400, new { ok = false, message = "Pilih berkas SVG, PNG, atau WebP." });
                    return;
                }
                byte[] isi;
                try
                {
                    isi = Convert.FromBase64String(cocok.Groups[2].Value);
                }
                catch
                {
                    KirimJson(res, 400, new { ok = false, message = "Berkas ikon tidak valid." });
                    return;
                }
                if (isi.Length == 0)
                {
                    KirimJson(res, 400, new { ok = false, message = "Berkas ikon kosong." });
                    return;
                }
                if (isi.Length > 512 * 1024)
                {
                    KirimJson(res, 413, new { ok = false, message = "Ikon maksimal 256 KB." });
                    return;
                }
                var tipe = cocok.Groups[1].Value.ToLowerInvariant();
                var ext = tipe.Contains("svg") ? "svg" : tipe.Contains("webp") ? "webp" : "png";
                var id = "kst_" + Convert.ToHexString(RandomNumberGenerator.GetBytes(4)).ToLowerInvariant();
                if (!SimpanIkon(id, isi, ext))
                {
                    KirimJson(res, 500, new { ok = false, message = "Ikon tidak dapat disimpan." });
                    return;
                }
                KirimJson(res, 200, new { ok = true, id, ikon = DaftarIkon() });
                return;
            }

            if (jalur.StartsWith("/ikon/", StringComparison.Ordinal))
            {
                var id = jalur["/ikon/".Length..];
                var data = BacaIkon(id);
                if (data is null)
                {
                    KirimTeks(res, 404, "Ikon tidak ditemukan.");
                    return;
                }
                res.Status = 200;
                res.Tipe = data.Value.Tipe;
                res.Isi = data.Value.Isi;
                res.Header["Cache-Control"] = "public, max-age=86400";
                res.Header["X-Content-Type-Options"] = "nosniff";
                res.Header["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
                return;
            }

            /* --- papan ---------------------------------------------------- */
            if (jalur == "/api/deck")
            {
                if (ButuhToken(req, res, this)) return;
                using var dok = BodyJson(req);
                if (dok is null || dok.RootElement.ValueKind != JsonValueKind.Object ||
                    !dok.RootElement.TryGetProperty("deck", out var deckEl) ||
                    deckEl.ValueKind != JsonValueKind.Object)
                {
                    KirimJson(res, 400, new { ok = false, message = "Deck tidak valid." });
                    return;
                }

                if (Store.Deck.Settings.Terkunci && !HanyaMembukaKunci(deckEl, Store.Deck))
                {
                    KirimJson(res, 423, new
                    {
                        ok = false,
                        code = "terkunci",
                        message = "Tata letak terkunci. Buka kunci dulu untuk mengubah papan.",
                        deck = Store.Deck,
                    });
                    return;
                }

                var baru = DeckNormalizer.NormalDeck(deckEl, Store.Deck);
                Store.Ganti(baru);
                PerbaruiDataHidup();
                SiarState();
                KirimJson(res, 200, new { ok = true, deck = Store.Deck });
                return;
            }

            if (jalur == "/api/deck/pindah")
            {
                if (ButuhToken(req, res, this)) return;
                if (Store.Deck.Settings.Terkunci)
                {
                    KirimJson(res, 423, new
                    {
                        ok = false,
                        code = "terkunci",
                        message = "Tata letak terkunci. Buka kunci dulu untuk menukar posisi.",
                    });
                    return;
                }

                using var dok = BodyJson(req);
                if (dok is null || dok.RootElement.ValueKind != JsonValueKind.Object)
                {
                    KirimJson(res, 400, new { ok = false, message = "Permintaan tidak valid." });
                    return;
                }
                var body = dok.RootElement;
                var pageId = Teks(body, "pageId");
                var dari = Angka(body, "dari", -1);
                var ke = Angka(body, "ke", -1);
                var halaman = Store.Deck.Pages.FirstOrDefault(h => h.Id == pageId);
                if (halaman is null)
                {
                    KirimJson(res, 404, new { ok = false, message = "Halaman tidak ditemukan." });
                    return;
                }
                if (dari < 0 || ke < 0 || dari >= halaman.Keys.Count || ke >= halaman.Keys.Count)
                {
                    KirimJson(res, 400, new { ok = false, message = "Posisi tombol tidak valid." });
                    return;
                }
                if (dari != ke)
                {
                    (halaman.Keys[dari], halaman.Keys[ke]) = (halaman.Keys[ke], halaman.Keys[dari]);
                    Store.Simpan();
                    SiarState();
                }
                KirimJson(res, 200, new { ok = true, deck = Store.Deck });
                return;
            }

            if (jalur == "/api/sinyal")
            {
                if (ButuhToken(req, res, this)) return;
                var hasil = await Task.Run(() => VolumeControl.Baca());
                if (hasil.Ok) _volumeTerakhir = hasil;
                var sinyal = MuatanSinyal();
                var obj = (IDictionary<string, object?>)ToDict(sinyal);
                obj["ok"] = true;
                KirimJson(res, 200, obj);
                return;
            }

            if (jalur == "/api/apps")
            {
                if (ButuhToken(req, res, this)) return;
                try
                {
                    var hasil = await AppScanner.DaftarAsync(req.Q("ulang") == "1");
                    KirimJson(res, 200, new { aplikasi = hasil.Aplikasi, diambil = hasil.Diambil, galat = hasil.Galat });
                }
                catch (Exception ex)
                {
                    KirimJson(res, 500, new
                    {
                        ok = false,
                        aplikasi = Array.Empty<object>(),
                        galat = "Daftar aplikasi tidak dapat dibaca: " + ex.Message,
                    });
                }
                return;
            }

            /* --- mulai otomatis + tray ------------------------------------ */
            if (jalur == "/api/otomatis")
            {
                if (ButuhToken(req, res, this)) return;
                if (req.Metode == "GET")
                {
                    KirimJson(res, 200, new
                    {
                        ok = true,
                        aktif = Autostart.Aktif(),
                        tercatat = Store.Deck.Settings.MulaiOtomatis,
                        tray = Tray is not null,
                    });
                    return;
                }

                using var dok = BodyJson(req);
                if (dok is null || dok.RootElement.ValueKind != JsonValueKind.Object ||
                    !dok.RootElement.TryGetProperty("aktif", out var aktifEl) ||
                    aktifEl.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                {
                    KirimJson(res, 400, new { ok = false, message = "Permintaan tidak valid." });
                    return;
                }
                var aktif = aktifEl.GetBoolean();
                var hasil = Autostart.Atur(aktif);
                if (!hasil.Ok)
                {
                    KirimJson(res, 500, new { ok = false, aktif = false, message = hasil.Alasan });
                    return;
                }
                Store.Deck.Settings.MulaiOtomatis = hasil.Aktif;
                Store.Simpan();
                SiarState();
                KirimJson(res, 200, new { ok = true, aktif = hasil.Aktif });
                return;
            }

            if (jalur == "/api/tray")
            {
                if (ButuhToken(req, res, this)) return;
                if (req.Metode == "POST")
                {
                    using var dok = BodyJson(req);
                    var aktif = true;
                    if (dok is not null && dok.RootElement.ValueKind == JsonValueKind.Object &&
                        dok.RootElement.TryGetProperty("aktif", out var a) &&
                        a.ValueKind == JsonValueKind.False)
                    {
                        aktif = false;
                    }
                    var ok = PastikanTray(aktif);
                    try
                    {
                        File.WriteAllText(Path.Combine(AppPaths.Data, "tray.on"), aktif ? "1" : "0");
                    }
                    catch
                    {
                        /* diabaikan */
                    }
                    KirimJson(res, 200, new { ok = true, tray = ok });
                    return;
                }
                KirimJson(res, 200, new { ok = true, tray = Tray is not null });
                return;
            }

            if (jalur == "/api/tray/ikon")
            {
                if (ButuhToken(req, res, this)) return;
                var berkas = Path.Combine(AppPaths.Root, "assets", "tray.ico");
                long ukuran;
                string nama;
                if (File.Exists(berkas))
                {
                    ukuran = new FileInfo(berkas).Length;
                    nama = berkas;
                }
                else
                {
                    var tertanam = TrayIcon.IkonBytes();
                    ukuran = tertanam?.Length ?? 0;
                    nama = "(tertanam di KumiDeck.exe)";
                }
                KirimJson(res, 200, new { ok = true, berkas = nama, ukuran, log = "" });
                return;
            }

            /* --- pasangan & QR -------------------------------------------- */
            if (jalur == "/api/pair-info")
            {
                if (!AlamatLokal(req))
                {
                    KirimJson(res, 403, new { ok = false, message = "Hanya untuk desktop." });
                    return;
                }
                KirimJson(res, 200, new
                {
                    url = TautanRemote,
                    qrUrl = "/api/qr.svg?data=" + Uri.EscapeDataString(TautanRemote),
                    code = KodeTampil,
                    token = Store.Token,
                    lan = Lan,
                    port = Port,
                    qrSiap = true,
                });
                return;
            }

            if (jalur == "/api/qr.svg")
            {
                if (ButuhToken(req, res, this)) return;
                var data = req.Q("data") ?? TautanRemote;
                if (data.Length > 180) data = data[..180];
                try
                {
                    var svg = QrCode.Svg(data, 320, 3);
                    KirimTeks(res, 200, svg, "image/svg+xml");
                }
                catch
                {
                    KirimTeks(res, 422, "Data terlalu panjang untuk kode QR.");
                }
                return;
            }

            if (jalur.StartsWith("/api/", StringComparison.Ordinal))
            {
                KirimJson(res, 404, new { ok = false, message = "Endpoint tidak dikenal." });
                return;
            }

            /* --- berkas statis ------------------------------------------- */
            SajikanAset(res, jalur);
        }
        catch (Exception ex)
        {
            Log.Error("galat permintaan " + req.Metode + " " + req.Jalur, ex);
            KirimJson(res, 500, new { ok = false, message = "Terjadi galat di server." });
        }
    }

    /* ------------------------------------------------------------- press --- */
    private async Task TanganiPress(HttpPermintaan req, HttpJawaban res)
    {
        using var dok = BodyJson(req);
        if (dok is null || dok.RootElement.ValueKind != JsonValueKind.Object)
        {
            KirimJson(res, 400, new { ok = false, message = "Isi permintaan tidak valid." });
            return;
        }
        var body = dok.RootElement;
        var pageId = Teks(body, "pageId");
        var keyId = Teks(body, "keyId");
        var halaman = Store.Deck.Pages.FirstOrDefault(h => h.Id == pageId);
        if (halaman is null)
        {
            KirimJson(res, 404, new { ok = false, message = "Halaman tidak ditemukan." });
            return;
        }
        var key = halaman.Keys.FirstOrDefault(k => k?.Id == keyId);
        if (key is null)
        {
            KirimJson(res, 404, new { ok = false, message = "Tombol tidak ditemukan." });
            return;
        }

        if (key.Widget is not null)
        {
            KirimJson(res, 200, new
            {
                ok = true,
                message = "Tombol widget hanya menampilkan data.",
                navigate = (string?)null,
            });
            return;
        }

        CatatPerangkat(Teks(body, "deviceId"), Teks(body, "platform"), Teks(body, "name"));

        if (AksiBerjalan >= BatasAksiBersamaan)
        {
            KirimJson(res, 429, new
            {
                ok = false,
                message = "Terlalu banyak aksi berjalan. Tunggu sebentar lalu coba lagi.",
            });
            return;
        }

        var mulai = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        HasilAksi hasil;
        TambahAksi();
        try
        {
            var konteks = new KonteksAksi(
                Store.Deck.Pages.Select(h => h.Id).ToList(),
                Store.Deck.Soundboard.ToList(),
                Port);
            hasil = await ActionRunner.JalankanAsync(key.Action, konteks);
        }
        catch (Exception ex)
        {
            hasil = new HasilAksi(false, "Aksi gagal: " + ex.Message);
        }
        finally
        {
            KurangiAksi();
        }

        var entri = new Aktivitas
        {
            Id = Convert.ToHexString(RandomNumberGenerator.GetBytes(4)).ToLowerInvariant(),
            Time = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            PageId = pageId,
            KeyId = keyId,
            Label = key.Label,
            Ok = hasil.Ok,
            Message = string.IsNullOrEmpty(hasil.Message) ? ActionRunner.Ringkas(key.Action) : hasil.Message,
            Platform = Teks(body, "platform") == "android" ? "android" : "desktop",
            Durasi = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - mulai,
        };
        CatatAktivitas(entri);

        _hub.Siar("press", new
        {
            pageId,
            keyId,
            deviceId = Teks(body, "deviceId"),
            platform = entri.Platform,
            ok = entri.Ok,
            message = entri.Message,
            navigate = hasil.Navigate,
            time = entri.Time,
            volume = hasil.Volume,
        });

        TandaiTekan();
        var sinyal = ToDict(MuatanSinyal());
        sinyal["kedip"] = new { pageId, keyId };
        _hub.Siar("sinyal", sinyal);

        KirimJson(res, 200, new
        {
            ok = entri.Ok,
            message = entri.Message,
            navigate = hasil.Navigate,
            volume = hasil.Volume,
            activity = AktivitasSnapshot(),
        });
    }

    private List<Aktivitas> AktivitasSnapshot()
    {
        lock (_kunciAktivitas)
        {
            return _aktivitas.ToList();
        }
    }

    /* --------------------------------------------------------------- SSE --- */
    private async Task TanganiSse(HttpPermintaan req, HttpJawaban res)
    {
        if (!Terautentikasi(req))
        {
            KirimJson(res, 401, new
            {
                ok = false,
                code = "butuh-pasangan",
                message = "Kode pasangan salah atau kedaluwarsa.",
            });
            return;
        }

        res.AmbilAlih = true;

        var kepala = Encoding.ASCII.GetBytes(
            "HTTP/1.1 200 OK\r\n" +
            "Content-Type: text/event-stream; charset=utf-8\r\n" +
            "Cache-Control: no-cache, no-transform\r\n" +
            "Connection: close\r\n" +
            "X-Accel-Buffering: no\r\n\r\n" +
            "retry: 2500\r\n\r\n");
        await req.Aliran.WriteAsync(kepala);
        await req.Aliran.FlushAsync();

        var deviceId = req.Q("device") ?? "";
        var platform = req.Q("platform") == "android" ? "android" : "desktop";
        var nama = req.Q("nama") ?? "";
        var klien = new KlienSse(req.Aliran)
        {
            DeviceId = deviceId,
            Platform = platform,
            Nama = nama,
        };
        _hub.Tambah(klien);

        if (deviceId.Length > 0)
        {
            var data = CatatPerangkat(deviceId, platform, nama);
            if (data is not null) data.Sambungan += 1;
            SiarPerangkat();
        }

        await klien.KirimAsync("sync", JsonSerializer.Serialize(MuatanState(), Json.Ringkas));

        try
        {
            var volume = await Task.Run(() => VolumeControl.Baca());
            if (volume.Ok) _volumeTerakhir = volume;
        }
        catch
        {
            /* diabaikan */
        }
        await klien.KirimAsync("sinyal", JsonSerializer.Serialize(MuatanSinyal(), Json.Ringkas));

        try
        {
            var penyangga = new byte[512];
            while (true)
            {
                using var batas = new CancellationTokenSource(20000);
                int dibaca;
                try
                {
                    dibaca = await req.Aliran.ReadAsync(penyangga, batas.Token);
                }
                catch (OperationCanceledException)
                {
                    if (!await klien.KomentarAsync("denyut")) break;
                    continue;
                }
                if (dibaca <= 0) break;
            }
        }
        catch
        {
            /* sambungan tertutup */
        }
        finally
        {
            _hub.Hapus(klien);
            if (deviceId.Length > 0)
            {
                lock (_perangkat)
                {
                    if (_perangkat.TryGetValue(deviceId, out var data))
                    {
                        data.Sambungan = Math.Max(0, data.Sambungan - 1);
                        data.LastSeen = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                    }
                }
                SiarPerangkat();
            }
        }
    }

    /* --------------------------------------------------------------- aset -- */
    private void SajikanAset(HttpJawaban res, string jalur)
    {
        var aset = _aset.Ambil(jalur);
        if (aset is null)
        {
            KirimTeks(res, 404, "Berkas tidak ditemukan.");
            return;
        }
        res.Status = 200;
        res.Tipe = aset.Tipe;
        res.Isi = aset.Isi;
        res.Header["Cache-Control"] = aset.BolehCache ? "public, max-age=86400" : "no-cache";
        res.Header["X-Content-Type-Options"] = "nosniff";
    }

    /* ------------------------------------------------------------ bantuan -- */
    private static string Teks(JsonElement obj, string nama)
    {
        if (obj.ValueKind != JsonValueKind.Object) return "";
        if (!obj.TryGetProperty(nama, out var v) || v.ValueKind != JsonValueKind.String) return "";
        return v.GetString() ?? "";
    }

    private static int Angka(JsonElement obj, string nama, int bawaan)
    {
        if (obj.ValueKind != JsonValueKind.Object) return bawaan;
        if (!obj.TryGetProperty(nama, out var v) || v.ValueKind != JsonValueKind.Number) return bawaan;
        return v.TryGetInt32(out var i) ? i : bawaan;
    }

    private static string NamaBerkasAman(string nama)
    {
        var bersih = new string((nama ?? "kumideck").ToLowerInvariant()
            .Select(c => char.IsLetterOrDigit(c) ? c : '-')
            .ToArray()).Trim('-');
        return bersih.Length == 0 ? "kumideck" : bersih;
    }

    private static string VersiAplikasi()
    {
        try
        {
            return typeof(KumiServer).Assembly.GetName().Version?.ToString(3) ?? "2.0.0";
        }
        catch
        {
            return "2.0.0";
        }
    }

    private static IDictionary<string, object?> ToDict(object obj)
    {
        var node = JsonSerializer.SerializeToNode(obj, Json.Ringkas)!.AsObject();
        var hasil = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var (k, v) in node)
        {
            hasil[k] = v;
        }
        return hasil;
    }
}
