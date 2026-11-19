import { expect, test } from 'bun:test';
import { addressFromAccount, chipnetAddress } from '../src/features/wallet-link/address';
import { addressFromPublicKey, parseRewardAddress } from '../src/wallet/address';

// The secp256k1 generator point: any fixed public key works for address round trips.
const G = Uint8Array.from(Buffer.from('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', 'hex'));
const mainnet = addressFromPublicKey(G, 'bitcoincash');
const chipnet = addressFromPublicKey(G, 'bchtest');

test('a mainnet address from a linked wallet maps to the Chipnet address of the same key', () => {
  expect(chipnetAddress(mainnet)).toBe(chipnet);
  expect(chipnetAddress(mainnet.toUpperCase())).toBe(chipnet);
  expect(chipnetAddress(mainnet.split(':')[1])).toBe(chipnet);
  expect(chipnetAddress(chipnet)).toBe(chipnet);
  expect(parseRewardAddress(chipnetAddress(mainnet)).address).toBe(chipnet);
});

test('WalletConnect accounts are read with or without a repeated prefix', () => {
  expect(addressFromAccount(`bch:bchtest:${chipnet}`)).toBe(chipnet);
  expect(addressFromAccount(`bch:bitcoincash:${mainnet}`)).toBe(chipnet);
  expect(addressFromAccount(`bch:bchtest:${chipnet.split(':')[1]}`)).toBe(chipnet);
  expect(addressFromAccount('eip155:1:0xabc')).toBeNull();
  expect(addressFromAccount('bch:bchtest:not-an-address')).toBeNull();
});

test('Mainnet wallet linking refuses a Chipnet chain or address', () => {
  expect(addressFromAccount(`bch:bitcoincash:${mainnet}`, 'mainnet')).toBe(mainnet);
  expect(addressFromAccount(`bch:bitcoincash:${mainnet.split(':')[1]}`, 'mainnet')).toBe(mainnet);
  expect(addressFromAccount(`bch:bchtest:${mainnet}`, 'mainnet')).toBeNull();
  expect(addressFromAccount(`bch:bitcoincash:${chipnet}`, 'mainnet')).toBeNull();
});

test('script and malformed addresses are refused', () => {
  // A P2SH address (type bit set) cannot receive reward NFTs in this flow.
  expect(() => chipnetAddress('bitcoincash:pqq3728yw0y47sqn6l2na30mcw6zm78dzq5ucqzc37')).toThrow();
  expect(() => chipnetAddress('bchtest:qqqqqqqq')).toThrow();
});
