using System.Runtime.InteropServices;

namespace KumiDeck.Audio;

public readonly record struct MicState(bool Ok, bool Mute, int Volume, string? Pesan);

/* Kontrol mikrofon (endpoint tangkap default) lewat Windows Core Audio.
   dataFlow 1 (capture) dan role eConsole 1, sama seperti versi lama. */
public static class MicControl
{
    private static readonly Guid ClsidEnumerator = new("BCDE0395-E52F-467C-8E3D-C4579291692E");
    private const int DataFlowTangkap = 1;
    private const int RoleKonsol = 1;

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
        [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
        [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
        [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr client);
        [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr client);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, uint clsCtx, IntPtr activationParams,
            [MarshalAs(UnmanagedType.IUnknown)] out object iface);
        [PreserveSig] int OpenPropertyStore(uint access, out IntPtr store);
        [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig] int GetState(out int state);
    }

    [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioEndpointVolume
    {
        [PreserveSig] int RegisterControlChangeNotify(IntPtr notify);
        [PreserveSig] int UnregisterControlChangeNotify(IntPtr notify);
        [PreserveSig] int GetChannelCount(out uint count);
        [PreserveSig] int SetMasterVolumeLevel(float level, Guid ctx);
        [PreserveSig] int SetMasterVolumeLevelScalar(float level, Guid ctx);
        [PreserveSig] int GetMasterVolumeLevel(out float level);
        [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
        [PreserveSig] int SetChannelVolumeLevel(uint ch, float level, Guid ctx);
        [PreserveSig] int SetChannelVolumeLevelScalar(uint ch, float level, Guid ctx);
        [PreserveSig] int GetChannelVolumeLevel(uint ch, out float level);
        [PreserveSig] int GetChannelVolumeLevelScalar(uint ch, out float level);
        [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, Guid ctx);
        [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
        [PreserveSig] int GetVolumeStepInfo(out uint step, out uint count);
        [PreserveSig] int VolumeStepUp(Guid ctx);
        [PreserveSig] int VolumeStepDown(Guid ctx);
    }

    public static MicState Baca()
    {
        return Jalankan(vol => BacaDari(vol), "Mikrofon tidak dapat dibaca.");
    }

    public static MicState Atur(string mode)
    {
        var pilihan = (mode ?? "").Trim().ToLowerInvariant();
        if (pilihan != "togel" && pilihan != "senyap" && pilihan != "nyala")
            return Gagal("Mode mikrofon tidak dikenal.");

        return Jalankan(vol =>
        {
            if (pilihan == "togel")
            {
                if (vol.GetMute(out var mute) < 0) return Gagal("Mikrofon tidak dapat dibaca.");
                if (vol.SetMute(!mute, Guid.Empty) < 0) return Gagal("Mikrofon tidak dapat diubah.");
            }
            else if (vol.SetMute(pilihan == "senyap", Guid.Empty) < 0)
            {
                return Gagal("Mikrofon tidak dapat diubah.");
            }
            return BacaDari(vol);
        }, "Mikrofon tidak dapat diubah.");
    }

    /* HRESULT >= 0 dianggap berhasil: SetMute mengembalikan S_FALSE (1) bila
       nilai yang diminta sama dengan nilai sekarang. */
    private static MicState Jalankan(Func<IAudioEndpointVolume, MicState> kerja, string pesanGalat)
    {
        IAudioEndpointVolume? vol = null;
        try
        {
            vol = BukaEndpoint();
            if (vol == null) return Gagal("Mikrofon tidak tersedia di sistem ini.");
            return kerja(vol);
        }
        catch
        {
            return Gagal(pesanGalat);
        }
        finally
        {
            Lepas(vol);
        }
    }

    private static MicState BacaDari(IAudioEndpointVolume vol)
    {
        if (vol.GetMute(out var mute) < 0) return Gagal("Mikrofon tidak dapat dibaca.");
        if (vol.GetMasterVolumeLevelScalar(out var level) < 0) return Gagal("Mikrofon tidak dapat dibaca.");
        return new MicState(true, mute, (int)Math.Round(level * 100.0), null);
    }

    /* Enumerator dan perangkat dilepas di sini; endpoint volume tetap hidup
       karena memegang referensinya sendiri. */
    private static IAudioEndpointVolume? BukaEndpoint()
    {
        object? objekEnumerator = null;
        object? objekPerangkat = null;
        try
        {
            var tipe = Type.GetTypeFromCLSID(ClsidEnumerator);
            if (tipe == null) return null;
            objekEnumerator = Activator.CreateInstance(tipe);
            if (objekEnumerator is not IMMDeviceEnumerator enumerator) return null;

            if (enumerator.GetDefaultAudioEndpoint(DataFlowTangkap, RoleKonsol, out var perangkat) < 0)
                return null;
            if (perangkat == null) return null;
            objekPerangkat = perangkat;

            var iid = typeof(IAudioEndpointVolume).GUID;
            if (perangkat.Activate(ref iid, 0, IntPtr.Zero, out var iface) < 0) return null;
            return iface as IAudioEndpointVolume;
        }
        finally
        {
            Lepas(objekPerangkat);
            Lepas(objekEnumerator);
        }
    }

    private static MicState Gagal(string pesan) => new(false, false, 0, pesan);

    private static void Lepas(object? obj)
    {
        if (obj == null) return;
        try
        {
            if (Marshal.IsComObject(obj)) Marshal.ReleaseComObject(obj);
        }
        catch
        {
            /* diabaikan */
        }
    }
}
