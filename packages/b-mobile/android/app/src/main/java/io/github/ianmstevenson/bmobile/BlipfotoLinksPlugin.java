package io.github.ianmstevenson.bmobile;

import android.content.ComponentName;
import android.content.pm.PackageManager;
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
    ComponentName alias = new ComponentName(getContext(), "io.github.ianmstevenson.bmobile.BlipfotoWebLinkAlias");
    getContext()
        .getPackageManager()
        .setComponentEnabledSetting(
            alias,
            enabled ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP);
    call.resolve();
  }
}
