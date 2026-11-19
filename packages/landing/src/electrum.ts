/**
 * A minimal Electrum (Fulcrum) client over WebSocket for reading public chain data in the
 * browser. Read-only: it never broadcasts. Each server must report the expected genesis hash,
 * so a mainnet or testnet4 server can never be mistaken for Chipnet.
 */

export const ELECTRUM_SERVERS = {
	chipnet: {
		genesis: "000000001dd410c49a788668ce26751718cc797474d3152a5fc073dd44fd9f7b",
		urls: ["wss://chipnet.bch.ninja:50004", "wss://chipnet.imaginary.cash:50004"],
	},
	mainnet: {
		genesis: "000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f",
		urls: ["wss://bch.imaginary.cash:50004", "wss://electroncash.de:60002"],
	},
} as const;

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

export class ElectrumError extends Error {}

export class ElectrumClient {
	private socket: WebSocket | null = null;
	private nextId = 1;
	private pending = new Map<number, Pending>();

	private constructor(readonly url: string, private readonly timeoutMs: number) {}

	/** Connects to the first server that answers and serves the expected chain. */
	static async connect(network: keyof typeof ELECTRUM_SERVERS, timeoutMs = 10_000) {
		const { urls, genesis } = ELECTRUM_SERVERS[network];
		let lastError: unknown = null;
		for (const url of urls) {
			const client = new ElectrumClient(url, timeoutMs);
			try {
				await client.open();
				await client.request("server.version", ["focus-garden-landing", "1.5"]);
				const features = (await client.request("server.features", [])) as { genesis_hash?: string };
				if (features.genesis_hash !== genesis) throw new ElectrumError(`${url} serves a different chain.`);
				return client;
			} catch (error) {
				lastError = error;
				client.close();
			}
		}
		throw lastError instanceof Error ? lastError : new ElectrumError("No Electrum server answered.");
	}

	private open() {
		return new Promise<void>((resolve, reject) => {
			const socket = new WebSocket(this.url);
			const timer = setTimeout(() => { socket.close(); reject(new ElectrumError(`${this.url} did not answer.`)); }, this.timeoutMs);
			socket.onopen = () => { clearTimeout(timer); this.socket = socket; resolve(); };
			socket.onerror = () => { clearTimeout(timer); reject(new ElectrumError(`Could not reach ${this.url}.`)); };
			socket.onclose = () => this.failAll(new ElectrumError("The connection closed."));
			socket.onmessage = (event) => this.receive(String(event.data));
		});
	}

	private receive(text: string) {
		let message: { id?: number; result?: unknown; error?: { message?: string } };
		try { message = JSON.parse(text); } catch { return; }
		if (typeof message.id !== "number") return; // subscription notifications are not used
		const entry = this.pending.get(message.id);
		if (!entry) return;
		this.pending.delete(message.id);
		clearTimeout(entry.timer);
		if (message.error) entry.reject(new ElectrumError(message.error.message ?? "The server refused the request."));
		else entry.resolve(message.result);
	}

	private failAll(error: Error) {
		for (const [id, entry] of this.pending) {
			clearTimeout(entry.timer);
			entry.reject(error);
			this.pending.delete(id);
		}
	}

	request(method: string, params: unknown[]) {
		const socket = this.socket;
		if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new ElectrumError("Not connected."));
		const id = this.nextId++;
		return new Promise<unknown>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new ElectrumError(`${method} timed out.`));
			}, this.timeoutMs);
			this.pending.set(id, { resolve, reject, timer });
			socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
		});
	}

	close() {
		this.failAll(new ElectrumError("Closed."));
		if (this.socket) { this.socket.onclose = null; this.socket.close(); }
		this.socket = null;
	}
}

/** Runs `work` over `items` with at most `limit` in flight, keeping order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>) {
	const results = new Array<R>(items.length);
	let next = 0;
	const run = async () => {
		while (next < items.length) {
			const index = next++;
			results[index] = await work(items[index]);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
	return results;
}
