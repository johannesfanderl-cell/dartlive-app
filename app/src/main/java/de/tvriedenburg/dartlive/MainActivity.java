package de.tvriedenburg.dartlive;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Presentation;
import android.content.Context;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.hardware.display.DisplayManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Display;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Dart Live: Am Tablet läuft die Eingabe (Server/1..5),
 * auf dem per HDMI angeschlossenen Monitor nur der Spielstand (Server/m1..m5).
 */
public class MainActivity extends Activity {

    private static final String PREFS = "dartlive";
    private static final String DEFAULT_SERVER = "http://192.168.68.222:3000";

    private SharedPreferences prefs;
    private WebView web;
    private ScoreDisplay scoreDisplay;
    private DisplayManager displayManager;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private final DisplayManager.DisplayListener displayListener = new DisplayManager.DisplayListener() {
        @Override public void onDisplayAdded(int displayId) { updateScoreDisplay(); }
        @Override public void onDisplayRemoved(int displayId) { updateScoreDisplay(); }
        @Override public void onDisplayChanged(int displayId) { updateScoreDisplay(); }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        displayManager = (DisplayManager) getSystemService(Context.DISPLAY_SERVICE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = createWebView(this, true);
        setContentView(web);
        hideSystemBars();

        if (!prefs.contains("board")) {
            showSettings(true);
        } else {
            loadAll();
        }
    }

    private String server() {
        String s = prefs.getString("server", DEFAULT_SERVER).trim();
        if (!s.startsWith("http://") && !s.startsWith("https://")) s = "http://" + s;
        while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        return s;
    }

    private int board() { return prefs.getInt("board", 1); }

    private String inputUrl() { return server() + "/" + getString(R.string.start_prefix) + board(); }

    private String scoreUrl() { return server() + "/m" + board(); }

    private void loadAll() {
        open(web, inputUrl(), true);
        if (scoreDisplay != null) { scoreDisplay.dismiss(); scoreDisplay = null; }
        updateScoreDisplay();
    }

    /** Zeigt den Spielstand auf dem HDMI-Monitor, sobald einer angeschlossen ist. */
    private void updateScoreDisplay() {
        if (isFinishing() || !prefs.contains("board")) return;
        Display[] displays = displayManager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION);
        Display target = displays.length > 0 ? displays[0] : null;

        if (scoreDisplay != null && (target == null || scoreDisplay.getDisplay().getDisplayId() != target.getDisplayId())) {
            scoreDisplay.dismiss();
            scoreDisplay = null;
        }
        if (target != null && scoreDisplay == null) {
            try {
                scoreDisplay = new ScoreDisplay(this, target, scoreUrl());
                scoreDisplay.show();
            } catch (WindowManager.InvalidDisplayException e) {
                scoreDisplay = null;
            }
        }
    }

    @Override
    protected void onStart() {
        super.onStart();
        displayManager.registerDisplayListener(displayListener, handler);
        updateScoreDisplay();
    }

    @Override
    protected void onStop() {
        super.onStop();
        displayManager.unregisterDisplayListener(displayListener);
    }

    @Override
    protected void onDestroy() {
        if (scoreDisplay != null) { scoreDisplay.dismiss(); scoreDisplay = null; }
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    /** Zurück-Taste öffnet das Menü statt die App zu schließen. */
    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        String[] items = { "Neu laden", "Einstellungen (Scheibe / Server)", "App beenden" };
        new AlertDialog.Builder(this)
                .setTitle(getString(R.string.app_name) + " – Scheibe " + board())
                .setItems(items, new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int which) {
                        if (which == 0) loadAll();
                        else if (which == 1) showSettings(false);
                        else finish();
                    }
                })
                .setNegativeButton("Abbrechen", null)
                .show();
    }

    private void showSettings(final boolean firstStart) {
        int pad = dp(20);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(pad, pad / 2, pad, 0);

        TextView l1 = new TextView(this);
        l1.setText("An welcher Scheibe steht dieses Tablet?");
        l1.setTextSize(18);
        box.addView(l1);

        final RadioGroup boards = new RadioGroup(this);
        boards.setOrientation(RadioGroup.HORIZONTAL);
        for (int i = 1; i <= 5; i++) {
            RadioButton rb = new RadioButton(this);
            rb.setText(String.valueOf(i));
            rb.setTextSize(22);
            rb.setId(1000 + i);
            rb.setPadding(0, 0, dp(12), 0);
            boards.addView(rb);
        }
        boards.check(1000 + board());
        box.addView(boards);

        TextView l2 = new TextView(this);
        l2.setText("\nAdresse des Servers (Chromebook):");
        l2.setTextSize(18);
        box.addView(l2);

        final EditText serverField = new EditText(this);
        serverField.setText(prefs.getString("server", DEFAULT_SERVER));
        serverField.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        serverField.setSingleLine(true);
        serverField.setTextSize(20);
        box.addView(serverField);

        AlertDialog.Builder b = new AlertDialog.Builder(this)
                .setTitle("Einstellungen")
                .setView(box)
                .setCancelable(!firstStart)
                .setPositiveButton("Speichern", new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int which) {
                        int checked = boards.getCheckedRadioButtonId();
                        int n = checked >= 1001 && checked <= 1005 ? checked - 1000 : 1;
                        String s = serverField.getText().toString().trim();
                        if (s.isEmpty()) s = DEFAULT_SERVER;
                        prefs.edit().putInt("board", n).putString("server", s).apply();
                        Toast.makeText(MainActivity.this, "Scheibe " + n + " gespeichert", Toast.LENGTH_SHORT).show();
                        loadAll();
                    }
                });
        if (!firstStart) b.setNegativeButton("Abbrechen", null);
        b.show();
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    /** WebView mit automatischem Neuversuch, falls der Server (noch) nicht erreichbar ist. */
    static WebView createWebView(Context ctx, final boolean input) {
        final WebView w = new WebView(ctx);
        w.setBackgroundColor(Color.rgb(7, 29, 71));
        w.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setTextZoom(100);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        w.setWebViewClient(new Client(input));
        return w;
    }

    /** Seite, die angezeigt wird, solange der Server nicht antwortet. */
    static String statusPage(String title, String url, boolean input, boolean retry) {
        return "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>"
                + "<body style='background:#071d47;color:#fff;font-family:Arial;text-align:center;padding:12vh 4vw 0'>"
                + "<h1 style='font-size:6vmin;margin:0 0 3vmin'>" + title + "</h1>"
                + "<p style='font-size:4vmin;margin:0 0 4vmin'>" + url + "</p>"
                + (retry ? "<p style='font-size:3.5vmin;color:#b7d3ff'>Läuft der Server auf dem Chromebook?<br>Ist das Gerät im WLAN „TVR Dart“?</p>"
                         + "<p style='font-size:3.5vmin;color:#b7d3ff'>Neuer Versuch in 5 Sekunden …</p>" : "")
                + (input ? "<p style='font-size:3vmin;color:#b7d3ff'>Zurück-Taste: Menü mit Einstellungen</p>" : "")
                + (retry ? "<script>setTimeout(function(){location.href='" + url.replace("'", "") + "'},5000)</script>" : "")
                + "</body></html>";
    }

    /** Lädt eine Seite und zeigt sofort „Verbinde …“; nach 10 s ohne Antwort eine Fehlermeldung. */
    static void open(final WebView w, final String url, boolean input) {
        w.loadDataWithBaseURL(null, statusPage("Verbinde mit dem Server …", url, input, false), "text/html", "utf-8", null);
        w.postDelayed(new Runnable() { @Override public void run() { w.loadUrl(url); } }, 400);
    }

    static class Client extends WebViewClient {
        private final boolean input;
        private final Handler timer = new Handler(Looper.getMainLooper());
        private Runnable pending;

        Client(boolean input) { this.input = input; }

        private void cancel() { if (pending != null) { timer.removeCallbacks(pending); pending = null; } }

        private void fail(WebView view, String url) {
            cancel();
            view.stopLoading();
            view.loadDataWithBaseURL(null, statusPage("Server nicht erreichbar", url, input, true), "text/html", "utf-8", null);
        }

        @Override
        public void onPageStarted(final WebView view, final String url, android.graphics.Bitmap favicon) {
            cancel();
            if (url == null || !url.startsWith("http")) return;
            pending = new Runnable() { @Override public void run() { pending = null; fail(view, url); } };
            timer.postDelayed(pending, 10000);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (url != null && url.startsWith("http")) cancel();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) fail(view, request.getUrl().toString());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return false;
        }
    }

    /** Der Spielstand auf dem zweiten Bildschirm (HDMI). */
    static class ScoreDisplay extends Presentation {
        private final String url;

        ScoreDisplay(Context outer, Display display, String url) {
            super(outer, display, android.R.style.Theme_Material_NoActionBar_Fullscreen);
            this.url = url;
        }

        @Override
        protected void onCreate(Bundle savedInstanceState) {
            super.onCreate(savedInstanceState);
            WebView w = createWebView(getContext(), false);
            setContentView(w);
            open(w, url, false);
        }
    }
}
