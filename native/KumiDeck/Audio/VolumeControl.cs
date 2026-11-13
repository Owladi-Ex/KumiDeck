using System.Runtime.InteropServices;

namespace KumiDeck.Audio;

public readonly record struct VolumeState(bool Ok, int Volume, bool Mute, string? Alasan);

/* Kontrol volume sistem lewat Windows Core Audio (IAudioEndpointVolume).
   Endpoint keluaran default (dataFlow 0, role eConsole 1) dibuka baru tiap
   panggilan supaya tidak ada objek COM yang menggantung. */
public static class VolumeControl
{
    private static readonly Guid ClsidEnumerator = new("BCDE0395-E52F-467C-8E3D-C4579291692E");
    private const int DataFlowKeluaran = 0;
    private const int RoleKonsol = 1;
    private const int JumlahLangkah = 2;

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

    public static VolumeState Baca()
    {
        return Jalankan(vol => BacaDari(vol), "Kontrol volume tidak dapat dibaca.");
    }

    public static VolumeState Naik()
    {
        return Jalankan(vol =>
        {
            for (var i = 0; i < JumlahLangkah; i++) vol.VolumeStepUp(Guid.Empty);
            return BacaDari(vol);
        }, "Kontrol volume tidak dapat diubah.");
    }

    public static VolumeState Turun()
    {
        return Jalankan(vol =>
        {
            for (var i = 0; i < JumlahLangkah; i++) vol.VolumeStepDown(Guid.Empty);
            return BacaDari(vol);
        }, "Kontrol volume tidak dapat diubah.");
    }

    public static VolumeState Set(int persen)
    {
        return Jalankan(vol =>
        {
            /* Nilai 0-100 dipetakan ke skalar 0.0-1.0. */
            var nilai = Math.Clamp(persen, 0, 100) / 100f;
            if (vol.SetMasterVolumeLevelScalar(nilai, Guid.Empty) < 0)
                return Gagal("Kontrol volume tidak dapat diubah.");
            return BacaDari(vol);
        }, "Kontrol volume tidak dapat diubah.");
    }

    public static VolumeState ToggleMute()
    {
        return Jalankan(vol =>
        {
            if (vol.GetMute(out var mute) < 0) return Gagal("Kontrol volume tidak dapat dibaca.");
            if (vol.SetMute(!mute, Guid.Empty) < 0) return Gagal("Kontrol volume tidak dapat diubah.");
            return BacaDari(vol);
        }, "Kontrol volume tidak dapat diubah.");
    }

    /* HRESULT >= 0 dianggap berhasil: SetMute/Set* mengembalikan S_FALSE (1)
       bila nilai yang diminta sama dengan nilai sekarang. */
    private static VolumeState Jalankan(Func<IAudioEndpointVolume, VolumeState> kerja, string pesanGalat)
    {
        IAudioEndpointVolume? vol = null;
        try
        {
            vol = BukaEndpoint();
            if (vol == null) return Gagal("Kontrol volume tidak tersedia di sistem ini.");
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

    private static VolumeState BacaDari(IAudioEndpointVolume vol)
    {
        if (vol.GetMasterVolumeLevelScalar(out var level) < 0)
            return Gagal("Kontrol volume tidak dapat dibaca.");
        if (vol.GetMute(out var mute) < 0)
            return Gagal("Kontrol volume tidak dapat dibaca.");
        return new VolumeState(true, (int)Math.Round(level * 100.0), mute, null);
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

            if (enumerator.GetDefaultAudioEndpoint(DataFlowKeluaran, RoleKonsol, out var perangkat) < 0)
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

    private static VolumeState Gagal(string alasan) => new(false, 0, false, alasan);

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
