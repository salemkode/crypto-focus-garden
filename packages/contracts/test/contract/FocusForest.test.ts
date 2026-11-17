import { hash160, hash256 } from "@bitauth/libauth";
import { Contract, MockNetworkProvider, randomUtxo, TransactionBuilder, type Utxo } from "cashscript";
import artifact from "../../artifacts/FocusForest.artifact.js";
import directoryArtifact from "../../artifacts/FocusDirectory.artifact.js";
import { addressToLockScript, decToHexWithEndianSwap, toTokenAddress } from "../../src/utils.js";
import { aliceAddress, alicePkh, aliceSigTemplate, bobAddress, bobPkh, bobSigTemplate, charliePkh } from "../shared.js";

const category = "ab".repeat(32);
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
// Alice's on-device app wallet plants and pays; Bob's external wallet owns the trees.
const planterTag = hex(hash160(addressToLockScript(aliceAddress)).slice(0, 12));
const bobTag = hex(hash160(addressToLockScript(bobAddress)).slice(0, 12));
const BASE_TIME = 1800000000;
const SPROUT = 1, TREE = 2, BIG = 3, HOUSE = 4;
const OAK = 1, CHERRY = 2;

function tree(tier: number, units: number, stamp: number, species = OAK, owner = hex(bobPkh), tag = planterTag) {
	return `05${owner}${tag}${decToHexWithEndianSwap(stamp, 4)}${decToHexWithEndianSwap(units, 1)}${decToHexWithEndianSwap(tier * 16 + species, 1)}`;
}
function merged(inputs: string[], tier: number, species = OAK) {
	const lineage = hex(hash256(Buffer.from(inputs.join(""), "hex")).slice(0, 4));
	return `${inputs[0].slice(0, 66)}${lineage}00${decToHexWithEndianSwap(tier * 16 + species, 1)}`;
}
function setup() {
	const provider = new MockNetworkProvider();
	const contract = new Contract(artifact, [category], { provider });
	const funding = randomUtxo({ satoshis: 20000n });
	provider.addUtxo(aliceAddress, funding);
	const lockTree = (commitment: string): Utxo => {
		const utxo = randomUtxo({ satoshis: 1000n, token: { category, amount: 0n, nft: { capability: "mutable", commitment } } });
		provider.addUtxo(contract.address, utxo);
		return utxo;
	};
	return { provider, contract, funding, lockTree };
}

describe("Focus Forest v5: more focus grows a bigger reward", () => {
	function plant(tier: number, units: number, species = OAK, owner = bobPkh) {
		const { provider, contract, funding, lockTree } = setup();
		const baton = randomUtxo({ satoshis: 1000n, token: { category, amount: 0n, nft: { capability: "minting", commitment: "" } } });
		provider.addUtxo(contract.address, baton);
		const builder = new TransactionBuilder({ provider })
			.addInput(baton, contract.unlock.plantTree(BigInt(BASE_TIME), BigInt(units), BigInt(tier), BigInt(species), owner))
			.addInput(funding, aliceSigTemplate.unlockP2PKH())
			.addOutput({ to: contract.tokenAddress, amount: 1000n, token: baton.token })
			.addOutput({ to: contract.tokenAddress, amount: 1000n, token: { category, amount: 0n, nft: { capability: "mutable", commitment: tree(tier, units, BASE_TIME, species, hex(owner)) } } })
			.addOutput({ to: aliceAddress, amount: 17000n });
		return { builder, lockTree, contract };
	}
	test.each([[SPROUT, 1], [SPROUT, 3], [TREE, 3], [TREE, 6], [BIG, 6], [BIG, 11], [HOUSE, 11], [HOUSE, 24]])("tier %i may be planted with %i lock units", (tier, units) => {
		expect(() => plant(tier, units).builder.debug()).not.toThrow();
	});
	test.each([[TREE, 2], [BIG, 5], [HOUSE, 10], [5, 24], [0, 3], [SPROUT, 0], [SPROUT, 25]])("tier %i with %i lock units is rejected", (tier, units) => {
		expect(() => plant(tier, units).builder.debug()).toThrow();
	});
	test("every species style is accepted and recorded; unknown styles are not", () => {
		for (const species of [1, 2, 3, 4, 5, 6]) expect(() => plant(TREE, 3, species).builder.debug()).not.toThrow();
		expect(() => plant(TREE, 3, 7).builder.debug()).toThrow();
		expect(() => plant(TREE, 3, 0).builder.debug()).toThrow();
	});
	test("the paying app wallet cannot own the reward", () => {
		expect(() => plant(SPROUT, 1, OAK, alicePkh).builder.debug()).toThrow();
	});
	test("the minted commitment must record the real tier and planter", () => {
		const forgedTier = plant(SPROUT, 1);
		forgedTier.builder.outputs[1].token!.nft!.commitment = tree(HOUSE, 1, BASE_TIME);
		expect(() => forgedTier.builder.debug()).toThrow();
		const forgedTag = plant(SPROUT, 1);
		forgedTag.builder.outputs[1].token!.nft!.commitment = tree(SPROUT, 1, BASE_TIME, OAK, hex(bobPkh), bobTag);
		expect(() => forgedTag.builder.debug()).toThrow();
	});
	test("planting cannot burn a tree from the contract", () => {
		const { builder, lockTree, contract } = plant(SPROUT, 1);
		builder.addInput(lockTree(tree(SPROUT, 1, 9)), contract.unlock.mergeTrees(), { sequence: 4194305 });
		expect(() => builder.debug()).toThrow(/at input 0 .* line (2\d|3\d)\./);
	});
});

describe("Focus Forest v5: claiming", () => {
	function claim(commitment: string, sequence: number, to = bobAddress) {
		const { provider, contract, funding, lockTree } = setup();
		const builder = new TransactionBuilder({ provider })
			.addInput(lockTree(commitment), contract.unlock.claimTree(), { sequence })
			.addInput(funding, aliceSigTemplate.unlockP2PKH())
			.addOutput({ to: toTokenAddress(to), amount: 1000n, token: { category, amount: 0n, nft: { capability: "none", commitment } } })
			.addOutput({ to: aliceAddress, amount: 18000n });
		return { builder, lockTree, contract };
	}
	test("a matured house goes only to its owner", () => {
		expect(() => claim(tree(HOUSE, 11, 1), 4194304 + 11).builder.debug()).not.toThrow();
		expect(() => claim(tree(HOUSE, 11, 1), 4194304 + 10).builder.debug()).toThrow();
		expect(() => claim(tree(HOUSE, 11, 1), 4194304 + 11, aliceAddress).builder.debug()).toThrow();
	});
	test("a claim cannot burn other matured trees", () => {
		const { builder, lockTree, contract } = claim(tree(SPROUT, 1, 1), 4194305);
		builder.addInput(lockTree(tree(SPROUT, 1, 5)), contract.unlock.mergeTrees(), { sequence: 4194305 });
		expect(() => builder.debug()).toThrow(/at input 0 .* line (1[2-9]\d)/);
	});
	test("a merged tree can be claimed without a further lock", () => {
		const sprouts = [1, 2, 3].map((stamp) => tree(SPROUT, 1, stamp));
		expect(() => claim(merged(sprouts, TREE), 4194304).builder.debug()).not.toThrow();
	});
});

describe("Focus Forest v5: merges keep the value of focus", () => {
	function merge(parts: string[], result: string, options: { sequences?: number[]; signer?: "alice" | "bob"; outputTo?: "contract" | "bob" } = {}) {
		const { provider, contract, funding, lockTree } = setup();
		const bobFunding = randomUtxo({ satoshis: 20000n });
		provider.addUtxo(bobAddress, bobFunding);
		const builder = new TransactionBuilder({ provider });
		parts.forEach((commitment, index) => {
			const units = parseInt(commitment.slice(-4, -2), 16);
			builder.addInput(lockTree(commitment), contract.unlock.mergeTrees(), { sequence: options.sequences?.[index] ?? 4194304 + units });
		});
		const bob = options.signer === "bob";
		builder.addInput(bob ? bobFunding : funding, (bob ? bobSigTemplate : aliceSigTemplate).unlockP2PKH())
			.addOutput({ to: options.outputTo === "bob" ? toTokenAddress(bobAddress) : contract.tokenAddress, amount: 1000n, token: { category, amount: 0n, nft: { capability: "mutable", commitment: result } } })
			.addOutput({ to: bob ? bobAddress : aliceAddress, amount: 20000n + BigInt(parts.length - 1) * 1000n - 2000n });
		return builder;
	}
	const sprouts = [1, 2, 3].map((stamp) => tree(SPROUT, 1, stamp));
	const trees = [tree(TREE, 3, 1, CHERRY), tree(TREE, 6, 2)];
	const bigTrees = [tree(BIG, 6, 1), tree(BIG, 11, 2)];

	test("3 Sprouts become a Tree", () => { expect(() => merge(sprouts, merged(sprouts, TREE)).debug()).not.toThrow(); });
	test("2 Trees become a Big Tree that keeps the first tree's style", () => {
		expect(() => merge(trees, merged(trees, BIG, CHERRY)).debug()).not.toThrow();
		expect(() => merge(trees, merged(trees, BIG, OAK)).debug()).toThrow();
	});
	test("2 Big Trees become a House", () => { expect(() => merge(bigTrees, merged(bigTrees, HOUSE)).debug()).not.toThrow(); });
	test("merged trees merge again up the ladder", () => {
		const grown = [merged(sprouts, TREE), merged([tree(SPROUT, 1, 7), tree(SPROUT, 1, 8), tree(SPROUT, 1, 9)], TREE)];
		expect(() => merge(grown, merged(grown, BIG)).debug()).not.toThrow();
	});
	test("wrong counts, mixed tiers, houses and skipped tiers are rejected", () => {
		expect(() => merge(sprouts.slice(0, 2), merged(sprouts.slice(0, 2), TREE)).debug()).toThrow();
		const mixed = [sprouts[0], sprouts[1], tree(TREE, 3, 4)];
		expect(() => merge(mixed, merged(mixed, TREE)).debug()).toThrow();
		const houses = [tree(HOUSE, 11, 1), tree(HOUSE, 11, 2)];
		expect(() => merge(houses, merged(houses, 5)).debug()).toThrow();
		expect(() => merge(sprouts, merged(sprouts, BIG)).debug()).toThrow();
	});
	test("every tree must have finished its own time lock", () => {
		expect(() => merge(bigTrees, merged(bigTrees, HOUSE), { sequences: [4194310, 4194314] }).debug()).toThrow();
	});
	test("trees of different owners or planters cannot be merged", () => {
		const mixedOwner = [sprouts[0], sprouts[1], tree(SPROUT, 1, 9, OAK, hex(charliePkh))];
		expect(() => merge(mixedOwner, merged(mixedOwner, TREE)).debug()).toThrow();
		const mixedPlanter = [sprouts[0], sprouts[1], tree(SPROUT, 1, 9, OAK, hex(bobPkh), bobTag)];
		expect(() => merge(mixedPlanter, merged(mixedPlanter, TREE)).debug()).toThrow();
	});
	test("only the planting app wallet can authorize a merge", () => {
		expect(() => merge(sprouts, merged(sprouts, TREE), { signer: "bob" }).debug()).toThrow();
	});
	test("the merged tree stays in the contract with its lineage stamp", () => {
		expect(() => merge(sprouts, merged(sprouts, TREE), { outputTo: "bob" }).debug()).toThrow();
		const forged = `${merged(sprouts, TREE).slice(0, 66)}00000000${merged(sprouts, TREE).slice(74)}`;
		expect(() => merge(sprouts, forged).debug()).toThrow();
	});
});

describe("Focus Directory: everyone can be found and tipped by name", () => {
	const directoryCategory = "cd".repeat(32);
	function register(name: string, options: { holder?: Uint8Array; payer?: "alice" | "bob"; to?: string; commitment?: string } = {}) {
		const provider = new MockNetworkProvider();
		const directory = new Contract(directoryArtifact, [directoryCategory], { provider });
		const baton = randomUtxo({ satoshis: 1000n, token: { category: directoryCategory, amount: 0n, nft: { capability: "minting", commitment: "" } } });
		provider.addUtxo(directory.address, baton);
		const payer = options.payer === "bob" ? { address: bobAddress, sig: bobSigTemplate } : { address: aliceAddress, sig: aliceSigTemplate };
		const funding = randomUtxo({ satoshis: 10000n });
		provider.addUtxo(payer.address, funding);
		const nameHex = Buffer.from(name, "utf8").toString("hex");
		return new TransactionBuilder({ provider })
			.addInput(baton, directory.unlock.register(options.holder ?? alicePkh, Buffer.from(name, "utf8")))
			.addInput(funding, payer.sig.unlockP2PKH())
			.addOutput({ to: directory.tokenAddress, amount: 1000n, token: baton.token })
			.addOutput({ to: toTokenAddress(options.to ?? aliceAddress), amount: 1000n, token: { category: directoryCategory, amount: 0n, nft: { capability: "mutable", commitment: options.commitment ?? `01${nameHex}` } } })
			.addOutput({ to: payer.address, amount: 7000n });
	}
	test("a member mints their own profile card", () => {
		expect(() => register("Salem").debug()).not.toThrow();
		expect(() => register("فوكس غاردن").debug()).not.toThrow();
	});
	test("names must be 3 to 32 bytes", () => {
		expect(() => register("ab").debug()).toThrow();
		expect(() => register("x".repeat(33)).debug()).toThrow();
	});
	test("nobody can register a card for someone else's wallet", () => {
		expect(() => register("Alice", { holder: alicePkh, payer: "bob" }).debug()).toThrow();
		expect(() => register("Alice", { to: bobAddress }).debug()).toThrow();
		expect(() => register("Alice", { holder: bobPkh, payer: "bob", to: aliceAddress }).debug()).toThrow();
	});
	test("the card must carry exactly the registered name", () => {
		expect(() => register("Salem", { commitment: `01${Buffer.from("Satoshi").toString("hex")}` }).debug()).toThrow();
	});
});
