import { afterEach, expect, test } from 'bun:test';
import { binToHex, cashAddressToLockingBytecode, createVirtualMachineBch2026, encodeLockingBytecodeP2pkh, encodeTransaction, hash160, hexToBin, lockingBytecodeToCashAddress, encodePrivateKeyWif } from '@bitauth/libauth';
import { SignatureTemplate, type NetworkProvider, type Utxo } from 'cashscript';
import { decode, ownershipContext, preparedSchema, resolvePrepared, transactionId } from '@focus-garden/protocol';
import { checkMerge, parseTree, plantedCommitment } from '@focus-garden/protocol/forest';
import { validateRewardTransaction } from '@focus-garden/protocol/policy';
import { restoreOperationRecord } from '@focus-garden/protocol/recovery';
import { signAppWalletInput } from '@focus-garden/protocol/signing';
import { Ledger } from '../src/ledger';
import { createGardenService } from '../src/api';
import { contractFor, directoryFor, lockingBytecode, prepareReward } from '../src/transactions';

const category = binToHex(Uint8Array.from({ length: 32 }, (_, index) => index));
const directoryCategory = binToHex(Uint8Array.from({ length: 32 }, (_, index) => 200 - index));
const key = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const signer = new SignatureTemplate(key);
const external = new SignatureTemplate(key.map((value) => value + 1));
const treasuryKey = key.map((value) => value + 2);
function walletAddress(publicKey: Uint8Array, prefix: 'bchtest' | 'bitcoincash' = 'bchtest') {
  const result = lockingBytecodeToCashAddress({ bytecode: encodeLockingBytecodeP2pkh(hash160(publicKey)), prefix });
  if (typeof result === 'string') throw new Error(result);
  return result.address;
}
const wallet = walletAddress(signer.getPublicKey());
const rewardAddress = walletAddress(external.getPublicKey());
const databases: Ledger[] = [];
afterEach(() => databases.splice(0).forEach((ledger) => ledger.db.close()));
class TestNetwork implements NetworkProvider {
  constructor(readonly network: 'chipnet' | 'mainnet' = 'chipnet') {}
  transactions = new Map<string, string>();
  coins = new Map<string, Utxo[]>();
  broadcasts = 0;
  ambiguous = false;
  acceptedButLost = false;
  async getUtxos(address: string) { return this.coins.get(address) ?? []; }
  async getBlockHeight() { return 100; }
  async getRawTransaction(txid: string) {
    const raw = this.transactions.get(txid);
    if (!raw || this.ambiguous) throw new Error('Network timeout');
    return raw;
  }
  seed(address: string, satoshis: bigint, token?: Utxo['token']) {
    const decoded = cashAddressToLockingBytecode(address);
    if (typeof decoded === 'string') throw new Error(decoded);
    const raw = binToHex(encodeTransaction({ version: 2, locktime: this.transactions.size,
      inputs: [{ outpointTransactionHash: new Uint8Array(32), outpointIndex: 0xffffffff, sequenceNumber: 0xffffffff, unlockingBytecode: new Uint8Array([1, 1]) }],
      outputs: [{ lockingBytecode: decoded.bytecode, valueSatoshis: satoshis, ...(token ? { token: { category: hexToBin(token.category), amount: token.amount, ...(token.nft ? { nft: { capability: token.nft.capability, commitment: hexToBin(token.nft.commitment) } } : {}) } } : {}) }],
    }));
    const txid = transactionId(raw);
    this.transactions.set(txid, raw);
    this.coins.set(address, [...(this.coins.get(address) ?? []), { txid, vout: 0, satoshis, ...(token ? { token } : {}) }]);
  }
  async sendRawTransaction(raw: string) {
    this.broadcasts++;
    if (this.ambiguous) throw new Error('Timeout before acknowledgment');
    const tx = decode(raw);
    const sourceOutputs = tx.inputs.map((input) => decode(this.transactions.get(binToHex(input.outpointTransactionHash))!).outputs[input.outpointIndex]);
    const valid = createVirtualMachineBch2026().verify({ transaction: tx, sourceOutputs });
    if (valid !== true) throw new Error(`Invalid test transaction: ${valid}`);
    const txid = transactionId(raw);
    this.transactions.set(txid, raw);
    this.coins.forEach((coins, address) => this.coins.set(address, coins.filter((coin) => !tx.inputs.some((input) => coin.txid === binToHex(input.outpointTransactionHash) && coin.vout === input.outpointIndex))));
    tx.outputs.forEach((output, vout) => {
      const destination = lockingBytecodeToCashAddress({ bytecode: output.lockingBytecode, prefix: this.network === 'mainnet' ? 'bitcoincash' : 'bchtest' });
      if (typeof destination === 'string') return;
      const coin = { txid, vout, satoshis: output.valueSatoshis, ...(output.token ? { token: { category: binToHex(output.token.category), amount: output.token.amount, ...(output.token.nft ? { nft: { capability: output.token.nft.capability, commitment: binToHex(output.token.nft.commitment) } } : {}) } } : {}) };
      this.coins.set(destination.address, [...(this.coins.get(destination.address) ?? []), coin]);
    });
    if (this.acceptedButLost) throw new Error('Accepted but response lost');
    return txid;
  }
}
function fixture() {
  const ledger = new Ledger(':memory:'); databases.push(ledger);
  const token = ledger.createAccount('account-1');
  const provider = new TestNetwork();
  const contract = contractFor(provider, category);
  const timing = { state: 'locked' as 'locked' | 'claimable', confirmations: 6, canonical: true, held: true };
  const fetch = createGardenService({ ledger, minimumConfirmations: 6, writesEnabled: true, chainIdentity: { genesisHash: '22'.repeat(32), checkpointHeight: 1, checkpointHash: '11'.repeat(32) }, provider, category, directoryCategory, budget: 100000, treasuryKey: encodePrivateKeyWif(treasuryKey, 'testnet'), observe: async (txid) => ({ state: provider.transactions.has(txid) && !provider.ambiguous && timing.canonical ? timing.confirmations >= 6 ? 'confirmed' : 'confirming' : 'missing', confirmations: provider.transactions.has(txid) && !provider.ambiguous && timing.canonical ? timing.confirmations : 0, blockHash: provider.transactions.has(txid) ? 'ab'.repeat(32) : null, blockTime: Date.now() }), rewardHeld: async () => timing.held, maturity: async () => timing.state });
  async function rpc(body: object, access = token) {
    const response = await fetch(new Request('https://garden.test/v1/rpc', { method: 'POST', headers: { authorization: `Bearer ${access}` }, body: JSON.stringify(body) }));
    return { status: response.status, data: await response.json() };
  }
  async function prove() {
    const challenge = (await rpc({ method: 'challenge', wallet })).data;
    const context = ownershipContext('account-1', challenge.nonce, lockingBytecode(wallet));
    return rpc({ method: 'prove', wallet, nonce: challenge.nonce, unlockingBytecode: binToHex(signAppWalletInput(key, context)) });
  }
  return { ledger, provider, contract, timing, rpc, prove, token };
}
function signPrepared(prepared: Parameters<typeof resolvePrepared>[0], network: 'chipnet' | 'mainnet' = 'chipnet') {
  const resolved = resolvePrepared(prepared, network);
  const inputIndex = resolved.transaction.inputs.length - 1;
  const context = { ...resolved, inputIndex };
  context.transaction.inputs[inputIndex].unlockingBytecode = signAppWalletInput(key, context);
  return binToHex(encodeTransaction(context.transaction));
}
test('Mainnet plants and claims a self-funded tree while rejecting Chipnet data and sponsored credit', async () => {
  const ledger = new Ledger(':memory:'); databases.push(ledger);
  const provider = new TestNetwork('mainnet');
  const chainIdentity = { genesisHash: '22'.repeat(32), checkpointHeight: 1, checkpointHash: '11'.repeat(32) };
  const timing = { mature: false };
  const config = { ledger, minimumConfirmations: 6, writesEnabled: true, chainIdentity, provider, category, budget: 0,
    observe: async (txid: string) => ({ state: provider.transactions.has(txid) ? 'confirmed' as const : 'missing' as const, confirmations: 6, blockHash: '11'.repeat(32), blockTime: Date.now() }),
    rewardHeld: async () => true, maturity: async () => timing.mature ? 'claimable' as const : 'locked' as const };
  const oldLedger = new Ledger(':memory:'); databases.push(oldLedger);
  oldLedger.createAccount('legacy-account');
  expect(() => createGardenService({ ...config, ledger: oldLedger })).toThrow(/separate ledger/i);
  const service = createGardenService(config);
  const token = ledger.createAccount('main-account');
  expect(() => createGardenService({ ...config, treasuryKey: encodePrivateKeyWif(treasuryKey, 'testnet') })).toThrow();
  expect(() => createGardenService({ ...config, provider: new TestNetwork('chipnet') })).toThrow();
  const mainWallet = walletAddress(signer.getPublicKey(), 'bitcoincash');
  const mainReward = walletAddress(external.getPublicKey(), 'bitcoincash');
  async function rpc(body: object, handler = service, access = token) {
    const response = await handler(new Request('https://garden.test/v1/rpc', { method: 'POST', headers: { authorization: `Bearer ${access}` }, body: JSON.stringify(body) }));
    return { status: response.status, data: await response.json() };
  }
  expect((await rpc({ method: 'whoami' })).data.network).toBe('mainnet');
  expect((await rpc({ method: 'challenge', wallet })).status).not.toBe(200);
  const challenge = (await rpc({ method: 'challenge', wallet: mainWallet })).data;
  const script = lockingBytecode(mainWallet, 'mainnet');
  const chipnetProof = signAppWalletInput(key, ownershipContext('main-account', challenge.nonce, script));
  const proof = { method: 'prove', wallet: mainWallet, nonce: challenge.nonce };
  expect((await rpc({ ...proof, unlockingBytecode: binToHex(chipnetProof) })).status).toBe(409);
  const mainProof = signAppWalletInput(key, ownershipContext('main-account', challenge.nonce, script, 'mainnet'));
  expect((await rpc({ ...proof, unlockingBytecode: binToHex(mainProof) })).status).toBe(200);
  const credit = { method: 'credit', action: 'plant', wallet: mainWallet, key: crypto.randomUUID() };
  expect((await rpc(credit)).status).toBe(409);
  provider.seed(mainWallet, 12000n);
  const contract = contractFor(provider, category);
  provider.seed(contract.address, 1000n, { category, amount: 0n, nft: { capability: 'minting', commitment: '' } });
  expect((await rpc(credit)).data).toMatchObject({ state: 'funded' });
  const plant = { method: 'prepare', wallet: mainWallet, key: crypto.randomUUID(), intent: { action: 'plant' as const, rewardAddress: mainReward, units: 3, tier: 2, species: 1 } };
  const readOnlyService = createGardenService({ ...config, writesEnabled: false });
  expect((await rpc(plant, readOnlyService)).status).toBe(409);
  expect(ledger.get('main-account', plant.key)).toBeNull();
  ledger.setControl('broadcasts.paused', true);
  expect((await rpc(plant)).status).toBe(409);
  expect(ledger.get('main-account', plant.key)).toBeNull();
  ledger.setControl('broadcasts.paused', false);
  expect((await rpc({ ...plant, intent: { ...plant.intent, rewardAddress } })).status).not.toBe(200);
  const abandoned = JSON.parse((await rpc(plant)).data.payload);
  const abandonedRaw = signPrepared(abandoned, 'mainnet');
  const cancel = { method: 'cancelPreparation', id: abandoned.id };
  expect((await rpc(cancel, service, ledger.createAccount('other-account'))).status).toBe(409);
  expect((await rpc(cancel, readOnlyService)).data.state).toBe('cancelled');
  expect((await rpc(cancel)).data.state).toBe('cancelled');
  expect((await rpc(plant)).data.state).toBe('cancelled');
  expect((await rpc({ method: 'submit', id: abandoned.id, raw: abandonedRaw })).status).toBe(409);
  expect(provider.broadcasts).toBe(0);
  const prepared = JSON.parse((await rpc({ ...plant, key: crypto.randomUUID() })).data.payload);
  expect(prepared.id).not.toBe(abandoned.id);
  expect(prepared.network).toBe('mainnet');
  expect(() => resolvePrepared(prepared)).toThrow();
  const contractAddress = cashAddressToLockingBytecode(contract.address);
  if (typeof contractAddress === 'string') throw new Error(contractAddress);
  const proofPolicy = { network: 'mainnet' as const, category, contractBytecode: binToHex(contractAddress.bytecode),
    internalBytecode: binToHex(script), rewardBytecode: binToHex(lockingBytecode(mainReward, 'mainnet')), nowSeconds: Math.floor(Date.now() / 1000) };
  const planted = validateRewardTransaction(prepared, plant.intent, proofPolicy);
  expect((await rpc({ method: 'submit', id: prepared.id, raw: signPrepared(prepared, 'mainnet') })).data.state).toBe('seen');
  expect((await rpc({ method: 'cancelPreparation', id: prepared.id })).status).toBe(409);
  const claim = { ...plant, key: crypto.randomUUID(), intent: { action: 'claim' as const, commitment: planted.commitment } };
  expect((await rpc(claim)).status).toBe(409);
  timing.mature = true;
  const abandonedClaim = JSON.parse((await rpc(claim)).data.payload);
  expect((await rpc({ method: 'cancelPreparation', id: abandonedClaim.id })).data.state).toBe('cancelled');
  expect(ledger.db.query('SELECT claim FROM sessions WHERE commitment=?').get(planted.commitment)).toEqual({ claim: null });
  const release = JSON.parse((await rpc({ ...claim, key: crypto.randomUUID() })).data.payload);
  expect(release.id).not.toBe(abandonedClaim.id);
  validateRewardTransaction(release, claim.intent, proofPolicy);
  const releaseRaw = signPrepared(release, 'mainnet');
  provider.ambiguous = true;
  expect((await rpc({ method: 'submit', id: release.id, raw: releaseRaw })).data.state).toBe('pending');
  expect((await rpc({ method: 'cancelPreparation', id: release.id })).status).toBe(409);
  expect(ledger.operation('main-account', release.id).raw).toBe(releaseRaw);
  provider.ambiguous = false;
  expect((await rpc({ method: 'rebroadcast', id: release.id })).data.state).toBe('seen');
  expect((await provider.getUtxos(mainReward)).some((entry) => entry.token?.nft?.capability === 'none' && entry.token.nft.commitment === planted.commitment)).toBe(true);
  expect(provider.broadcasts).toBe(3);
});
test('rejects unauthenticated credit, unproved wallets and replayed ownership proofs', async () => {
  const f = fixture();
  expect((await f.rpc({ method: 'challenge', wallet }, 'invalid')).status).toBe(401);
  expect((await f.rpc({ method: 'credit', wallet, key: crypto.randomUUID(), action: 'plant' })).status).toBe(409);
  const challenge = (await f.rpc({ method: 'challenge', wallet })).data;
  const context = ownershipContext('account-1', challenge.nonce, lockingBytecode(wallet));
  const proof = { method: 'prove', wallet, nonce: challenge.nonce, unlockingBytecode: binToHex(signAppWalletInput(key, context)) };
  expect((await f.rpc(proof)).status).toBe(200);
  expect((await f.rpc(proof)).status).toBe(409);
});
test('funds, plants, prevents early claims, releases only to the fixed recipient and recovers records', async () => {
  const f = fixture();
  expect((await f.prove()).status).toBe(200);
  f.provider.seed(walletAddress(new SignatureTemplate(treasuryKey).getPublicKey()), 100000n);
  const credit = await f.rpc({ method: 'credit', wallet, key: crypto.randomUUID(), action: 'plant' });
  expect(credit.data.state).toBe('seen');
  f.provider.seed(f.contract.address, 1000n, { category, amount: 0n, nft: { capability: 'minting', commitment: '' } });
  const intent = { action: 'plant' as const, rewardAddress, units: 3, tier: 2, species: 1 };
  const key = crypto.randomUUID();
  const response = await f.rpc({ method: 'prepare', wallet, key, intent });
  expect(response.status).toBe(200);
  expect(response.data.state).toBe('prepared');
  const prepared = preparedSchema.parse(JSON.parse(response.data.payload));
  const decodedContract = cashAddressToLockingBytecode(f.contract.address);
  if (typeof decodedContract === 'string') throw new Error(decodedContract);
  const policy = { category, contractBytecode: binToHex(decodedContract.bytecode), internalBytecode: binToHex(lockingBytecode(wallet)), rewardBytecode: binToHex(lockingBytecode(rewardAddress)), nowSeconds: Math.floor(Date.now() / 1000) };
  const validated = validateRewardTransaction(prepared, intent, policy);
  expect(validated.transaction.outputs[2].valueSatoshis).toBe(5000n);
  const restoredRows = (await f.rpc({ method: 'recover', wallet })).data.operations;
  const restored = restoreOperationRecord(restoredRows.find((entry: { id: string }) => entry.id === response.data.id), wallet);
  expect(restored?.intent?.action).toBe('plant');
  expect(restored?.id).toBe(response.data.id);
  const id = response.data.id;
  expect((await f.rpc({ method: 'prepare', wallet, key, intent })).data.id).toBe(id);
  const signed = signPrepared(prepared);
  expect((await f.rpc({ method: 'submit', id, raw: signed })).data).toMatchObject({ state: 'seen' });
  expect((await f.rpc({ method: 'submit', id, raw: signed })).data).toMatchObject({ state: 'seen' });
  expect(f.provider.broadcasts).toBe(2);
  expect((await f.rpc({ method: 'prepare', wallet, key: crypto.randomUUID(), intent: { action: 'claim', commitment: validated.commitment } })).status).toBe(409);
  expect((await f.rpc({ method: 'prepare', wallet, key: crypto.randomUUID(), intent })).status).toBe(409);
  f.timing.state = 'claimable';
  const claim = await f.rpc({ method: 'prepare', wallet, key: crypto.randomUUID(), intent: { action: 'claim', commitment: validated.commitment } });
  expect(claim.status).toBe(200);
  const claimPrepared = preparedSchema.parse(JSON.parse(claim.data.payload));
  validateRewardTransaction(claimPrepared, { action: 'claim', commitment: validated.commitment }, policy);
  const modified = resolvePrepared(claimPrepared).transaction;
  modified.outputs[0].lockingBytecode = lockingBytecode(wallet);
  expect(() => validateRewardTransaction({ ...claimPrepared, transaction: binToHex(encodeTransaction(modified)) }, { action: 'claim', commitment: validated.commitment }, policy)).toThrow();
  expect((await f.rpc({ method: 'submit', id: claim.data.id, raw: signPrepared(claimPrepared) })).data.state).toBe('seen');
  expect((await f.rpc({ method: 'garden', wallet })).data.sessions[0].state).toBe('claimed');
  expect((await f.rpc({ method: 'recover' })).data.operations.some((entry: { id: string }) => entry.id === id)).toBe(true);
  expect((await f.provider.getUtxos(rewardAddress)).some((coin) => coin.token?.nft?.capability === 'none' && coin.token.nft.commitment === validated.commitment && coin.satoshis === 1000n)).toBe(true);
});
test('ambiguous funding is durable and is never automatically broadcast again', async () => {
  const f = fixture(); await f.prove();
  f.provider.seed(walletAddress(new SignatureTemplate(treasuryKey).getPublicKey()), 100000n);
  f.provider.ambiguous = true;
  const key = crypto.randomUUID();
  const first = await f.rpc({ method: 'credit', wallet, key, action: 'plant' });
  expect(first.data.state).toBe('pending');
  expect((await f.rpc({ method: 'credit', wallet, key, action: 'plant' })).data.id).toBe(first.data.id);
  expect((await f.rpc({ method: 'reconcile', id: first.data.id })).data.state).toBe('pending');
  expect((await f.rpc({ method: 'credit', wallet, key: crypto.randomUUID(), action: 'plant' })).status).toBe(409);
  expect(f.provider.broadcasts).toBe(1);
});
test('bounds daily and global reservations including unresolved operations', () => {
  const f = fixture();
  const first = f.ledger.reserve({ account: 'account-1', key: 'key-1', wallet, kind: 'credit', intent: 'plant', amount: 8000, budget: 20000 });
  expect(() => f.ledger.reserve({ account: 'account-1', key: 'key-2', wallet, kind: 'credit', intent: 'plant', amount: 8000, budget: 20000 })).toThrow();
  f.ledger.markSeen(first.id);
  const second = f.ledger.reserve({ account: 'account-1', key: 'key-2', wallet, kind: 'credit', intent: 'plant', amount: 8000, budget: 20000 });
  f.ledger.markSeen(second.id);
  expect(() => f.ledger.reserve({ account: 'account-1', key: 'key-3', wallet, kind: 'credit', intent: 'plant', amount: 8000, budget: 100000 })).toThrow();
  expect(() => f.ledger.reserve({ account: 'account-2', key: 'key-1', wallet, kind: 'credit', intent: 'plant', amount: 8000, budget: 20000 })).toThrow();
});
test('unaccepted preparations release reservations without losing a future credit request', async () => {
  const f = fixture(); await f.prove();
  const response = await f.rpc({ method: 'prepare', wallet, key: crypto.randomUUID(), intent: { action: 'plant', rewardAddress, units: 3, tier: 2, species: 1 } });
  expect(response.data.recorded).toBe(false);
  expect((await f.rpc({ method: 'recover' })).data.operations.length).toBe(0);
});
test('accepted broadcast with lost response reconciles by txid without a replacement', async () => {
  const f = fixture(); await f.prove();
  f.provider.seed(walletAddress(new SignatureTemplate(treasuryKey).getPublicKey()), 100000n);
  f.provider.acceptedButLost = true;
  const response = await f.rpc({ method: 'credit', wallet, key: crypto.randomUUID(), action: 'plant' });
  expect(response.data.state).toBe('pending');
  expect((await f.rpc({ method: 'reconcile', id: response.data.id })).data.state).toBe('seen');
  expect(f.provider.broadcasts).toBe(1);
});
test('the signer rejects changed fees, destination, token, sequence, network, sources and version', async () => {
  const f = fixture(); await f.prove();
  f.provider.seed(wallet, 8000n);
  f.provider.seed(f.contract.address, 1000n, { category, amount: 0n, nft: { capability: 'minting', commitment: '' } });
  const intent = { action: 'plant' as const, rewardAddress, units: 3, tier: 2, species: 1 };
  const response = await f.rpc({ method: 'prepare', wallet, key: crypto.randomUUID(), intent });
  const prepared = preparedSchema.parse(JSON.parse(response.data.payload));
  const contract = cashAddressToLockingBytecode(f.contract.address);
  if (typeof contract === 'string') throw new Error(contract);
  const policy = { category, contractBytecode: binToHex(contract.bytecode), internalBytecode: binToHex(lockingBytecode(wallet)), rewardBytecode: binToHex(lockingBytecode(rewardAddress)), nowSeconds: Math.floor(Date.now() / 1000) };
  const mutations = [
    (tx: ReturnType<typeof decode>) => { tx.outputs[2].valueSatoshis -= 1n; },
    (tx: ReturnType<typeof decode>) => { tx.outputs[2].lockingBytecode = lockingBytecode(rewardAddress); },
    (tx: ReturnType<typeof decode>) => { tx.outputs[1].token!.category[0] ^= 1; },
    (tx: ReturnType<typeof decode>) => { tx.outputs[1].token!.nft!.commitment[2] ^= 1; },
    (tx: ReturnType<typeof decode>) => { tx.inputs[0].sequenceNumber = 1; },
    (tx: ReturnType<typeof decode>) => { tx.version = 1; },
    (tx: ReturnType<typeof decode>) => { tx.inputs[1].outpointTransactionHash[0] ^= 1; },
    (tx: ReturnType<typeof decode>) => { tx.outputs.push(tx.outputs[2]); },
  ];
  mutations.forEach((mutate) => {
    const tx = decode(prepared.transaction); mutate(tx);
    expect(() => validateRewardTransaction({ ...prepared, transaction: binToHex(encodeTransaction(tx)) }, intent, policy)).toThrow();
  });
  expect(preparedSchema.safeParse({ ...prepared, network: 'mainnet' }).success).toBe(false);
  const resolved = resolvePrepared(prepared);
  expect(() => signAppWalletInput(treasuryKey, { ...resolved, inputIndex: 1 })).toThrow();
});
test('mempool/confirming grants remain pending; a reorg regresses completion and blocks replacement credit', async () => {
  const f = fixture(); await f.prove();
  f.provider.seed(walletAddress(new SignatureTemplate(treasuryKey).getPublicKey()), 100000n);
  f.timing.confirmations = 1;
  const credit = await f.rpc({ method: 'credit', wallet, key: crypto.randomUUID(), action: 'plant' });
  expect(credit.data.state).toBe('confirming');
  expect((await f.rpc({ method: 'credit', wallet, key: crypto.randomUUID(), action: 'plant' })).status).toBe(409);
  f.timing.confirmations = 6;
  expect((await f.rpc({ method: 'reconcile', id: credit.data.id })).data.state).toBe('seen');
  f.timing.canonical = false;
  expect((await f.rpc({ method: 'reconcile', id: credit.data.id })).data.state).toBe('pending');
  expect((await f.rpc({ method: 'credit', wallet, key: crypto.randomUUID(), action: 'plant' })).status).toBe(409);
  expect(f.provider.broadcasts).toBe(1);
});
test('only explicit same-bytes rebroadcast can resume a missing signed grant', async () => {
  const f = fixture(); await f.prove();
  f.provider.seed(walletAddress(new SignatureTemplate(treasuryKey).getPublicKey()), 100000n);
  f.provider.ambiguous = true;
  const grant = await f.rpc({ method: 'credit', wallet, key: crypto.randomUUID(), action: 'plant' });
  expect(grant.data.state).toBe('pending');
  const original = f.ledger.operation('account-1', grant.data.id).raw;
  f.provider.ambiguous = false;
  expect((await f.rpc({ method: 'reconcile', id: grant.data.id })).data.state).toBe('pending');
  expect(f.provider.broadcasts).toBe(1);
  expect((await f.rpc({ method: 'rebroadcast', id: grant.data.id })).data.state).toBe('seen');
  expect(f.ledger.operation('account-1', grant.data.id).raw).toBe(original);
  expect(f.provider.broadcasts).toBe(2);
  expect((await f.rpc({ method: 'rebroadcast', id: grant.data.id })).status).toBe(409);
  expect(f.provider.broadcasts).toBe(2);
});


test('v5: a sprout needs 1 lock unit and a house 11; 3 matured sprouts merge into a tree; members register, rank and tip by name', async () => {
  const f = fixture(); await f.prove();
  for (let index = 0; index < 4; index += 1) f.provider.seed(wallet, 20000n);
  f.provider.seed(f.contract.address, 1000n, { category, amount: 0n, nft: { capability: 'minting', commitment: '' } });
  const directory = directoryFor(f.provider, directoryCategory);
  f.provider.seed(directory.address, 1000n, { category: directoryCategory, amount: 0n, nft: { capability: 'minting', commitment: '' } });
  const decodedContract = cashAddressToLockingBytecode(f.contract.address);
  const decodedDirectory = cashAddressToLockingBytecode(directory.address);
  if (typeof decodedContract === 'string' || typeof decodedDirectory === 'string') throw new Error('address');
  const policy = { category, contractBytecode: binToHex(decodedContract.bytecode), internalBytecode: binToHex(lockingBytecode(wallet)), rewardBytecode: binToHex(lockingBytecode(rewardAddress)), directoryCategory, directoryBytecode: binToHex(decodedDirectory.bytecode), nowSeconds: Math.floor(Date.now() / 1000) };
  // A house needs at least 11 lock units; the request is refused before anything is reserved.
  expect((await f.rpc({ method: 'prepare', wallet, key: crypto.randomUUID(), intent: { action: 'plant', rewardAddress, units: 6, tier: 4, species: 1 } })).status).toBe(409);

  const register = { action: 'register' as const, name: 'Salem', about: 'Deep work every morning.' };
  const registered = await f.rpc({ method: 'prepare', wallet, key: crypto.randomUUID(), intent: register });
  expect(registered.status).toBe(200);
  const registerPrepared = preparedSchema.parse(JSON.parse(registered.data.payload));
  validateRewardTransaction(registerPrepared, register, { ...policy, rewardBytecode: undefined });
  expect((await f.rpc({ method: 'submit', id: registered.data.id, raw: signPrepared(registerPrepared) })).data.state).toBe('seen');
  expect((await f.rpc({ method: 'profile', wallet })).data).toMatchObject({ state: 'public', name: 'Salem' });

  const sprouts: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    f.timing.state = 'claimable';
    const intent = { action: 'plant' as const, rewardAddress, units: 1, tier: 1, species: 2 };
    const planted = await f.rpc({ method: 'prepare', wallet, key: crypto.randomUUID(), intent });
    expect(planted.data.error ?? 'ok').toBe('ok');
    const prepared = preparedSchema.parse(JSON.parse(planted.data.payload));
    const validated = validateRewardTransaction(prepared, intent, policy);
    expect((await f.rpc({ method: 'submit', id: planted.data.id, raw: signPrepared(prepared) })).data.state).toBe('seen');
    // While this sprout grows, no other tree can be planted.
    f.timing.state = 'locked';
    expect((await f.rpc({ method: 'prepare', wallet, key: crypto.randomUUID(), intent })).status).toBe(409);
    sprouts.push(validated.commitment);
    f.timing.state = 'claimable';
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }
  expect(sprouts.map((commitment) => parseTree(commitment)?.tierKey)).toEqual(['sprout', 'sprout', 'sprout']);
  const board = (await f.rpc({ method: 'leaderboard', period: 'week' })).data;
  expect(board.entries).toEqual([expect.objectContaining({ rank: 1, name: 'Salem', points: 3, trees: 3, tipAddress: rewardAddress })]);

  const mergeIntent = { action: 'merge' as const, commitments: sprouts };
  expect((await f.rpc({ method: 'prepare', wallet, key: crypto.randomUUID(), intent: { action: 'merge', commitments: sprouts.slice(0, 2) } })).status).toBe(409);
  const merge = await f.rpc({ method: 'prepare', wallet, key: crypto.randomUUID(), intent: mergeIntent });
  expect(merge.status).toBe(200);
  const mergePrepared = preparedSchema.parse(JSON.parse(merge.data.payload));
  const mergeValidated = validateRewardTransaction(mergePrepared, mergeIntent, policy);
  expect(mergeValidated.commitment).toBe(checkMerge(sprouts)!.result);
  expect(parseTree(mergeValidated.commitment)).toMatchObject({ tierKey: 'tree', speciesKey: 'cherry', merged: true });
  expect((await f.rpc({ method: 'submit', id: merge.data.id, raw: signPrepared(mergePrepared) })).data.state).toBe('seen');
  expect(((await f.rpc({ method: 'garden', wallet })).data.sessions as { commitment: string }[]).map((entry) => entry.commitment)).toEqual([mergeValidated.commitment]);
  // Merging keeps verified focus: the score does not change.
  expect((await f.rpc({ method: 'leaderboard', period: 'all' })).data.entries[0].points).toBe(3);

  // A second member finds Salem on the leaderboard and tips by name, never typing an address.
  const fanKey = key.map((value) => value + 7);
  const fanWallet = walletAddress(new SignatureTemplate(fanKey).getPublicKey());
  const fanToken = f.ledger.createAccount('account-2');
  const challenge = (await f.rpc({ method: 'challenge', wallet: fanWallet }, fanToken)).data;
  const proofContext = ownershipContext('account-2', challenge.nonce, lockingBytecode(fanWallet));
  expect((await f.rpc({ method: 'prove', wallet: fanWallet, nonce: challenge.nonce, unlockingBytecode: binToHex(signAppWalletInput(fanKey, proofContext)) }, fanToken)).status).toBe(200);
  f.provider.seed(fanWallet, 20000n);
  const salem = board.entries[0];
  const tip = { action: 'tip' as const, profile: salem.id, recipient: salem.tipAddress, amount: 5000 };
  expect((await f.rpc({ method: 'prepare', wallet: fanWallet, key: crypto.randomUUID(), intent: { ...tip, recipient: fanWallet } }, fanToken)).status).toBe(409);
  const tipped = await f.rpc({ method: 'prepare', wallet: fanWallet, key: crypto.randomUUID(), intent: tip }, fanToken);
  expect(tipped.status).toBe(200);
  const tipPrepared = preparedSchema.parse(JSON.parse(tipped.data.payload));
  validateRewardTransaction(tipPrepared, tip, { ...policy, internalBytecode: binToHex(lockingBytecode(fanWallet)), rewardBytecode: binToHex(lockingBytecode(salem.tipAddress)) });
  const tipTx = resolvePrepared(tipPrepared);
  tipTx.transaction.inputs[0].unlockingBytecode = signAppWalletInput(fanKey, { ...tipTx, inputIndex: 0 });
  expect((await f.rpc({ method: 'submit', id: tipped.data.id, raw: binToHex(encodeTransaction(tipTx.transaction)) }, fanToken)).data.state).toBe('seen');
  expect((await f.provider.getUtxos(rewardAddress)).some((coin) => !coin.token && coin.satoshis === 5000n)).toBe(true);
});

test('service guards: same-second plantings stay distinct; foreign-planter claims and repeated merge results are refused', async () => {
  const f = fixture();
  const reserve = (id: string) => f.ledger.db.run("INSERT INTO operations VALUES(?,?,?,?,?,?,?,?,?,NULL,NULL,NULL)", [id, 'account-1', id, 'reward', '{}', wallet, 'today', 0, 'reserved']);
  const internal = binToHex(lockingBytecode(wallet));
  const reward = binToHex(lockingBytecode(rewardAddress));
  const realNow = Date.now;
  Date.now = () => 1_800_000_000_000;
  try {
    for (let i = 0; i < 3; i++) {
      f.provider.seed(wallet, 10000n);
      f.provider.seed(f.contract.address, 1000n, { category, amount: 0n, nft: { capability: 'minting', commitment: '' } });
    }
    const intent = { action: 'plant' as const, rewardAddress, units: 1, tier: 1, species: 1 };
    reserve('plant-a'); reserve('plant-b');
    await prepareReward(f.provider, f.ledger, 'plant-a', 'account-1', wallet, category, intent);
    await prepareReward(f.provider, f.ledger, 'plant-b', 'account-1', wallet, category, intent);
    const sessions = f.ledger.db.query('SELECT commitment, plantedAt FROM sessions ORDER BY plantedAt').all() as { commitment: string; plantedAt: number }[];
    expect(sessions.map((row) => row.plantedAt)).toEqual([1_800_000_000_000, 1_800_000_001_000]);
    expect(new Set(sessions.map((row) => row.commitment)).size).toBe(2);
    // The bump is bounded: after two minutes of identical plantings the service asks the user to wait.
    for (let second = 2; second <= 120; second++) f.ledger.db.run('INSERT INTO sessions(commitment,account,wallet,reward,duration,plantedAt,plant,claim) VALUES(?,?,?,?,512,?,?,NULL)', [plantedCommitment(reward, internal, 1_800_000_000 + second, 1, 1, 1), 'account-1', wallet, rewardAddress, (1_800_000_000 + second) * 1000, 'filler']);
    reserve('plant-c');
    await expect(prepareReward(f.provider, f.ledger, 'plant-c', 'account-1', wallet, category, intent)).rejects.toThrow(/Try again in a minute/);

    // A tree planted by another app wallet can only be released by that wallet or its owner.
    const foreign = plantedCommitment(reward, `76a914${'3c'.repeat(20)}88ac`, 1_800_000_000, 1, 1, 1);
    f.provider.seed(f.contract.address, 1000n, { category, amount: 0n, nft: { capability: 'mutable', commitment: foreign } });
    reserve('claim-foreign');
    await expect(prepareReward(f.provider, f.ledger, 'claim-foreign', 'account-1', wallet, category, { action: 'claim', commitment: foreign })).rejects.toThrow(/planted this tree/);

    // A merge whose result already exists is refused before anything is reserved.
    const sprouts = [10, 11, 12].map((offset) => plantedCommitment(reward, internal, 1_700_000_000 + offset, 1, 1, 1));
    sprouts.forEach((commitment) => f.provider.seed(f.contract.address, 1000n, { category, amount: 0n, nft: { capability: 'mutable', commitment } }));
    f.ledger.db.run('INSERT INTO sessions(commitment,account,wallet,reward,duration,plantedAt,plant,claim) VALUES(?,?,?,?,0,?,?,NULL)', [checkMerge(sprouts)!.result, 'account-1', wallet, rewardAddress, 0, 'earlier']);
    reserve('merge-again');
    await expect(prepareReward(f.provider, f.ledger, 'merge-again', 'account-1', wallet, category, { action: 'merge', commitments: sprouts })).rejects.toThrow(/different set/);
  } finally {
    Date.now = realNow;
  }
});
