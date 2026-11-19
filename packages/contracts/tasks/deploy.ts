/**
 * Deploy the shared Focus Forest and Focus Directory contracts through public Electrum servers.
 *
 *   bun run deploy init      create a dedicated deployer wallet (key stays in ~/.focus-garden)
 *   bun run deploy status    show the deployer balance and the deployment record
 *   bun run deploy deploy    mint both minting batons into their contracts (once)
 *
 * Options: --network chipnet (default) | mainnet. Mainnet also requires FOCUS_GARDEN_CONFIRM_MAINNET=yes.
 *          --creator-nfts <n> mints n creator trees in the Focus Forest genesis transaction itself
 *          (no planting, no time lock), sent to --creator-address (default: the deployer wallet).
 * The deployment record (public data only) is written to packages/contracts/deployments/<network>.json
 * before anything is broadcast; a rerun resends the same signed bytes and never builds a second set.
 */
import { encodeCashAddress, encodePrivateKeyWif, generatePrivateKey, hash160 } from "@bitauth/libauth";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ElectrumNetworkProvider, SignatureTemplate } from "cashscript";
import forestArtifact from "../artifacts/FocusForest.artifact.js";
import directoryArtifact from "../artifacts/FocusDirectory.artifact.js";
import { creatorCommitments, planDeployment, type Step } from "../src/deploy/genesis.js";

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

function loadDeployer() {
	if (!fs.existsSync(keyFile)) fail(`No deployer wallet yet. Run: bun run deploy init --network ${network}`);
	const { wif } = JSON.parse(fs.readFileSync(keyFile, "utf8")) as { wif: string };
	const signer = new SignatureTemplate(wif);
	const result = encodeCashAddress({ prefix, type: "p2pkh", payload: hash160(signer.getPublicKey()) });
	const address = typeof result === "string" ? result : result.address;
	return { signer, address };
}

async function init() {
	if (fs.existsSync(keyFile)) {
		console.log(`A deployer wallet already exists (${keyFile}); it was not replaced.`);
	} else {
		const key = generatePrivateKey(() => crypto.getRandomValues(new Uint8Array(32)));
		fs.mkdirSync(keyDirectory, { recursive: true, mode: 0o700 });
		fs.writeFileSync(keyFile, JSON.stringify({ network, wif: encodePrivateKeyWif(key, network === "mainnet" ? "mainnet" : "testnet"), createdAt: new Date().toISOString() }), { mode: 0o600, flag: "wx" });
		console.log(`Created a dedicated deployer wallet in ${keyFile} (private, never commit it).`);
	}
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
		const coins = (await provider.getUtxos(address)).filter((coin) => !coin.token);
		const total = coins.reduce((sum, coin) => sum + coin.satoshis, 0n);
		const needed = MINIMUM_SATOSHIS + BigInt(creatorCount) * 1200n;
		if (total < needed) fail(`The deployer has ${total} sats; send at least ${needed} to ${address}.`);
		const creatorAddress = option("--creator-address") ?? address;
		const creator = creatorCount ? { address: creatorAddress, commitments: creatorCommitments(creatorAddress, creatorCount, Math.floor(Date.now() / 1000)) } : undefined;
		const plan = planDeployment(provider, signer, address, coins, { forest: forestArtifact, directory: directoryArtifact }, creator);
		record = { schema: "focus-garden-deployment-v1", network, deployer: address, createdAt: new Date().toISOString(), artifacts: { forest: sha256(forestArtifact), directory: sha256(directoryArtifact) }, forest: plan.forest, ...(creator ? { creator: { address: creator.address, count: creatorCount, commitments: creator.commitments } } : {}), directory: plan.directory, steps: plan.steps.map((step) => ({ ...step, state: "signed" as const })) };
		// Persist before broadcasting so an interrupted run resends these exact bytes.
		writeRecord(record);
	} else if (record.artifacts.forest !== sha256(forestArtifact) || record.artifacts.directory !== sha256(directoryArtifact)) {
		console.warn("⚠ The contracts were recompiled after this deployment was prepared; continuing with the recorded transactions.");
	}
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

function printResult(record: Record) {
	if (record.steps.some((step) => step.state !== "sent")) return;
	console.log(`\nDeployed on ${record.network}. App builds read this record (packages/contracts/deployments/${record.network}.json); commit it.\n`);
	console.log(`\nFocus Forest contract:    ${record.forest.address}\nFocus Directory contract: ${record.directory.address}`);
	if (record.creator) console.log(`Creator NFTs:             ${record.creator.count} trees minted to ${record.creator.address} (genesis ${record.steps[1].txid})`);
	console.log("");
}

const provider = new ElectrumNetworkProvider(network);
try {
	if (command === "init") await init();
	else if (command === "status") await status(provider);
	else if (command === "deploy") await deploy(provider);
	else fail("Commands: init, status, deploy");
	process.exit(0);
} catch (error) {
	fail((error as Error).message);
}
