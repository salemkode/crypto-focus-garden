"use client";

import type { IConnector, WcSignTransactionRequest } from "@bch-wc2/interfaces";
import { useWeb3ModalConnectorContext } from "@bch-wc2/web3modal-connector";
import { decodeTransaction, hexToBin } from "@bitauth/libauth";
import { useCallback, useEffect, useMemo, useState } from "react";
import ContractInfoModal from "@/components/ContractInfoModal";
import FinishTransactionModal from "@/components/FinishTransactionModal";
import ThreeScene from "@/components/ThreeScene";
import { usePomodoro } from "@/hooks/usePomodoro";
import WalletGuard from "@/components/WalletGuard";
import type { BaseWallet } from "mainnet-js";
import Background from "@/components/Background";
import Header from "@/components/Header";
import HUD from "@/components/HUD";

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
			<Background />

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

			<Header />

			{/* Main Stage (3D Scene) */}
			<main className="absolute inset-0 z-0">
				<ThreeScene number={count} className="w-full h-full" />
			</main>

			<HUD
				timerDuration={timerDuration}
				setTimerDuration={setTimerDuration}
				showClaimButton={showClaimButton}
				setShowClaimButton={setShowClaimButton}
				isClaiming={isClaiming}
				setIsClaiming={setIsClaiming}
				setStatusMessage={setStatusMessage}
				showInfo={showInfo}
				showError={showError}
				mintAndLock={mintAndLock}
				claim={claim}
				getTreeCount={getTreeCount}
				setCount={setCount}
				setShowContractInfo={setShowContractInfo}
			/>
		</div>
	);
}
