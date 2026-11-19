/**
 * Web-only replacement for libauth's `crypto/default-crypto-instances.js`.
 * The original uses top-level `await`, which Metro's classic-script web bundle
 * cannot execute. Browsers do support WebAssembly, so the same libauth WASM
 * implementations are instantiated asynchronously and copied onto stable
 * exported objects. Native builds keep using libauth-native's redirects.
 */
import type { Ripemd160, Secp256k1, Sha1, Sha256, Sha512 } from '@bitauth/libauth';
import { instantiateRipemd160 } from '@bitauth/libauth/build/lib/crypto/ripemd160.js';
import { instantiateSecp256k1 } from '@bitauth/libauth/build/lib/crypto/secp256k1.js';
import { instantiateSha1 } from '@bitauth/libauth/build/lib/crypto/sha1.js';
import { instantiateSha256 } from '@bitauth/libauth/build/lib/crypto/sha256.js';
import { instantiateSha512 } from '@bitauth/libauth/build/lib/crypto/sha512.js';

export const sha1 = {} as Sha1;
export const sha256 = {} as Sha256;
export const sha512 = {} as Sha512;
export const ripemd160 = {} as Ripemd160;
export const secp256k1 = {} as Secp256k1;

export const ready = Promise.all([instantiateSha1(), instantiateSha256(), instantiateSha512(), instantiateRipemd160(), instantiateSecp256k1()])
  .then(([a, b, c, d, e]) => {
    Object.assign(sha1, a);
    Object.assign(sha256, b);
    Object.assign(sha512, c);
    Object.assign(ripemd160, d);
    Object.assign(secp256k1, e);
  });
