"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWeb3ModalConnectorContext } from "@bch-wc2/web3modal-connector";
import type { BaseWallet } from "mainnet-js";
import WalletGuard from "@/components/WalletGuard";
import Background from "@/components/Background";
import Header from "@/components/Header";
import ThreeScene from "@/components/ThreeScene";
import HUD from "@/components/HUD";
import ContractInfoModal from "@/components/ContractInfoModal";
import { usePomodoro } from "@/hooks/usePomodoro";

export default function Home() {
	return <WalletGuard>{wallet => <Garden key={wallet.cashaddr} wallet={wallet} />}</WalletGuard>;
}
function Garden({ wallet }: { wallet: BaseWallet }) {
	const { connector } = useWeb3ModalConnectorContext();
	const { getGarden, mintAndLock, claim, contractAddress, categoryId } = usePomodoro(wallet, connector);
	const [garden, setGarden] = useState<Awaited<ReturnType<typeof getGarden>>>({ trees: [], sessions: [] });
	const [duration, setDuration] = useState(1536);
	const [progress, setProgress] = useState<number | null>(null);
	const transactionPending = useRef(false);
	const [phase, setPhase] = useState<"loading" | "ready" | "signing" | "error">("loading");
	const [message, setMessage] = useState("");
	const [date, setDate] = useState("");
	const [dateBy, setDateBy] = useState("plantedAt");
	const [info, setInfo] = useState(false);
	const refresh = useCallback(async () => {
		const next = await getGarden();
		if (transactionPending.current) return;
		setGarden(next);
		setPhase("ready");
	}, [getGarden]);
	useEffect(() => {
		const load = () => transactionPending.current ? undefined : refresh().catch(error => { setPhase("error"); setMessage(error instanceof Error ? error.message : "Could not load your garden"); });
		load();
		const interval = setInterval(load, 30000);
		return () => clearInterval(interval);
	}, [refresh]);
	const session = garden.sessions[0];
	const visibleTrees = garden.trees.filter(tree => !date || localDay(dateBy === "plantedAt" ? tree.plantedAt : tree.releaseAt) === date);
	async function transact() {
		if (transactionPending.current) return;
		transactionPending.current = true;
		setPhase("signing");
		try {
			if (session) {
				await claim(session.commitment);
				setMessage("Tree claimed. Your garden has grown.");
			} else {
				await mintAndLock(duration);
				setMessage("Tree planted. The blockchain lock begins when it confirms.");
			}
			const next = await getGarden();
			if (session ? next.sessions.some(s => s.commitment === session.commitment) : !next.sessions.length) {
				throw new Error("Transaction sent; waiting for the network to index it. Refresh status before continuing.");
			}
			setGarden(next);
			setPhase("ready");
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Transaction status is uncertain. Refresh before trying again.");
			setPhase("error");
		} finally {
			transactionPending.current = false;
		}
	}
	return <div className="relative h-dvh w-screen overflow-hidden text-ink font-sans">
		<Background /><Header />
		<main className="absolute inset-0"><ThreeScene number={visibleTrees.length} growth={date ? null : progress} className="h-full w-full" /></main>
		<div className="absolute top-24 left-4 z-40 earth-card p-4 max-w-[calc(100%-2rem)] text-xs">
			<div className="flex flex-wrap items-center gap-2">
				<label>Garden by <select aria-label="Filter date type" value={dateBy} onChange={e => setDateBy(e.target.value)} className="rounded bg-white p-1"><option value="plantedAt">Planting day</option><option value="releaseAt">Estimated release day</option></select></label>
				<input aria-label="Garden day" type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded bg-white p-1" />
				<button onClick={() => setDate("")} className="underline">All days</button>
				<button onClick={() => setInfo(true)} className="underline">Contract</button>
			</div>
			<p className="mt-2">{visibleTrees.length} trees shown · Dates use your local timezone. Release dates are estimates.</p>
			{date && !visibleTrees.length ? <p className="mt-1">No trees for this day.</p> : null}
		</div>
		{message ? <div role="status" className="absolute top-48 left-4 right-4 z-40 rounded-xl bg-paper p-3 text-sm max-w-xl">{message}{phase === "error" ? <button className="ml-3 underline" onClick={() => { setPhase("loading"); refresh().catch(() => setPhase("error")); }}>Refresh status</button> : null}</div> : null}
		<HUD duration={duration} setDuration={setDuration} session={session} busy={phase === "signing"} ready={phase === "ready"} onPlant={transact} onClaim={transact} setProgress={setProgress} count={garden.trees.length} />
		{info ? <ContractInfoModal address={contractAddress} categoryId={categoryId} onClose={() => setInfo(false)} /> : null}
	</div>;
}
function localDay(timestamp: number) {
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
