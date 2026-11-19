import { binToHex, cashAddressToLockingBytecode, hash160, hash256, hexToBin, lockingBytecodeToCashAddress } from "@bitauth/libauth";
import { Contract, TransactionBuilder, type Artifact, type NetworkProvider, type SignatureTemplate, type Utxo } from "cashscript";

/**
 * One-time deployment of a shared Focus Garden contract.
 *
 * CashTokens creates a new token category when a transaction spends an output with index 0;
 * the category id is that output's transaction id. Each contract therefore needs:
 *   1. prep:    the deployer pays itself, creating a fresh output 0;
 *   2. genesis: that output 0 is spent, creating the category.
 * Every user's app then points at the same category and contract address, so all trees and
 * profile cards share one collection.
 *
 * Genesis layout (BCMR authchain safe):
 *   output 0  identity output: plain BCH to the metadata authority key. The category's authchain
 *             (BCMR) continues only through output 0, so only that key can publish metadata.
 *   output 1  minting baton, locked in the contract. Plant transactions spend it, but they are
 *             not part of the authchain, so planters cannot change the collection's metadata.
 *   then      creator NFTs, the deployer's change and the OP_RETURN BCMR publication.
 * Both prep transactions are built first, so both category ids (and therefore the registry
 * text and its hash) are known before either genesis transaction is signed.
 */
export const BATON_SATOSHIS = 1000n;
export const STEP_FEE_SATOSHIS = 1000n;
export const DUST_SATOSHIS = 546n;
/** Plain BCH on the identity output that carries the BCMR authchain. */
export const IDENTITY_SATOSHIS = 1000n;
/** Split off in the Focus Forest prep transaction to fund the Focus Directory deployment. */
export const DIRECTORY_FUNDING_SATOSHIS = 10000n;
/** Value carried by each creator NFT output (above the CashTokens dust limit). */
export const CREATOR_NFT_SATOSHIS = 1000n;

/** NFTs minted to the creator in the genesis transaction itself: no plant, no time lock. */
export interface CreatorMint {
	address: string;
	commitments: string[];
}

export const transactionIdOf = (raw: string) => binToHex(hash256(hexToBin(raw)).reverse());

/**
 * Builds the BCMR publication for the two new categories: the OP_RETURN locking bytecode
 * (`6a 04 "BCMR" 20 <sha256> <uri>`) plus the hash and URI it carries.
 */
export type Publish = (categories: { forest: string; directory: string }) => { bytecode: string; contentHash: string; uri: string };
export interface Identity {
	/** P2PKH address that receives each genesis output 0 and so controls future BCMR updates. */
	authority: string;
	publish?: Publish;
}

export interface Step {
	name: string;
	raw: string;
	txid: string;
}

export function contractAt(artifact: Artifact, category: string, provider: NetworkProvider) {
	if (!/^[0-9a-f]{64}$/.test(category)) throw new Error("A category id is 64 hex characters.");
	// Contracts take the category in VM byte order: the reverse of its displayed hex.
	return new Contract(artifact, [hexToBin(category).reverse()], { provider, addressType: "p2sh32" });
}

/** Pays the deployer's plain coins back to itself as output 0, optionally splitting `split` sats into output 1. */
export function buildPrep(provider: NetworkProvider, signer: SignatureTemplate, address: string, coins: Utxo[], name: string, split = 0n) {
	const plain = coins.filter((coin) => !coin.token);
	const total = plain.reduce((sum, coin) => sum + coin.satoshis, 0n);
	const main = total - STEP_FEE_SATOSHIS - split;
	if (plain.length === 0 || main < DUST_SATOSHIS || (split && split < DUST_SATOSHIS)) throw new Error("Not enough plain BCH to prepare the deployment.");
	const builder = new TransactionBuilder({ provider });
	plain.forEach((coin) => builder.addInput(coin, signer.unlockP2PKH()));
	builder.addOutput({ to: address, amount: main });
	if (split) builder.addOutput({ to: address, amount: split });
	const raw = builder.build();
	const txid = transactionIdOf(raw);
	return {
		step: { name, raw, txid } satisfies Step,
		output: { txid, vout: 0, satoshis: main } satisfies Utxo,
		rest: split ? ({ txid, vout: 1, satoshis: split } satisfies Utxo) : undefined,
	};
}

/**
 * Spends an output 0 to create a category: identity output 0 to the authority, the minting baton
 * locked in the contract at output 1, optional creator NFTs (immutable, so they behave like
 * claimed trees), the deployer's change and an optional BCMR publication.
 * The fee grows with the transaction size (about 1.1 sat per byte).
 */
export function buildGenesis(provider: NetworkProvider, signer: SignatureTemplate, address: string, coin: Utxo, artifact: Artifact, name: string, identity: { authority: string; publication?: string }, creator?: CreatorMint) {
	if (coin.vout !== 0 || coin.token) throw new Error("Genesis must spend a plain output with index 0.");
	const category = coin.txid;
	const contract = contractAt(artifact, category, provider);
	const minted = creator?.commitments ?? [];
	for (const commitment of minted) if (!/^[0-9a-f]{2,80}$/.test(commitment) || commitment.length % 2) throw new Error(`Invalid NFT commitment: ${commitment}`);
	if (identity.publication && !/^6a0442434d5220[0-9a-f]{64}/.test(identity.publication)) throw new Error("The publication must be an OP_RETURN BCMR output.");
	const build = (fee: bigint) => {
		const change = coin.satoshis - IDENTITY_SATOSHIS - BATON_SATOSHIS - BigInt(minted.length) * CREATOR_NFT_SATOSHIS - fee;
		if (change < DUST_SATOSHIS) throw new Error("Not enough BCH for the identity output, minting baton, creator NFTs and fee.");
		const builder = new TransactionBuilder({ provider })
			.addInput(coin, signer.unlockP2PKH())
			.addOutput({ to: plainAddress(identity.authority), amount: IDENTITY_SATOSHIS })
			.addOutput({ to: contract.tokenAddress, amount: BATON_SATOSHIS, token: { category, amount: 0n, nft: { capability: "minting", commitment: "" } } });
		for (const commitment of minted) builder.addOutput({ to: tokenAddress(creator!.address), amount: CREATOR_NFT_SATOSHIS, token: { category, amount: 0n, nft: { capability: "none", commitment } } });
		builder.addOutput({ to: address, amount: change });
		if (identity.publication) builder.addOutput({ to: hexToBin(identity.publication), amount: 0n });
		return { raw: builder.build(), change };
	};
	const draft = build(STEP_FEE_SATOSHIS);
	const fee = [STEP_FEE_SATOSHIS, BigInt(Math.ceil((draft.raw.length / 2) * 1.1))].reduce((a, b) => (a > b ? a : b));
	const { raw, change } = fee === STEP_FEE_SATOSHIS ? draft : build(fee);
	const txid = transactionIdOf(raw);
	return {
		step: { name, raw, txid } satisfies Step,
		change: { txid, vout: 2 + minted.length, satoshis: change } satisfies Utxo,
		deployment: { category, address: contract.address, tokenAddress: contract.tokenAddress, lockingBytecode: lockingBytecodeOf(contract.address), batonOutpoint: `${txid}:1`, identityOutpoint: `${txid}:0`, creatorNfts: minted.length },
	};
}

/** The identity output must stay plain BCH at a P2PKH address. */
function plainAddress(address: string) {
	const decoded = cashAddressToLockingBytecode(address);
	if (typeof decoded === "string") throw new Error(decoded);
	if (!/^76a914[0-9a-f]{40}88ac$/.test(binToHex(decoded.bytecode))) throw new Error("The metadata authority must be a P2PKH address.");
	const result = lockingBytecodeToCashAddress({ bytecode: decoded.bytecode, prefix: decoded.prefix, tokenSupport: false });
	if (typeof result === "string") throw new Error(result);
	return result.address;
}

function tokenAddress(address: string) {
	const decoded = cashAddressToLockingBytecode(address);
	if (typeof decoded === "string") throw new Error(decoded);
	const result = lockingBytecodeToCashAddress({ bytecode: decoded.bytecode, prefix: decoded.prefix, tokenSupport: true });
	if (typeof result === "string") throw new Error(result);
	return result.address;
}

/** Minimum lock units per tier, as enforced by FocusForest.cash plantTree. */
const TIER_UNITS = [1, 3, 6, 11] as const;

/**
 * Commitments for creator trees, in the exact Focus Forest v5 format
 * (05 | owner pkh | planter tag | stamp LE | units | look), so the app shows them like any
 * claimed tree. The mix leans toward bigger trees: 16% Sprout, 24% Tree, 30% Big tree,
 * 30% House, cycling through the six styles. Stamps count up from `stamp` so each is unique.
 */
export function creatorCommitments(ownerAddress: string, count: number, stamp: number) {
	const decoded = cashAddressToLockingBytecode(ownerAddress);
	if (typeof decoded === "string") throw new Error(decoded);
	const bytecode = binToHex(decoded.bytecode);
	if (!/^76a914[0-9a-f]{40}88ac$/.test(bytecode)) throw new Error("Creator NFTs go to a P2PKH wallet address.");
	const pkh = bytecode.slice(6, 46);
	const tag = binToHex(hash160(decoded.bytecode).slice(0, 12));
	const shares = [0.16, 0.24, 0.3, 0.3];
	const counts = shares.map((share) => Math.floor(share * count));
	counts[3] += count - counts.reduce((a, b) => a + b, 0);
	const le32 = (value: number) => binToHex(Uint8Array.from([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]));
	const byte = (value: number) => value.toString(16).padStart(2, "0");
	const out: string[] = [];
	counts.forEach((n, index) => {
		const tier = index + 1;
		for (let i = 0; i < n; i++) {
			const species = (out.length % 6) + 1;
			out.push(`05${pkh}${tag}${le32(stamp + out.length)}${byte(TIER_UNITS[index])}${byte(tier * 16 + species)}`);
		}
	});
	return out;
}

function lockingBytecodeOf(address: string) {
	const decoded = cashAddressToLockingBytecode(address);
	if (typeof decoded === "string") throw new Error(decoded);
	const hex = binToHex(decoded.bytecode);
	if (!/^aa20[0-9a-f]{64}87$/.test(hex)) throw new Error("Expected a P2SH32 contract address.");
	return hex;
}

/** Builds the full chain of four transactions for Focus Forest and Focus Directory. */
export function planDeployment(provider: NetworkProvider, signer: SignatureTemplate, address: string, coins: Utxo[], artifacts: { forest: Artifact; directory: Artifact }, identity: Identity, creator?: CreatorMint) {
	const forestPrep = buildPrep(provider, signer, address, coins, "forest-prep", DIRECTORY_FUNDING_SATOSHIS);
	const directoryPrep = buildPrep(provider, signer, address, [forestPrep.rest!], "directory-prep");
	const categories = { forest: forestPrep.step.txid, directory: directoryPrep.step.txid };
	const published = identity.publish?.(categories);
	const publication = published?.bytecode;
	const forest = buildGenesis(provider, signer, address, forestPrep.output, artifacts.forest, "forest-genesis", { authority: identity.authority, publication }, creator);
	const directory = buildGenesis(provider, signer, address, directoryPrep.output, artifacts.directory, "directory-genesis", { authority: identity.authority, publication });
	return {
		steps: [forestPrep.step, directoryPrep.step, forest.step, directory.step],
		forest: forest.deployment,
		directory: directory.deployment,
		publication: published,
	};
}

/**
 * A BCMR metadata update: spends the category's identity output (held by the metadata authority)
 * and creates the next one at output 0, extending the authchain, with the new publication at
 * output 1. The deployer's coins pay the fee and get the change at output 2.
 */
export function buildPublication(provider: NetworkProvider, authority: { signer: SignatureTemplate; address: string }, identity: Utxo, funder: { signer: SignatureTemplate; address: string }, coins: Utxo[], publication: string, name: string) {
	if (identity.token) throw new Error("The identity output must be plain BCH.");
	if (!/^6a0442434d5220[0-9a-f]{64}/.test(publication)) throw new Error("The publication must be an OP_RETURN BCMR output.");
	const plain = coins.filter((coin) => !coin.token);
	const funding = plain.reduce((sum, coin) => sum + coin.satoshis, 0n);
	const build = (fee: bigint) => {
		const change = identity.satoshis + funding - IDENTITY_SATOSHIS - fee;
		if (change < DUST_SATOSHIS) throw new Error("Not enough BCH to pay for the metadata update.");
		const builder = new TransactionBuilder({ provider }).addInput(identity, authority.signer.unlockP2PKH());
		plain.forEach((coin) => builder.addInput(coin, funder.signer.unlockP2PKH()));
		builder.addOutput({ to: plainAddress(authority.address), amount: IDENTITY_SATOSHIS });
		builder.addOutput({ to: hexToBin(publication), amount: 0n });
		builder.addOutput({ to: funder.address, amount: change });
		return { raw: builder.build(), change };
	};
	const draft = build(STEP_FEE_SATOSHIS);
	const fee = [STEP_FEE_SATOSHIS, BigInt(Math.ceil((draft.raw.length / 2) * 1.1))].reduce((a, b) => (a > b ? a : b));
	const { raw, change } = fee === STEP_FEE_SATOSHIS ? draft : build(fee);
	const txid = transactionIdOf(raw);
	return { step: { name, raw, txid } satisfies Step, identity: { txid, vout: 0, satoshis: IDENTITY_SATOSHIS } satisfies Utxo, change: { txid, vout: 2, satoshis: change } satisfies Utxo };
}
