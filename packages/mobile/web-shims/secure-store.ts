/**
 * Web preview only: expo-secure-store has no web implementation, and a browser has no secure
 * enclave. Only the linked wallet's address, which is public, is kept (in localStorage).
 * Secrets (app wallet keys, recovery phrases, service credentials) are never written: reads
 * return nothing and writes are refused, so a browser never holds a key. Native builds use
 * expo-secure-store.
 */
const PUBLIC_KEYS = new Set(['focusgarden.reward.chipnet']);

export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 'WHEN_UNLOCKED_THIS_DEVICE_ONLY';

export async function getItemAsync(key: string): Promise<string | null> {
  return PUBLIC_KEYS.has(key) ? globalThis.localStorage.getItem(key) : null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (!PUBLIC_KEYS.has(key)) throw new Error('Wallet keys are kept only in the iPhone and Android apps.');
  globalThis.localStorage.setItem(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (PUBLIC_KEYS.has(key)) globalThis.localStorage.removeItem(key);
}

export async function isAvailableAsync() {
  return false;
}
