package io.github.ianmstevenson.bmobile;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Local, single-project plugins (not npm packages) — app-architecture.md §16's "small custom
    // plugin" for toggling the BlipfotoWebLinkAlias activity-alias, and §20's font-scale reader.
    registerPlugin(BlipfotoLinksPlugin.class);
    registerPlugin(AccessibilityPlugin.class);
    super.onCreate(savedInstanceState);
    createNotificationChannels();
  }

  // app-architecture.md §17: "a notification channel per category (activity, system alerts,
  // reminders, uploads) so users can tune them in system settings." Created once, idempotently,
  // at every launch (createNotificationChannel is a no-op if the channel already exists with the
  // same id) rather than only on first install, since channel settings can't be created lazily
  // from within a background push/notification handler. b-push's fcm.ts sets a matching
  // android.notification.channel_id on every message it sends; platform/localNotifications.ts
  // sets 'reminders' on the daily-reminder schedule. No channel is wired to 'uploads' yet — no
  // app-built upload-progress notification exists (see RESUME.md).
  private void createNotificationChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager manager = getSystemService(NotificationManager.class);
    if (manager == null) return;

    manager.createNotificationChannel(
        new NotificationChannel("activity", "Activity", NotificationManager.IMPORTANCE_DEFAULT));
    NotificationChannel systemAlerts =
        new NotificationChannel(
            "system_alerts", "System alerts", NotificationManager.IMPORTANCE_HIGH);
    manager.createNotificationChannel(systemAlerts);
    manager.createNotificationChannel(
        new NotificationChannel("reminders", "Reminders", NotificationManager.IMPORTANCE_DEFAULT));
    manager.createNotificationChannel(
        new NotificationChannel("uploads", "Uploads", NotificationManager.IMPORTANCE_LOW));
  }
}
