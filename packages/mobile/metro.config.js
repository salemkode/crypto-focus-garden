const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const { withLibauthNative } = require('libauth-native/metro');

const WEB_CRYPTO_SHIM = path.join(__dirname, 'web-shims', 'libauth-default-crypto-instances.ts');
const DEFAULT_CRYPTO = `${path.sep}@bitauth${path.sep}libauth${path.sep}build${path.sep}lib${path.sep}crypto${path.sep}default-crypto-instances.js`;

/** Web preview only: avoid libauth's top-level await (see web-shims). Native resolution is unchanged. */
function withWebLibauth(config) {
  const upstream = config.resolver.resolveRequest;
  return {
    ...config,
    resolver: {
      ...config.resolver,
      resolveRequest(context, moduleName, platform) {
        if (platform === 'web' && moduleName === 'libauth-native/polyfills') return { type: 'sourceFile', filePath: path.join(__dirname, 'web-shims', 'empty.ts') };
        if (platform === 'web' && moduleName === 'expo-sqlite/kv-store') return { type: 'sourceFile', filePath: path.join(__dirname, 'web-shims', 'kv-store.ts') };
        const resolution = (upstream ?? context.resolveRequest)(context, moduleName, platform);
        if (platform === 'web' && context.originModulePath !== WEB_CRYPTO_SHIM && resolution?.type === 'sourceFile' && resolution.filePath.endsWith(DEFAULT_CRYPTO)) {
          return { type: 'sourceFile', filePath: WEB_CRYPTO_SHIM };
        }
        return resolution;
      },
    },
  };
}

module.exports = withWebLibauth(withLibauthNative(withNativeWind(getDefaultConfig(__dirname), { input: './global.css' })));
