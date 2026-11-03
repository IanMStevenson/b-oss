// SPDX-License-Identifier: GPL-3.0-or-later
package emutest;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import java.io.File;
import java.io.FileOutputStream;

/** Serves one generated 600x400 PNG at content://emutest.sender/photo.png. */
public class Img extends ContentProvider {
  @Override public boolean onCreate() { return true; }

  @Override
  public ParcelFileDescriptor openFile(Uri uri, String mode) throws java.io.FileNotFoundException {
    File f = new File(getContext().getCacheDir(), "photo.png");
    try {
      if (!f.exists()) {
        Bitmap bm = Bitmap.createBitmap(600, 400, Bitmap.Config.ARGB_8888);
        bm.eraseColor(Color.rgb(40, 120, 80));
        try (FileOutputStream out = new FileOutputStream(f)) { bm.compress(Bitmap.CompressFormat.PNG, 100, out); }
      }
    } catch (java.io.IOException e) { throw new java.io.FileNotFoundException(e.toString()); }
    return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
  }

  @Override public String getType(Uri uri) { return "image/png"; }
  @Override public Cursor query(Uri u, String[] p, String s, String[] a, String o) { return null; }
  @Override public Uri insert(Uri u, ContentValues v) { return null; }
  @Override public int delete(Uri u, String s, String[] a) { return 0; }
  @Override public int update(Uri u, ContentValues v, String s, String[] a) { return 0; }
}
