package uk.co.salientpoint.bmobile;

import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.WebView;
import androidx.webkit.Profile;
import androidx.webkit.ProfileStore;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

// One Blipfoto website session per b-mobile account (b-oss#1052; contract in
// docs/ImplementationSpec/site-session.md). Android's WebView keeps cookies in one process-wide store
// unless it supports profiles (WebViewFeature.MULTI_PROFILE); with them each account gets a named
// profile with its own cookies and web storage, so one member's session is never in use while
// another is selected. Without them there is one shared session and the app's JavaScript treats it as
// such (capabilities().site.session === 'single'; site/access.ts decides who may use it).
final class SiteProfiles {
  private static final String TAG = "SiteProfiles";

  private SiteProfiles() {}

  /** Whether this device's WebView can keep a separate session per account. */
  static boolean supported() {
    return WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE);
  }

  /** The profile name for an account: its id hashed, so any id gives a safe, fixed-length name. */
  static String nameFor(String accountId) {
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256").digest(accountId.getBytes(StandardCharsets.UTF_8));
      StringBuilder hex = new StringBuilder();
      for (int i = 0; i < 12; i++) hex.append(String.format("%02x", digest[i]));
      return "bmobile-site-" + hex;
    } catch (Exception e) {
      // SHA-256 is always present; if it somehow is not, refuse rather than share a session.
      throw new IllegalStateException(e);
    }
  }

  /** Puts a WebView on the account's profile. Must run before the WebView does anything else
   * (settings, loading). A no-op where profiles are not supported. */
  static void attach(WebView webView, String accountId) {
    if (!supported()) return;
    WebViewCompat.setProfile(webView, nameFor(accountId));
  }

  /** The cookie manager for the account's session: its profile's, or the shared one. */
  static CookieManager cookies(String accountId) {
    if (!supported()) return CookieManager.getInstance();
    Profile profile = ProfileStore.getInstance().getOrCreateProfile(nameFor(accountId));
    return profile.getCookieManager();
  }

  /** Deletes the account's session (cookies and web storage); where sessions are shared, the one
   * shared session. Calls `done` once the cookies are gone. */
  static void clear(String accountId, Runnable done) {
    CookieManager manager = cookies(accountId);
    if (supported()) {
      try {
        ProfileStore.getInstance()
            .getOrCreateProfile(nameFor(accountId))
            .getWebStorage()
            .deleteAllData();
      } catch (RuntimeException e) {
        Log.w(TAG, "could not clear web storage: " + e.getMessage());
      }
    }
    manager.removeAllCookies(
        removed -> {
          manager.flush();
          done.run();
        });
  }
}
