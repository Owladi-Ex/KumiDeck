using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using KumiDeck.Core;

namespace KumiDeck.Platform;

/* Sertifikat HTTPS buatan sendiri untuk mode Remote PWA (KD_HTTPS=1).

   Perangkat Remote hanya perlu memasang kumideck.cer sekali; berkas PFX
   disimpan di data/tls supaya sertifikatnya tetap sama antar jalankan. */
public sealed class TlsMaterial
{
    private const string Sandi = "kumideck";

    public X509Certificate2 Sertifikat { get; }
    public string BerkasCer { get; }
    public string BerkasPfx { get; }

    private TlsMaterial(X509Certificate2 sertifikat, string cer, string pfx)
    {
        Sertifikat = sertifikat;
        BerkasCer = cer;
        BerkasPfx = pfx;
    }

    public static TlsMaterial? Siapkan(string folder, string alamatLan, string namaMesin)
    {
        try
        {
            Directory.CreateDirectory(folder);
            var pfx = Path.Combine(folder, "kumideck.pfx");
            var cer = Path.Combine(folder, "kumideck.cer");

            if (File.Exists(pfx))
            {
                try
                {
                    var lama = X509CertificateLoader.LoadPkcs12FromFile(pfx, Sandi, X509KeyStorageFlags.Exportable);
                    if (lama.HasPrivateKey && lama.NotAfter > DateTime.Now.AddDays(30))
                    {
                        TulisCer(lama, cer);
                        return new TlsMaterial(lama, cer, pfx);
                    }
                }
                catch
                {
                    /* buat sertifikat baru */
                }
            }

            var baru = Buat(alamatLan, namaMesin);
            var isiPfx = baru.Export(X509ContentType.Pfx, Sandi);
            File.WriteAllBytes(pfx, isiPfx);

            var dimuat = X509CertificateLoader.LoadPkcs12(isiPfx, Sandi, X509KeyStorageFlags.Exportable);
            TulisCer(dimuat, cer);
            Log.Info("sertifikat HTTPS dibuat untuk " + alamatLan);
            return new TlsMaterial(dimuat, cer, pfx);
        }
        catch (Exception ex)
        {
            Log.Warn("sertifikat HTTPS gagal disiapkan: " + ex.Message);
            return null;
        }
    }

    private static void TulisCer(X509Certificate2 sertifikat, string berkas)
    {
        try
        {
            File.WriteAllBytes(berkas, sertifikat.Export(X509ContentType.Cert));
        }
        catch (Exception ex)
        {
            Log.Warn("kumideck.cer tidak dapat ditulis: " + ex.Message);
        }
    }

    private static X509Certificate2 Buat(string alamatLan, string namaMesin)
    {
        using var rsa = RSA.Create(2048);
        var nama = string.IsNullOrWhiteSpace(namaMesin) ? "KumiDeck" : namaMesin.Trim();
        var permintaan = new CertificateRequest(
            "CN=KumiDeck (" + nama + ")",
            rsa,
            HashAlgorithmName.SHA256,
            RSASignaturePadding.Pkcs1);

        permintaan.CertificateExtensions.Add(
            new X509BasicConstraintsExtension(false, false, 0, true));
        permintaan.CertificateExtensions.Add(
            new X509KeyUsageExtension(
                X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment,
                true));
        permintaan.CertificateExtensions.Add(
            new X509EnhancedKeyUsageExtension(
                new OidCollection { new Oid("1.3.6.1.5.5.7.3.1") },
                false));
        permintaan.CertificateExtensions.Add(
            new X509SubjectKeyIdentifierExtension(permintaan.PublicKey, false));

        var san = new SubjectAlternativeNameBuilder();
        san.AddDnsName("localhost");
        san.AddIpAddress(IPAddress.Loopback);
        san.AddIpAddress(IPAddress.IPv6Loopback);
        if (nama.Length > 0 && nama.All(c => char.IsLetterOrDigit(c) || c is '-' or '.' or '_'))
        {
            try
            {
                san.AddDnsName(nama);
            }
            catch
            {
                /* nama mesin tidak sah untuk DNS */
            }
        }
        if (IPAddress.TryParse(alamatLan, out var ip) && !IPAddress.IsLoopback(ip))
        {
            san.AddIpAddress(ip);
        }
        permintaan.CertificateExtensions.Add(san.Build());

        var sertifikat = permintaan.CreateSelfSigned(
            DateTimeOffset.Now.AddDays(-1),
            DateTimeOffset.Now.AddYears(5));

        /* Muat ulang lewat PFX agar kunci privat pasti bisa dipakai SslStream. */
        var isi = sertifikat.Export(X509ContentType.Pfx, Sandi);
        sertifikat.Dispose();
        return X509CertificateLoader.LoadPkcs12(isi, Sandi, X509KeyStorageFlags.Exportable);
    }
}
