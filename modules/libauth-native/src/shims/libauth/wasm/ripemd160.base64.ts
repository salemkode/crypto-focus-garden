/**
 * Replaces libauth's `bin/ripemd160/ripemd160.base64.js`. The native backend never loads
 * WebAssembly, so the embedded binary is dropped from the bundle.
 */
export const ripemd160Base64Bytes = '';
