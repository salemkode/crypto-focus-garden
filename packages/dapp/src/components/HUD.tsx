import FocusTimer from "@/components/FocusTimer";
import { useState } from "react";

interface HUDProps {
	timerDuration: number;
	setTimerDuration: (duration: number) => void;
	showClaimButton: boolean;
	setShowClaimButton: (show: boolean) => void;
	isClaiming: boolean;
	setIsClaiming: (isClaiming: boolean) => void;
	setStatusMessage: (message: string) => void;
	showInfo: (message: string) => void;
	showError: (message: string) => void;
	mintAndLock: () => Promise<any>;
	claim: (commitment: string, pubkey: string) => Promise<any>;
	getTreeCount: () => Promise<number>;
	setCount: (count: number) => void;
	setShowContractInfo: (show: boolean) => void;
}

export default function HUD({
	timerDuration,
	setTimerDuration,
	showClaimButton,
	setShowClaimButton,
	isClaiming,
	setIsClaiming,
	setStatusMessage,
	showInfo,
	showError,
	mintAndLock,
	claim,
	getTreeCount,
	setCount,
	setShowContractInfo,
}: HUDProps) {
	return (
		<div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-40 w-full max-w-2xl px-4">
			<div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-4 shadow-2xl">
				{/* Timer Duration Selector */}
				<div className="flex items-center justify-center gap-2 mb-2 px-4">
					<span className="text-xs text-zinc-400 font-medium">Duration:</span>
					<button
						type="button"
						onClick={() => setTimerDuration(1)}
						className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
							timerDuration === 1
								? "bg-emerald-500 text-white"
								: "bg-white/5 text-zinc-400 hover:bg-white/10"
						}`}
					>
						1 sec <span className="text-[10px] opacity-70">(testing)</span>
					</button>
					<button
						type="button"
						onClick={() => setTimerDuration(60)}
						className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
							timerDuration === 60
								? "bg-emerald-500 text-white"
								: "bg-white/5 text-zinc-400 hover:bg-white/10"
						}`}
					>
						1 min
					</button>
					<button
						type="button"
						onClick={() => setTimerDuration(25 * 60)}
						className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
							timerDuration === 25 * 60
								? "bg-emerald-500 text-white"
								: "bg-white/5 text-zinc-400 hover:bg-white/10"
						}`}
					>
						25 min
					</button>
					<button
						type="button"
						onClick={() => setTimerDuration(50 * 60)}
						className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
							timerDuration === 50 * 60
								? "bg-emerald-500 text-white"
								: "bg-white/5 text-zinc-400 hover:bg-white/10"
						}`}
					>
						50 min
					</button>
				</div>

				<div className="flex items-center justify-between gap-4">
					{/* Focus Timer Integration */}
					<div className="flex-1">
						<FocusTimer
							duration={timerDuration}
							onStart={async () => {
								try {
									setStatusMessage("Planting a tree...");
									setShowClaimButton(false);
									const result = await mintAndLock();
									localStorage.setItem(
										"pomodoro_commitment",
										result.commitment,
									);
									localStorage.setItem("pomodoro_pubkey", result.pubkey);
									localStorage.setItem(
										"pomodoro_locktime",
										result.locktime.toString(),
									);
									setStatusMessage("Tree planted! Focus to grow it.");
									showInfo("Tree planted! Focus to grow it.");
								} catch (e: any) {
									console.error(e);
									showError(`Failed to plant tree: ${e.message}`);
									throw e; // Re-throw error so FocusTimer knows it failed
								}
							}}
							onEnd={async () => {
								setShowClaimButton(true);
								setStatusMessage(
									"Focus session complete! Click Claim to harvest.",
								);
								showInfo(
									"Focus session complete! Click Claim to harvest your tree.",
								);
							}}
						/>
					</div>

					{/* Claim Button - appears after timer ends */}
					{showClaimButton && (
						<button
							type="button"
							onClick={async () => {
								try {
									setIsClaiming(true);
									setStatusMessage("Harvesting your tree...");
									const commitment = localStorage.getItem(
										"pomodoro_commitment",
									);
									const pubkey = localStorage.getItem("pomodoro_pubkey");
									if (commitment && pubkey) {
										await claim(commitment, pubkey);
										setStatusMessage("Tree harvested!");
										showInfo("Tree harvested! You earned a reward.");
										localStorage.removeItem("pomodoro_commitment");
										localStorage.removeItem("pomodoro_pubkey");
										localStorage.removeItem("pomodoro_locktime");
										setShowClaimButton(false);
										// Refresh tree count
										getTreeCount().then(setCount);
									} else {
										showError("No tree found to harvest.");
									}
								} catch (e: any) {
									console.error(e);
									showError(`Failed to harvest tree: ${e.message}`);
								} finally {
									setIsClaiming(false);
								}
							}}
							disabled={isClaiming}
							className={`px-6 py-3 rounded-xl font-semibold transition-all shadow-lg ${
								isClaiming
									? "bg-yellow-500/20 text-yellow-200 border border-yellow-500/30 cursor-wait"
									: "bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:from-emerald-600 hover:to-green-700 border border-emerald-400/50 shadow-emerald-500/20 animate-pulse"
							}`}
						>
							{isClaiming ? "Claiming..." : "🌳 Claim Tree"}
						</button>
					)}

					<button
						onClick={() => setShowContractInfo(true)}
						className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white transition-all"
						title="Contract Info"
					>
						<svg
							className="w-5 h-5"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					</button>
				</div>
			</div>
		</div>
	);
}
