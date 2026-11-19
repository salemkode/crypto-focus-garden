import * as THREE from "three";
import { buildGrowthModel, buildTierModel, type SpeciesKey, type Tier } from "@focus-garden/garden/tiers";
import type { Level } from "@focus-garden/garden/ladder";
import appleIcon from "@phosphor-icons/core/assets/fill/apple-logo-fill.svg" with { type: "text" };
import androidIcon from "@phosphor-icons/core/assets/fill/android-logo-fill.svg" with { type: "text" };
import globeIcon from "@phosphor-icons/core/assets/regular/globe.svg" with { type: "text" };
import timerIcon from "@phosphor-icons/core/assets/regular/timer.svg" with { type: "text" };
import lockIcon from "@phosphor-icons/core/assets/regular/lock.svg" with { type: "text" };
import walletIcon from "@phosphor-icons/core/assets/regular/wallet.svg" with { type: "text" };
import plantIcon from "@phosphor-icons/core/assets/regular/plant.svg" with { type: "text" };
import treeIcon from "@phosphor-icons/core/assets/regular/tree.svg" with { type: "text" };
import hourglassIcon from "@phosphor-icons/core/assets/regular/hourglass.svg" with { type: "text" };
import trophyIcon from "@phosphor-icons/core/assets/regular/trophy.svg" with { type: "text" };
import leafIcon from "@phosphor-icons/core/assets/regular/leaf.svg" with { type: "text" };
import copyIcon from "@phosphor-icons/core/assets/regular/copy.svg" with { type: "text" };
import checkIcon from "@phosphor-icons/core/assets/regular/check.svg" with { type: "text" };
import openIcon from "@phosphor-icons/core/assets/regular/arrow-square-out.svg" with { type: "text" };
import turnLeftIcon from "@phosphor-icons/core/assets/regular/arrow-counter-clockwise.svg" with { type: "text" };
import turnRightIcon from "@phosphor-icons/core/assets/regular/arrow-clockwise.svg" with { type: "text" };
import pauseIcon from "@phosphor-icons/core/assets/fill/pause-fill.svg" with { type: "text" };
import playIcon from "@phosphor-icons/core/assets/fill/play-fill.svg" with { type: "text" };
import deployment from "./deployment.json";
import { DOWNLOADS, EXPLORER, NETWORK } from "./config";
import { Stage } from "./stage";
import { mountLeaderboard, type LeaderboardDeployment } from "./leaderboard";

document.documentElement.classList.add("js");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) => root.querySelector<T>(selector)!;
const $$ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) => [...root.querySelectorAll<T>(selector)];

// ------------------------------------------------------------------ icons

const ICONS: Record<string, string> = { timer: timerIcon, lock: lockIcon, wallet: walletIcon, plant: plantIcon, tree: treeIcon, hourglass: hourglassIcon, trophy: trophyIcon, leaf: leafIcon, "turn-left": turnLeftIcon, "turn-right": turnRightIcon, pause: pauseIcon, play: playIcon };
for (const element of $$("[data-icon]")) {
	element.innerHTML = ICONS[element.dataset.icon!] ?? "";
	element.setAttribute("aria-hidden", "true");
}

// ------------------------------------------------------------------ downloads

type Platform = "ios" | "android" | "web";
const PLATFORMS: { key: Platform; label: string; icon: string }[] = [
	{ key: "ios", label: "iPhone", icon: appleIcon },
	{ key: "android", label: "Android", icon: androidIcon },
	{ key: "web", label: "Web", icon: globeIcon },
];
const ua = navigator.userAgent;
const mine: Platform = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "ios" : /Android/.test(ua) ? "android" : "web";
// Available platforms first, the visitor's own platform leading; the first available one is primary.
const rank = (key: Platform) => (DOWNLOADS[key] ? 0 : 2) + (key === mine ? 0 : 1);
const ordered = [...PLATFORMS].sort((a, b) => rank(a.key) - rank(b.key));
const primaryKey = ordered.find((platform) => DOWNLOADS[platform.key])?.key;
for (const group of $$("[data-downloads]")) {
	group.innerHTML = "";
	for (const platform of ordered) {
		const url = DOWNLOADS[platform.key];
		const primary = platform.key === primaryKey;
		const link = document.createElement(url ? "a" : "span");
		link.className = `button ${primary ? "button-primary" : "button-secondary"}`;
		link.innerHTML = `<span class="icon-inline">${platform.icon}</span>${platform.label}${url ? "" : " <small>Coming soon</small>"}`;
		if (url) {
			(link as HTMLAnchorElement).href = url;
			if (/^https?:/.test(url)) { (link as HTMLAnchorElement).target = "_blank"; (link as HTMLAnchorElement).rel = "noopener"; }
			link.setAttribute("aria-label", `Get Focus Garden for ${platform.label}`);
		} else {
			link.setAttribute("aria-disabled", "true");
			link.setAttribute("aria-label", `Focus Garden for ${platform.label} is coming soon`);
		}
		group.append(link);
	}
}

// ------------------------------------------------------------------ network copy

const testnet = NETWORK === "chipnet";
$("[data-network-answer]").textContent = testnet
	? "Not yet. Focus Garden runs on Chipnet, Bitcoin Cash's public test network, where coins are free and have no value. A mainnet release comes after testing."
	: "The Focus Forest and Focus Directory contracts are deployed on Bitcoin Cash Mainnet. This browser preview does not send Mainnet transactions.";
$("[data-network-footer]").textContent = testnet ? "runs on Bitcoin Cash Chipnet, a test network." : "runs on Bitcoin Cash.";

// ------------------------------------------------------------------ reveal on scroll

const revealer = new IntersectionObserver((entries) => {
	for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add("in"); revealer.unobserve(entry.target); }
}, { rootMargin: "0px 0px -8% 0px" });
$$(".reveal").forEach((element) => revealer.observe(element));

// ------------------------------------------------------------------ hero: the app's own valley

async function startHero() {
	const stage = $(".hero-stage");
	const canvas = $<HTMLCanvasElement>("#valley");
	const pauseButton = $<HTMLButtonElement>("[data-valley-pause]");
	const coarse = matchMedia("(pointer: coarse)").matches;
	// The page scrolls with the wheel and with touch; mouse drags and the buttons move the valley.
	stage.addEventListener("wheel", (event) => event.stopPropagation(), { capture: true });
	for (const type of ["pointerdown", "pointermove", "pointerup"]) {
		stage.addEventListener(type, (event) => { if ((event as PointerEvent).pointerType === "touch") event.stopPropagation(); }, { capture: true });
	}
	try {
		const { startValley } = await import("../../mobile/src/components/valley/controller");
		const valley = startValley(canvas, () => {});
		valley.receive({ type: "init", seed: 7, lowPower: coarse || innerWidth < 700 });
		const styles: SpeciesKey[] = ["oak", "cherry", "pine", "maple", "birch", "cash"];
		const levels = [2, 1, 3, 1, 2, 4, 1, 2, 5, 1, 3, 2, 1, 6, 2, 1];
		valley.receive({
			type: "history",
			history: levels.map((level, i) => ({ type: "plant" as const, entity: { id: `demo-${i}`, level: level as Level, style: styles[(i * 5) % 6], seed: 101 + i * 17 } })),
			growing: null,
			plantedAt: {},
		});
		// Motion runs only while the valley is on screen, the tab is visible and the visitor has not paused it.
		let onScreen = true;
		let userPaused = false;
		const sync = () => valley.receive({ type: "pause", paused: userPaused || !onScreen || document.hidden });
		const setPaused = (paused: boolean) => {
			userPaused = paused;
			pauseButton.setAttribute("aria-pressed", String(paused));
			pauseButton.setAttribute("aria-label", paused ? "Play the valley" : "Pause the valley");
			pauseButton.firstElementChild!.innerHTML = paused ? playIcon : pauseIcon;
			sync();
		};
		pauseButton.addEventListener("click", () => setPaused(!userPaused));
		for (const button of $$<HTMLButtonElement>("[data-valley-turn]")) {
			button.addEventListener("click", () => {
				const resume = userPaused;
				if (resume) valley.receive({ type: "pause", paused: false });
				valley.receive({ type: "camera", begin: true, rotate: Number(button.dataset.valleyTurn) * 0.5, release: true });
				if (resume) setTimeout(sync, 900);
			});
		}
		new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync(); }).observe(canvas);
		document.addEventListener("visibilitychange", sync);
		// Reduced motion: show the valley still, after its first frames have drawn.
		if (reduced) setTimeout(() => setPaused(true), 1200);
		setTimeout(() => stage.classList.add("ready"), 400);
	} catch (error) {
		console.warn("Valley preview unavailable", error);
		stage.classList.add("ready");
		$(".demo-controls").hidden = true;
	}
}
void startHero();

// ------------------------------------------------------------------ grow: minutes to tier

// Mirrors contracts/FocusForest.cash: one unit is 512 seconds; tiers need 1, 3, 6 and 11 units.
const UNIT_SECONDS = 512;
const TIERS: { tier: Tier; name: string; units: number }[] = [
	{ tier: "sprout", name: "Sprout", units: 1 },
	{ tier: "tree", name: "Tree", units: 3 },
	{ tier: "bigTree", name: "Big tree", units: 6 },
	{ tier: "house", name: "House", units: 11 },
];
const SPECIES: { key: SpeciesKey; name: string; color: string }[] = [
	{ key: "oak", name: "Oak", color: "#5cab35" },
	{ key: "cherry", name: "Cherry", color: "#f2a7c1" },
	{ key: "pine", name: "Pine", color: "#2f7a4a" },
	{ key: "maple", name: "Maple", color: "#de6a2b" },
	{ key: "birch", name: "Birch", color: "#9cc94a" },
	{ key: "cash", name: "Cash tree", color: "#0ac18e" },
];
const tierFor = (minutes: number) => [...TIERS].reverse().find((entry) => Math.floor((minutes * 60) / UNIT_SECONDS) >= entry.units) ?? null;

const growStage = new Stage($<HTMLCanvasElement>("#tier"));
const slider = $<HTMLInputElement>("#minutes");
const badge = $("[data-tier-badge]");
let species: SpeciesKey = "oak";
let shown = "";

const chips = $("[data-species]");
for (const entry of SPECIES) {
	const chip = document.createElement("button");
	chip.type = "button";
	chip.className = "chip";
	chip.style.setProperty("--swatch", entry.color);
	chip.innerHTML = `<i></i>${entry.name}`;
	chip.setAttribute("aria-pressed", String(entry.key === species));
	chip.addEventListener("click", () => {
		species = entry.key;
		$$(".chip", chips).forEach((other) => other.setAttribute("aria-pressed", String(other === chip)));
		updateGrow();
	});
	chips.append(chip);
}

function showModel(stage: Stage, geometry: THREE.BufferGeometry, pop = true) {
	const mesh = stage.mesh(geometry);
	geometry.computeBoundingBox();
	const box = geometry.boundingBox!;
	mesh.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
	const holder = new THREE.Group();
	holder.add(mesh);
	stage.set(holder);
	// Bigger tiers fill more of the stage, so growth stays visible without tiny sprouts.
	const height = box.max.y - box.min.y;
	const frame = 10 + height * 0.6;
	stage.frameBox(new THREE.Box3(new THREE.Vector3(-frame * 0.45, 0, -frame * 0.45), new THREE.Vector3(frame * 0.45, frame, frame * 0.45)));
	if (pop && !reduced) {
		const start = performance.now();
		holder.scale.setScalar(0.6);
		stage.animate((now) => {
			const t = Math.min(1, (now - start) / 520);
			const s = 1 + 0.12 * Math.sin(t * Math.PI) * (1 - t);
			holder.scale.setScalar(0.6 + 0.4 * (1 - (1 - t) ** 3) * s);
			return t >= 1;
		});
	}
}

function updateGrow() {
	const minutes = Number(slider.value);
	const entry = tierFor(minutes);
	$("[data-minutes]").textContent = String(minutes);
	$("[data-result]").textContent = entry ? `grows a ${entry.name}` : "grows a practice sprout";
	badge.textContent = entry ? entry.name : "Practice";
	badge.classList.toggle("practice", !entry);
	$$("[data-ladder] li").forEach((item, index) => {
		item.classList.toggle("on", Boolean(entry) && index < TIERS.indexOf(entry!));
		item.classList.toggle("current", Boolean(entry) && index === TIERS.indexOf(entry!));
	});
	const key = `${entry?.tier ?? "practice"}:${species}`;
	if (key === shown) return;
	shown = key;
	const geometry = entry ? buildTierModel(entry.tier, species, 11).toGeometry(0) : buildGrowthModel(species, 0.5, 11, "sprout").toGeometry(0);
	showModel(growStage, geometry);
	if (!reduced) { badge.classList.add("pop"); setTimeout(() => badge.classList.remove("pop"), 300); }
}
slider.addEventListener("input", updateGrow);
updateGrow();

// ------------------------------------------------------------------ merge playground

const RECIPES: { from: Tier; count: number; to: Tier; points: number }[] = [
	{ from: "sprout", count: 3, to: "tree", points: 1 },
	{ from: "tree", count: 2, to: "bigTree", points: 3 },
	{ from: "bigTree", count: 2, to: "house", points: 6 },
];
const mergeStage = new Stage($<HTMLCanvasElement>("#merge-canvas"), { pitch: 0.38 });
const mergeButton = $<HTMLButtonElement>("[data-merge]");
let recipe = 0;
let merged = false;
let busy = false;

function placed(tier: Tier, style: SpeciesKey, seed: number) {
	const geometry = buildTierModel(tier, style, seed).toGeometry(0);
	geometry.computeBoundingBox();
	const box = geometry.boundingBox!;
	const mesh = mergeStage.mesh(geometry);
	mesh.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
	const holder = new THREE.Group();
	holder.add(mesh);
	return { holder, width: box.max.x - box.min.x };
}

function showIngredients() {
	const r = RECIPES[recipe];
	const styles: SpeciesKey[] = ["cherry", "oak", "maple"];
	const items = Array.from({ length: r.count }, (_, i) => placed(r.from, styles[i % 3], 30 + i * 7));
	const gap = Math.max(...items.map((item) => item.width)) + 4;
	items.forEach((item, i) => item.holder.position.x = (i - (r.count - 1) / 2) * gap);
	mergeStage.set(...items.map((item) => item.holder));
	const span = gap * (r.count - 1) / 2 + gap / 2;
	const tall = Math.max(...items.map((item) => new THREE.Box3().setFromObject(item.holder).getSize(new THREE.Vector3()).y)) * 1.25 + 3;
	mergeStage.frameBox(new THREE.Box3(new THREE.Vector3(-span, 0, -4), new THREE.Vector3(span, tall, 4)), 1.05);
	merged = false;
	mergeButton.textContent = "Merge";
	$("[data-score]").textContent = String(r.points * r.count);
}

function runMerge() {
	if (busy) return;
	if (merged) { showIngredients(); return; }
	busy = true;
	const r = RECIPES[recipe];
	const ingredients = [...mergeStage.root.children];
	const starts = ingredients.map((item) => item.position.x);
	const begin = performance.now();
	const gather = reduced ? 1 : 650;
	mergeStage.animate((now) => {
		const t = Math.min(1, (now - begin) / gather);
		const e = t * t * (3 - 2 * t);
		ingredients.forEach((item, i) => {
			item.position.x = starts[i] * (1 - e);
			item.position.y = Math.sin(e * Math.PI) * 6;
			item.scale.setScalar(1 - 0.75 * e);
		});
		if (t < 1) return false;
		const result = placed(r.to, "cherry", 30);
		mergeStage.set(result.holder);
		const popStart = performance.now();
		result.holder.scale.setScalar(reduced ? 1 : 0.2);
		mergeStage.animate((later) => {
			if (reduced) return true;
			const p = Math.min(1, (later - popStart) / 600);
			const overshoot = 1 + 0.18 * Math.sin(p * Math.PI) * (1 - p);
			result.holder.scale.setScalar((0.2 + 0.8 * (1 - (1 - p) ** 3)) * overshoot);
			return p >= 1;
		});
		merged = true;
		busy = false;
		mergeButton.textContent = "Again";
		return true;
	});
}
mergeButton.addEventListener("click", runMerge);
const recipeButtons = $$<HTMLButtonElement>("[data-recipe]");
function chooseRecipe(index: number, focus = false) {
	recipe = index;
	recipeButtons.forEach((other, i) => {
		other.setAttribute("aria-checked", String(i === index));
		other.tabIndex = i === index ? 0 : -1;
	});
	if (focus) recipeButtons[index].focus();
	busy = false;
	showIngredients();
}
recipeButtons.forEach((button, index) => {
	button.addEventListener("click", () => chooseRecipe(index));
	// Radio group keys: arrows move the choice.
	button.addEventListener("keydown", (event) => {
		const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
		if (!step) return;
		event.preventDefault();
		chooseRecipe((index + step + recipeButtons.length) % recipeButtons.length, true);
	});
});
chooseRecipe(0);

// Turning the 3D stages without dragging: buttons, and arrow keys on the focused stage.
const STAGES: Record<string, Stage> = { tier: growStage, merge: mergeStage };
for (const button of $$<HTMLButtonElement>("[data-turn]")) {
	button.addEventListener("click", () => STAGES[button.dataset.turn!].turn(Number(button.dataset.dir) as -1 | 1));
}
for (const card of $$("[data-stage]")) {
	card.addEventListener("keydown", (event) => {
		if (event.target !== card || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
		event.preventDefault();
		STAGES[card.dataset.stage!].turn(event.key === "ArrowLeft" ? -1 : 1);
	});
}

// ------------------------------------------------------------------ contracts

type Deployed = { category: string; address: string; genesis?: string };
const info = deployment as { network: string; deployed: boolean; forest?: Deployed; directory?: Deployed };
const contracts = $("[data-contracts]");
const short = (value: string) => (value.length > 26 ? `${value.slice(0, 14)}...${value.slice(-8)}` : value);
function row(label: string, value: string, link: string) {
	return `<div><dt>${label}</dt><dd><code title="${value}">${short(value)}</code>
		<button class="mini" type="button" data-copy="${value}" aria-label="Copy ${label.toLowerCase()}">${copyIcon}</button>
		<a class="mini" href="${link}" target="_blank" rel="noopener" aria-label="Open ${label.toLowerCase()} in a block explorer">${openIcon}</a></dd></div>`;
}
if (info.deployed && info.forest && info.directory) {
	contracts.innerHTML = `<span class="network-pill">${info.network === "mainnet" ? "Bitcoin Cash" : "Chipnet test network"}</span>` +
		[["Focus Forest", "Trees and merges", info.forest], ["Focus Directory", "Profile cards", info.directory]].map(([name, role, entry]) => {
			const deployed = entry as Deployed;
			return `<article class="contract"><h3>${name} <small>${role}</small></h3><dl>
				${row("Contract address", deployed.address, `${EXPLORER.address}${deployed.address}`)}
				${row("Token category", deployed.category, `${EXPLORER.tx}${deployed.category}`)}
			</dl></article>`;
		}).join("");
} else {
	contracts.innerHTML = `<div class="pending"><span class="network-pill">${NETWORK === "mainnet" ? "Bitcoin Cash" : "Chipnet test network"}</span><b>Deployment details are pending.</b><p>Their addresses will appear here, so anyone can check every tree against the chain.</p></div>`;
}
contracts.addEventListener("click", async (event) => {
	const button = (event.target as Element).closest<HTMLButtonElement>("[data-copy]");
	if (!button) return;
	try {
		await navigator.clipboard.writeText(button.dataset.copy!);
		button.innerHTML = checkIcon;
		button.classList.add("done");
		setTimeout(() => { button.innerHTML = copyIcon; button.classList.remove("done"); }, 1600);
	} catch {
		button.setAttribute("aria-label", "Copy failed");
	}
});

// ------------------------------------------------------------------ leaderboard

const board = info.deployed && info.forest && info.directory
	? { network: info.network === "mainnet" ? "mainnet" : "chipnet", forest: info.forest, directory: info.directory } satisfies LeaderboardDeployment
	: null;
mountLeaderboard($("[data-leaderboard]"), board, EXPLORER.address);
