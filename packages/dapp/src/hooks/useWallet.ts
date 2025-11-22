import { TestNetWallet as Wallet, type BaseWallet } from "mainnet-js";
import { useWeb3ModalConnectorContext } from "@bch-wc2/web3modal-connector";
import { useQuery } from "@tanstack/react-query";

export function useWallet(): BaseWallet | undefined {
	const { address } = useWeb3ModalConnectorContext();
	const { data: wallet } = useQuery({
		queryKey: ["wallet", address || ""],
		enabled: !!address,
		queryFn: async () => {
			if (!address) return undefined;
			return await Wallet.watchOnly(address);
		},
	});
	return wallet;
}
