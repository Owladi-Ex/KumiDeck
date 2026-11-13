using System.Globalization;
using System.Text;
using QRCoder;

namespace KumiDeck.Platform;

/* Kode QR SVG untuk pasangan Remote. Memakai pustaka QRCoder (sudah termasuk
   di dalam .exe) dan menggambar modulnya sendiri sebagai SVG agar tajam di
   layar maupun saat dicetak. */
public static class QrCode
{
    public static string Svg(string data, int ukuran = 320, int margin = 3)
    {
        if (string.IsNullOrEmpty(data)) throw new ArgumentException("Data kode QR kosong.");

        var generator = new QRCodeGenerator();
        var kode = generator.CreateQrCode(data, QRCodeGenerator.ECCLevel.M, forceUtf8: true);
        var matriks = kode.ModuleMatrix;
        var jumlah = matriks.Count;
        var sisi = jumlah + (margin * 2);

        var jalur = new StringBuilder(jumlah * jumlah * 8);
        for (var y = 0; y < jumlah; y++)
        {
            var baris = matriks[y];
            for (var x = 0; x < jumlah; x++)
            {
                if (!baris[x]) continue;
                jalur.Append('M')
                    .Append((x + margin).ToString(CultureInfo.InvariantCulture))
                    .Append(' ')
                    .Append((y + margin).ToString(CultureInfo.InvariantCulture))
                    .Append("h1v1h-1z");
            }
        }

        var svg = new StringBuilder(jalur.Length + 320);
        svg.Append("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"")
            .Append(ukuran.ToString(CultureInfo.InvariantCulture))
            .Append("\" height=\"")
            .Append(ukuran.ToString(CultureInfo.InvariantCulture))
            .Append("\" viewBox=\"0 0 ")
            .Append(sisi.ToString(CultureInfo.InvariantCulture))
            .Append(' ')
            .Append(sisi.ToString(CultureInfo.InvariantCulture))
            .Append("\" shape-rendering=\"crispEdges\" role=\"img\" aria-label=\"Kode QR pasangan KumiDeck\">")
            .Append("<rect width=\"100%\" height=\"100%\" fill=\"#ffffff\"/>")
            .Append("<path d=\"")
            .Append(jalur)
            .Append("\" fill=\"#111111\"/>")
            .Append("</svg>");

        return svg.ToString();
    }
}