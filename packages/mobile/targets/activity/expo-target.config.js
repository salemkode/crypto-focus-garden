/**
 * Lifts the app-blocking shield when a focus session's time is up, even if Focus Garden was closed
 * during it. iOS runs this extension at the end of the session's DeviceActivity schedule.
 * Needs Apple's Family Controls entitlement like the app (its own distribution request for
 * com.arquebus.focusgarden.activity).
 * @type {import('@bacons/apple-targets/app.plugin').Config}
 */
module.exports = {
  type: 'device-activity-monitor',
  name: 'FocusGardenActivity',
  displayName: 'Focus Garden Activity',
  bundleIdentifier: '.activity',
  deploymentTarget: '16.4',
  frameworks: ['DeviceActivity', 'ManagedSettings'],
  entitlements: { 'com.apple.developer.family-controls': true },
};
