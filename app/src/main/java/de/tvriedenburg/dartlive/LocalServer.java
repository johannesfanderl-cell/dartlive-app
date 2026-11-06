package de.tvriedenburg.dartlive;

import android.content.Context;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceResponse;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * Ersatz für den Chromebook-Server, wenn die App „ohne Server“ läuft:
 * liefert die Seiten aus der App und speichert Spielstand und Bestenliste auf dem Tablet.
 * GET-Anfragen kommen über WebView-Abfangen, Schreibzugriffe über window.DartLocal.call(...).
 */
public class LocalServer {

    public static final String HOST = "dartlokal";
    public static final String BASE = "http://" + HOST;

    private static LocalServer instance;

    public static synchronized LocalServer get(Context ctx) {
        if (instance == null) instance = new LocalServer(ctx.getApplicationContext());
        return instance;
    }

    private final Context ctx;
    private final Object lock = new Object();
    private JSONObject state;
    private JSONArray results;

    private LocalServer(Context ctx) {
        this.ctx = ctx;
        state = readJson("live.json");
        if (state == null) state = new JSONObject();
        try {
            if (!state.has("v")) state.put("v", 1);
            if (!state.has("boards")) state.put("boards", new JSONObject());
            if (!state.has("names")) state.put("names", new JSONArray());
            JSONObject b = state.getJSONObject("boards");
            for (int i = 1; i <= 5; i++) if (!b.has(String.valueOf(i))) b.put(String.valueOf(i), new JSONObject().put("status", "idle"));
        } catch (Exception ignored) { }
        JSONObject r = readJson("results.json");
        results = r != null ? r.optJSONArray("results") : null;
        if (results == null) results = new JSONArray();
    }

    /* ---------- Dateien ---------- */
    private JSONObject readJson(String name) {
        File f = new File(ctx.getFilesDir(), name);
        if (!f.exists()) return null;
        try (FileInputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[(int) f.length()];
            int off = 0, n;
            while (off < buf.length && (n = in.read(buf, off, buf.length - off)) > 0) off += n;
            return new JSONObject(new String(buf, 0, off, StandardCharsets.UTF_8));
        } catch (Exception e) {
            return null;
        }
    }

    private void writeJson(String name, JSONObject o) {
        File tmp = new File(ctx.getFilesDir(), name + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(o.toString().getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            return;
        }
        tmp.renameTo(new File(ctx.getFilesDir(), name));
    }

    private void changed() {
        try { state.put("v", state.optInt("v", 1) + 1); } catch (Exception ignored) { }
        writeJson("live.json", state);
        lock.notifyAll();
    }

    /* ---------- Schreibzugriffe aus der Seite ---------- */
    @JavascriptInterface
    public String call(String method, String url, String body) {
        String path = Uri.parse(url).getPath();
        if (path == null) path = "/";
        try {
            synchronized (lock) {
                if ("GET".equals(method)) return getJson(path, null);
                if (path.matches("/api/board/[1-5]")) {
                    JSONObject b = new JSONObject(body);
                    if (("play".equals(b.optString("status")) || "training".equals(b.optString("status"))) && b.optJSONArray("players") != null) {
                        JSONArray pl = b.getJSONArray("players");
                        for (int i = 0; i < pl.length(); i++) {
                            String n = pl.getJSONObject(i).optString("name", "").trim();
                            if (!n.isEmpty()) addName(n);
                        }
                    }
                    state.getJSONObject("boards").put(path.substring(path.length() - 1), b);
                    changed();
                    return new JSONObject().put("ok", true).put("v", state.optInt("v")).toString();
                }
                if ("POST".equals(method) && path.equals("/api/results")) {
                    Object parsed = body.trim().startsWith("[") ? new JSONArray(body) : new JSONArray().put(new JSONObject(body));
                    JSONArray list = (JSONArray) parsed, ids = new JSONArray();
                    String now = isoNow();
                    for (int i = 0; i < list.length() && i < 10; i++) {
                        JSONObject r = list.optJSONObject(i);
                        if (r == null) continue;
                        String id = Long.toString(System.currentTimeMillis(), 36) + Integer.toString((int) (Math.random() * 1679616), 36);
                        ids.put(id);
                        results.put(new JSONObject().put("id", id).put("name", r.optString("name")).put("game", r.optString("game"))
                                .put("variant", r.optString("variant")).put("score", r.optDouble("score", 0)).put("detail", r.optString("detail")).put("date", now));
                    }
                    saveResults();
                    changed();
                    return new JSONObject().put("ok", true).put("ids", ids).toString();
                }
                if ("DELETE".equals(method) && path.startsWith("/api/results/")) {
                    String id = path.substring("/api/results/".length());
                    JSONArray keep = new JSONArray();
                    for (int i = 0; i < results.length(); i++) {
                        JSONObject r = results.getJSONObject(i);
                        if (!id.equals(r.optString("id"))) keep.put(r);
                    }
                    results = keep;
                    saveResults();
                    changed();
                    return "{\"ok\":true}";
                }
            }
        } catch (Exception e) {
            return "{\"error\":\"" + e.getMessage() + "\"}";
        }
        return "{\"error\":\"unbekannt\"}";
    }

    private void addName(String n) throws Exception {
        JSONArray old = state.getJSONArray("names"), neu = new JSONArray();
        neu.put(n);
        for (int i = 0; i < old.length() && neu.length() < 40; i++) if (!old.getString(i).equalsIgnoreCase(n)) neu.put(old.getString(i));
        state.put("names", neu);
    }

    private void saveResults() throws Exception {
        while (results.length() > 5000) results.remove(0);
        writeJson("results.json", new JSONObject().put("results", results));
    }

    private static String isoNow() {
        java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US);
        f.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        return f.format(new java.util.Date());
    }

    /** Lesezugriffe (unter der Sperre aufrufen). */
    private String getJson(String path, Uri uri) throws Exception {
        if (path.equals("/api/results")) return new JSONObject().put("results", results).toString();
        if (path.equals("/api/wait") && uri != null) {
            int v = 0;
            try { v = Integer.parseInt(uri.getQueryParameter("v")); } catch (Exception ignored) { }
            long end = System.currentTimeMillis() + 20000;
            while (state.optInt("v") == v && System.currentTimeMillis() < end) lock.wait(Math.max(1, end - System.currentTimeMillis()));
        }
        return state.toString();
    }

    /* ---------- Seiten und GET-Anfragen ---------- */
    private static final Map<String, String> PAGES = new HashMap<>();
    static {
        PAGES.put("/", "index.html");
        for (int i = 1; i <= 5; i++) {
            PAGES.put("/" + i, "tablet.html");
            PAGES.put("/t" + i, "training.html");
            PAGES.put("/m" + i, "tv.html");
        }
        PAGES.put("/tv", "tv.html"); PAGES.put("/tv1", "tv.html"); PAGES.put("/tv2", "tv.html"); PAGES.put("/tv3", "tv.html");
        PAGES.put("/bestenliste", "best.html");
        PAGES.put("/diag", "diag.html");
        PAGES.put("/icon.svg", "icon.svg");
        PAGES.put("/local.js", "local.js");
        PAGES.put("/local-core.js", "local-core.js");
        PAGES.put("/turnier", "turnier.html"); PAGES.put("/turnier-tv", "turnier-tv.html");
        PAGES.put("/liga", "liga.html"); PAGES.put("/liga-tv", "liga-tv.html"); PAGES.put("/liga-bericht", "liga-bericht.html");
        PAGES.put("/statistik", "statistik.html"); PAGES.put("/statistik-tv", "statistik-tv.html");
    }

    public WebResourceResponse intercept(Uri uri, String method) {
        if (!HOST.equals(uri.getHost())) return null;
        String path = uri.getPath();
        if (path == null || path.isEmpty()) path = "/";
        if (path.length() > 1 && path.endsWith("/")) path = path.substring(0, path.length() - 1);
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        try {
            if (path.startsWith("/api/")) {
                String json;
                synchronized (lock) { json = getJson(path, uri); }
                return new WebResourceResponse("application/json", "utf-8", 200, "OK", headers,
                        new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
            }
            String file = PAGES.get(path);
            if (file == null && path.matches("/[a-z0-9-]+")) {
                // neue Seiten automatisch: /name -> name.html
                try { ctx.getAssets().open(path.substring(1) + ".html").close(); file = path.substring(1) + ".html"; } catch (Exception ignored) { }
            }
            if (file == null) return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers, new ByteArrayInputStream(new byte[0]));
            InputStream in = ctx.getAssets().open(file);
            String mime = file.endsWith(".svg") ? "image/svg+xml" : (file.endsWith(".js") ? "application/javascript" : "text/html");
            return new WebResourceResponse(mime, "utf-8", 200, "OK", headers, in);
        } catch (Exception e) {
            return new WebResourceResponse("text/plain", "utf-8", 500, "Error", headers, new ByteArrayInputStream(new byte[0]));
        }
    }
}
