import ConnectButton from "@/components/ConnectButton";
import Image from "next/image";
import logo from "@/assets/logo.png";

export default function Header() {
	return (
		<header className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-4 md:px-8 py-6">
			<div className="flex items-center gap-3">
				<div className="w-12 h-12 relative rounded-xl overflow-hidden shadow-lg shadow-green-500/20">
					<Image
						src={logo}
						alt="Focus Garden Logo"
						fill
						className="object-cover"
					/>
				</div>
				<h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-emerald-200 hidden md:block">
					Focus Garden
				</h1>
			</div>

			<div className="flex items-center gap-4">
				<ConnectButton />
			</div>
		</header>
	);
}
