import { decodeCashAddress, encodeCashAddress } from '@bitauth/libauth';
import { PREFIX } from '../../services/network';

/**
 * Linked wallets may share an address with or without its prefix, on either network; all of them map
 * to the same key's address on the network this build uses. Only key (P2PKH) addresses can receive
 * reward NFTs.
 */
export function networkAddress(address: string): string {
  const text = address.trim().toLowerCase();
  const candidates = text.includes(':') ? [text] : [`bitcoincash:${text}`, `bchtest:${text}`];
  for (const candidate of candidates) {
    const decoded = decodeCashAddress(candidate);
    if (typeof decoded === 'string') continue;
    if (decoded.type !== 'p2pkh' && decoded.type !== 'p2pkhWithTokens') throw new Error('Link a regular wallet address. Script addresses cannot receive trees.');
    return encodeCashAddress({ prefix: PREFIX, type: decoded.type, payload: decoded.payload }).address;
  }
  throw new Error('The wallet shared an address Focus Garden cannot read.');
}

/** A CAIP-10 account from WalletConnect: `bch:bitcoincash:bitcoincash:qq…`, or `bch:bitcoincash:qq…`. */
export function addressFromAccount(account: string): string | null {
  const parts = account.split(':');
  if (parts[0] !== 'bch' || parts.length < 3) return null;
  const rest = parts.slice(2).join(':');
  try { return networkAddress(rest); } catch { return null; }
}
