import { NextResponse } from "next/server";
import { POMODORO_CATEGORY_ID } from "@/constants";

const bcmr = {
	$schema: "https://cashtokens.org/bcmr-v2.schema.json",
	version: {
		major: 1,
		minor: 0,
		patch: 0,
	},
	latestRevision: "2025-11-23T00:00:00.000Z",
	registryIdentity: {
		name: "Crypto Focus Garden Registry",
		description: "Metadata registry for Crypto Focus Garden rewards.",
		uris: {
			icon: "https://focus.salemkode.com/logo.png",
			web: "https://focus.salemkode.com",
			registry: "https://focus.salemkode.com/bcmr.json",
		},
	},
	identities: {
		[POMODORO_CATEGORY_ID]: {
			"2025-11-23T00:00:00.000Z": {
				name: "Focus Tree",
				description: "A digital tree grown through deep focus sessions.",
				token: {
					category: POMODORO_CATEGORY_ID,
					symbol: "TREE",
					decimals: 0,
					nfts: {
						description: "Unique trees earned from focus sessions.",
						parse: {
							types: {
								"": {
									name: "Standard Tree",
									description: "A standard tree grown in the focus garden.",
									uris: {
										image: "https://focus.salemkode.com/tree.png",
									},
								},
							},
						},
					},
				},
			},
		},
	},
};

export async function GET() {
	try {
		// Return the BCMR data with appropriate headers
		return NextResponse.json(bcmr, {
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "public, max-age=3600, s-maxage=3600",
				"Access-Control-Allow-Origin": "*",
			},
		});
	} catch (error) {
		console.error("Error reading BCMR file:", error);
		return NextResponse.json(
			{ error: "Failed to load registry data" },
			{ status: 500 },
		);
	}
}
