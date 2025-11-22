import { PrivKeyConnector } from "@bch-wc2/privkey-connector";
import { MockNetworkProvider, randomUtxo } from "cashscript";
import {
	aliceAddress,
	alicePriv,
	bobAddress,
	MockWallet,
} from "../../../shared.js";
import { P2PKH } from "../../../../src/contract/P2PKH/P2PKH.js";

describe("Uproot NFT tests", () => {
	test("Should uproot an NFT successfully", async () => {
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

		// TODO: Implement test for uproot() function
		// This test needs to:
		// 1. Mock a planted NFT UTXO at the contract
		// 2. Call p2pkh.uproot()
		// 3. Verify outputs:
		//    - Output 0: userNFT to user
		//    - Output 1+: change to user (no tokens)
		// 4. Verify no outputs go back to contract

		// For now, this is a placeholder test
		expect(p2pkh.contract).toBeDefined();
	});

	test("Should ensure no outputs go back to contract", async () => {
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

		// TODO: Verify that uproot() enforces no outputs to contract
		// This should be validated in the contract logic

		// For now, just verify the contract exists
		expect(p2pkh.contract).toBeDefined();
	});
});
