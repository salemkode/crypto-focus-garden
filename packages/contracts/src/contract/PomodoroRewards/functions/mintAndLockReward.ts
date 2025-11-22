import { WrapBuilder } from "@bch-wc2/cashscript-signer";
import type { IConnector } from "@bch-wc2/interfaces";
import {
	Contract,
	type NetworkProvider,
	TransactionBuilder,
	Utxo,
	placeholderP2PKHUnlocker,
	placeholderSignature,
} from "cashscript";
import type { BaseWallet } from "mainnet-js";
import PomodoroRewardsArtifact from "../../../../artifacts/PomodoroRewards.artifact.js";

export const mintAndLockReward = async ({
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
}): Promise<{
	[key: string]: unknown;
}> => {
	const userPkh = wallet.getPublicKeyHash();

	// Get contract UTXOs
	const contractUtxos = await contract.getUtxos();
	const userUtxos = await wallet.getUtxos();
	const nonTokenUtxos = userUtxos
		.filter((utxo) => !utxo.token && utxo.satoshis >= 2000)
		.map((utxo) => ({
			...utxo,
			satoshis: BigInt(utxo.satoshis),
			token: undefined,
		}));

	// Find available reward NFT (commitment 0x00)
	const rewardUtxo = contractUtxos.find(
		(utxo) =>
			utxo.token?.category === categoryId &&
			utxo.token?.amount === 0n &&
			utxo.token?.nft?.commitment === "",
	);

	if (!rewardUtxo) {
		throw new Error("No available reward NFT found");
	}

	if (nonTokenUtxos.length === 0) {
		throw new Error("No available non-token UTXOs found");
	}

	const now = Math.floor(Date.now() / 1000);
	const locktime = now;

	const locktimeBuffer = new ArrayBuffer(4);
	new DataView(locktimeBuffer).setUint32(0, locktime, true); // little-endian
	const locktimeHex = Buffer.from(locktimeBuffer).toString("hex");

	const commitment = `01${userPkh}${locktimeHex}`;

	const placeholderUnlocker = placeholderP2PKHUnlocker(wallet.tokenaddr);
	const builder = new TransactionBuilder({ provider })
		.addInput(
			rewardUtxo,
			contract.unlock.mintAndLockReward(wallet.getPublicKeyHash()),
		)
		.addInputs(nonTokenUtxos, placeholderUnlocker)
		.addOutput({
			to: contract.address,
			amount: rewardUtxo.satoshis,
			token: {
				category: categoryId,
				amount: 0n,
				nft: {
					capability: "minting",
					commitment: "",
				},
			},
		})
		.addOutput({
			to: contract.address,
			amount: rewardUtxo.satoshis,
			token: {
				category: categoryId,
				amount: 0n,
				nft: {
					capability: "mutable",
					commitment: commitment,
				},
			},
		});

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

	builder.setLocktime(locktime);

	const result = await WrapBuilder(builder as any, connector).send({
		userPrompt: "Lock Reward",
		broadcast: false,
	});

	await provider.sendRawTransaction(result.signedTransaction);

	return {
		txid: result.txid,
		locktime,
		commitment,
	};
};
