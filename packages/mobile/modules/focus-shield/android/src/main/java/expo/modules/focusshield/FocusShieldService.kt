package expo.modules.focusshield

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.widget.Toast

/**
 Foreground guard for one focus session. Polls usage events for the app in front; when a
 blocked app opens, Focus Garden is brought straight back. Stops itself at the deadline.
 */
class FocusShieldService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var lastBlockedAt = 0L
  private var lastPackage: String? = null

  private val tick = object : Runnable {
    override fun run() {
      val endsAt = ShieldPrefs.endsAt(this@FocusShieldService)
      if (endsAt <= System.currentTimeMillis()) {
        ShieldPrefs.setEndsAt(this@FocusShieldService, 0L)
        stopSelf()
        return
      }
      guard()
      handler.postDelayed(this, POLL_MS)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    handler.removeCallbacks(tick)
    handler.post(tick)
    return START_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacks(tick)
    super.onDestroy()
  }

  private fun foregroundPackage(): String? {
    val usage = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val now = System.currentTimeMillis()
    val events = usage.queryEvents(now - LOOKBACK_MS, now)
    val event = UsageEvents.Event()
    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      if (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED) lastPackage = event.packageName
    }
    return lastPackage
  }

  private fun guard() {
    val front = foregroundPackage() ?: return
    if (front == packageName || front !in ShieldPrefs.blocked(this)) return
    val now = System.currentTimeMillis()
    if (now - lastBlockedAt < 1500) return
    lastBlockedAt = now
    // Treat Focus Garden as the app in front from now on, until another app resumes.
    lastPackage = packageName
    packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      startActivity(launch)
    }
    Toast.makeText(this, "That app is blocked while your tree grows.", Toast.LENGTH_SHORT).show()
  }

  private fun buildNotification(): Notification {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(NotificationChannel(CHANNEL, "Focus session", NotificationManager.IMPORTANCE_LOW))
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      android.app.PendingIntent.getActivity(this, 0, it, android.app.PendingIntent.FLAG_IMMUTABLE)
    }
    return Notification.Builder(this, CHANNEL)
      .setContentTitle("Your tree is growing")
      .setContentText("Chosen apps are blocked until this focus session ends.")
      .setSmallIcon(applicationInfo.icon)
      .setOngoing(true)
      .setContentIntent(open)
      .build()
  }

  companion object {
    private const val CHANNEL = "focusgarden.shield"
    private const val NOTIFICATION_ID = 4107
    private const val POLL_MS = 700L
    private const val LOOKBACK_MS = 10_000L
  }
}
