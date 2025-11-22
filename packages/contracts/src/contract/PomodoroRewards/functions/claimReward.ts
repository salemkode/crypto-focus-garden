import { WrapBuilder } from "@bch-wc2/cashscript-signer";
import type { IConnector } from "@bch-wc2/interfaces";
import {
	type Contract,
	type NetworkProvider,
	TransactionBuilder,
	placeholderP2PKHUnlocker,
	placeholderSignature,
} from "cashscript";
import type { BaseWallet } from "mainnet-js";
import type PomodoroRewardsArtifact from "../../../../artifacts/PomodoroRewards.artifact.js";

export const claimReward = async ({
	wallet,
	provider,
	connector,
	contract,
	categoryId,
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
	const userPkh = wallet.getPublicKeyHash();

	// Get contract UTXOs
	const contractUtxos = await contract.getUtxos();

	// Find locked reward NFT for this user
	// Commitment starts with 01 and follows with userPkh
	const lockedUtxo = contractUtxos.find(
		(utxo) =>
			utxo.token?.category === categoryId &&
			utxo.token?.amount === 0n &&
			utxo.token?.nft?.commitment.startsWith(`01${userPkh}${now}`),
	);
	const userUtxos = await wallet.getUtxos();
	const nonTokenUtxos = userUtxos
		.filter((utxo) => !utxo.token && utxo.satoshis >= 2000)
		.map((utxo) => ({
			...utxo,
			satoshis: BigInt(utxo.satoshis),
			token: undefined,
		}));

	if (!lockedUtxo) {
		throw new Error("No locked reward NFT found for this user");
	}

	const now = Math.floor(Date.now() / 1000);

	const address = wallet.cashaddr;
	console.log(wallet.getPublicKeyHash());
	console.log((wallet as any).getPublicKeyCompressed());

	const builder = new TransactionBuilder({ provider });
	const placeholderUnlocker = placeholderP2PKHUnlocker(wallet.tokenaddr);
	// Add input with unlocker
	builder
		.addInput(
			lockedUtxo,
			contract.unlock.claimReward(
				placeholderSignature(),
				await (wallet as any).getPublicKeyCompressed(),
			),
		)
		.addInputs(nonTokenUtxos, placeholderUnlocker)
		.addOutput({
			to: address,
			amount: lockedUtxo.satoshis,
			token: {
				category: categoryId,
				amount: 0n,
				nft: {
					capability: "none",
					commitment: lockedUtxo.token?.nft?.commitment ?? "",
				},
			},
		})
		.setLocktime(now);

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

	await provider.sendRawTransaction(result.signedTransaction);

	return {
		txid: result.txid,
	};
};
