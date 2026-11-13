using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Interop;
using KumiDeck.Core;
using KumiDeck.Platform;
using KumiDeck.Server;
using Microsoft.Web.WebView2.Core;

namespace KumiDeck;

/* Jendela utama: satu kontrol WebView2 yang memuat UI KumiDeck dari server
   lokal di memori. Tanpa Chrome/Edge --app, tanpa konsol. */
public partial class MainWindow : Window
{
    private readonly KumiServer _server;
    private bool _keluar;
    private bool _siap;

    public MainWindow(KumiServer server)
    {
        _server = server;
        InitializeComponent();
        Title = "KumiDeck";

        /* Samakan judul jendela dan latar awal dengan tema Windows. */
        var gelap = TemaGelap();
        Web.DefaultBackgroundColor = gelap
            ? System.Drawing.Color.FromArgb(0x16, 0x18, 0x1D)
            : System.Drawing.Color.FromArgb(0xEE, 0xED, 0xE8);
        SourceInitialized += (_, _) =>
        {
            TerapkanJudul(gelap);
            SudutMembulat();
        };

        Loaded += SaatDimuat;
        Closing += SaatDitutup;
        Web.NavigationStarting += SaatAkanNavigasi;
    }

    private static bool TemaGelap()
    {
        try
        {
            using var kunci = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
            return kunci?.GetValue("AppsUseLightTheme") is int nilai && nilai == 0;
        }
        catch
        {
            return false;
        }
    }

    private void TerapkanJudul(bool gelap)
    {
        try
        {
            var h = new WindowInteropHelper(this).Handle;
            if (h == IntPtr.Zero) return;
            var nilai = gelap ? 1 : 0;
            Native.DwmSetWindowAttribute(h, 20, ref nilai, sizeof(int));
        }
        catch
        {
            /* tema judul tidak wajib */
        }
    }

    /* Jendela tanpa caption: minta Windows menggambar sudut membulat khas
       Windows 11. */
    private void SudutMembulat()
    {
        try
        {
            var h = new WindowInteropHelper(this).Handle;
            if (h == IntPtr.Zero) return;
            var bulat = 2; // DWMWCP_ROUND
            Native.DwmSetWindowAttribute(h, 33, ref bulat, sizeof(int));
        }
        catch
        {
            /* sudut membulat tidak wajib */
        }
    }

    /* Pesan dari UI: tombol jendela dan permintaan geser. */
    private void SaatPesanWeb(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string pesan;
        try
        {
            pesan = e.TryGetWebMessageAsString();
        }
        catch
        {
            return;
        }

        switch (pesan)
        {
            case "geser":
                GeserJendela();
                break;

            case "minimalkan":
                WindowState = WindowState.Minimized;
                break;

            case "maksimalkan":
                WindowState = WindowState == WindowState.Maximized
                    ? WindowState.Normal
                    : WindowState.Maximized;
                break;

            case "tutup":
                Close();
                break;

            case "siap":
                KirimKeadaanJendela();
                break;

            default:
                if (pesan.StartsWith("warna:", StringComparison.Ordinal))
                {
                    TerapkanWarnaBingkai(pesan["warna:".Length..]);
                }
                break;
        }
    }

    /* Warnai tepi jendela (5px) agar sama dengan latar halaman: bingkai
       penarik jendela jadi tidak terlihat. */
    private void TerapkanWarnaBingkai(string hex)
    {
        if (hex.Length != 7 || hex[0] != '#') return;

        try
        {
            var warna = (System.Windows.Media.Color)
                System.Windows.Media.ColorConverter.ConvertFromString(hex);
            var kuas = new System.Windows.Media.SolidColorBrush(warna);
            kuas.Freeze();

            if (!Dispatcher.CheckAccess())
            {
                Dispatcher.Invoke(() => Terapkan(kuas));
                return;
            }

            Terapkan(kuas);
        }
        catch
        {
            /* warna tidak wajib */
        }

        void Terapkan(System.Windows.Media.SolidColorBrush kuas)
        {
            Background = kuas;
            Web.DefaultBackgroundColor = System.Drawing.Color.FromArgb(
                kuas.Color.R, kuas.Color.G, kuas.Color.B);
        }
    }

    /* Menggeser jendela dengan gaya caption asli: Windows menangani geser,
       penempelan ke tepi layar, dan klik ganda untuk memperbesar. */
    private void GeserJendela()
    {
        try
        {
            var h = new WindowInteropHelper(this).Handle;
            if (h == IntPtr.Zero) return;
            Native.ReleaseCapture();
            Native.SendMessage(h, Native.WM_NCLBUTTONDOWN, Native.HTCAPTION, IntPtr.Zero);
        }
        catch (Exception ex)
        {
            Log.Warn("geser jendela gagal: " + ex.Message);
        }
    }

    /* Beri tahu UI apakah jendela sedang diperbesar, supaya ikonnya berubah. */
    private void KirimKeadaanJendela()
    {
        try
        {
            var inti = Web.CoreWebView2;
            if (inti is null) return;
            inti.PostWebMessageAsString(WindowState == WindowState.Maximized ? "maks" : "normal");
        }
        catch
        {
            /* diabaikan */
        }
    }

    protected override void OnStateChanged(EventArgs e)
    {
        base.OnStateChanged(e);
        KirimKeadaanJendela();
    }

    /* Saat diluncurkan dari proses tersembunyi (mis. skrip/autostart), Windows
       bisa memulai jendela dalam keadaan minimized. Pastikan tetap terlihat. */
    private void PastikanTampil()
    {
        try
        {
            var h = new WindowInteropHelper(this).Handle;
            if (h == IntPtr.Zero) return;
            if (!Native.IsWindowVisible(h)) Native.ShowWindow(h, Native.SW_SHOW);
            else if (Native.IsIconic(h)) Native.ShowWindow(h, Native.SW_RESTORE);
        }
        catch
        {
            /* diabaikan */
        }
    }

    private async void SaatDimuat(object sender, RoutedEventArgs e)
    {
        try
        {
            Directory.CreateDirectory(AppPaths.WebView);

            var opsi = new CoreWebView2EnvironmentOptions
            {
                Language = "id-ID",
                AdditionalBrowserArguments = "--disable-features=msEdgeSidebarV2 --disable-background-timer-throttling",
            };

            var lingkungan = await CoreWebView2Environment.CreateAsync(null, AppPaths.WebView, opsi);
            await Web.EnsureCoreWebView2Async(lingkungan);

            var inti = Web.CoreWebView2;
            inti.Settings.AreDefaultContextMenusEnabled = false;
            inti.Settings.AreDevToolsEnabled = false;
            inti.Settings.IsStatusBarEnabled = false;
            inti.Settings.IsPasswordAutosaveEnabled = false;
            inti.Settings.IsGeneralAutofillEnabled = false;

            /* Pintasan peramban tetap aktif (Ctrl+C/V untuk mengisi kolom),
               tetapi gerak khas peramban dimatikan: tanpa zoom Ctrl+roda,
               tanpa cubit, tanpa geser dua jari untuk maju/mundur. */
            inti.Settings.AreBrowserAcceleratorKeysEnabled = true;
            inti.Settings.IsZoomControlEnabled = false;
            inti.Settings.IsPinchZoomEnabled = false;
            inti.Settings.IsSwipeNavigationEnabled = false;

            inti.NewWindowRequested += SaatJendelaBaru;
            inti.DownloadStarting += SaatUnduh;
            inti.ProcessFailed += SaatWebViewGagal;
            inti.ServerCertificateErrorDetected += SaatSertifikatLokal;
            inti.WebMessageReceived += SaatPesanWeb;
            inti.NavigationCompleted += (_, _) => KirimKeadaanJendela();

            /* Tata letak "rapi": papan mengisi tinggi jendela tanpa gulir
               halaman. Disuntikkan dari sisi native supaya berkas di public/
               tidak perlu diubah. */
            await inti.AddScriptToExecuteOnDocumentCreatedAsync(SkripRapi());

            /* Title bar custom: tombol jendela + area geser. */
            await inti.AddScriptToExecuteOnDocumentCreatedAsync(SkripJendela());

            Web.Source = new Uri(_server.Url);
            _siap = true;
            PastikanTampil();
        }
        catch (WebView2RuntimeNotFoundException)
        {
            TampilkanGalatWebView();
        }
        catch (Exception ex)
        {
            Log.Error("WebView2 gagal dimulai", ex);
            System.Windows.MessageBox.Show(
                this,
                "Tampilan KumiDeck tidak dapat dimuat.\n\n" + ex.Message,
                "KumiDeck",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
        }
    }

    /* Gaya "rapi" khas jendela aplikasi: tinggi halaman dikunci ke jendela,
       papan mengisi sisa ruang, dan gulir hanya terjadi di dalam kartu. Semua
       aturan disuntikkan dari sisi native supaya berkas di public/ tidak
       berubah dan UI web tetap bisa dipakai lewat peramban biasa. */
    private static string SkripRapi() => """
        (() => {
          const pasang = () => {
            if (document.getElementById('kd-gaya-native')) return;

            const gaya = document.createElement('style');
            gaya.id = 'kd-gaya-native';
            gaya.textContent = `
              html, body { height: 100%; margin: 0; overflow: hidden; }

              /* Rangka: kepala dan kaki tetap, papan memakai sisa tinggi. */
              body > .kd-shell {
                height: 100%;
                max-width: none;
                display: flex;
                flex-direction: column;
                gap: 10px;
                padding: 10px 16px 6px;
              }
              .kd-shell > .kd-kepala { flex: 0 0 auto; margin-bottom: 0; }
              .kd-shell > .kd-grid-utama {
                flex: 1 1 auto;
                min-height: 0;
                grid-template-rows: minmax(0, 1fr);
                gap: 12px;
              }
              .kd-grid-utama > .kd-panel { min-height: 0; overflow: hidden; }
              .kd-grid-utama > .kd-sisi {
                height: 100%;
                min-height: 0;
                overflow-y: auto;
                scrollbar-width: none;
              }
              .kd-grid-utama > .kd-sisi::-webkit-scrollbar {
                width: 0;
                height: 0;
              }
              .kd-shell > .kd-kaki { flex: 0 0 auto; margin-top: 0; }
              .kd-shell > .kd-kaki .kd-hint { max-width: none; }

              /* Papan: tombol tetap persegi; bila tidak muat, papannya yang
                 menggulir, bukan halaman. */
              #panel-deck .kd-deck { flex: 1 1 auto; min-height: 0; }
              #panel-deck #papan {
                flex: 1 1 auto;
                min-height: 0;
                align-content: start;
                overflow-y: auto;
                scrollbar-width: none;
              }
              #panel-deck #papan::-webkit-scrollbar { width: 0; height: 0; }
              #panel-deck #petunjuk-papan { flex: 0 0 auto; margin: 0; }

              /* Aktivitas: daftar menggulir di dalam kartu. */
              .kd-panel--aktivitas .kd-aktivitas {
                flex: 1 1 auto;
                min-height: 0;
                overflow-y: auto;
                scrollbar-width: none;
              }
              .kd-panel--aktivitas .kd-aktivitas::-webkit-scrollbar {
                width: 0;
                height: 0;
              }
              .kd-panel--aktivitas .kd-empty { flex: 0 0 auto; }

              /* Daftar perangkat yang panjang tidak mendorong tata letak. */
              .kd-sisi > .kd-panel .kumi-list {
                max-height: 132px;
                overflow-y: auto;
                scrollbar-width: none;
              }
              .kd-sisi > .kd-panel .kumi-list::-webkit-scrollbar {
                width: 0;
                height: 0;
              }

              /* Semua gulir tetap berfungsi (roda tetikus / papan tombol), tetapi
                 batang gulir tidak ditampilkan di mana pun -- termasuk dialog
                 Setelan -- supaya tampilan bersih. */
              * { scrollbar-width: none; -ms-overflow-style: none; }
              *::-webkit-scrollbar { width: 0; height: 0; }

              /* Tombol jendela (title bar custom, dibuat dari sisi native). */
              #kd-jendela {
                position: fixed;
                top: 4px;
                right: 6px;
                z-index: 200;
                display: flex;
                gap: 2px;
              }
              #kd-jendela .kd-jendela__tombol {
                display: grid;
                place-items: center;
                width: 38px;
                height: 30px;
                padding: 0;
                border: 0;
                border-radius: 6px;
                background: transparent;
                color: var(--kumi-fg-muted, #8b8b95);
                cursor: pointer;
                -webkit-appearance: none;
                appearance: none;
              }
              #kd-jendela .kd-jendela__tombol svg {
                width: 11px;
                height: 11px;
                fill: none;
                stroke: currentColor;
                stroke-width: 1.15;
                stroke-linecap: round;
                stroke-linejoin: round;
              }
              #kd-jendela .kd-jendela__tombol:hover {
                background: var(--kumi-surface-2, rgba(127, 127, 127, 0.14));
                color: var(--kumi-fg, #17171b);
              }
              #kd-jendela .kd-jendela__tombol--tutup:hover {
                background: #e5484d;
                color: #fff;
              }

              /* Kepala aplikasi dipakai untuk menggeser jendela; teks di
                 dalamnya tidak perlu bisa dipilih. */
              .kd-kepala,
              .kd-kepala * { user-select: none; -webkit-user-select: none; }

              /* Jaring pengaman: bila jendela diperkecil sampai tata letak web
                 menumpuk satu kolom, kembalikan gulir halaman supaya isi tidak
                 terpotong. */
              @media (max-width: 760px) {
                html, body { overflow: auto; }
                body > .kd-shell { height: auto; min-height: 100%; }
                .kd-shell > .kd-grid-utama { grid-template-rows: none; }
                .kd-grid-utama > .kd-sisi,
                #panel-deck #papan,
                .kd-panel--aktivitas .kd-aktivitas {
                  overflow: visible;
                  max-height: none;
                }
              }
            `;

            const induk = document.head || document.documentElement;
            if (induk) induk.appendChild(gaya);
          };

          if (document.documentElement) pasang();
          else document.addEventListener('DOMContentLoaded', pasang, { once: true });
        })();
        """;

    /* Title bar custom: tombol perkecil/perbesar/tutup dibuat di dalam UI,
       sementara area kepala aplikasi dipakai untuk menggeser jendela. Perintah
       dikirim ke aplikasi native lewat jembatan pesan WebView2. */
    private static string SkripJendela() => """
        (() => {
          const jembatan = window.chrome && window.chrome.webview;

          const kirim = (pesan) => {
            try { if (jembatan) jembatan.postMessage(pesan); } catch (e) { /* diabaikan */ }
          };

          const ikon = {
            kecil: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6h10" /></svg>',
            besar: '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1.6" y="1.6" width="8.8" height="8.8" rx="1.6" /></svg>',
            pulih: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.6 3.6V1.6h6.8v6.8h-2" /><rect x="1.6" y="3.6" width="6.8" height="6.8" rx="1.6" /></svg>',
            tutup: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1.4 1.4l9.2 9.2M10.6 1.4L1.4 10.6" /></svg>',
          };

          const bangun = () => {
            if (!document.body || document.getElementById('kd-jendela')) return;

            const wadah = document.createElement('div');
            wadah.id = 'kd-jendela';
            wadah.innerHTML =
              '<button type="button" class="kd-jendela__tombol" data-aksi="minimalkan" aria-label="Perkecil jendela" title="Perkecil">' + ikon.kecil + '</button>' +
              '<button type="button" class="kd-jendela__tombol" data-aksi="maksimalkan" aria-label="Perbesar jendela" title="Perbesar">' + ikon.besar + '</button>' +
              '<button type="button" class="kd-jendela__tombol kd-jendela__tombol--tutup" data-aksi="tutup" aria-label="Tutup jendela" title="Tutup">' + ikon.tutup + '</button>';
            document.body.appendChild(wadah);

            wadah.addEventListener('click', (ev) => {
              const tombol = ev.target.closest ? ev.target.closest('[data-aksi]') : null;
              if (!tombol) return;
              ev.preventDefault();
              ev.stopPropagation();
              kirim(tombol.dataset.aksi);
            });

            /* Kepala aplikasi = area geser jendela (kecuali pada tombol). */
            const kepala = document.querySelector('.kd-kepala');
            if (kepala) {
              kepala.addEventListener('pointerdown', (ev) => {
                if (ev.button !== 0) return;
                const t = ev.target;
                if (t.closest && t.closest('button, a, input, select, textarea, label, [role="tab"], [data-aksi]')) return;
                kirim('geser');
              });
            }

            if (jembatan) {
              jembatan.addEventListener('message', (ev) => {
                const tombol = wadah.querySelector('[data-aksi="maksimalkan"]');
                if (!tombol) return;
                const penuh = ev.data === 'maks';
                tombol.innerHTML = penuh ? ikon.pulih : ikon.besar;
                tombol.title = penuh ? 'Pulihkan ukuran' : 'Perbesar';
                tombol.setAttribute('aria-label', penuh ? 'Pulihkan ukuran jendela' : 'Perbesar jendela');
              });
              kirim('siap');
            }

            /* Tepi 5px di sekeliling tampilan adalah area tarik jendela. Warnanya
               disamakan dengan latar halaman supaya bingkai tidak terlihat,
               termasuk saat tema terang/gelap ditukar. */
            const laporkanWarna = () => {
              try {
                const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(
                  getComputedStyle(document.body).backgroundColor
                );
                if (!m) return;
                const hex = '#' + [1, 2, 3]
                  .map((i) => Number(m[i]).toString(16).padStart(2, '0'))
                  .join('');
                kirim('warna:' + hex);
              } catch (e) {
                /* diabaikan */
              }
            };

            if (jembatan) {
              laporkanWarna();
              window.setTimeout(laporkanWarna, 400);
              new MutationObserver(laporkanWarna).observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['data-kumi-theme', 'data-theme'],
              });
            }
          };

          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bangun, { once: true });
          } else {
            bangun();
          }
        })();
        """;

    /* Mode HTTPS memakai sertifikat buatan sendiri; hanya sertifikat server
       KumiDeck sendiri yang diterima otomatis. */
    private void SaatSertifikatLokal(object? sender, CoreWebView2ServerCertificateErrorDetectedEventArgs e)
    {
        try
        {
            if (!Uri.TryCreate(e.RequestUri, UriKind.Absolute, out var alamat)) return;
            if (alamat.Port != _server.Port) return;

            var lokal = alamat.IsLoopback ||
                        string.Equals(alamat.Host, _server.Lan, StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(alamat.Host, Environment.MachineName, StringComparison.OrdinalIgnoreCase);
            if (!lokal) return;

            e.Action = CoreWebView2ServerCertificateErrorAction.AlwaysAllow;
        }
        catch (Exception ex)
        {
            Log.Warn("sertifikat tampilan: " + ex.Message);
        }
    }

    private static void TampilkanGalatWebView()
    {
        var hasil = System.Windows.MessageBox.Show(
            "KumiDeck membutuhkan Microsoft Edge WebView2 Runtime.\n\n" +
            "Windows 11 biasanya sudah menyertakannya. Buka halaman unduh sekarang?",
            "KumiDeck",
            MessageBoxButton.YesNo,
            MessageBoxImage.Information);

        if (hasil != MessageBoxResult.Yes) return;

        try
        {
            Process.Start(new ProcessStartInfo("https://developer.microsoft.com/microsoft-edge/webview2/")
            {
                UseShellExecute = true,
            })?.Dispose();
        }
        catch
        {
            /* diabaikan */
        }
    }

    /* Jendela baru (mis. tautan dari UI) dibuka di peramban default, bukan
       jendela WebView2 tambahan. */
    private void SaatJendelaBaru(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        BukaLuar(e.Uri);
    }

    private void SaatAkanNavigasi(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (string.IsNullOrEmpty(e.Uri)) return;
        if (e.Uri.StartsWith("about:", StringComparison.OrdinalIgnoreCase)) return;

        var asal = _server.Skema + "://localhost:" + _server.Port + "/";
        if (e.Uri.StartsWith(asal, StringComparison.OrdinalIgnoreCase)) return;
        if (e.Uri.StartsWith("http://localhost:" + _server.Port, StringComparison.OrdinalIgnoreCase)) return;
        if (e.Uri.StartsWith("https://localhost:" + _server.Port, StringComparison.OrdinalIgnoreCase)) return;

        e.Cancel = true;
        BukaLuar(e.Uri);
    }

    private void BukaLuar(string url)
    {
        if (string.IsNullOrWhiteSpace(url)) return;
        if (!url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
            !url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true })?.Dispose();
        }
        catch (Exception ex)
        {
            Log.Warn("tautan luar tidak dapat dibuka: " + ex.Message);
        }
    }

    /* Ekspor papan / ikon diunduh lewat dialog Simpan sebagai. */
    private void SaatUnduh(object? sender, CoreWebView2DownloadStartingEventArgs e)
    {
        try
        {
            var dialog = new Microsoft.Win32.SaveFileDialog
            {
                Title = "Simpan berkas KumiDeck",
                FileName = Path.GetFileName(e.ResultFilePath),
                InitialDirectory = Path.GetDirectoryName(e.ResultFilePath) ?? "",
                Filter = "Berkas KumiDeck|*.json;*.png;*.svg;*.webp|Semua berkas|*.*",
                OverwritePrompt = true,
            };

            if (dialog.ShowDialog(this) == true)
            {
                e.ResultFilePath = dialog.FileName;
                e.Handled = false;
            }
            else
            {
                e.Cancel = true;
                e.Handled = true;
            }
        }
        catch (Exception ex)
        {
            Log.Warn("dialog unduh gagal: " + ex.Message);
        }
    }

    private void SaatWebViewGagal(object? sender, CoreWebView2ProcessFailedEventArgs e)
    {
        if (e.ProcessFailedKind != CoreWebView2ProcessFailedKind.RenderProcessExited) return;

        Log.Warn("proses tampilan berhenti; memuat ulang");
        try
        {
            if (_siap) Web.Reload();
        }
        catch
        {
            /* diabaikan */
        }
    }

    private void SaatDitutup(object? sender, CancelEventArgs e)
    {
        if (_keluar) return;

        /* Bila ikon baki aktif, tutup jendela berarti sembunyikan (aplikasi
           tetap berjalan). Keluar sepenuhnya lewat menu baki. */
        if (_server.Tray is not null)
        {
            e.Cancel = true;
            Hide();
            _server.Tray.BeriTahu(
                "KumiDeck masih berjalan",
                "Klik ikon baki sistem untuk membuka papan, atau pilih Keluar KumiDeck.");
            return;
        }

        _keluar = true;

        /* Tray mati: tidak ada lagi jalan kembali ke jendela, jadi aplikasi
           harus benar-benar berhenti (mode Shutdown eksplisit). */
        Dispatcher.BeginInvoke(
            new Action(() => System.Windows.Application.Current?.Shutdown()),
            System.Windows.Threading.DispatcherPriority.Background);
    }

    public void Tampilkan()
    {
        if (!Dispatcher.CheckAccess())
        {
            Dispatcher.Invoke(Tampilkan);
            return;
        }

        Show();
        if (WindowState == WindowState.Minimized) WindowState = WindowState.Normal;
        PastikanTampil();
        Activate();

        /* Dorong ke depan tanpa membuat jendela selalu di atas. */
        Topmost = true;
        Topmost = false;
        Focus();
    }

    public void TutupPaksa()
    {
        _keluar = true;
        Close();
    }
}
