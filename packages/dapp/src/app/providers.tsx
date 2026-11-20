"use client";

import { Web3ModalConnectorContextProvider } from "@bch-wc2/web3modal-connector";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
	const [queryClient] = useState(() => new QueryClient());

	return (
		<QueryClientProvider client={queryClient}>
			<Web3ModalConnectorContextProvider
				config={{
					projectId: "b89a472ca74470463e1c16f3f6bfba4f",
					useChipnet: true,
					desktopWallets: [],
				}}
			>
				{children}
			</Web3ModalConnectorContextProvider>
		</QueryClientProvider>
	);
}
