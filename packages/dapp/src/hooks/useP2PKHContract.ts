import type { IConnector } from "@bch-wc2/interfaces";
import { P2PKH } from "@dapp-starter/contracts";
import { useQuery } from "@tanstack/react-query";
import { ElectrumNetworkProvider } from "cashscript";
import { Wallet } from "mainnet-js";

export function useP2PKHContract(address?: string, connector?: IConnector) {
	const { data: p2pkh } = useQuery({
		queryKey: ["p2pkh", address], // Connector usually implies address change
		queryFn: async () => {
			if (!address || !connector) return undefined;

			const wallet = await Wallet.watchOnly(address);
			const provider = new ElectrumNetworkProvider(undefined, {
				electrum: wallet.provider.electrum,
				manualConnectionManagement: true,
			});

			return new P2PKH({
				wallet: wallet,
				provider: provider,
				connector: connector,
			});
		},
		enabled: !!address && !!connector,
		staleTime: Infinity, // Contract instance shouldn't change unless address/connector changes
	});

	return { p2pkh, P2PKH };
}
