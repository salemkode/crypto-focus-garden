import { useWallet } from "../hooks/useWallet";
import ConnectButton from "./ConnectButton";
import type { BaseWallet } from "mainnet-js";

interface WalletGuardProps {
	children: (wallet: BaseWallet) => React.ReactNode;
}

export default function WalletGuard({ children }: WalletGuardProps) {
	const wallet = useWallet();

	if (!wallet) {
		return (
			<div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white">
				<div className="flex flex-col items-center gap-6">
					<h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-500">
						Welcome to Focus Garden
					</h1>
					<p className="text-slate-400 max-w-md text-center">
						Connect your wallet to enter your personal focus sanctuary.
					</p>
					<ConnectButton />
				</div>
			</div>
		);
	}

	return <>{children(wallet)}</>;
}
