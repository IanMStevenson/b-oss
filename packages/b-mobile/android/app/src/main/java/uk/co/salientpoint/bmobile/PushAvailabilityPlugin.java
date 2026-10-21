package uk.co.salientpoint.bmobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Reports whether this build was compiled with Firebase credentials (android/app/google-services.json).
// @capacitor/push-notifications' register() calls FirebaseMessaging.getInstance(), which throws an
// uncaught IllegalStateException on its own plugin thread when Firebase was never initialised -
// that kills the whole process, and no JS .catch() can intercept it. So platform/push.ts asks this
// first and never calls register() on a build without credentials.
//
// The google-services Gradle plugin (applied only when google-services.json exists, see
// app/build.gradle) generates the `google_app_id` string resource FirebaseApp initialises from, so
// its presence is the same test FirebaseInitProvider makes - without needing a compile-time
// dependency on Firebase classes (they're `implementation` deps of the push plugin, not visible here).
@CapacitorPlugin(name = "PushAvailability")
public class PushAvailabilityPlugin extends Plugin {

  @PluginMethod
  public void isAvailable(PluginCall call) {
    int id =
        getContext()
            .getResources()
            .getIdentifier("google_app_id", "string", getContext().getPackageName());
    JSObject result = new JSObject();
    result.put("available", id != 0);
    call.resolve(result);
  }
}
