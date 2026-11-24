package uk.co.salientpoint.bmobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.WebView;
import androidx.webkit.Profile;
import androidx.webkit.ProfileStore;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

// One Blipfoto website session per b-mobile account (b-oss#1052; contract in
// docs/ImplementationSpec/site-session.md). Android's WebView keeps cookies in one process-wide store
// unless it supports profiles (WebViewFeature.MULTI_PROFILE); with them each account gets a named
// profile with its own cookies and web storage, so one member's session is never in use while
// another is selected. Without them there is one shared session and the app's JavaScript treats it as
// such (capabilities().site.session === 'single'; site/access.ts decides who may use it).
final class SiteProfiles {
  private static final String TAG = "SiteProfiles";

  // Which profile an account uses, where it is not the default hash name: a sign-in round
  // (b-oss#1064) runs before the account is known, so it uses a profile named for a one-off token and
  // adopting it just records that this account now uses that profile (a profile cannot be renamed).
  private static final String PREFS = "site_profiles";
  private static final String ACCOUNT_PREFIX = "account:";
  private static final String PENDING_PREFIX = "bmobile-site-p-";
  private static SharedPreferences prefs;

  private SiteProfiles() {}

  /** Must run before anything else here; idempotent. */
  static synchronized void init(Context context) {
    if (prefs == null) {
      prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
  }

  /** The profile a sign-in round uses before its account is known. The token is the web app's
   * (hex only); anything else is refused rather than used as a name. */
  static String pendingName(String token) {
    if (token == null || !token.matches("[0-9a-f]{16,64}")) {
      throw new IllegalArgumentException("bad sign-in token");
    }
    return PENDING_PREFIX + token;
  }

  /** Makes the login a sign-in round left under `token` the account's session: the account's own
   * profile is wiped and it now uses the pending one. Where profiles are not supported there is
   * nothing to adopt. Main thread. */
  static void adopt(String token, String accountId) {
    if (!supported()) return;
    String pending = pendingName(token);
    String previous = nameFor(accountId);
    if (!previous.equals(pending)) wipe(previous);
    prefs.edit().putString(ACCOUNT_PREFIX + accountId, pending).apply();
  }

  /** Deletes what a sign-in round left under `token`. Main thread. */
  static void discard(String token) {
    if (supported()) wipe(pendingName(token));
  }

  /** Deletes every pending profile no account has adopted: a round that was interrupted (the app
   * was killed) belongs to nobody. Main thread; run at start-up. */
  static void discardAllPending() {
    if (!supported()) return;
    Set<String> adopted = new HashSet<>(prefs.getAll().size());
    for (Object value : prefs.getAll().values()) adopted.add(String.valueOf(value));
    List<String> names = new ArrayList<>(ProfileStore.getInstance().getAllProfileNames());
    for (String name : names) {
      if (name.startsWith(PENDING_PREFIX) && !adopted.contains(name)) wipe(name);
    }
  }

  /** Empties a profile's cookies and web storage and, where the WebView allows it, deletes it. */
  private static void wipe(String profileName) {
    try {
      Profile profile = ProfileStore.getInstance().getOrCreateProfile(profileName);
      profile.getWebStorage().deleteAllData();
      profile.getCookieManager().removeAllCookies(null);
      profile.getCookieManager().flush();
      ProfileStore.getInstance().deleteProfile(profileName);
    } catch (RuntimeException e) {
      // A profile still in use cannot be deleted; it has been emptied, which is what matters.
      Log.w(TAG, "could not fully remove a profile: " + e.getMessage());
    }
  }

  /** Whether this device's WebView can keep a separate session per account. */
  static boolean supported() {
    return WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE);
  }

  /** The profile name for an account: the one it adopted from a sign-in round, else its id hashed,
   * so any id gives a safe, fixed-length name. */
  static String nameFor(String accountId) {
    String adopted = prefs == null ? null : prefs.getString(ACCOUNT_PREFIX + accountId, null);
    if (adopted != null) return adopted;
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

  /** Puts a WebView on a named profile (a sign-in round's pending one). Same rules as `attach`. */
  static void attachNamed(WebView webView, String profileName) {
    if (supported()) WebViewCompat.setProfile(webView, profileName);
  }

  /** The cookie manager of a named profile. Only where profiles are supported. */
  static CookieManager cookiesNamed(String profileName) {
    return ProfileStore.getInstance().getOrCreateProfile(profileName).getCookieManager();
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
          if (prefs != null) prefs.edit().remove(ACCOUNT_PREFIX + accountId).apply();
          done.run();
        });
  }
}
