package io.github.ianmstevenson.bmobile;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.MenuItem;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

// Launched by EmbeddedAuthPlugin for a "force new sign-in" OAuth round (auth.md's system-vs-
// embedded browser choice — the Android equivalent of b-ark's startOAuthFlowEmbedded()). Unlike
// the ordinary system-browser round (Custom Tabs via @capacitor/browser / platform/browser.ts),
// which shares Chrome's own cookies so an already-logged-in session carries straight over, this
// Activity owns its own WebView and clears its cookies before loading — the whole point is to
// force a fresh Blipfoto login even when another account is already signed in on the system
// browser, which is otherwise cumbersome when adding a second account.
public class EmbeddedAuthActivity extends AppCompatActivity {
  public static final String EXTRA_URL = "url";
  public static final String EXTRA_REDIRECT_PREFIX = "redirectPrefix";
  public static final String EXTRA_REDIRECT_URL = "redirectUrl";

  @Override
  protected void onCreate(@Nullable Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    if (getSupportActionBar() != null) {
      getSupportActionBar().setDisplayHomeAsUpEnabled(true);
      getSupportActionBar().setTitle(R.string.embedded_auth_title);
    }

    String url = getIntent().getStringExtra(EXTRA_URL);
    String redirectPrefix = getIntent().getStringExtra(EXTRA_REDIRECT_PREFIX);
    if (url == null || redirectPrefix == null) {
      setResult(Activity.RESULT_CANCELED);
      finish();
      return;
    }

    // CookieManager is a single process-wide store shared by every WebView, including this one
    // — but nothing else in this app reads or writes cookies through it (CapacitorHttp uses its
    // own separate OkHttp connection per platform/http.ts, not this), so clearing everything here
    // has no effect beyond forcing this one sign-in screen to start logged out.
    CookieManager.getInstance().removeAllCookies(null);

    WebView webView = new WebView(this);
    webView.getSettings().setJavaScriptEnabled(true);
    webView.getSettings().setDomStorageEnabled(true);
    webView.setWebViewClient(
        new WebViewClient() {
          @Override
          public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            String requestUrl = request.getUrl().toString();
            if (requestUrl.startsWith(redirectPrefix)) {
              Intent result = new Intent();
              result.putExtra(EXTRA_REDIRECT_URL, requestUrl);
              setResult(Activity.RESULT_OK, result);
              finish();
              return true;
            }
            return false;
          }
        });
    setContentView(webView);
    webView.loadUrl(url);

    // Back navigates the login flow's own page history first (matching ordinary browser/Custom
    // Tabs behaviour, e.g. stepping back from a "forgot password" page) — only cancels the whole
    // sign-in once there's nowhere left in the WebView to go back to.
    getOnBackPressedDispatcher()
        .addCallback(
            this,
            new OnBackPressedCallback(true) {
              @Override
              public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                  webView.goBack();
                  return;
                }
                setResult(Activity.RESULT_CANCELED);
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
              }
            });
  }

  @Override
  public boolean onOptionsItemSelected(MenuItem item) {
    if (item.getItemId() == android.R.id.home) {
      setResult(Activity.RESULT_CANCELED);
      finish();
      return true;
    }
    return super.onOptionsItemSelected(item);
  }
}
