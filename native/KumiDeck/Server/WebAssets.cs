using System.IO;
using System.Reflection;

namespace KumiDeck.Server;

/* Berkas UI web (folder public/) ditanam di dalam .exe sebagai sumber daya,
   sehingga KumiDeck tetap satu berkas. Dibaca sekali ke memori saat start. */
public sealed class WebAssets
{
    public sealed record Aset(byte[] Isi, string Tipe, bool BolehCache);

    private readonly Dictionary<string, Aset> _berkas = new(StringComparer.OrdinalIgnoreCase);

    public static readonly Dictionary<string, string> Tipe = new(StringComparer.OrdinalIgnoreCase)
    {
        [".html"] = "text/html; charset=utf-8",
        [".css"] = "text/css; charset=utf-8",
        [".js"] = "text/javascript; charset=utf-8",
        [".mjs"] = "text/javascript; charset=utf-8",
        [".json"] = "application/json; charset=utf-8",
        [".svg"] = "image/svg+xml",
        [".png"] = "image/png",
        [".webp"] = "image/webp",
        [".woff2"] = "font/woff2",
        [".webmanifest"] = "application/manifest+json; charset=utf-8",
        [".ico"] = "image/x-icon",
        [".txt"] = "text/plain; charset=utf-8",
        [".md"] = "text/markdown; charset=utf-8",
    };

    public int Jumlah => _berkas.Count;

    public WebAssets()
    {
        var asm = Assembly.GetExecutingAssembly();
        foreach (var nama in asm.GetManifestResourceNames())
        {
            if (!nama.StartsWith("web/", StringComparison.Ordinal)) continue;
            var jalur = nama["web/".Length..].Replace('\\', '/');
            using var alir = asm.GetManifestResourceStream(nama);
            if (alir is null) continue;
            using var memori = new MemoryStream();
            alir.CopyTo(memori);
            var ext = Path.GetExtension(jalur).ToLowerInvariant();
            var tipe = Tipe.TryGetValue(ext, out var t) ? t : "application/octet-stream";
            var cache = ext is ".woff2" or ".png" or ".ico" ||
                        (jalur.StartsWith("kumi/", StringComparison.OrdinalIgnoreCase) && ext == ".svg");
            _berkas[jalur] = new Aset(memori.ToArray(), tipe, cache);
        }
    }

    public Aset? Ambil(string jalur)
    {
        if (string.IsNullOrEmpty(jalur)) jalur = "index.html";
        jalur = jalur.TrimStart('/');

        /* Cegah keluar dari folder web. */
        if (jalur.Contains("..", StringComparison.Ordinal)) return null;
        var bersih = jalur.Replace('\\', '/');

        if (_berkas.TryGetValue(bersih, out var aset)) return aset;

        /* "/" dan nama folder tanpa ekstensi → index.html di dalamnya. */
        if (!Path.HasExtension(bersih))
        {
            var kandidat = bersih.TrimEnd('/') + "/index.html";
            if (_berkas.TryGetValue(kandidat.TrimStart('/'), out var index)) return index;
        }
        return null;
    }
}
