using System.Net;
using System.Net.Http;
using System.Text;
using KumiDeck.Data;

namespace KumiDeck.Actions;

/* Aksi HTTP untuk jaringan lokal (saklar rumah pintar, webhook).

   Yang dicegah: alamat metadata cloud, link-local, port server KumiDeck
   sendiri (rekursi), dan redirect ke host lain. Isi balasan dibuang; hanya
   status yang dilaporkan. */
internal static class HttpAction
{
    public static (bool Ok, string Pesan) PeriksaTujuan(string url, int portServer)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            return (false, "Alamat HTTP tidak sah.");
        }
        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
        {
            return (false, "Hanya http:// dan https:// yang didukung.");
        }

        var host = uri.Host.ToLowerInvariant().Trim('[', ']');
        if (host == "169.254.169.254") return (false, "Alamat metadata cloud tidak diizinkan.");
        if (host.StartsWith("169.254.", StringComparison.Ordinal)) return (false, "Alamat link-local tidak diizinkan.");
        if (host is "0.0.0.0" or "::" or "") return (false, "Alamat tujuan tidak sah.");
        if (host.StartsWith("fe80:", StringComparison.OrdinalIgnoreCase))
        {
            return (false, "Alamat link-local IPv6 tidak diizinkan.");
        }

        var port = uri.IsDefaultPort
            ? uri.Scheme == Uri.UriSchemeHttps ? 443 : 80
            : uri.Port;
        var loopback = host is "127.0.0.1" or "::1" or "localhost";
        if (loopback && port == portServer)
        {
            return (false, "Aksi HTTP tidak boleh memanggil server KumiDeck sendiri.");
        }
        return (true, uri.Authority);
    }

    public static async Task<(bool Ok, string Pesan)> JalankanAsync(Aksi aksi, int portServer)
    {
        var url = aksi.Url ?? "";
        var tujuan = PeriksaTujuan(url, portServer);
        if (!tujuan.Ok) return (false, tujuan.Pesan);
        var hosTujuan = tujuan.Pesan;

        var metode = new HttpMethod(string.IsNullOrWhiteSpace(aksi.Method) ? "GET" : aksi.Method!.ToUpperInvariant());

        try
        {
            using var penangan = new SocketsHttpHandler
            {
                AllowAutoRedirect = false,
                AutomaticDecompression = DecompressionMethods.None,
                ConnectTimeout = TimeSpan.FromSeconds(5),
            };
            using var klien = new HttpClient(penangan)
            {
                Timeout = TimeSpan.FromSeconds(8),
            };

            using var permintaan = new HttpRequestMessage(metode, url);

            HttpContent? isi = null;
            if (metode != HttpMethod.Get && metode != HttpMethod.Head && !string.IsNullOrEmpty(aksi.Body))
            {
                isi = new ByteArrayContent(Encoding.UTF8.GetBytes(aksi.Body!));
                permintaan.Content = isi;
            }

            foreach (var header in aksi.Headers ?? new List<HeaderHttp>())
            {
                if (string.IsNullOrWhiteSpace(header.Name)) continue;
                if (!permintaan.Headers.TryAddWithoutValidation(header.Name, header.Value))
                {
                    isi?.Headers.TryAddWithoutValidation(header.Name, header.Value);
                }
            }

            using var balasan = await klien.SendAsync(
                permintaan,
                HttpCompletionOption.ResponseHeadersRead,
                CancellationToken.None);

            var kode = (int)balasan.StatusCode;
            return (kode is >= 200 and < 400, "HTTP " + kode + " · " + hosTujuan);
        }
        catch (TaskCanceledException)
        {
            return (false, "Gagal menghubungi " + hosTujuan + " (waktu habis).");
        }
        catch (HttpRequestException ex)
        {
            return (false, "Gagal menghubungi " + hosTujuan + " (" + ex.Message + ").");
        }
        catch (Exception ex)
        {
            return (false, "Gagal menghubungi " + hosTujuan + " (" + ex.Message + ").");
        }
    }
}
