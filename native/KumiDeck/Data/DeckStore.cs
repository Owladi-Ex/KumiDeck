using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using KumiDeck.Core;

namespace KumiDeck.Data;

/* Papan + token pasangan di disk (data/deck.json, data/secret.json). */
public sealed class DeckStore
{
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
            var sementara = AppPaths.DeckBerkas + ".tmp";
            File.WriteAllText(sementara, JsonSerializer.Serialize(deck, Json.Opsi), new UTF8Encoding(false));
            File.Move(sementara, AppPaths.DeckBerkas, true);
            return true;
        }
        catch (Exception ex)
        {
            Log.Error("gagal menyimpan deck", ex);
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
