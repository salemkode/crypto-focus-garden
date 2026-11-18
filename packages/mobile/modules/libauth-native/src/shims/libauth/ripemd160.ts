/** Replaces libauth's `crypto/ripemd160.js`: returns the native implementation. */
import type { Ripemd160 } from '@bitauth/libauth';

import { ripemd160 } from '../../crypto';

/** Native-backed; the WebAssembly bytes are ignored (Hermes has no WebAssembly). */
export const instantiateRipemd160Bytes = async (_webassemblyBytes?: ArrayBuffer): Promise<Ripemd160> => ripemd160;
/** No WebAssembly binary is embedded in React Native builds. */
export const getEmbeddedRipemd160Binary = (): ArrayBuffer => new ArrayBuffer(0);
export const instantiateRipemd160 = async (): Promise<Ripemd160> => ripemd160;
