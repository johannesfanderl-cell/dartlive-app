package de.tvriedenburg.dartlive;

import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** Funktionen des Geräts für die Webseiten: Sprachausgabe (Caller) und Dateien speichern. */
public class DartApp {
    private static TextToSpeech tts;
    private static boolean ready = false;
    private final Context ctx;

    public DartApp(Context ctx) {
        this.ctx = ctx.getApplicationContext();
        if (tts == null) {
            tts = new TextToSpeech(this.ctx, status -> {
                if (status == TextToSpeech.SUCCESS) {
                    int r = tts.setLanguage(Locale.GERMANY);
                    if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) tts.setLanguage(Locale.GERMAN);
                    tts.setSpeechRate(1.05f);
                    ready = true;
                }
            });
        }
    }

    @JavascriptInterface
    public void say(String text) {
        if (tts != null && ready && text != null) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "dart");
    }

    @JavascriptInterface
    public String saveFile(String name, String content) {
        try {
            byte[] data = content.getBytes(StandardCharsets.UTF_8);
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                v.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Dart-Sicherungen");
                Uri uri = ctx.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) return "kein Zugriff auf Downloads";
                try (OutputStream out = ctx.getContentResolver().openOutputStream(uri)) { out.write(data); }
            } else {
                File dir = ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                try (FileOutputStream out = new FileOutputStream(new File(dir, name))) { out.write(data); }
            }
            return "ok";
        } catch (Exception e) {
            return e.getMessage();
        }
    }
}
