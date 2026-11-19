"use client";
import { useEffect, useState } from "react";

export default function FocusTimer({ duration, releaseAt, onProgress }: {
	duration: number;
	releaseAt?: number;
	onProgress: (progress: number | null) => void;
}) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);
	const remaining = releaseAt ? Math.max(0, Math.ceil((releaseAt - now) / 1000)) : duration;
	const progress = releaseAt ? Math.min(1, Math.max(0, 1 - remaining / duration)) : null;
	useEffect(() => { onProgress(progress); }, [progress, onProgress]);
	return <div className="min-w-0 flex-1">
		<p className="mb-1 text-xs font-extrabold uppercase text-ink-soft">{releaseAt ? "Growing your tree" : "Plant your next session"}</p>
		<div role="timer" className="font-display text-4xl text-ink">{Math.floor(remaining / 60).toString().padStart(2, "0")}:{(remaining % 60).toString().padStart(2, "0")}</div>
		<progress aria-label="Tree growth" className="mt-2 w-full accent-green-700" value={progress ?? 0} max={1} />
		<p className="mt-1 text-xs text-ink-soft">{releaseAt ? "Estimated countdown. Claiming waits for blockchain maturity; the lock cannot be paused or reset." : "Your empty garden grows one earned tree at a time."}</p>
	</div>;
}
