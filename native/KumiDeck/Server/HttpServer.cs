using System.IO;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Threading;
using KumiDeck.Core;

namespace KumiDeck.Server;

public sealed class HttpPermintaan
{
    public string Metode { get; init; } = "GET";
    public string Target { get; init; } = "/";
    public string Jalur { get; init; } = "/";
    public string Query { get; init; } = "";
    public Dictionary<string, string> Header { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    public byte[] Body { get; init; } = Array.Empty<byte>();
    public string AlamatRemote { get; init; } = "";
    public bool Lokal { get; init; }
    public Stream Aliran { get; init; } = Stream.Null;

    public string Host => Header.TryGetValue("host", out var h) ? h : "";

    public string? Q(string nama)
    {
        foreach (var bagian in Query.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var pisah = bagian.IndexOf('=');
            var kunci = pisah < 0 ? bagian : bagian[..pisah];
            if (!string.Equals(Uri.UnescapeDataString(kunci.Replace('+', ' ')), nama, StringComparison.Ordinal)) continue;
            var nilai = pisah < 0 ? "" : bagian[(pisah + 1)..];
            try
            {
                return Uri.UnescapeDataString(nilai.Replace('+', ' '));
            }
            catch
            {
                return nilai;
            }
        }
        return null;
    }

    public string BodyTeks => Encoding.UTF8.GetString(Body);

    public System.Text.Json.JsonDocument? Json()
    {
        if (Body.Length == 0) return System.Text.Json.JsonDocument.Parse("{}");
        try
        {
            return System.Text.Json.JsonDocument.Parse(Body);
        }
        catch
        {
            return null;
        }
    }
}

public sealed class HttpJawaban
{
    public int Status { get; set; } = 200;
    public string Tipe { get; set; } = "application/json; charset=utf-8";
    public byte[] Isi { get; set; } = Array.Empty<byte>();
    public Dictionary<string, string> Header { get; } = new(StringComparer.OrdinalIgnoreCase);
    public bool AmbilAlih { get; set; }

    public static HttpJawaban Json(object data, int status = 200)
    {
        return new HttpJawaban
        {
            Status = status,
            Tipe = "application/json; charset=utf-8",
            Isi = Encoding.UTF8.GetBytes(System.Text.Json.JsonSerializer.Serialize(data, Data.Json.Ringkas)),
        };
    }

    public static HttpJawaban Teks(string teks, int status = 200, string tipe = "text/plain; charset=utf-8")
    {
        return new HttpJawaban
        {
            Status = status,
            Tipe = tipe,
            Isi = Encoding.UTF8.GetBytes(teks),
        };
    }

    public static HttpJawaban Biner(byte[] isi, string tipe, int status = 200)
    {
        return new HttpJawaban { Status = status, Tipe = tipe, Isi = isi };
    }
}

/* Server HTTP/1.1 kecil di atas TcpListener.

   Sengaja tanpa Kerberos/HTTP.sys: bisa mendengarkan di alamat LAN tanpa hak
   administrator dan tanpa URL ACL, baik HTTP maupun HTTPS (SslStream). */
public sealed class HttpServer
{
    private readonly Func<HttpPermintaan, HttpJawaban, Task> _penangan;
    private TcpListener? _pendengar;
    private CancellationTokenSource? _batal;
    private Task? _tugas;
    private X509Certificate2? _sertifikat;

    public int Port { get; private set; }
    public bool Https { get; private set; }
    public string Skema => Https ? "https" : "http";

    public HttpServer(Func<HttpPermintaan, HttpJawaban, Task> penangan)
    {
        _penangan = penangan;
    }

    public async Task<int> MulaiAsync(int port, X509Certificate2? sertifikat = null)
    {
        _sertifikat = sertifikat;
        Https = sertifikat is not null;

        TcpListener? pendengar = null;
        var portAkhir = port;
        for (var p = port; p <= port + 12; p++)
        {
            try
            {
                pendengar = new TcpListener(System.Net.IPAddress.Any, p);
                pendengar.Start();
                portAkhir = p;
                break;
            }
            catch (SocketException)
            {
                pendengar = null;
            }
        }

        if (pendengar is null)
        {
            throw new IOException("Tidak ada port yang bisa dipakai (dicoba " + port + "-" + (port + 12) + ").");
        }

        _pendengar = pendengar;
        Port = portAkhir;
        _batal = new CancellationTokenSource();
        _tugas = Task.Run(() => TerimaAsync(_batal.Token));
        await Task.CompletedTask;
        return portAkhir;
    }

    private async Task TerimaAsync(CancellationToken batal)
    {
        while (!batal.IsCancellationRequested)
        {
            TcpClient klien;
            try
            {
                klien = await _pendengar!.AcceptTcpClientAsync(batal);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (ObjectDisposedException)
            {
                break;
            }
            catch (Exception ex)
            {
                Log.Warn("terima sambungan gagal: " + ex.Message);
                continue;
            }

            _ = Task.Run(() => TanganiKlienAsync(klien, batal), CancellationToken.None);
        }
    }

    private async Task TanganiKlienAsync(TcpClient klien, CancellationToken batal)
    {
        klien.NoDelay = true;
        await using var aliranMentah = klien.GetStream();
        Stream aliran = aliranMentah;
        SslStream? tls = null;

        try
        {
            if (_sertifikat is not null)
            {
                tls = new SslStream(aliranMentah, false);
                await tls.AuthenticateAsServerAsync(new SslServerAuthenticationOptions
                {
                    ServerCertificate = _sertifikat,
                    ClientCertificateRequired = false,
                    EnabledSslProtocols = System.Security.Authentication.SslProtocols.Tls12 |
                                          System.Security.Authentication.SslProtocols.Tls13,
                }, batal);
                aliran = tls;
            }

            var remote = klien.Client.RemoteEndPoint as System.Net.IPEndPoint;
            var alamat = remote?.Address.IsIPv4MappedToIPv6 == true
                ? remote.Address.MapToIPv4().ToString()
                : remote?.Address.ToString() ?? "";
            var lokal = remote is not null && System.Net.IPAddress.IsLoopback(remote.Address);
            var pembaca = new PembacaHttp(aliran);

            for (var nomor = 0; nomor < 200 && !batal.IsCancellationRequested; nomor++)
            {
                var barisPermintaan = await pembaca.BacaBarisAsync(batal);
                if (barisPermintaan is null) break;
                if (barisPermintaan.Length == 0) continue;

                var bagian = barisPermintaan.Split(' ');
                if (bagian.Length < 2) break;
                var metode = bagian[0].ToUpperInvariant();
                var target = bagian[1];

                var header = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                while (true)
                {
                    var baris = await pembaca.BacaBarisAsync(batal);
                    if (baris is null) return;
                    if (baris.Length == 0) break;
                    var titik = baris.IndexOf(':');
                    if (titik <= 0) continue;
                    var nama = baris[..titik].Trim();
                    var nilai = baris[(titik + 1)..].Trim();
                    header[nama] = header.TryGetValue(nama, out var lama) ? lama + ", " + nilai : nilai;
                }

                var panjang = 0;
                if (header.TryGetValue("content-length", out var cl) && !int.TryParse(cl, out panjang))
                {
                    await TulisAsync(aliran, 400, "text/plain; charset=utf-8",
                        Encoding.UTF8.GetBytes("Content-Length tidak valid."), close: true, batal);
                    break;
                }
                if (panjang < 0 || panjang > 16 * 1024 * 1024)
                {
                    await TulisAsync(aliran, 413, "application/json; charset=utf-8",
                        Encoding.UTF8.GetBytes("{\"ok\":false,\"code\":\"terlalu-besar\",\"message\":\"Berkas terlalu besar.\"}"),
                        close: true, batal);
                    break;
                }

                var body = panjang > 0 ? await pembaca.BacaTepatAsync(panjang, batal) : Array.Empty<byte>();

                if (!CobaUraiTarget(target, out var jalur, out var query))
                {
                    await TulisAsync(aliran, 400, "text/plain; charset=utf-8",
                        Encoding.UTF8.GetBytes("Alamat permintaan tidak valid."), close: true, batal);
                    break;
                }

                var permintaan = new HttpPermintaan
                {
                    Metode = metode,
                    Target = target,
                    Jalur = jalur,
                    Query = query,
                    Header = header,
                    Body = body,
                    AlamatRemote = alamat,
                    Lokal = lokal,
                    Aliran = aliran,
                };
                var jawaban = new HttpJawaban();

                try
                {
                    await _penangan(permintaan, jawaban);
                }
                catch (Exception ex)
                {
                    Log.Error("galat permintaan " + metode + " " + jalur, ex);
                    if (!jawaban.AmbilAlih)
                    {
                        jawaban = HttpJawaban.Json(new { ok = false, message = "Terjadi galat di server." }, 500);
                    }
                }

                if (jawaban.AmbilAlih) break;

                var tutup = HarusTutup(header, nomor >= 199);
                await TulisAsync(aliran, jawaban, tutup, metode == "HEAD", batal);
                if (tutup) break;
            }
        }
        catch (OperationCanceledException)
        {
            /* server berhenti */
        }
        catch (IOException)
        {
            /* klien menutup sambungan */
        }
        catch (Exception ex)
        {
            Log.Warn("sambungan klien: " + ex.Message);
        }
        finally
        {
            try
            {
                tls?.Dispose();
            }
            catch
            {
                /* diabaikan */
            }
            try
            {
                klien.Dispose();
            }
            catch
            {
                /* diabaikan */
            }
        }
    }

    private static bool HarusTutup(Dictionary<string, string> header, bool paksa)
    {
        if (paksa) return true;
        if (header.TryGetValue("connection", out var c))
        {
            var nilai = c.ToLowerInvariant();
            if (nilai.Contains("close")) return true;
        }
        if (header.TryGetValue("proxy-connection", out var pc) &&
            pc.Contains("close", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }
        return false;
    }

    private static bool CobaUraiTarget(string target, out string jalur, out string query)
    {
        jalur = "/";
        query = "";
        if (!target.StartsWith('/')) return false;
        var tanya = target.IndexOf('?');
        var mentah = tanya < 0 ? target : target[..tanya];
        query = tanya < 0 ? "" : target[(tanya + 1)..];
        try
        {
            jalur = Uri.UnescapeDataString(mentah);
        }
        catch
        {
            return false;
        }
        return true;
    }

    private static Task TulisAsync(Stream aliran, HttpJawaban jawaban, bool tutup, bool tanpaIsi, CancellationToken batal)
    {
        var header = new StringBuilder();
        header.Append("HTTP/1.1 ").Append(jawaban.Status).Append(' ').Append(FrasaStatus(jawaban.Status)).Append("\r\n");
        header.Append("Content-Type: ").Append(jawaban.Tipe).Append("\r\n");
        header.Append("Content-Length: ").Append(tanpaIsi ? 0 : jawaban.Isi.Length).Append("\r\n");
        foreach (var (nama, nilai) in jawaban.Header)
        {
            header.Append(nama).Append(": ").Append(nilai).Append("\r\n");
        }
        header.Append("Connection: ").Append(tutup ? "close" : "keep-alive").Append("\r\n");
        header.Append("\r\n");

        var kepala = Encoding.ASCII.GetBytes(header.ToString());
        return TulisMentahAsync(aliran, kepala, tanpaIsi ? Array.Empty<byte>() : jawaban.Isi, batal);
    }

    private static async Task TulisAsync(Stream aliran, int status, string tipe, byte[] isi, bool close, CancellationToken batal)
    {
        var jawaban = new HttpJawaban { Status = status, Tipe = tipe, Isi = isi };
        await TulisAsync(aliran, jawaban, close, false, batal);
    }

    private static async Task TulisMentahAsync(Stream aliran, byte[] kepala, byte[] isi, CancellationToken batal)
    {
        await aliran.WriteAsync(kepala, batal);
        if (isi.Length > 0) await aliran.WriteAsync(isi, batal);
        await aliran.FlushAsync(batal);
    }

    private static string FrasaStatus(int kode) => kode switch
    {
        200 => "OK",
        201 => "Created",
        204 => "No Content",
        206 => "Partial Content",
        301 => "Moved Permanently",
        302 => "Found",
        304 => "Not Modified",
        307 => "Temporary Redirect",
        308 => "Permanent Redirect",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        408 => "Request Timeout",
        411 => "Length Required",
        413 => "Payload Too Large",
        422 => "Unprocessable Entity",
        423 => "Locked",
        429 => "Too Many Requests",
        500 => "Internal Server Error",
        502 => "Bad Gateway",
        503 => "Service Unavailable",
        _ => "OK",
    };

    public async Task BerhentiAsync()
    {
        try
        {
            _batal?.Cancel();
        }
        catch
        {
            /* diabaikan */
        }
        try
        {
            _pendengar?.Stop();
        }
        catch
        {
            /* diabaikan */
        }
        if (_tugas is not null)
        {
            try
            {
                await Task.WhenAny(_tugas, Task.Delay(1500)).ConfigureAwait(false);
            }
            catch
            {
                /* diabaikan */
            }
        }
        try
        {
            _pendengar?.Server?.Close();
        }
        catch
        {
            /* diabaikan */
        }
    }

    /* Pembaca baris & badan dengan penyangga kecil per sambungan. */
    private sealed class PembacaHttp
    {
        private readonly Stream _aliran;
        private readonly byte[] _penyangga = new byte[8192];
        private int _posisi;
        private int _panjang;

        public PembacaHttp(Stream aliran) => _aliran = aliran;

        private async ValueTask<int> BacaByteAsync(CancellationToken batal)
        {
            if (_posisi >= _panjang)
            {
                _panjang = await _aliran.ReadAsync(_penyangga, batal);
                _posisi = 0;
                if (_panjang <= 0) return -1;
            }
            return _penyangga[_posisi++];
        }

        public async Task<string?> BacaBarisAsync(CancellationToken batal)
        {
            var sb = new StringBuilder(128);
            while (true)
            {
                var b = await BacaByteAsync(batal);
                if (b < 0) return sb.Length > 0 ? sb.ToString() : null;
                if (b == '\n')
                {
                    if (sb.Length > 0 && sb[^1] == '\r') sb.Length--;
                    return sb.ToString();
                }
                if (sb.Length > 65536) return null;
                sb.Append((char)b);
            }
        }

        public async Task<byte[]> BacaTepatAsync(int jumlah, CancellationToken batal)
        {
            var hasil = new byte[jumlah];
            var terisi = 0;

            while (terisi < jumlah && _posisi < _panjang)
            {
                hasil[terisi++] = _penyangga[_posisi++];
            }
            while (terisi < jumlah)
            {
                var baca = await _aliran.ReadAsync(hasil.AsMemory(terisi, jumlah - terisi), batal);
                if (baca <= 0) throw new IOException("Badan permintaan terpotong.");
                terisi += baca;
            }
            return hasil;
        }
    }
}
