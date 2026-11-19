import ConnectButton from "@/components/ConnectButton";
import Image from "next/image";
import logo from "@/assets/logo.png";

export default function Header() {
	return (
		// Only the logo and wallet catch the pointer, so the garden stays draggable.
		<header className="pointer-events-none absolute top-0 left-0 right-0 z-40 flex items-center justify-between gap-3 px-4 md:px-8 py-4 md:py-6">
			<div className="pointer-events-auto flex items-center gap-3">
				<div className="w-11 h-11 relative rounded-xl overflow-hidden shadow-[0_4px_0_rgb(29_58_42/0.25)]">
					<Image
						src={logo}
						alt="Focus Garden logo"
						fill
						className="object-cover"
					/>
				</div>
				<h1 className="hidden font-display text-xl text-ink md:block">
					Focus Garden
				</h1>
			</div>

			<div className="pointer-events-auto flex items-center gap-4">
				<ConnectButton />
			</div>
		</header>
	);
}
