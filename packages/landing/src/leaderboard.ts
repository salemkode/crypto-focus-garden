/**
 * The public leaderboard, computed in the visitor's browser from Bitcoin Cash itself.
 * It ranks members exactly like the app does. No Focus Garden server is involved.
 */
import type { LeaderEntry, LeaderPeriod } from "@focus-garden/protocol/leaderboard";

export interface LeaderboardDeployment {
	network: "chipnet" | "mainnet";
	forest: { category: string; address: string };
	directory: { category: string; address: string };
}

type Reader = typeof import("./forest-reader");
type ForestRead = Awaited<ReturnType<Reader["readForest"]>>;

// ---------- rendering

const plural = (count: number, word: string) => `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...children: (Node | string)[]) {
	const node = document.createElement(tag);
	const { class: className, ...rest } = props;
	if (className) node.className = className;
	Object.assign(node, rest);
	node.append(...children);
	return node;
}

function rowFor(entry: LeaderEntry, tierName: (code: number) => string) {
	return el("li", { class: `leader${entry.rank <= 3 ? " leader-top" : ""}` },
		el("span", { class: "leader-rank" }, String(entry.rank)),
		el("span", { class: "leader-who" },
			el("b", { class: "leader-name" }, entry.name),
			entry.about ? el("span", { class: "leader-about" }, entry.about) : ""),
		el("span", { class: "leader-trees" }, plural(entry.trees, "tree"), entry.bestTier ? el("small", {}, `Best: ${tierName(entry.bestTier)}`) : ""),
		el("span", { class: "leader-points" }, el("b", {}, entry.points.toLocaleString()), el("small", {}, entry.points === 1 ? "point" : "points")),
	);
}

/**
 * Fills a `[data-leaderboard]` element. It loads when the section comes near the screen,
 * and shows a clear state when the contracts are not live yet or the servers fail.
 */
export function mountLeaderboard(root: HTMLElement, deployment: LeaderboardDeployment | null, explorerAddress: string) {
	let period: LeaderPeriod = "week";
	let result: ForestRead | null = null;
	let reader: Reader | null = null;
	let loading = false;

	const tabs = el("div", { class: "leader-tabs", role: "tablist", ariaLabel: "Leaderboard period" });
	const periods: [LeaderPeriod, string][] = [["week", "This week"], ["all", "All time"]];
	const buttons = periods.map(([value, label]) => {
		const button = el("button", { type: "button", role: "tab" }, label);
		button.setAttribute("aria-selected", String(value === period));
		button.addEventListener("click", () => { period = value; render(); });
		tabs.append(button);
		return button;
	});
	const list = el("ol", { class: "leader-list", ariaLive: "polite" });
	const status = el("p", { class: "leader-status" });
	root.append(tabs, list, status);

	function message(text: string, action?: { label: string; run: () => void }) {
		list.replaceChildren(el("li", { class: "leader-empty" }, el("p", {}, text),
			action ? el("button", { type: "button", class: "button button-secondary button-small", onclick: action.run }, action.label) : ""));
	}

	function render() {
		periods.forEach(([value], index) => buttons[index].setAttribute("aria-selected", String(value === period)));
		if (!deployment) {
			tabs.hidden = true;
			message("The leaderboard opens when the Focus Garden contracts go live on Chipnet.");
			status.textContent = "";
			return;
		}
		if (loading && !result) {
			list.replaceChildren(...Array.from({ length: 5 }, () => el("li", { class: "leader leader-skeleton", ariaHidden: "true" })));
			status.textContent = "Reading the forest from Bitcoin Cash…";
			return;
		}
		if (!result || !reader) return;
		const { FOREST_TIERS, rankLeaders } = reader;
		const tierName = (code: number) => FOREST_TIERS.find((tier) => tier.code === code)?.name ?? "";
		const entries = rankLeaders(result.scan, period);
		if (entries.length === 0) {
			message(period === "week"
				? "Nobody has planted this week yet. Finish a session in the app and your name can be first."
				: "Nobody is on the board yet. Plant a tree and claim a name in the app to be first.");
		} else {
			list.replaceChildren(...entries.map((entry) => rowFor(entry, tierName)));
		}
		status.replaceChildren(
			`Read from ${deployment.network === "mainnet" ? "Bitcoin Cash" : "Chipnet"} block ${result.height.toLocaleString()} just now. Only members who claimed a name appear. `,
			el("a", { href: explorerAddress + deployment.forest.address, target: "_blank", rel: "noopener" }, "Check the contract"),
		);
	}

	async function load() {
		if (!deployment || loading) return;
		loading = true;
		render();
		try {
			reader ??= await import("./forest-reader");
			result = await reader.readForest(deployment);
		} catch {
			if (!result) message("Couldn't reach the public Bitcoin Cash servers. Check your connection and try again.", { label: "Try again", run: load });
			status.textContent = "";
			loading = false;
			return;
		}
		loading = false;
		render();
	}

	render();
	if (!deployment) return;
	new IntersectionObserver((entries, observer) => {
		if (entries.some((entry) => entry.isIntersecting)) {
			observer.disconnect();
			void load();
		}
	}, { rootMargin: "400px" }).observe(root);
}
