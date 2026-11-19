// Cloudflare deployment of the landing page: an assets-only Worker serving packages/landing/dist.
// Deploy from this folder: bun run build && cf deploy ./dist
// A plain object: defineConfig from "cf/config" only adds types.
export default {
	worker: {
		name: "focus-garden",
		compatibilityDate: "2026-11-01",
		assets: { notFoundHandling: "404-page" },
		domains: ["focus.salemkode.com"],
	},
};
