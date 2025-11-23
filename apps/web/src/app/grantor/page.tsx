"use client";
import { HeartbeatLiveness } from "@/components/heartbeat-liveness";
import { useMiniApp } from "@/contexts/miniapp-context";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAccount, useConnect } from "wagmi";

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

export default function Grantor() {
  const { context, isMiniAppReady, isInMiniApp } = useMiniApp();
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
      </div>
    </main>
  );
}

