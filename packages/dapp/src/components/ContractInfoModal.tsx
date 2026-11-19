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
			className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 backdrop-blur-sm p-4"
			onClick={onClose}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="contract-info-title"
				className="earth-card w-full max-w-lg px-6 pb-6 pt-8 text-ink"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex justify-between items-center mb-5">
					<h2 id="contract-info-title" className="text-xl font-extrabold">
						Contract info
					</h2>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close"
						className="block-btn block-btn--sm block-btn--sand p-1.5"
					>
						<svg
							className="w-5 h-5"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2.5}
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>

				<div className="space-y-4">
					<div>
						<div className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-ink-soft">
							Contract address
						</div>
						<div className="rounded-xl bg-sand/60 p-3 font-mono text-sm break-all select-all">
							{address || "Loading…"}
						</div>
					</div>

					<div>
						<div className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-ink-soft">
							Category ID
						</div>
						<div className="rounded-xl bg-sand/60 p-3 font-mono text-sm break-all select-all">
							{categoryId || "Loading…"}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
