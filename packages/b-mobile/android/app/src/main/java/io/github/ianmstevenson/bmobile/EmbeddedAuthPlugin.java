package io.github.ianmstevenson.bmobile;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

// Opens EmbeddedAuthActivity for a "force new sign-in" OAuth round — see that Activity's own
// header comment for why this exists alongside the ordinary Custom Tabs round
// (platform/browser.ts). Backs platform/embeddedAuth.ts.
@CapacitorPlugin(name = "EmbeddedAuth")
public class EmbeddedAuthPlugin extends Plugin {

  @PluginMethod
  public void open(PluginCall call) {
    String url = call.getString("url");
    String redirectPrefix = call.getString("redirectPrefix");
    if (url == null || redirectPrefix == null) {
      call.reject("url and redirectPrefix are required");
      return;
    }

    Intent intent = new Intent(getContext(), EmbeddedAuthActivity.class);
    intent.putExtra(EmbeddedAuthActivity.EXTRA_URL, url);
    intent.putExtra(EmbeddedAuthActivity.EXTRA_REDIRECT_PREFIX, redirectPrefix);
    startActivityForResult(call, intent, "openResult");
  }

  @ActivityCallback
  private void openResult(PluginCall call, ActivityResult result) {
    if (call == null) return;
    if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
      String redirectUrl = result.getData().getStringExtra(EmbeddedAuthActivity.EXTRA_REDIRECT_URL);
      JSObject ret = new JSObject();
      ret.put("redirectUrl", redirectUrl);
      call.resolve(ret);
    } else {
      call.reject("cancelled");
    }
  }
}
