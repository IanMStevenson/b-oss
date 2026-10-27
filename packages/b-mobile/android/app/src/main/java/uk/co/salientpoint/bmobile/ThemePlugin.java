package uk.co.salientpoint.bmobile;

import android.app.Activity;
import android.content.Context;
import android.content.res.Configuration;
import android.content.res.Resources;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.webkit.WebView;
import androidx.appcompat.app.AppCompatDelegate;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// The colour theme, as far as Android itself needs to know (b-oss#549). The web layer draws the
// theme (<html data-theme>, b-visual's themes.css), but two things happen outside it:
//
//  - Before the page paints, the window and the WebView show their own background. Left alone
//    that is white (or a stock dark grey), i.e. a flash at launch, and for Mid on a phone in
//    light mode it would be wrong either way. So the page colour of the chosen theme is applied
//    here, and again at the next launch before the WebView exists (MainActivity).
//  - Android's night mode decides the dark variants of system dialogs, pickers and WebViews, and
//    what the WebView reports as prefers-color-scheme. Dark and Mid are dark themes; Light is
//    light; System default follows the phone.
//
// The preference is stored here too (not just in the app's prefs) because MainActivity needs it
// synchronously, before any JS runs. Colours must match b-visual's themes.css (--bg), and the
// pre-paint block in index.html.
@CapacitorPlugin(name = "Theme")
public class ThemePlugin extends Plugin {

  private static final String PREFS = "b_mobile_theme";
  private static final String KEY_PREFERENCE = "preference";

  private static final int DARK_BACKGROUND = 0xFF121212;
  private static final int MID_BACKGROUND = 0xFF4C4C4C;

  @PluginMethod
  public void setTheme(PluginCall call) {
    final String preference = normalise(call.getString("preference"));
    getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(KEY_PREFERENCE, preference)
        .apply();
    final Activity activity = getActivity();
    if (activity == null) {
      call.resolve();
      return;
    }
    activity.runOnUiThread(
        () -> {
          applyNightMode(preference);
          applyBackground(activity, getBridge().getWebView(), preference);
          call.resolve();
        });
  }

  /** The stored preference: "system", "light", "dark" or "mid". "system" until one is stored. */
  static String storedPreference(Context context) {
    return normalise(
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_PREFERENCE, null));
  }

  static void applyNightMode(String preference) {
    switch (preference) {
      case "light":
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO);
        break;
      case "dark":
      case "mid":
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES);
        break;
      default:
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM);
    }
  }

  static void applyBackground(Activity activity, WebView webView, String preference) {
    int colour = backgroundColour(preference);
    activity.getWindow().setBackgroundDrawable(new ColorDrawable(colour));
    if (webView != null) webView.setBackgroundColor(colour);
  }

  static int backgroundColour(String preference) {
    switch (preference) {
      case "dark":
        return DARK_BACKGROUND;
      case "mid":
        return MID_BACKGROUND;
      case "light":
        return Color.WHITE;
      default:
        // System default: the phone's own setting (not this app's night mode, which we may have
        // forced), and never Mid.
        return systemIsNight() ? DARK_BACKGROUND : Color.WHITE;
    }
  }

  private static boolean systemIsNight() {
    int mask = Resources.getSystem().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
    return mask == Configuration.UI_MODE_NIGHT_YES;
  }

  private static String normalise(String preference) {
    if ("light".equals(preference) || "dark".equals(preference) || "mid".equals(preference)) {
      return preference;
    }
    return "system";
  }
}
