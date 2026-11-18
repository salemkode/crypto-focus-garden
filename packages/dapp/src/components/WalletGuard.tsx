import { useWallet } from "../hooks/useWallet";
import Background from "./Background";
import ConnectButton from "./ConnectButton";
import ThreeScene from "./ThreeScene";
import type { BaseWallet } from "mainnet-js";

interface WalletGuardProps {
	children: (wallet: BaseWallet) => React.ReactNode;
}

export default function WalletGuard({ children }: WalletGuardProps) {
	const wallet = useWallet();

	if (!wallet) {
		return (
			<div className="relative h-dvh w-screen overflow-hidden text-ink">
				<Background />
				<div className="absolute inset-0">
					<ThreeScene number={0} className="w-full h-full" />
				</div>
				<div className="pointer-events-none absolute inset-x-0 bottom-16 z-10 flex justify-center px-4 lg:bottom-10">
					<div className="earth-card pointer-events-auto flex w-full max-w-md flex-col items-center gap-3 px-6 pb-6 pt-8 text-center">
						<h1 className="font-display text-3xl leading-none">Focus Garden</h1>
						<p className="max-w-sm text-[15px] font-semibold leading-relaxed text-ink-soft">
							Plant a tree, stay focused until the timer runs out, then claim it
							for your garden. Connect a wallet to open yours.
						</p>
						<div className="mt-2">
							<ConnectButton />
						</div>
					</div>
				</div>
			</div>
		);
	}

	return <>{children(wallet)}</>;
}
