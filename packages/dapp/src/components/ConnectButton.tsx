"use client";

import { useWatchAddress } from "@/hooks/useWatchAddress";
import { useWeb3ModalConnectorContext } from "@bch-wc2/web3modal-connector";
import React, { useCallback, useState } from "react";

const ConnectButton: React.FC = () => {
	const { address, connect, disconnect, isConnected } =
		useWeb3ModalConnectorContext();
	const [loading, setLoading] = useState(false);
	const { balance, refetch } = useWatchAddress(address || "");

	const connectWallet = useCallback(async () => {
		if (!connect) {
			return;
		}

		try {
			setLoading(true);
			await connect();
		} catch {
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
		} catch {
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
		<div className="inline-flex flex-col">
			{isConnected ? (
				<div className="flex flex-row items-center gap-2 rounded-2xl bg-paper/95 py-2 pl-4 pr-2 shadow-[0_4px_0_rgb(29_58_42/0.18)]">
					<div className="flex flex-col leading-tight">
						<span className="text-[11px] font-mono text-ink-soft">
							{formatAddress(address || "")}
						</span>
						<span className="text-sm font-extrabold text-ink">
							{formatBalance(balance ?? 0)}
						</span>
					</div>
					<button
						type="button"
						onClick={() => refetch()}
						className="block-btn block-btn--sm block-btn--sand ml-1 p-2"
						title="Refresh balance"
						aria-label="Refresh balance"
					>
						<svg
							className="w-4 h-4"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2.5}
								d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
							/>
						</svg>
					</button>
					<button
						type="button"
						onClick={disconnectWallet}
						disabled={loading}
						className="block-btn block-btn--sm block-btn--sand px-3 py-2.5 text-xs"
					>
						{loading ? "…" : "Disconnect"}
					</button>
				</div>
			) : (
				<button
					type="button"
					onClick={connectWallet}
					disabled={loading}
					className={`block-btn px-6 py-3.5 text-[15px] ${loading ? "block-btn--wait" : ""}`}
				>
					{loading ? "Connecting…" : "Connect wallet"}
				</button>
			)}
		</div>
	);
};

export default ConnectButton;
