using System.Text.Json;
using KumiDeck.Audio;
using KumiDeck.Data;
using KumiDeck.Platform;

namespace KumiDeck.Actions;

/* Konteks yang dibutuhkan aksi: daftar halaman, soundboard, dan port server
   (untuk mencegah aksi HTTP memanggil KumiDeck sendiri). */
public sealed record KonteksAksi(List<string> HalamanAda, List<SuaraItem> Soundboard, int Port);

public sealed record VolumeInfo(int? Persen, bool Mute);

public sealed record HasilAksi(bool Ok, string Message, string? Navigate = null, VolumeInfo? Volume = null);

/* Pelaksana aksi di komputer host (padanan server/actions.js tanpa PowerShell). */
public static class ActionRunner
{
    private const int KedalamanMaks = 6;

    public static string Ringkas(Aksi? aksi)
    {
        if (aksi is null) return "aksi kosong";
        switch (aksi.Type)
        {
            case "hotkey":
                return "Pintasan " + (aksi.Combo ?? "");
            case "teks":
                return "Mengetik \"" + (aksi.Text ?? "")[..Math.Min(24, (aksi.Text ?? "").Length)] + "\"";
            case "buka":
                return "Membuka " + (aksi.Target ?? "")[..Math.Min(40, (aksi.Target ?? "").Length)];
            case "http":
                return (aksi.Method ?? "GET") + " " + (aksi.Url ?? "")[..Math.Min(48, (aksi.Url ?? "").Length)];
            case "media":
                return "Media " + (aksi.Cmd ?? "");
            case "urutan":
                return "Urutan " + (aksi.Steps?.Count ?? 0) + " langkah";
            case "halaman":
                return "Pindah halaman";
            case "jendela":
                return "Jendela: " + (aksi.Cmd ?? "");
            case "daya":
                return "Daya: " + (aksi.Cmd ?? "");
            case "volume":
                return aksi.Mode == "set" ? "Volume " + (aksi.Nilai ?? 50) + "%" : "Volume: " + (aksi.Mode ?? "");
            case "mic":
                return "Mikrofon: " + (aksi.Cmd ?? "togel");
            case "suara":
                return "Suara: " + (aksi.SoundId ?? "");
            case "kondisional":
            {
                var syarat = aksi.Syarat;
                var nama = syarat is null
                    ? ""
                    : !string.IsNullOrWhiteSpace(syarat.Proses) ? syarat.Proses : syarat.Jendela ?? "";
                var cocok = WindowWatcher.CocokSyarat(syarat);
                return "Bila " + nama + ": " + (cocok ? "ya" : "tidak");
            }
            default:
                return aksi.Type;
        }
    }

    public static async Task<HasilAksi> JalankanAsync(Aksi? aksi, KonteksAksi konteks, int kedalaman = 0)
    {
        if (aksi is null || aksi.Type == "kosong")
        {
            return new HasilAksi(false, "Tombol belum diatur.");
        }
        if (kedalaman > KedalamanMaks)
        {
            return new HasilAksi(false, "Aksi terlalu bertingkat.");
        }

        switch (aksi.Type)
        {
            case "jendela":
            {
                var hasil = WindowActions.Jalankan(aksi.Cmd);
                return new HasilAksi(hasil.Ok, hasil.Pesan);
            }

            case "daya":
            {
                var hasil = PowerActions.Jalankan(aksi.Cmd);
                return new HasilAksi(hasil.Ok, hasil.Pesan);
            }

            case "volume":
                return VolumeDari(aksi);

            case "mic":
            {
                var hasil = await Task.Run(() => MicControl.Atur(aksi.Cmd ?? "togel"));
                if (!hasil.Ok) return new HasilAksi(false, hasil.Pesan ?? "Mikrofon tidak dapat diubah.");
                return new HasilAksi(true, hasil.Mute ? "Mikrofon disenyapkan." : "Mikrofon aktif.");
            }

            case "suara":
            {
                var item = konteks.Soundboard.FirstOrDefault(s => s.Id == aksi.SoundId);
                if (item is null) return new HasilAksi(false, "Suara tidak ditemukan di soundboard.");

                try
                {
                    var hasil = await SoundBoard.MainkanAsync(item.Sumber, item.Volume, item.PerangkatId);
                    var pesan = hasil.Ok
                        ? "Memutar \u201c" + item.Name + "\u201d." + (string.IsNullOrWhiteSpace(hasil.Pesan) ? "" : " " + hasil.Pesan)
                        : hasil.Pesan;
                    return new HasilAksi(hasil.Ok, pesan);
                }
                catch
                {
                    return new HasilAksi(false, "Pemutar suara tidak tersedia.");
                }
            }

            case "kondisional":
            {
                /* Versi Node punya bug (variabel `cocok` tidak ada); di sini
                   syarat dievaluasi dengan benar. */
                var cocok = WindowWatcher.CocokSyarat(aksi.Syarat);
                var dipakai = cocok ? aksi.Aktif : aksi.TidakAktif;
                if (dipakai is null || dipakai.Type == "kosong")
                {
                    return new HasilAksi(
                        false,
                        "Syarat " + (cocok ? "terpenuhi" : "tidak terpenuhi") + " dan aksi cadangannya kosong.");
                }

                var hasil = await JalankanAsync(dipakai, konteks, kedalaman + 1);
                return new HasilAksi(
                    hasil.Ok,
                    (cocok ? "[aktif] " : "[tidak aktif] ") + hasil.Message,
                    hasil.Navigate,
                    hasil.Volume);
            }

            case "hotkey":
            {
                var hasil = await Task.Run(() => Keys.KirimCombo(aksi.Combo ?? ""));
                return new HasilAksi(hasil.Ok, hasil.Ok ? "Pintasan dikirim: " + aksi.Combo : hasil.Pesan);
            }

            case "teks":
            {
                var hasil = await Task.Run(() => Keys.KetikTeks(aksi.Text ?? ""));
                return new HasilAksi(hasil.Ok, hasil.Ok ? "Teks dikirim." : hasil.Pesan);
            }

            case "buka":
            {
                var hasil = Launch.Buka(aksi.Target);
                return new HasilAksi(hasil.Ok, hasil.Pesan);
            }

            case "http":
            {
                var hasil = await HttpAction.JalankanAsync(aksi, konteks.Port);
                return new HasilAksi(hasil.Ok, hasil.Pesan);
            }

            case "media":
            {
                /* Volume & senyap memakai Core Audio supaya nilainya bisa dilaporkan. */
                if (aksi.Cmd is "volup" or "voldown" or "mute")
                {
                    return VolumeDari(new Aksi
                    {
                        Type = "volume",
                        Cmd = aksi.Cmd,
                        Mode = aksi.Cmd switch
                        {
                            "volup" => "naik",
                            "voldown" => "turun",
                            _ => "mute",
                        },
                    });
                }

                var vk = aksi.Cmd switch
                {
                    "playpause" => (ushort)0xB3,
                    "next" => (ushort)0xB0,
                    "prev" => (ushort)0xB1,
                    _ => (ushort)0,
                };
                if (vk == 0) return new HasilAksi(false, "Perintah media tidak dikenal.");

                var hasil = await Task.Run(() => Keys.KirimVk(vk));
                return new HasilAksi(hasil.Ok, hasil.Ok ? "Media: " + aksi.Cmd : hasil.Pesan);
            }

            case "halaman":
            {
                if (string.IsNullOrWhiteSpace(aksi.PageId) || !konteks.HalamanAda.Contains(aksi.PageId!))
                {
                    return new HasilAksi(false, "Halaman tujuan tidak ditemukan.");
                }
                return new HasilAksi(true, "Pindah halaman.", aksi.PageId);
            }

            case "urutan":
            {
                var catatan = new List<string>();
                foreach (var langkah in aksi.Steps ?? new List<Langkah>())
                {
                    if (langkah.Delay > 0) await Task.Delay(Math.Clamp(langkah.Delay, 0, 5000));

                    var hasil = await JalankanAsync(langkah.Action, konteks, kedalaman + 1);
                    catatan.Add((hasil.Ok ? "ok: " : "gagal: ") + Ringkas(langkah.Action));

                    if (!string.IsNullOrEmpty(hasil.Navigate))
                    {
                        return new HasilAksi(true, string.Join(", ", catatan), hasil.Navigate, hasil.Volume);
                    }
                }
                if (catatan.Count == 0) return new HasilAksi(false, "Urutan tidak berisi langkah.");
                return new HasilAksi(true, "Urutan selesai (" + catatan.Count + " langkah).");
            }

            default:
                return new HasilAksi(false, "Jenis aksi tidak dikenal.");
        }
    }

    private static HasilAksi VolumeDari(Aksi aksi)
    {
        var mode = aksi.Mode;
        if (string.IsNullOrWhiteSpace(mode))
        {
            mode = aksi.Cmd switch
            {
                "volup" => "naik",
                "voldown" => "turun",
                "mute" => "mute",
                _ => "baca",
            };
        }

        VolumeState hasil = mode switch
        {
            "naik" => VolumeControl.Naik(),
            "turun" => VolumeControl.Turun(),
            "mute" => VolumeControl.ToggleMute(),
            "set" => VolumeControl.Set(aksi.Nilai ?? 50),
            _ => VolumeControl.Baca(),
        };

        if (!hasil.Ok) return new HasilAksi(false, hasil.Alasan ?? "Kontrol volume gagal.");

        var persen = (int?)hasil.Volume;
        var pesan = hasil.Mute ? "Volume " + persen + "% (senyap)" : "Volume " + persen + "%";
        return new HasilAksi(true, pesan, null, new VolumeInfo(persen, hasil.Mute));
    }
}
