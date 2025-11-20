"use client";

import type { IConnector, WcSignTransactionRequest } from "@bch-wc2/interfaces";
import { useWeb3ModalConnectorContext } from "@bch-wc2/web3modal-connector";
import { decodeTransaction, hexToBin } from "@bitauth/libauth";
import { useCallback, useMemo, useState } from "react";
import ConnectButton from "@/components/ConnectButton";
import FinishTransactionModal from "@/components/FinishTransactionModal";
import FocusTimer from "@/components/FocusTimer";
import P2PKHView from "@/components/P2PKHView";
import ThreeScene from "@/components/ThreeScene";

export default function Home() {
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
							} catch (e) {
								console.error(e);
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

	const [count, setCount] = useState<number>(10);
	const [showFinishTransactionModal, setShowFinishTransactionModal] =
		useState<boolean>(false);
	const [finishTransactionMessage, setFinishTransactionMessage] =
		useState<string>("");
	const [error, setError] = useState<string>("");
	const [info, setInfo] = useState<string>("");
	const [showWallet, setShowWallet] = useState(false);

	const showInfo = useCallback((message: string) => {
		setInfo(message);
		setTimeout(() => setInfo(""), 10000);
	}, []);

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
			<header className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-8 py-6">
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
					<h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-emerald-200">
						Focus Garden
					</h1>
				</div>

				<div className="flex items-center gap-4">
					<button
						onClick={() => setShowWallet(!showWallet)}
						className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 backdrop-blur-sm transition-all text-sm font-medium"
					>
						{showWallet ? "Hide Wallet" : "Show Wallet"}
					</button>
					<ConnectButton />
				</div>
			</header>

			{/* Main Stage (3D Scene) */}
			<main className="absolute inset-0 z-0">
				<ThreeScene number={count} className="w-full h-full" />
			</main>

			{/* HUD - Bottom Bar */}
			<div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-40 w-full max-w-2xl px-4">
				<div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-2 shadow-2xl flex items-center justify-between gap-4">
					{/* Focus Timer Integration */}
					<div className="flex-1">
						<FocusTimer />
					</div>

					{/* Quick Actions */}
					<div className="flex flex-col gap-2 pr-4 border-l border-white/10 pl-4">
						<div className="text-xs text-zinc-400 font-medium uppercase tracking-wider">
							Garden Controls
						</div>
						<button
							onClick={() => setCount(count + 1)}
							className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-200 text-sm font-semibold transition-all flex items-center gap-2"
						>
							<svg
								className="w-4 h-4"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M12 6v6m0 0v6m0-6h6m-6 0H6"
								/>
							</svg>
							Add Tree
						</button>
					</div>
				</div>
			</div>

			{/* Wallet Panel (Slide-over) */}
			<div
				className={`absolute top-24 right-8 z-30 w-96 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl transition-all duration-300 transform ${showWallet ? "translate-x-0 opacity-100" : "translate-x-[120%] opacity-0"}`}
			>
				<h2 className="text-xl font-bold mb-4 text-white">Wallet Details</h2>
				<P2PKHView
					address={address}
					connector={wrappedConnector}
					showError={showError}
					showInfo={showInfo}
				/>
			</div>
		</div>
	);
}
