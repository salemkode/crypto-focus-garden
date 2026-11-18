import { binToHex, cashAddressToLockingBytecode, createVirtualMachineBch2026, decodePrivateKeyWif, encodeLockingBytecodeP2pkh, encodePrivateKeyWif, hash160, lockingBytecodeToCashAddress } from '@bitauth/libauth';
import { SignatureTemplate, TransactionBuilder, type NetworkProvider } from 'cashscript';
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, linkSync, unlinkSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { chainIdentitySchema, decode, GardenTransactionError, transactionId } from '@focus-garden/protocol';
import artifact from '../../contracts/artifacts/FocusForest.artifact';
import directoryArtifact from '../../contracts/artifacts/FocusDirectory.artifact';
import { contractFor, directoryFor } from './transactions';

export const dedicatedIdentitySchema = z.object({ schema: z.literal('focus-garden-dedicated-chipnet-v1'), role: z.enum(['treasury', 'recipient']), chainIdentity: chainIdentitySchema, wif: z.string(), address: z.string(), createdAt: z.string() });
export const setupRecordSchema = z.object({
  schema: z.literal('focus-garden-chipnet-setup-v1'), purpose: z.enum(['genesis-input', 'v3-baton', 'forest-baton', 'directory-baton']), state: z.enum(['prepared', 'pending', 'confirmed']),
  chainIdentity: chainIdentitySchema, raw: z.string(), txid: z.string().regex(/^[0-9a-f]{64}$/),
  category: z.string().nullable(), contractAddress: z.string().nullable(), contractBytecode: z.string().nullable(), artifactSha256: z.string(), createdAt: z.string(),
});
export function createDedicatedIdentity(role: z.infer<typeof dedicatedIdentitySchema>['role'], chainIdentity: z.infer<typeof chainIdentitySchema>, file: string) {
  z.string().endsWith('.credential').parse(file);
  const key = randomBytes(32);
  const signer = new SignatureTemplate(key);
  const result = lockingBytecodeToCashAddress({ bytecode: encodeLockingBytecodeP2pkh(hash160(signer.getPublicKey())), prefix: 'bchtest' });
  if (typeof result === 'string') throw new GardenTransactionError({ message: result });
  const identity = dedicatedIdentitySchema.parse({ schema: 'focus-garden-dedicated-chipnet-v1', role, chainIdentity, wif: encodePrivateKeyWif(key, 'testnet'), address: result.address, createdAt: new Date().toISOString() });
  writeFileSync(file, JSON.stringify(identity), { flag: 'wx', mode: 0o600 });
  // Return public data only; the key never enters stdout, evidence or source.
  return { role, address: identity.address, chainIdentity, credentialFile: file };
}
export async function prepareTestnetSetup(provider: NetworkProvider, expected: z.infer<typeof chainIdentitySchema>, identityFile: string, purpose: 'genesis-input' | 'forest-baton' | 'directory-baton') {
  if (provider.network !== 'chipnet' || (statSync(identityFile).mode & 0o077) !== 0) throw new GardenTransactionError({ message: 'Use a private dedicated Chipnet test identity file.' });
  const identity = dedicatedIdentitySchema.parse(JSON.parse(readFileSync(identityFile, 'utf8')));
  if (identity.role !== 'treasury' || JSON.stringify(identity.chainIdentity) !== JSON.stringify(chainIdentitySchema.parse(expected))) throw new GardenTransactionError({ message: 'Test identity is not bound to this verified Chipnet environment.' });
  const key = decodePrivateKeyWif(identity.wif);
  if (typeof key === 'string' || key.type !== 'testnet') throw new GardenTransactionError({ message: 'A dedicated compressed Chipnet key is required.' });
  const signer = new SignatureTemplate(identity.wif);
  const script = encodeLockingBytecodeP2pkh(hash160(signer.getPublicKey()));
  const address = lockingBytecodeToCashAddress({ bytecode: script, prefix: 'bchtest' });
  if (typeof address === 'string' || address.address !== identity.address) throw new GardenTransactionError({ message: 'Test identity address/key mismatch.' });
  const coin = (await provider.getUtxos(identity.address)).find((entry) => !entry.token && entry.satoshis >= 20000n && (purpose === 'genesis-input' || entry.vout === 0));
  if (!coin) throw new GardenTransactionError({ message: purpose !== 'genesis-input' ? 'A confirmed output-index-zero plain test coin is required; prepare a genesis-input self-transfer if needed.' : 'Fund this dedicated address with test coins and wait for the configured confirmations.' });
  const sourceRaw = await provider.getRawTransaction(coin.txid);
  if (transactionId(sourceRaw) !== coin.txid) throw new GardenTransactionError({ message: 'Test funding transaction hash mismatch.' });
  const source = decode(sourceRaw).outputs[coin.vout];
  if (!source || binToHex(source.lockingBytecode) !== binToHex(script) || source.valueSatoshis !== coin.satoshis || source.token) throw new GardenTransactionError({ message: 'Test funding source failed independent validation.' });
  const builder = new TransactionBuilder({ provider }).addInput(coin, signer.unlockP2PKH());
  // Each contract gets its own token category, minted from its own genesis input.
  const contract = purpose === 'forest-baton' ? contractFor(provider, coin.txid) : purpose === 'directory-baton' ? directoryFor(provider, coin.txid) : null;
  if (contract) builder.addOutput({ to: contract.tokenAddress, amount: 1000n, token: { category: coin.txid, amount: 0n, nft: { capability: 'minting', commitment: '' } } });
  builder.addOutput({ to: identity.address, amount: coin.satoshis - (contract ? 3000n : 2000n) });
  const raw = builder.build();
  const transaction = decode(raw);
  const valid = createVirtualMachineBch2026().verify({ transaction, sourceOutputs: [source] });
  if (valid !== true) throw new GardenTransactionError({ message: `Test setup transaction is invalid: ${valid}` });
  const contractScript = contract ? cashAddressToLockingBytecode(contract.address) : null;
  if (typeof contractScript === 'string') throw new GardenTransactionError({ message: contractScript });
  return setupRecordSchema.parse({ schema: 'focus-garden-chipnet-setup-v1', purpose, state: 'prepared', chainIdentity: expected, raw, txid: transactionId(raw), category: contract ? coin.txid : null, contractAddress: contract?.address ?? null, contractBytecode: contractScript ? binToHex(contractScript.bytecode) : null, artifactSha256: createHash('sha256').update(JSON.stringify(purpose === 'directory-baton' ? directoryArtifact : artifact)).digest('hex'), createdAt: new Date().toISOString() });
}
export function persistSetup(file: string, record: z.infer<typeof setupRecordSchema>, replace = false) {
  if (!replace && existsSync(file)) throw new GardenTransactionError({ message: 'A setup record already exists. Reconcile it rather than creating a replacement.' });
  const temporary = `${file}.${process.pid}.tmp`;
  const fd = openSync(temporary, 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify(setupRecordSchema.parse(record), null, 2)); fsyncSync(fd); }
  finally { closeSync(fd); }
  if (replace) renameSync(temporary, file);
  else { linkSync(temporary, file); unlinkSync(temporary); }
  const directory = openSync(dirname(file), 'r');
  try { fsyncSync(directory); } finally { closeSync(directory); }
}
