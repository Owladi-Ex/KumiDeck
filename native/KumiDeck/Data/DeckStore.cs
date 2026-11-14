using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using KumiDeck.Core;

namespace KumiDeck.Data;

/* Papan + token pasangan di disk (data/deck.json, data/secret.json).
   Setiap perubahan menyimpan cadangan versi sebelumnya di data/cadangan
   (maksimal 10) supaya perubahan bisa diurungkan. */
public sealed class DeckStore
{
    private const int MaksCadangan = 10;
    private readonly object _kunci = new();

    public Deck Deck { get; private set; }
    public string Token { get; }
    public string KodeTampil => (Token[..4] + "-" + Token[4..]).ToUpperInvariant();

    public DeckStore()
    {
        Deck = Muat();
        Token = MuatToken();
    }

    public Deck Muat()
    {
        try
        {
            if (File.Exists(AppPaths.DeckBerkas))
            {
                var teks = File.ReadAllText(AppPaths.DeckBerkas, Encoding.UTF8);
                using var dok = JsonDocument.Parse(teks);
                return DeckNormalizer.NormalDeck(dok.RootElement);
            }
        }
        catch (Exception ex)
        {
            Log.Warn("deck.json tidak dapat dibaca: " + ex.Message);
        }

        /* Pemasangan baru: pakai papan contoh yang sudah dinormalkan, sama
           seperti store.js versi Node. */
        var contoh = DeckNormalizer.DeckContoh();
        var awal = DeckNormalizer.NormalDeck(JsonSerializer.SerializeToElement(contoh, Json.Opsi));
        Simpan(awal);
        return awal;
    }

    public bool Simpan()
    {
        lock (_kunci)
        {
            return Simpan(Deck);
        }
    }

    public bool Simpan(Deck deck)
    {
        try
        {
            Directory.CreateDirectory(AppPaths.Data);
            var isi = JsonSerializer.Serialize(deck, Json.Opsi);
            var sementara = AppPaths.DeckBerkas + ".tmp";
            File.WriteAllText(sementara, isi, new UTF8Encoding(false));

            /* Cadangkan isi lama sebelum ditimpa, hanya bila isinya berubah. */
            if (File.Exists(AppPaths.DeckBerkas))
            {
                try
                {
                    var lama = File.ReadAllText(AppPaths.DeckBerkas, Encoding.UTF8);
                    if (!string.Equals(lama, isi, StringComparison.Ordinal)) Cadangkan(lama);
                }
                catch (Exception ex)
                {
                    Log.Warn("cadangan otomatis dilewati: " + ex.Message);
                }
            }

            File.Move(sementara, AppPaths.DeckBerkas, true);
            return true;
        }
        catch (Exception ex)
        {
            Log.Error("gagal menyimpan deck", ex);
            return false;
        }
    }

    /* ----------------------------------------------------------- cadangan --- */
    private static void Cadangkan(string isi)
    {
        Directory.CreateDirectory(AppPaths.Cadangan);
        var nama = "deck-" + DateTime.Now.ToString("yyyyMMdd-HHmmss-fff") + ".json";
        File.WriteAllText(Path.Combine(AppPaths.Cadangan, nama), isi, new UTF8Encoding(false));

        var berkas = new DirectoryInfo(AppPaths.Cadangan)
            .GetFiles("deck-*.json")
            .OrderByDescending(f => f.Name, StringComparer.Ordinal)
            .ToList();
        foreach (var lama in berkas.Skip(MaksCadangan))
        {
            try
            {
                lama.Delete();
            }
            catch
            {
                /* berkas sedang dipakai: biarkan untuk pembersihan berikutnya */
            }
        }
    }

    public List<CadanganInfo> DaftarCadangan()
    {
        var hasil = new List<CadanganInfo>();
        try
        {
            if (!Directory.Exists(AppPaths.Cadangan)) return hasil;
            foreach (var f in new DirectoryInfo(AppPaths.Cadangan).GetFiles("deck-*.json"))
            {
                hasil.Add(new CadanganInfo
                {
                    Nama = f.Name,
                    Waktu = new DateTimeOffset(f.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
                    Ukuran = f.Length,
                });
            }
        }
        catch (Exception ex)
        {
            Log.Warn("daftar cadangan tidak dapat dibaca: " + ex.Message);
        }
        hasil.Sort((a, b) => string.CompareOrdinal(b.Nama, a.Nama));
        return hasil.Take(MaksCadangan).ToList();
    }

    public bool PulihkanCadangan(string nama, out string pesan)
    {
        pesan = "";
        var aman = nama ?? "";
        if (!System.Text.RegularExpressions.Regex.IsMatch(
                aman, @"^deck-\d{8}-\d{6}-\d{3}\.json$"))
        {
            pesan = "Nama cadangan tidak valid.";
            return false;
        }

        var jalur = Path.Combine(AppPaths.Cadangan, aman);
        if (!File.Exists(jalur))
        {
            pesan = "Cadangan tidak ditemukan.";
            return false;
        }

        try
        {
            using var dok = JsonDocument.Parse(File.ReadAllText(jalur, Encoding.UTF8));
            lock (_kunci)
            {
                var baru = DeckNormalizer.NormalDeck(dok.RootElement, Deck);
                Deck = baru;
                /* Simpan(baru) juga mencadangkan papan yang sedang aktif. */
                Simpan(baru);
            }
            pesan = "Cadangan dipulihkan.";
            return true;
        }
        catch (Exception ex)
        {
            Log.Error("gagal memulihkan cadangan", ex);
            pesan = "Cadangan tidak dapat dipulihkan.";
            return false;
        }
    }

    public void Ganti(Deck baru)
    {
        lock (_kunci)
        {
            Deck = baru;
            Simpan(baru);
        }
    }

    /* Ubah papan dengan aman dari beberapa permintaan sekaligus. */
    public T Ubah<T>(Func<Deck, T> kerja)
    {
        lock (_kunci)
        {
            var hasil = kerja(Deck);
            Simpan(Deck);
            return hasil;
        }
    }

    private static string MuatToken()
    {
        try
        {
            if (File.Exists(AppPaths.RahasiaBerkas))
            {
                using var dok = JsonDocument.Parse(File.ReadAllText(AppPaths.RahasiaBerkas, Encoding.UTF8));
                if (dok.RootElement.TryGetProperty("token", out var t) &&
                    t.ValueKind == JsonValueKind.String)
                {
                    var token = t.GetString() ?? "";
                    if (System.Text.RegularExpressions.Regex.IsMatch(token, "^[a-f0-9]{8,}$"))
                    {
                        return token;
                    }
                }
            }
        }
        catch
        {
            /* buat baru */
        }

        var baru = Convert.ToHexString(RandomNumberGenerator.GetBytes(4)).ToLowerInvariant();
        try
        {
            Directory.CreateDirectory(AppPaths.Data);
            File.WriteAllText(
                AppPaths.RahasiaBerkas,
                "{\n  \"token\": \"" + baru + "\"\n}",
                new UTF8Encoding(false));
        }
        catch (Exception ex)
        {
            Log.Error("gagal menulis secret.json", ex);
        }
        return baru;
    }
}

/* Satu berkas cadangan papan di data/cadangan. */
public sealed class CadanganInfo
{
    public string Nama { get; set; } = "";
    public long Waktu { get; set; }
    public long Ukuran { get; set; }
}
