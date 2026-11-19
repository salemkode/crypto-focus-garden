/**
 * Replaces libauth's `crypto/hmac.js`. Uses a single native call for the
 * default hash instances and libauth's own JS implementation otherwise.
 */
import type { Sha256, Sha512 } from '@bitauth/libauth';
// Resolved to the original file: Metro does not redirect imports made from this shim.
import { instantiateHmacFunction } from '@bitauth/libauth/build/lib/crypto/hmac.js';

import { nativeHmacSha256, nativeHmacSha512, sha256 as internalSha256, sha512 as internalSha512 } from '../../crypto';

export { instantiateHmacFunction };

const sha256BlockByteLength = 64;
const sha512BlockByteLength = 128;

export const hmacSha256 = (secret: Uint8Array, message: Uint8Array, sha256: { hash: Sha256['hash'] } = internalSha256) =>
  sha256 === internalSha256
    ? nativeHmacSha256(secret, message)
    : instantiateHmacFunction(sha256.hash, sha256BlockByteLength)(secret, message);

export const hmacSha512 = (secret: Uint8Array, message: Uint8Array, sha512: { hash: Sha512['hash'] } = internalSha512) =>
  sha512 === internalSha512
    ? nativeHmacSha512(secret, message)
    : instantiateHmacFunction(sha512.hash, sha512BlockByteLength)(secret, message);
