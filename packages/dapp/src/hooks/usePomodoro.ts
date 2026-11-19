import { PomodoroRewards, addressToLockScript } from "@dapp-starter/contracts";
import { useCallback, useMemo } from "react";
import { POMODORO_CATEGORY_ID } from "../constants";
import type { BaseWallet } from "mainnet-js";
import type { IConnector } from "@bch-wc2/interfaces";
import { ElectrumNetworkProvider } from "cashscript";

export function usePomodoro(wallet: BaseWallet, connector?: IConnector) {
	const provider = useMemo(() => new ElectrumNetworkProvider("chipnet"), []);
	const pomodoro = useMemo(() => connector ? new PomodoroRewards({ wallet, provider, connector, categoryId: POMODORO_CATEGORY_ID }) : null, [wallet, provider, connector]);
	const owner = Buffer.from(addressToLockScript(wallet.cashaddr)).toString("hex");
	const getGarden = useCallback(async () => {
		if (!pomodoro) throw new Error("Connect your wallet to load sessions");
		const [owned, locked] = await Promise.all([provider.getUtxos(wallet.cashaddr), pomodoro.contract.getUtxos()]);
		const parse = (utxo: (typeof owned)[number]) => {
			const commitment = utxo.token?.nft?.commitment ?? "";
			if (utxo.token?.category !== POMODORO_CATEGORY_ID || !/^03[0-9a-f]{58}(03|06)$/i.test(commitment) || commitment.slice(2, 52) !== owner) return [];
			const plantedAt = Buffer.from(commitment.slice(52, 60), "hex").readUInt32LE() * 1000;
			const duration = parseInt(commitment.slice(60), 16) * 512;
			return [{ commitment, plantedAt, duration, releaseAt: plantedAt + duration * 1000 }];
		};
		return {
			trees: owned.filter(u => u.token?.nft?.capability === "none").flatMap(parse),
			sessions: locked.filter(u => u.token?.nft?.capability === "mutable").flatMap(parse).sort((a, b) => a.plantedAt - b.plantedAt),
		};
	}, [pomodoro, provider, wallet, owner]);
	const mintAndLock = useCallback(async (duration: number) => {
		if (!pomodoro) throw new Error("Wallet not connected");
		// Recover on-chain locks first: local storage and reloads cannot create parallel sessions.
		const garden = await getGarden();
		if (garden.sessions.length) throw new Error("Finish your existing session before planting another tree");
		return pomodoro.mintAndLockReward(duration);
	}, [pomodoro, getGarden]);
	const claim = useCallback(async (commitment: string) => {
		if (!pomodoro) throw new Error("Wallet not connected");
		return pomodoro.claimReward(commitment);
	}, [pomodoro]);
	return { getGarden, mintAndLock, claim, contractAddress: pomodoro?.contract.address ?? "", categoryId: POMODORO_CATEGORY_ID };
}
