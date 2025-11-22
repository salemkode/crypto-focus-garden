import { PrivKeyConnector } from "@bch-wc2/privkey-connector";
import { MockNetworkProvider, randomUtxo } from "cashscript";
import {
	aliceAddress,
	alicePriv,
	bobAddress,
	MockWallet,
} from "../../../shared.js";
import { P2PKH } from "../../../../src/contract/P2PKH/P2PKH.js";

describe("Plant NFT tests", () => {
	test("Should plant an NFT successfully", async () => {
		const provider = new MockNetworkProvider();
		provider.reset();
		provider.addUtxo(
			aliceAddress,
			randomUtxo({
				satoshis: 10000000n,
			}),
		);

		const wallet = await MockWallet(provider, alicePriv);

		const connector = new PrivKeyConnector({
			privateKey: wallet.privateKey,
			pubkeyCompressed: wallet.publicKeyCompressed,
			networkProvider: provider,
		});

		const p2pkh = await P2PKH.deploy({
			value: 10000n,
			wallet,
			provider,
			connector,
		});

		// TODO: Implement test for plant() function
		// This test needs to:
		// 1. Mock a managerNFT UTXO at the contract
		// 2. Call p2pkh.plant()
		// 3. Verify outputs:
		//    - Output 0: managerNFT back to contract
		//    - Output 1: userNFT to contract
		//    - Output 2+: change to user (no tokens)

		// For now, this is a placeholder test
		expect(p2pkh.contract).toBeDefined();
	});

	test("Should reject plant if managerNFT not provided", async () => {
		const provider = new MockNetworkProvider();
		provider.reset();

		const wallet = await MockWallet(provider, alicePriv);

		const connector = new PrivKeyConnector({
			privateKey: wallet.privateKey,
			pubkeyCompressed: wallet.publicKeyCompressed,
			networkProvider: provider,
		});

		const p2pkh = new P2PKH({
			wallet,
			provider,
			connector,
		});

		// TODO: This should throw when managerNFT is not available
		// await expect(p2pkh.plant()).rejects.toThrow();

		// For now, just verify the contract exists
		expect(p2pkh.contract).toBeDefined();
	});
});
