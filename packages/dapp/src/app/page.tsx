"use client";

import type { IConnector, WcSignTransactionRequest } from "@bch-wc2/interfaces";
import { useWeb3ModalConnectorContext } from "@bch-wc2/web3modal-connector";
import { decodeTransaction, hexToBin } from "@bitauth/libauth";
import { useCallback, useEffect, useMemo, useState } from "react";
import ConnectButton from "@/components/ConnectButton";
import ContractInfoModal from "@/components/ContractInfoModal";
import FinishTransactionModal from "@/components/FinishTransactionModal";
import FocusTimer from "@/components/FocusTimer";
import ThreeScene from "@/components/ThreeScene";
import { usePomodoro } from "@/hooks/usePomodoro";
import WalletGuard from "@/components/WalletGuard";
import type { BaseWallet } from "mainnet-js";

export default function Home() {
	return (
		<WalletGuard>{(wallet) => <HomeContent wallet={wallet} />}</WalletGuard>
	);
}

function HomeContent({ wallet }: { wallet: BaseWallet }) {
	const { connector, address } = useWeb3ModalConnectorContext();
	const showError = useCallback((message: string) => {
		setError(message);
		setTimeout(() => setError(""), 10000);
	}, []);

	const wrappedConnector = useMemo(
		() =>
			connector
				? {
						...connector,
						signTransaction: async (options: WcSignTransactionRequest) => {
							setShowFinishTransactionModal(true);
							setFinishTransactionMessage(
								options.userPrompt || "Sign transaction",
							);
							try {
								if (typeof options.transaction === "string") {
									options.transaction = decodeTransaction(
										hexToBin(options.transaction),
									);
								}
								const result = await connector.signTransaction(options);
								return result;
							} catch (e: any) {
								console.error(e);
								// @ts-ignore
								showError(`Unable to sign transaction: ${e.message}`);
							} finally {
								setShowFinishTransactionModal(false);
								setFinishTransactionMessage("");
							}
						},
					}
				: (undefined as IConnector | undefined),
		[connector, showError],
	);
	// const wallet = useWallet(); // Provided by prop now
	const { mintAndLock, claim, getTreeCount, contractAddress, categoryId } =
		usePomodoro(wallet, wrappedConnector);

	const [count, setCount] = useState<number>(0);
	const [showFinishTransactionModal, setShowFinishTransactionModal] =
		useState<boolean>(false);
	const [showContractInfo, setShowContractInfo] = useState<boolean>(false);
	const [finishTransactionMessage, setFinishTransactionMessage] =
		useState<string>("");
	const [error, setError] = useState<string>("");
	const [info, setInfo] = useState<string>("");
	const [timerDuration, setTimerDuration] = useState<number>(25 * 60); // Default 25 minutes
	const [showClaimButton, setShowClaimButton] = useState<boolean>(false);
	const [isClaiming, setIsClaiming] = useState<boolean>(false);

	// New State for Flow
	const [appReady, setAppReady] = useState(false);
	const [isChecking, setIsChecking] = useState(false);
	const [isMinting, setIsMinting] = useState(false);
	const [statusMessage, setStatusMessage] = useState("");

	const showInfo = useCallback((message: string) => {
		setInfo(message);
		setTimeout(() => setInfo(""), 10000);
	}, []);

	// Fetch tree count
	useEffect(() => {
		if (address) {
			getTreeCount().then(setCount);
		}
	}, [address, getTreeCount]);

	const handleWalletConnect = useCallback(async () => {
		if (!address) return;

		setIsChecking(true);
		setStatusMessage("Checking your garden...");

		try {
			setAppReady(true);
		} catch (e: any) {
			console.error("Error in initialization flow:", e);
			showError(`Initialization failed: ${e.message}`);
		} finally {
			setIsChecking(false);
			setIsMinting(false);
			setAppReady(true);
		}
	}, [address, showError]);

	// Trigger flow when address becomes available
	useEffect(() => {
		if (address && !appReady && !isChecking && !isMinting) {
			handleWalletConnect();
		}
	}, [address, appReady, isChecking, isMinting, handleWalletConnect]);

	// If app is not ready, show blank screen or connect button
	if (!appReady) {
		return (
			<div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white">
				<div className="flex flex-col items-center gap-4">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
					<p className="text-lg font-medium text-emerald-200">
						{statusMessage || "Initializing..."}
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="relative h-screen w-screen overflow-hidden bg-gradient-to-br from-[#0f172a] to-[#1e293b] text-white font-sans">
			{/* Background Elements */}
			<div className="absolute inset-0 pointer-events-none">
				<div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-green-500/10 blur-[100px]" />
				<div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-[100px]" />
			</div>

			{/* Modals & Alerts */}
			{showFinishTransactionModal && (
				<FinishTransactionModal
					onClose={() => setShowFinishTransactionModal(false)}
					message={finishTransactionMessage}
				/>
			)}
			{showContractInfo && (
				<ContractInfoModal
					onClose={() => setShowContractInfo(false)}
					address={contractAddress}
					categoryId={categoryId}
				/>
			)}
			{(error.length > 0 || info.length > 0) && (
				<div className="fixed z-50 top-24 left-1/2 transform -translate-x-1/2 flex flex-col items-center w-full max-w-md px-4">
					{error.length > 0 && (
						<button
							type="button"
							onClick={() => setError("")}
							className="w-full mb-2 rounded-xl border border-red-500/30 bg-red-500/10 backdrop-blur-md px-6 py-4 text-red-200 shadow-lg cursor-pointer hover:bg-red-500/20 transition-colors text-left"
						>
							{error}
						</button>
					)}
					{info.length > 0 && (
						<div
							onClick={() => setInfo("")}
							className="w-full mb-2 rounded-xl border border-green-500/30 bg-green-500/10 backdrop-blur-md px-6 py-4 text-green-200 shadow-lg cursor-pointer hover:bg-green-500/20 transition-colors"
						>
							{info}
						</div>
					)}
				</div>
			)}

			{/* Header */}
			<header className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-4 md:px-8 py-6">
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/20">
						<svg
							className="w-6 h-6 text-white"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
							/>
						</svg>
					</div>
					<h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-emerald-200 hidden md:block">
						Focus Garden
					</h1>
				</div>

				<div className="flex items-center gap-4">
					<ConnectButton />
				</div>
			</header>

			{/* Main Stage (3D Scene) */}
			<main className="absolute inset-0 z-0">
				<ThreeScene number={count} className="w-full h-full" />
			</main>

			{/* HUD - Bottom Bar */}
			<div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-40 w-full max-w-2xl px-4">
				<div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-2 shadow-2xl">
					{/* Timer Duration Selector */}
					<div className="flex items-center justify-center gap-2 mb-2 px-4 pt-2">
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
		</div>
	);
}
