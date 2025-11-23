import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "Crypto Focus Garden",
	description: "Earn NFT rewards by completing Pomodoro focus sessions",
	manifest: "/manifest.json",
	appleWebApp: {
		capable: true,
		statusBarStyle: "black-translucent",
		title: "Focus Garden",
	},
	icons: {
		icon: "/logo.png",
		shortcut: "/logo.png",
		apple: "/logo.png",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<head />
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased`}
			>
				<Providers>
					{children}
					<div className="fixed bottom-6 left-6 hidden md:flex items-center gap-2 text-white/30 hover:text-white/80 transition-all duration-300 text-sm font-medium z-50">
						<span>Built with ❤️ by</span>
						<a
							href="https://salemkode.com"
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-emerald-400 transition-colors"
						>
							salemkode.com
						</a>
					</div>
				</Providers>
			</body>
		</html>
	);
}
