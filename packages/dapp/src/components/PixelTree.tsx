/** Tiny voxel-style tree, used wherever the UI needs to say "tree". */
export default function PixelTree({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 8 9"
			className={`pixel-art ${className ?? ""}`}
			aria-hidden="true"
		>
			<rect x="2" y="0" width="4" height="1" fill="#84cd4e" />
			<rect x="1" y="1" width="6" height="1" fill="#78c444" />
			<rect x="0" y="2" width="8" height="2" fill="#5fb23a" />
			<rect x="1" y="4" width="6" height="1" fill="#4c9a2a" />
			<rect x="3" y="5" width="2" height="3" fill="#7a4a27" />
			<rect x="1" y="8" width="6" height="1" fill="#8b5a33" />
		</svg>
	);
}
