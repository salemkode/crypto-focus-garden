import type { IConnector } from "@bch-wc2/interfaces";
import {
	Contract,
	type NetworkProvider,
	TransactionBuilder,
	placeholderP2PKHUnlocker,
} from "cashscript";
import type { BaseWallet } from "mainnet-js";
import PomodoroRewardsArtifact from "../../../../artifacts/PomodoroRewards.artifact.js";
import { addressToLockScript, decToHexWithEndianSwap, validateUtxo } from "../../../utils.js";

export const mintAndLockReward = async ({
	wallet,
	provider,
	connector,
	contract,
	categoryId,
	duration = 1536,
	rewardAddress = wallet.tokenaddr,
}: {
	wallet: BaseWallet;
	provider: NetworkProvider;
	connector: IConnector;
	contract: Contract<typeof PomodoroRewardsArtifact>;
	categoryId: string;
	duration?: number;
	rewardAddress?: string;
}) => {
	if (![1536, 3072].includes(duration)) throw new Error("Unsupported session duration");
	const units = duration / 512;
	const rewardScript = addressToLockScript(rewardAddress);
	if (rewardScript.length !== 25 || rewardScript[0] !== 0x76 || rewardScript[1] !== 0xa9 || rewardScript[2] !== 0x14 || rewardScript[23] !== 0x88 || rewardScript[24] !== 0xac) throw new Error("Reward address must be P2PKH");
	const rewardPkh = rewardScript.slice(3, 23);
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
		.filter((utxo) => !utxo.token && utxo.satoshis >= 4000n)
		.slice(0, 1)
		.map((utxo) => ({
			...utxo,
			satoshis: BigInt(utxo.satoshis),
			token: undefined,
		}));

	// Only the empty minting baton can create sessions.
	const rewardUtxo = contractUtxos.find((utxo) => {
		const matchCommitment =
			utxo.token?.nft?.commitment === "" || !utxo.token?.nft?.commitment;
		return (
			utxo.token?.category === categoryId &&
			utxo.token?.amount === 0n &&
			utxo.token?.nft?.capability === "minting" &&
			matchCommitment
		);
	});
	if (!rewardUtxo) {
		throw new Error("No available reward NFT found, " + contract.address);
	}

	if (nonTokenUtxos.length === 0) {
		throw new Error("No available non-token UTXOs found");
	}

	const locktime = Math.floor(Date.now() / 1000);
	const placeholderUnlocker = placeholderP2PKHUnlocker(wallet.tokenaddr);
	const commitment = `03${Buffer.from(rewardScript).toString("hex")}${decToHexWithEndianSwap(locktime, 4)}${decToHexWithEndianSwap(units, 1)}`;
	const builder = new TransactionBuilder({ provider })
		.addInput(rewardUtxo, contract.unlock.mintAndLockReward(BigInt(locktime), BigInt(units), rewardPkh))
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
			amount: 1000n,
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

	const result = await connector.signTransaction(builder.generateWcTransactionObject({
		userPrompt: "Lock Reward",
		broadcast: false,
	}));
	if (!result) throw new Error("Wallet did not sign the transaction");

	await provider.sendRawTransaction(result.signedTransaction);

	return {
		txid: result.signedTransactionHash,
		locktime,
		duration,
		commitment,
		signedTx: result.signedTransaction,
	};
};
