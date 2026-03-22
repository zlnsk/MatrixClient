package com.lukasz.matrix;

import android.app.Activity;
import android.animation.ObjectAnimator;
import android.animation.AnimatorSet;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.OvershootInterpolator;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.content.Intent;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

public class MainActivity extends Activity {

    private static final String APP_URL = "https://matrix.app.lukasz.com";
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final int PERMISSION_REQUEST = 1002;

    private WebView webView;
    private ValueCallback<Uri[]> fileUploadCallback;
    private FrameLayout rootLayout;
    private View splashView;
    private ProgressBar topProgressBar;
    private boolean splashDismissed = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Full-screen with colored status bar
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        Window window = getWindow();
        window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(Color.parseColor("#111827"));
        if (Build.VERSION.SDK_INT >= 26) {
            window.setNavigationBarColor(Color.parseColor("#111827"));
        }

        // Root layout
        rootLayout = new FrameLayout(this);
        rootLayout.setBackgroundColor(Color.parseColor("#111827"));
        setContentView(rootLayout);

        // Create WebView
        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#111827"));
        webView.setVisibility(View.INVISIBLE);
        rootLayout.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // Top progress bar (thin line at top)
        topProgressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        topProgressBar.setMax(100);
        topProgressBar.setProgress(0);
        topProgressBar.setIndeterminate(false);
        topProgressBar.getProgressDrawable().setColorFilter(
            Color.parseColor("#6366f1"), android.graphics.PorterDuff.Mode.SRC_IN);
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dpToPx(3));
        progressParams.gravity = Gravity.TOP;
        topProgressBar.setLayoutParams(progressParams);
        rootLayout.addView(topProgressBar);

        // Create splash screen
        createSplashScreen();

        // Configure and load
        configureWebView();
        webView.loadUrl(APP_URL);
    }

    private void createSplashScreen() {
        // Splash overlay
        LinearLayout splash = new LinearLayout(this);
        splash.setOrientation(LinearLayout.VERTICAL);
        splash.setGravity(Gravity.CENTER);
        splash.setBackgroundColor(Color.parseColor("#111827"));
        splash.setElevation(dpToPx(8));

        // App icon container with shadow
        FrameLayout iconContainer = new FrameLayout(this);
        LinearLayout.LayoutParams iconContainerParams = new LinearLayout.LayoutParams(dpToPx(96), dpToPx(96));
        iconContainerParams.gravity = Gravity.CENTER;

        // Rounded background for icon
        GradientDrawable iconBg = new GradientDrawable();
        iconBg.setShape(GradientDrawable.RECTANGLE);
        iconBg.setCornerRadius(dpToPx(24));
        iconBg.setColor(Color.parseColor("#4f46e5"));

        // Shadow container
        View shadowView = new View(this);
        GradientDrawable shadowBg = new GradientDrawable();
        shadowBg.setShape(GradientDrawable.RECTANGLE);
        shadowBg.setCornerRadius(dpToPx(24));
        shadowBg.setColor(Color.parseColor("#3730a3"));
        shadowView.setBackground(shadowBg);
        FrameLayout.LayoutParams shadowParams = new FrameLayout.LayoutParams(dpToPx(96), dpToPx(96));
        shadowParams.gravity = Gravity.CENTER;
        iconContainer.addView(shadowView, shadowParams);

        // Icon image
        ImageView icon = new ImageView(this);
        icon.setImageResource(getResources().getIdentifier("ic_launcher", "mipmap", getPackageName()));
        icon.setScaleType(ImageView.ScaleType.CENTER_CROP);
        icon.setBackground(iconBg);
        icon.setClipToOutline(true);
        icon.setOutlineProvider(new android.view.ViewOutlineProvider() {
            @Override
            public void getOutline(View view, android.graphics.Outline outline) {
                outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), dpToPx(24));
            }
        });
        FrameLayout.LayoutParams iconParams = new FrameLayout.LayoutParams(dpToPx(88), dpToPx(88));
        iconParams.gravity = Gravity.CENTER;
        iconContainer.addView(icon, iconParams);
        splash.addView(iconContainer, iconContainerParams);

        // App name
        TextView appName = new TextView(this);
        appName.setText("Matrix");
        appName.setTextColor(Color.WHITE);
        appName.setTextSize(28);
        appName.setTypeface(android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL));
        appName.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams nameParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        nameParams.gravity = Gravity.CENTER;
        nameParams.topMargin = dpToPx(24);
        splash.addView(appName, nameParams);

        // Subtitle
        TextView subtitle = new TextView(this);
        subtitle.setText("Secure messaging");
        subtitle.setTextColor(Color.parseColor("#9ca3af"));
        subtitle.setTextSize(14);
        subtitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        subParams.gravity = Gravity.CENTER;
        subParams.topMargin = dpToPx(8);
        splash.addView(subtitle, subParams);

        // Loading spinner
        ProgressBar spinner = new ProgressBar(this);
        spinner.setIndeterminate(true);
        spinner.getIndeterminateDrawable().setColorFilter(
            Color.parseColor("#6366f1"), android.graphics.PorterDuff.Mode.SRC_IN);
        LinearLayout.LayoutParams spinnerParams = new LinearLayout.LayoutParams(dpToPx(36), dpToPx(36));
        spinnerParams.gravity = Gravity.CENTER;
        spinnerParams.topMargin = dpToPx(48);
        splash.addView(spinner, spinnerParams);

        rootLayout.addView(splash, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        splashView = splash;

        // Animate entrance
        icon.setAlpha(0f);
        icon.setScaleX(0.6f);
        icon.setScaleY(0.6f);
        appName.setAlpha(0f);
        appName.setTranslationY(dpToPx(20));
        subtitle.setAlpha(0f);
        spinner.setAlpha(0f);

        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            // Icon entrance with overshoot
            ObjectAnimator iconAlpha = ObjectAnimator.ofFloat(icon, "alpha", 0f, 1f);
            ObjectAnimator iconScaleX = ObjectAnimator.ofFloat(icon, "scaleX", 0.6f, 1f);
            ObjectAnimator iconScaleY = ObjectAnimator.ofFloat(icon, "scaleY", 0.6f, 1f);
            AnimatorSet iconAnim = new AnimatorSet();
            iconAnim.playTogether(iconAlpha, iconScaleX, iconScaleY);
            iconAnim.setDuration(600);
            iconAnim.setInterpolator(new OvershootInterpolator(1.2f));
            iconAnim.start();

            // Title entrance
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                ObjectAnimator nameAlpha = ObjectAnimator.ofFloat(appName, "alpha", 0f, 1f);
                ObjectAnimator nameSlide = ObjectAnimator.ofFloat(appName, "translationY", dpToPx(20), 0f);
                AnimatorSet nameAnim = new AnimatorSet();
                nameAnim.playTogether(nameAlpha, nameSlide);
                nameAnim.setDuration(400);
                nameAnim.setInterpolator(new DecelerateInterpolator());
                nameAnim.start();

                ObjectAnimator subAlpha = ObjectAnimator.ofFloat(subtitle, "alpha", 0f, 1f);
                subAlpha.setStartDelay(150);
                subAlpha.setDuration(400);
                subAlpha.start();

                ObjectAnimator spinAlpha = ObjectAnimator.ofFloat(spinner, "alpha", 0f, 1f);
                spinAlpha.setStartDelay(300);
                spinAlpha.setDuration(400);
                spinAlpha.start();
            }, 200);
        }, 100);
    }

    private void dismissSplash() {
        if (splashDismissed || splashView == null) return;
        splashDismissed = true;

        webView.setVisibility(View.VISIBLE);
        webView.setAlpha(0f);

        ObjectAnimator webFadeIn = ObjectAnimator.ofFloat(webView, "alpha", 0f, 1f);
        webFadeIn.setDuration(300);
        webFadeIn.setInterpolator(new AccelerateDecelerateInterpolator());
        webFadeIn.start();

        ObjectAnimator splashFade = ObjectAnimator.ofFloat(splashView, "alpha", 1f, 0f);
        splashFade.setDuration(350);
        splashFade.setInterpolator(new AccelerateDecelerateInterpolator());
        splashFade.start();

        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (splashView != null) {
                rootLayout.removeView(splashView);
                splashView = null;
            }
        }, 400);
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();

        // Core web features
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Modern web features
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(settings.getUserAgentString() + " MatrixAndroid/1.0");

        // Viewport
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);

        // Enable cookies
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        // WebViewClient
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.contains("matrix.app.lukasz.com")) {
                    return false;
                }
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                startActivity(intent);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // Dismiss splash after first page load
                new Handler(Looper.getMainLooper()).postDelayed(() -> dismissSplash(), 500);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                // Only handle main frame errors
                if (request != null && request.isForMainFrame()) {
                    view.loadData(getErrorHtml(), "text/html", "UTF-8");
                }
            }
        });

        // WebChromeClient — handle file uploads, permissions, and progress
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                topProgressBar.setProgress(newProgress);
                if (newProgress >= 100) {
                    // Fade out progress bar
                    ObjectAnimator fadeOut = ObjectAnimator.ofFloat(topProgressBar, "alpha", 1f, 0f);
                    fadeOut.setDuration(300);
                    fadeOut.setStartDelay(200);
                    fadeOut.start();
                } else {
                    topProgressBar.setAlpha(1f);
                }
            }

            @Override
            public boolean onShowFileChooser(WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams) {
                if (fileUploadCallback != null) {
                    fileUploadCallback.onReceiveValue(null);
                }
                fileUploadCallback = filePathCallback;

                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (Exception e) {
                    fileUploadCallback = null;
                    return false;
                }
                return true;
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.grant(request.getResources());
            }
        });

        webView.setBackgroundColor(Color.parseColor("#111827"));

        // Enable smooth scrolling and overscroll effects
        webView.setOverScrollMode(View.OVER_SCROLL_ALWAYS);
        webView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
    }

    private String getErrorHtml() {
        return "<html><head><meta name='viewport' content='width=device-width, initial-scale=1'>" +
            "<style>" +
            "body { background: #111827; color: #fff; font-family: sans-serif; display: flex; " +
            "flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }" +
            ".icon { font-size: 64px; margin-bottom: 24px; }" +
            "h2 { color: #f3f4f6; font-size: 20px; margin-bottom: 8px; font-weight: 600; }" +
            "p { color: #9ca3af; font-size: 14px; margin-bottom: 32px; text-align: center; line-height: 1.5; }" +
            "button { background: #6366f1; color: white; border: none; padding: 14px 32px; " +
            "border-radius: 12px; font-size: 16px; font-weight: 500; cursor: pointer; " +
            "box-shadow: 0 4px 12px rgba(99,102,241,0.4); }" +
            "button:active { transform: scale(0.96); background: #4f46e5; }" +
            "</style></head><body>" +
            "<div class='icon'>📡</div>" +
            "<h2>No Connection</h2>" +
            "<p>Unable to reach the server.<br>Check your internet connection and try again.</p>" +
            "<button onclick='window.location.href=\"" + APP_URL + "\"'>Retry</button>" +
            "</body></html>";
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
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (fileUploadCallback != null) {
                Uri[] results = null;
                if (resultCode == RESULT_OK && data != null) {
                    String dataString = data.getDataString();
                    if (dataString != null) {
                        results = new Uri[]{Uri.parse(dataString)};
                    }
                }
                fileUploadCallback.onReceiveValue(results);
                fileUploadCallback = null;
            }
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        webView.onPause();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }

    private int dpToPx(int dp) {
        return (int) (dp * getResources().getDisplayMetrics().density);
    }
}
