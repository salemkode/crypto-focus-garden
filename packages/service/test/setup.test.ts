import { expect, test } from 'bun:test';
import { binToHex, encodeTransaction, cashAddressToLockingBytecode } from '@bitauth/libauth';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transactionId } from '@focus-garden/protocol';
import { createDedicatedIdentity, persistSetup, prepareTestnetSetup, setupRecordSchema } from '../src/testnet-setup';
const identity = { genesisHash: '11'.repeat(32), checkpointHeight: 1, checkpointHash: '22'.repeat(32) };
test('dedicated test setup creates bounded, valid Forest and Directory batons with private keys excluded from returned evidence', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'focus-garden-test-identity-'));
  try {
    const file = join(directory, 'treasury.credential');
    const publicData = createDedicatedIdentity('treasury', identity, file);
    expect(JSON.stringify(publicData)).not.toContain('wif');
    expect(statSync(file).mode & 0o077).toBe(0);
    const decoded = cashAddressToLockingBytecode(publicData.address);
    if (typeof decoded === 'string') throw new Error(decoded);
    const raw = binToHex(encodeTransaction({ version: 2, locktime: 0, inputs: [{ outpointTransactionHash: new Uint8Array(32), outpointIndex: 0xffffffff, sequenceNumber: 0xffffffff, unlockingBytecode: new Uint8Array([1, 1]) }], outputs: [{ lockingBytecode: decoded.bytecode, valueSatoshis: 50000n }] }));
    const provider = { network: 'chipnet' as const, getUtxos: async () => [{ txid: transactionId(raw), vout: 0, satoshis: 50000n }], getRawTransaction: async () => raw, getBlockHeight: async () => 1, sendRawTransaction: async () => { throw new Error('This offline test must never broadcast.'); } };
    const record = await prepareTestnetSetup(provider, identity, file, 'forest-baton');
    const directoryRecord = await prepareTestnetSetup(provider, identity, file, 'directory-baton');
    expect(directoryRecord.contractAddress).not.toBe(record.contractAddress);
    expect(directoryRecord.artifactSha256).not.toBe(record.artifactSha256);
    expect(record.category).toBe(transactionId(raw));
    expect(record.contractAddress).toStartWith('bchtest:');
    expect(record.state).toBe('prepared');
    const output = join(directory, 'prepared.json');
    persistSetup(output, record);
    expect(() => persistSetup(output, record)).toThrow();
    persistSetup(output, { ...record, state: 'pending' }, true);
    expect(setupRecordSchema.parse(JSON.parse(readFileSync(output, 'utf8'))).txid).toBe(record.txid);
    await expect(prepareTestnetSetup(provider, { ...identity, checkpointHash: '33'.repeat(32) }, file, 'forest-baton')).rejects.toThrow();
  } finally { rmSync(directory, { recursive: true }); }
});
