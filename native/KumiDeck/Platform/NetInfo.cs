using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace KumiDeck.Platform;

/* Alamat LAN mesin ini, dipakai untuk tautan Remote dan pemeriksaan Host. */
public static class NetInfo
{
    private static readonly string[] Prioritas =
    {
        "192.168.", "10.", "172.16.", "172.17.", "172.18.", "172.19.",
    };

    public static string AlamatLan()
    {
        try
        {
            var calon = new List<(string Ip, string Nama)>();
            foreach (var antarmuka in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (antarmuka.OperationalStatus != OperationalStatus.Up) continue;
                if (antarmuka.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                foreach (var info in antarmuka.GetIPProperties().UnicastAddresses)
                {
                    if (info.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                    if (IPAddress.IsLoopback(info.Address)) continue;
                    calon.Add((info.Address.ToString(), antarmuka.Name));
                }
            }

            calon.Sort((a, b) =>
            {
                var pa = Array.FindIndex(Prioritas, p => a.Ip.StartsWith(p, StringComparison.Ordinal));
                var pb = Array.FindIndex(Prioritas, p => b.Ip.StartsWith(p, StringComparison.Ordinal));
                return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
            });

            return calon.Count > 0 ? calon[0].Ip : "127.0.0.1";
        }
        catch
        {
            return "127.0.0.1";
        }
    }

    public static string NamaMesin()
    {
        try
        {
            return Environment.MachineName;
        }
        catch
        {
            return "";
        }
    }
}
