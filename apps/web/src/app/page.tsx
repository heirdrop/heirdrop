"use client";
import { HeartbeatLiveness } from "@/components/heartbeat-liveness";
import { useMiniApp } from "@/contexts/miniapp-context";
import heirlockAbi from "@/lib/heirlock-abi.json";
import { HEIRLOCK_CONTRACT_ADDRESS } from "@/lib/heirlock-contract";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BaseError } from "viem";
import {
  useAccount,
  useChainId,
  useConnect,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { celoSepolia } from "wagmi/chains";

type LivenessPayload = {
  owner: string;
  durationSeconds: number;
  lastCheckInSeconds: number;
  nextCheckpointSeconds: number;
};

function formatRelative(seconds: number) {
  if (!Number.isFinite(seconds)) return "Unknown";
  if (seconds <= 0) return "due now";
  const days = Math.floor(seconds / 86400);
  if (days > 0) {
    return `${days} day${days > 1 ? "s" : ""}`;
  }
  const hours = Math.floor(seconds / 3600);
  if (hours > 0) {
    return `${hours} hr${hours > 1 ? "s" : ""}`;
  }
  const minutes = Math.ceil(seconds / 60);
  if (minutes > 0) {
    return `${minutes} min${minutes > 1 ? "s" : ""}`;
  }
  return "moments";
}

function formatTimestamp(timestampSeconds: number) {
  if (!timestampSeconds) return "No check-ins recorded yet";
  return new Date(timestampSeconds * 1000).toLocaleString();
}

function formatErrorMessage(error: unknown) {
  if (error instanceof BaseError && error.shortMessage) {
    return error.shortMessage;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong";
}

export default function Home() {
  const { context, isMiniAppReady, isInMiniApp } = useMiniApp();
  const [liveness, setLiveness] = useState<LivenessPayload | null>(null);
  const [livenessError, setLivenessError] = useState<string | null>(null);
  const [isLoadingLiveness, setIsLoadingLiveness] = useState(false);
  const [heartbeatRefreshKey, setHeartbeatRefreshKey] = useState(0);
  const [isProofing, setIsProofing] = useState(false);
  const [proofMessage, setProofMessage] = useState<string | null>(null);

  // Wallet connection hooks
  const { address, isConnected, isConnecting } = useAccount();
  const { connect, connectors } = useConnect();
  const chainId = useChainId();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const targetChain = celoSepolia;
  const isOnTargetChain = chainId === targetChain.id;

  // Auto-connect wallet when in miniapp context (not regular web)
  useEffect(() => {
    if (isInMiniApp && isMiniAppReady && !isConnected && !isConnecting && connectors.length > 0) {
      const farcasterConnector = connectors.find((c) => c.id === "farcaster");
      if (farcasterConnector) {
        connect({ connector: farcasterConnector });
      }
    }
  }, [isInMiniApp, isMiniAppReady, isConnected, isConnecting, connectors, connect]);

  const connectedWallet = isConnected && address ? address : null;

  const ensureTargetChain = useCallback(async () => {
    if (isOnTargetChain) return;
    if (!switchChainAsync) {
      throw new Error("Switch your wallet network to Celo Sepolia.");
    }
    await switchChainAsync({ chainId: targetChain.id });
  }, [isOnTargetChain, switchChainAsync, targetChain.id]);

  useEffect(() => {
    if (!connectedWallet) {
      setLiveness(null);
      setLivenessError(null);
      return;
    }
    let cancelled = false;
    const fetchLiveliness = async () => {
      setIsLoadingLiveness(true);
      setLivenessError(null);
      try {
        const response = await fetch(`/api/liveliness?owner=${connectedWallet}`);
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const data = (await response.json()) as LivenessPayload;
        if (!cancelled) {
          setLiveness(data);
        }
      } catch (error) {
        if (!cancelled) {
          setLiveness(null);
          setLivenessError(error instanceof Error ? error.message : "Unable to fetch liveness");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingLiveness(false);
        }
      }
    };
    fetchLiveliness();
    return () => {
      cancelled = true;
    };
  }, [connectedWallet, heartbeatRefreshKey]);

  // Extract user data from context
  const user = context?.user;
  // Use connected wallet address if available, otherwise fall back to user custody/verification
  const walletAddress =
    connectedWallet || user?.custody || user?.verifications?.[0] || "0x1e4B...605B";
  const displayName = user?.displayName || user?.username || "Heir";
  const username = user?.username || "@user";
  const pfpUrl = user?.pfpUrl;

  const formatAddress = (addr: string) => {
    if (!addr || addr.length < 10) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const hasCadence = Boolean(liveness && liveness.durationSeconds > 0);
  const secondsUntilCheckpoint = useMemo(() => {
    if (!liveness) return null;
    return liveness.nextCheckpointSeconds - Date.now() / 1000;
  }, [liveness]);
  const lastCheckInTimestamp = liveness?.lastCheckInSeconds ?? 0;

  const handleProofActivity = useCallback(async () => {
    setProofMessage(null);
    if (!connectedWallet) {
      setProofMessage("Connect your wallet to send a proof of activity.");
      return;
    }
    if (!publicClient) {
      setProofMessage("Wallet client is not ready. Please try again.");
      return;
    }
    try {
      setIsProofing(true);
      await ensureTargetChain();
      const hash = await writeContractAsync({
        abi: heirlockAbi,
        address: HEIRLOCK_CONTRACT_ADDRESS,
        functionName: "checkIn",
        args: [],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setProofMessage(`Activity recorded at ${new Date().toLocaleTimeString()}. Tx: ${hash}`);
      setHeartbeatRefreshKey((current) => current + 1);
    } catch (error) {
      setProofMessage(formatErrorMessage(error));
    } finally {
      setIsProofing(false);
    }
  }, [connectedWallet, ensureTargetChain, publicClient, writeContractAsync]);

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
                Set it and forget it.
                Heirdrop ensures your digital wealth transfers seamlessly when it matters most,
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
                    ? "Wallet connected"
                    : isConnecting
                    ? "Connecting wallet..."
                    : "Tap to connect wallet"}
                </p>
              </div>
            </div>
          </div>
        </section>
        {connectedWallet && (
          <section className="space-y-6 rounded-3xl border border-border bg-card/80 p-8">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Liveness watchtower</p>
                <h2 className="text-2xl font-semibold text-foreground">Monitor your next heartbeat</h2>
                <p className="text-sm text-muted-foreground">
                  Once your Heirlock cadence is active, you can proof life here without leaving the home page.
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p className="font-mono text-sm text-foreground">{formatAddress(connectedWallet)}</p>
                <p>{isLoadingLiveness ? "Syncing liveness…" : hasCadence ? "Cadence detected" : "Not configured"}</p>
              </div>
            </div>
            {hasCadence ? (
              <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
                <HeartbeatLiveness ownerAddress={connectedWallet} refreshKey={heartbeatRefreshKey} />
                <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card/70 p-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Time until check-in</p>
                    <p className="text-3xl font-semibold text-foreground">
                      {secondsUntilCheckpoint !== null ? formatRelative(secondsUntilCheckpoint) : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Next window: {liveness ? formatTimestamp(liveness.nextCheckpointSeconds) : "Unknown"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Last proof of life</p>
                    <p className="text-sm text-foreground">
                      {lastCheckInTimestamp ? formatTimestamp(lastCheckInTimestamp) : "No activity recorded yet"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleProofActivity}
                    disabled={isProofing || isSwitchingChain}
                    className="rounded-2xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/60"
                  >
                    {isProofing
                      ? "Sending proof..."
                      : isSwitchingChain
                      ? "Switching network..."
                      : "Proof activity now"}
                  </button>
                  {proofMessage && (
                    <p className="rounded-2xl border border-border/60 bg-background/60 px-4 py-2 text-xs text-muted-foreground">
                      {proofMessage}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 p-5 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">No cadence detected.</p>
                <p className="mt-1">
                  Head to the Grantor page to configure your check-in window. Once saved, your heartbeat appears here.
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
