package io.github.ianmstevenson.bmobile;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

// Saves an image file the app already holds (its image cache) into the phone's gallery —
// Pictures/b-mobile — so "Download photo" produces something the user can actually find. On
// Android 10+ that is a MediaStore insert, which needs no storage permission. Below that (minSdk is
// 24) a public-folder write would need a runtime permission, so the file goes to the app's own
// external Pictures folder instead: still saved, just not shown in the gallery. platform/
// mediaSave.ts is the JS wrapper.
@CapacitorPlugin(name = "MediaSave")
public class MediaSavePlugin extends Plugin {

  private static final String ALBUM = "b-mobile";

  @PluginMethod
  public void saveImage(PluginCall call) {
    String uri = call.getString("uri");
    String fileName = call.getString("fileName");
    if (uri == null || fileName == null) {
      call.reject("uri and fileName are required");
      return;
    }
    try {
      File source = new File(Uri.parse(uri).getPath());
      if (!source.isFile()) {
        call.reject("Source image not found");
        return;
      }
      String mime = sniffMime(source);
      String name = withExtension(fileName, mime);
      JSObject result = new JSObject();

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, name);
        values.put(MediaStore.Images.Media.MIME_TYPE, mime);
        values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + ALBUM);
        values.put(MediaStore.Images.Media.IS_PENDING, 1);
        Uri target = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
        if (target == null) {
          call.reject("Could not create the gallery entry");
          return;
        }
        try (InputStream in = new FileInputStream(source);
            OutputStream out = resolver.openOutputStream(target)) {
          if (out == null) throw new IOException("Could not open the gallery entry");
          copy(in, out);
        } catch (IOException e) {
          resolver.delete(target, null, null);
          throw e;
        }
        values.clear();
        values.put(MediaStore.Images.Media.IS_PENDING, 0);
        resolver.update(target, values, null, null);
        result.put("location", "Pictures/" + ALBUM + "/" + name);
      } else {
        File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_PICTURES);
        if (dir == null) {
          call.reject("No storage available");
          return;
        }
        File target = new File(dir, name);
        try (InputStream in = new FileInputStream(source);
            OutputStream out = new FileOutputStream(target)) {
          copy(in, out);
        }
        result.put("location", target.getAbsolutePath());
      }
      call.resolve(result);
    } catch (Exception e) {
      call.reject("Could not save the image: " + e.getMessage());
    }
  }

  private static void copy(InputStream in, OutputStream out) throws IOException {
    byte[] buffer = new byte[64 * 1024];
    int read;
    while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
    out.flush();
  }

  // The image cache stores files with no extension, so decide the type from the bytes.
  private static String sniffMime(File file) throws IOException {
    byte[] head = new byte[12];
    try (InputStream in = new FileInputStream(file)) {
      int n = in.read(head);
      if (n >= 3 && (head[0] & 0xFF) == 0xFF && (head[1] & 0xFF) == 0xD8) return "image/jpeg";
      if (n >= 4 && (head[0] & 0xFF) == 0x89 && head[1] == 'P' && head[2] == 'N' && head[3] == 'G')
        return "image/png";
      if (n >= 4 && head[0] == 'G' && head[1] == 'I' && head[2] == 'F') return "image/gif";
      if (n >= 12 && head[0] == 'R' && head[1] == 'I' && head[2] == 'F' && head[3] == 'F'
          && head[8] == 'W' && head[9] == 'E' && head[10] == 'B' && head[11] == 'P')
        return "image/webp";
    }
    return "image/jpeg";
  }

  private static String withExtension(String fileName, String mime) {
    String ext;
    switch (mime) {
      case "image/png": ext = ".png"; break;
      case "image/gif": ext = ".gif"; break;
      case "image/webp": ext = ".webp"; break;
      default: ext = ".jpg";
    }
    String lower = fileName.toLowerCase();
    if (lower.endsWith(ext) || (ext.equals(".jpg") && lower.endsWith(".jpeg"))) return fileName;
    return fileName + ext;
  }
}
