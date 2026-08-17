package cu.donpadron.tienda;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String STORE_HOST = "don-padron.leetomy437.chatgpt.site";

    private WebView webView;
    private View loadingView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(255, 248, 244));
        getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(255, 248, 244));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(255, 248, 244));
        configureWebView();
        root.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        loadingView = createLoadingView();
        root.addView(loadingView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        applySystemBarInsets(root);
        setContentView(root);

        if (savedInstanceState == null) {
            webView.loadUrl(BuildConfig.START_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " DonPadronAndroid/1.0");

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, BuildConfig.ADMIN_MODE);

        webView.setWebViewClient(new StoreWebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress >= 80 && loadingView != null) {
                    loadingView.setVisibility(View.GONE);
                }
            }

            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                WebView popup = new WebView(MainActivity.this);
                popup.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView popupView, WebResourceRequest request) {
                        openPopupUrl(request.getUrl());
                        popupView.destroy();
                        return true;
                    }

                    @Override
                    public boolean shouldOverrideUrlLoading(WebView popupView, String url) {
                        openPopupUrl(Uri.parse(url));
                        popupView.destroy();
                        return true;
                    }
                });

                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }
        });
    }

    private void applySystemBarInsets(View root) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            return;
        }

        getWindow().setDecorFitsSystemWindows(false);
        root.setOnApplyWindowInsetsListener((view, windowInsets) -> {
            Insets safeArea = windowInsets.getInsets(
                WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()
            );
            view.setPadding(safeArea.left, safeArea.top, safeArea.right, safeArea.bottom);
            return windowInsets;
        });
        root.requestApplyInsets();
    }

    private View createLoadingView() {
        LinearLayout loading = new LinearLayout(this);
        loading.setOrientation(LinearLayout.VERTICAL);
        loading.setGravity(Gravity.CENTER);
        loading.setPadding(48, 48, 48, 48);
        loading.setBackgroundColor(Color.rgb(255, 248, 244));

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.don_padron_icon);
        int logoSize = dp(108);
        loading.addView(logo, new LinearLayout.LayoutParams(logoSize, logoSize));

        TextView title = new TextView(this);
        title.setText(BuildConfig.ADMIN_MODE ? "DON PADRÓN ADMIN" : "DON PADRÓN");
        title.setTextColor(Color.rgb(28, 20, 16));
        title.setTextSize(28);
        title.setGravity(Gravity.CENTER);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        titleParams.topMargin = dp(20);
        loading.addView(title, titleParams);

        TextView subtitle = new TextView(this);
        subtitle.setText(BuildConfig.ADMIN_MODE ? "Abriendo la administración..." : "Abriendo la tienda...");
        subtitle.setTextColor(Color.rgb(113, 104, 96));
        subtitle.setTextSize(16);
        subtitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        subtitleParams.topMargin = dp(8);
        loading.addView(subtitle, subtitleParams);

        ProgressBar progress = new ProgressBar(this);
        LinearLayout.LayoutParams progressParams = new LinearLayout.LayoutParams(dp(42), dp(42));
        progressParams.topMargin = dp(24);
        loading.addView(progress, progressParams);

        return loading;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private boolean shouldOpenInside(Uri uri) {
        String scheme = uri.getScheme();
        String host = uri.getHost();
        boolean isWebUrl = "https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme);
        if (!isWebUrl) {
            return false;
        }

        if (BuildConfig.ADMIN_MODE) {
            return "https".equalsIgnoreCase(scheme);
        }

        return STORE_HOST.equalsIgnoreCase(host);
    }

    private void openPopupUrl(Uri uri) {
        if (BuildConfig.ADMIN_MODE && shouldOpenInside(uri)) {
            webView.loadUrl(uri.toString());
            return;
        }
        openExternal(uri);
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException exception) {
            Toast.makeText(this, "No hay una aplicación disponible para abrir este enlace.", Toast.LENGTH_LONG).show();
        }
    }

    private void showOfflinePage() {
        String html = "<!doctype html><html lang='es'><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
            + "<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff8f4;color:#1c1410;font-family:Arial,sans-serif;text-align:center}"
            + "main{padding:32px;max-width:360px}h1{font-size:28px;margin:0 0 12px}p{color:#716860;line-height:1.55;margin:0 0 24px}"
            + "a{display:inline-flex;min-height:50px;align-items:center;padding:0 24px;border-radius:12px;background:#e31e24;color:white;text-decoration:none;font-weight:700}</style></head>"
            + "<body><main><h1>Sin conexión</h1><p>Revisa los datos móviles o el Wi-Fi y vuelve a intentarlo.</p>"
            + "<a href='" + BuildConfig.START_URL + "'>Volver a intentar</a></main></body></html>";
        webView.loadDataWithBaseURL(BuildConfig.START_URL, html, "text/html", "UTF-8", null);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }

    private class StoreWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (shouldOpenInside(uri)) {
                return false;
            }
            openExternal(uri);
            return true;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            Uri uri = Uri.parse(url);
            if (shouldOpenInside(uri)) {
                return false;
            }
            openExternal(uri);
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (loadingView != null) {
                loadingView.setVisibility(View.GONE);
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            super.onReceivedError(view, request, error);
            if (request.isForMainFrame()) {
                if (loadingView != null) {
                    loadingView.setVisibility(View.GONE);
                }
                showOfflinePage();
            }
        }
    }
}
