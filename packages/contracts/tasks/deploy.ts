/**
 * Deploy the shared Focus Forest and Focus Directory contracts through public Electrum servers.
 *
 *   bun run deploy init      create a dedicated deployer wallet (key stays in ~/.focus-garden)
 *   bun run deploy status    show the deployer balance and the deployment record
 *   bun run deploy deploy    mint both minting batons into their contracts (once)
 *   bun run deploy publish   publish a new BCMR metadata revision listing every tree minted so far
 *                            (run it again to resume; host the written registry first, as for deploy)
 *
 * Options: --network chipnet (default) | mainnet. Mainnet also requires FOCUS_GARDEN_CONFIRM_MAINNET=yes.
 *          --site <https origin> publishes the BCMR metadata registry for both categories in their
 *          genesis transactions (mainnet default: https://focus.salemkode.com). The registry text is
 *          written to packages/landing/public/.well-known/ and must be live at that site, byte for
 *          byte, before anything is broadcast; deploy the landing page first.
 *          --creator-nfts <n> mints n creator trees in the Focus Forest genesis transaction itself
 *          (no planting, no time lock), sent to --creator-address (default: the deployer wallet).
 * The deployment record (public data only) is written to packages/contracts/deployments/<network>.json
 * before anything is broadcast; a rerun resends the same signed bytes and never builds a second set.
 */
import { binToHex, decodeTransaction, encodeCashAddress, encodePrivateKeyWif, generatePrivateKey, hash160, hexToBin } from "@bitauth/libauth";
import { electrumScriptHash } from "@focus-garden/protocol/leaderboard";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ElectrumNetworkProvider, SignatureTemplate } from "cashscript";
import forestArtifact from "../artifacts/FocusForest.artifact.js";
import directoryArtifact from "../artifacts/FocusDirectory.artifact.js";
import { BCMR_WELL_KNOWN_PATH, bcmrPublicationBytecode, buildRegistry, registryContentHash, serializeRegistry } from "@focus-garden/protocol/bcmr";
import { buildPublication, creatorCommitments, DIRECTORY_FUNDING_SATOSHIS, planDeployment, type Step } from "../src/deploy/genesis.js";

type NetworkName = "chipnet" | "mainnet";
const args = process.argv.slice(2);
const command = args.find((arg) => !arg.startsWith("--")) ?? "status";
const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const creatorCount = Number(option("--creator-nfts") ?? 0);
if (!Number.isInteger(creatorCount) || creatorCount < 0 || creatorCount > 500) fail("--creator-nfts takes a whole number from 0 to 500.");
const networkIndex = args.indexOf("--network");
const network = (networkIndex >= 0 ? args[networkIndex + 1] : "chipnet") as NetworkName;
if (network !== "chipnet" && network !== "mainnet") fail("Use --network chipnet or --network mainnet.");
if (network === "mainnet" && process.env.FOCUS_GARDEN_CONFIRM_MAINNET !== "yes") fail("Mainnet deploys real money. Set FOCUS_GARDEN_CONFIRM_MAINNET=yes to continue.");

const prefix = network === "mainnet" ? "bitcoincash" : "bchtest";
const explorer = network === "mainnet" ? "https://blockchair.com/bitcoin-cash/transaction/" : "https://chipnet.imaginary.cash/tx/";
const keyDirectory = path.join(os.homedir(), ".focus-garden");
const keyFile = path.join(keyDirectory, `deployer-${network}.json`);
// Holds each genesis output 0 (the BCMR authchain), so only this key can change the collections' metadata.
const authorityFile = path.join(keyDirectory, `authority-${network}.json`);
const site = option("--site") ?? (network === "mainnet" ? "https://focus.salemkode.com" : undefined);
const registryFile = new URL(`../../landing/public${BCMR_WELL_KNOWN_PATH}`, import.meta.url);
const recordFile = new URL(`../deployments/${network}.json`, import.meta.url);
const MINIMUM_SATOSHIS = 10000n;

interface Record {
	schema: "focus-garden-deployment-v1";
	network: NetworkName;
	deployer: string;
	createdAt: string;
	artifacts: { forest: string; directory: string };
	forest: ReturnType<typeof planDeployment>["forest"];
	creator?: { address: string; count: number; commitments: string[] };
	directory: ReturnType<typeof planDeployment>["directory"];
	authority: string;
	registry?: { uri: string; contentHash: string; revision?: string; trees?: number };
	/** Later BCMR revisions; each extends both authchains from the identity outputs. */
	publications?: { revision: string; uri: string; contentHash: string; trees: number; steps: (Step & { state: "signed" | "sent" })[] }[];
	steps: (Step & { state: "signed" | "sent" })[];
}

function fail(message: string): never {
	console.error(`\n✖ ${message}\n`);
	process.exit(1);
}
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const readRecord = (): Record | null => (fs.existsSync(recordFile) ? JSON.parse(fs.readFileSync(recordFile, "utf8")) : null);
const writeRecord = (record: Record) => {
	fs.mkdirSync(new URL("../deployments/", import.meta.url), { recursive: true });
	fs.writeFileSync(recordFile, `${JSON.stringify(record, null, "\t")}\n`);
};

function loadKey(file: string, label: string) {
	if (!fs.existsSync(file)) fail(`No ${label} key yet. Run: bun run deploy init --network ${network}`);
	const { wif } = JSON.parse(fs.readFileSync(file, "utf8")) as { wif: string };
	const signer = new SignatureTemplate(wif);
	const result = encodeCashAddress({ prefix, type: "p2pkh", payload: hash160(signer.getPublicKey()) });
	const address = typeof result === "string" ? result : result.address;
	return { signer, address };
}
const loadDeployer = () => loadKey(keyFile, "deployer");
const loadAuthority = () => loadKey(authorityFile, "metadata authority");

function createKey(file: string, label: string) {
	if (fs.existsSync(file)) return console.log(`A ${label} key already exists (${file}); it was not replaced.`);
	const key = generatePrivateKey(() => crypto.getRandomValues(new Uint8Array(32)));
	fs.mkdirSync(keyDirectory, { recursive: true, mode: 0o700 });
	fs.writeFileSync(file, JSON.stringify({ network, wif: encodePrivateKeyWif(key, network === "mainnet" ? "mainnet" : "testnet"), createdAt: new Date().toISOString() }), { mode: 0o600, flag: "wx" });
	console.log(`Created a dedicated ${label} key in ${file} (private, never commit it).`);
}

async function init() {
	createKey(keyFile, "deployer");
	createKey(authorityFile, "metadata authority");
	const { address } = loadDeployer();
	console.log(`\nSend at least ${MINIMUM_SATOSHIS} sats to:\n  ${address}`);
	if (network === "chipnet") console.log("Free Chipnet coins: https://tbch.googol.cash (choose chipnet)");
	console.log(`Then run: bun run deploy deploy --network ${network}\n`);
}

async function status(provider: ElectrumNetworkProvider) {
	const { address } = loadDeployer();
	const coins = await provider.getUtxos(address);
	const plain = coins.filter((coin) => !coin.token).reduce((sum, coin) => sum + coin.satoshis, 0n);
	console.log(`Network:  ${network}\nDeployer: ${address}\nBalance:  ${plain} sats in ${coins.filter((coin) => !coin.token).length} coin(s)`);
	const record = readRecord();
	if (!record) return console.log(`Deployment: not started${plain >= MINIMUM_SATOSHIS ? " (ready to deploy)" : ` (needs ${MINIMUM_SATOSHIS} sats)`}`);
	record.steps.forEach((step) => console.log(`  ${step.state === "sent" ? "✔" : "…"} ${step.name.padEnd(18)} ${explorer}${step.txid}`));
	printResult(record);
}

async function deploy(provider: ElectrumNetworkProvider) {
	const { signer, address } = loadDeployer();
	let record = readRecord();
	if (record && record.deployer !== address) fail(`${recordFile.pathname} belongs to another deployer wallet.`);
	if (!record) {
		const authority = loadAuthority().address;
		const coins = (await provider.getUtxos(address)).filter((coin) => !coin.token);
		const total = coins.reduce((sum, coin) => sum + coin.satoshis, 0n);
		const needed = MINIMUM_SATOSHIS + DIRECTORY_FUNDING_SATOSHIS + BigInt(creatorCount) * 1200n;
		if (total < needed) fail(`The deployer has ${total} sats; send at least ${needed} to ${address}.`);
		const creatorAddress = option("--creator-address") ?? address;
		const creator = creatorCount ? { address: creatorAddress, commitments: creatorCommitments(creatorAddress, creatorCount, Math.floor(Date.now() / 1000)) } : undefined;
		const createdAt = new Date().toISOString();
		const publish = site
			? (categories: { forest: string; directory: string }) => {
					const text = serializeRegistry(buildRegistry({ forestCategory: categories.forest, directoryCategory: categories.directory, site, revision: createdAt }));
					fs.mkdirSync(new URL(".", registryFile), { recursive: true });
					fs.writeFileSync(registryFile, text);
					const contentHash = registryContentHash(text);
					const uri = `${site}${BCMR_WELL_KNOWN_PATH}`;
					return { bytecode: bcmrPublicationBytecode(contentHash, uri), contentHash, uri };
				}
			: undefined;
		const plan = planDeployment(provider, signer, address, coins, { forest: forestArtifact, directory: directoryArtifact }, { authority, publish }, creator);
		record = {
			schema: "focus-garden-deployment-v1", network, deployer: address, createdAt,
			artifacts: { forest: sha256(forestArtifact), directory: sha256(directoryArtifact) },
			forest: plan.forest, ...(creator ? { creator: { address: creator.address, count: creatorCount, commitments: creator.commitments } } : {}),
			directory: plan.directory, authority,
			...(plan.publication ? { registry: { uri: plan.publication.uri, contentHash: plan.publication.contentHash } } : {}),
			steps: plan.steps.map((step) => ({ ...step, state: "signed" as const })),
		};
		// Persist before broadcasting so an interrupted run resends these exact bytes.
		writeRecord(record);
		if (record.registry) console.log(`Registry written to ${registryFile.pathname}\nDeploy the landing page so it is live at ${record.registry.uri}, then run deploy again.`);
	} else if (record.artifacts.forest !== sha256(forestArtifact) || record.artifacts.directory !== sha256(directoryArtifact)) {
		console.warn("⚠ The contracts were recompiled after this deployment was prepared; continuing with the recorded transactions.");
	}
	if (record.registry && record.steps.some((step) => step.state !== "sent")) await checkHostedRegistry(record.registry);
	for (const step of record.steps) {
		if (step.state === "sent") continue;
		try {
			await provider.sendRawTransaction(step.raw);
		} catch (error) {
			const known = await provider.getRawTransaction(step.txid).then(() => true, () => false);
			if (!known) fail(`Broadcasting ${step.name} failed: ${(error as Error).message}\nNothing was replaced. Fix the cause and run deploy again to resend the same transaction.`);
		}
		step.state = "sent";
		writeRecord(record);
		console.log(`✔ ${step.name.padEnd(18)} ${explorer}${step.txid}`);
	}
	printResult(record);
}

/** Every tree commitment ever minted by the Focus Forest contract, plus the creator trees. */
async function mintedTrees(provider: ElectrumNetworkProvider, record: Record) {
	const trees = new Set(record.creator?.commitments ?? []);
	const history = (await provider.performRequest("blockchain.scripthash.get_history", electrumScriptHash(record.forest.lockingBytecode))) as { tx_hash: string }[];
	for (const { tx_hash } of history) {
		const raw = (await provider.performRequest("blockchain.transaction.get", tx_hash)) as string;
		const transaction = decodeTransaction(hexToBin(raw));
		if (typeof transaction === "string") fail(`Could not decode ${tx_hash}: ${transaction}`);
		for (const output of transaction.outputs) {
			const nft = output.token?.nft;
			if (nft && nft.capability !== "minting" && binToHex(output.token!.category) === record.forest.category) trees.add(binToHex(nft.commitment));
		}
	}
	return [...trees];
}

async function publish(provider: ElectrumNetworkProvider) {
	const record = readRecord();
	if (!record || record.steps.some((step) => step.state !== "sent")) fail("Finish the deployment first.");
	if (!site) fail("Pass --site <https origin> for the registry.");
	const authority = loadAuthority();
	const deployer = loadDeployer();
	if (authority.address !== record.authority) fail(`${authorityFile} is not this deployment's metadata authority.`);
	record.publications ??= [];
	let pending = record.publications.find((entry) => entry.steps.some((step) => step.state !== "sent"));
	if (!pending) {
		const trees = await mintedTrees(provider, record);
		const revision = new Date().toISOString();
		const text = serializeRegistry(buildRegistry({ forestCategory: record.forest.category, directoryCategory: record.directory.category, site, revision, trees }));
		const contentHash = registryContentHash(text);
		const uri = `${site}${BCMR_WELL_KNOWN_PATH}`;
		const bytecode = bcmrPublicationBytecode(contentHash, uri);
		const coins = (await provider.getUtxos(deployer.address)).filter((coin) => !coin.token);
		const identityOf = (outpoint: string) => { const [txid, vout] = outpoint.split(":"); return { txid, vout: Number(vout), satoshis: 1000n }; };
		const forest = buildPublication(provider, authority, identityOf(record.forest.identityOutpoint), deployer, coins, bytecode, "forest-bcmr");
		const directory = buildPublication(provider, authority, identityOf(record.directory.identityOutpoint), deployer, [forest.change], bytecode, "directory-bcmr");
		fs.mkdirSync(new URL(".", registryFile), { recursive: true });
		fs.writeFileSync(registryFile, text);
		pending = { revision, uri, contentHash, trees: trees.length, steps: [forest.step, directory.step].map((step) => ({ ...step, state: "signed" as const })) };
		record.publications.push(pending);
		writeRecord(record);
		console.log(`Registry revision ${revision} (${trees.length} trees) written to ${registryFile.pathname}\nDeploy the landing page so it is live at ${uri}, then run publish again.`);
	}
	await checkHostedRegistry(pending);
	for (const step of pending.steps) {
		if (step.state === "sent") continue;
		try {
			await provider.sendRawTransaction(step.raw);
		} catch (error) {
			const known = await provider.getRawTransaction(step.txid).then(() => true, () => false);
			if (!known) fail(`Broadcasting ${step.name} failed: ${(error as Error).message}\nRun publish again to resend the same transaction.`);
		}
		step.state = "sent";
		if (step.name === "forest-bcmr") record.forest.identityOutpoint = `${step.txid}:0`;
		if (step.name === "directory-bcmr") record.directory.identityOutpoint = `${step.txid}:0`;
		writeRecord(record);
		console.log(`✔ ${step.name.padEnd(18)} ${explorer}${step.txid}`);
	}
	record.registry = { uri: pending.uri, contentHash: pending.contentHash, revision: pending.revision, trees: pending.trees };
	writeRecord(record);
	console.log(`\nMetadata revision ${pending.revision} published for ${pending.trees} trees.`);
}

/** Wallets reject a registry whose bytes don't match the hash in the genesis transactions. */
async function checkHostedRegistry({ uri, contentHash }: { uri: string; contentHash: string }) {
	const response = await fetch(`${uri}?check=${Date.now()}`).catch((error: Error) => fail(`Could not fetch ${uri}: ${error.message}`));
	if (!response.ok) fail(`${uri} answered ${response.status}. Deploy the landing page with the new registry first; nothing was broadcast.`);
	const hosted = registryContentHash(await response.text());
	if (hosted !== contentHash) fail(`${uri} does not match the registry in the signed transactions (hosted ${hosted}, signed ${contentHash}). Nothing was broadcast.`);
	console.log(`✔ Registry live at ${uri} (sha256 ${contentHash})`);
}

function printResult(record: Record) {
	if (record.steps.some((step) => step.state !== "sent")) return;
	console.log(`\nDeployed on ${record.network}. App builds read this record (packages/contracts/deployments/${record.network}.json); commit it.\n`);
	console.log(`\nFocus Forest contract:    ${record.forest.address}\nFocus Directory contract: ${record.directory.address}`);
	if (record.creator) console.log(`Creator NFTs:             ${record.creator.count} trees minted to ${record.creator.address} (genesis ${record.steps.find((step) => step.name === "forest-genesis")!.txid})`);
	if (record.registry) console.log(`Metadata (BCMR):          ${record.registry.uri}\nMetadata authority:       ${record.authority}`);
	console.log("");
}

const provider = new ElectrumNetworkProvider(network);
try {
	if (command === "init") await init();
	else if (command === "status") await status(provider);
	else if (command === "deploy") await deploy(provider);
	else if (command === "publish") await publish(provider);
	else fail("Commands: init, status, deploy, publish");
	process.exit(0);
} catch (error) {
	fail((error as Error).message);
}
