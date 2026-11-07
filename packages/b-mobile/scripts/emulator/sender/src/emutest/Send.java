// SPDX-License-Identifier: GPL-3.0-or-later
package emutest;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/** am start -n emutest.sender/emutest.Send --es target <pkg> [--es action SEND] */
public class Send extends Activity {
  @Override
  protected void onCreate(Bundle b) {
    super.onCreate(b);
    Intent i = new Intent(Intent.ACTION_SEND);
    i.setType("image/png");
    i.putExtra(Intent.EXTRA_STREAM, Uri.parse("content://emutest.sender/photo.png"));
    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    String target = getIntent().getStringExtra("target");
    if (target != null) i.setPackage(target);
    startActivity(i);
    finish();
  }
}
