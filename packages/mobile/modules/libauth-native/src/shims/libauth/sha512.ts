/** Replaces libauth's `crypto/sha512.js`: returns the native implementation. */
import type { Sha512 } from '@bitauth/libauth';

import { sha512 } from '../../crypto';

/** Native-backed; the WebAssembly bytes are ignored (Hermes has no WebAssembly). */
export const instantiateSha512Bytes = async (_webassemblyBytes?: ArrayBuffer): Promise<Sha512> => sha512;
/** No WebAssembly binary is embedded in React Native builds. */
export const getEmbeddedSha512Binary = (): ArrayBuffer => new ArrayBuffer(0);
export const instantiateSha512 = async (): Promise<Sha512> => sha512;
