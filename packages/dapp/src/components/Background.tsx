export default function Background() {
	return (
		<div className="absolute inset-0 pointer-events-none">
			<div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-green-500/10 blur-[100px]" />
			<div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-[100px]" />
		</div>
	);
}
