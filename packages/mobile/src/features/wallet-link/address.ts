import { decodeCashAddress, encodeCashAddress } from '@bitauth/libauth';

/**
 * Focus Garden runs on Chipnet, where the same key has a `bchtest:` address. Linked wallets may
 * share their mainnet form (`bitcoincash:`), with or without the prefix; all of them map to the one
 * Chipnet address of the same key. Only key (P2PKH) addresses can receive reward NFTs.
 */
export function chipnetAddress(address: string): string {
  const text = address.trim().toLowerCase();
  const candidates = text.includes(':') ? [text] : [`bitcoincash:${text}`, `bchtest:${text}`];
  for (const candidate of candidates) {
    const decoded = decodeCashAddress(candidate);
    if (typeof decoded === 'string') continue;
    if (decoded.type !== 'p2pkh' && decoded.type !== 'p2pkhWithTokens') throw new Error('Link a regular wallet address. Script addresses cannot receive trees.');
    return encodeCashAddress({ prefix: 'bchtest', type: decoded.type, payload: decoded.payload }).address;
  }
  throw new Error('The wallet shared an address Focus Garden cannot read.');
}

/** A CAIP-10 account from WalletConnect: `bch:bchtest:bchtest:qq…`, or `bch:bchtest:qq…`. */
export function addressFromAccount(account: string): string | null {
  const parts = account.split(':');
  if (parts[0] !== 'bch' || parts.length < 3) return null;
  const rest = parts.slice(2).join(':');
  try { return chipnetAddress(rest); } catch { return null; }
}
