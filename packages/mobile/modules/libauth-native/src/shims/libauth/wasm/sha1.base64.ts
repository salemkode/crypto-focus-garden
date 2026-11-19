/**
 * Replaces libauth's `bin/sha1/sha1.base64.js`. The native backend never loads
 * WebAssembly, so the embedded binary is dropped from the bundle.
 */
export const sha1Base64Bytes = '';
