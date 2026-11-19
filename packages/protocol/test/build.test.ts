import { describe, expect, test } from 'bun:test';
import { binToHex, createVirtualMachineBch2026, encodeLockingBytecodeP2pkh, encodeTransaction, hash160, hexToBin, lockingBytecodeToCashAddress, secp256k1, type Output } from '@bitauth/libauth';
import { buildRewardTransaction, forestContract, directoryContract, addressOf } from '../src/build';
import type { ChainCoin } from '../src/chain';
import { readGarden } from '../src/garden';
import { mergedCommitment, plantedCommitment, planterTag, UNIT_SECONDS } from '../src/forest';
import { transactionId } from '../src/index';
import { deploymentFromRecord, type Deployment } from '../src/network';
import { validateRewardTransaction } from '../src/policy';
import { signAppWalletInput } from '../src/signing';
import mainnet from '../../contracts/deployments/mainnet.json';

const deployment: Deployment = deploymentFromRecord(mainnet);
const key = new Uint8Array(32).fill(7);
const appBytecode = binToHex(encodeLockingBytecodeP2pkh(hash160(secp256k1.derivePublicKeyCompressed(key) as Uint8Array)));
const app = addressOf(appBytecode, deployment);
const ownerBytecode = `76a914${'ab'.repeat(20)}88ac`;
const owner = addressOf(ownerBytecode, deployment);
const NOW = 1_800_000_000;

/** A fake chain: every coin is a real output of a raw transaction whose id matches. */
function fakeChain() {
  const raws = new Map<string, string>();
  const coins = new Map<string, ChainCoin[]>();
  let nonce = 0;
  function fund(lockingBytecode: string, satoshis: bigint, token?: ChainCoin['token'], height = 100) {
    nonce += 1;
    const output: Output = { lockingBytecode: hexToBin(lockingBytecode), valueSatoshis: satoshis, ...(token ? { token: { category: hexToBin(token.category), amount: token.amount, ...(token.nft ? { nft: { capability: token.nft.capability, commitment: hexToBin(token.nft.commitment) } } : {}) } } : {}) };
    const raw = binToHex(encodeTransaction({ version: 2, locktime: 0, inputs: [{ outpointTransactionHash: new Uint8Array(32).fill(nonce), outpointIndex: 0, sequenceNumber: 0xffffffff, unlockingBytecode: new Uint8Array() }], outputs: [output] }));
    const txid = transactionId(raw);
    raws.set(txid, raw);
    const coin: ChainCoin = { txid, vout: 0, satoshis, height, ...(token ? { token } : {}) };
    coins.set(lockingBytecode, [...(coins.get(lockingBytecode) ?? []), coin]);
    return coin;
  }
  return {
    fund,
    tip: 1000,
    async listUnspent(lockingBytecode: string) { return coins.get(lockingBytecode) ?? []; },
    async rawTransaction(txid: string) { return raws.get(txid)!; },
    async tipHeight() { return this.tip; },
    // One minute per block, so the median time past of block h is h * 60.
    async medianTimePast(height: number) { return 1_700_000_000 + height * 60; },
  };
}

function signAndVerify(prepared: Awaited<ReturnType<typeof buildRewardTransaction>>['prepared'], intent: Parameters<typeof validateRewardTransaction>[1], rewardBytecode?: string) {
  const resolved = validateRewardTransaction(prepared, intent, {
    category: deployment.forest.category, contractBytecode: deployment.forest.lockingBytecode,
    directoryCategory: deployment.directory!.category, directoryBytecode: deployment.directory!.lockingBytecode,
    internalBytecode: appBytecode, rewardBytecode, nowSeconds: NOW, requestedAtSeconds: NOW,
  });
  const inputIndex = resolved.transaction.inputs.length - 1;
  const context = { ...resolved, inputIndex };
  context.transaction.inputs[inputIndex]!.unlockingBytecode = signAppWalletInput(key, context);
  return createVirtualMachineBch2026().verify(context);
}

describe('on-device transactions', () => {
  test('the contracts in this build match the mainnet deployment', () => {
    expect(() => forestContract(deployment)).not.toThrow();
    expect(() => directoryContract(deployment)).not.toThrow();
  });

  test('plant: built from the chain, passes the policy and the VM', async () => {
    const chain = fakeChain();
    chain.fund(deployment.forest.lockingBytecode, 1000n, { category: deployment.forest.category, amount: 0n, nft: { capability: 'minting', commitment: '' } });
    chain.fund(appBytecode, 20_000n);
    const intent = { action: 'plant' as const, rewardAddress: owner, units: 3, tier: 2, species: 1 };
    const built = await buildRewardTransaction({ intent, wallet: app, deployment, chain, nowSeconds: NOW });
    expect(built.commitment).toBe(plantedCommitment(ownerBytecode, appBytecode, NOW, 3, 2, 1));
    expect(signAndVerify(built.prepared, intent, ownerBytecode)).toBe(true);
  });

  test('plant: refuses without a big enough app-wallet coin', async () => {
    const chain = fakeChain();
    chain.fund(deployment.forest.lockingBytecode, 1000n, { category: deployment.forest.category, amount: 0n, nft: { capability: 'minting', commitment: '' } });
    chain.fund(appBytecode, 5000n);
    await expect(buildRewardTransaction({ intent: { action: 'plant', rewardAddress: owner, units: 1, tier: 1, species: 1 }, wallet: app, deployment, chain, nowSeconds: NOW })).rejects.toThrow(/at least 8,000 sats/);
  });

  test('plant: refuses an address on the other network', async () => {
    const chain = fakeChain();
    chain.fund(appBytecode, 20_000n);
    const chipnet = lockingBytecodeToCashAddress({ bytecode: hexToBin(ownerBytecode), prefix: 'bchtest' });
    if (typeof chipnet === 'string') throw new Error(chipnet);
    await expect(buildRewardTransaction({ intent: { action: 'plant', rewardAddress: chipnet.address, units: 1, tier: 1, species: 1 }, wallet: app, deployment, chain, nowSeconds: NOW })).rejects.toThrow(/bitcoincash:/);
  });

  test('claim and merge: matured trees pass the policy and the VM', async () => {
    const chain = fakeChain();
    const category = deployment.forest.category;
    const sprouts = [0, 1, 2].map((offset) => plantedCommitment(ownerBytecode, appBytecode, NOW - 10_000 + offset, 1, 1, 2));
    for (const commitment of sprouts) chain.fund(deployment.forest.lockingBytecode, 1000n, { category, amount: 0n, nft: { capability: 'mutable', commitment } }, 10);
    chain.fund(appBytecode, 10_000n);
    const claim = { action: 'claim' as const, commitment: sprouts[0]! };
    const claimed = await buildRewardTransaction({ intent: claim, wallet: app, deployment, chain, nowSeconds: NOW });
    expect(signAndVerify(claimed.prepared, claim, ownerBytecode)).toBe(true);
    const merge = { action: 'merge' as const, commitments: sprouts };
    const merged = await buildRewardTransaction({ intent: merge, wallet: app, deployment, chain, nowSeconds: NOW });
    expect(merged.commitment).toBe(mergedCommitment(sprouts));
    expect(signAndVerify(merged.prepared, merge, ownerBytecode)).toBe(true);
  });

  test('register and tip pass the policy and the VM', async () => {
    const chain = fakeChain();
    chain.fund(deployment.directory!.lockingBytecode, 1000n, { category: deployment.directory!.category, amount: 0n, nft: { capability: 'minting', commitment: '' } });
    chain.fund(appBytecode, 10_000n);
    chain.fund(appBytecode, 4_000n);
    const register = { action: 'register' as const, name: 'Salem', about: 'Focus first.' };
    const built = await buildRewardTransaction({ intent: register, wallet: app, deployment, chain, nowSeconds: NOW });
    expect(signAndVerify(built.prepared, register)).toBe(true);
    const tip = { action: 'tip' as const, profile: 'x', recipient: owner, amount: 1000 };
    const tipped = await buildRewardTransaction({ intent: tip, wallet: app, deployment, chain, nowSeconds: NOW, exclude: new Set(built.spends) });
    expect(signAndVerify(tipped.prepared, tip, ownerBytecode)).toBe(true);
  });
});

describe('garden from the chain', () => {
  test('locked, claimable, confirming and claimed trees of this app wallet only', async () => {
    const chain = fakeChain();
    const category = deployment.forest.category;
    const mutable = (commitment: string) => ({ category, amount: 0n, nft: { capability: 'mutable' as const, commitment } });
    const old = plantedCommitment(ownerBytecode, appBytecode, NOW - 9000, 1, 1, 1);
    const growing = plantedCommitment(ownerBytecode, appBytecode, NOW - 60, 6, 3, 1);
    const fresh = plantedCommitment(ownerBytecode, appBytecode, NOW, 1, 1, 3);
    const someoneElse = plantedCommitment(ownerBytecode, `76a914${'cd'.repeat(20)}88ac`, NOW, 1, 1, 1);
    const released = plantedCommitment(ownerBytecode, appBytecode, NOW - 20_000, 3, 2, 4);
    chain.fund(deployment.forest.lockingBytecode, 1000n, mutable(old), 900);
    chain.fund(deployment.forest.lockingBytecode, 1000n, mutable(growing), 999);
    chain.fund(deployment.forest.lockingBytecode, 1000n, mutable(fresh), 0);
    chain.fund(deployment.forest.lockingBytecode, 1000n, mutable(someoneElse), 900);
    chain.fund(ownerBytecode, 1000n, { category, amount: 0n, nft: { capability: 'none', commitment: released } }, 500);
    chain.fund(appBytecode, 12_345n);
    const garden = await readGarden({ chain, deployment, appLockingBytecode: appBytecode, ownerLockingBytecodes: [ownerBytecode], nowMs: NOW * 1000 });
    const state = Object.fromEntries(garden.sessions.map((entry) => [entry.commitment, entry.state]));
    expect(state).toEqual({ [old]: 'claimable', [growing]: 'locked', [fresh]: 'confirming', [released]: 'claimed' });
    expect(garden.balanceSatoshis).toBe(12_345);
    expect(garden.network).toBe('mainnet');
    const lock = garden.sessions.find((entry) => entry.commitment === growing)!;
    expect(lock.duration).toBe(6 * UNIT_SECONDS);
    expect(lock.releaseAt).toBeGreaterThan(NOW * 1000);
    expect(planterTag(appBytecode)).toHaveLength(24);
  });
});
