package uk.co.salientpoint.bmobile;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONException;

// The member's own Blipfoto website session, used only to add extra photos (b-oss#1037); backs
// platform/siteSession.ts. signIn shows SiteSignInActivity. runPage loads one www.blipfoto.com
// page in an off-screen WebView (sharing the cookie signIn left in the process-wide CookieManager),
// runs a script from the web app in it and polls window.__bmx for the result, because a WebView
// cannot await a promise. Only https pages on the site's own host are ever loaded.
@CapacitorPlugin(name = "SiteSession")
public class SiteSessionPlugin extends Plugin {
  private static final long POLL_MS = 400;
  private static final long NAVIGATION_GRACE_MS = 60_000;

  @PluginMethod
  public void signIn(PluginCall call) {
    String url = call.getString("url");
    if (url == null || !SiteSignInActivity.isSiteUrl(Uri.parse(url))) {
      call.reject("url must be a Blipfoto website address");
      return;
    }
    Intent intent = new Intent(getContext(), SiteSignInActivity.class);
    intent.putExtra(SiteSignInActivity.EXTRA_URL, url);
    startActivityForResult(call, intent, "signInResult");
  }

  @ActivityCallback
  private void signInResult(PluginCall call, ActivityResult result) {
    if (call == null) return;
    JSObject ret = new JSObject();
    ret.put("signedIn", result.getResultCode() == Activity.RESULT_OK);
    call.resolve(ret);
  }

  @PluginMethod
  public void runPage(PluginCall call) {
    String url = call.getString("url");
    String script = call.getString("script");
    Integer timeoutMs = call.getInt("timeoutMs");
    boolean waitForNavigation = Boolean.TRUE.equals(call.getBoolean("waitForNavigation"));
    if (url == null
        || script == null
        || timeoutMs == null
        || !SiteSignInActivity.isSiteUrl(Uri.parse(url))) {
      call.reject("url, script and timeoutMs are required; url must be a Blipfoto website address");
      return;
    }
    getActivity().runOnUiThread(() -> new PageRun(call, url, script, timeoutMs, waitForNavigation));
  }

  /** One hidden-page run; every method runs on the main thread. */
  private final class PageRun {
    private final PluginCall call;
    private final String script;
    private final boolean waitForNavigation;
    private final long deadline;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final WebView webView;
    private String startUrl = null;
    private String result = null;
    private boolean scriptStarted = false;
    private boolean finished = false;
    private long navigationDeadline = 0;

    PageRun(PluginCall call, String url, String script, int timeoutMs, boolean waitForNavigation) {
      this.call = call;
      this.script = script;
      this.waitForNavigation = waitForNavigation;
      this.deadline = System.currentTimeMillis() + timeoutMs;
      webView = new WebView(getActivity());
      webView.getSettings().setJavaScriptEnabled(true);
      webView.getSettings().setDomStorageEnabled(true);
      webView.getSettings().setAllowFileAccess(false);
      webView.getSettings().setAllowContentAccess(false);
      webView.setWebViewClient(
          new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
              return !SiteSignInActivity.isSiteUrl(request.getUrl());
            }

            @Override
            public void onPageFinished(WebView view, String finishedUrl) {
              if (finished) return;
              if (!scriptStarted) {
                scriptStarted = true;
                startUrl = finishedUrl;
                view.evaluateJavascript(PageRun.this.script, null);
                handler.postDelayed(PageRun.this::poll, POLL_MS);
              } else if (result != null && !finishedUrl.equals(startUrl)) {
                // The page the script saved from has moved on: the post went through.
                finish();
              }
            }
          });
      CookieManager.getInstance().setAcceptCookie(true);
      webView.loadUrl(url);
      handler.postDelayed(this::timedOut, timeoutMs);
    }

    private void poll() {
      if (finished || result != null) return;
      webView.evaluateJavascript(
          "window.__bmx === undefined ? null : window.__bmx",
          value -> {
            String decoded = decode(value);
            if (decoded != null && !decoded.isEmpty()) {
              result = decoded;
              if (waitForNavigation) {
                navigationDeadline = System.currentTimeMillis() + NAVIGATION_GRACE_MS;
                handler.postDelayed(this::navigationTimedOut, NAVIGATION_GRACE_MS);
              } else {
                finish();
              }
            } else if (System.currentTimeMillis() < deadline) {
              handler.postDelayed(this::poll, POLL_MS);
            }
          });
    }

    private void timedOut() {
      if (!finished && result == null) finish();
    }

    private void navigationTimedOut() {
      if (!finished) finish();
    }

    private void finish() {
      if (finished) return;
      finished = true;
      handler.removeCallbacksAndMessages(null);
      CookieManager.getInstance().flush();
      JSObject ret = new JSObject();
      ret.put("finalUrl", webView.getUrl() == null ? "" : webView.getUrl());
      ret.put("result", result);
      webView.stopLoading();
      webView.destroy();
      call.resolve(ret);
    }
  }

  /** evaluateJavascript hands back a JSON value; a string comes quoted and escaped. */
  private static String decode(String value) {
    if (value == null || value.equals("null")) return null;
    try {
      return new JSONArray("[" + value + "]").getString(0);
    } catch (JSONException e) {
      return null;
    }
  }
}
