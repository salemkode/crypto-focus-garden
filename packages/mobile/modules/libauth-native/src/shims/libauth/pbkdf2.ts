/**
 * Replaces libauth's `crypto/pbkdf2.js`. BIP39 seed derivation (2048 rounds of
 * HMAC-SHA512) runs entirely in native code; every other case (custom HMAC,
 * invalid parameters, unusual lengths) is delegated to libauth's JS so results
 * and error strings stay identical.
 */
import {
  instantiatePbkdf2Function,
  Pbkdf2Error,
  type Pbkdf2Parameters,
} from '@bitauth/libauth/build/lib/crypto/pbkdf2.js';

import { nativePbkdf2 } from '../../crypto';
import { HashAlgorithm } from '../../LibauthNativeModule';
import { hmacSha256, hmacSha512 } from './hmac';

export { instantiatePbkdf2Function, Pbkdf2Error };
export type { Pbkdf2Parameters };

const hmacSha256ByteLength = 32;
const hmacSha512ByteLength = 64;
const maxNativeIterations = 0x7fffffff;
const maxNativeLength = 1 << 20;

/**
 * libauth's JS implementation only succeeds when the derived key length is at
 * most one HMAC block or an exact multiple of it (otherwise it throws a
 * RangeError); keep those cases on the JS path so behavior is unchanged.
 */
const canUseNative = ({ iterations, derivedKeyLength }: Pbkdf2Parameters, hmacByteLength: number) =>
  Number.isInteger(iterations) &&
  iterations > 0 &&
  iterations <= maxNativeIterations &&
  Number.isInteger(derivedKeyLength) &&
  derivedKeyLength > 0 &&
  derivedKeyLength <= maxNativeLength &&
  (derivedKeyLength <= hmacByteLength || derivedKeyLength % hmacByteLength === 0);

export const pbkdf2HmacSha256 = (parameters: Pbkdf2Parameters, sha256Hmac = hmacSha256) =>
  sha256Hmac === hmacSha256 && canUseNative(parameters, hmacSha256ByteLength)
    ? nativePbkdf2(HashAlgorithm.sha256, parameters.password, parameters.salt, parameters.iterations, parameters.derivedKeyLength)
    : instantiatePbkdf2Function(sha256Hmac, hmacSha256ByteLength)(parameters);

export const pbkdf2HmacSha512 = (parameters: Pbkdf2Parameters, sha512Hmac = hmacSha512) =>
  sha512Hmac === hmacSha512 && canUseNative(parameters, hmacSha512ByteLength)
    ? nativePbkdf2(HashAlgorithm.sha512, parameters.password, parameters.salt, parameters.iterations, parameters.derivedKeyLength)
    : instantiatePbkdf2Function(sha512Hmac, hmacSha512ByteLength)(parameters);
