/**
 * Metro integration for libauth-native.
 *
 *   const { getDefaultConfig } = require('expo/metro-config');
 *   const { withLibauthNative } = require('./modules/libauth-native/metro');
 *   module.exports = withLibauthNative(getDefaultConfig(__dirname));
 *
 * It redirects:
 * - libauth's WebAssembly crypto (top-level `await` + WebAssembly, neither of
 *   which Hermes supports) to native implementations, and drops the embedded
 *   base64 WebAssembly binaries from the bundle;
 * - `indexeddbshim`, `better-sqlite3`, `fs` and `path` (used by @xo-cash/state
 *   and @electrum-cash/application) to React Native implementations backed by
 *   native SQLite and the file system.
 *
 * Imports made *from* the shim directory are never redirected, so shims can
 * wrap the original modules.
 */
const path = require('node:path');

const SHIMS = path.join(__dirname, 'src', 'shims');
const LIBAUTH = path.join(SHIMS, 'libauth');

/** Files inside `@bitauth/libauth/build/lib/` and their replacements. */
const libauthRedirects = {
  'crypto/default-crypto-instances.js': path.join(LIBAUTH, 'default-crypto-instances.ts'),
  'crypto/secp256k1.js': path.join(LIBAUTH, 'secp256k1.ts'),
  'crypto/sha1.js': path.join(LIBAUTH, 'sha1.ts'),
  'crypto/sha256.js': path.join(LIBAUTH, 'sha256.ts'),
  'crypto/sha512.js': path.join(LIBAUTH, 'sha512.ts'),
  'crypto/ripemd160.js': path.join(LIBAUTH, 'ripemd160.ts'),
  'crypto/hmac.js': path.join(LIBAUTH, 'hmac.ts'),
  'crypto/pbkdf2.js': path.join(LIBAUTH, 'pbkdf2.ts'),
  // Computes a 2^80000 BigInt at import time, beyond Hermes' BigInt size limit.
  'vm/instruction-sets/bch/2025/bch-2025-consensus.js': path.join(LIBAUTH, 'bch-2025-consensus.ts'),
  'bin/secp256k1/secp256k1.base64.js': path.join(LIBAUTH, 'wasm', 'secp256k1.base64.ts'),
  'bin/sha1/sha1.base64.js': path.join(LIBAUTH, 'wasm', 'sha1.base64.ts'),
  'bin/sha256/sha256.base64.js': path.join(LIBAUTH, 'wasm', 'sha256.base64.ts'),
  'bin/sha512/sha512.base64.js': path.join(LIBAUTH, 'wasm', 'sha512.base64.ts'),
  'bin/ripemd160/ripemd160.base64.js': path.join(LIBAUTH, 'wasm', 'ripemd160.base64.ts'),
};

/** Bare module specifiers and their replacements. */
const moduleRedirects = {
  indexeddbshim: path.join(SHIMS, 'indexeddbshim.ts'),
  'better-sqlite3': path.join(SHIMS, 'better-sqlite3.ts'),
  fs: path.join(SHIMS, 'fs.ts'),
  'node:fs': path.join(SHIMS, 'fs.ts'),
  path: path.join(SHIMS, 'path.ts'),
  'node:path': path.join(SHIMS, 'path.ts'),
};

const LIBAUTH_MARKER = `${path.sep}@bitauth${path.sep}libauth${path.sep}build${path.sep}lib${path.sep}`;

const libauthReplacementFor = (filePath) => {
  const index = filePath.lastIndexOf(LIBAUTH_MARKER);
  if (index === -1) return undefined;
  const relative = filePath.slice(index + LIBAUTH_MARKER.length).split(path.sep).join('/');
  return libauthRedirects[relative];
};

const isFromShims = (originModulePath) =>
  typeof originModulePath === 'string' && originModulePath.startsWith(SHIMS + path.sep);

/**
 * @param {import('expo/metro-config').MetroConfig} config
 * @returns {import('expo/metro-config').MetroConfig}
 */
function withLibauthNative(config) {
  const upstreamResolveRequest = config.resolver?.resolveRequest;

  const resolveRequest = (context, moduleName, platform) => {
    const resolve = upstreamResolveRequest ?? context.resolveRequest;

    if (platform !== 'web' && !isFromShims(context.originModulePath)) {
      const moduleReplacement = moduleRedirects[moduleName];
      if (moduleReplacement) {
        return { type: 'sourceFile', filePath: moduleReplacement };
      }
    }

    const resolution = resolve(context, moduleName, platform);

    if (platform !== 'web' && resolution && resolution.type === 'sourceFile' && !isFromShims(context.originModulePath)) {
      const replacement = libauthReplacementFor(resolution.filePath);
      if (replacement) {
        return { type: 'sourceFile', filePath: replacement };
      }
    }
    return resolution;
  };

  return {
    ...config,
    resolver: {
      ...config.resolver,
      resolveRequest,
    },
  };
}

module.exports = { withLibauthNative, libauthRedirects, moduleRedirects };
