/** Replaces libauth's `crypto/sha256.js`: returns the native implementation. */
import type { Sha256 } from '@bitauth/libauth';

import { sha256 } from '../../crypto';

/** Native-backed; the WebAssembly bytes are ignored (Hermes has no WebAssembly). */
export const instantiateSha256Bytes = async (_webassemblyBytes?: ArrayBuffer): Promise<Sha256> => sha256;
/** No WebAssembly binary is embedded in React Native builds. */
export const getEmbeddedSha256Binary = (): ArrayBuffer => new ArrayBuffer(0);
export const instantiateSha256 = async (): Promise<Sha256> => sha256;
