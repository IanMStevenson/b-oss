package io.github.ianmstevenson.bmobile;

import android.content.Intent;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.webkit.MimeTypeMap;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

// FLW-12's share-to-Blipfoto entry point (app-architecture.md §16). @capacitor/app's own
// appUrlOpen/getLaunchUrl only ever surface a VIEW-action launch URL, never ACTION_SEND's binary
// extras — this is a small local plugin (not an npm package, same precedent as
// BlipfotoLinksPlugin/AccessibilityPlugin) reading the Activity's own Intent directly.
//
// The shared content:// stream is copied into this app's cache dir rather than handed to the
// WebView as-is, since a WebView can't read a content:// URI the way it can a file:// path via
// Capacitor.convertFileSrc — platform/shareIntent.ts converts the returned path the same way
// platform/camera.ts already does for a picked photo.
//
// EXTRA_STREAM is removed from the Intent once read, so a later getSharedImage() call (app
// resume, backing out of compose and re-entering) doesn't re-import the same photo again — the
// same "consume once" shape platform/deepLinks.ts's OAuth-round listener already relies on for
// its own redirect URL.
@CapacitorPlugin(name = "ShareIntent")
public class ShareIntentPlugin extends Plugin {

  @PluginMethod
  public void getSharedImage(PluginCall call) {
    resolveSharedImage(getActivity().getIntent(), call);
  }

  /** Called from MainActivity.onNewIntent() for a warm-start share (the app already running).
   * Only a signal, not the payload — the JS side calls getSharedImage() itself in response, the
   * same one-shot path a cold start uses, so there is exactly one place that actually reads and
   * consumes the Intent's extra. */
  public void handleNewIntent(Intent intent) {
    if (isShareableImageIntent(intent)) {
      notifyListeners("shareReceived", new JSObject());
    }
  }

  private boolean isShareableImageIntent(Intent intent) {
    return intent != null
        && Intent.ACTION_SEND.equals(intent.getAction())
        && intent.getType() != null
        && intent.getType().startsWith("image/");
  }

  private void resolveSharedImage(Intent intent, PluginCall call) {
    if (!isShareableImageIntent(intent)) {
      call.resolve(new JSObject().put("path", ""));
      return;
    }
    Uri source = intent.getParcelableExtra(Intent.EXTRA_STREAM);
    if (source == null) {
      call.resolve(new JSObject().put("path", ""));
      return;
    }
    try {
      int[] dimensions = readDimensions(source);
      File dest = copyToCache(source, intent.getType());
      intent.removeExtra(Intent.EXTRA_STREAM);

      JSObject result = new JSObject();
      result.put("path", "file://" + dest.getAbsolutePath());
      result.put("mimeType", intent.getType());
      result.put("width", dimensions[0]);
      result.put("height", dimensions[1]);
      result.put("sizeBytes", dest.length());
      call.resolve(result);
    } catch (Exception e) {
      call.resolve(new JSObject().put("path", ""));
    }
  }

  /** Bounds-only decode (no pixels loaded) — a separate ContentResolver stream from the copy
   * below, since a content:// InputStream generally can't be rewound after reading. Returns
   * [-1, -1] on any failure; callers (platform/shareIntent.ts, data/photoValidation.ts) already
   * treat an unknown width/height as "skip the dimension check" — the same null-safety precedent
   * every other picked-photo path in this app already follows. */
  private int[] readDimensions(Uri source) {
    try (InputStream in = getContext().getContentResolver().openInputStream(source)) {
      BitmapFactory.Options options = new BitmapFactory.Options();
      options.inJustDecodeBounds = true;
      BitmapFactory.decodeStream(in, null, options);
      return new int[] {options.outWidth, options.outHeight};
    } catch (Exception e) {
      return new int[] {-1, -1};
    }
  }

  private File copyToCache(Uri source, String mimeType) throws Exception {
    File dir = new File(getContext().getCacheDir(), "shared");
    if (!dir.exists()) dir.mkdirs();
    String extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType);
    String filename = "shared-" + System.currentTimeMillis() + "." + (extension != null ? extension : "jpg");
    File dest = new File(dir, filename);
    try (InputStream in = getContext().getContentResolver().openInputStream(source);
        OutputStream out = new FileOutputStream(dest)) {
      byte[] buffer = new byte[8192];
      int read;
      while ((read = in.read(buffer)) != -1) {
        out.write(buffer, 0, read);
      }
    }
    return dest;
  }
}
