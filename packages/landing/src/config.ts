/**
 * Everything you may need to edit before publishing the page lives here.
 * A platform whose link is empty ("") is simply not shown.
 */
export const DOWNLOADS = {
	/** iPhone install link (AppDrop share link; recipients sign with their own Apple ID). */
	ios: "https://appdrop.app/d/prvhsh4gyx",
	/** Android download (AppDrop share link for the release APK). */
	android: "https://appdrop.app/d/njfetdhs4s",
	/** Web version of the app (Expo web build). */
	web: "https://focus-garden-app.netlify.app",
} as const;

/** Shown in the footer and FAQ. Switch to "mainnet" only after a mainnet deployment. */
export const NETWORK: "chipnet" | "mainnet" = "chipnet";

export const EXPLORER = {
	chipnet: { tx: "https://chipnet.imaginary.cash/tx/", address: "https://chipnet.imaginary.cash/address/" },
	mainnet: { tx: "https://blockchair.com/bitcoin-cash/transaction/", address: "https://blockchair.com/bitcoin-cash/address/" },
}[NETWORK];
