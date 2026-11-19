import app from './app.json';

// App identities select a sandbox, never reinterpret or copy its stored keys.
// The product ID is com.arquebus.focusgarden (Arquebus llc). Earlier prototype IDs stay
// buildable so wallets on existing test installs remain reachable in their own sandbox.
const variants: Record<string, string> = {
  product: 'com.arquebus.focusgarden',
  'expo-prototype': 'com.salemkode.libauthreactnative',
  foundation: 'com.focusgarden.mobile',
};
const identity = variants[process.env.FOCUS_GARDEN_APP_VARIANT ?? 'product'] ?? variants.product;

/**
 * FOCUS_SHIELD_IOS (default "1") adds Apple's Family Controls entitlement used for app blocking.
 * Development builds work right away. TestFlight/App Store builds need Apple's
 * "Family Controls (Distribution)" approval for team A5XBH27R6R (Arquebus llc); until then
 * build with FOCUS_SHIELD_IOS=0 and the app shows blocking as waiting for Apple approval.
 * IOS_BUILD_NUMBER sets CFBundleVersion for each TestFlight upload.
 */
const shield = process.env.FOCUS_SHIELD_IOS !== '0';

export default {
  ...app.expo,
  ios: {
    ...app.expo.ios,
    bundleIdentifier: identity,
    appleTeamId: 'A5XBH27R6R',
    buildNumber: process.env.IOS_BUILD_NUMBER ?? '1',
    entitlements: {
      ...app.expo.ios.entitlements,
      ...(shield ? { 'com.apple.developer.family-controls': true } : {}),
    },
    infoPlist: {
      FocusShieldEnabled: shield,
      // Cryptography is used only for authentication/signatures and HTTPS (exempt).
      ITSAppUsesNonExemptEncryption: false,
      // Wallet links: lets the app tell whether Selene or Paytaca is installed and open it to pair
      // (wiz: WizardConnect, wc: WalletConnect, paytaca: Paytaca's own scheme).
      LSApplicationQueriesSchemes: ['wiz', 'wc', 'paytaca', 'bitcoincash'],
    },
  },
  android: { ...app.expo.android, package: identity, allowBackup: false },
  // Keeps Expo native view constructors in minified release builds (see the plugin for the crash it prevents).
  // With app blocking on, targets/activity adds the extension that lifts the shield when a session's
  // time is up even if the app was closed (Device Activity Monitor, bundle <id>.activity).
  plugins: [...app.expo.plugins, './plugins/withExpoViewKeepRules', ...(shield ? ['@bacons/apple-targets'] : [])],
};
