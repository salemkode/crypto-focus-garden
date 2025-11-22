"use client";

import { useCallback, useEffect, useState } from "react";

export default function FocusTimer({
	onStart,
	onEnd,
}: {
	onStart?: () => void;
	onEnd?: () => void;
}) {
	const FOCUS_TIME = 25 * 60; // 25 minutes in seconds
	const [timeLeft, setTimeLeft] = useState(FOCUS_TIME);
	const [isActive, setIsActive] = useState(false);
	const [message, setMessage] = useState("");

	const formatTime = (seconds: number) => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	};

	const handleVisibilityChange = useCallback(() => {
		if (document.hidden && isActive) {
			setIsActive(false);
			setTimeLeft(FOCUS_TIME);
			setMessage("Focus lost! Timer reset.");
		}
	}, [isActive]);

	useEffect(() => {
		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [handleVisibilityChange]);

	useEffect(() => {
		let interval: NodeJS.Timeout;

		if (isActive && timeLeft > 0) {
			interval = setInterval(() => {
				setTimeLeft((prevTime) => prevTime - 1);
			}, 1000);
		} else if (timeLeft === 0) {
			setIsActive(false);
			setMessage("Focus session complete!");
			onEnd?.();
		}

		return () => clearInterval(interval);
	}, [isActive, timeLeft, onEnd]);

	const toggleTimer = () => {
		if (!isActive) {
			setMessage("");
			if (timeLeft === 0) setTimeLeft(FOCUS_TIME);
			onStart?.();
		}
		setIsActive(!isActive);
	};

	const resetTimer = () => {
		setIsActive(false);
		setTimeLeft(FOCUS_TIME);
		setMessage("");
	};

	return (
		<div className="flex items-center justify-between w-full">
			<div className="flex flex-col">
				<div className="text-xs text-zinc-400 font-medium uppercase tracking-wider mb-1">
					Focus Session
				</div>
				<div className="text-4xl font-mono font-bold text-white tabular-nums leading-none">
					{formatTime(timeLeft)}
				</div>
				{message && (
					<div
						className={`text-xs mt-1 font-medium ${message.includes("complete") ? "text-emerald-400" : "text-red-400"}`}
					>
						{message}
					</div>
				)}
			</div>

			<div className="flex items-center gap-3">
				<button
					type="button"
					onClick={toggleTimer}
					className={`px-6 py-3 rounded-xl font-semibold transition-all shadow-lg ${
						isActive
							? "bg-red-500/20 text-red-200 hover:bg-red-500/30 border border-red-500/30"
							: "bg-emerald-500 text-white hover:bg-emerald-600 border border-emerald-400/50 shadow-emerald-500/20"
					}`}
				>
					{isActive ? "Pause" : "Start Focus"}
				</button>

				<button
					type="button"
					onClick={resetTimer}
					className="p-3 rounded-xl bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white border border-white/10 transition-all"
					title="Reset Timer"
				>
					<svg
						className="w-5 h-5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
						/>
					</svg>
				</button>
			</div>
		</div>
	);
}
