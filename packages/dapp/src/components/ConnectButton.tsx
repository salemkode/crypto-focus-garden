"use client";

import { useWatchAddress } from "@/hooks/useWatchAddress";
import { useWeb3ModalConnectorContext } from "@bch-wc2/web3modal-connector";
import React, { useCallback, useState } from "react";

const ConnectButton: React.FC = () => {
	const { address, connect, disconnect, isConnected } =
		useWeb3ModalConnectorContext();
	const [loading, setLoading] = useState(false);
	const { balance } = useWatchAddress(address || "");

	const connectWallet = useCallback(async () => {
		if (!connect) {
			return;
		}

		try {
			setLoading(true);
			await connect();
		} catch (err) {
			alert("Failed to connect wallet.");
		}
		setLoading(false);
	}, [connect]);

	const disconnectWallet = useCallback(async () => {
		if (!disconnect) {
			return;
		}

		try {
			setLoading(true);
			await disconnect();
		} catch (err) {
			alert("Failed to disconnect wallet.");
		}
		setLoading(false);
	}, [disconnect]);

	// Format address: bchtest:qq...xxx -> bchtest:{5}...{3}
	const formatAddress = (addr: string) => {
		if (!addr) return "";
		if (addr.length <= 13) return addr; // Should not happen for valid addresses
		// bchtest: is 8 chars.
		// We want prefix + 5 chars + ... + 3 chars
		// Actually, let's just take the first 13 chars and the last 3.
		// Example: bchtest:qqqqq...qqq
		return `${addr.slice(0, 13)}...${addr.slice(-3)}`;
	};

	// Format balance: Always show BCH
	const formatBalance = (bal: number) => {
		if (bal === undefined || bal === null) return "0 BCH";
		const bch = bal / 1e8;
		return `${bch.toLocaleString("en-US", { maximumFractionDigits: 8 })} BCH`;
	};

	return (
		<div className="flex flex-col w-full">
			{isConnected ? (
				<div className="flex flex-row items-center gap-4">
					<div className="flex flex-col items-end md:items-start">
						<span className="text-sm font-mono text-emerald-200/80">
							{formatAddress(address || "")}
						</span>
						<span className="text-xs font-bold text-white">
							{formatBalance(balance ?? 0)}
						</span>
					</div>
					<button
						onClick={disconnectWallet}
						disabled={loading}
						className={`px-4 py-2 rounded-xl font-bold text-white text-sm transition-all shadow-lg ${
							loading
								? "bg-slate-600 cursor-not-allowed"
								: "bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-200"
						}`}
					>
						{loading ? "..." : "Disconnect"}
					</button>
				</div>
			) : (
				<button
					onClick={connectWallet}
					disabled={loading}
					className={`px-6 py-2.5 rounded-xl font-bold text-white text-sm transition-all shadow-lg ${
						loading
							? "bg-slate-600 cursor-not-allowed"
							: "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20"
					}`}
				>
					{loading ? "Connecting..." : "Connect Wallet"}
				</button>
			)}
		</div>
	);
};

export default ConnectButton;
