package id.kumideck.remote;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.net.InetSocketAddress;
import java.net.Socket;

/* KumiDeck Remote — pembungkus WebView untuk UI /remote yang disajikan
   KumiDeck di komputer. Tidak ada papan atau aksi yang disimpan di sini:
   semuanya tetap di server desktop, jadi pembaruan aplikasi desktop langsung
   terpakai tanpa memasang ulang APK ini.

   Alur: layar alamat server → WebView membuka http://<alamat>/remote →
   kode pasangan 8 karakter dimasukkan di UI web seperti di peramban. */
public class MainActivity extends Activity {

    private static final String PREFS = "kumideck-remote";
    private static final String KEY_ASAL = "asal"; /* scheme://host:port */
    private static final String AKSI_SETUP = "id.kumideck.remote.SETUP";
    private static final String VERSI = "2.4.0";

    /* Palet terang Rangka. Layar QR memakai warnanya sendiri karena berada di
       atas pratinjau kamera. */
    private static final int WARNA_LATAR = 0xFFF5F5F7;
    private static final int WARNA_KARTU = 0xFFFFFFFF;
    private static final int WARNA_TEKS = 0xFF16171D;
    private static final int WARNA_REDUP = 0xFF6C6D78;
    private static final int WARNA_GARIS = 0xFFE2E2E7;
    private static final int WARNA_AKSEN = 0xFF4F5FDB;
    private static final int WARNA_AKSEN_TEKS = 0xFFFFFFFF;

    private static final int ISI = ViewGroup.LayoutParams.MATCH_PARENT;
    private static final int BUNGKUS = ViewGroup.LayoutParams.WRAP_CONTENT;

    private FrameLayout akar;
    private WebView web;
    private WebChromeClient chrome;
    private View memuat;
    private TextView infoMemuat;
    private View lapisGalat;
    private TextView pesanGalat;
    private String alamatTampil = "";
    private boolean diSetup = false;
    private PemindaiQr pemindai;
    private View tampilanPenuh;
    private WebChromeClient.CustomViewCallback callbackPenuh;

    /* Pengguna sedang memilih "Masukkan kode": layar kode pasangan milik UI web
       memang yang diminta, jadi jangan dialihkan ke layar masuk. */
    private boolean keHalamanKode;

    /* Batas tunggu halaman: koneksi ke alamat LAN yang salah bisa menggantung
       puluhan detik tanpa memicu onReceivedError. */
    private final Handler penunda = new Handler(Looper.getMainLooper());
    private final Runnable batasMuat = new Runnable() {
        @Override
        public void run() {
            if (web != null) {
                tampilkanGalat("Tidak ada jawaban dari " + alamatTampil
                    + " setelah 15 detik. Pastikan KumiDeck berjalan dan ponsel"
                    + " ada di Wi-Fi yang sama dengan komputer.");
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(WARNA_LATAR);
        getWindow().setNavigationBarColor(WARNA_LATAR);

        akar = new FrameLayout(this);
        akar.setBackgroundColor(WARNA_LATAR);
        setContentView(akar);

        if (bukaDariIntent(getIntent())) return;
        if (mintaSetup(getIntent())) {
            tampilkanSetup(alamatTersimpan());
            return;
        }
        String asal = alamatTersimpan();
        if (asal.isEmpty()) tampilkanMasuk();
        else buka(asal + "/remote");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (bukaDariIntent(intent)) return;
        if (mintaSetup(intent)) {
            tampilkanSetup(alamatTersimpan());
        }
    }

    /* Tautan hasil pindai kode QR (VIEW) atau teks yang dibagikan (SEND)
       membawa alamat lengkap, biasanya beserta ?kode=<token>. Simpan asalnya,
       lalu muat tautannya apa adanya supaya token langsung terpakai UI web. */
    private boolean bukaDariIntent(Intent intent) {
        if (intent == null) return false;
        String teks = null;
        if (Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) {
            teks = intent.getData().toString();
        } else if (Intent.ACTION_SEND.equals(intent.getAction())) {
            teks = intent.getStringExtra(Intent.EXTRA_TEXT);
        }
        return bukaDariTeks(teks);
    }

    /* Menerima teks bebas (hasil pindai kamera, tautan yang dibagikan, atau
       tautan yang ditempel): ambil URL pertama, simpan asalnya, lalu buka. */
    private boolean bukaDariTeks(String teks) {
        if (teks == null) return false;

        /* Aplikasi pemindai kadang menempelkan kalimat; ambil URL pertama. */
        int awal = teks.indexOf("http://");
        if (awal < 0) awal = teks.indexOf("https://");
        if (awal < 0) return false;
        int akhir = awal;
        while (akhir < teks.length() && !Character.isWhitespace(teks.charAt(akhir))) akhir++;

        String url = normalisasi(teks.substring(awal, akhir));
        if (url.isEmpty()) return false;
        prefs().edit().putString(KEY_ASAL, asalDari(url)).apply();
        keHalamanKode = false;
        buka(url);
        return true;
    }

    /* Pintasan tekan-lama ikon memakai aksi khusus; extra "setup" lama tetap
       diterima agar tautan atau uji adb yang sudah ada tidak rusak. */
    private boolean mintaSetup(Intent intent) {
        if (intent == null) return false;
        return AKSI_SETUP.equals(intent.getAction())
            || intent.getBooleanExtra("setup", false);
    }

    /* -------------------------------------------------------------- pindai -- */

    private void bukaPemindai() {
        lepasWeb();
        akar.removeAllViews();
        alamatTampil = "";
        lepasPemindai();

        pemindai = new PemindaiQr(this, new PemindaiQr.Pendengar() {
            @Override
            public void padaHasil(String teks) {
                lepasPemindai();
                if (!bukaDariTeks(teks)) {
                    Toast.makeText(MainActivity.this,
                        "Kode QR itu bukan tautan KumiDeck.", Toast.LENGTH_LONG).show();
                    tampilkanSetup(alamatTersimpan());
                }
            }

            @Override
            public void padaBatal() {
                lepasPemindai();
                tampilkanSetup(alamatTersimpan());
            }

            @Override
            public void padaGalat(String pesan) {
                /* pesan sudah tampil di layar pemindai */
            }
        });
        akar.addView(pemindai.tampilan(), new FrameLayout.LayoutParams(ISI, ISI));
        pemindai.mulai();
    }

    private void lepasPemindai() {
        if (pemindai != null) {
            pemindai.lepas();
            pemindai = null;
        }
    }

    /* ------------------------------------------------------------- setelan -- */

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private String alamatTersimpan() {
        String s = prefs().getString(KEY_ASAL, "");
        return s == null ? "" : s;
    }

    /* ---------------------------------------------------------- layar awal -- */

    /* Layar masuk: pilihan cara menyambung. Dipakai saat belum ada alamat
       tersimpan dan saat perangkat baru saja diputus dari komputer, supaya
       pengguna bisa memilih memindai kode QR atau mengetik kode pasangan. */
    private void tampilkanMasuk() {
        lepasWeb();
        akar.removeAllViews();
        alamatTampil = "";
        diSetup = false;

        ScrollView gulir = new ScrollView(this);
        gulir.setFillViewport(true);
        gulir.setBackgroundColor(WARNA_LATAR);

        LinearLayout isi = new LinearLayout(this);
        isi.setOrientation(LinearLayout.VERTICAL);
        isi.setGravity(Gravity.CENTER_VERTICAL);
        isi.setPadding(dp(28), dp(28), dp(28), dp(28));
        gulir.addView(isi, new ScrollView.LayoutParams(ISI, BUNGKUS));

        isi.addView(teks("KumiDeck Remote", 28, WARNA_TEKS, true));
        TextView ket = teks(
            "Papan tombol untuk komputer yang menjalankan KumiDeck. Pilih cara menyambung:",
            14, WARNA_REDUP, false);
        ket.setPadding(0, dp(10), 0, dp(26));
        isi.addView(ket);

        Button pindai = tombol("Pindai kode QR", true);
        isi.addView(pindai, new LinearLayout.LayoutParams(ISI, dp(52)));
        pindai.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                bukaPemindai();
            }
        });

        Button kode = tombol("Masukkan kode", false);
        LinearLayout.LayoutParams lpKode = new LinearLayout.LayoutParams(ISI, dp(52));
        lpKode.topMargin = dp(10);
        isi.addView(kode, lpKode);
        kode.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                pilihMasukKode();
            }
        });

        TextView catatan = teks(
            "Kode QR ada di layar Remote di komputer. Di layar itu juga tampil kode pasangan 8 karakter bila kamera tidak bisa dipakai.",
            12, WARNA_REDUP, false);
        catatan.setPadding(0, dp(22), 0, 0);
        isi.addView(catatan);

        final String tersimpan = alamatTersimpan();
        if (!tersimpan.isEmpty()) {
            Button kembali = tombol("Kembali ke papan", false);
            LinearLayout.LayoutParams lpKembali = new LinearLayout.LayoutParams(ISI, dp(48));
            lpKembali.topMargin = dp(10);
            kembali.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    keHalamanKode = false;
                    buka(tersimpan + "/remote");
                }
            });
            isi.addView(kembali, lpKembali);
        }

        akar.addView(gulir, new FrameLayout.LayoutParams(ISI, ISI));
    }

    /* "Masukkan kode": tanpa alamat tersimpan, buka formulir alamat dulu.
       Kalau alamat sudah ada, halaman Remote yang menampilkan kolom kode
       8 karakter langsung dibuka. */
    private void pilihMasukKode() {
        String asal = alamatTersimpan();
        if (asal.isEmpty()) {
            tampilkanSetup("");
            return;
        }
        keHalamanKode = true;
        buka(asal + "/remote");
    }

    private void tampilkanSetup(String isiAwal) {
        lepasWeb();
        akar.removeAllViews();
        alamatTampil = "";

        ScrollView gulir = new ScrollView(this);
        gulir.setFillViewport(true);
        gulir.setBackgroundColor(WARNA_LATAR);

        LinearLayout isi = new LinearLayout(this);
        isi.setOrientation(LinearLayout.VERTICAL);
        isi.setGravity(Gravity.CENTER_VERTICAL);
        isi.setPadding(dp(28), dp(28), dp(28), dp(28));
        gulir.addView(isi, new ScrollView.LayoutParams(ISI, BUNGKUS));

        isi.addView(teks("KumiDeck Remote", 28, WARNA_TEKS, true));
        TextView ket = teks(
            "Papan tombol untuk komputer yang menjalankan KumiDeck. Pastikan ponsel dan komputer ada di Wi-Fi yang sama.",
            14, WARNA_REDUP, false);
        ket.setPadding(0, dp(10), 0, dp(26));
        isi.addView(ket);

        isi.addView(teks("Alamat server", 13, WARNA_TEKS, true));

        final EditText input = new EditText(this);
        input.setHint("192.168.1.10:4173");
        input.setHintTextColor(WARNA_REDUP);
        input.setTextColor(WARNA_TEKS);
        input.setTextSize(16);
        input.setBackground(bentuk(WARNA_KARTU, 12, WARNA_GARIS));
        input.setPadding(dp(16), dp(12), dp(16), dp(12));
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setSingleLine(true);
        input.setImeOptions(EditorInfo.IME_ACTION_GO);
        if (isiAwal != null && !isiAwal.isEmpty()) {
            String tampil = isiAwal.replace("http://", "").replace("https://", "");
            input.setText(tampil);
            input.setSelection(tampil.length());
        }
        LinearLayout.LayoutParams lpInput = new LinearLayout.LayoutParams(ISI, BUNGKUS);
        lpInput.topMargin = dp(6);
        isi.addView(input, lpInput);

        TextView petunjuk = teks(
            "Alamat tampil di layar komputer (tombol “Remote”). Sertakan port, mis. 192.168.1.10:4173. Bisa juga menempel tautan lengkap /remote?kode=… dari kode QR.",
            12, WARNA_REDUP, false);
        petunjuk.setPadding(0, dp(8), 0, dp(22));
        isi.addView(petunjuk);

        TextView pindaiKet = teks(
            "Tekan “Pindai kode QR” untuk memindai kode di layar komputer; izin kamera diminta sekali. Kalau kamera tidak bisa dipakai, tempel tautan /remote?kode=… di atas.",
            12, WARNA_REDUP, false);
        pindaiKet.setPadding(0, 0, 0, dp(18));
        isi.addView(pindaiKet);

        Button pindai = tombol("Pindai kode QR", true);
        isi.addView(pindai, new LinearLayout.LayoutParams(ISI, dp(52)));
        pindai.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                bukaPemindai();
            }
        });

        Button sambung = tombol("Sambung dengan alamat", false);
        LinearLayout.LayoutParams lpSambung = new LinearLayout.LayoutParams(ISI, dp(52));
        lpSambung.topMargin = dp(10);
        isi.addView(sambung, lpSambung);

        sambung.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String alamat = normalisasi(input.getText().toString());
                if (alamat.isEmpty()) {
                    Toast.makeText(MainActivity.this, "Alamat server belum benar.", Toast.LENGTH_SHORT).show();
                    return;
                }
                prefs().edit().putString(KEY_ASAL, asalDari(alamat)).apply();
                keHalamanKode = true;
                buka(alamat);
            }
        });
        input.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override
            public boolean onEditorAction(TextView v, int aksi, android.view.KeyEvent ev) {
                if (aksi == EditorInfo.IME_ACTION_GO) {
                    sambung.performClick();
                    return true;
                }
                return false;
            }
        });

        TextView catatan = teks(
            "Setelah tersambung, masukkan kode pasangan 8 karakter dari layar komputer.",
            12, WARNA_REDUP, false);
        catatan.setPadding(0, dp(22), 0, 0);
        isi.addView(catatan);

        /* Saat alamat sudah pernah tersimpan, layar ini juga dibuka lewat
           pintasan tekan-lama ikon: sediakan jalan kembali tanpa memutus. */
        final String tersimpan = alamatTersimpan();
        if (!tersimpan.isEmpty()) {
            Button kembali = tombol("Kembali ke papan", false);
            LinearLayout.LayoutParams lpKembali = new LinearLayout.LayoutParams(ISI, dp(48));
            lpKembali.topMargin = dp(10);
            kembali.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    buka(tersimpan + "/remote");
                }
            });
            isi.addView(kembali, lpKembali);
        }

        diSetup = true;
        akar.addView(gulir, new FrameLayout.LayoutParams(ISI, ISI));
    }

    /* --------------------------------------------------------------- web --- */

    private void buka(String url) {
        lepasWeb();
        akar.removeAllViews();
        alamatTampil = url;
        diSetup = false;

        web = new WebView(this);
        web.setBackgroundColor(WARNA_LATAR);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setUserAgentString(s.getUserAgentString() + " KumiDeckRemote/" + VERSI);

        web.addJavascriptInterface(new Jembatan(), "KumiDeckApl");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String skema = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
                /* Hanya http/https yang boleh dimuat di dalam aplikasi. */
                return !("http".equals(skema) || "https".equals(skema));
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                tampilkanMemuat(true);
                /* Aplikasi ini sudah terpasang: jangan tampilkan ajakan PWA. */
                view.evaluateJavascript(
                    "try{localStorage.setItem('kumideck-remote-hint','1');}catch(e){}", null);
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                /* Halaman sudah punya isi; jangan biarkan overlay menutupinya
                   hanya karena onPageFinished belum tiba. */
                batalBatas();
                tampilkanMemuat(false);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                batalBatas();
                tampilkanMemuat(false);
                sembunyikanAjakanPwa(view);
                awasiPasangan(view);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    batalBatas();
                    tampilkanGalat("Tidak dapat terhubung ke " + alamatTampil +
                        ". Pastikan KumiDeck berjalan dan ponsel ada di Wi-Fi yang sama.");
                }
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                tampilkanGalat("Sertifikat HTTPS tidak dipercaya. Gunakan alamat http:// atau pasang sertifikat KumiDeck di ponsel.");
            }
        });

        chrome = new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (tampilanPenuh != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                tampilanPenuh = view;
                callbackPenuh = callback;
                akar.addView(view, new FrameLayout.LayoutParams(ISI, ISI));
                if (web != null) web.setVisibility(View.GONE);
                pasangLayarPenuh(true);
            }

            @Override
            public void onHideCustomView() {
                if (tampilanPenuh == null) return;
                akar.removeView(tampilanPenuh);
                tampilanPenuh = null;
                if (web != null) web.setVisibility(View.VISIBLE);
                pasangLayarPenuh(false);
                if (callbackPenuh != null) {
                    callbackPenuh.onCustomViewHidden();
                    callbackPenuh = null;
                }
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                /* Remote tidak memakai kamera atau mikrofon. */
                request.deny();
            }
        };
        web.setWebChromeClient(chrome);

        akar.addView(web, new FrameLayout.LayoutParams(ISI, ISI));

        LinearLayout kotakMemuat = new LinearLayout(this);
        kotakMemuat.setOrientation(LinearLayout.VERTICAL);
        kotakMemuat.setGravity(Gravity.CENTER);
        kotakMemuat.setBackgroundColor(WARNA_LATAR);
        ProgressBar roda = new ProgressBar(this);
        kotakMemuat.addView(roda, new LinearLayout.LayoutParams(BUNGKUS, BUNGKUS));
        TextView info = teks("Menyambung…", 13, WARNA_REDUP, false);
        info.setPadding(0, dp(12), 0, 0);
        kotakMemuat.addView(info, new LinearLayout.LayoutParams(BUNGKUS, BUNGKUS));
        memuat = kotakMemuat;
        infoMemuat = info;
        info.setText("Menyambung ke " + ringkasAlamat(url) + "…");

        TextView ulangMuat = teks("Muat ulang", 13, WARNA_AKSEN, true);
        ulangMuat.setPadding(0, dp(20), 0, 0);
        ulangMuat.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (alamatTampil != null && !alamatTampil.isEmpty()) buka(alamatTampil);
            }
        });
        kotakMemuat.addView(ulangMuat, new LinearLayout.LayoutParams(BUNGKUS, BUNGKUS));

        akar.addView(memuat, new FrameLayout.LayoutParams(ISI, ISI));

        lapisGalat = buatLapisGalat();
        lapisGalat.setVisibility(View.GONE);
        akar.addView(lapisGalat, new FrameLayout.LayoutParams(ISI, ISI));

        /* WebView bisa menggantung lama pada alamat yang tidak menjawab
           (mis. IP salah atau Wi-Fi berbeda) tanpa memicu onReceivedError.
           Jadi sambungan diperiksa lebih dulu dengan batas 1,5 detik. */
        cekJangkauan(url);
    }

    private void cekJangkauan(final String url) {
        Uri u = Uri.parse(url);
        final String host = u.getHost();
        final int port = u.getPort();
        if (host == null || host.isEmpty() || port <= 0) {
            jadwalkanBatas();
            if (web != null) web.loadUrl(url);
            return;
        }

        jadwalkanBatas();
        new Thread(new Runnable() {
            @Override
            public void run() {
                boolean bisa;
                Socket soket = new Socket();
                try {
                    soket.connect(new InetSocketAddress(host, port), 1500);
                    bisa = true;
                } catch (Exception e) {
                    bisa = false;
                } finally {
                    try {
                        soket.close();
                    } catch (Exception e) {
                        /* diabaikan */
                    }
                }

                final boolean hasil = bisa;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (web == null || !url.equals(alamatTampil)) return;
                        if (hasil) {
                            web.loadUrl(url);
                        } else {
                            tampilkanGalat("Tidak ada jawaban dari " + host + ":" + port
                                + ". Pastikan KumiDeck masih berjalan, ponsel ada di"
                                + " Wi-Fi yang sama dengan komputer, dan jaringan di"
                                + " komputer berstatus Privat (bukan Publik).");
                        }
                    }
                });
            }
        }, "cek-jangkauan").start();
    }

    private void jadwalkanBatas() {
        penunda.removeCallbacks(batasMuat);
        penunda.postDelayed(batasMuat, 15000);
    }

    private void batalBatas() {
        penunda.removeCallbacks(batasMuat);
    }

    /* host:port saja, supaya pesan muat tidak menampilkan token. */
    private String ringkasAlamat(String url) {
        try {
            Uri u = Uri.parse(url);
            String host = u.getHost();
            if (host == null || host.isEmpty()) return url;
            return u.getPort() > 0 ? host + ":" + u.getPort() : host;
        } catch (Exception e) {
            return url;
        }
    }

    private View buatLapisGalat() {
        LinearLayout lapis = new LinearLayout(this);
        lapis.setOrientation(LinearLayout.VERTICAL);
        lapis.setGravity(Gravity.CENTER);
        lapis.setPadding(dp(28), dp(28), dp(28), dp(28));
        lapis.setBackgroundColor(WARNA_LATAR);

        lapis.addView(teks("Tidak tersambung", 22, WARNA_TEKS, true));
        pesanGalat = teks("", 14, WARNA_REDUP, false);
        pesanGalat.setPadding(0, dp(12), 0, dp(24));
        pesanGalat.setGravity(Gravity.CENTER);
        lapis.addView(pesanGalat);

        Button ulang = tombol("Coba lagi", true);
        ulang.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (alamatTampil != null && !alamatTampil.isEmpty()) buka(alamatTampil);
            }
        });
        lapis.addView(ulang, new LinearLayout.LayoutParams(ISI, dp(48)));

        Button diChrome = tombol("Buka di Chrome", false);
        LinearLayout.LayoutParams lpChrome = new LinearLayout.LayoutParams(ISI, dp(48));
        lpChrome.topMargin = dp(10);
        diChrome.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (alamatTampil == null || alamatTampil.isEmpty()) return;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(alamatTampil)));
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this,
                        "Tidak ada peramban untuk membuka alamat itu.",
                        Toast.LENGTH_LONG).show();
                }
            }
        });
        lapis.addView(diChrome, lpChrome);

        Button ganti = tombol("Ganti alamat server", false);
        LinearLayout.LayoutParams lpGanti = new LinearLayout.LayoutParams(ISI, dp(48));
        lpGanti.topMargin = dp(10);
        ganti.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                tampilkanSetup(alamatTersimpan());
            }
        });
        lapis.addView(ganti, lpGanti);

        return lapis;
    }

    private void tampilkanMemuat(boolean nyala) {
        if (memuat != null) memuat.setVisibility(nyala ? View.VISIBLE : View.GONE);
        if (nyala && lapisGalat != null) lapisGalat.setVisibility(View.GONE);
    }

    private void tampilkanGalat(String pesan) {
        batalBatas();
        if (lapisGalat == null) return;
        if (memuat != null) memuat.setVisibility(View.GONE);
        if (pesanGalat != null) pesanGalat.setText(pesan);
        lapisGalat.setVisibility(View.VISIBLE);
    }

    /* Ajakan “Tambahkan ke layar utama” tidak relevan di dalam APK, dan
       UI web menampilkannya karena http:// dianggap konteks tidak aman. */
    private void sembunyikanAjakanPwa(WebView view) {
        view.evaluateJavascript(
            "(function(){" +
            "function s(){var b=document.getElementById('banner-pasang');" +
            "if(b&&!b.hidden){b.hidden=true;}}" +
            "s();" +
            "try{var o=new MutationObserver(s);" +
            "o.observe(document.body,{attributes:true,subtree:true,attributeFilter:['hidden']});" +
            "window.setTimeout(function(){o.disconnect();},15000);}catch(e){}" +
            "try{localStorage.setItem('kumideck-remote-hint','1');}catch(e){}" +
            "})()", null);
    }

    /* Memantau layar pasangan milik UI web (#lapis-pasangan). Bila perangkat
       baru saja diputus (lapis dari tersembunyi menjadi tampil), aplikasi
       menawarkan layar masuk: pindai kode QR atau masukkan kode. */
    private void awasiPasangan(WebView view) {
        view.evaluateJavascript(
            "(function(){" +
            "var l=document.getElementById('lapis-pasangan');" +
            "if(!l){return;}" +
            "var tampil=!l.hasAttribute('hidden');" +
            "var lapor=function(nilai){try{KumiDeckApl.pasangan(nilai);}catch(e){}};" +
            "lapor(tampil);" +
            "var cek=function(){var t=!l.hasAttribute('hidden');" +
            "if(t===tampil){return;}tampil=t;lapor(t);};" +
            "try{new MutationObserver(cek).observe(l," +
            "{attributes:true,attributeFilter:['hidden']});}" +
            "catch(e){window.setInterval(cek,1500);}" +
            "})()", null);
    }

    /* Jembatan kecil dari halaman Remote ke aplikasi. Hanya menerima status
       layar pasangan; tidak boleh dipakai halaman lain untuk apa pun. */
    private class Jembatan {
        @android.webkit.JavascriptInterface
        public void pasangan(final boolean tampil) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (web == null) return;
                    if (!tampil) {
                        /* Sudah dipasangkan: alur normal dipakai lagi. */
                        keHalamanKode = false;
                        return;
                    }
                    if (keHalamanKode) return; /* pengguna memang memilih kode */
                    tampilkanMasuk();
                }
            });
        }
    }

    private void pasangLayarPenuh(boolean nyala) {
        View dekor = getWindow().getDecorView();
        if (nyala) {
            dekor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        } else {
            /* Kembali ke tema terang: ikon status bar dan bilah navigasi gelap,
               bukan putih di atas latar abu muda. */
            int tanda = View.SYSTEM_UI_FLAG_VISIBLE | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                tanda |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
            dekor.setSystemUiVisibility(tanda);
        }
    }

    private void lepasWeb() {
        batalBatas();
        if (tampilanPenuh != null) {
            if (chrome != null) chrome.onHideCustomView();
        }
        if (web != null) {
            try {
                akar.removeView(web);
                web.stopLoading();
                web.loadUrl("about:blank");
                web.destroy();
            } catch (Exception e) {
                /* diabaikan: WebView sudah dilepas */
            }
            web = null;
        }
        memuat = null;
        infoMemuat = null;
        lapisGalat = null;
        pesanGalat = null;
    }

    /* ----------------------------------------------------------- bantuan --- */

    private String normalisasi(String mentah) {
        String s = mentah == null ? "" : mentah.trim();
        if (s.isEmpty()) return "";
        if (!s.matches("(?i)^https?://.*")) s = "http://" + s;
        Uri u;
        try {
            u = Uri.parse(s);
        } catch (Exception e) {
            return "";
        }
        if (u.getHost() == null || u.getHost().isEmpty()) return "";
        String skema = u.getScheme() == null ? "http" : u.getScheme().toLowerCase();
        if (!"http".equals(skema) && !"https".equals(skema)) return "";

        StringBuilder b = new StringBuilder(skema).append("://").append(u.getHost());
        if (u.getPort() > 0) b.append(':').append(u.getPort());

        String jalur = u.getEncodedPath();
        String kueri = u.getEncodedQuery();
        if (jalur != null && jalur.length() > 1 && !"/".equals(jalur)) {
            b.append(jalur);
        } else {
            b.append("/remote");
        }
        if (kueri != null && !kueri.isEmpty()) b.append('?').append(kueri);
        return b.toString();
    }

    private String asalDari(String url) {
        Uri u = Uri.parse(url);
        StringBuilder b = new StringBuilder(u.getScheme()).append("://").append(u.getHost());
        if (u.getPort() > 0) b.append(':').append(u.getPort());
        return b.toString();
    }

    private int dp(int nilai) {
        return Math.round(TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, nilai, getResources().getDisplayMetrics()));
    }

    private TextView teks(String isi, int ukuran, int warna, boolean tebal) {
        TextView t = new TextView(this);
        t.setText(isi);
        t.setTextSize(ukuran);
        t.setTextColor(warna);
        if (tebal) t.setTypeface(t.getTypeface(), Typeface.BOLD);
        t.setLineSpacing(0, 1.15f);
        return t;
    }

    /* Tombol Rangka: sudut membulat, tanpa kapital paksa dan tanpa tint
       bawaan Material yang membuat layar terang terlihat seperti UI lama. */
    private Button tombol(String label, boolean utama) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(15.5f);
        b.setTextColor(utama ? WARNA_AKSEN_TEKS : WARNA_AKSEN);
        b.setBackground(bentuk(utama ? WARNA_AKSEN : WARNA_KARTU, 14, utama ? 0 : WARNA_GARIS));
        b.setPadding(dp(18), 0, dp(18), 0);
        b.setMinHeight(0);
        b.setMinimumHeight(0);
        b.setStateListAnimator(null);
        return b;
    }

    private GradientDrawable bentuk(int isi, int radius, int garis) {
        GradientDrawable d = new GradientDrawable();
        d.setShape(GradientDrawable.RECTANGLE);
        d.setColor(isi);
        d.setCornerRadius(dp(radius));
        if (garis != 0) d.setStroke(Math.max(1, dp(1)), garis);
        return d;
    }

    /* ------------------------------------------------------------ daur --- */

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        if (pemindai != null) pemindai.hentikan();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        if (pemindai != null) pemindai.mulai();
    }

    @Override
    public void onRequestPermissionsResult(int kode, String[] izin, int[] hasil) {
        if (pemindai != null && pemindai.tanganiIzin(kode, hasil)) return;
        super.onRequestPermissionsResult(kode, izin, hasil);
    }

    @Override
    public void onBackPressed() {
        if (pemindai != null) {
            pemindai.batal();
            return;
        }
        if (tampilanPenuh != null) {
            if (chrome != null) chrome.onHideCustomView();
            return;
        }
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        if (diSetup && !alamatTersimpan().isEmpty()) {
            buka(alamatTersimpan() + "/remote");
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        lepasPemindai();
        lepasWeb();
        super.onDestroy();
    }
}
