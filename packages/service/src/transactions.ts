import { Contract, TransactionBuilder, placeholderP2PKHUnlocker, type NetworkProvider, SignatureTemplate } from 'cashscript';
import { binToHex, cashAddressToLockingBytecode, hexToBin, decodePrivateKeyWif, lockingBytecodeToCashAddress } from '@bitauth/libauth';
import { z } from 'zod';
import { address, GardenTransactionError, intentSchema, transactionId } from '@focus-garden/protocol';
import { aboutOutputBytecode, checkMerge, parseTree, planterTag, plantedCommitment, profileCommitment, UNIT_SECONDS } from '@focus-garden/protocol/forest';
import artifact from '../../contracts/artifacts/FocusForest.artifact';
import directoryArtifact from '../../contracts/artifacts/FocusDirectory.artifact';
import type { Ledger } from './ledger';

export function lockingBytecode(input: string) {
  const decoded = cashAddressToLockingBytecode(address.parse(input));
  if (typeof decoded === 'string' || !/^76a914[0-9a-f]{40}88ac$/.test(binToHex(decoded.bytecode))) throw new GardenTransactionError({ message: 'Use a chipnet P2PKH address.' });
  return decoded.bytecode;
}
export function contractFor(provider: NetworkProvider, category: string) {
  z.string().regex(/^[0-9a-f]{64}$/).parse(category);
  if (provider.network !== 'chipnet') throw new GardenTransactionError({ message: 'Only chipnet is enabled.' });
  return new Contract(artifact, [hexToBin(category).reverse()], { provider, addressType: 'p2sh32' });
}
export function directoryFor(provider: NetworkProvider, category: string) {
  z.string().regex(/^[0-9a-f]{64}$/).parse(category);
  if (provider.network !== 'chipnet') throw new GardenTransactionError({ message: 'Only chipnet is enabled.' });
  return new Contract(directoryArtifact, [hexToBin(category).reverse()], { provider, addressType: 'p2sh32' });
}
export function outpoint(coin: { txid: string; vout: number }) { return `${coin.txid}:${coin.vout}`; }
export async function prepareReward(provider: NetworkProvider, ledger: Ledger, operation: string, account: string, wallet: string, category: string, requested: z.input<typeof intentSchema>, options: { directoryCategory?: string } = {}) {
  const intent = intentSchema.parse(requested);
  const internal = lockingBytecode(wallet);
  const needed = intent.action === 'plant' ? 8000n : intent.action === 'tip' ? BigInt(intent.amount) + 2000n + 546n : 4000n;
  const funding = (await provider.getUtxos(wallet)).find((coin) => !coin.token && coin.satoshis >= needed && ledger.available(outpoint(coin)));
  if (!funding) throw new GardenTransactionError({ message: intent.action === 'tip' ? 'Your app wallet does not have enough BCH for this tip.' : 'Transaction credit is required.' });
  const builder = new TransactionBuilder({ provider });

  if (intent.action === 'tip') {
    const recipient = lockingBytecode(intent.recipient);
    if (binToHex(recipient) === binToHex(internal)) throw new GardenTransactionError({ message: 'You cannot tip yourself.' });
    ledger.reserveCoins(operation, [outpoint(funding)]);
    builder.setLocktime(0).addInput(funding, placeholderP2PKHUnlocker(wallet), { sequence: 0xffffffff })
      .addOutput({ to: intent.recipient, amount: BigInt(intent.amount) })
      .addOutput({ to: wallet, amount: funding.satoshis - BigInt(intent.amount) - 2000n });
    return finish([funding]);
  }

  if (intent.action === 'register') {
    if (!options.directoryCategory) throw new GardenTransactionError({ message: 'The Focus Directory is not configured.' });
    const directory = directoryFor(provider, options.directoryCategory);
    const baton = (await directory.getUtxos()).find((coin) => coin.token?.category === options.directoryCategory && coin.token?.nft?.capability === 'minting' && coin.token?.nft?.commitment === '' && ledger.available(outpoint(coin)));
    if (!baton) throw new GardenTransactionError({ message: 'No Focus Directory minting baton is available.' });
    ledger.reserveCoins(operation, [outpoint(baton), outpoint(funding)]);
    const card = profileCommitment(intent.name);
    builder.setLocktime(0)
      .addInput(baton, directory.unlock.register(internal.slice(3, 23), hexToBin(card.slice(2))), { sequence: 0xffffffff })
      .addInput(funding, placeholderP2PKHUnlocker(wallet), { sequence: 0xffffffff })
      .addOutput({ to: directory.tokenAddress, amount: baton.satoshis, token: baton.token })
      .addOutput({ to: tokenAddressOf(wallet), amount: 1000n, token: { category: options.directoryCategory, amount: 0n, nft: { capability: 'none', commitment: card } } });
    if (intent.about.trim()) builder.addOpReturnOutput(['0x' + aboutOutputBytecode(intent.about).slice(4, 12), intent.about.trim()]);
    builder.addOutput({ to: wallet, amount: funding.satoshis - 3000n });
    return finish([baton, funding]);
  }

  const contract = contractFor(provider, category);
  const coins = await contract.getUtxos();
  const lockedTree = (commitment: string) => coins.find((coin) => coin.token?.category === category && coin.token.amount === 0n && coin.token.nft?.capability === 'mutable' && coin.token.nft.commitment === commitment && ledger.available(outpoint(coin)));
  if (intent.action === 'plant') {
    const baton = coins.find((coin) => coin.token?.category === category && coin.token.amount === 0n && coin.token.nft?.capability === 'minting' && coin.token.nft.commitment === '' && ledger.available(outpoint(coin)));
    if (!baton) throw new GardenTransactionError({ message: 'No Focus Forest minting baton is available.' });
    const reward = lockingBytecode(intent.rewardAddress);
    if (binToHex(internal) === binToHex(reward)) throw new GardenTransactionError({ message: 'Use a separate external reward wallet.' });
    // Commitments identify sessions, so two identical plantings in the same second take the next free second.
    let plantedAt = Math.floor(Date.now() / 1000);
    let commitment = plantedCommitment(binToHex(reward), binToHex(internal), plantedAt, intent.units, intent.tier, intent.species);
    while (ledger.db.query('SELECT 1 FROM sessions WHERE commitment=?').get(commitment)) {
      plantedAt += 1;
      if (plantedAt > Math.floor(Date.now() / 1000) + 120) throw new GardenTransactionError({ message: 'Too many identical plantings right now. Try again in a minute.' });
      commitment = plantedCommitment(binToHex(reward), binToHex(internal), plantedAt, intent.units, intent.tier, intent.species);
    }
    ledger.reserveCoins(operation, [outpoint(baton), outpoint(funding)]);
    builder.setLocktime(plantedAt)
      .addInput(baton, contract.unlock.plantTree(BigInt(plantedAt), BigInt(intent.units), BigInt(intent.tier), BigInt(intent.species), reward.slice(3, 23)), { sequence: 0xffffffff })
      .addInput(funding, placeholderP2PKHUnlocker(wallet), { sequence: 0xffffffff })
      .addOutput({ to: contract.tokenAddress, amount: baton.satoshis, token: baton.token })
      .addOutput({ to: contract.tokenAddress, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'mutable', commitment } } })
      .addOutput({ to: wallet, amount: funding.satoshis - 3000n });
    ledger.db.run('INSERT INTO sessions(commitment,account,wallet,reward,duration,plantedAt,plant,claim) VALUES(?,?,?,?,?,?,?,NULL)', [commitment, account, wallet, intent.rewardAddress, intent.units * UNIT_SECONDS, plantedAt * 1000, operation]);
    return finish([baton, funding]);
  }
  if (intent.action === 'claim') {
    const locked = lockedTree(intent.commitment);
    if (!locked) throw new GardenTransactionError({ message: 'This tree is not available in the Focus Forest contract.' });
    const tree = parseTree(intent.commitment)!;
    // The contract releases a tree only to a transaction signed by its owner or its planting app wallet.
    if (tree.planterTag !== planterTag(binToHex(internal))) throw new GardenTransactionError({ message: 'Only the app wallet that planted this tree, or its reward wallet, can release it.' });
    ledger.reserveCoins(operation, [outpoint(locked), outpoint(funding)]);
    builder.setLocktime(0).addInput(locked, contract.unlock.claimTree(), { sequence: 4194304 + tree.units })
      .addInput(funding, placeholderP2PKHUnlocker(wallet), { sequence: 0xffffffff })
      .addOutput({ to: hexToBin(tree.ownerBytecode), amount: locked.satoshis, token: { category, amount: 0n, nft: { capability: 'none', commitment: intent.commitment } } })
      .addOutput({ to: wallet, amount: funding.satoshis - 2000n });
    return finish([locked, funding]);
  }
  const checked = checkMerge(intent.commitments);
  if (!checked) throw new GardenTransactionError({ message: 'These trees cannot be merged together.' });
  if (ledger.db.query('SELECT 1 FROM sessions WHERE commitment=?').get(checked.result)) throw new GardenTransactionError({ message: 'Choose a different set of trees to merge.' });
  const trees = intent.commitments.map(lockedTree);
  if (trees.some((coin) => !coin)) throw new GardenTransactionError({ message: 'Every tree in this merge must be available in the contract.' });
  const inputs = trees as NonNullable<(typeof trees)[number]>[];
  ledger.reserveCoins(operation, [...inputs.map(outpoint), outpoint(funding)]);
  builder.setLocktime(0);
  inputs.forEach((coin, index) => builder.addInput(coin, contract.unlock.mergeTrees(), { sequence: 4194304 + parseTree(intent.commitments[index])!.units }));
  const deposits = inputs.reduce((sum, coin) => sum + coin.satoshis, 0n);
  builder.addInput(funding, placeholderP2PKHUnlocker(wallet), { sequence: 0xffffffff })
    // The merged tree keeps every ingredient's deposit; the app wallet pays only the fee.
    .addOutput({ to: contract.tokenAddress, amount: deposits, token: { category, amount: 0n, nft: { capability: 'mutable', commitment: checked.result } } })
    .addOutput({ to: wallet, amount: funding.satoshis - 2000n });
  const reward = lockingBytecodeToAddress(parseTree(checked.result)!.ownerBytecode);
  ledger.db.transaction(() => {
    ledger.db.run('INSERT INTO sessions(commitment,account,wallet,reward,duration,plantedAt,plant,claim) VALUES(?,?,?,?,0,?,?,NULL)', [checked.result, account, wallet, reward, Date.now(), operation]);
    intent.commitments.forEach((commitment) => ledger.db.run('UPDATE sessions SET mergedInto=? WHERE commitment=? AND account=?', [operation, commitment, account]));
  }).immediate();
  return finish([...inputs, funding]);

  async function finish(spent: { txid: string }[]) {
    return { id: operation, network: 'chipnet' as const, transaction: builder.build(), sourceTransactions: await Promise.all(spent.map((coin) => provider.getRawTransaction(coin.txid))) };
  }
}
function tokenAddressOf(wallet: string) {
  const decoded = cashAddressToLockingBytecode(wallet);
  if (typeof decoded === 'string') throw new GardenTransactionError({ message: decoded });
  const result = lockingBytecodeToCashAddress({ bytecode: decoded.bytecode, prefix: 'bchtest', tokenSupport: true });
  if (typeof result === 'string') throw new GardenTransactionError({ message: result });
  return result.address;
}
function lockingBytecodeToAddress(bytecode: string) {
  const result = lockingBytecodeToCashAddress({ bytecode: hexToBin(bytecode), prefix: 'bchtest' });
  if (typeof result === 'string') throw new GardenTransactionError({ message: result });
  return result.address;
}
export async function prepareGrant(provider: NetworkProvider, ledger: Ledger, id: string, wallet: string, amount: number, treasuryKey: string) {
  const decodedKey = decodePrivateKeyWif(treasuryKey);
  if (typeof decodedKey === 'string' || decodedKey.type !== 'testnet') throw new GardenTransactionError({ message: 'Use a dedicated compressed testnet/Chipnet treasury key.' });
  const signer = new SignatureTemplate(treasuryKey);
  const { encodeLockingBytecodeP2pkh, hash160 } = await import('@bitauth/libauth');
  const destination = lockingBytecodeToCashAddress({ bytecode: encodeLockingBytecodeP2pkh(hash160(signer.getPublicKey())), prefix: 'bchtest' });
  if (typeof destination === 'string') throw new GardenTransactionError({ message: destination });
  const coin = (await provider.getUtxos(destination.address)).find((entry) => !entry.token && entry.satoshis >= BigInt(amount + 2000 + 546) && ledger.available(outpoint(entry)));
  if (!coin) throw new GardenTransactionError({ message: 'Treasury has insufficient available plain BCH.' });
  ledger.reserveCoins(id, [outpoint(coin)]);
  const raw = new TransactionBuilder({ provider }).addInput(coin, signer.unlockP2PKH())
    .addOutput({ to: wallet, amount: BigInt(amount) }).addOutput({ to: destination.address, amount: coin.satoshis - BigInt(amount + 2000) }).build();
  return { raw, txid: transactionId(raw) };
}
