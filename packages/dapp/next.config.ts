import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
	reactCompiler: true,
	outputFileTracingRoot: path.resolve(__dirname, "../.."),
	transpilePackages: ["@focus-garden/garden"],
	reactStrictMode: true,
	webpack: (config, context) => {
		if (!context.isServer) {
			config.target = ["web", "es2024"];
		}
		config.experiments = { ...config.experiments, topLevelAwait: true };
		config.resolve.alias = {
			...config.resolve.alias,
			...{
				// child_process: false,
				// fs: false,
			},
		};
		return config;
	},
};

export default nextConfig;
