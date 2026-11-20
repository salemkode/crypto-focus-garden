import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { secp256k1 } from "@noble/curves/secp256k1";
import { publicWallet } from "./address";

/** Storage name kept from the Chipnet era so existing wallets stay reachable; the key works on any network. */
export const INTERNAL_KEY_NAME = "focusgarden.chipnet.internal.v1";
const keyName = INTERNAL_KEY_NAME;
const options = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
// Deliberate creation only. A failed read or invalid key must never replace a funded wallet.
export async function loadInternalWallet() {
  const stored = await SecureStore.getItemAsync(keyName, options);
  if (!stored) return null;
  if (!secp256k1.utils.isValidPrivateKey(hexToBytes(stored)))
    throw new Error(
      "App wallet could not be opened. Do not reset the app; contact support.",
    );
  return publicWallet(stored);
}
export async function createInternalWallet() {
  const existing = await loadInternalWallet();
  if (existing) return existing;
  const secret = bytesToHex(await Crypto.getRandomBytesAsync(32));
  if (!secp256k1.utils.isValidPrivateKey(hexToBytes(secret)))
    throw new Error("Could not generate the wallet. Please try again.");
  await SecureStore.setItemAsync(keyName, secret, options);
  return publicWallet(secret);
}
