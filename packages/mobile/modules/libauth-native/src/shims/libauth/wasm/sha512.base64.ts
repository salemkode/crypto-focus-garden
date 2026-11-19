/**
 * Replaces libauth's `bin/sha512/sha512.base64.js`. The native backend never loads
 * WebAssembly, so the embedded binary is dropped from the bundle.
 */
export const sha512Base64Bytes = '';
