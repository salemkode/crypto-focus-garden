import type { ConfigContext } from 'expo/config';

const shield = process.env.FOCUS_SHIELD_IOS === '1';

export default ({ config }: ConfigContext) => ({
  ...config,
  ios: {
    ...config.ios,
    buildNumber: process.env.IOS_BUILD_NUMBER ?? '1',
    entitlements: { ...config.ios?.entitlements, ...(shield ? { 'com.apple.developer.family-controls': true } : {}) },
    infoPlist: {
      FocusShieldEnabled: shield,
      ITSAppUsesNonExemptEncryption: false,
      LSApplicationQueriesSchemes: ['wiz', 'wc', 'paytaca', 'bitcoincash'],
    },
  },
  plugins: [...(config.plugins ?? []), './plugins/withExpoViewKeepRules', ...(shield ? ['@bacons/apple-targets'] : [])],
});
