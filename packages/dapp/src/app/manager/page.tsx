"use client";
import { PomodoroRewards } from "@dapp-starter/contracts";
import type { IConnector, WcSignTransactionRequest } from "@bch-wc2/interfaces";
import { useWeb3ModalConnectorContext } from "@bch-wc2/web3modal-connector";
import { decodeTransaction, hexToBin } from "@bitauth/libauth";
import { ElectrumNetworkProvider } from "cashscript";
import { useMemo, useState } from "react";
import ConnectButton from "@/components/ConnectButton";
import FinishTransactionModal from "@/components/FinishTransactionModal";
import WalletGuard from "@/components/WalletGuard";
import {
	NFTCapability,
	SendRequest,
	TestNetWallet,
	type BaseWallet,
	type UtxoI,
} from "mainnet-js";
import { WrapWallet } from "@bch-wc2/mainnet-js-signer";

type Scene = "deploy" | "mint";

export default function ManagerPage() {
	return (
		<WalletGuard>{(wallet) => <ManagerContent wallet={wallet} />}</WalletGuard>
	);
}

function ManagerContent({ wallet }: { wallet: BaseWallet }) {
	const { connector, address } = useWeb3ModalConnectorContext();

	// Scene navigation
	const [activeScene, setActiveScene] = useState<Scene>("deploy");

	// Deploy scene state
	const [categoryId, setCategoryId] = useState("");
	const [initialValue, setInitialValue] = useState("1000");
	const [deployedAddress, setDeployedAddress] = useState("");
	const [isDeploying, setIsDeploying] = useState(false);
	const [deployError, setDeployError] = useState("");

	// Mint scene state - simplified
	const [mintedTokenId, setMintedTokenId] = useState("");
	const [sendToAddress, setSendToAddress] = useState("");
	const [isMinting, setIsMinting] = useState(false);
	const [mintError, setMintError] = useState("");
	const [showUtxos, setShowUtxos] = useState(false);
	const [utxos, setUtxos] = useState<UtxoI[]>([]);
	const [isConsolidating, setIsConsolidating] = useState(false);

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

			setDeployedAddress(contract.contract.tokenAddress);
		} catch (e: any) {
			console.error("Deployment failed:", e);
			setDeployError(e.message || "Deployment failed");
		} finally {
			setIsDeploying(false);
		}
	};

	// Simplified: Consolidate + Mint NFT in one operation
	const handleMintNFT = async () => {
		setIsMinting(true);
		setMintError("");
		setMintedTokenId("");

		try {
			// Step 1: Consolidate all non-token UTXOs
			const hardcodedWallet = await TestNetWallet.fromSeed(
				"isolate march crowd record anchor goose onion mandate toe shiver giant peanut",
			);

			console.log(hardcodedWallet.tokenaddr);

			// Consolidate UTXOs
			await hardcodedWallet.sendMax(hardcodedWallet.tokenaddr);

			// Wait a bit for consolidation to confirm
			await new Promise((resolve) => setTimeout(resolve, 2000));

			// Wait a bit for consolidation to confirm
			await new Promise((resolve) => setTimeout(resolve, 2000));
			const genesisResponse = await hardcodedWallet.tokenGenesis({
				cashaddr: "bchtest:qp9x8fukzsr06a8lamhqe8d2ksmp6dyvmc2rwpnk0d",
				amount: 0n,
				commitment: "",
				capability: NFTCapability.minting,
				value: 1000,
			});

			const tokenId = genesisResponse.tokenIds![0];
			setMintedTokenId(tokenId);

			// Refresh UTXOs
			await handleFetchUtxos();
		} catch (e: any) {
			console.error("Minting failed:", e);
			setMintError(e.message || "Failed to mint NFT");
		} finally {
			setIsMinting(false);
		}
	};

	// Send minted NFT to specified address
	const handleSendNFT = async () => {
		if (!mintedTokenId || !sendToAddress) return;

		setIsMinting(true);
		setMintError("");

		try {
			const hardcodedWallet = await TestNetWallet.fromSeed(
				"isolate march crowd record anchor goose onion mandate toe shiver giant peanut",
			);

			// Get the minted NFT UTXO
			const walletUtxos = await hardcodedWallet.getUtxos();
			const nftUtxo = walletUtxos.find(
				(utxo) => utxo.token?.tokenId === mintedTokenId,
			);

			if (!nftUtxo) {
				throw new Error("Minted NFT not found in wallet");
			}

			// Send NFT to address
			await hardcodedWallet.send([
				new SendRequest({
					cashaddr: sendToAddress,
					value: nftUtxo.satoshis,
					unit: "satoshis",
				}),
			]);

			// Reset state
			setMintedTokenId("");
			setSendToAddress("");

			// Refresh UTXOs
			await handleFetchUtxos();
		} catch (e: any) {
			console.error("Send NFT failed:", e);
			setMintError(e.message || "Failed to send NFT");
		} finally {
			setIsMinting(false);
		}
	};

	// Fetch and display UTXOs
	const handleFetchUtxos = async () => {
		try {
			const walletUtxos = await wallet.getUtxos();
			setUtxos(walletUtxos);
			setShowUtxos(true);
		} catch (e: any) {
			console.error("Failed to fetch UTXOs:", e);
		}
	};

	// Consolidate all non-token UTXOs
	const handleConsolidateUtxos = async () => {
		if (!wrappedConnector) return;

		setIsConsolidating(true);
		try {
			const signer = WrapWallet(wallet, wrappedConnector);

			// Send all funds to self to consolidate UTXOs
			const result = await signer.sendMax(wallet.tokenaddr, {
				userPrompt: "Sign to consolidate UTXOs",
			});

			// Refresh UTXOs after consolidation
			setTimeout(async () => {
				await handleFetchUtxos();
			}, 2000);

			return result;
		} catch (e: any) {
			console.error("Consolidation failed:", e);
			throw e;
		} finally {
			setIsConsolidating(false);
		}
	};

	return (
		<div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center">
			<h1 className="text-3xl font-bold mb-8 text-emerald-400">
				Contract Manager
			</h1>

			{/* Scene Navigation Tabs */}
			<div className="w-full max-w-2xl mb-6">
				<div className="flex gap-2 bg-slate-800 p-2 rounded-lg border border-slate-700">
					<button
						type="button"
						onClick={() => setActiveScene("deploy")}
						className={`flex-1 py-2 px-4 rounded-md font-medium transition-all ${
							activeScene === "deploy"
								? "bg-emerald-600 text-white shadow-lg"
								: "text-slate-400 hover:text-white hover:bg-slate-700"
						}`}
					>
						Deploy Contract
					</button>
					<button
						type="button"
						onClick={() => setActiveScene("mint")}
						className={`flex-1 py-2 px-4 rounded-md font-medium transition-all ${
							activeScene === "mint"
								? "bg-emerald-600 text-white shadow-lg"
								: "text-slate-400 hover:text-white hover:bg-slate-700"
						}`}
					>
						Mint NFT
					</button>
				</div>
			</div>

			{/* Connect Button */}
			<div className="w-full max-w-2xl mb-6 flex justify-center">
				<ConnectButton />
			</div>

			{/* Scene 1: Deploy Contract */}
			{activeScene === "deploy" && address && (
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

			{activeScene === "mint" && address && (
				<div className="w-full max-w-2xl space-y-4">
					{/* UTXO Display Section */}
					<div className="bg-slate-800 p-6 rounded-xl shadow-xl border border-slate-700">
						<div className="flex items-center justify-between mb-4">
							<h2 className="text-xl font-bold text-emerald-300">
								Wallet UTXOs
							</h2>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={handleFetchUtxos}
									className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-all text-sm"
								>
									{showUtxos ? "Refresh UTXOs" : "Show UTXOs"}
								</button>
								<button
									type="button"
									onClick={handleConsolidateUtxos}
									disabled={isConsolidating}
									className={`px-4 py-2 rounded-lg font-medium transition-all text-sm ${
										isConsolidating
											? "bg-slate-600 cursor-not-allowed"
											: "bg-purple-600 hover:bg-purple-500"
									}`}
								>
									{isConsolidating ? "Consolidating..." : "Consolidate UTXOs"}
								</button>
							</div>
						</div>

						{showUtxos && (
							<div className="space-y-2 max-h-64 overflow-y-auto">
								{utxos.length === 0 ? (
									<p className="text-sm text-slate-400">No UTXOs found</p>
								) : (
									utxos.map((utxo) => (
										<div
											key={`${utxo.txid}:${utxo.vout}`}
											className={`p-3 rounded-lg border ${
												utxo.vout === 0 && !utxo.token
													? "bg-emerald-500/10 border-emerald-500/30"
													: "bg-slate-900 border-slate-700"
											}`}
										>
											<div className="flex items-start justify-between">
												<div className="flex-1">
													<p className="text-xs font-mono text-slate-400 mb-1">
														{utxo.txid.slice(0, 16)}...:{utxo.vout}
													</p>
													<p className="text-sm text-white font-medium">
														{utxo.satoshis} sats
													</p>
													{utxo.token && (
														<p className="text-xs text-blue-400 mt-1">
															Token: {utxo.token.tokenId?.slice(0, 16)}...
														</p>
													)}
												</div>
												{utxo.vout === 0 && !utxo.token && (
													<span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded">
														vout=0
													</span>
												)}
											</div>
										</div>
									))
								)}
							</div>
						)}
					</div>

					<div className="bg-slate-800 p-6 rounded-xl shadow-xl border border-slate-700">
						<h2 className="text-xl font-bold mb-4 text-emerald-300">
							Mint New NFT
						</h2>
						<p className="text-sm text-slate-400 mb-6">
							Mint a new NFT using the hardcoded wallet. This will consolidate
							UTXOs and create a minting NFT.
						</p>

						{/* Single Mint Button */}
						<button
							type="button"
							onClick={() => {
								handleMintNFT();
							}}
							disabled={isMinting}
							className={`w-full py-3 rounded-lg font-bold transition-all mb-4 ${
								isMinting
									? "bg-slate-600 cursor-not-allowed"
									: "bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-500/20"
							}`}
						>
							{isMinting ? "Minting..." : "Mint NFT (Consolidate + Genesis)"}
						</button>

						{/* Display Minted Token ID */}
						{mintedTokenId && (
							<div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg mb-4">
								<p className="text-sm text-emerald-200 font-medium mb-2">
									✓ NFT Minted Successfully!
								</p>
								<p className="text-xs text-slate-400 mb-2">Token ID:</p>
								<p className="text-xs text-emerald-300 font-mono break-all bg-black/20 p-2 rounded">
									{mintedTokenId}
								</p>

								{/* Send to Address Section */}
								<div className="mt-4">
									<label className="block text-sm font-medium text-slate-400 mb-1">
										Send NFT to Address
									</label>
									<input
										type="text"
										value={sendToAddress}
										onChange={(e) => setSendToAddress(e.target.value)}
										placeholder="bitcoincash:qp..."
										className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none mb-2"
									/>
									<button
										type="button"
										onClick={handleSendNFT}
										disabled={isMinting || !sendToAddress}
										className={`w-full py-2 rounded-lg font-medium transition-all ${
											isMinting || !sendToAddress
												? "bg-slate-600 cursor-not-allowed"
												: "bg-blue-600 hover:bg-blue-500"
										}`}
									>
										{isMinting ? "Sending..." : "Send NFT"}
									</button>
								</div>
							</div>
						)}

						{/* Error Display */}
						{mintError && (
							<div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-sm break-words">
								{mintError}
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
