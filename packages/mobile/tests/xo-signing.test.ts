import { expect, test } from 'bun:test';
import { Crypto } from '@xo-cash/crypto';
import { binToHex, createVirtualMachineBch2026, encodeLockingBytecodeP2pkh, hash160, sha256, utf8ToBin } from '@bitauth/libauth';

/** A self-contained one-input transaction spending `script`; `nonce` changes the outpoint. */
function ownershipContext(nonce: string, script: Uint8Array) {
  return {
    inputIndex: 0,
    sourceOutputs: [{ lockingBytecode: script, valueSatoshis: 1000n }],
    transaction: { version: 2, locktime: 0,
      inputs: [{ outpointTransactionHash: sha256.hash(utf8ToBin(nonce)), outpointIndex: 0, sequenceNumber: 0xffffffff, unlockingBytecode: new Uint8Array() }],
      outputs: [{ lockingBytecode: script, valueSatoshis: 1000n }],
    },
  };
}
import { signXoRewardInput } from '../src/features/wallet/signing';

test('XO signs a complete local ownership transaction without exposing its HD secret', () => {
  const crypto = new Crypto(new Uint8Array(64).fill(1), { network: 'testnet' });
  const reference = { templateIdentifier: 'ab'.repeat(32), derivationIndex: 0 };
  const script = encodeLockingBytecodeP2pkh(hash160(crypto.derivePublicKey(reference)));
  const context = ownershipContext('unique-test-nonce', script);
  context.transaction.inputs[0].unlockingBytecode = signXoRewardInput(crypto, reference, context);
  expect(createVirtualMachineBch2026().verify(context)).toBe(true);
  const other = ownershipContext('another-test-nonce', script);
  other.transaction.inputs[0].unlockingBytecode = context.transaction.inputs[0].unlockingBytecode;
  expect(createVirtualMachineBch2026().verify(other)).not.toBe(true);
  expect(binToHex(context.transaction.inputs[0].unlockingBytecode).length).toBeGreaterThan(100);
  expect(() => signXoRewardInput(crypto, { ...reference, derivationIndex: 1 }, context)).toThrow();
});
