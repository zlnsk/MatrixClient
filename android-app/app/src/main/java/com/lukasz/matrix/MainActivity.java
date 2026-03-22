package com.lukasz.matrix;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.animation.ObjectAnimator;
import android.animation.AnimatorSet;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.Vibrator;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.OvershootInterpolator;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
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

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

/**
 * szept — Material 3 inspired WebView wrapper for Matrix messaging.
 *
 * M3 principles applied:
 * - Color: uses szept brand palette (#6359dc primary, #0a0a0c surface)
 * - Shape: M3 extra-large (28dp), large (16dp), medium (12dp) corner radii
 * - Touch: 48dp minimum touch targets
 * - Elevation: M3 tone-based elevation (surface tint, not drop shadows)
 * - Typography: system sans-serif with M3-style weight hierarchy
 * - Motion: emphasis/standard easing curves
 */
public class MainActivity extends Activity {

    private static final String APP_URL = "https://matrix.app.lukasz.com";
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final int PERMISSION_REQUEST = 1002;
    private static final String CHANNEL_ID = "szept_service";
    private static final String MSG_CHANNEL_ID = "szept_messages";

    // szept brand colors
    private static final int COLOR_PRIMARY = Color.parseColor("#6359dc");
    private static final int COLOR_PRIMARY_CONTAINER = Color.parseColor("#463aa6");
    private static final int COLOR_SURFACE = Color.parseColor("#0a0a0c");
    private static final int COLOR_SURFACE_CONTAINER = Color.parseColor("#121215");
    private static final int COLOR_SURFACE_CONTAINER_HIGH = Color.parseColor("#1c1c22");
    private static final int COLOR_ON_SURFACE = Color.parseColor("#f0efeb");
    private static final int COLOR_ON_SURFACE_VARIANT = Color.parseColor("#9ca3af");
    private static final int COLOR_OUTLINE = Color.parseColor("#2a2a32");

    private WebView webView;
    private ValueCallback<Uri[]> fileUploadCallback;
    private FrameLayout rootLayout;
    private View splashView;
    private ProgressBar topProgressBar;
    private boolean splashDismissed = false;
    private Vibrator vibrator;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Edge-to-edge with M3 dark surface system bars
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        Window window = getWindow();
        window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(COLOR_SURFACE);
        window.setNavigationBarColor(COLOR_SURFACE);
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);

        // Root — M3 surface color
        rootLayout = new FrameLayout(this);
        rootLayout.setBackgroundColor(COLOR_SURFACE);
        rootLayout.setFitsSystemWindows(true);
        setContentView(rootLayout);

        // WebView
        webView = new WebView(this);
        webView.setBackgroundColor(COLOR_SURFACE);
        webView.setVisibility(View.INVISIBLE);
        rootLayout.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // M3 linear progress indicator (thin, primary color)
        topProgressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        topProgressBar.setMax(100);
        topProgressBar.setProgress(0);
        topProgressBar.setIndeterminate(false);
        topProgressBar.getProgressDrawable().setColorFilter(
            COLOR_PRIMARY, android.graphics.PorterDuff.Mode.SRC_IN);
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dpToPx(3));
        progressParams.gravity = Gravity.TOP;
        topProgressBar.setLayoutParams(progressParams);
        topProgressBar.setElevation(dpToPx(4));
        rootLayout.addView(topProgressBar);

        createSplashScreen();
        createNotificationChannels();
        requestAllPermissions();
        configureWebView();
        webView.loadUrl(APP_URL);
        startSzeptService();
        requestBatteryOptimization();
    }

    private void createNotificationChannels() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            Class<?> channelClass = Class.forName("android.app.NotificationChannel");
            Constructor<?> ctor = channelClass.getConstructor(String.class, CharSequence.class, int.class);

            Object serviceChannel = ctor.newInstance(CHANNEL_ID, "szept Background", 2);
            Method setDesc = channelClass.getMethod("setDescription", String.class);
            setDesc.invoke(serviceChannel, "Keeps szept connected in the background");
            Method setShowBadge = channelClass.getMethod("setShowBadge", boolean.class);
            setShowBadge.invoke(serviceChannel, false);

            Object msgChannel = ctor.newInstance(MSG_CHANNEL_ID, "Messages", 4);
            setDesc.invoke(msgChannel, "New message notifications");
            Method enableVib = channelClass.getMethod("enableVibration", boolean.class);
            enableVib.invoke(msgChannel, true);
            setShowBadge.invoke(msgChannel, true);

            Method createChannel = NotificationManager.class.getMethod("createNotificationChannel", channelClass);
            createChannel.invoke(nm, serviceChannel);
            createChannel.invoke(nm, msgChannel);
        } catch (Exception ignored) {}
    }

    private void requestAllPermissions() {
        List<String> needed = new ArrayList<>();
        String[] perms = {
            "android.permission.CAMERA",
            "android.permission.RECORD_AUDIO",
            "android.permission.ACCESS_FINE_LOCATION",
            "android.permission.READ_EXTERNAL_STORAGE"
        };
        for (String p : perms) {
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) {
                needed.add(p);
            }
        }
        if (Build.VERSION.SDK_INT >= 33) {
            String[] api33 = {
                "android.permission.READ_MEDIA_IMAGES",
                "android.permission.READ_MEDIA_VIDEO",
                "android.permission.POST_NOTIFICATIONS"
            };
            for (String p : api33) {
                if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) {
                    needed.add(p);
                }
            }
        }
        if (!needed.isEmpty()) {
            requestPermissions(needed.toArray(new String[0]), PERMISSION_REQUEST);
        }
    }

    private void requestBatteryOptimization() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            Method isIgnoring = pm.getClass().getMethod("isIgnoringBatteryOptimizations", String.class);
            boolean ignoring = (boolean) isIgnoring.invoke(pm, getPackageName());
            if (!ignoring) {
                Intent intent = new Intent("android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS");
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            }
        } catch (Exception ignored) {}
    }

    private void startSzeptService() {
        try {
            Intent serviceIntent = new Intent(this, MatrixService.class);
            Method m = Context.class.getMethod("startForegroundService", Intent.class);
            m.invoke(this, serviceIntent);
        } catch (Exception ignored) {}
    }

    @SuppressWarnings("deprecation")
    private void hapticTick() {
        if (vibrator != null && vibrator.hasVibrator()) vibrator.vibrate(10);
    }

    @SuppressWarnings("deprecation")
    private void hapticClick() {
        if (vibrator != null && vibrator.hasVibrator()) vibrator.vibrate(5);
    }

    @SuppressWarnings("deprecation")
    private void hapticHeavy() {
        if (vibrator != null && vibrator.hasVibrator()) vibrator.vibrate(20);
    }

    /**
     * Material 3 splash screen with szept branding.
     * Uses M3 elevation hierarchy: surface → surface-container → primary.
     */
    private void createSplashScreen() {
        LinearLayout splash = new LinearLayout(this);
        splash.setOrientation(LinearLayout.VERTICAL);
        splash.setGravity(Gravity.CENTER);
        splash.setBackgroundColor(COLOR_SURFACE);
        splash.setElevation(dpToPx(8));

        // M3 icon container — extra-large shape (28dp radius)
        FrameLayout iconContainer = new FrameLayout(this);
        LinearLayout.LayoutParams iconContainerParams = new LinearLayout.LayoutParams(dpToPx(96), dpToPx(96));
        iconContainerParams.gravity = Gravity.CENTER;

        // M3 primary container background
        GradientDrawable iconBg = new GradientDrawable();
        iconBg.setShape(GradientDrawable.RECTANGLE);
        iconBg.setCornerRadius(dpToPx(28)); // M3 extra-large shape
        iconBg.setColor(COLOR_PRIMARY);

        // Subtle elevation shadow using darker tint (M3 tonal elevation)
        View shadowView = new View(this);
        GradientDrawable shadowBg = new GradientDrawable();
        shadowBg.setShape(GradientDrawable.RECTANGLE);
        shadowBg.setCornerRadius(dpToPx(28));
        shadowBg.setColor(COLOR_PRIMARY_CONTAINER);
        shadowView.setBackground(shadowBg);
        FrameLayout.LayoutParams shadowParams = new FrameLayout.LayoutParams(dpToPx(96), dpToPx(96));
        shadowParams.gravity = Gravity.CENTER;
        iconContainer.addView(shadowView, shadowParams);

        ImageView icon = new ImageView(this);
        icon.setImageResource(getResources().getIdentifier("ic_launcher", "mipmap", getPackageName()));
        icon.setScaleType(ImageView.ScaleType.CENTER_CROP);
        icon.setBackground(iconBg);
        icon.setClipToOutline(true);
        icon.setOutlineProvider(new android.view.ViewOutlineProvider() {
            @Override
            public void getOutline(View view, android.graphics.Outline outline) {
                outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), dpToPx(28));
            }
        });
        FrameLayout.LayoutParams iconParams = new FrameLayout.LayoutParams(dpToPx(88), dpToPx(88));
        iconParams.gravity = Gravity.CENTER;
        iconContainer.addView(icon, iconParams);
        splash.addView(iconContainer, iconContainerParams);

        // M3 display-small equivalent — app name
        TextView appName = new TextView(this);
        appName.setText("szept");
        appName.setTextColor(COLOR_ON_SURFACE);
        appName.setTextSize(30);
        appName.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        appName.setLetterSpacing(-0.02f);
        appName.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams nameParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        nameParams.gravity = Gravity.CENTER;
        nameParams.topMargin = dpToPx(24);
        splash.addView(appName, nameParams);

        // M3 body-medium subtitle
        TextView subtitle = new TextView(this);
        subtitle.setText("Secure messaging");
        subtitle.setTextColor(COLOR_ON_SURFACE_VARIANT);
        subtitle.setTextSize(14);
        subtitle.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
        subtitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        subParams.gravity = Gravity.CENTER;
        subParams.topMargin = dpToPx(8);
        splash.addView(subtitle, subParams);

        // M3 circular progress indicator
        ProgressBar spinner = new ProgressBar(this);
        spinner.setIndeterminate(true);
        spinner.getIndeterminateDrawable().setColorFilter(
            COLOR_PRIMARY, android.graphics.PorterDuff.Mode.SRC_IN);
        LinearLayout.LayoutParams spinnerParams = new LinearLayout.LayoutParams(dpToPx(40), dpToPx(40));
        spinnerParams.gravity = Gravity.CENTER;
        spinnerParams.topMargin = dpToPx(48);
        splash.addView(spinner, spinnerParams);

        rootLayout.addView(splash, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        splashView = splash;

        // M3 emphasized entrance animation
        icon.setAlpha(0f);
        icon.setScaleX(0.6f);
        icon.setScaleY(0.6f);
        appName.setAlpha(0f);
        appName.setTranslationY(dpToPx(20));
        subtitle.setAlpha(0f);
        spinner.setAlpha(0f);

        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override
            public void run() {
                ObjectAnimator iconAlpha = ObjectAnimator.ofFloat(icon, "alpha", 0f, 1f);
                ObjectAnimator iconScaleX = ObjectAnimator.ofFloat(icon, "scaleX", 0.6f, 1f);
                ObjectAnimator iconScaleY = ObjectAnimator.ofFloat(icon, "scaleY", 0.6f, 1f);
                AnimatorSet iconAnim = new AnimatorSet();
                iconAnim.playTogether(iconAlpha, iconScaleX, iconScaleY);
                iconAnim.setDuration(600);
                iconAnim.setInterpolator(new OvershootInterpolator(1.2f));
                iconAnim.start();

                hapticTick();

                new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                    @Override
                    public void run() {
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
                    }
                }, 200);
            }
        }, 100);
    }

    private void dismissSplash() {
        if (splashDismissed || splashView == null) return;
        splashDismissed = true;

        hapticHeavy();

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

        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override
            public void run() {
                if (splashView != null) {
                    rootLayout.removeView(splashView);
                    splashView = null;
                }
            }
        }, 400);
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();

        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSaveFormData(true);

        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        String baseUA = settings.getUserAgentString();
        settings.setUserAgentString(baseUA + " SzeptAndroid/2.2");

        // Viewport — perfect phone fit, no zoom
        settings.setUseWideViewPort(false);
        settings.setLoadWithOverviewMode(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);

        settings.setGeolocationEnabled(true);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);
        cookieManager.flush();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.contains("matrix.app.lukasz.com")) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) {}
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);

                String viewportJS =
                    "var m = document.querySelector('meta[name=viewport]');" +
                    "if (!m) { m = document.createElement('meta'); m.name='viewport'; document.head.appendChild(m); }" +
                    "m.content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';";
                view.evaluateJavascript(viewportJS, null);

                String hapticBridge =
                    "if (!window.__szeptHapticsInjected) { " +
                    "  window.__szeptHapticsInjected = true; " +
                    "  document.addEventListener('touchstart', function(e) { " +
                    "    var el = e.target.closest('button, a, [role=button], [data-haptic]'); " +
                    "    if (el) { try { Android.hapticTick(); } catch(ex) {} } " +
                    "  }, {passive: true}); " +
                    "}";
                view.evaluateJavascript(hapticBridge, null);

                new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        dismissSplash();
                    }
                }, 500);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request != null && request.isForMainFrame()) {
                    view.loadData(getErrorHtml(), "text/html", "UTF-8");
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                topProgressBar.setProgress(newProgress);
                if (newProgress >= 100) {
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
                hapticClick();
                if (fileUploadCallback != null) fileUploadCallback.onReceiveValue(null);
                fileUploadCallback = filePathCallback;
                try {
                    startActivityForResult(fileChooserParams.createIntent(), FILE_CHOOSER_REQUEST);
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

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin,
                    GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, true);
            }
        });

        webView.setBackgroundColor(COLOR_SURFACE);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.addJavascriptInterface(new HapticInterface(), "Android");
    }

    private class HapticInterface {
        @android.webkit.JavascriptInterface
        public void hapticTick() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    MainActivity.this.hapticTick();
                }
            });
        }

        @android.webkit.JavascriptInterface
        public void hapticClick() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    MainActivity.this.hapticClick();
                }
            });
        }

        @android.webkit.JavascriptInterface
        public void hapticHeavy() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    MainActivity.this.hapticHeavy();
                }
            });
        }
    }

    /**
     * M3-styled error page — uses surface-container, primary button with M3 shape (full radius).
     */
    private String getErrorHtml() {
        return "<html><head><meta name='viewport' content='width=device-width, initial-scale=1, viewport-fit=cover'>" +
            "<style>" +
            "body { background: #0a0a0c; color: #f0efeb; font-family: -apple-system, 'Roboto', sans-serif; " +
            "display: flex; flex-direction: column; align-items: center; justify-content: center; " +
            "height: 100vh; height: 100dvh; margin: 0; " +
            "padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }" +
            ".icon { font-size: 64px; margin-bottom: 24px; }" +
            "h2 { color: #f0efeb; font-size: 22px; margin-bottom: 8px; font-weight: 500; letter-spacing: -0.01em; }" +
            "p { color: #9ca3af; font-size: 14px; margin-bottom: 32px; text-align: center; line-height: 1.6; }" +
            "button { background: #6359dc; color: white; border: none; padding: 14px 32px; " +
            "border-radius: 100px; font-size: 15px; font-weight: 500; cursor: pointer; " +
            "min-height: 48px; min-width: 120px; letter-spacing: 0.02em; " +
            "-webkit-tap-highlight-color: transparent; }" +
            "button:active { opacity: 0.88; background: #5548c4; }" +
            "</style></head><body>" +
            "<div class='icon'>\uD83D\uDCE1</div>" +
            "<h2>No Connection</h2>" +
            "<p>Unable to reach the server.<br>Check your internet connection and try again.</p>" +
            "<button onclick='window.location.href=\"" + APP_URL + "\"'>Retry</button>" +
            "</body></html>";
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            hapticClick();
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST && fileUploadCallback != null) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
            }
            fileUploadCallback.onReceiveValue(results);
            fileUploadCallback = null;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {}

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) { webView.onResume(); webView.resumeTimers(); }
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) { webView.stopLoading(); webView.destroy(); }
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Uri data = intent.getData();
        if (data != null && webView != null) webView.loadUrl(data.toString());
    }

    private int dpToPx(int dp) {
        return (int) (dp * getResources().getDisplayMetrics().density);
    }
}
