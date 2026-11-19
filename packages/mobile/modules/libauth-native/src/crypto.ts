/**
 * Native implementations of libauth's crypto interfaces (`Sha1`, `Sha256`,
 * `Sha512`, `Ripemd160`, `Secp256k1`) backed by the LibauthNative module.
 *
 * IMPORTANT: this file must only use *type* imports from `@bitauth/libauth`.
 * libauth's own modules import these instances (via the Metro redirects), so a
 * value import here would create a circular dependency.
 */
import type { RecoveryId, Ripemd160, Secp256k1, Sha1, Sha256, Sha512 } from '@bitauth/libauth';

import Native, { HashAlgorithm } from './LibauthNativeModule';

/** Mirrors libauth's `Secp256k1Error` enum (same string values). */
export enum Secp256k1Error {
  unparsableSignature = 'Failed to parse signature.',
  unparsablePublicKey = 'Failed to parse public key.',
  derivePublicKeyFromInvalidPrivateKey = 'Cannot derive public key from invalid private key.',
  signWithInvalidPrivateKey = 'Failed to sign message hash. The private key is not valid.',
  recoverPublicKeyWithUnparsableSignature = 'Failed to recover public key. Could not parse signature.',
  recoverPublicKeyInvalidMaterial = 'Failed to recover public key. The compact signature, recovery, or message hash is invalid.',
  addTweakPrivateKey = 'Private key is invalid or adding failed.',
  mulTweakPrivateKey = 'Private key is invalid or multiplying failed.',
  addTweakPublicKey = 'Failed to tweak public key (by addition).',
  mulTweakPublicKey = 'Failed to tweak public key (by multiplication).',
}

/** Status codes returned by the C core, see `cpp/lan_secp256k1.h`. */
const secp256k1ErrorByStatus: Record<number, Secp256k1Error> = {
  1: Secp256k1Error.unparsablePublicKey,
  2: Secp256k1Error.unparsableSignature,
  3: Secp256k1Error.derivePublicKeyFromInvalidPrivateKey,
  4: Secp256k1Error.signWithInvalidPrivateKey,
  5: Secp256k1Error.recoverPublicKeyWithUnparsableSignature,
  6: Secp256k1Error.recoverPublicKeyInvalidMaterial,
  7: Secp256k1Error.addTweakPrivateKey,
  8: Secp256k1Error.mulTweakPrivateKey,
  9: Secp256k1Error.addTweakPublicKey,
  10: Secp256k1Error.mulTweakPublicKey,
};

const toUint8Array = (value: Uint8Array): Uint8Array => {
  if (value instanceof Uint8Array) {
    // Subclasses such as Node's Buffer are still Uint8Arrays to JSI; copy only when needed.
    return value.constructor === Uint8Array ? value : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return Uint8Array.from(value as unknown as ArrayLike<number>);
};

// --------------------------------------------------------------- hashes

const createHash = (algorithm: HashAlgorithm) => ({
  final: (rawState: Uint8Array) => Native.hashFinal(algorithm, toUint8Array(rawState)),
  hash: (input: Uint8Array) => Native.hash(algorithm, toUint8Array(input)),
  init: () => Native.hashInit(algorithm),
  update: (rawState: Uint8Array, input: Uint8Array) =>
    Native.hashUpdate(algorithm, toUint8Array(rawState), toUint8Array(input)),
});

export const sha1: Sha1 = createHash(HashAlgorithm.sha1);
export const sha256: Sha256 = createHash(HashAlgorithm.sha256);
export const sha512: Sha512 = createHash(HashAlgorithm.sha512);
export const ripemd160: Ripemd160 = createHash(HashAlgorithm.ripemd160);

/** Native HMAC-SHA256 (identical output to libauth's `hmacSha256`). */
export const nativeHmacSha256 = (secret: Uint8Array, message: Uint8Array) =>
  Native.hmac(HashAlgorithm.sha256, toUint8Array(secret), toUint8Array(message));
/** Native HMAC-SHA512 (identical output to libauth's `hmacSha512`). */
export const nativeHmacSha512 = (secret: Uint8Array, message: Uint8Array) =>
  Native.hmac(HashAlgorithm.sha512, toUint8Array(secret), toUint8Array(message));
/** Native PBKDF2; parameters must already be validated. */
export const nativePbkdf2 = (
  algorithm: typeof HashAlgorithm.sha256 | typeof HashAlgorithm.sha512,
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  derivedKeyLength: number
) => Native.pbkdf2(algorithm, toUint8Array(password), toUint8Array(salt), iterations, derivedKeyLength);

/** Cryptographically secure random bytes from the platform CSPRNG. */
export const randomBytes = (length: number) => Native.randomBytes(length);

// ------------------------------------------------------------ secp256k1

/** Identical to libauth's `cloneAndPad` (throws RangeError if `value` is too long). */
const cloneAndPad = (value: Uint8Array, expectedLength: number) => {
  const zeroPaddedValue = new Uint8Array(expectedLength);
  zeroPaddedValue.set(value);
  return zeroPaddedValue;
};

const decode = (result: Uint8Array): Uint8Array | string => {
  const status = result[0]!;
  if (status === 0) return result.slice(1);
  const error = secp256k1ErrorByStatus[status];
  if (error === undefined) {
    throw new Error(`libauth-native: secp256k1 call failed with status ${status}`);
  }
  return error;
};

const pad32 = (value: Uint8Array) => cloneAndPad(value, 32);
const pad65 = (value: Uint8Array) => cloneAndPad(value, 65);
const pad72 = (value: Uint8Array) => cloneAndPad(value, 72);

const derivePublicKey = (compressed: boolean) => (privateKey: Uint8Array) =>
  decode(Native.secp256k1DerivePublicKey(pad32(privateKey), compressed));

const convertPublicKey = (compressed: boolean) => (publicKey: Uint8Array) =>
  decode(Native.secp256k1ConvertPublicKey(pad65(publicKey), publicKey.length, compressed));

const convertSignature = (fromDER: boolean) => (signature: Uint8Array) =>
  decode(Native.secp256k1ConvertSignature(pad72(signature), signature.length, fromDER));

const modifySignature = (isDER: boolean, normalize: boolean) => (signature: Uint8Array) =>
  decode(Native.secp256k1ModifySignature(pad72(signature), signature.length, isDER, normalize));

const signMessageHash = (der: boolean) => (privateKey: Uint8Array, messageHash: Uint8Array) => {
  const paddedMessageHash = pad32(messageHash);
  return decode(Native.secp256k1SignECDSA(pad32(privateKey), paddedMessageHash, der));
};

const isValidPublicKey = (paddedPublicKey: Uint8Array, length: number) =>
  Native.secp256k1ValidatePublicKey(paddedPublicKey, length);

const verifySignature =
  (isDER: boolean, normalize: boolean) => (signature: Uint8Array, publicKey: Uint8Array, messageHash: Uint8Array) => {
    // libauth short-circuits: public key, then signature, then message hash. Oversized
    // inputs only throw (RangeError from cloneAndPad) if every earlier step succeeded.
    const paddedPublicKey = pad65(publicKey);
    if (signature.length > 72 || messageHash.length > 32) {
      if (!isValidPublicKey(paddedPublicKey, publicKey.length)) return false;
      const paddedSig = pad72(signature);
      if (Native.secp256k1ConvertSignature(paddedSig, signature.length, isDER)[0] !== 0) return false;
      pad32(messageHash);
    }
    const paddedSignature = pad72(signature);
    const paddedMessageHash = pad32(messageHash);
    return Native.secp256k1VerifyECDSA(
      paddedSignature,
      signature.length,
      isDER,
      normalize,
      paddedPublicKey,
      publicKey.length,
      paddedMessageHash
    );
  };

const recoverPublicKey =
  (compressed: boolean) => (signature: Uint8Array, recoveryId: RecoveryId, messageHash: Uint8Array) => {
    const paddedMessageHash = pad32(messageHash);
    const paddedSignature = pad72(signature);
    return decode(Native.secp256k1RecoverPublicKey(paddedSignature, recoveryId, paddedMessageHash, compressed));
  };

const tweakPublicKey =
  (multiply: boolean, compressed: boolean) => (publicKey: Uint8Array, tweakValue: Uint8Array) => {
    const paddedPublicKey = pad65(publicKey);
    if (tweakValue.length > 32 && !isValidPublicKey(paddedPublicKey, publicKey.length)) {
      return Secp256k1Error.unparsablePublicKey;
    }
    return decode(
      Native.secp256k1TweakPublicKey(paddedPublicKey, publicKey.length, pad32(tweakValue), multiply, compressed)
    );
  };

/**
 * Creates a libauth-compatible `Secp256k1` object backed by native code.
 *
 * @param randomSeed - optional 32-byte seed for context randomization
 * (side-channel hardening; never changes any outputs).
 */
export const createNativeSecp256k1 = (randomSeed?: Uint8Array): Secp256k1 => {
  if (randomSeed !== undefined) {
    Native.secp256k1Randomize(pad32(randomSeed));
  }
  return {
    addTweakPrivateKey: (privateKey, tweakValue) => {
      const paddedTweak = pad32(tweakValue);
      return decode(Native.secp256k1TweakPrivateKey(pad32(privateKey), paddedTweak, false));
    },
    addTweakPublicKeyCompressed: tweakPublicKey(false, true),
    addTweakPublicKeyUncompressed: tweakPublicKey(false, false),
    compressPublicKey: convertPublicKey(true),
    derivePublicKeyCompressed: derivePublicKey(true),
    derivePublicKeyUncompressed: derivePublicKey(false),
    malleateSignatureCompact: modifySignature(false, false),
    malleateSignatureDER: modifySignature(true, false),
    mulTweakPrivateKey: (privateKey, tweakValue) => {
      const paddedTweak = pad32(tweakValue);
      return decode(Native.secp256k1TweakPrivateKey(pad32(privateKey), paddedTweak, true));
    },
    mulTweakPublicKeyCompressed: tweakPublicKey(true, true),
    mulTweakPublicKeyUncompressed: tweakPublicKey(true, false),
    normalizeSignatureCompact: modifySignature(false, true),
    normalizeSignatureDER: modifySignature(true, true),
    recoverPublicKeyCompressed: recoverPublicKey(true),
    recoverPublicKeyUncompressed: recoverPublicKey(false),
    signMessageHashCompact: signMessageHash(false),
    signMessageHashDER: signMessageHash(true),
    signMessageHashRecoverableCompact: (privateKey, messageHash) => {
      const paddedMessageHash = pad32(messageHash);
      const result = Native.secp256k1SignRecoverable(pad32(privateKey), paddedMessageHash);
      if (result[0] !== 0) return decode(result) as string;
      return { recoveryId: result[1] as RecoveryId, signature: result.slice(2) };
    },
    signMessageHashSchnorr: (privateKey, messageHash) => {
      const paddedMessageHash = pad32(messageHash);
      return decode(Native.secp256k1SignSchnorr(pad32(privateKey), paddedMessageHash));
    },
    signatureCompactToDER: convertSignature(false),
    signatureDERToCompact: convertSignature(true),
    uncompressPublicKey: convertPublicKey(false),
    validatePrivateKey: (privateKey) => Native.secp256k1ValidatePrivateKey(pad32(privateKey)),
    validatePublicKey: (publicKey) => Native.secp256k1ValidatePublicKey(pad65(publicKey), publicKey.length),
    verifySignatureCompact: verifySignature(false, true),
    verifySignatureCompactLowS: verifySignature(false, false),
    verifySignatureDER: verifySignature(true, true),
    verifySignatureDERLowS: verifySignature(true, false),
    verifySignatureSchnorr: (signature, publicKey, messageHash) => {
      const paddedPublicKey = pad65(publicKey);
      if ((signature.length > 64 || messageHash.length > 32) && !isValidPublicKey(paddedPublicKey, publicKey.length)) {
        return false;
      }
      const paddedMessageHash = pad32(messageHash);
      const paddedSignature = cloneAndPad(signature, 64);
      return Native.secp256k1VerifySchnorr(paddedSignature, paddedPublicKey, publicKey.length, paddedMessageHash);
    },
  };
};

/** The default, shared native secp256k1 instance (context is not randomized, like libauth). */
export const secp256k1: Secp256k1 = createNativeSecp256k1();
