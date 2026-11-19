import DeviceActivity
import ManagedSettings

/**
 Ends app blocking when a focus session's time is up.

 Focus Garden starts a one-off DeviceActivity schedule named "focusgarden.session" that ends when
 the session does. iOS calls `intervalDidEnd` here even when the app is closed, and the extension
 clears the same named shield store the app set. The store is shared by the app and its extensions.
 */
class DeviceActivityMonitorExtension: DeviceActivityMonitor {
  private let store = ManagedSettingsStore(named: ManagedSettingsStore.Name("focusgarden.shield"))

  override func intervalDidEnd(for activity: DeviceActivityName) {
    super.intervalDidEnd(for: activity)
    guard activity.rawValue == "focusgarden.session" else { return }
    store.clearAllSettings()
  }
}
