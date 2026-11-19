import { binToHex, cashAddressToLockingBytecode, createVirtualMachineBCH2023, decodeTransaction, hash160, hexToBin, type Output } from "@bitauth/libauth";
import { MockNetworkProvider, randomUtxo, TransactionBuilder } from "cashscript";
import forestArtifact from "../../artifacts/FocusForest.artifact.js";
import directoryArtifact from "../../artifacts/FocusDirectory.artifact.js";
import { BATON_SATOSHIS, buildPublication, contractAt, CREATOR_NFT_SATOSHIS, creatorCommitments, DIRECTORY_FUNDING_SATOSHIS, IDENTITY_SATOSHIS, planDeployment, STEP_FEE_SATOSHIS, type Publish } from "../../src/deploy/genesis.js";
import { decToHexWithEndianSwap } from "../../src/utils.js";
import { aliceAddress, aliceSigTemplate, bobPkh, charlieAddress, charlieSigTemplate } from "../shared.js";

const lockingBytecode = (address: string) => {
	const decoded = cashAddressToLockingBytecode(address);
	if (typeof decoded === "string") throw new Error(decoded);
	return decoded.bytecode;
};

// A BCMR publication as packages/protocol/src/bcmr.ts builds it: OP_RETURN <"BCMR"> <sha256> <uri>.
const uri = "focus.salemkode.com/.well-known/bitcoin-cash-metadata-registry.json";
const contentHash = "ab".repeat(32);
const seen: { forest: string; directory: string }[] = [];
const publish: Publish = (categories) => {
	seen.push(categories);
	const location = Buffer.from(uri, "utf8").toString("hex");
	return { bytecode: `6a0442434d5220${contentHash}${uri.length.toString(16)}${location}`, contentHash, uri };
};
const identity = { authority: charlieAddress, publish };

describe("one-time shared deployment", () => {
	const provider = new MockNetworkProvider();
	const coins = [randomUtxo({ satoshis: 16000n }), randomUtxo({ satoshis: 7000n })];
	const plan = planDeployment(provider, aliceSigTemplate, aliceAddress, coins, { forest: forestArtifact, directory: directoryArtifact }, identity);
	const decode = (raw: string) => { const transaction = decodeTransaction(hexToBin(raw)); if (typeof transaction === "string") throw new Error(transaction); return transaction; };

	test("every transaction in the chain is valid under BCH consensus rules (P2PKH inputs and CashTokens genesis)", () => {
		const known = new Map<string, Output>();
		coins.forEach((coin) => known.set(`${coin.txid}:${coin.vout}`, { lockingBytecode: lockingBytecode(aliceAddress), valueSatoshis: coin.satoshis }));
		const vm = createVirtualMachineBCH2023();
		for (const step of plan.steps) {
			const transaction = decodeTransaction(hexToBin(step.raw));
			if (typeof transaction === "string") throw new Error(transaction);
			const sourceOutputs = transaction.inputs.map((input) => known.get(`${binToHex(input.outpointTransactionHash)}:${input.outpointIndex}`)!);
			expect(sourceOutputs.every(Boolean)).toBe(true);
			expect(vm.verify({ transaction, sourceOutputs })).toBe(true);
			transaction.outputs.forEach((output, vout) => known.set(`${step.txid}:${vout}`, output));
		}
	});

	test("each contract gets its own category with exactly one minting baton locked inside it, at output 1", () => {
		expect(plan.steps.map((step) => step.name)).toEqual(["forest-prep", "directory-prep", "forest-genesis", "directory-genesis"]);
		expect(plan.forest.category).toBe(plan.steps[0].txid);
		expect(plan.directory.category).toBe(plan.steps[1].txid);
		expect(plan.forest.category).not.toBe(plan.directory.category);
		for (const [deployment, step] of [[plan.forest, plan.steps[2]], [plan.directory, plan.steps[3]]] as const) {
			const transaction = decode(step.raw);
			const minted = transaction.outputs.filter((output) => output.token);
			expect(minted).toHaveLength(1);
			expect(transaction.outputs[1]).toBe(minted[0]);
			expect(binToHex(minted[0].lockingBytecode)).toBe(deployment.lockingBytecode);
			expect(minted[0].token!.nft!.capability).toBe("minting");
			expect(minted[0].valueSatoshis).toBe(BATON_SATOSHIS);
			expect(deployment.batonOutpoint).toBe(`${step.txid}:1`);
			expect(deployment.lockingBytecode).toMatch(/^aa20[0-9a-f]{64}87$/);
		}
	});

	test("the authchain (output 0 of each genesis) goes to the metadata authority, not the contract", () => {
		for (const [deployment, step] of [[plan.forest, plan.steps[2]], [plan.directory, plan.steps[3]]] as const) {
			const transaction = decode(step.raw);
			// Genesis spends output 0 of the authbase (the prep transaction whose id is the category).
			expect(binToHex(transaction.inputs[0].outpointTransactionHash)).toBe(deployment.category);
			expect(transaction.inputs[0].outpointIndex).toBe(0);
			expect(binToHex(transaction.outputs[0].lockingBytecode)).toBe(binToHex(lockingBytecode(charlieAddress)));
			expect(transaction.outputs[0].token).toBeUndefined();
			expect(transaction.outputs[0].valueSatoshis).toBe(IDENTITY_SATOSHIS);
			expect(deployment.identityOutpoint).toBe(`${step.txid}:0`);
		}
	});

	test("both genesis transactions publish the registry, built after both categories are known", () => {
		expect(seen).toContainEqual({ forest: plan.forest.category, directory: plan.directory.category });
		for (const step of [plan.steps[2], plan.steps[3]]) {
			const publications = decode(step.raw).outputs.filter((output) => output.lockingBytecode[0] === 0x6a);
			expect(publications).toHaveLength(1);
			expect(publications[0].valueSatoshis).toBe(0n);
			expect(binToHex(publications[0].lockingBytecode)).toBe(publish({ forest: "", directory: "" }).bytecode);
		}
	});

	test("the deployer spends only the identity outputs, batons and four fees", () => {
		const forestChange = decode(plan.steps[2].raw).outputs[2].valueSatoshis;
		const directoryChange = decode(plan.steps[3].raw).outputs[2].valueSatoshis;
		const forestGenesisFee = 23000n - STEP_FEE_SATOSHIS - DIRECTORY_FUNDING_SATOSHIS - IDENTITY_SATOSHIS - BATON_SATOSHIS - forestChange;
		const directoryGenesisFee = DIRECTORY_FUNDING_SATOSHIS - STEP_FEE_SATOSHIS - IDENTITY_SATOSHIS - BATON_SATOSHIS - directoryChange;
		expect(forestGenesisFee).toBe(STEP_FEE_SATOSHIS);
		expect(directoryGenesisFee).toBe(STEP_FEE_SATOSHIS);
	});

	test("the deployed baton plants a tree", () => {
		const contract = contractAt(forestArtifact, plan.forest.category, provider);
		expect(contract.address).toBe(plan.forest.address);
		const baton = { txid: plan.steps[2].txid, vout: 1, satoshis: BATON_SATOSHIS, token: { category: plan.forest.category, amount: 0n, nft: { capability: "minting" as const, commitment: "" } } };
		provider.addUtxo(contract.address, baton);
		const funding = randomUtxo({ satoshis: 20000n });
		provider.addUtxo(aliceAddress, funding);
		// 05 | owner pkh | planter tag | stamp | units | look, as in FocusForest.cash.
		const tag = binToHex(hash160(lockingBytecode(aliceAddress)).slice(0, 12));
		const commitment = `05${binToHex(bobPkh)}${tag}${decToHexWithEndianSwap(1800000000, 4)}0111`;
		const builder = new TransactionBuilder({ provider })
			.addInput(baton, contract.unlock.plantTree(1800000000n, 1n, 1n, 1n, bobPkh))
			.addInput(funding, aliceSigTemplate.unlockP2PKH())
			.addOutput({ to: contract.tokenAddress, amount: BATON_SATOSHIS, token: baton.token })
			.addOutput({ to: contract.tokenAddress, amount: 1000n, token: { category: plan.forest.category, amount: 0n, nft: { capability: "mutable", commitment } } })
			.addOutput({ to: aliceAddress, amount: 17000n });
		expect(() => builder.debug()).not.toThrow();
	});
});


describe("creator trees in the genesis transaction", () => {
	const provider = new MockNetworkProvider();
	const coins = [randomUtxo({ satoshis: 300000n })];
	const commitments = creatorCommitments(aliceAddress, 100, 1800000000);
	const plan = planDeployment(provider, aliceSigTemplate, aliceAddress, coins, { forest: forestArtifact, directory: directoryArtifact }, identity, { address: aliceAddress, commitments });

	test("100 creator trees: 16 sprouts, 24 trees, 30 big trees, 30 houses across all six styles, all unique", () => {
		expect(commitments).toHaveLength(100);
		expect(new Set(commitments).size).toBe(100);
		const tiers = [1, 2, 3, 4].map((tier) => commitments.filter((c) => parseInt(c.slice(-2), 16) >> 4 === tier).length);
		expect(tiers).toEqual([16, 24, 30, 30]);
		expect(new Set(commitments.map((c) => parseInt(c.slice(-2), 16) & 15))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
		// Same 39-byte layout as a planted tree, with each tier's real lock units, so the app shows them normally.
		for (const c of commitments) expect(c).toMatch(/^05[0-9a-f]{40}[0-9a-f]{24}[0-9a-f]{8}(01|03|06|0b)[1-4][1-6]$/);
	});

	test("the whole chain is valid, the creator gets 100 immutable trees, and the baton still lands in the contract", () => {
		const known = new Map<string, Output>();
		coins.forEach((coin) => known.set(`${coin.txid}:${coin.vout}`, { lockingBytecode: lockingBytecode(aliceAddress), valueSatoshis: coin.satoshis }));
		const vm = createVirtualMachineBCH2023();
		for (const step of plan.steps) {
			const transaction = decodeTransaction(hexToBin(step.raw));
			if (typeof transaction === "string") throw new Error(transaction);
			const sourceOutputs = transaction.inputs.map((input) => known.get(`${binToHex(input.outpointTransactionHash)}:${input.outpointIndex}`)!);
			expect(vm.verify({ transaction, sourceOutputs })).toBe(true);
			transaction.outputs.forEach((output, vout) => known.set(`${step.txid}:${vout}`, output));
		}
		const genesis = decodeTransaction(hexToBin(plan.steps[2].raw));
		if (typeof genesis === "string") throw new Error(genesis);
		const creator = genesis.outputs.filter((o) => o.token?.nft?.capability === "none");
		expect(creator).toHaveLength(100);
		expect(creator.every((o) => binToHex(o.lockingBytecode) === binToHex(lockingBytecode(aliceAddress)) && o.valueSatoshis === CREATOR_NFT_SATOSHIS && binToHex(o.token!.category) === plan.forest.category)).toBe(true);
		expect(genesis.outputs.filter((o) => o.token?.nft?.capability === "minting")).toHaveLength(1);
		expect(binToHex(genesis.outputs[1].lockingBytecode)).toBe(plan.forest.lockingBytecode);
		expect(binToHex(genesis.outputs[0].lockingBytecode)).toBe(binToHex(lockingBytecode(charlieAddress)));
		// Standard size, fee about 1.1 sat per byte.
		const bytes = plan.steps[2].raw.length / 2;
		expect(bytes).toBeLessThan(100000);
		const change = genesis.outputs.at(-2)!.valueSatoshis;
		const fee = 300000n - STEP_FEE_SATOSHIS - DIRECTORY_FUNDING_SATOSHIS - IDENTITY_SATOSHIS - BATON_SATOSHIS - 100n * CREATOR_NFT_SATOSHIS - change;
		expect(Number(fee)).toBeGreaterThanOrEqual(bytes);
	});
});

describe("metadata updates", () => {
	const provider = new MockNetworkProvider();
	const coins = [randomUtxo({ satoshis: 40000n })];
	const plan = planDeployment(provider, aliceSigTemplate, aliceAddress, coins, { forest: forestArtifact, directory: directoryArtifact }, identity);
	const authority = { signer: charlieSigTemplate, address: charlieAddress };
	const funder = { signer: aliceSigTemplate, address: aliceAddress };

	test("the authority extends each authchain with a new publication; the deployer pays", () => {
		const known = new Map<string, Output>();
		coins.forEach((coin) => known.set(`${coin.txid}:${coin.vout}`, { lockingBytecode: lockingBytecode(aliceAddress), valueSatoshis: coin.satoshis }));
		for (const step of plan.steps) {
			const transaction = decodeTransaction(hexToBin(step.raw));
			if (typeof transaction === "string") throw new Error(transaction);
			transaction.outputs.forEach((output, vout) => known.set(`${step.txid}:${vout}`, output));
		}
		const update = `6a0442434d5220${"cd".repeat(32)}0b${Buffer.from("example.org", "utf8").toString("hex")}`;
		const forestGenesis = decodeTransaction(hexToBin(plan.steps[2].raw));
		if (typeof forestGenesis === "string") throw new Error(forestGenesis);
		const change = { txid: plan.steps[2].txid, vout: 2, satoshis: forestGenesis.outputs[2].valueSatoshis };
		const first = buildPublication(provider, authority, { txid: plan.steps[2].txid, vout: 0, satoshis: IDENTITY_SATOSHIS }, funder, [change], update, "forest-bcmr");
		const second = buildPublication(provider, authority, { txid: plan.steps[3].txid, vout: 0, satoshis: IDENTITY_SATOSHIS }, funder, [first.change], update, "directory-bcmr");
		const vm = createVirtualMachineBCH2023();
		for (const step of [first.step, second.step]) {
			const transaction = decodeTransaction(hexToBin(step.raw));
			if (typeof transaction === "string") throw new Error(transaction);
			const sourceOutputs = transaction.inputs.map((input) => known.get(`${binToHex(input.outpointTransactionHash)}:${input.outpointIndex}`)!);
			expect(vm.verify({ transaction, sourceOutputs })).toBe(true);
			// Input 0 spends the previous identity output; output 0 is the next one, still the authority's.
			expect(transaction.inputs[0].outpointIndex).toBe(0);
			expect(binToHex(transaction.outputs[0].lockingBytecode)).toBe(binToHex(lockingBytecode(charlieAddress)));
			expect(binToHex(transaction.outputs[1].lockingBytecode)).toBe(update);
			transaction.outputs.forEach((output, vout) => known.set(`${step.txid}:${vout}`, output));
		}
	});
});
