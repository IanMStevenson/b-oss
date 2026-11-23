package uk.co.salientpoint.bmobile;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.view.MenuItem;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

// Launched by SiteSessionPlugin so the member can sign in to the Blipfoto website itself
// (b-oss#1037, adding extra photos). Like EmbeddedAuthActivity it owns a WebView and starts with
// the site's cookies cleared, so a second account never mixes with the first; unlike it, it keeps
// the cookie on success, because SiteSessionPlugin.runPage then reuses it. The password goes to
// Blipfoto's own page and never through the app. Finishes RESULT_OK once the site has sent the
// member past /account/… (the post-login landing); Back or the up arrow cancels.
public class SiteSignInActivity extends AppCompatActivity {
  public static final String EXTRA_URL = "url";
  public static final String EXTRA_ACCOUNT_ID = "accountId";
  private static final String SITE_HOST = "www.blipfoto.com";

  @Override
  protected void onCreate(@Nullable Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    if (getSupportActionBar() != null) {
      getSupportActionBar().setDisplayHomeAsUpEnabled(true);
      getSupportActionBar().setTitle(R.string.embedded_auth_title);
    }

    String url = getIntent().getStringExtra(EXTRA_URL);
    String accountId = getIntent().getStringExtra(EXTRA_ACCOUNT_ID);
    if (url == null || accountId == null || accountId.isEmpty() || !isSiteUrl(Uri.parse(url))) {
      setResult(Activity.RESULT_CANCELED);
      finish();
      return;
    }

    // Starts signed out, so one member's sign-in is never mixed with another's: this account's
    // session (or the one shared session) is cleared first.
    SiteProfiles.cookies(accountId).removeAllCookies(null);

    WebView webView = new WebView(this);
    // Before anything else: puts this WebView on the account's own profile where there are profiles.
    SiteProfiles.attach(webView, accountId);
    webView.getSettings().setJavaScriptEnabled(true);
    webView.getSettings().setDomStorageEnabled(true);
    webView.getSettings().setAllowFileAccess(false);
    webView.getSettings().setAllowContentAccess(false);
    webView.setWebViewClient(
        new WebViewClient() {
          @Override
          public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            // Stay on the site; the sign-in page is plain email and password.
            return !isSiteUrl(request.getUrl());
          }

          @Override
          public void onPageFinished(WebView view, String finishedUrl) {
            Uri uri = Uri.parse(finishedUrl);
            if (isSiteUrl(uri)
                && uri.getPath() != null
                && !uri.getPath().startsWith("/account/")) {
              SiteProfiles.cookies(accountId).flush();
              setResult(Activity.RESULT_OK);
              finish();
            }
          }
        });
    setContentView(webView);
    webView.loadUrl(url);

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

  static boolean isSiteUrl(Uri uri) {
    return "https".equals(uri.getScheme()) && SITE_HOST.equals(uri.getHost());
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
