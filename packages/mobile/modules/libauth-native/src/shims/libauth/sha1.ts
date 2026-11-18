/** Replaces libauth's `crypto/sha1.js`: returns the native implementation. */
import type { Sha1 } from '@bitauth/libauth';

import { sha1 } from '../../crypto';

/** Native-backed; the WebAssembly bytes are ignored (Hermes has no WebAssembly). */
export const instantiateSha1Bytes = async (_webassemblyBytes?: ArrayBuffer): Promise<Sha1> => sha1;
/** No WebAssembly binary is embedded in React Native builds. */
export const getEmbeddedSha1Binary = (): ArrayBuffer => new ArrayBuffer(0);
export const instantiateSha1 = async (): Promise<Sha1> => sha1;
