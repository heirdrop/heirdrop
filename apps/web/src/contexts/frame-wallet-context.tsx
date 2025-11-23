"use client";

import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { celo, celoSepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import {
  RainbowKitProvider,
  darkTheme,
} from "@rainbow-me/rainbowkit";

// Create config with injected wallets (MetaMask, etc.) + Farcaster
const config = createConfig({
  chains: [celoSepolia, celo],
  connectors: [
    injected({ shimDisconnect: true }),
    farcasterMiniApp(),
  ],
  transports: {
    [celo.id]: http(),
    [celoSepolia.id]: http(),
  },
});

const queryClient = new QueryClient();

export default function FrameWalletProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#6366f1",
            accentColorForeground: "white",
            borderRadius: "large",
            fontStack: "system",
            overlayBlur: "small",
          })}
          modalSize="compact"
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
