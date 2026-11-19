package expo.modules.focusshield

import android.content.Context

/** Block list and session deadline, shared by the module and the guard service. */
internal object ShieldPrefs {
  private const val FILE = "focusgarden.shield.v1"
  private const val BLOCKED = "blocked"
  private const val ENDS_AT = "endsAt"

  private fun prefs(context: Context) = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  fun blocked(context: Context): Set<String> = prefs(context).getStringSet(BLOCKED, emptySet()) ?: emptySet()
  fun setBlocked(context: Context, packages: Set<String>) = prefs(context).edit().putStringSet(BLOCKED, packages).apply()
  fun endsAt(context: Context): Long = prefs(context).getLong(ENDS_AT, 0L)
  fun setEndsAt(context: Context, value: Long) = prefs(context).edit().putLong(ENDS_AT, value).apply()
}
