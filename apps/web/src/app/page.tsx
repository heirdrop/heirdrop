"use client";
import { HeartbeatLiveness } from "@/components/heartbeat-liveness";
import { useMiniApp } from "@/contexts/miniapp-context";
import { sdk } from "@farcaster/frame-sdk";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAccount, useConnect } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

type AssetHolding = {
  id: string;
  chain: string;
  symbol: string;
  balance: number;
  fiatValue: number;
  address?: string;
  category: "native" | "erc20";
};

type BeneficiaryEntry = {
  id: string;
  label: string;
  wallet: string;
  assetAddress: string;
  shareType: "ABSOLUTE" | "BPS";
  shareAmount: string;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export default function Home() {
  const { context, isMiniAppReady, isInMiniApp } = useMiniApp();
  const [isAddingMiniApp, setIsAddingMiniApp] = useState(false);
  const [addMiniAppMessage, setAddMiniAppMessage] = useState<string | null>(null);
  const [isVerifyingAssets, setIsVerifyingAssets] = useState(false);
  const [lastVerification, setLastVerification] = useState<string | null>(null);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [assets, setAssets] = useState<AssetHolding[]>([]);
  const [personalNote, setPersonalNote] = useState(
    "If I miss my check-in window, please initiate the transfer exactly as I've described below."
  );
  const [timePeriodDays, setTimePeriodDays] = useState("30");
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryEntry[]>([
    {
      id: "beneficiary-1",
      label: "Primary Heir",
      wallet: "",
      assetAddress: "",
      shareType: "BPS",
      shareAmount: "2500",
    },
  ]);
  const [isSubmittingWill, setIsSubmittingWill] = useState(false);
  const [willStatusMessage, setWillStatusMessage] = useState<string | null>(null);
  const [payloadPreview, setPayloadPreview] = useState<any | null>(null);

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

  // mock holdings anchored by connected wallet
  useEffect(() => {
    if (!walletAddress) return;
    const normalized = walletAddress.toLowerCase();
    const dynamicFactor = normalized.charCodeAt(2) % 5;
    const sample: AssetHolding[] = [
      {
        id: "eth",
        chain: "Ethereum",
        symbol: "ETH",
        balance: 1.87 + dynamicFactor * 0.13,
        fiatValue: 1.87 * 3200 + dynamicFactor * 150,
        category: "native",
      },
      {
        id: "usdc",
        chain: "Base",
        symbol: "USDC",
        balance: 12500 + dynamicFactor * 320,
        fiatValue: 12500 + dynamicFactor * 320,
        category: "erc20",
        address: "0xA0b8...6eB48",
      },
      {
        id: "celo",
        chain: "Celo",
        symbol: "CELO",
        balance: 480.12 + dynamicFactor * 8,
        fiatValue: 480.12 * 0.85,
        category: "native",
      },
      {
        id: "dai",
        chain: "Polygon",
        symbol: "DAI",
        balance: 3000 + dynamicFactor * 45,
        fiatValue: 3000 + dynamicFactor * 45,
        category: "erc20",
        address: "0x6B17...271d0",
      },
    ];
    setAssets(sample);
  }, [walletAddress]);

  const totalFiatValue = useMemo(
    () => assets.reduce((sum, asset) => sum + asset.fiatValue, 0),
    [assets]
  );

  const handleVerifyHoldings = async () => {
    setIsVerifyingAssets(true);
    setVerificationMessage(null);
    try {
      // Placeholder for unified balance indexer call
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const timestamp = new Date().toLocaleTimeString();
      setLastVerification(timestamp);
      setVerificationMessage("Holdings verified across supported EVM chains.");
    } finally {
      setIsVerifyingAssets(false);
    }
  };

  const addBeneficiaryRow = () => {
    setBeneficiaries((current) => [
      ...current,
      {
        id: `beneficiary-${current.length + 1}`,
        label: `Heir #${current.length + 1}`,
        wallet: "",
        assetAddress: "",
        shareType: "ABSOLUTE",
        shareAmount: "",
      },
    ]);
  };

  const updateBeneficiary = (
    id: string,
    field: keyof BeneficiaryEntry,
    value: string
  ) => {
    setBeneficiaries((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, [field]: value } : entry
      )
    );
  };

  const removeBeneficiary = (id: string) => {
    setBeneficiaries((current) => current.filter((entry) => entry.id !== id));
  };

  const handleWillCreation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmittingWill(true);
    setWillStatusMessage(null);

    const sanitizedEntries = beneficiaries.filter(
      (entry) => entry.wallet && entry.assetAddress && entry.shareAmount
    );

    if (!sanitizedEntries.length) {
      setWillStatusMessage("Add at least one beneficiary with an asset and share.");
      setIsSubmittingWill(false);
      return;
    }

    const durationDays = Math.max(1, Number(timePeriodDays) || 1);
    const payload = {
      owner: walletAddress,
      livenessDurationSeconds: durationDays * 24 * 60 * 60,
      note: personalNote,
      instructions: sanitizedEntries.map((entry) => ({
        beneficiary: entry.wallet,
        asset: entry.assetAddress,
        shareType: entry.shareType,
        shareAmount: entry.shareAmount,
      })),
    };

    setPayloadPreview(payload);

    await new Promise((resolve) => setTimeout(resolve, 900));
    setWillStatusMessage(
      "Draft ready. Push the payload through the Heirlock contract to finalize on-chain."
    );
    setIsSubmittingWill(false);
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
                whether it’s for inheritance, private key recovery,or peace of mind.
              </p>
              <div className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-3">
                <div className="rounded-xl border border-border/60 bg-card/80 p-4">
                  <p className="mb-1 text-xs text-muted-foreground">Liveness Checks</p>
                  <p className="text-lg font-semibold text-foreground">
                    {timePeriodDays || "30"} day cadence
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/80 p-4">
                  <p className="mb-1 text-xs text-muted-foreground">Beneficiaries</p>
                  <p className="text-lg font-semibold text-foreground">
                    {beneficiaries.length} configured
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/80 p-4">
                  <p className="mb-1 text-xs text-muted-foreground">Total Holdings</p>
                  <p className="text-lg font-semibold text-foreground">
                    {currencyFormatter.format(totalFiatValue)}
                  </p>
                </div>
              </div>
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

        <HeartbeatLiveness ownerAddress={walletAddress} />

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card/70 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-foreground">Cross-chain assets</h3>
              <span
                className={`text-xs ${
                  isConnected ? "text-accent" : "text-muted-foreground"
                } flex items-center gap-2`}
              >
                <span className="h-2 w-2 rounded-full bg-current" />
                {isConnected ? "Connected" : "Connect wallet"}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Heirlock indexes balances from every supported EVM chain to build a unified inventory
              of your estate. Choose which assets go into each beneficiary&apos;s allocation.
            </p>
            <div className="mt-6 space-y-3">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-card/80 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {asset.symbol}{" "}
                      <span className="text-xs text-muted-foreground">· {asset.chain}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {asset.category === "native" ? "Native" : "ERC-20"}{" "}
                      {asset.address && `• ${asset.address}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">
                      {asset.balance.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {currencyFormatter.format(asset.fiatValue)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card/70 p-6">
            <h3 className="text-xl font-semibold text-foreground">Verification</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Before activating a will, confirm that your balances and token approvals are synced
              with the Heirlock contract. This triggers allowance checks similar to
              <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                _validateApprovals
              </code>
              inside the Solidity code.
            </p>
            <button
              onClick={handleVerifyHoldings}
              disabled={isVerifyingAssets}
              className="mt-6 w-full rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/70"
            >
              {isVerifyingAssets ? "Verifying..." : "Verify my holdings"}
            </button>
            <div className="mt-4 rounded-xl border border-border/60 bg-card/80 p-4 text-sm text-muted-foreground">
              {verificationMessage ? (
                <>
                  <p>{verificationMessage}</p>
                  {lastVerification && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Last updated · {lastVerification}
                    </p>
                  )}
                </>
              ) : (
                <p>Awaiting verification. Tap the button to refresh the registry.</p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card/80 p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-foreground">Draft your will</h3>
              <p className="text-sm text-muted-foreground">
                Configure the liveness check window, articulate your intent, and map assets to
                heirs. This mirrors the{" "}
                <code className="rounded bg-muted px-1 text-xs uppercase tracking-wide">
                  createWill
                </code>{" "}
                and{" "}
                <code className="rounded bg-muted px-1 text-xs uppercase tracking-wide">
                  configureLiveness
                </code>{" "}
                calls in the
                Heirlock contract.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card/70 px-4 py-3 text-center">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Owner</p>
              <p className="font-mono text-sm text-foreground">{formatAddress(walletAddress)}</p>
            </div>
          </div>

          <form className="mt-8 space-y-8" onSubmit={handleWillCreation}>
            <div className="grid gap-6 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
                Personal note to heirs
                <textarea
                  value={personalNote}
                  onChange={(event) => setPersonalNote(event.target.value)}
                  className="min-h-[120px] rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  placeholder="Tell your beneficiaries what this vault represents and how to treat it."
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
                Check-in cadence (days)
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={timePeriodDays}
                  onChange={(event) => setTimePeriodDays(event.target.value)}
                  className="rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  placeholder="30"
                />
                <span className="text-xs font-normal text-muted-foreground">
                  Heirlock will call{" "}
                  <code className="rounded bg-muted px-1 text-[10px] uppercase tracking-wide">
                    checkIn()
                  </code>{" "}
                  on your behalf before {Math.max(1, Number(timePeriodDays) || 1)} days lapse.
                </span>
              </label>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Beneficiaries</p>
                <button
                  type="button"
                  onClick={addBeneficiaryRow}
                  className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:text-primary"
                >
                  + Add beneficiary
                </button>
              </div>

              <div className="space-y-4">
                {beneficiaries.map((entry, index) => (
                  <div
                    key={entry.id}
                    className="space-y-4 rounded-2xl border border-border bg-card/60 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">
                        {entry.label || `Beneficiary ${index + 1}`}
                      </p>
                      {beneficiaries.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeBeneficiary(entry.id)}
                          className="text-xs text-destructive hover:text-destructive/80"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
                        Wallet address
                        <input
                          value={entry.wallet}
                          onChange={(event) =>
                            updateBeneficiary(entry.id, "wallet", event.target.value)
                          }
                          className="rounded-xl border border-border bg-card/70 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                          placeholder="0x..."
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
                        Asset address (ERC-20)
                        <input
                          value={entry.assetAddress}
                          onChange={(event) =>
                            updateBeneficiary(entry.id, "assetAddress", event.target.value)
                          }
                          className="rounded-xl border border-border bg-card/70 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                          placeholder="0x..."
                        />
                      </label>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
                        Share type
                        <select
                          value={entry.shareType}
                          onChange={(event) =>
                            updateBeneficiary(
                              entry.id,
                              "shareType",
                              event.target.value as BeneficiaryEntry["shareType"]
                            )
                          }
                          className="rounded-xl border border-border bg-card/70 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                        >
                          <option value="ABSOLUTE">Absolute amount</option>
                          <option value="BPS">BPS (0-10000)</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground md:col-span-2">
                        Share amount
                        <input
                          value={entry.shareAmount}
                          onChange={(event) =>
                            updateBeneficiary(entry.id, "shareAmount", event.target.value)
                          }
                          className="rounded-xl border border-border bg-card/70 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                          placeholder={entry.shareType === "BPS" ? "1000 = 10%" : "1000 tokens"}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <button
                type="submit"
                disabled={isSubmittingWill}
                className="w-full rounded-2xl bg-accent px-6 py-4 text-sm font-semibold text-accent-foreground transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-accent/60"
              >
                {isSubmittingWill ? "Compiling payload..." : "Create Heirlock will"}
              </button>
              {willStatusMessage && (
                <div className="rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
                  {willStatusMessage}
                </div>
              )}
              {payloadPreview && (
                <pre className="overflow-auto rounded-2xl border border-border bg-card/70 p-4 text-xs text-muted-foreground">
                  {JSON.stringify(payloadPreview, null, 2)}
                </pre>
              )}
            </div>
          </form>
        </section>

        {/* Self Verification Test Section */}
        <section className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-background p-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                  <svg
                    className="h-5 w-5 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                </div>
                <h3 className="text-2xl font-semibold text-foreground">
                  Identity Verification Testing
                </h3>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                Test the Self.xyz identity verification integration that powers identity-verified 
                beneficiaries in the Heirlock contract. This allows you to create wills for 
                beneficiaries identified by their real-world identity (name and date of birth) 
                instead of just wallet addresses.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 8 8">
                    <circle cx="4" cy="4" r="3" />
                  </svg>
                  Zero-knowledge proofs
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 8 8">
                    <circle cx="4" cy="4" r="3" />
                  </svg>
                  Privacy-preserving
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 8 8">
                    <circle cx="4" cy="4" r="3" />
                  </svg>
                  On-chain verification
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-3 w-full md:w-auto">
              <a
                href="/verify"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 shadow-lg shadow-primary/30"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                  />
                </svg>
                Test Self Verification
              </a>
              <p className="text-center text-xs text-muted-foreground">
                Scan QR code with Self app
              </p>
            </div>
          </div>
          
          <div className="mt-6 rounded-2xl border border-border bg-card/70 p-4">
            <div className="flex items-start gap-3">
              <svg
                className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="flex-1">
                <p className="mb-1 text-xs font-semibold text-foreground">
                  How it works with Heirlock
                </p>
                <p className="text-xs text-muted-foreground">
                  When you create an identity-verified will using{" "}
                  <code className="rounded bg-muted px-1 text-[10px] uppercase tracking-wide">
                    createIdentityWill()
                  </code>
                  , the contract stores a hash of the beneficiary's identity (first name, 
                  last name, date of birth). When they claim, they prove their identity 
                  through Self.xyz, and the contract's{" "}
                  <code className="rounded bg-muted px-1 text-[10px] uppercase tracking-wide">
                    customVerificationHook()
                  </code>{" "}
                  verifies the match and releases the assets.
                </p>
              </div>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}
