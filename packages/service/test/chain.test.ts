import { expect, test } from 'bun:test';
import { binToHex, encodeTransaction, encodeLockingBytecodeP2pkh, lockingBytecodeToCashAddress } from '@bitauth/libauth';
import { NodeRpcError, ValidatedNodeProvider } from '../src/chain';
import { transactionId } from '@focus-garden/protocol';
const script = encodeLockingBytecodeP2pkh(new Uint8Array(20).fill(1));
const decoded = lockingBytecodeToCashAddress({ bytecode: script, prefix: 'bchtest' });
if (typeof decoded === 'string') throw new Error(decoded);
const raw = binToHex(encodeTransaction({ version: 2, locktime: 0, inputs: [{ outpointTransactionHash: new Uint8Array(32), outpointIndex: 0xffffffff, sequenceNumber: 0xffffffff, unlockingBytecode: new Uint8Array([1, 1]) }], outputs: [{ lockingBytecode: script, valueSatoshis: 8000n }] }));
const txid = transactionId(raw);
const tipHash = 'aa'.repeat(32);
const blockHash = 'bb'.repeat(32);
const checkpointHash = 'cc'.repeat(32);
const oversizedTx = 'dd'.repeat(32);
function fixture() {
  const state = { chain: 'chip', confirmations: 6, active: true, stale: false, syncing: false, changed: false, missing: false, spent: false, forged: false, oversized: false, sent: 0, allow: true, mtp: 1800002000 };
  async function rpc(method: string, params: (string | number | boolean | string[])[]) {
    if (method === 'getblockchaininfo') return { chain: state.chain, blocks: 200, headers: 200, bestblockhash: state.changed ? checkpointHash : tipHash, initialblockdownload: state.syncing, verificationprogress: 1, pruned: false };
    if (method === 'getblockhash') return params[0] === 100 ? checkpointHash : params[0] === 195 ? (state.active ? blockHash : checkpointHash) : checkpointHash;
    if (method === 'getblockheader') return { hash: params[0], height: params[0] === tipHash ? 200 : params[0] === blockHash ? 195 : 194, confirmations: params[0] === tipHash ? 1 : state.confirmations, time: Math.floor(Date.now() / 1000) - (state.stale ? 86400 : 0), mediantime: params[0] === tipHash ? state.mtp : 1800000000 };
    if (method === 'getrawtransaction') {
      if (state.missing) throw new NodeRpcError(-5, 'Missing test tx');
      if (params[0] === oversizedTx) return '00'.repeat(100001);
      return params[1] ? { hex: raw, confirmations: state.confirmations, ...(state.confirmations > 0 ? { blockhash: blockHash } : {}), in_active_chain: state.active } : raw;
    }
    if (method === 'gettxout') return state.spent ? null : { bestblock: tipHash, confirmations: state.confirmations, value: state.forged ? 1 : 0.00008, scriptPubKey: { hex: binToHex(script) } };
    if (method === 'testmempoolaccept') return [{ allowed: state.allow }];
    if (method === 'sendrawtransaction') { state.sent++; return txid; }
    throw new Error(`Unexpected test RPC ${method}`);
  }
  const discovery = { getUtxos: async () => [
    ...(state.oversized ? [{ txid: oversizedTx, vout: 0, satoshis: 9000n }] : []),
    { txid, vout: 0, satoshis: 999999999n },
  ] };
  const provider = new ValidatedNodeProvider({ url: 'http://127.0.0.1:48332', genesisHash: checkpointHash, checkpointHeight: 100, checkpointHash }, rpc, discovery, rpc);
  return { state, provider };
}
test('untrusted discovery cannot invent value or confirmations; a validating-node UTXO is authoritative', async () => {
  const { state, provider } = fixture();
  expect((await provider.getUtxos(decoded.address))[0].satoshis).toBe(8000n);
  state.confirmations = 1;
  expect(await provider.getUtxos(decoded.address)).toEqual([]);
  state.confirmations = 6; state.forged = true;
  expect(provider.getUtxos(decoded.address)).rejects.toThrow();
});
test('wrong chain, unsynced node, stale tip and incorrect checkpoint fail closed', async () => {
  const { state, provider } = fixture();
  state.chain = 'main'; await expect(provider.ready()).rejects.toThrow();
  state.chain = 'chip'; state.syncing = true; await expect(provider.ready()).rejects.toThrow();
  state.syncing = false; state.stale = true; await expect(provider.ready()).rejects.toThrow();
  expect(() => new ValidatedNodeProvider({ url: 'http://example.com', genesisHash: checkpointHash, checkpointHeight: 1, checkpointHash }, async () => null, { getUtxos: async () => [] })).toThrow();
  const bad = new ValidatedNodeProvider({ url: 'http://127.0.0.1', genesisHash: checkpointHash, checkpointHeight: 100, checkpointHash: tipHash }, provider.rpc, provider.discovery);
  await expect(bad.ready()).rejects.toThrow();
});
test('confirmations, canonical membership and CSV MTP must all agree', async () => {
  const { state, provider } = fixture();
  expect((await provider.observe(txid)).state).toBe('confirmed');
  expect(await provider.maturity(txid, 1536)).toBe('claimable');
  expect(await provider.maturity(txid, 3072)).toBe('locked');
  state.confirmations = 1;
  expect((await provider.observe(txid)).state).toBe('confirming');
  expect(await provider.maturity(txid, 1536)).toBe('confirming');
  state.confirmations = 6; state.active = false;
  expect((await provider.observe(txid)).state).toBe('conflicted');
  state.active = true; state.confirmations = 0;
  expect((await provider.observe(txid)).state).toBe('mempool');
  state.missing = true;
  expect((await provider.observe(txid)).state).toBe('missing');
});
test('a chain view change and node preflight rejection never authorize a broadcast', async () => {
  const { state, provider } = fixture();
  state.changed = true;
  await expect(provider.sameTip(tipHash)).rejects.toThrow();
  state.changed = false; state.allow = false;
  await expect(provider.sendRawTransaction(raw)).rejects.toThrow();
  expect(state.sent).toBe(0);
});
test('Mainnet node requires the matching BCHN chain, address and writer checkpoint', async () => {
  const { state, provider: chipnet } = fixture();
  const mainnetAddress = lockingBytecodeToCashAddress({ bytecode: script, prefix: 'bitcoincash' });
  if (typeof mainnetAddress === 'string') throw new Error(mainnetAddress);
  const mainnet = new ValidatedNodeProvider({ ...chipnet.config, network: 'mainnet' }, chipnet.rpc, chipnet.discovery,
    (method, params) => method === 'getblockhash' && params[0] === 100 ? Promise.resolve(tipHash) : chipnet.rpc(method, params));
  expect(mainnet.network).toBe('mainnet');
  await expect(mainnet.ready()).rejects.toThrow();
  state.chain = 'main';
  expect((await mainnet.getUtxos(mainnetAddress.address))[0].satoshis).toBe(8000n);
  await expect(mainnet.getUtxos(decoded.address)).rejects.toThrow();
  await expect(mainnet.readyWriter()).rejects.toThrow();
  await expect(mainnet.sendRawTransaction(raw)).rejects.toThrow();
  expect(state.sent).toBe(0);
});
test('skips deposits outside the source-transaction limit while retaining supported outputs', async () => {
  const { state, provider } = fixture();
  state.oversized = true;
  expect((await provider.getUtxos(decoded.address)).map((entry) => entry.txid)).toEqual([txid]);
});
