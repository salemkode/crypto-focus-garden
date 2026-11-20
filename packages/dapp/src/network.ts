import { Connection } from "mainnet-js";

export const getNetworkProvider = () => {
	// Default to chipnet (Testnet) as the app currently uses TestNetWallet
	// To switch to Mainnet, change "testnet" to "mainnet" and use "wss://bch.imaginary.cash:50004"
	const conn = new Connection("testnet", "wss://chipnet.imaginary.cash:50004");
	(conn.networkProvider.network as any) = "chipnet";
	return conn.networkProvider;
};
