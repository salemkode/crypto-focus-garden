import type { IConnector } from "@bch-wc2/interfaces";
import { Contract, type NetworkProvider } from "cashscript";
import type { BaseWallet } from "mainnet-js";
import PomodoroRewardsArtifact from "../../../artifacts/PomodoroRewards.artifact.js";
import { changeEndianness, deploy } from "./deploy";
import { mintAndLockReward } from "./functions/mintAndLockReward.js";
import { claimReward } from "./functions/claimReward.js";

export class PomodoroRewards {
	public connector: IConnector;
	public wallet: BaseWallet;
	public categoryId: string;

	public contract: Contract<typeof PomodoroRewardsArtifact>;

	static async deploy({
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
	}) {
		const contract = await deploy({
			provider: provider,
			wallet: wallet,
			connector: connector,
			categoryId,
			value,
		});

		return new PomodoroRewards({
			wallet,
			provider,
			connector,
			contract,
			categoryId,
		});
	}

	constructor({
		wallet,
		provider,
		connector,
		contract,
		categoryId,
	}: {
		wallet: BaseWallet;
		provider: NetworkProvider;
		connector: IConnector;
		contract?: Contract<typeof PomodoroRewardsArtifact>;
		categoryId: string;
	}) {
		this.wallet = wallet;
		this.connector = connector;
		this.categoryId = categoryId;

		this.contract =
			contract ??
			new Contract<typeof PomodoroRewardsArtifact>(
				PomodoroRewardsArtifact,
				[changeEndianness(categoryId), 1500n],
				{
					provider,
					addressType: "p2sh20",
				},
			);
	}

	async mintAndLockReward() {
		return mintAndLockReward({
			wallet: this.wallet,
			provider: this.contract.provider,
			connector: this.connector,
			contract: this.contract,
			categoryId: this.categoryId,
		});
	}

	async claimReward(commitment: string) {
		return claimReward({
			wallet: this.wallet,
			provider: this.contract.provider,
			connector: this.connector,
			contract: this.contract,
			categoryId: this.categoryId,
			nftCommitment: commitment,
		});
	}
}
