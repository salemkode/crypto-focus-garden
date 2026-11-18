/**
 * Replaces libauth's `crypto/default-crypto-instances.js`, which instantiates
 * WebAssembly with top-level `await` (unsupported by Hermes/Metro). The native
 * instances are available synchronously.
 */
export { ripemd160, secp256k1, sha1, sha256, sha512 } from '../../crypto';
