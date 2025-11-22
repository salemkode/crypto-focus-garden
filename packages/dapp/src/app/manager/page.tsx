import { PomodoroRewards } from "@dapp-starter/contracts";
import type { IConnector, WcSignTransactionRequest } from "@bch-wc2/interfaces";
import { useWeb3ModalConnectorContext } from "@bch-wc2/web3modal-connector";
import {
	decodeTransaction,
	hexToBin,
	binToHex,
	cashAddressToLockingBytecode,
} from "@bitauth/libauth";
import { ElectrumNetworkProvider } from "cashscript";
import { useCallback, useMemo, useState } from "react";
import ConnectButton from "@/components/ConnectButton";
import FinishTransactionModal from "@/components/FinishTransactionModal";

export default function ManagerPage() {
	const { connector, address } = useWeb3ModalConnectorContext();

	const [categoryId, setCategoryId] = useState("");
	const [initialValue, setInitialValue] = useState("1000");
	const [deployedAddress, setDeployedAddress] = useState("");
	const [isDeploying, setIsDeploying] = useState(false);
	const [error, setError] = useState("");
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
							} catch (e) {
								console.error(e);
								setError(`Unable to sign transaction: ${e.message}`);
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

	const handleDeploy = async () => {
		if (!address || !wrappedConnector) {
			setError("Please connect your wallet first.");
			return;
		}
		if (!categoryId) {
			setError("Please enter a Category ID.");
			return;
		}

		setIsDeploying(true);
		setError("");
		setDeployedAddress("");

		try {
			// Derive PKH from address
			const lockScriptResult = cashAddressToLockingBytecode(address);
			if (typeof lockScriptResult === "string") {
				throw new Error(`Invalid address: ${lockScriptResult}`);
			}
			const bytecode = lockScriptResult.bytecode;

			// Check if P2PKH (starts with 76a914... and ends with 88ac, length 25)
			// 0x76 = OP_DUP, 0xa9 = OP_HASH160, 0x14 = Push 20 bytes, ... 0x88 = OP_EQUALVERIFY, 0xac = OP_CHECKSIG
			// Bytecode length for P2PKH is 25 bytes.
			let pkhHex = "";
			if (
				bytecode.length === 25 &&
				bytecode[0] === 0x76 &&
				bytecode[1] === 0xa9
			) {
				const pkh = bytecode.slice(3, 23);
				pkhHex = binToHex(pkh);
			} else {
				// If not P2PKH, we might be in trouble if the contract expects a PKH.
				// But for now, let's assume P2PKH or try to extract if it's P2SH (scripthash).
				// If it's P2SH, it's 17...87.
				// But PomodoroRewards likely expects a User PKH to verify signatures against.
				// If we pass a script hash, it might not work as intended if the contract checks checksig.
				// Let's assume P2PKH for now as it's the standard for wallets.
				// If extraction fails, we throw.
				throw new Error(
					"Address must be P2PKH to deploy this contract (need Public Key Hash).",
				);
			}

			const walletMock = {
				getPublicKeyHash: () => {
					return pkhHex;
				},
				getPublicKeyCompressed: async () => {
					return new Uint8Array(33); // Placeholder, might not be needed for deploy if only funding
				},
			} as any;

			const contract = await PomodoroRewards.deploy({
				wallet: walletMock,
				provider,
				connector: wrappedConnector,
				categoryId,
				value: BigInt(initialValue),
			});

			setDeployedAddress(contract.contract.address);
		} catch (e: any) {
			console.error("Deployment failed:", e);
			setError(e.message || "Deployment failed");
		} finally {
			setIsDeploying(false);
		}
	};

	return (
		<div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center">
			<h1 className="text-3xl font-bold mb-8 text-emerald-400">
				Contract Manager
			</h1>

			<div className="w-full max-w-md bg-slate-800 p-6 rounded-xl shadow-xl border border-slate-700">
				<div className="mb-6 flex justify-center">
					<ConnectButton />
				</div>

				{address && (
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

						{error && (
							<div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-sm break-words">
								{error}
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
				)}
			</div>

			{showFinishTransactionModal && (
				<FinishTransactionModal
					onClose={() => setShowFinishTransactionModal(false)}
					message={finishTransactionMessage}
				/>
			)}
		</div>
	);
}
