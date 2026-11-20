"use client";

import { useCallback, useEffect, useState } from "react";

export default function FocusTimer({
	onStart,
	onEnd,
	onTransactionConfirmed,
	duration = 25 * 60, // Default 25 minutes
}: {
	onStart?: () => Promise<void>;
	onEnd?: () => void;
	onTransactionConfirmed?: () => void;
	duration?: number; // Duration in seconds
}) {
	const FOCUS_TIME = duration;
	const [timeLeft, setTimeLeft] = useState(FOCUS_TIME);
	const [isActive, setIsActive] = useState(false);
	const [message, setMessage] = useState("");
	const [isWaitingForTx, setIsWaitingForTx] = useState(false);
	const [isWaitingForFocus, setIsWaitingForFocus] = useState(false);

	const formatTime = (seconds: number) => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	};

	const handleVisibilityChange = useCallback(() => {
		if (!document.hidden && isWaitingForFocus) {
			// User focused back on website after transaction confirmed
			setIsWaitingForFocus(false);
			setIsActive(true);
			setMessage("Timer started!");
			onTransactionConfirmed?.();
		}
	}, [isWaitingForFocus, onTransactionConfirmed]);

	useEffect(() => {
		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [handleVisibilityChange]);

	// Update timeLeft when duration changes
	useEffect(() => {
		if (!isActive) {
			setTimeLeft(duration);
		}
	}, [duration, isActive]);

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

	const toggleTimer = async () => {
		if (!isActive && !isWaitingForTx && !isWaitingForFocus) {
			// Starting timer - trigger transaction
			setMessage("Sending transaction...");
			setIsWaitingForTx(true);
			if (timeLeft === 0) setTimeLeft(FOCUS_TIME);

			try {
				// Call onStart which returns a promise
				await onStart?.();

				// Transaction confirmed
				setIsWaitingForTx(false);
				setMessage(
					"Transaction confirmed! Focus on the website to start timer.",
				);
				setIsWaitingForFocus(true);

				// If user is already focused, start immediately
				if (!document.hidden) {
					setIsWaitingForFocus(false);
					setIsActive(true);
					setMessage("Timer started!");
					onTransactionConfirmed?.();
				}
			} catch (error) {
				setIsWaitingForTx(false);
				setIsWaitingForFocus(false);
				setMessage("Transaction failed!");
			}
		} else if (isActive) {
			// Pause timer
			setIsActive(false);
		}
	};

	const resetTimer = () => {
		setIsActive(false);
		setTimeLeft(FOCUS_TIME);
		setMessage("");
		setIsWaitingForTx(false);
		setIsWaitingForFocus(false);
	};

	return (
		<div className="flex items-center justify-between w-full">
			<div className="flex flex-col">
				<div className="text-xs text-zinc-400 font-medium uppercase tracking-wider mb-1">
					Focus Session{" "}
					{duration === 1
						? "(1 sec)"
						: duration === 60
							? "(1 min)"
							: duration === 25 * 60
								? "(25 min)"
								: "(50 min)"}
				</div>
				<div className="text-4xl font-mono font-bold text-white tabular-nums leading-none">
					{formatTime(timeLeft)}
				</div>
				{message && (
					<div
						className={`text-xs mt-1 font-medium ${
							message.includes("complete")
								? "text-emerald-400"
								: message.includes("failed") || message.includes("lost")
									? "text-red-400"
									: message.includes("confirmed") || message.includes("started")
										? "text-emerald-400"
										: "text-yellow-400"
						}`}
					>
						{message}
					</div>
				)}
			</div>

			<div className="flex items-center gap-3">
				<button
					type="button"
					onClick={toggleTimer}
					disabled={isWaitingForTx || isWaitingForFocus}
					className={`px-6 py-3 rounded-xl font-semibold transition-all shadow-lg ${
						isWaitingForTx || isWaitingForFocus
							? "bg-yellow-500/20 text-yellow-200 border border-yellow-500/30 cursor-wait"
							: isActive
								? "bg-red-500/20 text-red-200 hover:bg-red-500/30 border border-red-500/30"
								: "bg-emerald-500 text-white hover:bg-emerald-600 border border-emerald-400/50 shadow-emerald-500/20"
					}`}
				>
					{isWaitingForTx
						? "Confirming..."
						: isWaitingForFocus
							? "Focus to Start"
							: isActive
								? "Pause"
								: "Start Focus"}
				</button>

				{/* Reset button */}
				<button
					type="button"
					onClick={resetTimer}
					disabled={!isActive}
					className="p-3 rounded-xl bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white border border-white/10 transition-all disabled:cursor-not-allowed disabled:opacity-20"
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
