package uk.co.salientpoint.bmobile;

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

// Launched by EmbeddedAuthPlugin for a "force new sign-in" OAuth round (the system-vs-embedded
// browser choice; BEHAVIOUR.md, Sign-in and accounts — the Android equivalent of b-ark's startOAuthFlowEmbedded()). Unlike
// the ordinary system-browser round (Custom Tabs via @capacitor/browser / platform/browser.ts),
// which shares Chrome's own cookies so an already-logged-in session carries straight over, this
// Activity owns its own WebView and clears its cookies before loading — the whole point is to
// force a fresh Blipfoto login even when another account is already signed in on the system
// browser, which is otherwise cumbersome when adding a second account.
public class EmbeddedAuthActivity extends AppCompatActivity {
  public static final String EXTRA_URL = "url";
  public static final String EXTRA_REDIRECT_PREFIX = "redirectPrefix";
  public static final String EXTRA_REDIRECT_URL = "redirectUrl";
  /** The WebView profile to run in (b-oss#1064), or absent. */
  public static final String EXTRA_PROFILE = "profile";

  // Whether the sign-in runs on a profile of its own, so its website login is kept for adoption.
  // Otherwise it is on the process-wide cookie store, which is emptied again when this closes.
  private boolean ownProfile = false;

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

    SiteProfiles.init(this);
    String profile = getIntent().getStringExtra(EXTRA_PROFILE);
    ownProfile = profile != null && SiteProfiles.supported();

    // CookieManager.getInstance() is a single process-wide store shared by every WebView on the
    // default profile, and Capacitor's native HTTP (CapacitorHttp, through its CookieHandler) sends
    // it on every request to the website, so a login left in it would make the app's page reads
    // act as that member (b-oss#1064). Emptied here so this sign-in starts logged out, and again
    // in onDestroy unless the login is being kept on a profile of its own.
    CookieManager.getInstance().removeAllCookies(null);
    if (ownProfile) SiteProfiles.cookiesNamed(profile).removeAllCookies(null);

    WebView webView = new WebView(this);
    if (ownProfile) SiteProfiles.attachNamed(webView, profile);
    webView.getSettings().setJavaScriptEnabled(true);
    webView.getSettings().setDomStorageEnabled(true);
    // The sign-in page never needs local files or content:// URIs. File access is already off by
    // default from API 30, but minSdk is 24.
    webView.getSettings().setAllowFileAccess(false);
    webView.getSettings().setAllowContentAccess(false);
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
  protected void onDestroy() {
    if (ownProfile) {
      // Kept for adoption; make sure it is on disk before the app could be stopped.
      SiteProfiles.cookiesNamed(getIntent().getStringExtra(EXTRA_PROFILE)).flush();
    } else {
      CookieManager.getInstance().removeAllCookies(null);
    }
    super.onDestroy();
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
