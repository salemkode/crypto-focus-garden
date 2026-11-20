import { expect, test } from 'bun:test';
import { addressFromAccount, networkAddress } from '../src/features/wallet-link/address';
import { addressFromPublicKey, parseRewardAddress } from '../src/wallet/address';

// The secp256k1 generator point: any fixed public key works for address round trips.
const G = Uint8Array.from(Buffer.from('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', 'hex'));
const mainnet = addressFromPublicKey(G, 'bitcoincash');
const chipnet = addressFromPublicKey(G, 'bchtest');

test('an address from a linked wallet maps to the same key on this build\'s network (mainnet)', () => {
  expect(networkAddress(chipnet)).toBe(mainnet);
  expect(networkAddress(chipnet.toUpperCase())).toBe(mainnet);
  expect(networkAddress(mainnet.split(':')[1])).toBe(mainnet);
  expect(networkAddress(mainnet)).toBe(mainnet);
  expect(parseRewardAddress(networkAddress(chipnet)).address).toBe(mainnet);
});

test('WalletConnect accounts are read with or without a repeated prefix', () => {
  expect(addressFromAccount(`bch:bitcoincash:${mainnet}`)).toBe(mainnet);
  expect(addressFromAccount(`bch:bchtest:${chipnet}`)).toBe(mainnet);
  expect(addressFromAccount(`bch:bitcoincash:${mainnet.split(':')[1]}`)).toBe(mainnet);
  expect(addressFromAccount('eip155:1:0xabc')).toBeNull();
  expect(addressFromAccount('bch:bchtest:not-an-address')).toBeNull();
});

test('script and malformed addresses are refused', () => {
  // A P2SH address (type bit set) cannot receive reward NFTs in this flow.
  expect(() => networkAddress('bitcoincash:pqq3728yw0y47sqn6l2na30mcw6zm78dzq5ucqzc37')).toThrow();
  expect(() => networkAddress('bchtest:qqqqqqqq')).toThrow();
});
