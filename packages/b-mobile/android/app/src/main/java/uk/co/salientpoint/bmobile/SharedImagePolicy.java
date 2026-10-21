package uk.co.salientpoint.bmobile;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

// The checks ShareIntentPlugin applies to an incoming ACTION_SEND stream, kept free of Android
// types so they run as plain JVM unit tests.
//
// The SEND filter is exported, so any app can hand us any URI. Only content:// is accepted
// (file:// could point into this app's own private storage), and never one of this app's own
// authorities (our FileProvider exposes the cache dir) — either would let another app get one of
// our private files copied into compose and published.
final class SharedImagePolicy {

  /** Comfortably above the 20 MB entry limit, so an oversized photo still reaches compose's own
   * size check and its message; this cap only bounds what a share can write into the cache. */
  static final long MAX_COPY_BYTES = 64L * 1024 * 1024;

  private SharedImagePolicy() {}

  static boolean isAcceptedSource(String scheme, String authority, String ownPackage) {
    if (!"content".equalsIgnoreCase(scheme)) return false;
    if (authority == null || authority.isEmpty()) return false;
    for (String part : authority.split(";")) {
      String a = part.trim();
      if (a.equals(ownPackage) || a.startsWith(ownPackage + ".")) return false;
    }
    return true;
  }

  /** Bounds from a bounds-only decode; anything that didn't decode reads as -1/0. */
  static boolean isDecodableImage(int width, int height) {
    return width > 0 && height > 0;
  }

  /** Copies in to out, throwing once more than maxBytes have been read. Returns bytes copied. */
  static long copyCapped(InputStream in, OutputStream out, long maxBytes) throws IOException {
    byte[] buffer = new byte[8192];
    long total = 0;
    int read;
    while ((read = in.read(buffer)) != -1) {
      total += read;
      if (total > maxBytes) throw new IOException("Shared file is larger than " + maxBytes + " bytes");
      out.write(buffer, 0, read);
    }
    return total;
  }
}
