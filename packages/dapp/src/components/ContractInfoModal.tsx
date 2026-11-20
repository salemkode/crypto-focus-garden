import React from "react";

interface ContractInfoModalProps {
	onClose: () => void;
	address: string;
	categoryId: string;
}

export default function ContractInfoModal({
	onClose,
	address,
	categoryId,
}: ContractInfoModalProps) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
			onClick={onClose}
		>
			<div
				className="w-full max-w-lg bg-slate-900/90 border border-white/10 rounded-2xl p-6 shadow-2xl text-white relative overflow-hidden"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Background Glow */}
				<div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-gradient-to-br from-emerald-500/10 to-blue-500/10 pointer-events-none blur-3xl" />

				<div className="relative z-10">
					<div className="flex justify-between items-center mb-6">
						<h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-emerald-200">
							Contract Info
						</h2>
						<button
							onClick={onClose}
							className="text-white/50 hover:text-white transition-colors"
						>
							<svg
								className="w-6 h-6"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						</button>
					</div>

					<div className="space-y-4">
						<div>
							<label className="block text-xs font-medium text-emerald-200/60 mb-1 uppercase tracking-wider">
								Contract Address
							</label>
							<div className="bg-black/40 border border-white/5 rounded-xl p-3 font-mono text-sm break-all text-white/90 select-all">
								{address || "Loading..."}
							</div>
						</div>

						<div>
							<label className="block text-xs font-medium text-emerald-200/60 mb-1 uppercase tracking-wider">
								Category ID
							</label>
							<div className="bg-black/40 border border-white/5 rounded-xl p-3 font-mono text-sm break-all text-white/90 select-all">
								{categoryId || "Loading..."}
							</div>
						</div>
					</div>

					<div className="mt-6 flex justify-end">
						<button
							onClick={onClose}
							className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
						>
							Close
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
