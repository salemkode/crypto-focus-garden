"use client";

import { useState } from "react";
import ThreeScene from "./ThreeScene";

type TimePeriod = "يوم" | "أسبوع" | "شهر" | "سنه";

interface FocusTimeData {
	hour: number;
	minutes: number;
}

export default function ProgressTracker() {
	const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("يوم");
	const [collectedItems] = useState(22);
	const [views] = useState(0);

	// Mock focus time data - in a real app, this would come from props or API
	const [focusTimeData] = useState<FocusTimeData[]>([
		{ hour: 0, minutes: 0 },
		{ hour: 1, minutes: 0 },
		{ hour: 2, minutes: 0 },
		{ hour: 3, minutes: 0 },
		{ hour: 4, minutes: 0 },
		{ hour: 5, minutes: 5 },
		{ hour: 6, minutes: 45 },
		{ hour: 7, minutes: 30 },
		{ hour: 8, minutes: 20 },
		{ hour: 9, minutes: 15 },
		{ hour: 10, minutes: 60 },
		{ hour: 11, minutes: 30 },
		{ hour: 12, minutes: 70 },
		{ hour: 13, minutes: 25 },
		{ hour: 14, minutes: 15 },
		{ hour: 15, minutes: 20 },
		{ hour: 16, minutes: 10 },
		{ hour: 17, minutes: 5 },
		{ hour: 18, minutes: 55 },
		{ hour: 19, minutes: 30 },
		{ hour: 20, minutes: 15 },
		{ hour: 21, minutes: 10 },
		{ hour: 22, minutes: 5 },
		{ hour: 23, minutes: 0 },
	]);

	const totalFocusHours = Math.floor(
		focusTimeData.reduce((sum, d) => sum + d.minutes, 0) / 60,
	);
	const totalFocusMinutes =
		focusTimeData.reduce((sum, d) => sum + d.minutes, 0) % 60;

	const maxMinutes = Math.max(...focusTimeData.map((d) => d.minutes), 1);

	// Get current date in Arabic format
	const getCurrentDate = () => {
		const date = new Date();
		const months = [
			"يناير",
			"فبراير",
			"مارس",
			"أبريل",
			"مايو",
			"يونيو",
			"يوليو",
			"أغسطس",
			"سبتمبر",
			"أكتوبر",
			"نوفمبر",
			"ديسمبر",
		];
		return `${date.getDate()} ${months[date.getMonth()]}، ${date.getFullYear()} (اليوم)`;
	};

	const periods: TimePeriod[] = ["يوم", "أسبوع", "شهر", "سنه"];

	return (
		<div
			className="min-h-screen bg-[#dff6ee] flex flex-col items-center py-8 px-4"
			dir="rtl"
		>
			{/* Title */}
			<h1 className="text-2xl font-bold text-[#2b6b3a] mb-6 text-center">
				تحفز وتابع تقدمك بصريا
			</h1>

			{/* Mobile Frame */}
			<div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
				{/* Header */}
				<div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
					<button className="text-gray-600 hover:text-gray-800">
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
					<select className="bg-transparent border-none text-gray-700 font-medium text-sm focus:outline-none">
						<option>نظرة عامة</option>
					</select>
					<button className="text-gray-600 hover:text-gray-800">
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
								d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
							/>
						</svg>
					</button>
				</div>

				{/* Navigation Tabs */}
				<div className="flex border-b border-gray-200">
					{periods.map((period) => (
						<button
							key={period}
							onClick={() => setSelectedPeriod(period)}
							className={`flex-1 py-3 text-sm font-medium transition-colors ${
								selectedPeriod === period
									? "text-[#7ec850] border-b-2 border-[#7ec850] bg-[#f0fdf4]"
									: "text-gray-600 hover:text-gray-800"
							}`}
						>
							{period}
						</button>
					))}
				</div>

				{/* Date Display */}
				<div className="flex items-center justify-center py-3 px-4 text-sm text-gray-600">
					<button className="mr-2">
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
								d="M15 19l-7-7 7-7"
							/>
						</svg>
					</button>
					<span>{getCurrentDate()}</span>
				</div>

				{/* 3D Scene Container */}
				<div className="relative bg-[#2b6b3a]">
					<div className="h-64 w-full">
						<ThreeScene number={collectedItems} />
					</div>

					{/* Interactive Elements Overlay */}
					<div className="absolute bottom-4 left-4 right-4 flex justify-between items-center">
						<div className="flex items-center gap-2 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1.5">
							<svg
								className="w-4 h-4 text-white"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M19 9l-7 7-7-7"
								/>
							</svg>
							<span className="text-white text-sm font-medium">
								{collectedItems}
							</span>
						</div>
						<div className="flex items-center gap-2 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1.5">
							<svg
								className="w-4 h-4 text-white"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
								/>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
								/>
							</svg>
							<span className="text-white text-sm font-medium">{views}</span>
						</div>
					</div>
				</div>

				{/* Focus Time Distribution */}
				<div className="px-4 py-6 bg-white">
					<h2 className="text-lg font-semibold text-gray-800 mb-3">
						توزيع وقت التركيز
					</h2>

					<div className="mb-4">
						<p className="text-sm text-gray-600">
							إجمالي وقت التركيز: {totalFocusHours} ساعات {totalFocusMinutes} د
						</p>
					</div>

					{/* Bar Chart */}
					<div className="relative h-48 flex items-end justify-between gap-1 mb-2">
						{focusTimeData.map((data, index) => {
							const height = (data.minutes / maxMinutes) * 100;
							return (
								<div key={index} className="flex-1 flex flex-col items-center">
									<div
										className="w-full bg-[#7ec850] rounded-t transition-all hover:bg-[#6ab840]"
										style={{ height: `${Math.max(height, 2)}%` }}
										title={`${data.hour}:00 - ${data.minutes} دقيقة`}
									/>
									{index % 4 === 0 && (
										<span className="text-xs text-gray-500 mt-1">
											{String(data.hour).padStart(2, "0")}
										</span>
									)}
								</div>
							);
						})}
					</div>

					{/* Y-axis labels */}
					<div className="flex justify-between text-xs text-gray-400 mb-4">
						<span>0M</span>
						<span>{Math.ceil(maxMinutes)}</span>
					</div>
				</div>

				{/* Focus Rates Section */}
				<div className="px-4 py-6 bg-white border-t border-gray-100">
					<h2 className="text-lg font-semibold text-gray-800 mb-3">
						معدلات التركيز
					</h2>
					{/* Add more statistics here if needed */}
				</div>
			</div>
		</div>
	);
}
