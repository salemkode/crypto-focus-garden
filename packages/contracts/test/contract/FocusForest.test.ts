import { hash160, hash256, hexToBin } from "@bitauth/libauth";
import { Contract, MockNetworkProvider, randomUtxo, TransactionBuilder, type Utxo } from "cashscript";
import artifact from "../../artifacts/FocusForest.artifact.js";
import directoryArtifact from "../../artifacts/FocusDirectory.artifact.js";
import { addressToLockScript, decToHexWithEndianSwap, toTokenAddress } from "../../src/utils.js";
import { aliceAddress, alicePkh, aliceSigTemplate, bobAddress, bobPkh, bobSigTemplate, charlieAddress, charliePkh, charlieSigTemplate } from "../shared.js";

// A category whose bytes differ when reversed, so byte-order mistakes fail the tests.
const category = "0123456789abcdef".repeat(4);
// Contracts take the category in VM byte order: the reverse of its displayed hex.
const vmOrder = (displayed: string) => hexToBin(displayed).reverse();
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
function setup(addressType: "p2sh32" | "p2sh20" = "p2sh32") {
	const provider = new MockNetworkProvider();
	const contract = new Contract(artifact, [vmOrder(category)], { provider, addressType });
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
	function plant(tier: number, units: number, species = OAK, owner = bobPkh, plantedAt = BASE_TIME, addressType: "p2sh32" | "p2sh20" = "p2sh32") {
		const { provider, contract, funding, lockTree } = setup(addressType);
		const baton = randomUtxo({ satoshis: 1000n, token: { category, amount: 0n, nft: { capability: "minting", commitment: "" } } });
		provider.addUtxo(contract.address, baton);
		const builder = new TransactionBuilder({ provider })
			.addInput(baton, contract.unlock.plantTree(BigInt(plantedAt), BigInt(units), BigInt(tier), BigInt(species), owner))
			.addInput(funding, aliceSigTemplate.unlockP2PKH())
			.addOutput({ to: contract.tokenAddress, amount: 1000n, token: baton.token })
			.addOutput({ to: contract.tokenAddress, amount: 1000n, token: { category, amount: 0n, nft: { capability: "mutable", commitment: tree(tier, units, plantedAt, species, hex(owner)) } } })
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
	test("planting times are unsigned 32-bit seconds, including after January 2038", () => {
		for (const plantedAt of [500000000, 2147483647, 2147483648, 4294967295]) expect(() => plant(SPROUT, 1, OAK, bobPkh, plantedAt).builder.debug()).not.toThrow();
		expect(() => plant(SPROUT, 1, OAK, bobPkh, 499999999).builder.debug()).toThrow();
	});
	test("planting a time beyond 32 bits is rejected", () => {
		const { provider, contract, funding } = setup();
		const baton = randomUtxo({ satoshis: 1000n, token: { category, amount: 0n, nft: { capability: "minting", commitment: "" } } });
		provider.addUtxo(contract.address, baton);
		const tooLate = new TransactionBuilder({ provider })
			.addInput(baton, contract.unlock.plantTree(4294967296n, 1n, 1n, 1n, bobPkh))
			.addInput(funding, aliceSigTemplate.unlockP2PKH())
			.addOutput({ to: contract.tokenAddress, amount: 1000n, token: baton.token })
			.addOutput({ to: contract.tokenAddress, amount: 1000n, token: { category, amount: 0n, nft: { capability: "mutable", commitment: tree(SPROUT, 1, 0) } } })
			.addOutput({ to: aliceAddress, amount: 17000n });
		expect(() => tooLate.debug()).toThrow();
	});
	test("legacy P2SH20 deployments still enforce the same rules", () => {
		expect(() => plant(TREE, 3, OAK, bobPkh, BASE_TIME, "p2sh20").builder.debug()).not.toThrow();
		expect(() => plant(TREE, 2, OAK, bobPkh, BASE_TIME, "p2sh20").builder.debug()).toThrow();
	});
	test("planting cannot mint an extra token or move the baton", () => {
		const extraToken = plant(SPROUT, 1);
		extraToken.builder.addOutput({ to: toTokenAddress(aliceAddress), amount: 1000n, token: { category, amount: 0n, nft: { capability: "none", commitment: "00" } } });
		extraToken.builder.outputs[2].amount = 16000n;
		expect(() => extraToken.builder.debug()).toThrow();
		const movedBaton = plant(SPROUT, 1);
		movedBaton.builder.outputs[0].to = toTokenAddress(aliceAddress);
		expect(() => movedBaton.builder.debug()).toThrow();
		const downgraded = plant(SPROUT, 1);
		downgraded.builder.outputs[0].token = { category, amount: 0n, nft: { capability: "mutable", commitment: "" } };
		expect(() => downgraded.builder.debug()).toThrow();
	});
	test("planting cannot burn a tree from the contract", () => {
		const { builder, lockTree, contract } = plant(SPROUT, 1);
		builder.addInput(lockTree(tree(SPROUT, 1, 9)), contract.unlock.mergeTrees(), { sequence: 4194305 });
		expect(() => builder.debug()).toThrow(/at input 0 .* line 4[0-9]\./);
	});
});

describe("Focus Forest v5: claiming", () => {
	const payers = { alice: { address: aliceAddress, sig: aliceSigTemplate }, bob: { address: bobAddress, sig: bobSigTemplate }, charlie: { address: charlieAddress, sig: charlieSigTemplate } };
	function claim(commitment: string, sequence: number, to = bobAddress, payer: keyof typeof payers = "alice") {
		const { provider, contract, lockTree } = setup();
		const funding = randomUtxo({ satoshis: 20000n });
		provider.addUtxo(payers[payer].address, funding);
		const builder = new TransactionBuilder({ provider })
			.addInput(lockTree(commitment), contract.unlock.claimTree(), { sequence })
			.addInput(funding, payers[payer].sig.unlockP2PKH())
			.addOutput({ to: toTokenAddress(to), amount: 1000n, token: { category, amount: 0n, nft: { capability: "none", commitment } } })
			.addOutput({ to: payers[payer].address, amount: 18000n });
		return { builder, lockTree, contract };
	}
	test("only the owner or the planting app wallet can release a tree", () => {
		expect(() => claim(tree(SPROUT, 1, 1), 4194305, bobAddress, "alice").builder.debug()).not.toThrow();
		expect(() => claim(tree(SPROUT, 1, 1), 4194305, bobAddress, "bob").builder.debug()).not.toThrow();
		expect(() => claim(tree(SPROUT, 1, 1), 4194305, bobAddress, "charlie").builder.debug()).toThrow();
	});
	test("a release needs a separate signed, token-free P2PKH input and cannot send change to the contract", () => {
		const { provider, contract, lockTree } = setup();
		const alone = new TransactionBuilder({ provider })
			.addInput(lockTree(tree(SPROUT, 1, 1)), contract.unlock.claimTree(), { sequence: 4194305 })
			.addOutput({ to: toTokenAddress(bobAddress), amount: 1000n, token: { category, amount: 0n, nft: { capability: "none", commitment: tree(SPROUT, 1, 1) } } });
		expect(() => alone.debug()).toThrow();
		const tokenFunding = randomUtxo({ satoshis: 20000n, token: { category: "ee".repeat(32), amount: 5n } });
		provider.addUtxo(aliceAddress, tokenFunding);
		const tokenPayer = new TransactionBuilder({ provider })
			.addInput(lockTree(tree(SPROUT, 1, 2)), contract.unlock.claimTree(), { sequence: 4194305 })
			.addInput(tokenFunding, aliceSigTemplate.unlockP2PKH())
			.addOutput({ to: toTokenAddress(bobAddress), amount: 1000n, token: { category, amount: 0n, nft: { capability: "none", commitment: tree(SPROUT, 1, 2) } } })
			.addOutput({ to: toTokenAddress(aliceAddress), amount: 18000n, token: { category: "ee".repeat(32), amount: 5n } });
		expect(() => tokenPayer.debug()).toThrow(/tx\.inputs\[1\]\.tokenCategory == 0x/);
		const change = claim(tree(SPROUT, 1, 1), 4194305);
		change.builder.outputs[1].to = change.contract.address;
		expect(() => change.builder.debug()).toThrow();
	});
	test("the released tree is immutable and keeps its full deposit", () => {
		const mutable = claim(tree(SPROUT, 1, 1), 4194305);
		mutable.builder.outputs[0].token = { category, amount: 0n, nft: { capability: "mutable", commitment: tree(SPROUT, 1, 1) } };
		expect(() => mutable.builder.debug()).toThrow();
		const skimmed = claim(tree(SPROUT, 1, 1), 4194305);
		skimmed.builder.outputs[0].amount = 900n;
		skimmed.builder.outputs[1].amount = 18100n;
		expect(() => skimmed.builder.debug()).toThrow();
	});
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
			.addOutput({ to: options.outputTo === "bob" ? toTokenAddress(bobAddress) : contract.tokenAddress, amount: BigInt(parts.length) * 1000n, token: { category, amount: 0n, nft: { capability: "mutable", commitment: result } } })
			.addOutput({ to: bob ? bobAddress : aliceAddress, amount: 20000n - 2000n });
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
	test("a merge keeps every ingredient's deposit with the merged tree", () => {
		const skimmed = merge(sprouts, merged(sprouts, TREE));
		skimmed.outputs[0].amount = 1000n;
		skimmed.outputs[1].amount = 20000n;
		expect(() => skimmed.debug()).toThrow();
		const extraToken = merge(sprouts, merged(sprouts, TREE));
		extraToken.outputs[1].amount = 17000n;
		extraToken.addOutput({ to: toTokenAddress(aliceAddress), amount: 1000n, token: { category, amount: 0n, nft: { capability: "none", commitment: "00" } } });
		expect(() => extraToken.debug()).toThrow();
	});
	test("a merge with unequal deposits keeps their exact sum, never more or less", () => {
		const { provider, contract, funding } = setup();
		const build = (amount: bigint) => {
			const builder = new TransactionBuilder({ provider });
			[1500n, 1000n, 2500n].forEach((satoshis, index) => {
				const utxo = randomUtxo({ satoshis, token: { category, amount: 0n, nft: { capability: "mutable", commitment: sprouts[index] } } });
				provider.addUtxo(contract.address, utxo);
				builder.addInput(utxo, contract.unlock.mergeTrees(), { sequence: 4194305 });
			});
			return builder.addInput(funding, aliceSigTemplate.unlockP2PKH())
				.addOutput({ to: contract.tokenAddress, amount, token: { category, amount: 0n, nft: { capability: "mutable", commitment: merged(sprouts, TREE) } } })
				.addOutput({ to: aliceAddress, amount: 20000n + 5000n - amount - 2000n });
		};
		expect(() => build(5000n).debug()).not.toThrow();
		expect(() => build(4999n).debug()).toThrow();
		expect(() => build(5001n).debug()).toThrow();
	});
	test("the merged tree stays in the contract with its lineage stamp", () => {
		expect(() => merge(sprouts, merged(sprouts, TREE), { outputTo: "bob" }).debug()).toThrow();
		const forged = `${merged(sprouts, TREE).slice(0, 66)}00000000${merged(sprouts, TREE).slice(74)}`;
		expect(() => merge(sprouts, forged).debug()).toThrow();
	});
});

describe("Focus Directory: everyone can be found and tipped by name", () => {
	const directoryCategory = "fedcba9876543210".repeat(4);
	function register(name: string, options: { holder?: Uint8Array; payer?: "alice" | "bob"; to?: string; commitment?: string; capability?: "none" | "mutable" } = {}) {
		const provider = new MockNetworkProvider();
		const directory = new Contract(directoryArtifact, [vmOrder(directoryCategory)], { provider });
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
			.addOutput({ to: toTokenAddress(options.to ?? aliceAddress), amount: 1000n, token: { category: directoryCategory, amount: 0n, nft: { capability: options.capability ?? "none", commitment: options.commitment ?? `01${nameHex}` } } })
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
	test("cards are immutable so their names always passed the directory rules", () => {
		expect(() => register("Salem", { capability: "mutable" }).debug()).toThrow();
	});
	test("registration cannot strand BCH at the directory contract", () => {
		const stray = register("Salem");
		stray.outputs[2].amount = 6000n;
		stray.addOutput({ to: stray.outputs[0].to, amount: 1000n });
		expect(() => stray.debug()).toThrow();
	});
	test("the card must carry exactly the registered name", () => {
		expect(() => register("Salem", { commitment: `01${Buffer.from("Satoshi").toString("hex")}` }).debug()).toThrow();
	});
});
