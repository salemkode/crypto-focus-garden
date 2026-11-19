/**
 * Differential test: the native C core vs. libauth's WebAssembly crypto.
 *
 * Usage: node test/host/compare-with-wasm.mjs <path-to-harness-binary> [iterations]
 * Run via `npm run test:host` in modules/libauth-native.
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';
import {
  binToHex,
  hexToBin,
  hmacSha256,
  hmacSha512,
  pbkdf2HmacSha256,
  pbkdf2HmacSha512,
  ripemd160,
  secp256k1,
  sha1,
  sha256,
  sha512,
  Secp256k1Error,
} from '@bitauth/libauth';

const [harnessPath, iterationArg] = process.argv.slice(2);
if (!harnessPath) {
  console.error('usage: compare-with-wasm.mjs <harness> [iterations]');
  process.exit(2);
}
const ITERATIONS = Number(iterationArg ?? 300);

const child = spawn(harnessPath, [], { stdio: ['pipe', 'pipe', 'inherit'] });
const lines = createInterface({ input: child.stdout });
const pending = [];
lines.on('line', (line) => pending.shift()(line));
const run = (cmd) =>
  new Promise((resolve) => {
    pending.push(resolve);
    child.stdin.write(`${cmd}\n`);
  });

const hex = (bin) => (bin.length === 0 ? '-' : binToHex(bin));
const rand = (n) => new Uint8Array(randomBytes(n));
const randInt = (max) => Math.floor(Math.random() * max);

const errorCode = {
  [Secp256k1Error.unparsablePublicKey]: 1,
  [Secp256k1Error.unparsableSignature]: 2,
  [Secp256k1Error.derivePublicKeyFromInvalidPrivateKey]: 3,
  [Secp256k1Error.signWithInvalidPrivateKey]: 4,
  [Secp256k1Error.recoverPublicKeyWithUnparsableSignature]: 5,
  [Secp256k1Error.recoverPublicKeyInvalidMaterial]: 6,
  [Secp256k1Error.addTweakPrivateKey]: 7,
  [Secp256k1Error.mulTweakPrivateKey]: 8,
  [Secp256k1Error.addTweakPublicKey]: 9,
  [Secp256k1Error.mulTweakPublicKey]: 10,
};
const expectStatus = (result) =>
  typeof result === 'string' ? `${errorCode[result]} -` : `0 ${hex(result)}`;

let checks = 0;
let failures = 0;
const check = async (label, cmd, expected) => {
  const actual = await run(cmd);
  checks += 1;
  if (actual !== expected) {
    failures += 1;
    if (failures <= 20) {
      console.error(`FAIL ${label}\n  cmd:      ${cmd.slice(0, 300)}\n  expected: ${expected}\n  actual:   ${actual}`);
    }
  }
};

const N = hexToBin('fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
const ONE = hexToBin('0000000000000000000000000000000000000000000000000000000000000001');
const ZERO = new Uint8Array(32);
const MAX = new Uint8Array(32).fill(0xff);
const specialScalars = [ZERO, ONE, N, MAX, hexToBin('01'), new Uint8Array(0), hexToBin('fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140')];

// ---------------------------------------------------------------- hashes
const hashes = [
  [0, sha1],
  [1, sha256],
  [2, sha512],
  [3, ripemd160],
];
const lengths = [0, 1, 3, 55, 56, 57, 63, 64, 65, 111, 112, 113, 119, 127, 128, 129, 200, 1000, 4096, 100_003];
for (const [alg, impl] of hashes) {
  for (const len of lengths) {
    const data = rand(len);
    await check(`hash ${alg} len ${len}`, `hash ${alg} ${hex(data)}`, hex(impl.hash(data)));
  }
  for (let i = 0; i < ITERATIONS / 3; i++) {
    const parts = [rand(randInt(150)), rand(randInt(150)), rand(randInt(300))];
    const all = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let o = 0;
    for (const p of parts) { all.set(p, o); o += p.length; }
    await check(`hinc ${alg}`, `hinc ${alg} ${parts.map(hex).join(' ')}`, hex(impl.hash(all)));
    // libauth's own incremental API (WASM) must agree too.
    const st = parts.reduce((s, p) => impl.update(s, p), impl.init());
    await check(`hinc-wasm ${alg}`, `hinc ${alg} ${parts.map(hex).join(' ')}`, hex(impl.final(st)));
  }
}
for (let i = 0; i < ITERATIONS / 3; i++) {
  const key = rand(randInt(300));
  const msg = rand(randInt(300));
  await check('hmac256', `hmac 1 ${hex(key)} ${hex(msg)}`, hex(hmacSha256(key, msg)));
  await check('hmac512', `hmac 2 ${hex(key)} ${hex(msg)}`, hex(hmacSha512(key, msg)));
}
for (const [iters, len256, len512] of [[1, 32, 64], [2, 20, 33], [7, 64, 128], [2048, 32, 64], [3, 96, 192]]) {
  const pw = rand(randInt(200));
  const salt = rand(randInt(80));
  await check('pbkdf2-256', `pbkdf2 1 ${hex(pw)} ${hex(salt)} ${iters} ${len256}`,
    hex(pbkdf2HmacSha256({ password: pw, salt, iterations: iters, derivedKeyLength: len256 })));
  await check('pbkdf2-512', `pbkdf2 2 ${hex(pw)} ${hex(salt)} ${iters} ${len512}`,
    hex(pbkdf2HmacSha512({ password: pw, salt, iterations: iters, derivedKeyLength: len512 })));
}

// ------------------------------------------------------------- secp256k1
const keys = [...specialScalars, ...Array.from({ length: ITERATIONS }, () => rand(32))];
const pubkeysToTest = [];
for (const key of keys) {
  await check('vpriv', `vpriv ${hex(key)}`, secp256k1.validatePrivateKey(key) ? '1' : '0');
  for (const c of [0, 1]) {
    const res = c ? secp256k1.derivePublicKeyCompressed(key) : secp256k1.derivePublicKeyUncompressed(key);
    await check('derive', `derive ${hex(key)} ${c}`, expectStatus(res));
    if (typeof res !== 'string') pubkeysToTest.push(res);
  }
}
// Malformed/hybrid public keys.
const extraPubkeys = [new Uint8Array(0), new Uint8Array(33), new Uint8Array(65), rand(33), rand(65)];
for (const pk of pubkeysToTest.slice(0, 20)) {
  if (pk.length === 65) {
    const hybrid = pk.slice();
    hybrid[0] = pk[64] & 1 ? 0x07 : 0x06;
    extraPubkeys.push(hybrid, pk.slice(0, 64), pk.slice(0, 33));
    const bad = pk.slice(); bad[10] ^= 1; extraPubkeys.push(bad);
  }
}
for (const pk of [...pubkeysToTest, ...extraPubkeys]) {
  await check('vpub', `vpub ${hex(pk)}`, secp256k1.validatePublicKey(pk) ? '1' : '0');
  await check('compress', `convpub ${hex(pk)} 1`, expectStatus(secp256k1.compressPublicKey(pk)));
  await check('uncompress', `convpub ${hex(pk)} 0`, expectStatus(secp256k1.uncompressPublicKey(pk)));
}

for (let i = 0; i < keys.length; i++) {
  const key = keys[i];
  const msg = i % 7 === 0 ? rand(randInt(32)) : rand(32);
  const der = secp256k1.signMessageHashDER(key, msg);
  const compact = secp256k1.signMessageHashCompact(key, msg);
  const schnorr = secp256k1.signMessageHashSchnorr(key, msg);
  const rec = secp256k1.signMessageHashRecoverableCompact(key, msg);
  await check('signDER', `sign ${hex(key)} ${hex(msg)} 1`, expectStatus(der));
  await check('signCompact', `sign ${hex(key)} ${hex(msg)} 0`, expectStatus(compact));
  await check('schnorr', `schnorr ${hex(key)} ${hex(msg)}`, expectStatus(schnorr));
  await check('signrec', `signrec ${hex(key)} ${hex(msg)}`,
    typeof rec === 'string' ? `${errorCode[rec]} -` : `0 ${hex(rec.signature)} ${rec.recoveryId}`);
  if (typeof der === 'string') continue;
  const pubC = secp256k1.derivePublicKeyCompressed(key);
  const pubU = secp256k1.derivePublicKeyUncompressed(key);
  const otherMsg = rand(32);
  const highDER = secp256k1.malleateSignatureDER(der);
  const highCompact = secp256k1.malleateSignatureCompact(compact);
  const corrupt = der.slice(); corrupt[5] ^= 0x40;
  const sigs = [[der, 1], [compact, 0], [highDER, 1], [highCompact, 0], [corrupt, 1], [der.slice(0, 20), 1], [compact, 1], [der, 0]];
  for (const [sig, isDer] of sigs) {
    await check('convsig', `convsig ${hex(sig)} ${isDer}`,
      expectStatus(isDer ? secp256k1.signatureDERToCompact(sig) : secp256k1.signatureCompactToDER(sig)));
    for (const normalize of [0, 1]) {
      const mod = isDer
        ? (normalize ? secp256k1.normalizeSignatureDER(sig) : secp256k1.malleateSignatureDER(sig))
        : (normalize ? secp256k1.normalizeSignatureCompact(sig) : secp256k1.malleateSignatureCompact(sig));
      await check('modsig', `modsig ${hex(sig)} ${isDer} ${normalize}`, expectStatus(mod));
      for (const [pk, m] of [[pubC, msg], [pubU, msg], [pubC, otherMsg], [extraPubkeys[i % extraPubkeys.length], msg]]) {
        const fn = isDer
          ? (normalize ? secp256k1.verifySignatureDER : secp256k1.verifySignatureDERLowS)
          : (normalize ? secp256k1.verifySignatureCompact : secp256k1.verifySignatureCompactLowS);
        await check('verify', `verify ${hex(sig)} ${isDer} ${normalize} ${hex(pk)} ${hex(m)}`, fn(sig, pk, m) ? '1' : '0');
      }
    }
  }
  for (const [s, pk, m] of [[schnorr, pubC, msg], [schnorr, pubU, msg], [schnorr, pubC, otherMsg], [compact, pubC, msg], [schnorr.slice(0, 40), pubC, msg]]) {
    await check('vschnorr', `vschnorr ${hex(s)} ${hex(pk)} ${hex(m)}`, secp256k1.verifySignatureSchnorr(s, pk, m) ? '1' : '0');
  }
  for (let recid = 0; recid < 4; recid++) {
    for (const c of [0, 1]) {
      const r = c
        ? secp256k1.recoverPublicKeyCompressed(rec.signature, recid, msg)
        : secp256k1.recoverPublicKeyUncompressed(rec.signature, recid, msg);
      await check('recover', `recover ${hex(rec.signature)} ${recid} ${hex(msg)} ${c}`, expectStatus(r));
    }
  }
  const zeroSig = new Uint8Array(64);
  await check('recover-zero', `recover ${hex(zeroSig)} 0 ${hex(msg)} 1`, expectStatus(secp256k1.recoverPublicKeyCompressed(zeroSig, 0, msg)));
  const tweak = i % 5 === 0 ? specialScalars[i % specialScalars.length] : rand(32);
  await check('tweakpriv-add', `tweakpriv ${hex(key)} ${hex(tweak)} 0`, expectStatus(secp256k1.addTweakPrivateKey(key, tweak)));
  await check('tweakpriv-mul', `tweakpriv ${hex(key)} ${hex(tweak)} 1`, expectStatus(secp256k1.mulTweakPrivateKey(key, tweak)));
  for (const pk of [pubC, pubU]) {
    await check('tweakpub-add-c', `tweakpub ${hex(pk)} ${hex(tweak)} 0 1`, expectStatus(secp256k1.addTweakPublicKeyCompressed(pk, tweak)));
    await check('tweakpub-add-u', `tweakpub ${hex(pk)} ${hex(tweak)} 0 0`, expectStatus(secp256k1.addTweakPublicKeyUncompressed(pk, tweak)));
    await check('tweakpub-mul-c', `tweakpub ${hex(pk)} ${hex(tweak)} 1 1`, expectStatus(secp256k1.mulTweakPublicKeyCompressed(pk, tweak)));
    await check('tweakpub-mul-u', `tweakpub ${hex(pk)} ${hex(tweak)} 1 0`, expectStatus(secp256k1.mulTweakPublicKeyUncompressed(pk, tweak)));
  }
}
// Tweak that produces the point at infinity: add (n - k) to pubkey(k).
{
  const k = ONE;
  const negK = hexToBin('fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140');
  const pk = secp256k1.derivePublicKeyCompressed(k);
  await check('tweakpub-infinity', `tweakpub ${hex(pk)} ${hex(negK)} 0 1`, expectStatus(secp256k1.addTweakPublicKeyCompressed(pk, negK)));
  await check('tweakpriv-zero', `tweakpriv ${hex(k)} ${hex(negK)} 0`, expectStatus(secp256k1.addTweakPrivateKey(k, negK)));
}

child.stdin.end();
console.log(`${checks - failures}/${checks} checks matched libauth WebAssembly`);
process.exit(failures === 0 ? 0 : 1);
