/**
 * Reads the Focus Forest and Focus Directory contracts' histories from public Electrum servers
 * and scans them with the same rules as the app. Loaded on demand: libauth sets up WebAssembly
 * when imported, which must not hold up the rest of the page.
 */
export { FOREST_TIERS } from "@focus-garden/protocol/forest";
export { rankLeaders } from "@focus-garden/protocol/leaderboard";
import { contractFromAddress, electrumScriptHash, rankLeaders, scanForest, type ChainTransaction, type ContractRef, type ForestScan, type LeaderEntry, type LeaderPeriod } from "@focus-garden/protocol/leaderboard";
import { ElectrumClient, mapLimit } from "./electrum";
import type { LeaderboardDeployment } from "./leaderboard";

const TX_CACHE = "fg-landing-tx:";

const contractRef = (contract: { category: string; address: string }): ContractRef => contractFromAddress(contract.category, contract.address);

function cachedRaw(txid: string) {
	try { return localStorage.getItem(TX_CACHE + txid); } catch { return null; }
}
function cacheRaw(txid: string, raw: string) {
	try { localStorage.setItem(TX_CACHE + txid, raw); } catch { /* storage full or blocked: refetch next time */ }
}

/** Reads both contracts' confirmed transactions and scans them. */
export async function readForest(deployment: LeaderboardDeployment): Promise<{ scan: ForestScan; height: number; server: string }> {
	const forest = contractRef(deployment.forest);
	const directory = contractRef(deployment.directory);
	const client = await ElectrumClient.connect(deployment.network);
	try {
		const tip = (await client.request("blockchain.headers.get_tip", [])) as { height: number };
		const histories = await Promise.all([forest, directory].map((contract) =>
			client.request("blockchain.scripthash.get_history", [electrumScriptHash(contract.lockingBytecode)]) as Promise<{ tx_hash: string; height: number }[]>));
		const byTxid = new Map<string, number>();
		for (const entry of histories.flat()) if (entry.height > 0) byTxid.set(entry.tx_hash, entry.height);
		const ordered = [...byTxid].sort(([a, ha], [b, hb]) => ha - hb || a.localeCompare(b));
		const transactions = await mapLimit(ordered, 6, async ([txid, height]): Promise<ChainTransaction> => {
			let raw = cachedRaw(txid);
			if (!raw) {
				raw = (await client.request("blockchain.transaction.get", [txid, false])) as string;
				cacheRaw(txid, raw);
			}
			return { txid, height, raw };
		});
		return { scan: scanForest(transactions, forest, directory), height: tip.height, server: client.url };
	} finally {
		client.close();
	}
}
