/**
 * libauth-native — makes @bitauth/libauth, @xo-cash/engine and @xo-cash/templates
 * run on React Native (Hermes) by replacing their WebAssembly crypto and Node-only
 * storage with native modules.
 *
 * Setup (see README):
 *   1. `import 'libauth-native/polyfills'` as the first line of your entry file.
 *   2. Wrap your Metro config with `withLibauthNative` from `libauth-native/metro`.
 *   3. Add `@babel/plugin-transform-unicode-sets-regex` to your Babel plugins.
 *
 * After that, import libauth and the XO packages as usual.
 */
export {
  createNativeSecp256k1,
  nativeHmacSha256,
  nativeHmacSha512,
  nativePbkdf2,
  randomBytes,
  ripemd160,
  secp256k1,
  Secp256k1Error,
  sha1,
  sha256,
  sha512,
} from './crypto';
export { HashAlgorithm, default as LibauthNative } from './LibauthNativeModule';
export { resolveDatabaseLocation } from './storage/location';
export { getOpenDatabase } from './storage/openDatabase';
