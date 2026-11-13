using System.Collections.Concurrent;
using System.IO;
using System.Text;
using System.Threading;
using KumiDeck.Core;
using KumiDeck.Data;

namespace KumiDeck.Server;

public sealed class KlienSse
{
    private readonly SemaphoreSlim _kunci = new(1, 1);

    public Guid Id { get; } = Guid.NewGuid();
    public Stream Aliran { get; }
    public string DeviceId { get; init; } = "";
    public string Platform { get; init; } = "desktop";
    public string Nama { get; init; } = "";

    public KlienSse(Stream aliran) => Aliran = aliran;

    public async Task<bool> KirimAsync(string peristiwa, string dataJson)
    {
        var isi = Encoding.UTF8.GetBytes("event: " + peristiwa + "\ndata: " + dataJson + "\n\n");
        await _kunci.WaitAsync();
        try
        {
            await Aliran.WriteAsync(isi);
            await Aliran.FlushAsync();
            return true;
        }
        catch
        {
            return false;
        }
        finally
        {
            _kunci.Release();
        }
    }

    public async Task<bool> KomentarAsync(string teks)
    {
        var isi = Encoding.UTF8.GetBytes(": " + teks + "\n\n");
        await _kunci.WaitAsync();
        try
        {
            await Aliran.WriteAsync(isi);
            await Aliran.FlushAsync();
            return true;
        }
        catch
        {
            return false;
        }
        finally
        {
            _kunci.Release();
        }
    }
}

/* Kumpulan klien Server-Sent Events (UI desktop + perangkat Remote). */
public sealed class SseHub
{
    private readonly ConcurrentDictionary<Guid, KlienSse> _klien = new();

    public int Jumlah => _klien.Count;
    public IEnumerable<KlienSse> Semua => _klien.Values;

    public void Tambah(KlienSse klien) => _klien[klien.Id] = klien;
    public void Hapus(KlienSse klien) => _klien.TryRemove(klien.Id, out _);

    public void Siar(string peristiwa, object data)
    {
        var json = System.Text.Json.JsonSerializer.Serialize(data, Json.Ringkas);
        SiarJson(peristiwa, json);
    }

    public void SiarJson(string peristiwa, string json)
    {
        foreach (var klien in _klien.Values)
        {
            var k = klien;
            _ = Task.Run(async () =>
            {
                if (!await k.KirimAsync(peristiwa, json))
                {
                    _klien.TryRemove(k.Id, out _);
                }
            });
        }
    }

    public async Task SiarAsync(string peristiwa, object data)
    {
        var json = System.Text.Json.JsonSerializer.Serialize(data, Json.Ringkas);
        var tugas = _klien.Values.Select(async k =>
        {
            if (!await k.KirimAsync(peristiwa, json)) _klien.TryRemove(k.Id, out _);
        });
        await Task.WhenAll(tugas);
    }

    public void TutupSemua()
    {
        foreach (var klien in _klien.Values)
        {
            try
            {
                klien.Aliran.Flush();
            }
            catch
            {
                /* diabaikan */
            }
        }
        _klien.Clear();
    }
}
