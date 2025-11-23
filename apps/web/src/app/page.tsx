"use client";
import { useMiniApp } from "@/contexts/miniapp-context";
import { useEffect } from "react";
import { useAccount, useConnect } from "wagmi";

export default function Home() {
  const { context, isMiniAppReady, isInMiniApp } = useMiniApp();

  // Wallet connection hooks
  const { address, isConnected, isConnecting } = useAccount();
  const { connect, connectors } = useConnect();

  // Auto-connect wallet when in miniapp context (not regular web)
  useEffect(() => {
    if (isInMiniApp && isMiniAppReady && !isConnected && !isConnecting && connectors.length > 0) {
      const farcasterConnector = connectors.find((c) => c.id === "farcaster");
      if (farcasterConnector) {
        connect({ connector: farcasterConnector });
      }
    }
  }, [isInMiniApp, isMiniAppReady, isConnected, isConnecting, connectors, connect]);

  // Extract user data from context
  const user = context?.user;
  // Use connected wallet address if available, otherwise fall back to user custody/verification
  const walletAddress =
    address || user?.custody || user?.verifications?.[0] || "0x1e4B...605B";
  const displayName = user?.displayName || user?.username || "Heir";
  const username = user?.username || "@user";
  const pfpUrl = user?.pfpUrl;

  const formatAddress = (addr: string) => {
    if (!addr || addr.length < 10) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // Only show loading state if we're actually in a miniapp context
  // Regular web users don't need to wait for miniapp initialization
  if (isInMiniApp && !isMiniAppReady) {
    return (
      <main className="flex-1 bg-background text-foreground">
        <section className="flex min-h-screen items-center justify-center">
          <div className="w-full max-w-md mx-auto p-8 text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-primary"></div>
            <p className="text-sm text-muted-foreground">Preparing Heirlock...</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-background text-foreground">
      <div className="mx-auto max-w-5xl space-y-10 px-4 py-10">
        <section className="rounded-3xl border border-border bg-gradient-to-br from-primary/20 via-card to-secondary/20 p-8 shadow-xl">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-[0.3em] text-primary">
                Onchain succession protocol
              </p>
              <h1 className="text-4xl font-semibold text-foreground">
                HeirDrop keeps your assets in motion
              </h1>
              <p className="text-base text-muted-foreground">
                HeirDrop is an onchain succession protocol that lets you create a digital will for your crypto legacy.
                Designate an heir (a wallet or a person) to claim your assets across multiple EVM chains.
                Set it and forget it—Heirdrop ensures your digital wealth transfers seamlessly when it matters most,
                whether it&apos;s for inheritance, private key recovery,or peace of mind.
              </p>
            </div>
            <div className="w-full rounded-2xl border border-border bg-card/80 p-6 text-center md:max-w-xs">
              <div className="mx-auto mb-4 h-20 w-20 overflow-hidden rounded-full border border-border/70 bg-muted">
                {pfpUrl ? (
                  <img src={pfpUrl} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-3xl">
                    {displayName.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <h2 className="text-xl font-semibold text-foreground">{displayName}</h2>
              <p className="text-sm text-muted-foreground">
                {username.startsWith("@") ? username : `@${username}`}
              </p>
              <div className="mt-4 text-xs text-muted-foreground">
                <p className="font-mono text-sm text-foreground">{formatAddress(walletAddress)}</p>
                <p className="mt-1">
                  {isConnected
                    ? "Wallet connected via Farcaster"
                    : isConnecting
                    ? "Connecting wallet..."
                    : "Tap to connect wallet inside Warpcast"}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
