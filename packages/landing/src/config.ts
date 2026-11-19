import deployment from "./deployment.json";

/**
 * Everything you may need to edit before publishing the page lives here.
 * Leave a link empty ("") and its button shows "Coming soon" instead of a dead link.
 */
export const DOWNLOADS = {
	/** iPhone install link (AppDrop share link). */
	ios: "https://appdrop.app/d/prvhsh4gyx",
	/** Android: a Play Store link or a direct .apk URL. */
	android: "",
	/** Web version of the app (Expo web build). */
	web: "/",
} as const;

export const NETWORK = deployment.network === "mainnet" ? "mainnet" : "chipnet";

export const EXPLORER = {
	chipnet: { tx: "https://chipnet.imaginary.cash/tx/", address: "https://chipnet.imaginary.cash/address/" },
	mainnet: { tx: "https://blockchair.com/bitcoin-cash/transaction/", address: "https://blockchair.com/bitcoin-cash/address/" },
}[NETWORK];
