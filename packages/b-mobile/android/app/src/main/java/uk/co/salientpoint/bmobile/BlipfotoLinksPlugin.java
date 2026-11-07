package uk.co.salientpoint.bmobile;

import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Toggles the disabled-by-default <activity-alias> (AndroidManifest.xml,
// app-architecture.md §16) that carries the non-autoVerify https://www.blipfoto.com intent
// filter. This is the only way to flip that filter at runtime: it's static in the manifest, and
// PackageManager.setComponentEnabledSetting() is the documented mechanism for enabling/disabling
// a declared alias without an app update. Backs devicePrefsStore.openBlipfotoLinksInApp
// (SCR-29), which has persisted with no native effect since Phase 8 — this plugin is what
// finally gives it one.
@CapacitorPlugin(name = "BlipfotoLinks")
public class BlipfotoLinksPlugin extends Plugin {

  @PluginMethod
  public void setEnabled(PluginCall call) {
    boolean enabled = call.getBoolean("enabled", false);
    ComponentName alias = new ComponentName(getContext(), "uk.co.salientpoint.bmobile.BlipfotoWebLinkAlias");
    getContext()
        .getPackageManager()
        .setComponentEnabledSetting(
            alias,
            enabled ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP);
    call.resolve();
  }

  // Android 12+ (API 31) sends a generic https link to an app only if the user has approved the
  // domain for it (our filter is not autoVerify), so enabling the alias is not enough on its own.
  @PluginMethod
  public void needsApproval(PluginCall call) {
    JSObject result = new JSObject();
    result.put("needed", Build.VERSION.SDK_INT >= Build.VERSION_CODES.S);
    call.resolve(result);
  }

  // The app's own "Open by default" screen, where "Add link" ticks www.blipfoto.com.
  @PluginMethod
  public void openApprovalSettings(PluginCall call) {
    Intent intent;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      intent = new Intent(Settings.ACTION_APP_OPEN_BY_DEFAULT_SETTINGS);
    } else {
      intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
    }
    intent.setData(Uri.parse("package:" + getContext().getPackageName()));
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    try {
      getContext().startActivity(intent);
      call.resolve();
    } catch (RuntimeException e) {
      call.reject("Could not open the settings screen");
    }
  }
}
