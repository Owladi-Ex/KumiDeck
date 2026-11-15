package id.kumideck.remote;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
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
    private static final String VERSI = "2.2.0";

    private static final int WARNA_LATAR = 0xFF17171B;
    private static final int WARNA_TEKS = 0xFFF4F4F0;
    private static final int WARNA_REDUP = 0xFF9A9AA2;
    private static final int WARNA_AKSEN = 0xFFD9F25B;

    private static final int ISI = ViewGroup.LayoutParams.MATCH_PARENT;
    private static final int BUNGKUS = ViewGroup.LayoutParams.WRAP_CONTENT;

    private FrameLayout akar;
    private WebView web;
    private WebChromeClient chrome;
    private View memuat;
    private View lapisGalat;
    private TextView pesanGalat;
    private String alamatTampil = "";
    private boolean diSetup = false;
    private PemindaiQr pemindai;
    private View tampilanPenuh;
    private WebChromeClient.CustomViewCallback callbackPenuh;

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
        if (asal.isEmpty()) tampilkanSetup("");
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
        input.setHintTextColor(0xFF6E6E78);
        input.setTextColor(WARNA_TEKS);
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

        Button pindai = new Button(this);
        pindai.setText("Pindai kode QR");
        pindai.setAllCaps(false);
        pindai.setTextSize(16);
        pindai.setTextColor(WARNA_LATAR);
        pindai.setBackgroundTintList(ColorStateList.valueOf(WARNA_AKSEN));
        isi.addView(pindai, new LinearLayout.LayoutParams(ISI, dp(52)));
        pindai.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                bukaPemindai();
            }
        });

        Button sambung = new Button(this);
        sambung.setText("Sambung dengan alamat");
        sambung.setAllCaps(false);
        sambung.setTextSize(16);
        sambung.setTextColor(WARNA_AKSEN);
        sambung.setBackgroundTintList(ColorStateList.valueOf(0xFF23232A));
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
            Button kembali = new Button(this);
            kembali.setText("Kembali ke papan");
            kembali.setAllCaps(false);
            kembali.setTextColor(WARNA_TEKS);
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
        web.setBackgroundColor(Color.parseColor("#eeede8"));
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
            public void onPageFinished(WebView view, String url) {
                tampilkanMemuat(false);
                sembunyikanAjakanPwa(view);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
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
        akar.addView(memuat, new FrameLayout.LayoutParams(ISI, ISI));

        lapisGalat = buatLapisGalat();
        lapisGalat.setVisibility(View.GONE);
        akar.addView(lapisGalat, new FrameLayout.LayoutParams(ISI, ISI));

        web.loadUrl(url);
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

        Button ulang = new Button(this);
        ulang.setText("Coba lagi");
        ulang.setAllCaps(false);
        ulang.setTextColor(WARNA_LATAR);
        ulang.setBackgroundTintList(ColorStateList.valueOf(WARNA_AKSEN));
        ulang.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (alamatTampil != null && !alamatTampil.isEmpty()) buka(alamatTampil);
            }
        });
        lapis.addView(ulang, new LinearLayout.LayoutParams(ISI, dp(48)));

        Button ganti = new Button(this);
        ganti.setText("Ganti alamat server");
        ganti.setAllCaps(false);
        ganti.setTextColor(WARNA_TEKS);
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
            dekor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
        }
    }

    private void lepasWeb() {
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
