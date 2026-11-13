using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace KumiDeck.Data;

/* Bentuk data papan (lihat CONTRACT.md). Nama properti JSON dipertahankan
   persis seperti versi Node agar UI web lama tetap cocok. */

public sealed class Deck
{
    [JsonPropertyName("version")] public int Version { get; set; } = 1;
    [JsonPropertyName("profile")] public Profil Profile { get; set; } = new();
    [JsonPropertyName("pages")] public List<Halaman> Pages { get; set; } = new();
    [JsonPropertyName("otomatis")] public List<AturanOtomatis> Otomatis { get; set; } = new();
    [JsonPropertyName("soundboard")] public List<SuaraItem> Soundboard { get; set; } = new();
    [JsonPropertyName("settings")] public Setelan Settings { get; set; } = new();
}

public sealed class Profil
{
    [JsonPropertyName("name")] public string Name { get; set; } = "Meja Kerja";
    [JsonPropertyName("columns")] public int Columns { get; set; } = 5;
    [JsonPropertyName("rows")] public int Rows { get; set; } = 3;
}

public sealed class Halaman
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("name")] public string Name { get; set; } = "Halaman";
    [JsonPropertyName("keys")] public List<Tombol?> Keys { get; set; } = new();
}

public sealed class Tombol
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("label")] public string Label { get; set; } = "Tombol";
    [JsonPropertyName("icon")] public string Icon { get; set; } = "i-grid";
    [JsonPropertyName("variant")] public string Variant { get; set; } = "default";
    [JsonPropertyName("warna"), JsonIgnore(Condition = JsonIgnoreCondition.Never)] public Warna? Warna { get; set; }
    [JsonPropertyName("widget"), JsonIgnore(Condition = JsonIgnoreCondition.Never)] public Widget? Widget { get; set; }
    [JsonPropertyName("tandaiAktif"), JsonIgnore(Condition = JsonIgnoreCondition.Never)] public Penanda? TandaiAktif { get; set; }
    [JsonPropertyName("action")] public Aksi Action { get; set; } = Aksi.Kosong();
}

public sealed class Warna
{
    [JsonPropertyName("bg")] public string Bg { get; set; } = "";
    [JsonPropertyName("fg")] public string Fg { get; set; } = "";
}

public sealed class Widget
{
    [JsonPropertyName("type")] public string Type { get; set; } = "jam";
}

public sealed class Penanda
{
    [JsonPropertyName("proses")] public string Proses { get; set; } = "";
    [JsonPropertyName("jendela")] public string Jendela { get; set; } = "";
}

public sealed class Syarat
{
    [JsonPropertyName("proses")] public string Proses { get; set; } = "";
    [JsonPropertyName("jendela")] public string Jendela { get; set; } = "";
}

public sealed class HeaderHttp
{
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("value")] public string Value { get; set; } = "";
}

public sealed class Langkah
{
    [JsonPropertyName("delay")] public int Delay { get; set; }
    [JsonPropertyName("action")] public Aksi Action { get; set; } = Aksi.Kosong();
}

public sealed class Aksi
{
    [JsonPropertyName("type")] public string Type { get; set; } = "kosong";

    [JsonPropertyName("combo")] public string? Combo { get; set; }
    [JsonPropertyName("text")] public string? Text { get; set; }
    [JsonPropertyName("target")] public string? Target { get; set; }

    [JsonPropertyName("method")] public string? Method { get; set; }
    [JsonPropertyName("url")] public string? Url { get; set; }
    [JsonPropertyName("body")] public string? Body { get; set; }
    [JsonPropertyName("headers")] public List<HeaderHttp>? Headers { get; set; }

    [JsonPropertyName("cmd")] public string? Cmd { get; set; }
    [JsonPropertyName("pageId")] public string? PageId { get; set; }
    [JsonPropertyName("steps")] public List<Langkah>? Steps { get; set; }
    [JsonPropertyName("soundId")] public string? SoundId { get; set; }
    [JsonPropertyName("mode")] public string? Mode { get; set; }
    [JsonPropertyName("nilai")] public int? Nilai { get; set; }

    [JsonPropertyName("syarat")] public Syarat? Syarat { get; set; }
    [JsonPropertyName("aktif")] public Aksi? Aktif { get; set; }
    [JsonPropertyName("tidakAktif")] public Aksi? TidakAktif { get; set; }

    public static Aksi Kosong() => new() { Type = "kosong" };
}

public sealed class AturanOtomatis
{
    [JsonPropertyName("proses")] public string Proses { get; set; } = "";
    [JsonPropertyName("jendela")] public string Jendela { get; set; } = "";
    [JsonPropertyName("pageId")] public string PageId { get; set; } = "";
    [JsonPropertyName("aktif")] public bool Aktif { get; set; } = true;
}

public sealed class SuaraItem
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("name")] public string Name { get; set; } = "Suara";
    [JsonPropertyName("sumber")] public string Sumber { get; set; } = "";
    [JsonPropertyName("jenis")] public string Jenis { get; set; } = "berkas";
    [JsonPropertyName("volume")] public int Volume { get; set; } = 100;
    [JsonPropertyName("perangkatId")] public string PerangkatId { get; set; } = "";
}

public sealed class Setelan
{
    [JsonPropertyName("sound")] public bool Sound { get; set; } = true;
    [JsonPropertyName("home")] public string Home { get; set; } = "";
    [JsonPropertyName("terkunci")] public bool Terkunci { get; set; }
    [JsonPropertyName("autoProfil")] public bool AutoProfil { get; set; }
    [JsonPropertyName("mulaiOtomatis")] public bool MulaiOtomatis { get; set; }
}

public static class Json
{
    public static readonly JsonSerializerOptions Opsi = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        AllowTrailingCommas = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
    };

    /* Opsi ringkas untuk muatan SSE/HTTP: tanpa indentasi. */
    public static readonly JsonSerializerOptions Ringkas = new()
    {
        WriteIndented = false,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public static string Tulis(object nilai, bool cantik = false) =>
        JsonSerializer.Serialize(nilai, typeof(object), cantik ? Opsi : Ringkas);

    public static T? Baca<T>(string teks) where T : class
    {
        try
        {
            return JsonSerializer.Deserialize<T>(teks, Opsi);
        }
        catch
        {
            return null;
        }
    }
}
