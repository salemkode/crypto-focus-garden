import FocusTimer from "./FocusTimer";
import type { usePomodoro } from "@/hooks/usePomodoro";

type Garden = Awaited<ReturnType<ReturnType<typeof usePomodoro>["getGarden"]>>;
export default function HUD({ duration, setDuration, session, busy, ready, onPlant, onClaim, setProgress, count }: {
	duration: number; setDuration: (value: number) => void;
	session?: Garden["sessions"][number]; busy: boolean; ready: boolean;
	onPlant: () => void; onClaim: () => void;
	setProgress: (value: number | null) => void; count: number;
}) {
	return <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 w-full max-w-2xl px-4">
		<div className="earth-card px-5 pb-5 pt-6">
			<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
				<p className="text-sm font-extrabold">{count ? `${count} earned trees` : "No trees yet · Start your first session"}</p>
				<div role="group" aria-label="Session length" className="flex gap-2">
					{[1536, 3072].map(seconds => <button key={seconds} disabled={busy || !ready || session !== undefined} aria-pressed={duration === seconds} onClick={() => setDuration(seconds)} className={`block-btn block-btn--sm px-3 py-2 text-xs ${duration === seconds ? "block-btn--ink" : "block-btn--sand"}`}>{seconds === 1536 ? "25m 36s" : "51m 12s"}</button>)}
				</div>
			</div>
			<div className="flex items-end gap-4">
				<FocusTimer duration={session?.duration ?? duration} releaseAt={session?.releaseAt} onProgress={setProgress} />
				<button disabled={busy || !ready} onClick={session ? onClaim : onPlant} className="block-btn px-4 py-3 text-sm">{busy ? "Check wallet…" : !ready ? "Loading…" : session ? "Try claim" : "Plant a tree"}</button>
			</div>
			{session ? <p className="mt-2 text-xs text-ink-soft">The network rejects early claims. If it is still locked, wait for more blocks and try again.</p> : null}
		</div>
	</div>;
}
