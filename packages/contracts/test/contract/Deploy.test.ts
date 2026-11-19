import { binToHex, cashAddressToLockingBytecode, createVirtualMachineBCH2023, decodeTransaction, hash160, hexToBin, type Output } from "@bitauth/libauth";
import { MockNetworkProvider, randomUtxo, TransactionBuilder } from "cashscript";
import forestArtifact from "../../artifacts/FocusForest.artifact.js";
import directoryArtifact from "../../artifacts/FocusDirectory.artifact.js";
import { BATON_SATOSHIS, contractAt, planDeployment, STEP_FEE_SATOSHIS } from "../../src/deploy/genesis.js";
import { decToHexWithEndianSwap } from "../../src/utils.js";
import { aliceAddress, aliceSigTemplate, bobPkh } from "../shared.js";

const lockingBytecode = (address: string) => {
	const decoded = cashAddressToLockingBytecode(address);
	if (typeof decoded === "string") throw new Error(decoded);
	return decoded.bytecode;
};

describe("one-time shared deployment", () => {
	const provider = new MockNetworkProvider();
	const coins = [randomUtxo({ satoshis: 6000n }), randomUtxo({ satoshis: 7000n })];
	const plan = planDeployment(provider, aliceSigTemplate, aliceAddress, coins, { forest: forestArtifact, directory: directoryArtifact });

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

	test("each contract gets its own category with exactly one minting baton locked inside it", () => {
		expect(plan.forest.category).toBe(plan.steps[0].txid);
		expect(plan.directory.category).toBe(plan.steps[2].txid);
		expect(plan.forest.category).not.toBe(plan.directory.category);
		for (const [deployment, step] of [[plan.forest, plan.steps[1]], [plan.directory, plan.steps[3]]] as const) {
			const transaction = decodeTransaction(hexToBin(step.raw));
			if (typeof transaction === "string") throw new Error(transaction);
			const minted = transaction.outputs.filter((output) => output.token);
			expect(minted).toHaveLength(1);
			expect(binToHex(minted[0].lockingBytecode)).toBe(deployment.lockingBytecode);
			expect(minted[0].token!.nft!.capability).toBe("minting");
			expect(minted[0].valueSatoshis).toBe(BATON_SATOSHIS);
			expect(deployment.lockingBytecode).toMatch(/^aa20[0-9a-f]{64}87$/);
		}
	});

	test("the deployer spends only the batons and four fees", () => {
		const last = decodeTransaction(hexToBin(plan.steps[3].raw));
		if (typeof last === "string") throw new Error(last);
		expect(last.outputs[1].valueSatoshis).toBe(13000n - 2n * BATON_SATOSHIS - 4n * STEP_FEE_SATOSHIS);
	});

	test("the deployed baton plants a tree", () => {
		const contract = contractAt(forestArtifact, plan.forest.category, provider);
		expect(contract.address).toBe(plan.forest.address);
		const baton = { txid: plan.steps[1].txid, vout: 0, satoshis: BATON_SATOSHIS, token: { category: plan.forest.category, amount: 0n, nft: { capability: "minting" as const, commitment: "" } } };
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

