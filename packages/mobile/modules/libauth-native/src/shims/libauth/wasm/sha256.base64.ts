/**
 * Replaces libauth's `bin/sha256/sha256.base64.js`. The native backend never loads
 * WebAssembly, so the embedded binary is dropped from the bundle.
 */
export const sha256Base64Bytes = '';
