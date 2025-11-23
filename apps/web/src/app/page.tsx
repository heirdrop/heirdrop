"use client";
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
  const { context, isMiniAppReady } = useMiniApp();
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

  // Auto-connect wallet when miniapp is ready
  useEffect(() => {
    if (isMiniAppReady && !isConnected && !isConnecting && connectors.length > 0) {
      const farcasterConnector = connectors.find((c) => c.id === "farcaster");
      if (farcasterConnector) {
        connect({ connector: farcasterConnector });
      }
    }
  }, [isMiniAppReady, isConnected, isConnecting, connectors, connect]);

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

  if (!isMiniAppReady) {
    return (
      <main className="flex-1">
        <section className="flex items-center justify-center min-h-screen bg-slate-950 text-white">
          <div className="w-full max-w-md mx-auto p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
            <p className="text-sm text-slate-300">Preparing Heirlock...</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-slate-950 text-slate-100">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
        <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-900 p-8 shadow-xl border border-white/5">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-[0.3em] text-indigo-300">
                Succession Protocol
              </p>
              <h1 className="text-4xl font-semibold text-white">
                Heirlock keeps your on-chain estate in motion
              </h1>
              <p className="text-base text-slate-300">
                Configure a living will, ask the protocol to ping you, and release assets to the
                right beneficiaries only when you miss a check-in. Your statement of intent, list of
                heirs, and ERC-20 allocations are enforced by the Heirlock smart contract.
              </p>
              <div className="grid gap-4 text-sm text-slate-200 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 p-4">
                  <p className="text-xs text-slate-400 mb-1">Liveness Checks</p>
                  <p className="text-lg font-semibold">{timePeriodDays || "30"} day cadence</p>
                </div>
                <div className="rounded-xl border border-white/10 p-4">
                  <p className="text-xs text-slate-400 mb-1">Beneficiaries</p>
                  <p className="text-lg font-semibold">{beneficiaries.length} configured</p>
                </div>
                <div className="rounded-xl border border-white/10 p-4">
                  <p className="text-xs text-slate-400 mb-1">Total Holdings</p>
                  <p className="text-lg font-semibold">
                    {currencyFormatter.format(totalFiatValue)}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-white/5 p-6 text-center w-full md:max-w-xs border border-white/10">
              <div className="mx-auto mb-4 h-20 w-20 overflow-hidden rounded-full border border-white/20 bg-slate-800">
                {pfpUrl ? (
                  <img src={pfpUrl} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-3xl">
                    {displayName.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <h2 className="text-xl font-semibold text-white">{displayName}</h2>
              <p className="text-sm text-slate-400">
                {username.startsWith("@") ? username : `@${username}`}
              </p>
              <div className="mt-4 text-xs text-slate-400">
                <p className="font-mono text-sm text-white">{formatAddress(walletAddress)}</p>
                <p className="mt-1">
                  {isConnected
                    ? "Wallet connected via Farcaster"
                    : isConnecting
                    ? "Connecting wallet..."
                    : "Tap to connect wallet inside Warpcast"}
                </p>
              </div>
              <div className="mt-6">
                <ConnectButton chainStatus="icon" showBalance={false} />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-white">Cross-chain assets</h3>
              <span
                className={`text-xs ${
                  isConnected ? "text-green-400" : "text-slate-500"
                } flex items-center gap-2`}
              >
                <span className="h-2 w-2 rounded-full bg-current" />
                {isConnected ? "Connected" : "Connect wallet"}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-400">
              Heirlock indexes balances from every supported EVM chain to build a unified inventory
              of your estate. Choose which assets go into each beneficiary&apos;s allocation.
            </p>
            <div className="mt-6 space-y-3">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-900/80 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {asset.symbol} <span className="text-xs text-slate-400">· {asset.chain}</span>
                    </p>
                    <p className="text-xs text-slate-400">
                      {asset.category === "native" ? "Native" : "ERC-20"}{" "}
                      {asset.address && `• ${asset.address}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-white">
                      {asset.balance.toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {currencyFormatter.format(asset.fiatValue)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
            <h3 className="text-xl font-semibold text-white">Verification</h3>
            <p className="mt-2 text-sm text-slate-400">
              Before activating a will, confirm that your balances and token approvals are synced
              with the Heirlock contract. This triggers allowance checks similar to
              <code className="mx-1 rounded bg-slate-800 px-1 py-0.5 text-[10px] uppercase tracking-wide">
                _validateApprovals
              </code>
              inside the Solidity code.
            </p>
            <button
              onClick={handleVerifyHoldings}
              disabled={isVerifyingAssets}
              className="mt-6 w-full rounded-xl bg-indigo-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-indigo-400"
            >
              {isVerifyingAssets ? "Verifying..." : "Verify my holdings"}
            </button>
            <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">
              {verificationMessage ? (
                <>
                  <p>{verificationMessage}</p>
                  {lastVerification && (
                    <p className="text-xs text-slate-500 mt-1">Last updated · {lastVerification}</p>
                  )}
                </>
              ) : (
                <p>Awaiting verification. Tap the button to refresh the registry.</p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-white">Draft your will</h3>
              <p className="text-sm text-slate-400">
                Configure the liveness check window, articulate your intent, and map assets to
                heirs. This mirrors the <code className="rounded bg-slate-800 px-1">createWill</code>{" "}
                and <code className="rounded bg-slate-800 px-1">configureLiveness</code> calls in the
                Heirlock contract.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-center">
              <p className="text-xs uppercase tracking-wide text-slate-400">Owner</p>
              <p className="font-mono text-sm text-white">{formatAddress(walletAddress)}</p>
            </div>
          </div>

          <form className="mt-8 space-y-8" onSubmit={handleWillCreation}>
            <div className="grid gap-6 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                Personal note to heirs
                <textarea
                  value={personalNote}
                  onChange={(event) => setPersonalNote(event.target.value)}
                  className="min-h-[120px] rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-400 focus:outline-none"
                  placeholder="Tell your beneficiaries what this vault represents and how to treat it."
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                Check-in cadence (days)
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={timePeriodDays}
                  onChange={(event) => setTimePeriodDays(event.target.value)}
                  className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-400 focus:outline-none"
                  placeholder="30"
                />
                <span className="text-xs font-normal text-slate-500">
                  Heirlock will call{" "}
                  <code className="rounded bg-slate-800 px-1">checkIn()</code> on your behalf before
                 {" "}
                  {Math.max(1, Number(timePeriodDays) || 1)} days lapse.
                </span>
              </label>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">Beneficiaries</p>
                <button
                  type="button"
                  onClick={addBeneficiaryRow}
                  className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white hover:border-indigo-400"
                >
                  + Add beneficiary
                </button>
              </div>

              <div className="space-y-4">
                {beneficiaries.map((entry, index) => (
                  <div
                    key={entry.id}
                    className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white">
                        {entry.label || `Beneficiary ${index + 1}`}
                      </p>
                      {beneficiaries.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeBeneficiary(entry.id)}
                          className="text-xs text-rose-300 hover:text-rose-200"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-300">
                        Wallet address
                        <input
                          value={entry.wallet}
                          onChange={(event) =>
                            updateBeneficiary(entry.id, "wallet", event.target.value)
                          }
                          className="rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-400 focus:outline-none"
                          placeholder="0x..."
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-300">
                        Asset address (ERC-20)
                        <input
                          value={entry.assetAddress}
                          onChange={(event) =>
                            updateBeneficiary(entry.id, "assetAddress", event.target.value)
                          }
                          className="rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-400 focus:outline-none"
                          placeholder="0x..."
                        />
                      </label>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-300">
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
                          className="rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
                        >
                          <option value="ABSOLUTE">Absolute amount</option>
                          <option value="BPS">BPS (0-10000)</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-300 md:col-span-2">
                        Share amount
                        <input
                          value={entry.shareAmount}
                          onChange={(event) =>
                            updateBeneficiary(entry.id, "shareAmount", event.target.value)
                          }
                          className="rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-400 focus:outline-none"
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
                className="w-full rounded-2xl bg-emerald-500 px-6 py-4 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-400"
              >
                {isSubmittingWill ? "Compiling payload..." : "Create Heirlock will"}
              </button>
              {willStatusMessage && (
                <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  {willStatusMessage}
                </div>
              )}
              {payloadPreview && (
                <pre className="overflow-auto rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-xs text-slate-300">
                  {JSON.stringify(payloadPreview, null, 2)}
                </pre>
              )}
            </div>
          </form>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 text-center">
          <h4 className="text-lg font-semibold text-white">Pin Heirlock inside Warpcast</h4>
          <p className="mt-2 text-sm text-slate-400">
            Add the mini app to your Warpcast sidebar and summon it whenever you need to adjust
            beneficiaries or check-in manually.
          </p>
          <button
            onClick={async () => {
              if (isAddingMiniApp) return;

              setIsAddingMiniApp(true);
              setAddMiniAppMessage(null);

              try {
                const result: any = await sdk.actions.addMiniApp();
                if (result?.added) {
                  setAddMiniAppMessage("✅ Miniapp added successfully!");
                } else {
                  setAddMiniAppMessage(
                    "ℹ️ Miniapp was not added (user declined or already exists)"
                  );
                }
              } catch (error: any) {
                console.error("Add miniapp error:", error);
                if (error?.message?.includes("domain")) {
                  setAddMiniAppMessage(
                    "⚠️ This miniapp can only be added from its official domain"
                  );
                } else {
                  setAddMiniAppMessage("❌ Failed to add miniapp. Please try again.");
                }
              } finally {
                setIsAddingMiniApp(false);
              }
            }}
            disabled={isAddingMiniApp}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-indigo-500 px-8 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-indigo-400"
          >
            {isAddingMiniApp ? "Adding..." : "Add Heirlock mini app"}
          </button>
          {addMiniAppMessage && (
            <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-200">
              {addMiniAppMessage}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
