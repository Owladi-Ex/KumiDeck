package id.kumideck.remote;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.ImageFormat;
import android.graphics.Matrix;
import android.graphics.SurfaceTexture;
import android.graphics.drawable.GradientDrawable;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.Image;
import android.media.ImageReader;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Vibrator;
import android.util.Size;
import android.view.Gravity;
import android.view.Surface;
import android.view.TextureView;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.PlanarYUVLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.HybridBinarizer;

import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/* Pemindai kode QR sederhana untuk layar alamat server.

   Memakai Camera2 + ImageReader (bidang Y dari YUV_420_888) dan decoder
   ZXing. Pratinjau ditampilkan di TextureView; bingkai dibaca paling cepat
   setiap 300 ms supaya baterai dan CPU tidak terbakar. Hasil pindaian
   dikirim ke pemanggil sebagai teks biasa, lalu MainActivity memutuskan
   apakah itu tautan /remote yang bisa dibuka. */
public class PemindaiQr implements TextureView.SurfaceTextureListener {

    public interface Pendengar {
        void padaHasil(String teks);

        void padaBatal();

        void padaGalat(String pesan);
    }

    private static final int KODE_IZIN = 71;
    private static final long JEDA_MIN_MS = 300;
    private static final String PREFS = "kumideck-remote";
    private static final String KEY_PUTAR = "putarKamera";

    private static final int WARNA_LATAR = 0xFF000000;
    private static final int WARNA_TEKS = 0xFFF4F4F0;
    private static final int WARNA_REDUP = 0xFF9A9AA2;
    private static final int WARNA_AKSEN = 0xFFD9F25B;

    private static final int ISI = ViewGroup.LayoutParams.MATCH_PARENT;
    private static final int BUNGKUS = ViewGroup.LayoutParams.WRAP_CONTENT;

    private final Activity aktivitas;
    private final Pendengar pendengar;
    private final FrameLayout akar;
    private final TextureView pratinjau;
    private final TextView pesan;
    private final MultiFormatReader pembaca = new MultiFormatReader();
    private final HandlerThread utas;
    private final Handler penangan;

    private CameraDevice kamera;
    private CameraCaptureSession sesi;
    private ImageReader pembacaGambar;
    private String idKamera;
    private int orientasiSensor;
    private Size ukuranPratinjau;
    private long terakhirDekode;
    private boolean sedangJalan;
    private boolean sudahSelesai;
    private boolean izinDiminta;
    private boolean transformTerpasang;

    /* Koreksi putar dari pengguna (kelipatan 90° ke kiri). Sebagian
       perangkat melaporkan orientasi sensor yang tidak cocok dengan
       pratinjau, jadi hasilnya bisa disesuaikan sekali dan diingat. */
    private int putarTambahan;

    public PemindaiQr(Activity aktivitas, Pendengar pendengar) {
        this.aktivitas = aktivitas;
        this.pendengar = pendengar;
        putarTambahan = aktivitas.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getInt(KEY_PUTAR, 0);

        utas = new HandlerThread("pindai-qr");
        utas.start();
        penangan = new Handler(utas.getLooper());

        Map<DecodeHintType, Object> petunjuk =
            new EnumMap<DecodeHintType, Object>(DecodeHintType.class);
        petunjuk.put(DecodeHintType.POSSIBLE_FORMATS,
            Collections.singletonList(BarcodeFormat.QR_CODE));
        petunjuk.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
        pembaca.setHints(petunjuk);

        akar = new FrameLayout(aktivitas);
        akar.setBackgroundColor(WARNA_LATAR);

        pratinjau = new TextureView(aktivitas);
        pratinjau.setSurfaceTextureListener(this);
        akar.addView(pratinjau, new FrameLayout.LayoutParams(ISI, ISI));

        View bingkai = new View(aktivitas);
        GradientDrawable garis = new GradientDrawable();
        garis.setColor(Color.TRANSPARENT);
        garis.setStroke(dp(2), WARNA_AKSEN);
        garis.setCornerRadius(dp(20));
        bingkai.setBackground(garis);
        akar.addView(bingkai,
            new FrameLayout.LayoutParams(dp(240), dp(240), Gravity.CENTER));

        LinearLayout kepala = new LinearLayout(aktivitas);
        kepala.setOrientation(LinearLayout.VERTICAL);
        kepala.setPadding(dp(18), dp(18), dp(18), dp(18));

        TextView judul = new TextView(aktivitas);
        judul.setText("Pindai kode QR");
        judul.setTextColor(WARNA_TEKS);
        judul.setTextSize(16);
        kepala.addView(judul);

        TextView putar = new TextView(aktivitas);
        putar.setText("↺ Putar kiri");
        putar.setTextColor(WARNA_AKSEN);
        putar.setTextSize(13);
        putar.setPadding(0, dp(10), 0, 0);
        putar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                putarKiri();
            }
        });
        kepala.addView(putar);

        akar.addView(kepala,
            new FrameLayout.LayoutParams(BUNGKUS, BUNGKUS, Gravity.TOP | Gravity.START));

        TextView tutup = new TextView(aktivitas);
        tutup.setText("Tutup");
        tutup.setTextColor(WARNA_AKSEN);
        tutup.setTextSize(15);
        tutup.setPadding(dp(18), dp(18), dp(18), dp(18));
        tutup.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                batal();
            }
        });
        akar.addView(tutup,
            new FrameLayout.LayoutParams(BUNGKUS, BUNGKUS, Gravity.TOP | Gravity.END));

        pesan = new TextView(aktivitas);
        pesan.setText("Arahkan kamera ke kode QR di layar komputer.");
        pesan.setTextColor(WARNA_TEKS);
        pesan.setTextSize(13);
        pesan.setGravity(Gravity.CENTER);
        pesan.setPadding(dp(24), dp(16), dp(24), dp(28));
        akar.addView(pesan,
            new FrameLayout.LayoutParams(ISI, BUNGKUS, Gravity.BOTTOM));

        TextView catatan = new TextView(aktivitas);
        catatan.setText("Kode QR di layar Remote komputer sudah memuat alamat dan kuncinya. Gambar miring? Tekan ↺ Putar kiri.");
        catatan.setTextColor(WARNA_REDUP);
        catatan.setTextSize(11);
        catatan.setGravity(Gravity.CENTER);
        catatan.setPadding(dp(24), 0, dp(24), dp(16));
        akar.addView(catatan,
            new FrameLayout.LayoutParams(ISI, BUNGKUS, Gravity.BOTTOM));
    }

    public View tampilan() {
        return akar;
    }

    /* ------------------------------------------------------------- kamera --- */

    public void mulai() {
        if (sudahSelesai) return;
        if (!izinAda()) {
            if (!izinDiminta) {
                izinDiminta = true;
                aktivitas.requestPermissions(
                    new String[]{Manifest.permission.CAMERA}, KODE_IZIN);
            }
            return;
        }
        if (!pratinjau.isAvailable()) return; /* menunggu permukaan siap */
        bukaKamera();
    }

    public boolean tanganiIzin(int kode, int[] hasil) {
        if (kode != KODE_IZIN) return false;
        if (hasil.length > 0 && hasil[0] == PackageManager.PERMISSION_GRANTED) {
            if (pratinjau.isAvailable()) bukaKamera();
        } else {
            pesan.setText("Izin kamera ditolak. Tempel tautan dari kode QR di layar alamat server.");
        }
        return true;
    }

    public void hentikan() {
        sedangJalan = false;
        if (sesi != null) {
            try {
                sesi.close();
            } catch (Exception e) {
                /* diabaikan */
            }
            sesi = null;
        }
        if (kamera != null) {
            try {
                kamera.close();
            } catch (Exception e) {
                /* diabaikan */
            }
            kamera = null;
        }
        if (pembacaGambar != null) {
            try {
                pembacaGambar.close();
            } catch (Exception e) {
                /* diabaikan */
            }
            pembacaGambar = null;
        }
    }

    public void batal() {
        if (sudahSelesai) return;
        sudahSelesai = true;
        hentikan();
        pendengar.padaBatal();
    }

    public void lepas() {
        sudahSelesai = true;
        hentikan();
        try {
            utas.quitSafely();
        } catch (Exception e) {
            /* diabaikan */
        }
    }

    private boolean izinAda() {
        return aktivitas.checkSelfPermission(Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED;
    }

    private void bukaKamera() {
        if (sedangJalan || kamera != null) return;
        CameraManager manajer =
            (CameraManager) aktivitas.getSystemService(Context.CAMERA_SERVICE);
        if (manajer == null) {
            gagal("Kamera tidak tersedia di perangkat ini.");
            return;
        }
        try {
            for (String id : manajer.getCameraIdList()) {
                CameraCharacteristics ciri = manajer.getCameraCharacteristics(id);
                Integer arah = ciri.get(CameraCharacteristics.LENS_FACING);
                if (arah != null && arah == CameraCharacteristics.LENS_FACING_BACK) {
                    idKamera = id;
                    break;
                }
                if (idKamera == null) idKamera = id;
            }
            if (idKamera == null) {
                gagal("Kamera tidak ditemukan.");
                return;
            }

            CameraCharacteristics ciri = manajer.getCameraCharacteristics(idKamera);
            Integer orientasi = ciri.get(CameraCharacteristics.SENSOR_ORIENTATION);
            orientasiSensor = orientasi == null ? 0 : orientasi;

            StreamConfigurationMap peta =
                ciri.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
            if (peta == null) {
                gagal("Kamera tidak mendukung pratinjau.");
                return;
            }

            Size[] ukuranYuv = peta.getOutputSizes(ImageFormat.YUV_420_888);
            Size[] ukuranPratinjauSemua = peta.getOutputSizes(SurfaceTexture.class);
            if (ukuranYuv == null || ukuranYuv.length == 0
                || ukuranPratinjauSemua == null || ukuranPratinjauSemua.length == 0) {
                gagal("Kamera tidak mendukung pembacaan gambar.");
                return;
            }

            Size yuv = pilihUkuran(ukuranYuv, 1280);
            ukuranPratinjau = pilihPratinjau(ukuranPratinjauSemua, yuv);

            SurfaceTexture tekstur = pratinjau.getSurfaceTexture();
            if (tekstur == null) {
                gagal("Pratinjau kamera belum siap.");
                return;
            }
            tekstur.setDefaultBufferSize(ukuranPratinjau.getWidth(), ukuranPratinjau.getHeight());

            pembacaGambar = ImageReader.newInstance(
                yuv.getWidth(), yuv.getHeight(), ImageFormat.YUV_420_888, 2);
            pembacaGambar.setOnImageAvailableListener(
                new ImageReader.OnImageAvailableListener() {
                    @Override
                    public void onImageAvailable(ImageReader pembaca) {
                        Image gambar;
                        try {
                            gambar = pembaca.acquireLatestImage();
                        } catch (Exception e) {
                            return;
                        }
                        if (gambar == null) return;
                        try {
                            proses(gambar);
                        } catch (Exception e) {
                            /* bingkai rusak: lanjut ke bingkai berikutnya */
                        } finally {
                            try {
                                gambar.close();
                            } catch (Exception e) {
                                /* diabaikan */
                            }
                        }
                    }
                }, penangan);

            sedangJalan = true;
            manajer.openCamera(idKamera, new CameraDevice.StateCallback() {
                @Override
                public void onOpened(CameraDevice kameraBaru) {
                    kamera = kameraBaru;
                    mulaiSesi();
                }

                @Override
                public void onDisconnected(CameraDevice kameraBaru) {
                    kameraBaru.close();
                    kamera = null;
                    sedangJalan = false;
                }

                @Override
                public void onError(CameraDevice kameraBaru, int kode) {
                    kameraBaru.close();
                    kamera = null;
                    sedangJalan = false;
                    gagal("Kamera berhenti (kode " + kode + "). Tutup aplikasi lain yang memakai kamera.");
                }
            }, penangan);
        } catch (CameraAccessException e) {
            sedangJalan = false;
            gagal("Kamera tidak dapat diakses. Tutup aplikasi lain yang memakainya.");
        } catch (SecurityException e) {
            sedangJalan = false;
            gagal("Izin kamera tidak diberikan.");
        } catch (Exception e) {
            sedangJalan = false;
            gagal("Kamera gagal disiapkan: " + e.getClass().getSimpleName() + ".");
        }
    }

    private void mulaiSesi() {
        if (kamera == null || pembacaGambar == null) return;
        try {
            SurfaceTexture tekstur = pratinjau.getSurfaceTexture();
            if (tekstur == null) return;
            tekstur.setDefaultBufferSize(ukuranPratinjau.getWidth(), ukuranPratinjau.getHeight());
            final Surface permukaanPratinjau = new Surface(tekstur);

            List<Surface> sasaran = new ArrayList<Surface>();
            sasaran.add(permukaanPratinjau);
            sasaran.add(pembacaGambar.getSurface());

            kamera.createCaptureSession(sasaran, new CameraCaptureSession.StateCallback() {
                @Override
                public void onConfigured(CameraCaptureSession sesiBaru) {
                    if (kamera == null) {
                        sesiBaru.close();
                        return;
                    }
                    sesi = sesiBaru;
                    try {
                        CaptureRequest.Builder permintaan =
                            kamera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
                        permintaan.addTarget(permukaanPratinjau);
                        permintaan.addTarget(pembacaGambar.getSurface());
                        permintaan.set(CaptureRequest.CONTROL_AF_MODE,
                            CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
                        permintaan.set(CaptureRequest.CONTROL_AE_MODE,
                            CaptureRequest.CONTROL_AE_MODE_ON);
                        sesi.setRepeatingRequest(permintaan.build(), null, penangan);
                        aktivitas.runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                aturTransformasi();
                            }
                        });
                    } catch (CameraAccessException e) {
                        gagal("Kamera tidak dapat memulai pratinjau.");
                    }
                }

                @Override
                public void onConfigureFailed(CameraCaptureSession sesiBaru) {
                    gagal("Konfigurasi kamera gagal.");
                }
            }, penangan);
        } catch (CameraAccessException e) {
            gagal("Kamera tidak dapat diakses.");
        } catch (Exception e) {
            gagal("Kamera gagal memulai pratinjau.");
        }
    }

    /* ------------------------------------------------------------- dekode --- */

    private void proses(Image gambar) {
        if (sudahSelesai) return;
        long kini = System.currentTimeMillis();
        if (kini - terakhirDekode < JEDA_MIN_MS) return;
        terakhirDekode = kini;

        Image.Plane bidang = gambar.getPlanes()[0];
        ByteBuffer buffer = bidang.getBuffer();
        int lebar = gambar.getWidth();
        int tinggi = gambar.getHeight();
        int baris = bidang.getRowStride();
        if (baris < lebar) baris = lebar;
        int perlu = baris * tinggi;
        if (perlu <= 0) return;

        byte[] data = new byte[perlu];
        int tersedia = Math.min(buffer.remaining(), perlu);
        if (tersedia < lebar) return;
        buffer.get(data, 0, tersedia);

        PlanarYUVLuminanceSource sumber =
            new PlanarYUVLuminanceSource(data, baris, tinggi, 0, 0, lebar, tinggi, false);
        BinaryBitmap bitmap = new BinaryBitmap(new HybridBinarizer(sumber));

        Result hasil;
        try {
            hasil = pembaca.decodeWithState(bitmap);
        } catch (Exception e) {
            return; /* belum ada kode QR yang terbaca */
        } finally {
            try {
                pembaca.reset();
            } catch (Exception e) {
                /* diabaikan */
            }
        }
        if (hasil == null || hasil.getText() == null) return;

        final String teks = hasil.getText();
        sudahSelesai = true;
        hentikan();
        aktivitas.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                getar();
                pendengar.padaHasil(teks);
            }
        });
    }

    /* ------------------------------------------------------------ bantuan --- */

    private static Size pilihUkuran(Size[] daftar, int sisiMaks) {
        Size terbaik = null;
        for (Size s : daftar) {
            int sisi = Math.max(s.getWidth(), s.getHeight());
            if (sisi > sisiMaks) continue;
            if (terbaik == null
                || s.getWidth() * s.getHeight() > terbaik.getWidth() * terbaik.getHeight()) {
                terbaik = s;
            }
        }
        if (terbaik != null) return terbaik;
        terbaik = daftar[0];
        for (Size s : daftar) {
            if (s.getWidth() * s.getHeight() < terbaik.getWidth() * terbaik.getHeight()) {
                terbaik = s;
            }
        }
        return terbaik;
    }

    private static Size pilihPratinjau(Size[] daftar, Size yuv) {
        double aspek = yuv.getWidth() / (double) yuv.getHeight();
        Size terbaik = null;
        double selisihTerbaik = Double.MAX_VALUE;
        for (Size s : daftar) {
            double selisih = Math.abs(s.getWidth() / (double) s.getHeight() - aspek);
            long luas = (long) s.getWidth() * s.getHeight();
            if (selisih < selisihTerbaik - 0.01
                || (Math.abs(selisih - selisihTerbaik) <= 0.01 && terbaik != null
                    && luas > (long) terbaik.getWidth() * terbaik.getHeight())) {
                selisihTerbaik = selisih;
                terbaik = s;
            }
        }
        return terbaik == null ? yuv : terbaik;
    }

    private void aturTransformasi() {
        if (ukuranPratinjau == null) return;
        int lebarTampilan = pratinjau.getWidth();
        int tinggiTampilan = pratinjau.getHeight();
        if (lebarTampilan == 0 || tinggiTampilan == 0) return;

        int derajatTampilan;
        switch (aktivitas.getWindowManager().getDefaultDisplay().getRotation()) {
            case Surface.ROTATION_90:
                derajatTampilan = 90;
                break;
            case Surface.ROTATION_180:
                derajatTampilan = 180;
                break;
            case Surface.ROTATION_270:
                derajatTampilan = 270;
                break;
            default:
                derajatTampilan = 0;
                break;
        }

        int putar = (orientasiSensor - derajatTampilan + 360 + putarTambahan) % 360;
        float lebarBuffer = ukuranPratinjau.getWidth();
        float tinggiBuffer = ukuranPratinjau.getHeight();
        float lebarIsi = (putar % 180 == 0) ? lebarBuffer : tinggiBuffer;
        float tinggiIsi = (putar % 180 == 0) ? tinggiBuffer : lebarBuffer;
        float skala = Math.max(lebarTampilan / lebarIsi, tinggiTampilan / tinggiIsi);

        /* TextureView meregangkan buffer (lebarBuffer x tinggiBuffer) agar
           memenuhi layar. Transformasi ini membalik peregangan itu lebih dulu,
           memusatkan buffer, memutar, lalu memperbesar seragam supaya penuh
           tanpa gambar gepeng. */
        Matrix matriks = new Matrix();
        matriks.postScale(lebarBuffer / lebarTampilan, tinggiBuffer / tinggiTampilan);
        matriks.postTranslate(-lebarBuffer / 2f, -tinggiBuffer / 2f);
        matriks.postRotate(putar);
        matriks.postScale(skala, skala);
        matriks.postTranslate(lebarTampilan / 2f, tinggiTampilan / 2f);
        pratinjau.setTransform(matriks);
        transformTerpasang = true;
    }

    /* Dipanggil tombol “Putar kiri”: memutar pratinjau 90° berlawanan arah
       jarum jam, lalu mengingatnya untuk pemindaian berikutnya. */
    public void putarKiri() {
        putarTambahan = (putarTambahan + 270) % 360;
        aktivitas.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putInt(KEY_PUTAR, putarTambahan).apply();
        aturTransformasi();
    }

    private void getar() {
        try {
            Vibrator getar = (Vibrator) aktivitas.getSystemService(Context.VIBRATOR_SERVICE);
            if (getar != null) getar.vibrate(60);
        } catch (Exception e) {
            /* perangkat tanpa getaran: abaikan */
        }
    }

    private void gagal(final String teksPesan) {
        aktivitas.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (sudahSelesai) return;
                pesan.setText(teksPesan);
                pendengar.padaGalat(teksPesan);
            }
        });
    }

    private int dp(int nilai) {
        return Math.round(android.util.TypedValue.applyDimension(
            android.util.TypedValue.COMPLEX_UNIT_DIP, nilai,
            aktivitas.getResources().getDisplayMetrics()));
    }

    /* ------------------------------------------------- permukaan pratinjau --- */

    @Override
    public void onSurfaceTextureAvailable(SurfaceTexture permukaan, int lebar, int tinggi) {
        aturTransformasi();
        if (izinAda()) bukaKamera();
    }

    @Override
    public void onSurfaceTextureSizeChanged(SurfaceTexture permukaan, int lebar, int tinggi) {
        aturTransformasi();
    }

    @Override
    public boolean onSurfaceTextureDestroyed(SurfaceTexture permukaan) {
        hentikan();
        return true;
    }

    @Override
    public void onSurfaceTextureUpdated(SurfaceTexture permukaan) {
        /* Jaring pengaman: bila transformasi belum sempat dipasang saat sesi
           kamera siap, terapkan pada bingkai pertama. */
        if (!transformTerpasang) aturTransformasi();
    }
}
