"use client";
/**
 * DEV-ONLY PAGE: This manager page is for development purposes only.
 * 
 * IMPORTANT: The contract must be one for the whole app. This means:
 * - Use the same Category ID (NEXT_PUBLIC_POMODORO_CATEGORY_ID) across the entire application
 * - The contract address is deterministic based on the Category ID
 * - All parts of the app (main app, manager page) must use the same Category ID from constants
 * - Do NOT deploy multiple contracts with different Category IDs - use one contract instance
 * 
 * This page allows developers to:
 * - Deploy the PomodoroRewards contract
 * 
 * For production, contract deployment should be done separately and the Category ID
 * should be set via environment variables.
 */
import { PomodoroRewards } from "@dapp-starter/contracts";
import type { IConnector, WcSignTransactionRequest } from "@bch-wc2/interfaces";
import { useWeb3ModalConnectorContext } from "@bch-wc2/web3modal-connector";
import { decodeTransaction, hexToBin } from "@bitauth/libauth";
import { ElectrumNetworkProvider } from "cashscript";
import { useMemo, useState } from "react";
import ConnectButton from "@/components/ConnectButton";
import FinishTransactionModal from "@/components/FinishTransactionModal";
import WalletGuard from "@/components/WalletGuard";
import type { BaseWallet } from "mainnet-js";

// Flag to indicate this is a dev-only page
const IS_DEV_ONLY_PAGE = true;

export default function ManagerPage() {
	return (
		<WalletGuard>{(wallet) => <ManagerContent wallet={wallet} />}</WalletGuard>
	);
}

function ManagerContent({ wallet }: { wallet: BaseWallet }) {
	const { connector, address } = useWeb3ModalConnectorContext();

	// Deploy state
	const [categoryId, setCategoryId] = useState("");
	const [initialValue, setInitialValue] = useState("1000");
	const [deployedAddress, setDeployedAddress] = useState("");
	const [isDeploying, setIsDeploying] = useState(false);
	const [deployError, setDeployError] = useState("");

	// Shared state
	const [showFinishTransactionModal, setShowFinishTransactionModal] =
		useState<boolean>(false);
	const [finishTransactionMessage, setFinishTransactionMessage] =
		useState<string>("");

	const provider = useMemo(() => new ElectrumNetworkProvider("chipnet"), []);

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
								throw e;
							} finally {
								setShowFinishTransactionModal(false);
								setFinishTransactionMessage("");
							}
						},
					}
				: (undefined as IConnector | undefined),
		[connector],
	);

	// Deploy Contract Handler
	// NOTE: The Category ID used here should match NEXT_PUBLIC_POMODORO_CATEGORY_ID
	// to ensure the contract is one for the whole app
	const handleDeploy = async () => {
		if (!address || !wrappedConnector) {
			setDeployError("Please connect your wallet first.");
			return;
		}
		if (!categoryId) {
			setDeployError("Please enter a Category ID.");
			return;
		}

		setIsDeploying(true);
		setDeployError("");
		setDeployedAddress("");

		try {
			const contract = await PomodoroRewards.deploy({
				wallet: wallet,
				provider,
				connector: wrappedConnector,
				categoryId,
				value: BigInt(initialValue),
			});

			setDeployedAddress(
				contract.contract.tokenAddress + "\n" + contract.contract.address,
			);
		} catch (e: any) {
			console.error("Deployment failed:", e);
			setDeployError(e.message || "Deployment failed");
		} finally {
			setIsDeploying(false);
		}
	};

	return (
		<div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center">
			{IS_DEV_ONLY_PAGE && (
				<div className="w-full max-w-2xl mb-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
					<p className="text-sm text-yellow-200 font-medium">
						⚠️ DEV-ONLY PAGE: This page is for development purposes only.
					</p>
					<p className="text-xs text-yellow-300/80 mt-1">
						Ensure the contract uses the same Category ID as the main app (from NEXT_PUBLIC_POMODORO_CATEGORY_ID).
					</p>
				</div>
			)}
			<h1 className="text-3xl font-bold mb-8 text-emerald-400">
				Contract Manager
			</h1>

			{/* Connect Button */}
			<div className="w-full max-w-2xl mb-6 flex justify-center">
				<ConnectButton />
			</div>

			{/* Deploy Contract Section */}
			{address && (
				<div className="w-full max-w-2xl bg-slate-800 p-6 rounded-xl shadow-xl border border-slate-700">
					<h2 className="text-xl font-bold mb-4 text-emerald-300">
						Deploy PomodoroRewards Contract
					</h2>

					<div className="space-y-4">
						<div>
							<label className="block text-sm font-medium text-slate-400 mb-1">
								Category ID
							</label>
							<input
								type="text"
								value={categoryId}
								onChange={(e) => setCategoryId(e.target.value)}
								placeholder="e.g. 62b2..."
								className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
							/>
							<p className="text-xs text-slate-500 mt-1">
								The Token Category ID for the rewards.
							</p>
						</div>

						<div>
							<label className="block text-sm font-medium text-slate-400 mb-1">
								Initial Value (Satoshis)
							</label>
							<input
								type="number"
								value={initialValue}
								onChange={(e) => setInitialValue(e.target.value)}
								className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
							/>
						</div>

						<button
							type="button"
							onClick={handleDeploy}
							disabled={isDeploying}
							className={`w-full py-3 rounded-lg font-bold transition-all ${
								isDeploying
									? "bg-slate-600 cursor-not-allowed"
									: "bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-500/20"
							}`}
						>
							{isDeploying ? "Deploying..." : "Deploy Contract"}
						</button>

						{deployError && (
							<div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-sm break-words">
								{deployError}
							</div>
						)}

						{deployedAddress && (
							<div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
								<p className="text-sm text-emerald-200 font-medium mb-2">
									Contract Deployed!
								</p>
								<p className="text-xs text-emerald-100 break-all font-mono bg-black/20 p-2 rounded">
									{deployedAddress}
								</p>
								<p className="text-xs text-slate-400 mt-2">
									Copy this address and the Category ID to your env variables.
								</p>
							</div>
						)}
					</div>
				</div>
			)}

			{showFinishTransactionModal && (
				<FinishTransactionModal
					onClose={() => setShowFinishTransactionModal(false)}
					message={finishTransactionMessage}
				/>
			)}
		</div>
	);
}
