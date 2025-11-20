import { useQuery } from "@tanstack/react-query";
import { TestNetWallet as Wallet } from "mainnet-js";
import { useEffect } from "react";

export function useWatchAddress(address?: string, tokenId?: string) {
	const { data: wallet } = useQuery({
		queryKey: ["watchAddress", address],
		queryFn: async () => {
			if (!address) return null;
			return await Wallet.watchOnly(address);
		},
		enabled: !!address,
	});
	const {
		data: { balance, utxos, tokenUtxos, tokenBalance },
		refetch,
	} = useQuery({
		initialData: {
			utxos: [],
			balance: 0,
			tokenUtxos: [],
			tokenBalance: 0n,
		},
		queryKey: ["watchAddress", address, tokenId],
		queryFn: async () => {
			if (!wallet)
				return {
					utxos: [],
					balance: 0,
					tokenUtxos: [],
					tokenBalance: 0n,
				};
			const utxos = await wallet.getUtxos();
			const balance = utxos.reduce(
				(acc, utxo) => acc + (utxo.token ? 0 : utxo.satoshis),
				0,
			);
			return {
				utxos,
				balance,
				tokenBalance: utxos.reduce(
					(acc, utxo) =>
						acc +
						(utxo.token?.tokenId === tokenId ? (utxo.token?.amount ?? 0n) : 0n),
					0n,
				),
				tokenUtxos: tokenId
					? utxos.filter((utxo) => utxo.token?.tokenId === tokenId)
					: utxos,
			};
		},
		enabled: !!address,
		refetchInterval: 10000, // Poll every 10 seconds
	});

	useEffect(() => {
		if (!address || !wallet) {
			return;
		}

		const cancelWatch = wallet.provider.subscribeToAddress(address, () =>
			refetch(),
		);

		return () => {
			cancelWatch.then((remove) => remove());
		};
	}, [address, wallet, refetch]);

	return { balance, tokenBalance, utxos, tokenUtxos };
}
