import { validateUtxo } from "../src/utils.js";
import { describe, it, expect } from "bun:test";

describe("validateUtxo", () => {
	it("should validate a simple UTXO", () => {
		const input = {
			txid: "txid",
			vout: 0,
			satoshis: 1000,
		};
		const expected = {
			txid: "txid",
			vout: 0,
			satoshis: 1000n,
			token: undefined,
		};
		expect(validateUtxo(input)).toEqual(expected);
	});

	it("should validate a UTXO with token", () => {
		const input = {
			txid: "txid",
			vout: 0,
			satoshis: 1000,
			token: {
				amount: 100,
				category: "category",
			},
		};
		const expected = {
			txid: "txid",
			vout: 0,
			satoshis: 1000n,
			token: {
				amount: 100n,
				category: "category",
				nft: undefined,
			},
		};
		expect(validateUtxo(input)).toEqual(expected);
	});

	it("should validate a UTXO with token and NFT", () => {
		const input = {
			txid: "txid",
			vout: 0,
			satoshis: 1000,
			token: {
				amount: 0,
				category: "category",
				nft: {
					capability: "minting",
					commitment: "commitment",
				},
			},
		};
		const expected = {
			txid: "txid",
			vout: 0,
			satoshis: 1000n,
			token: {
				amount: 0n,
				category: "category",
				nft: {
					capability: "minting",
					commitment: "commitment",
				},
			},
		};
		expect(validateUtxo(input)).toEqual(expected);
	});

	it("should map tokenId to category", () => {
		const input = {
			txid: "txid",
			vout: 0,
			satoshis: 1000,
			token: {
				amount: 100,
				tokenId: "category",
			},
		};
		const expected = {
			txid: "txid",
			vout: 0,
			satoshis: 1000n,
			token: {
				amount: 100n,
				category: "category",
				nft: undefined,
			},
		};
		expect(validateUtxo(input)).toEqual(expected);
	});
});
