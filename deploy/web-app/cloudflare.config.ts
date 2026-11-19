// Cloudflare deployment of the web app: an assets-only Worker serving the Expo web export.
// From this folder: (cd ../../packages/mobile && bun run export:web) && cf deploy ../../packages/mobile/dist-web
// A plain object: defineConfig from "cf/config" only adds types.
export default {
	worker: {
		name: "focus-garden-app",
		compatibilityDate: "2026-11-01",
		// Expo Router is a single-page app: unknown paths serve index.html.
		assets: { notFoundHandling: "single-page-application" },
		domains: ["focus-app.salemkode.com"],
	},
};
