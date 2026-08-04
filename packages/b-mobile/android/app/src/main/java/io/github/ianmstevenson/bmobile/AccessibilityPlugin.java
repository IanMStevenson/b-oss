package io.github.ianmstevenson.bmobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Exposes the OS accessibility font-scale setting (Settings > Display > Font size / Display
// size). The WebView does not apply this to CSS on its own — app-architecture.md §20 flags it as
// a real risk for a WebView app. platform/accessibility.ts reads this once at launch and sets a
// root font-size multiplier so the app's rem-based layouts reflow at large scales.
@CapacitorPlugin(name = "Accessibility")
public class AccessibilityPlugin extends Plugin {

  @PluginMethod
  public void getFontScale(PluginCall call) {
    float fontScale = getContext().getResources().getConfiguration().fontScale;
    JSObject result = new JSObject();
    result.put("fontScale", fontScale);
    call.resolve(result);
  }
}
