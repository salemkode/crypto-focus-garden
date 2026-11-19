import { Contract, MockNetworkProvider, randomUtxo, TransactionBuilder } from "cashscript";
import artifact from "../../artifacts/PomodoroRewards.artifact.js";
import { addressToLockScript, decToHexWithEndianSwap, toTokenAddress } from "../../src/utils.js";
import { aliceAddress, aliceSigTemplate, bobAddress } from "../shared.js";

const category = "ab".repeat(32);
const owner = Buffer.from(addressToLockScript(aliceAddress)).toString("hex");
const commitment = `03${owner}${decToHexWithEndianSwap(1800000000, 4)}03`;

function fixture(sessionCommitment = commitment) {
	const provider = new MockNetworkProvider();
	const contract = new Contract(artifact, [category], { provider });
	const locked = randomUtxo({ satoshis: 1000n, token: { category, amount: 0n, nft: { capability: "mutable", commitment: sessionCommitment } } });
	provider.addUtxo(contract.address, locked);
	const funding = randomUtxo({ satoshis: 10000n });
	provider.addUtxo(aliceAddress, funding);
	return { provider, contract, locked, funding };
}
function claim(sequence = 4194307, to = aliceAddress, outputCommitment = commitment) {
	const { provider, contract, locked, funding } = fixture();
	return new TransactionBuilder({ provider })
		.addInput(locked, contract.unlock.claimReward(), { sequence })
		.addInput(funding, aliceSigTemplate.unlockP2PKH())
		.addOutput({ to: toTokenAddress(to), amount: 1000n, token: { category, amount: 0n, nft: { capability: "none", commitment: outputCommitment } } })
		.addOutput({ to: aliceAddress, amount: 9000n });
}
describe("Pomodoro v3 covenant", () => {
	test("accepts the required time-based sequence", () => { expect(() => claim().debug()).not.toThrow(); });
	test.each([4194304, 4194306, 3, 0xffffffff])("rejects early, height-based or disabled sequence %i", sequence => {
		expect(() => claim(sequence).debug()).toThrow();
	});
	test("cannot redirect the reward", () => { expect(() => claim(4194307, bobAddress).debug()).toThrow(); });
	test("cannot rewrite reward history", () => { expect(() => claim(4194307, aliceAddress, "00").debug()).toThrow(); });
	test("internal funding cannot redirect an external wallet's reward", () => {
		const externalScript = Buffer.from(addressToLockScript(bobAddress)).toString("hex");
		const externalCommitment = `03${externalScript}${commitment.slice(52)}`;
		const { provider, contract, locked, funding } = fixture(externalCommitment);
		const builder = new TransactionBuilder({ provider })
			.addInput(locked, contract.unlock.claimReward(), { sequence: 4194307 })
			.addInput(funding, aliceSigTemplate.unlockP2PKH())
			.addOutput({ to: toTokenAddress(bobAddress), amount: 1000n, token: { category, amount: 0n, nft: { capability: "none", commitment: externalCommitment } } })
			.addOutput({ to: aliceAddress, amount: 9000n });
		expect(() => builder.debug()).not.toThrow();
		// Return unused transaction credit to Alice, but never the reward.
		builder.outputs[0].to = toTokenAddress(aliceAddress);
		expect(() => builder.debug()).toThrow();
	});
	test("a long session cannot use the short session sequence", () => {
		const longCommitment = `${commitment.slice(0, -2)}06`;
		const { provider, contract, locked, funding } = fixture(longCommitment);
		const builder = new TransactionBuilder({ provider })
			.addInput(locked, contract.unlock.claimReward(), { sequence: 4194307 })
			.addInput(funding, aliceSigTemplate.unlockP2PKH())
			.addOutput({ to: toTokenAddress(aliceAddress), amount: 1000n, token: { category, amount: 0n, nft: { capability: "none", commitment: longCommitment } } })
			.addOutput({ to: aliceAddress, amount: 9000n });
		expect(() => builder.debug()).toThrow();
		builder.inputs[0].options = { sequence: 4194310 };
		expect(() => builder.debug()).not.toThrow();
	});
	test.each([[2147483648, true], [4294967295, true], [4294967296, false], [499999999, false]])("planting time %i accepted: %s", (plantedAt, accepted) => {
		const { provider, contract, funding } = fixture();
		const baton = randomUtxo({ satoshis: 1000n, token: { category, amount: 0n, nft: { capability: "minting", commitment: "" } } });
		provider.addUtxo(contract.address, baton);
		const bob = Buffer.from(addressToLockScript(bobAddress)).toString("hex");
		const stamp = Number(plantedAt) <= 4294967295 ? decToHexWithEndianSwap(Number(plantedAt), 4) : "00000000";
		const builder = new TransactionBuilder({ provider })
			.addInput(baton, contract.unlock.mintAndLockReward(BigInt(plantedAt), 3n, addressToLockScript(bobAddress).slice(3, 23)))
			.addInput(funding, aliceSigTemplate.unlockP2PKH())
			.addOutput({ to: contract.tokenAddress, amount: 1000n, token: baton.token })
			.addOutput({ to: contract.tokenAddress, amount: 1000n, token: { category, amount: 0n, nft: { capability: "mutable", commitment: `03${bob}${stamp}03` } } })
			.addOutput({ to: aliceAddress, amount: 8000n });
		if (accepted) expect(() => builder.debug()).not.toThrow();
		else expect(() => builder.debug()).toThrow();
	});
	test.each([3, 6])("mints a locked reward for %i time units and preserves the baton", units => {
		const { provider, contract, funding } = fixture();
		const baton = randomUtxo({ satoshis: 1000n, token: { category, amount: 0n, nft: { capability: "minting", commitment: "" } } });
		provider.addUtxo(contract.address, baton);
		const builder = new TransactionBuilder({ provider })
			.addInput(baton, contract.unlock.mintAndLockReward(1800000000n, BigInt(units), addressToLockScript(bobAddress).slice(3, 23)))
			.addInput(funding, aliceSigTemplate.unlockP2PKH())
			.addOutput({ to: contract.tokenAddress, amount: 1000n, token: baton.token })
			.addOutput({ to: contract.tokenAddress, amount: 1000n, token: { category, amount: 0n, nft: { capability: "mutable", commitment: `03${Buffer.from(addressToLockScript(bobAddress)).toString("hex")}${commitment.slice(52, -2)}${decToHexWithEndianSwap(units, 1)}` } } })
			.addOutput({ to: aliceAddress, amount: 8000n });
		expect(() => builder.debug()).not.toThrow();
		builder.outputs[0].amount = 900n;
		expect(() => builder.debug()).toThrow();
	});
});
