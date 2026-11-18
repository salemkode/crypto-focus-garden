import { describe, expect, test } from "bun:test";
import {
  cashAddressToLockingBytecode,
  encodeCashAddress,
  hash160,
  secp256k1,
} from "@bitauth/libauth";
import { hexToBytes } from "@noble/hashes/utils";
import {
  addressFromPublicKey,
  parseRewardAddress,
  publicWallet,
} from "../src/wallet/address";

const privateKey = "01".repeat(32);
const wallet = publicWallet(privateKey);
describe("native CashAddr boundary", () => {
  test("agrees with libauth without importing it into the mobile runtime", () => {
    const publicKey = secp256k1.derivePublicKeyCompressed(
      hexToBytes(privateKey),
    );
    if (typeof publicKey === "string") throw new Error(publicKey);
    const reference = encodeCashAddress({
      prefix: "bchtest",
      type: "p2pkh",
      payload: hash160(publicKey),
      throwErrors: true,
    });
    expect(wallet.address).toBe(reference.address);
    const script = cashAddressToLockingBytecode(wallet.address);
    if (typeof script === "string") throw new Error(script);
    expect(parseRewardAddress(wallet.address).lockingBytecode).toBe(
      Buffer.from(script.bytecode).toString("hex"),
    );
  });
  test("accepts a token-aware external P2PKH address", () => {
    const result = encodeCashAddress({
      prefix: "bchtest",
      type: "p2pkhWithTokens",
      payload: hexToBytes("ab".repeat(20)),
      throwErrors: true,
    });
    expect(parseRewardAddress(result.address).lockingBytecode).toBe(
      `76a914${"ab".repeat(20)}88ac`,
    );
  });
  test("accepts uppercase but rejects mixed case", () => {
    expect(parseRewardAddress(wallet.address.toUpperCase()).address).toBe(
      wallet.address,
    );
    expect(() => parseRewardAddress(`B${wallet.address.slice(1)}`)).toThrow();
  });
  test("rejects checksum mutation and the wrong network", () => {
    expect(() =>
      parseRewardAddress(
        wallet.address.slice(0, -1) +
          (wallet.address.endsWith("q") ? "p" : "q"),
      ),
    ).toThrow();
    expect(() =>
      parseRewardAddress(
        addressFromPublicKey(hexToBytes(wallet.publicKey), "bitcoincash"),
      ),
    ).toThrow();
  });
  test("rejects script-hash addresses rather than sending to an unsupported script", () => {
    const address = encodeCashAddress({
      prefix: "bchtest",
      type: "p2sh",
      payload: hexToBytes("ab".repeat(20)),
      throwErrors: true,
    });
    expect(() => parseRewardAddress(address.address)).toThrow();
  });
});
