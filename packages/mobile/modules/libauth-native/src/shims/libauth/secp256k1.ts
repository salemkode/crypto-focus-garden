/** Replaces libauth's `crypto/secp256k1.js` with the native implementation. */
import type { Secp256k1 } from '@bitauth/libauth';

import { createNativeSecp256k1, Secp256k1Error } from '../../crypto';

export { Secp256k1Error };

/**
 * Native-backed; the WebAssembly bytes are ignored. `randomSeed` randomizes the
 * native context (side-channel hardening), matching libauth's semantics.
 */
export const instantiateSecp256k1Bytes = async (
  _webassemblyBytes?: ArrayBuffer,
  randomSeed?: Uint8Array
): Promise<Secp256k1> => createNativeSecp256k1(randomSeed);

export const instantiateSecp256k1 = async (randomSeed?: Uint8Array): Promise<Secp256k1> =>
  createNativeSecp256k1(randomSeed);
