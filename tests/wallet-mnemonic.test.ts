import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recoveryPhraseSchema, WalletInitializationError } from '../src/features/wallet/mnemonic.ts';
import { restoreStoredWallet } from '../src/features/wallet/restore.ts';

const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
test('normalizes a valid phrase without changing its identity', () => {
  assert.equal(recoveryPhraseSchema.parse(`  ${phrase.toUpperCase().replaceAll(' ', ' \n ')}  `), phrase);
});
test('rejects incomplete phrases and invalid checksums', () => {
  assert.equal(recoveryPhraseSchema.safeParse('abandon abandon').success, false);
  assert.equal(recoveryPhraseSchema.safeParse('abandon '.repeat(12)).success, false);
  assert.equal(recoveryPhraseSchema.safeParse('').success, false);
});

test('restoration never replaces an existing wallet', async () => {
  const vault = { value: phrase, writes: 0 };
  await assert.rejects(() => restoreStoredWallet(phrase, {
    read: async () => vault.value,
    save: async () => { vault.writes += 1; },
  }), /already exists/);
  assert.equal(vault.value, phrase);
  assert.equal(vault.writes, 0);
});
test('fresh restoration saves only a validated normalized phrase', async () => {
  const vault = { value: '', writes: 0 };
  await restoreStoredWallet(`  ${phrase.toUpperCase()}  `, {
    read: async () => null,
    save: async (value) => { vault.value = value; vault.writes += 1; },
  });
  assert.equal(vault.value, phrase);
  assert.equal(vault.writes, 1);
  await assert.rejects(() => restoreStoredWallet('not a recovery phrase', {
    read: async () => null,
    save: async () => { assert.fail('Invalid phrase must not reach secure storage'); },
  }));
});
test('storage errors preserve restoration failure instead of reporting success', async () => {
  await assert.rejects(() => restoreStoredWallet(phrase, {
    read: async () => null,
    save: async () => { throw new WalletInitializationError({ message: 'Secure storage unavailable' }); },
  }), /storage unavailable/);
});
