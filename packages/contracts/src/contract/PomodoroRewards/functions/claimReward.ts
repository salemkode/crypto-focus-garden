import { WrapBuilder } from "@bch-wc2/cashscript-signer";
import type { IConnector } from "@bch-wc2/interfaces";
import {
	type Contract,
	type NetworkProvider,
	SignatureTemplate,
	TransactionBuilder,
} from "cashscript";
import { TestNetWallet, type BaseWallet } from "mainnet-js";
import type PomodoroRewardsArtifact from "../../../../artifacts/PomodoroRewards.artifact.js";
import { changeEndianness } from "../deploy.js";
import { validateUtxo } from "../../../utils.js";

export const claimReward = async ({
	wallet,
	provider,
	connector,
	contract,
	categoryId,
	nftCommitment,
}: {
	wallet: BaseWallet;
	provider: NetworkProvider;
	connector: IConnector;
	contract: Contract<typeof PomodoroRewardsArtifact>;
	categoryId: string;
	nftCommitment: string;
}): Promise<{
	[key: string]: unknown;
}> => {
	// Get current block timestamp for locktime (matching mintAndLockReward logic)
	const locktime = await wallet.provider.getBlockHeight();

	// Get contract UTXOs
	const contractUtxos = await contract
		.getUtxos()
		.then((e) => e.map(validateUtxo));

	// Find locked reward NFT with matching commitment
	const lockedUtxo = contractUtxos.find(
		(utxo) =>
			utxo.token?.category === categoryId &&
			utxo.token?.amount === 0n &&
			utxo.token?.nft?.commitment === nftCommitment,
	);

	if (!lockedUtxo) {
		throw new Error("No locked reward NFT found with matching commitment");
	}

	// Get user UTXOs for funding
	const userUtxos = await wallet.getUtxos().then((e) => e.map(validateUtxo));
	const nonTokenUtxos = userUtxos
		.filter((utxo) => !utxo.token && utxo.satoshis >= 2000n)
		.map((utxo) => ({
			...utxo,
			satoshis: BigInt(utxo.satoshis),
			token: undefined,
		}));

	if (nonTokenUtxos.length === 0) {
		throw new Error("No available non-token UTXOs found for fees");
	}

	const address = wallet.tokenaddr;

	const builder = new TransactionBuilder({ provider });
	const Wallet = await TestNetWallet.fromSeed(
		"woman capital glove jar orbit guilt identify delay menu guilt cook broken",
		"m/44'/145'/0'/0/0",
	);
	const aliceSignatureTemplate = new SignatureTemplate(Wallet.privateKeyWif);

	// Add input with unlocker
	builder
		.addInput(lockedUtxo, contract.unlock.claimReward())
		.addInputs(nonTokenUtxos, aliceSignatureTemplate.unlockP2PKH())
		.addOutput({
			to: address,
			amount: lockedUtxo.satoshis,
			token: {
				category: categoryId,
				amount: 0n,
				nft: {
					capability: "none",
					commitment: nftCommitment, // Pass commitment to output
				},
			},
		})
		.setLocktime(locktime)
		.debug(); // Use block timestamp

	// Add change output if there's enough BCH
	const totalBchAmount = nonTokenUtxos.reduce(
		(acc, utxo) => acc + utxo.satoshis,
		0n,
	);
	if (nonTokenUtxos.length > 0 && totalBchAmount >= 2000n) {
		builder.addOutput({
			to: wallet.tokenaddr,
			amount: totalBchAmount - 2000n,
		});
	}

	const result = await WrapBuilder(builder as any, connector).send({
		userPrompt: "Claim Reward",
		broadcast: false,
	});

	console.log("Runing claimReward funcation");
	await provider.sendRawTransaction(result.signedTransaction).then(console.log);

	return {
		txid: result.txid,
	};
};
