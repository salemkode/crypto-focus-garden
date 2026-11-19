import { binToHex, cashAddressToLockingBytecode, hash256, hexToBin } from "@bitauth/libauth";
import { Contract, TransactionBuilder, type Artifact, type NetworkProvider, type SignatureTemplate, type Utxo } from "cashscript";

/**
 * One-time deployment of a shared Focus Garden contract.
 *
 * CashTokens creates a new token category when a transaction spends an output with index 0;
 * the category id is that output's transaction id. Each contract therefore needs:
 *   1. prep:    the deployer pays itself, creating a fresh output 0;
 *   2. genesis: that output 0 is spent and the minting baton is sent straight into the contract.
 * Every user's app then points at the same category and contract address, so all trees and
 * profile cards share one collection.
 */
export const BATON_SATOSHIS = 1000n;
export const STEP_FEE_SATOSHIS = 1000n;
export const DUST_SATOSHIS = 546n;

export const transactionIdOf = (raw: string) => binToHex(hash256(hexToBin(raw)).reverse());

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

/** Pays the deployer's plain coins back to itself as output 0. */
export function buildPrep(provider: NetworkProvider, signer: SignatureTemplate, address: string, coins: Utxo[], name: string) {
	const plain = coins.filter((coin) => !coin.token);
	const total = plain.reduce((sum, coin) => sum + coin.satoshis, 0n);
	if (plain.length === 0 || total - STEP_FEE_SATOSHIS < DUST_SATOSHIS) throw new Error("Not enough plain BCH to prepare the deployment.");
	const builder = new TransactionBuilder({ provider });
	plain.forEach((coin) => builder.addInput(coin, signer.unlockP2PKH()));
	builder.addOutput({ to: address, amount: total - STEP_FEE_SATOSHIS });
	const raw = builder.build();
	const txid = transactionIdOf(raw);
	return { step: { name, raw, txid } satisfies Step, output: { txid, vout: 0, satoshis: total - STEP_FEE_SATOSHIS } satisfies Utxo };
}

/** Spends an output 0 to create a category and locks its minting baton in the contract. */
export function buildGenesis(provider: NetworkProvider, signer: SignatureTemplate, address: string, coin: Utxo, artifact: Artifact, name: string) {
	if (coin.vout !== 0 || coin.token) throw new Error("Genesis must spend a plain output with index 0.");
	const change = coin.satoshis - BATON_SATOSHIS - STEP_FEE_SATOSHIS;
	if (change < DUST_SATOSHIS) throw new Error("Not enough BCH for the minting baton and fee.");
	const category = coin.txid;
	const contract = contractAt(artifact, category, provider);
	const raw = new TransactionBuilder({ provider })
		.addInput(coin, signer.unlockP2PKH())
		.addOutput({ to: contract.tokenAddress, amount: BATON_SATOSHIS, token: { category, amount: 0n, nft: { capability: "minting", commitment: "" } } })
		.addOutput({ to: address, amount: change })
		.build();
	const txid = transactionIdOf(raw);
	return {
		step: { name, raw, txid } satisfies Step,
		change: { txid, vout: 1, satoshis: change } satisfies Utxo,
		deployment: { category, address: contract.address, tokenAddress: contract.tokenAddress, lockingBytecode: lockingBytecodeOf(contract.address), batonOutpoint: `${txid}:0` },
	};
}

function lockingBytecodeOf(address: string) {
	const decoded = cashAddressToLockingBytecode(address);
	if (typeof decoded === "string") throw new Error(decoded);
	const hex = binToHex(decoded.bytecode);
	if (!/^aa20[0-9a-f]{64}87$/.test(hex)) throw new Error("Expected a P2SH32 contract address.");
	return hex;
}

/** Builds the full chain of four transactions for Focus Forest and Focus Directory. */
export function planDeployment(provider: NetworkProvider, signer: SignatureTemplate, address: string, coins: Utxo[], artifacts: { forest: Artifact; directory: Artifact }) {
	const forestPrep = buildPrep(provider, signer, address, coins, "forest-prep");
	const forest = buildGenesis(provider, signer, address, forestPrep.output, artifacts.forest, "forest-genesis");
	const directoryPrep = buildPrep(provider, signer, address, [forest.change], "directory-prep");
	const directory = buildGenesis(provider, signer, address, directoryPrep.output, artifacts.directory, "directory-genesis");
	return {
		steps: [forestPrep.step, forest.step, directoryPrep.step, directory.step],
		forest: forest.deployment,
		directory: directory.deployment,
	};
}
