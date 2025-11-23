import { TestNetWallet as Wallet, type BaseWallet } from "mainnet-js";
import { useWeb3ModalConnectorContext } from "@bch-wc2/web3modal-connector";
import { useQuery } from "@tanstack/react-query";

import { getNetworkProvider } from "../network";

export function useWallet(): BaseWallet | undefined {
	const { address } = useWeb3ModalConnectorContext();
	const { data: wallet } = useQuery({
		queryKey: ["wallet", address || ""],
		queryFn: async () => {
			if (!address) return undefined;
			const w = await Wallet.watchOnly(address);
			(w as any).provider = await getNetworkProvider();
			return w;
		},
	});
	return wallet;
}
