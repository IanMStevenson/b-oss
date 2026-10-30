package uk.co.salientpoint.bmobile;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import androidx.activity.result.ActivityResult;
import androidx.exifinterface.media.ExifInterface;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

// Picks one photo from the gallery and hands back a cached copy plus the GPS position embedded in
// the original. Android withholds a photo's location from pickers by default, and the stock
// @capacitor/camera picker never asks for it, so this plugin does:
//   - Android 17+ (API 37): the system Photo Picker, with its location-metadata request. The user
//     is asked once ("Include location info?"); no manifest permission is involved.
//   - Android 10-16: the document picker, which returns the original bytes once the app holds
//     ACCESS_MEDIA_LOCATION (asked for here, at the point of use). Without it the GPS comes back
//     zeroed and the position is simply absent.
//   - Android 9 and below: the document picker; nothing is redacted there.
// Every path degrades to "photo with no position"; a position is never made up. platform/
// photoPick.ts is the JS wrapper. Design record: b-oss#650.
@CapacitorPlugin(
  name = "PhotoPick",
  permissions = {
    @Permission(strings = { Manifest.permission.ACCESS_MEDIA_LOCATION }, alias = "mediaLocation")
  }
)
public class PhotoPickPlugin extends Plugin {

  private static final int API_PICKER_LOCATION = 37;
  private static final String ACTION_PICK_IMAGES = "android.provider.action.PICK_IMAGES";
  private static final String EXTRA_REQUEST_LOCATION =
    "android.provider.extra.REQUEST_LOCATION_METADATA_ACCESS";

  @PluginMethod
  public void pick(PluginCall call) {
    if (Build.VERSION.SDK_INT >= API_PICKER_LOCATION) {
      Intent intent = new Intent(ACTION_PICK_IMAGES);
      intent.putExtra(EXTRA_REQUEST_LOCATION, true);
      startActivityForResult(call, intent, "onPicked");
      return;
    }
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
      getPermissionState("mediaLocation") != PermissionState.GRANTED
    ) {
      requestPermissionForAlias("mediaLocation", call, "onMediaLocationResult");
      return;
    }
    launchDocumentPicker(call);
  }

  // Denied is fine: the photo is still picked, just without a position.
  @PermissionCallback
  private void onMediaLocationResult(PluginCall call) {
    launchDocumentPicker(call);
  }

  private void launchDocumentPicker(PluginCall call) {
    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType("image/*");
    startActivityForResult(call, intent, "onPicked");
  }

  /** The GPS embedded in an image file the app already holds (a camera capture). */
  @PluginMethod
  public void readGps(PluginCall call) {
    String path = call.getString("path");
    JSObject result = new JSObject();
    if (path != null) {
      try {
        ExifInterface exif = new ExifInterface(path);
        float[] latLong = new float[2];
        if (exif.getLatLong(latLong) && !(latLong[0] == 0f && latLong[1] == 0f)) {
          result.put("lat", (double) latLong[0]);
          result.put("lon", (double) latLong[1]);
        }
      } catch (IOException ignored) {
        // Unreadable file: no position.
      }
    }
    call.resolve(result);
  }

  @ActivityCallback
  private void onPicked(PluginCall call, ActivityResult result) {
    if (call == null) return;
    if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
      call.reject("cancelled");
      return;
    }
    Uri uri = result.getData().getData();
    if (uri == null) {
      call.reject("cancelled");
      return;
    }
    try {
      call.resolve(describe(uri));
    } catch (Exception e) {
      call.reject("Could not read that photo: " + e.getMessage());
    }
  }

  private JSObject describe(Uri uri) throws IOException {
    ContentResolver resolver = getContext().getContentResolver();
    String mime = resolver.getType(uri);
    if (mime == null || !mime.startsWith("image/")) mime = "image/jpeg";
    File copy = new File(getContext().getCacheDir(), "PICK_" + System.currentTimeMillis() + extension(mime));
    try (InputStream in = resolver.openInputStream(uri);
        OutputStream out = new FileOutputStream(copy)) {
      if (in == null) throw new IOException("Could not open the photo");
      byte[] buffer = new byte[64 * 1024];
      int read;
      while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
    }

    JSObject result = new JSObject();
    result.put("path", copy.getAbsolutePath());
    result.put("mimeType", mime);
    result.put("sizeBytes", copy.length());

    BitmapFactory.Options bounds = new BitmapFactory.Options();
    bounds.inJustDecodeBounds = true;
    BitmapFactory.decodeFile(copy.getAbsolutePath(), bounds);
    if (bounds.outWidth > 0 && bounds.outHeight > 0) {
      result.put("width", bounds.outWidth);
      result.put("height", bounds.outHeight);
    }

    // The copy carries whatever the picker allowed through, so read the position from it.
    try (InputStream in = new java.io.FileInputStream(copy)) {
      ExifInterface exif = new ExifInterface(in);
      float[] latLong = new float[2];
      // getLatLong is false for absent or zeroed (redacted) tags.
      if (exif.getLatLong(latLong) && !(latLong[0] == 0f && latLong[1] == 0f)) {
        result.put("lat", (double) latLong[0]);
        result.put("lon", (double) latLong[1]);
      }
      String taken = exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL);
      String iso = taken == null ? null : toIso(taken);
      if (iso != null) result.put("createdAt", iso);
    } catch (IOException ignored) {
      // Unreadable EXIF just means no position and no date.
    }
    return result;
  }

  private static String toIso(String exifDate) {
    try {
      SimpleDateFormat in = new SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US);
      in.setTimeZone(TimeZone.getDefault());
      Date date = in.parse(exifDate);
      if (date == null) return null;
      SimpleDateFormat out = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US);
      out.setTimeZone(TimeZone.getDefault());
      return out.format(date);
    } catch (ParseException e) {
      return null;
    }
  }

  private static String extension(String mime) {
    switch (mime) {
      case "image/png":
        return ".png";
      case "image/gif":
        return ".gif";
      default:
        return ".jpg";
    }
  }
}
