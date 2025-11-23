import {
	bigIntToVmNumber,
	type CashAddressNetworkPrefix,
	cashAddressToLockingBytecode,
	type CashAddressType,
	decodeCashAddress,
	encodeCashAddress,
	hexToBin,
	padMinimallyEncodedVmNumber,
	vmNumberToBigInt,
} from "@bitauth/libauth";
import type { TokenDetails, Utxo } from "cashscript";
import type { UtxoI } from "mainnet-js";
import type { WrapWallet } from "@bch-wc2/mainnet-js-signer";

export const require = (predicate: boolean, message: string) => {
	if (!predicate) {
		throw new Error(message);
	}
};

export const padVmNumber = (num: bigint, length: number) => {
	return padMinimallyEncodedVmNumber(bigIntToVmNumber(num), length).slice(
		0,
		length,
	);
};

export const vmToBigInt = (vmNumber: string) => {
	return vmNumberToBigInt(hexToBin(vmNumber), {
		requireMinimalEncoding: false,
	}) as bigint;
};

export function addressToLockScript(address: string): Uint8Array {
	const result = cashAddressToLockingBytecode(address);
	if (typeof result === "string") throw new Error(result);

	return result.bytecode;
}

export const toCashAddress = (address: string) => {
	const decoded = decodeCashAddress(address);
	if (typeof decoded === "string") {
		throw new Error(decoded);
	}

	return encodeCashAddress({
		...decoded,
		prefix: address.split(":")[0] as CashAddressNetworkPrefix,
		type: decoded.type.replace("WithTokens", "") as CashAddressType,
	}).address;
};

export const toTokenAddress = (address: string) => {
	const decoded = decodeCashAddress(address);
	if (typeof decoded === "string") {
		throw new Error(decoded);
	}

	return encodeCashAddress({
		...decoded,
		prefix: decoded.prefix,
		type: (decoded.type.replace("WithTokens", "") +
			"WithTokens") as CashAddressType,
	}).address;
};

export const toCashScriptUtxo = (utxo: UtxoI) =>
	({
		satoshis: BigInt(utxo.satoshis),
		txid: utxo.txid,
		vout: utxo.vout,
		token: utxo.token
			? ({
					amount: utxo.token?.amount ? BigInt(utxo.token.amount) : 0n,
					category: utxo.token?.tokenId,
					nft:
						utxo.token?.capability || utxo.token?.commitment
							? ({
									capability: utxo.token?.capability,
									commitment: utxo.token?.commitment,
								} as TokenDetails["nft"])
							: undefined,
				} as TokenDetails)
			: undefined,
	}) as Utxo;

export const validateUtxo = (utxo: Utxo | UtxoI): Utxo => {
	const getTokenData = () => {
		if (utxo.token && "tokenId" in utxo.token) {
			const token = utxo.token as any;
			return {
				amount: BigInt(token.amount || 0),
				category: token.tokenId,
				nft:
					token.capability || token.commitment
						? {
								capability: token.capability,
								commitment: token.commitment,
							}
						: undefined,
			} as TokenDetails;
		}
		return utxo.token;
	};

	return {
		txid: utxo.txid,
		vout: utxo.vout,
		satoshis: BigInt(utxo.satoshis),
		token: getTokenData(),
	};
};

export const decToHexWithEndianSwap = (num: number, byteLength = 3): string => {
	// حوّل لـ hex
	let hex = num.toString(16);

	// مثالنا 3 بايت = 6 حروف hex
	if (hex.length > byteLength * 2) {
		throw new Error("الرقم أكبر من الحجم المحدد بالبايتات");
	}

	// صفّر من اليسار لين يصير الطول مضبوط
	hex = hex.padStart(byteLength * 2, "0"); // مثال: 280885 => "044935"

	// اعكس ترتيب البايتات
	const reversedHex = hex.match(/../g)!.reverse().join(""); // "354904"

	return reversedHex;
};

export const consolidateUtxos = async ({
	signer,
	minSatoshis,
}: {
	signer: ReturnType<typeof WrapWallet>;
	minSatoshis?: bigint;
}): Promise<Awaited<ReturnType<ReturnType<typeof WrapWallet>["send"]>>> => {
	if (!minSatoshis) {
		return signer.sendMax(signer.cashaddr, {
			userPrompt: "Sign to consolidate UTXOs",
			queryBalance: false,
		});
	}

	return signer.send(
		{
			cashaddr: signer.cashaddr,
			value: Number(minSatoshis),
			unit: "sat",
		},
		{
			userPrompt: "Sign to consolidate UTXOs",
			queryBalance: false,
		},
	);
};
