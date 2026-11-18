import PixelTree from "./PixelTree";

export default function FinishTransactionModal({
	onClose,
	message = "",
}: {
	onClose: () => void;
	message?: string;
}) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 backdrop-blur-sm p-5"
			onClick={() => onClose()}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="finish-tx-title"
				className="earth-card flex w-full max-w-sm flex-col items-center gap-4 px-6 pb-7 pt-9 text-center text-ink"
				onClick={(e) => {
					e.stopPropagation();
				}}
			>
				<PixelTree className="sprout-hop h-12 w-12" />
				<h1 id="finish-tx-title" className="text-xl font-extrabold leading-tight">
					Approve it in your wallet
				</h1>
				{message.length > 0 && (
					<p className="text-sm font-semibold text-ink-soft break-words">
						{message}
					</p>
				)}
			</div>
		</div>
	);
}
