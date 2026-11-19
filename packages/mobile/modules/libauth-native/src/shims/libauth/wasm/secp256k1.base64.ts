/**
 * Replaces libauth's `bin/secp256k1/secp256k1.base64.js`. The native backend never loads
 * WebAssembly, so the embedded binary is dropped from the bundle.
 */
export const secp256k1Base64Bytes = '';
