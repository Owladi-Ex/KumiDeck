using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace KumiDeck.Platform;

/* Kumpulan P/Invoke Windows yang dipakai beberapa modul. */
internal static class Native
{
    public const int SW_HIDE = 0;
    public const int SW_SHOW = 5;
    public const int SW_MAXIMIZE = 3;
    public const int SW_MINIMIZE = 6;
    public const int SW_RESTORE = 9;

    public const uint SWP_NOSIZE = 0x0001;
    public const uint SWP_NOMOVE = 0x0002;
    public const uint SWP_NOZORDER = 0x0004;
    public const uint SWP_NOACTIVATE = 0x0010;
    public const uint SWP_SHOWWINDOW = 0x0040;

    public const uint MONITOR_DEFAULTTONEAREST = 2;

    public const int WM_NCLBUTTONDOWN = 0x00A1;
    public const int HTCAPTION = 2;

    [DllImport("user32.dll")]
    public static extern bool ReleaseCapture();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr SendMessage(IntPtr hWnd, int pesan, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("dwmapi.dll")]
    public static extern int DwmSetWindowAttribute(IntPtr hWnd, int atribut, ref int nilai, int ukuran);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder teks, int maks);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr FindWindowW(string? kelas, string? judul);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);

    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr sisip, int x, int y, int cx, int cy, uint bendera);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT kotak);

    [DllImport("user32.dll")]
    public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint bendera);

    [DllImport("user32.dll")]
    public static extern bool GetMonitorInfoW(IntPtr monitor, ref MONITORINFO info);

    [DllImport("user32.dll")]
    public static extern bool LockWorkStation();

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte kode, byte pindai, uint bendera, UIntPtr info);

    [DllImport("powrprof.dll", SetLastError = true)]
    public static extern bool SetSuspendState(bool hibernasi, bool paksa, bool nonaktifkanAcara);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT
    {
        public int Kiri;
        public int Atas;
        public int Kanan;
        public int Bawah;

        public int Lebar => Kanan - Kiri;
        public int Tinggi => Bawah - Atas;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct MONITORINFO
    {
        public int Ukuran;
        public RECT Monitor;
        public RECT Kerja;
        public uint Bendera;
    }

    public static string JudulJendela(IntPtr hwnd)
    {
        var teks = new StringBuilder(512);
        var panjang = GetWindowTextW(hwnd, teks, teks.Capacity);
        return panjang > 0 ? teks.ToString() : "";
    }

    public static string NamaProses(uint pid)
    {
        if (pid == 0) return "";
        try
        {
            using var proses = Process.GetProcessById((int)pid);
            return proses.ProcessName;
        }
        catch
        {
            return "";
        }
    }

    public static MONITORINFO InfoMonitor(IntPtr hwnd)
    {
        var info = new MONITORINFO { Ukuran = Marshal.SizeOf<MONITORINFO>() };
        var monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        if (monitor != IntPtr.Zero) GetMonitorInfoW(monitor, ref info);
        return info;
    }

    internal static void TampilkanJendelaKumiDeck()
    {
        var h = FindWindowW(null, "KumiDeck");
        if (h == IntPtr.Zero) return;
        ShowWindow(h, SW_RESTORE);
        SetForegroundWindow(h);
    }
}
