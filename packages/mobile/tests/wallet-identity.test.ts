import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertSuccess, binToHex, privateKeyToP2pkhCashAddress, sha256, utf8ToBin } from '@bitauth/libauth';
import { readStoredWalletIdentity, walletAddressCacheKey } from '../src/features/wallet/identity.ts';

const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const key = sha256.hash(utf8ToBin('public identity fixture, never funded'));
const address = assertSuccess(privateKeyToP2pkhCashAddress({ privateKey: key, prefix: 'bchtest' })).address;
test('restores a saved chipnet identity without engine or network initialization', () => {
  const account = readStoredWalletIdentity(phrase, (cacheKey) => { assert.equal(cacheKey, walletAddressCacheKey(phrase)); return address; });
  assert.equal(account?.address, address);
  assert.match(binToHex(account!.lockingBytecode), /^76a914[0-9a-f]{40}88ac$/);
});
test('an absent vault or changed phrase cannot adopt another cached address', () => {
  assert.equal(readStoredWalletIdentity(null, () => assert.fail('No vault must not read an account cache')), null);
  assert.equal(readStoredWalletIdentity(phrase, () => null), null);
  const data = new Map([[walletAddressCacheKey(phrase), address]]);
  assert.equal(readStoredWalletIdentity('legal winner thank year wave sausage worth useful legal winner thank yellow', (cacheKey) => data.get(cacheKey) ?? null), null);
});
test('invalid recovery material, malformed addresses and mainnet addresses fail visibly', () => {
  assert.throws(() => readStoredWalletIdentity('not a recovery phrase', () => address));
  assert.throws(() => readStoredWalletIdentity(phrase, () => 'bchtest:invalid'));
  const mainnet = assertSuccess(privateKeyToP2pkhCashAddress({ privateKey: key })).address;
  assert.throws(() => readStoredWalletIdentity(phrase, () => mainnet), /invalid/);
});
test('an identical recovery phrase can only read the cache for its selected network', () => {
  const mainnet = assertSuccess(privateKeyToP2pkhCashAddress({ privateKey: key })).address;
  const data = new Map([[walletAddressCacheKey(phrase, 'chipnet'), address]]);
  const read = (cacheKey: string) => data.get(cacheKey) ?? null;
  assert.equal(readStoredWalletIdentity(phrase, read, 'mainnet'), null);
  data.set(walletAddressCacheKey(phrase, 'mainnet'), mainnet);
  assert.equal(readStoredWalletIdentity(phrase, read, 'mainnet')?.address, mainnet);
  assert.equal(readStoredWalletIdentity(phrase, read, 'chipnet')?.address, address);
});
