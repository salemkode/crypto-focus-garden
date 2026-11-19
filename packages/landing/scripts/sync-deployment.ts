/**
 * Copies the public part of the contract deployment record (written by
 * `bun run deploy deploy` in packages/contracts) into the landing page.
 * Without a finished deployment the page shows "Deployment pending".
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const network = process.env.LANDING_NETWORK ?? "chipnet";
const source = new URL(`../../contracts/deployments/${network}.json`, import.meta.url);
const target = new URL("../src/deployment.json", import.meta.url);

type Deployment = { category: string; address: string; tokenAddress: string; lockingBytecode: string };
type Record = { network: string; forest: Deployment; directory: Deployment; steps: { name: string; txid: string; state: string }[] };

let output: object = { network, deployed: false };
if (existsSync(source)) {
	const record = JSON.parse(readFileSync(source, "utf8")) as Record;
	const deployed = record.steps.every((step) => step.state === "sent");
	output = {
		network: record.network,
		deployed,
		forest: { category: record.forest.category, address: record.forest.address, genesis: record.steps.find((step) => step.name === "forest-genesis")?.txid },
		directory: { category: record.directory.category, address: record.directory.address, genesis: record.steps.find((step) => step.name === "directory-genesis")?.txid },
	};
}
writeFileSync(target, `${JSON.stringify(output, null, "\t")}\n`);
console.log(`Landing deployment info: ${(output as { deployed: boolean }).deployed ? "deployed" : "pending"} (${network})`);
