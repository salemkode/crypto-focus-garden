import { NativeModule, requireNativeModule } from 'expo';

/**
 * Hash algorithm identifiers shared with the C core (`lan_hash_algorithm`).
 */
export const HashAlgorithm = {
  sha1: 0,
  sha256: 1,
  sha512: 2,
  ripemd160: 3,
} as const;
export type HashAlgorithm = (typeof HashAlgorithm)[keyof typeof HashAlgorithm];

/**
 * The raw JSI surface of the native module. All calls are synchronous.
 *
 * secp256k1 functions returning `Uint8Array` prefix the payload with a status
 * byte: `0` for success, otherwise an index into `secp256k1ErrorByStatus`.
 * Public keys are passed zero-padded to 65 bytes and ECDSA signatures to 72
 * bytes, together with their original length (mirroring libauth's WASM wrapper).
 */
declare class LibauthNativeModule extends NativeModule {
  randomBytes(length: number): Uint8Array;

  hash(algorithm: HashAlgorithm, input: Uint8Array): Uint8Array;
  hashInit(algorithm: HashAlgorithm): Uint8Array;
  hashUpdate(algorithm: HashAlgorithm, state: Uint8Array, input: Uint8Array): Uint8Array;
  hashFinal(algorithm: HashAlgorithm, state: Uint8Array): Uint8Array;
  hmac(algorithm: HashAlgorithm, key: Uint8Array, message: Uint8Array): Uint8Array;
  pbkdf2(
    algorithm: HashAlgorithm,
    password: Uint8Array,
    salt: Uint8Array,
    iterations: number,
    derivedKeyLength: number
  ): Uint8Array;

  secp256k1Randomize(seed: Uint8Array): boolean;
  secp256k1ValidatePrivateKey(privateKey: Uint8Array): boolean;
  secp256k1ValidatePublicKey(publicKey: Uint8Array, length: number): boolean;
  secp256k1DerivePublicKey(privateKey: Uint8Array, compressed: boolean): Uint8Array;
  secp256k1ConvertPublicKey(publicKey: Uint8Array, length: number, compressed: boolean): Uint8Array;
  secp256k1SignECDSA(privateKey: Uint8Array, messageHash: Uint8Array, der: boolean): Uint8Array;
  secp256k1SignSchnorr(privateKey: Uint8Array, messageHash: Uint8Array): Uint8Array;
  secp256k1SignRecoverable(privateKey: Uint8Array, messageHash: Uint8Array): Uint8Array;
  secp256k1RecoverPublicKey(
    signature: Uint8Array,
    recoveryId: number,
    messageHash: Uint8Array,
    compressed: boolean
  ): Uint8Array;
  secp256k1ConvertSignature(signature: Uint8Array, length: number, fromDER: boolean): Uint8Array;
  secp256k1ModifySignature(
    signature: Uint8Array,
    length: number,
    isDER: boolean,
    normalize: boolean
  ): Uint8Array;
  secp256k1VerifyECDSA(
    signature: Uint8Array,
    signatureLength: number,
    isDER: boolean,
    normalize: boolean,
    publicKey: Uint8Array,
    publicKeyLength: number,
    messageHash: Uint8Array
  ): boolean;
  secp256k1VerifySchnorr(
    signature: Uint8Array,
    publicKey: Uint8Array,
    publicKeyLength: number,
    messageHash: Uint8Array
  ): boolean;
  secp256k1TweakPrivateKey(privateKey: Uint8Array, tweak: Uint8Array, multiply: boolean): Uint8Array;
  secp256k1TweakPublicKey(
    publicKey: Uint8Array,
    length: number,
    tweak: Uint8Array,
    multiply: boolean,
    compressed: boolean
  ): Uint8Array;
}

export default requireNativeModule<LibauthNativeModule>('LibauthNative');
