import type { IConnector } from "@bch-wc2/interfaces";
import { WrapWallet } from "@bch-wc2/mainnet-js-signer";
import { Contract, type NetworkProvider } from "cashscript";
import { type BaseWallet, SendRequest } from "mainnet-js";
import PomodoroRewardsArtifact from "../../../artifacts/PomodoroRewards.artifact.js";

export const changeEndianness = (string: string) => {
	const result = [];
	let len = string.length - 2;
	while (len >= 0) {
		result.push(string.substr(len, 2));
		len -= 2;
	}
	return result.join("");
};
export const deploy = async ({
	wallet,
	provider,
	connector,
	categoryId,
	value,
}: {
	wallet: BaseWallet;
	provider: NetworkProvider;
	connector: IConnector;
	categoryId: string;
	value: bigint;
}) => {
	if (value < 1000n) {
		throw new Error(
			"Value must be at least 1000 satoshis to deploy the contract.",
		);
	}

	const userPk = wallet.getPublicKeyHash();
	if (typeof userPk === "string") {
		throw new Error(userPk);
	}
	const signer = WrapWallet(wallet, connector);

	console.log([changeEndianness(categoryId), 1500n]);
	const p2pkhContract = new Contract(
		PomodoroRewardsArtifact,
		[changeEndianness(categoryId)],
		{
			provider,
			addressType: "p2sh20",
		},
	);

	// "deploy" contract by sending some BCH value
	await signer.send(
		new SendRequest({
			cashaddr: p2pkhContract.address,
			value: Number(value),
			unit: "satoshis",
		}),
		{
			userPrompt: `Sign to deploy a contract`,
		},
	);

	return p2pkhContract;
};
