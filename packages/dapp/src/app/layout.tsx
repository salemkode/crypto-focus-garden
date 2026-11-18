import type { Metadata, Viewport } from "next";
import { Geist_Mono, Nunito, Silkscreen } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const body = Nunito({
	variable: "--font-body",
	subsets: ["latin"],
});

const pixel = Silkscreen({
	variable: "--font-pixel",
	weight: ["400", "700"],
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
		statusBarStyle: "default",
		title: "Focus Garden",
	},
	icons: {
		icon: "/logo.png",
		shortcut: "/logo.png",
		apple: "/logo.png",
	},
};

export const viewport: Viewport = {
	themeColor: "#9fcbea",
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
				className={`${body.variable} ${pixel.variable} ${geistMono.variable} antialiased`}
			>
				<Providers>
					{children}
					<div className="fixed bottom-4 w-full lg:w-auto flex justify-center lg:justify-start lg:bottom-6 lg:left-6 items-center gap-2 text-ink/45 hover:text-ink/90 transition-colors duration-300 text-sm font-semibold z-50 pointer-events-none">
						<span className="pointer-events-auto">Built with ❤️ by</span>
						<a
							href="https://salemkode.com"
							target="_blank"
							rel="noopener noreferrer"
							className="underline decoration-ink/30 underline-offset-2 hover:text-grass-deep transition-colors pointer-events-auto"
						>
							salemkode.com
						</a>
					</div>
				</Providers>
			</body>
		</html>
	);
}
