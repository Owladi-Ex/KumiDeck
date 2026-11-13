using System.Runtime.InteropServices;
using System.Threading;

namespace KumiDeck.Actions;

/* Pengirim tombol native (pengganti skrip keybd_event PowerShell).
   Memakai SendInput agar pintasan, teks Unicode, dan tombol media bekerja
   seperti keyboard fisik. */
internal static class Keys
{
    private const uint INPUT_KEYBOARD = 1;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const uint KEYEVENTF_UNICODE = 0x0004;

    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT
    {
        public uint type;
        public InputUnion U;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint jumlah, INPUT[] masukan, int ukuran);

    private static readonly Dictionary<string, ushort> Vk = new(StringComparer.OrdinalIgnoreCase)
    {
        ["ctrl"] = 0x11, ["control"] = 0x11,
        ["shift"] = 0x10,
        ["alt"] = 0x12,
        ["win"] = 0x5B, ["windows"] = 0x5B, ["meta"] = 0x5B,
        ["enter"] = 0x0D, ["return"] = 0x0D,
        ["tab"] = 0x09,
        ["esc"] = 0x1B, ["escape"] = 0x1B,
        ["space"] = 0x20,
        ["backspace"] = 0x08,
        ["del"] = 0x2E, ["delete"] = 0x2E,
        ["insert"] = 0x2D, ["ins"] = 0x2D,
        ["home"] = 0x24, ["end"] = 0x23,
        ["pageup"] = 0x21, ["pagedown"] = 0x22,
        ["up"] = 0x26, ["down"] = 0x28, ["left"] = 0x25, ["right"] = 0x27,
        ["printscreen"] = 0x2C,
        ["capslock"] = 0x14, ["numlock"] = 0x90, ["scrolllock"] = 0x91,
        ["pause"] = 0x13, ["apps"] = 0x5D,
        ["volumeup"] = 0xAF, ["volumedown"] = 0xAE, ["volumemute"] = 0xAD,
        ["playpause"] = 0xB3, ["nexttrack"] = 0xB0, ["prevtrack"] = 0xB1,
        ["stopmedia"] = 0xB2,
        ["numpadplus"] = 0x6B, ["numpadminus"] = 0x6D,
        ["numpadmultiply"] = 0x6A, ["numpaddivide"] = 0x6F, ["numpaddecimal"] = 0x6E,
    };

    private static readonly HashSet<string> Pengubah = new(StringComparer.OrdinalIgnoreCase)
    {
        "ctrl", "control", "shift", "alt", "win", "windows", "meta",
    };

    public static ushort? VkUntuk(string nama)
    {
        var kunci = (nama ?? "").Trim().ToLowerInvariant();
        if (kunci.Length == 0) return null;
        if (Vk.TryGetValue(kunci, out var tepat)) return tepat;

        if (kunci.Length is 2 or 3 && kunci[0] == 'f' && kunci[1..].All(char.IsDigit) &&
            int.TryParse(kunci[1..], out var nomor) && nomor is >= 1 and <= 24)
        {
            return (ushort)(0x6F + nomor);
        }
        if (kunci.Length == 1)
        {
            var c = char.ToUpperInvariant(kunci[0]);
            if (c is >= 'A' and <= 'Z' or >= '0' and <= '9') return c;
        }
        if (kunci.StartsWith("numpad", StringComparison.Ordinal) &&
            kunci.Length == 7 && char.IsDigit(kunci[6]))
        {
            return (ushort)(0x60 + (kunci[6] - '0'));
        }
        return null;
    }

    private static INPUT Turun(ushort vk, ushort pindai, uint bendera)
    {
        return new INPUT
        {
            type = INPUT_KEYBOARD,
            U = new InputUnion
            {
                ki = new KEYBDINPUT
                {
                    wVk = vk,
                    wScan = pindai,
                    dwFlags = bendera,
                    time = 0,
                    dwExtraInfo = IntPtr.Zero,
                },
            },
        };
    }

    private static bool Kirim(params INPUT[] masukan)
    {
        if (masukan.Length == 0) return true;
        var terkirim = SendInput((uint)masukan.Length, masukan, Marshal.SizeOf<INPUT>());
        return terkirim == masukan.Length;
    }

    private static void TekanVk(ushort kode, bool lepas)
    {
        Kirim(Turun(kode, 0, lepas ? KEYEVENTF_KEYUP : 0));
    }

    /* Pecah "ctrl+shift+m" menjadi daftar pengubah + satu tombol utama. */
    public static (bool Ok, ushort[] Mods, ushort Kunci, string Pesan) UraiCombo(string combo)
    {
        var bagian = (combo ?? "")
            .Split('+')
            .Select(s => s.Trim())
            .Where(s => s.Length > 0)
            .ToList();

        if (bagian.Count == 0) return (false, Array.Empty<ushort>(), 0, "Pintasan kosong.");

        var mods = new List<ushort>();
        var sisa = new List<ushort>();
        foreach (var nama in bagian)
        {
            var vk = VkUntuk(nama);
            if (vk is null) return (false, Array.Empty<ushort>(), 0, "Tombol tidak dikenal: " + nama);
            if (Pengubah.Contains(nama)) mods.Add(vk.Value);
            else sisa.Add(vk.Value);
        }

        if (sisa.Count != 1) return (false, Array.Empty<ushort>(), 0, "Pintasan harus punya tepat satu tombol utama.");
        if (mods.Count > 3) return (false, Array.Empty<ushort>(), 0, "Terlalu banyak tombol pengubah.");
        return (true, mods.ToArray(), sisa[0], "");
    }

    public static (bool Ok, string Pesan) KirimCombo(string combo)
    {
        var urai = UraiCombo(combo);
        if (!urai.Ok) return (false, urai.Pesan);

        foreach (var mod in urai.Mods)
        {
            TekanVk(mod, false);
            Thread.Sleep(20);
        }

        TekanVk(urai.Kunci, false);
        Thread.Sleep(30);
        TekanVk(urai.Kunci, true);

        for (var i = urai.Mods.Length - 1; i >= 0; i--)
        {
            TekanVk(urai.Mods[i], true);
            Thread.Sleep(10);
        }

        return (true, "Pintasan dikirim: " + combo);
    }

    public static (bool Ok, string Pesan) KirimVk(ushort kode)
    {
        TekanVk(kode, false);
        Thread.Sleep(40);
        TekanVk(kode, true);
        return (true, "");
    }

    /* Kirim teks apa adanya (Unicode), termasuk huruf beraksen dan emoji dasar. */
    public static (bool Ok, string Pesan) KetikTeks(string teks)
    {
        if (string.IsNullOrEmpty(teks)) return (false, "Teks kosong.");

        /* Beri waktu fokus berpindah ke jendela tujuan. */
        Thread.Sleep(120);

        var daftar = new List<INPUT>(teks.Length * 2);
        foreach (var c in teks)
        {
            if (c is '\r' or '\n')
            {
                daftar.Add(Turun(0x0D, 0, 0));
                daftar.Add(Turun(0x0D, 0, KEYEVENTF_KEYUP));
                continue;
            }
            if (c == '\t')
            {
                daftar.Add(Turun(0x09, 0, 0));
                daftar.Add(Turun(0x09, 0, KEYEVENTF_KEYUP));
                continue;
            }

            daftar.Add(Turun(0, c, KEYEVENTF_UNICODE));
            daftar.Add(Turun(0, c, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP));
        }

        var ok = true;
        for (var i = 0; i < daftar.Count; i += 32)
        {
            var potong = daftar.Skip(i).Take(32).ToArray();
            ok &= Kirim(potong);
            Thread.Sleep(4);
        }

        return ok ? (true, "Teks dikirim.") : (false, "Teks tidak dapat dikirim.");
    }
}

