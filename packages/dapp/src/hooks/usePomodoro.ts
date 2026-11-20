import { PomodoroRewards } from "@dapp-starter/contracts";
import { useWeb3ModalConnectorContext } from "@bch-wc2/web3modal-connector";
import { decodeTransaction, hexToBin } from "@bitauth/libauth";
import { useCallback, useMemo } from "react";
import { POMODORO_CATEGORY_ID } from "../constants";
import type { BaseWallet } from "mainnet-js";
import type { IConnector } from "@bch-wc2/interfaces";
import { getNetworkProvider } from "../network";

console.log(POMODORO_CATEGORY_ID);
export function usePomodoro(wallet?: BaseWallet, connector?: IConnector) {
	const { address } = useWeb3ModalConnectorContext();

	const provider = useMemo(() => getNetworkProvider(), []);

	const checkUserHasUtxoVout0 = useCallback(async () => {
		if (!address) return false;
		try {
			const utxos = await provider.getUtxos(address);
			// Check if any UTXO has output index (vout) equal to 0
			return utxos.some((utxo) => utxo.vout === 0);
		} catch (error) {
			console.error("Error checking UTXOs:", error);
			return false;
		}
	}, [address, provider]);

	const mintAndLock = useCallback(async () => {
		if (!connector || !address || !wallet) {
			throw new Error("Wallet not connected");
		}
		const pomodoro = new PomodoroRewards({
			wallet,
			provider: provider as any,
			connector,
			categoryId: POMODORO_CATEGORY_ID,
		});

		const result = await pomodoro.mintAndLockReward();

		// Recover Public Key from Signed Transaction
		let pubkey: Uint8Array | undefined;
		if (result.signedTx) {
			const tx = decodeTransaction(hexToBin(result.signedTx as string));
			if (typeof tx === "object" && "inputs" in tx) {
				// Input 0 is baton (contract), Input 1 is user funding (P2PKH)
				// We expect Input 1 to have the signature and pubkey.
				const input = tx.inputs[1];
				if (input && "unlockingBytecode" in input) {
					const script = input.unlockingBytecode;
					// P2PKH unlocking script: <sig> <pubkey>
					// We need to parse the script.
					// Simple parsing for push data.
					// This is a bit hacky but standard P2PKH script is predictable.
					// The pubkey is usually the last push.
					// Let's try to extract the last 33 bytes?
					// Or use libauth to parse.
					// For now, let's assume the last push is the pubkey.
					// But `unlockingBytecode` is a Uint8Array.
					// We can try to find the pubkey by length (33 bytes).
					// It should be preceded by a push opcode (e.g. 0x21 for 33 bytes).
					// Let's look for 0x21 followed by 33 bytes at the end.
					const len = script.length;
					if (len >= 34 && script[len - 34] === 0x21) {
						pubkey = script.slice(len - 33);
					}
				}
			}
		}

		if (!pubkey) {
			console.warn("Could not recover public key from transaction");
			// Fallback or error?
			// If we can't recover it, we can't claim later.
			throw new Error("Failed to recover public key from transaction");
		}

		return {
			commitment: result.commitment as string,
			locktime: result.locktime as number,
			pubkey: Buffer.from(pubkey).toString("hex"),
		};
	}, [connector, address, provider, wallet]);

	const claim = useCallback(
		async (commitment: string, pubkeyHex: string) => {
			if (!connector || !address || !wallet) {
				throw new Error("Wallet not connected");
			}
			// const pubkey = hexToBin(pubkeyHex);
			const pomodoro = new PomodoroRewards({
				wallet,
				provider: provider as any,
				connector,
				categoryId: POMODORO_CATEGORY_ID,
			});

			return pomodoro.claimReward(commitment);
		},
		[connector, address, provider, wallet],
	);

	const getTreeCount = useCallback(async () => {
		if (!address) return 0;
		try {
			const utxos = await provider.getUtxos(address);
			const treeUtxos = utxos.filter(
				(utxo) =>
					utxo.token?.tokenId === POMODORO_CATEGORY_ID &&
					utxo.token?.amount === 0n, // NFTs have amount 0
			);
			return treeUtxos.length;
		} catch (error) {
			console.error("Error fetching tree count:", error);
			return 0;
		}
	}, [address, provider]);

	const contractInfo = useMemo(() => {
		// Instantiate contract to get address
		// We need a dummy wallet/connector if we just want the address,
		// but PomodoroRewards constructor requires them.
		// However, the address calculation in cashscript Contract doesn't strictly need a signer
		// if we just want the address.
		// But PomodoroRewards wrapper might be strict.
		// Let's check PomodoroRewards.ts again.
		// It takes wallet, provider, connector.
		// We have them in the hook scope (or undefined).

		// Actually, we can just use the artifact and cashscript directly if we want to avoid overhead,
		// but using the wrapper is cleaner if it allows undefined wallet/connector for address generation.
		// Looking at PomodoroRewards.ts, it assigns this.wallet = wallet.
		// It doesn't seem to throw immediately if wallet is missing, unless we call methods.
		// But the constructor type definition requires them.

		// Let's try to create a lightweight instance or just use the constants if the address is constant.
		// The address depends on categoryId and the hardcoded 1500n.
		// So it IS constant for a given categoryId.

		try {
			// We can't easily instantiate PomodoroRewards without a wallet due to TS types.
			// But we can cast or mock.
			const pomodoro = new PomodoroRewards({
				wallet: wallet as BaseWallet, // Cast as we might not have it yet, but for address it might be fine?
				provider: provider as any,
				connector: connector as any, // Cast
				categoryId: POMODORO_CATEGORY_ID,
			});
			return {
				address: pomodoro.contract.address,
				categoryId: POMODORO_CATEGORY_ID,
			};
		} catch (e) {
			console.error("Failed to get contract info", e);
			return {
				address: "",
				categoryId: POMODORO_CATEGORY_ID,
			};
		}
	}, [provider, wallet, connector]);

	return {
		checkUserHasUtxoVout0,
		mintAndLock,
		claim,
		getTreeCount,
		contractAddress: contractInfo.address,
		categoryId: contractInfo.categoryId,
	};
}
