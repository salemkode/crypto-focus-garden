package expo.modules.focusshield

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.net.Uri
import android.os.Process
import android.provider.Settings
import android.util.Base64
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream

class FocusShieldModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun hasUsageAccess(): Boolean {
    val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    return mode == AppOpsManager.MODE_ALLOWED
  }

  private fun openSettings(action: String, withPackage: Boolean) {
    val intent = Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (withPackage) intent.data = Uri.parse("package:${context.packageName}")
    context.startActivity(intent)
  }

  private fun iconBase64(packageName: String): String? = try {
    val drawable = context.packageManager.getApplicationIcon(packageName)
    val bitmap = Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888)
    drawable.setBounds(0, 0, 64, 64)
    drawable.draw(Canvas(bitmap))
    val out = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
    "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
  } catch (_: Exception) {
    null
  }

  override fun definition() = ModuleDefinition {
    Name("FocusShield")

    AsyncFunction("getStatus") {
      mapOf(
        "supported" to true,
        "platform" to "android",
        "authorized" to hasUsageAccess(),
        "overlay" to Settings.canDrawOverlays(context),
        "selectionCount" to ShieldPrefs.blocked(context).size,
        "active" to (ShieldPrefs.endsAt(context) > System.currentTimeMillis()),
      )
    }

    // Usage access can only be granted by the user in system Settings.
    AsyncFunction("requestAuthorization") {
      if (!hasUsageAccess()) openSettings(Settings.ACTION_USAGE_ACCESS_SETTINGS, false)
      hasUsageAccess()
    }

    AsyncFunction("openOverlaySettings") {
      openSettings(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, true)
    }

    AsyncFunction("listApps") {
      val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      val manager = context.packageManager
      manager.queryIntentActivities(launcher, 0)
        .map { it.activityInfo.packageName to it.loadLabel(manager).toString() }
        .filter { it.first != context.packageName }
        .distinctBy { it.first }
        .sortedBy { it.second.lowercase() }
        .map { (pkg, label) -> mapOf("packageName" to pkg, "label" to label, "icon" to iconBase64(pkg)) }
    }

    AsyncFunction("getBlockedPackages") {
      ShieldPrefs.blocked(context).toList()
    }

    AsyncFunction("setBlockedPackages") { packages: List<String> ->
      val clean = packages.filter { it.isNotBlank() && it != context.packageName }.toSet()
      ShieldPrefs.setBlocked(context, clean)
      clean.size
    }

    AsyncFunction("start") { endsAt: Double ->
      val deadline = endsAt.toLong()
      if (!hasUsageAccess() || ShieldPrefs.blocked(context).isEmpty() || deadline <= System.currentTimeMillis()) {
        return@AsyncFunction false
      }
      ShieldPrefs.setEndsAt(context, deadline)
      context.startForegroundService(Intent(context, FocusShieldService::class.java))
      true
    }

    AsyncFunction("stop") {
      ShieldPrefs.setEndsAt(context, 0L)
      context.stopService(Intent(context, FocusShieldService::class.java))
    }
  }
}
