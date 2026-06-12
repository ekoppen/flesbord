package nl.defles.bord;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.Toast;

/**
 * De Fles — kiosk-app voor Chromecast met Google TV / Android TV.
 * Toont het TV-krijtbord fullscreen, houdt het scherm aan en herstelt
 * zichzelf als de server even onbereikbaar is.
 *
 * Bediening met de afstandsbediening:
 *  - BACK lang indrukken  -> adres (URL) van het bord wijzigen
 *  - BACK twee keer kort  -> app afsluiten
 */
public class MainActivity extends Activity {

    private static final String PREFS = "defles";
    private static final String KEY_URL = "boardUrl";
    private static final String DEFAULT_URL = "http://192.168.1.10:8420/tv/";

    private WebView web;
    private long lastBackPress = 0;
    private boolean dialogOpen = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#1f2b25"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        if (android.os.Build.VERSION.SDK_INT >= 21) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                // Server (nog) niet bereikbaar: blijf het stil opnieuw proberen.
                if (request.isForMainFrame()) {
                    view.postDelayed(() -> view.reload(), 10000);
                }
            }
        });
        setContentView(web);

        String url = prefs().getString(KEY_URL, "");
        if (url.isEmpty()) {
            askForUrl(true);
        } else {
            web.loadUrl(url);
        }
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private void askForUrl(boolean firstRun) {
        if (dialogOpen) return;
        dialogOpen = true;
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        input.setText(prefs().getString(KEY_URL, DEFAULT_URL));
        input.setSelection(input.getText().length());

        AlertDialog.Builder b = new AlertDialog.Builder(this)
                .setTitle("Adres van het bord")
                .setMessage("Vul het adres van de De Fles-server in, bijvoorbeeld http://192.168.1.10:8420/tv/")
                .setView(input)
                .setCancelable(!firstRun)
                .setPositiveButton("Opslaan", (d, w) -> {
                    String u = input.getText().toString().trim();
                    if (!u.startsWith("http://") && !u.startsWith("https://")) u = "http://" + u;
                    if (!u.endsWith("/")) u = u + "/";
                    prefs().edit().putString(KEY_URL, u).apply();
                    web.loadUrl(u);
                });
        if (!firstRun) b.setNegativeButton("Annuleren", null);
        AlertDialog dlg = b.create();
        dlg.setOnDismissListener((d) -> dialogOpen = false);
        dlg.show();
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUi();
        if (web != null) web.onResume();
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    // D-pad links/rechts gaat rechtstreeks naar het bord: bladeren door de
    // grote weergaven. Onderschept vóór de WebView, anders gebruikt die de
    // pijltjes voor focus-navigatie.
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN && web != null && !dialogOpen) {
            int kc = event.getKeyCode();
            if (kc == KeyEvent.KEYCODE_DPAD_RIGHT || kc == KeyEvent.KEYCODE_MEDIA_NEXT) {
                web.evaluateJavascript("window.deflesRemote&&window.deflesRemote('next')", null);
                return true;
            }
            if (kc == KeyEvent.KEYCODE_DPAD_LEFT || kc == KeyEvent.KEYCODE_MEDIA_PREVIOUS) {
                web.evaluateJavascript("window.deflesRemote&&window.deflesRemote('prev')", null);
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            event.startTracking();
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_MENU) {
            askForUrl(false);
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public boolean onKeyLongPress(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            askForUrl(false);
            return true;
        }
        return super.onKeyLongPress(keyCode, event);
    }

    @Override
    public boolean onKeyUp(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && !event.isCanceled() && !dialogOpen) {
            long now = System.currentTimeMillis();
            if (now - lastBackPress < 2000) {
                finish();
            } else {
                lastBackPress = now;
                Toast.makeText(this, "Nog een keer terug = afsluiten · lang indrukken = adres wijzigen", Toast.LENGTH_SHORT).show();
            }
            return true;
        }
        return super.onKeyUp(keyCode, event);
    }
}
