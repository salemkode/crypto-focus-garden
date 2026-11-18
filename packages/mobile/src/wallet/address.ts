import { sha256 } from "@noble/hashes/sha256";
import { ripemd160 } from "@noble/hashes/ripemd160";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { secp256k1 } from "@noble/curves/secp256k1";

// CashAddr uses a 40-bit checksum; BigInt works in Hermes and avoids Node/WASM.
const alphabet = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const generators = [
  0x98f2bc8e61n,
  0x79b76d99e2n,
  0xf33e5fb3c4n,
  0xae2eabe2a8n,
  0x1e4f43e470n,
];
function checksum(values: number[]) {
  return (
    values.reduce((acc, value) => {
      const top = acc >> 35n;
      const next = ((acc & 0x07ffffffffn) << 5n) ^ BigInt(value);
      return generators.reduce(
        (sum, generator, index) =>
          (top >> BigInt(index)) & 1n ? sum ^ generator : sum,
        next,
      );
    }, 1n) ^ 1n
  );
}
function convert(values: number[], from: number, to: number, pad: boolean) {
  const result = values.reduce(
    (state, value) => {
      if (value < 0 || value >> from)
        throw new Error("Invalid address encoding");
      const accumulator =
        ((state.accumulator << from) | value) & ((1 << (from + to - 1)) - 1);
      const bits = state.bits + from;
      const length = Math.floor(bits / to);
      return {
        accumulator,
        bits: bits % to,
        output: [
          ...state.output,
          ...Array.from(
            { length },
            (_, i) => (accumulator >> (bits - (i + 1) * to)) & ((1 << to) - 1),
          ),
        ],
      };
    },
    { accumulator: 0, bits: 0, output: [] as number[] },
  );
  if (
    !pad &&
    (result.bits >= from ||
      (result.accumulator << (to - result.bits)) & ((1 << to) - 1))
  )
    throw new Error("Invalid address padding");
  return pad && result.bits
    ? [
        ...result.output,
        (result.accumulator << (to - result.bits)) & ((1 << to) - 1),
      ]
    : result.output;
}
const prefixValues = (prefix: string) =>
  [...prefix].map((char) => char.charCodeAt(0) & 31).concat(0);
export function addressFromPublicKey(
  publicKey: Uint8Array,
  prefix = "bchtest",
) {
  const hash = ripemd160(sha256(publicKey));
  const payload = convert([0, ...hash], 8, 5, true);
  const sum = checksum([
    ...prefixValues(prefix),
    ...payload,
    ...Array(8).fill(0),
  ]);
  const check = Array.from({ length: 8 }, (_, i) =>
    Number((sum >> BigInt((7 - i) * 5)) & 31n),
  );
  return `${prefix}:${[...payload, ...check].map((value) => alphabet[value]).join("")}`;
}
export function parseRewardAddress(address: string) {
  if (address !== address.toLowerCase() && address !== address.toUpperCase())
    throw new Error("Use an address with consistent casing");
  const normalized = address.toLowerCase();
  const [prefix, encoded, extra] = normalized.split(":");
  if (extra || prefix !== "bchtest" || !encoded || encoded.length !== 42)
    throw new Error("Use a full chipnet BCH address beginning with bchtest:");
  const values = [...encoded].map((char) => alphabet.indexOf(char));
  if (
    values.some((value) => value < 0) ||
    checksum([...prefixValues(prefix), ...values]) !== 0n
  )
    throw new Error("Address checksum is invalid");
  const data = convert(values.slice(0, -8), 5, 8, false);
  if (data.length !== 21 || (data[0] !== 0 && data[0] !== 16))
    throw new Error("Use a P2PKH wallet address");
  return {
    address: normalized,
    lockingBytecode: `76a914${bytesToHex(Uint8Array.from(data.slice(1)))}88ac`,
  };
}
export function publicWallet(privateKey: string) {
  const publicKey = secp256k1.getPublicKey(hexToBytes(privateKey));
  return {
    publicKey: bytesToHex(publicKey),
    address: addressFromPublicKey(publicKey),
  };
}
