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
import { changeEndianness } from "../deploy.js";
import { decToHexWithEndianSwap, validateUtxo } from "../../../utils.js";

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
	if (typeof userPkh === "string") {
		throw new Error(userPkh);
	}

	// Get contract UTXOs
	const contractUtxos = await contract
		.getUtxos()
		.then((e) => e.map(validateUtxo));
	const userUtxos = await wallet.getUtxos().then((e) => e.map(validateUtxo));
	const nonTokenUtxos = userUtxos
		.filter((utxo) => !utxo.token && utxo.satoshis >= 2000n)
		.map((utxo) => ({
			...utxo,
			satoshis: BigInt(utxo.satoshis),
			token: undefined,
		}));

	// Find available reward NFT (commitment 0x00)
	const rewardUtxo = contractUtxos.find((utxo) => {
		const matchCommitment =
			utxo.token?.nft?.commitment === "" || !utxo.token?.nft?.commitment;
		return (
			utxo.token?.category === categoryId &&
			utxo.token?.amount === 0n &&
			matchCommitment
		);
	});
	if (!rewardUtxo) {
		throw new Error("No available reward NFT found, " + contract.address);
	}

	if (nonTokenUtxos.length === 0) {
		throw new Error("No available non-token UTXOs found");
	}

	const locktime = await wallet.provider.getBlockHeight();
	// const locktime = await wallet.provider
	// 	.getHeader(blockHeight, true)
	// 	.then((header) => {
	// 		if ("timestamp" in header) {
	// 			return header.timestamp;
	// 		}
	// 	});
	if (!locktime) {
		throw new Error("Failed to get locktime");
	}
	const placeholderUnlocker = placeholderP2PKHUnlocker(wallet.tokenaddr);
	const commitment = `01${Buffer.from(
		placeholderUnlocker.generateLockingBytecode(),
	).toString("hex")}${decToHexWithEndianSwap(locktime)}`;
	const builder = new TransactionBuilder({ provider })
		.addInput(rewardUtxo, contract.unlock.mintAndLockReward())
		.addInputs(nonTokenUtxos, placeholderUnlocker)
		.addOutput({
			to: contract.tokenAddress,
			amount: BigInt(rewardUtxo.satoshis),
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
			to: contract.tokenAddress,
			amount: BigInt(rewardUtxo.satoshis),
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
	if (nonTokenUtxos.length > 0 && totalBchAmount >= 3000n) {
		builder.addOutput({
			to: wallet.tokenaddr,
			amount: totalBchAmount - 3000n,
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
		signedTx: result.signedTransaction,
	};
};
