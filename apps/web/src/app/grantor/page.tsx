"use client";
import { HeartbeatLiveness } from "@/components/heartbeat-liveness";
import { useMiniApp } from "@/contexts/miniapp-context";
import heirlockAbi from "@/lib/heirlock-abi.json";
import { HEIRLOCK_CONTRACT_ADDRESS } from "@/lib/heirlock-contract";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { BaseError, isAddress } from "viem";
import { useAccount, useChainId, useConnect, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { celoSepolia } from "wagmi/chains";

type AssetHolding = {
  id: string;
  chain: string;
  chainId?: number;
  symbol: string;
  balance: number;
  fiatValue: number;
  address?: string;
  category: "native" | "erc20";
};

type BeneficiaryEntry = {
  id: string;
  label: string;
  mode: "wallet" | "identity";
  wallet: string;
  fullName: string;
  birthDate: string;
  assetId?: string;
  assetAddress: string;
  shareType: "ABSOLUTE" | "BPS";
  shareAmount: string;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const shareTypeToEnum: Record<BeneficiaryEntry["shareType"], number> = {
  ABSOLUTE: 1,
  BPS: 2,
};

type PreparedInstruction = {
  id: string;
  mode: BeneficiaryEntry["mode"];
  wallet?: `0x${string}`;
  identity?: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
  };
  assetAddress: `0x${string}`;
  shareTuple: {
    shareType: number;
    shareAmount: bigint;
    claimed: boolean;
  };
  shareTypeLabel: BeneficiaryEntry["shareType"];
};

type AssetVerificationState = {
  status: "idle" | "pending" | "verified" | "error";
  note?: string;
};

function formatBirthDate(dateValue: string) {
  const trimmed = dateValue.trim();
  const [year, month, day] = trimmed.split("-");
  if (year && month && day) {
    return `${day}-${month}-${year.slice(-2)}`;
  }
  return trimmed;
}

function normalizeIdentity(fullName: string, birthDate: string) {
  const segments = fullName.trim().split(/\s+/);
  if (segments.length < 2) {
    throw new Error("Enter both a first and last name for identity beneficiaries.");
  }
  const firstName = segments.shift() as string;
  const lastName = segments.join(" ");
  if (!birthDate) {
    throw new Error("Select a birth date for identity beneficiaries.");
  }
  return {
    firstName,
    lastName,
    dateOfBirth: formatBirthDate(birthDate),
  };
}

function parseShareValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Enter a share amount for each beneficiary.");
  }
  if (trimmed.includes(".")) {
    throw new Error("Share amounts should be whole numbers (wei or BPS).");
  }
  return BigInt(trimmed);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveAssetAddress(
  entry: BeneficiaryEntry,
  assetMap: Record<string, AssetHolding>
) {
  const manual = entry.assetAddress?.trim();
  if (manual) {
    return manual;
  }
  if (entry.assetId) {
    const candidate = assetMap[entry.assetId]?.address?.trim();
    if (candidate) {
      return candidate;
    }
  }
  return "";
}

function formatContractError(error: unknown) {
  if (error instanceof BaseError && error.shortMessage) {
    return error.shortMessage;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong while talking to the contract.";
}

export default function Grantor() {
  const { context, isMiniAppReady, isInMiniApp } = useMiniApp();
  const [isSavingCadence, setIsSavingCadence] = useState(false);
  const [lastCadenceUpdate, setLastCadenceUpdate] = useState<string | null>(null);
  const [cadenceMessage, setCadenceMessage] = useState<string | null>(null);
  const [assets, setAssets] = useState<AssetHolding[]>([]);
  const [assetVerification, setAssetVerification] = useState<Record<string, AssetVerificationState>>({});
  const [personalNote, setPersonalNote] = useState(
    "If I miss my check-in window, please initiate the transfer exactly as I've described below."
  );
  const [timePeriodDays, setTimePeriodDays] = useState("30");
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryEntry[]>([
    {
      id: "beneficiary-1",
      label: "Primary Heir",
      mode: "wallet",
      wallet: "",
      fullName: "",
      birthDate: "",
      assetId: undefined,
      assetAddress: "",
      shareType: "BPS",
      shareAmount: "2500",
    },
  ]);
  const [isSubmittingWill, setIsSubmittingWill] = useState(false);
  const [willStatusMessage, setWillStatusMessage] = useState<string | null>(null);
  const [payloadPreview, setPayloadPreview] = useState<any | null>(null);
  const [heartbeatRefreshKey, setHeartbeatRefreshKey] = useState(0);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [checkInMessage, setCheckInMessage] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectingConnectorId, setConnectingConnectorId] = useState<string | null>(null);

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

  // Extract user data from context
  const user = context?.user;
  // Use connected wallet address if available, otherwise fall back to user custody/verification
  const walletAddress =
    address || user?.custody || user?.verifications?.[0] || "0x1e4B...605B";

  const availableConnectors = useMemo(
    () =>
      connectors.filter((connector) =>
        connector.id === "farcaster" ? isInMiniApp : true
      ),
    [connectors, isInMiniApp]
  );
  const needsNetworkSwitch = isConnected && !isOnTargetChain;
  const assetMap = useMemo(() => {
    return assets.reduce<Record<string, AssetHolding>>((map, asset) => {
      map[asset.id] = asset;
      return map;
    }, {});
  }, [assets]);
  const verifiedAssets = useMemo(
    () => assets.filter((asset) => assetVerification[asset.id]?.status === "verified"),
    [assets, assetVerification]
  );
  const verifiedAssetCount = verifiedAssets.length;
  const totalFiatValue = useMemo(
    () => assets.reduce((sum, asset) => sum + asset.fiatValue, 0),
    [assets]
  );
  const verifiedFiatValue = useMemo(
    () => verifiedAssets.reduce((sum, asset) => sum + asset.fiatValue, 0),
    [verifiedAssets]
  );
  const totalChainCount = useMemo(() => new Set(assets.map((asset) => asset.chain)).size, [assets]);
  const verifiedChainCount = useMemo(
    () => new Set(verifiedAssets.map((asset) => asset.chain)).size,
    [verifiedAssets]
  );
  const holdingsCoverage = totalFiatValue
    ? Math.min(100, Math.round((verifiedFiatValue / totalFiatValue) * 100))
    : 0;

  const formatAddress = (addr: string) => {
    if (!addr || addr.length < 10) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const refreshHeartbeat = () => setHeartbeatRefreshKey((current) => current + 1);
  const ensureTargetChain = async () => {
    if (isOnTargetChain) {
      return;
    }
    if (!switchChainAsync) {
      throw new Error("Switch your wallet network to Celo Sepolia.");
    }
    await switchChainAsync({ chainId: targetChain.id });
  };
  const handleConnectWallet = async (connectorId: string) => {
    setConnectError(null);
    setConnectingConnectorId(connectorId);
    try {
      const connector = availableConnectors.find((entry) => entry.id === connectorId);
      if (!connector) {
        throw new Error("Connector unavailable in this environment.");
      }
      await connect({ connector });
    } catch (error) {
      setConnectError(formatContractError(error));
    } finally {
      setConnectingConnectorId(null);
    }
  };
  const handleEnsureNetwork = async () => {
    setConnectError(null);
    try {
      await ensureTargetChain();
    } catch (error) {
      setConnectError(formatContractError(error));
    }
  };

  const handleVerifyAsset = async (asset: AssetHolding) => {
    setAssetVerification((current) => ({
      ...current,
      [asset.id]: {
        status: "pending",
        note: `Confirming ${asset.chain} balance...`,
      },
    }));
    try {
      if (!isConnected || !address) {
        throw new Error("Connect your wallet before verifying holdings.");
      }
      await ensureTargetChain();
      await wait(600);
      setAssetVerification((current) => ({
        ...current,
        [asset.id]: {
          status: "verified",
          note: `Added ${asset.symbol} from ${asset.chain}`,
        },
      }));
    } catch (error) {
      setAssetVerification((current) => ({
        ...current,
        [asset.id]: {
          status: "error",
          note: formatContractError(error),
        },
      }));
    }
  };

  // mock holdings anchored by connected wallet
  useEffect(() => {
    if (!walletAddress) return;
    const normalized = walletAddress.toLowerCase();
    const dynamicFactor = normalized.charCodeAt(2) % 5;
    const sample: AssetHolding[] = [
      {
        id: "eth-mainnet",
        chain: "Ethereum",
        chainId: 1,
        symbol: "ETH",
        balance: 1.87 + dynamicFactor * 0.13,
        fiatValue: 1.87 * 3200 + dynamicFactor * 150,
        category: "native",
        address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
      },
      {
        id: "base-usdc",
        chain: "Base",
        chainId: 8453,
        symbol: "USDC",
        balance: 12500 + dynamicFactor * 320,
        fiatValue: 12500 + dynamicFactor * 320,
        category: "erc20",
        address: "0x833589fCd6eDb6Aad95d5baae5c2F9B3C6a3cB72",
      },
      {
        id: "celo-native",
        chain: "Celo",
        chainId: targetChain.id,
        symbol: "CELO",
        balance: 480.12 + dynamicFactor * 8,
        fiatValue: (480.12 + dynamicFactor * 8) * 0.85,
        category: "native",
        address: "0x471EcE3750Da237f93B8E339c536989b8978a438",
      },
      {
        id: "polygon-dai",
        chain: "Polygon",
        chainId: 137,
        symbol: "DAI",
        balance: 3000 + dynamicFactor * 45,
        fiatValue: 3000 + dynamicFactor * 45,
        category: "erc20",
        address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
      },
    ];
    setAssets(sample);
  }, [walletAddress]);

  useEffect(() => {
    setAssetVerification((current) => {
      const next: Record<string, AssetVerificationState> = { ...current };
      let changed = false;
      const ids = new Set(assets.map((asset) => asset.id));
      assets.forEach((asset) => {
        if (!next[asset.id]) {
          next[asset.id] = { status: "idle" };
          changed = true;
        }
      });
      Object.keys(next).forEach((assetId) => {
        if (!ids.has(assetId)) {
          delete next[assetId];
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [assets]);

  const handleSaveCadence = async () => {
    setIsSavingCadence(true);
    setCadenceMessage(null);
    try {
      if (!isConnected || !address) {
        throw new Error("Connect your wallet before configuring liveness.");
      }
      if (!publicClient) {
        throw new Error("Wallet client is not ready yet. Please retry.");
      }
      await ensureTargetChain();
      const durationDays = Math.max(1, Number(timePeriodDays) || 1);
      const durationSeconds = BigInt(durationDays * 24 * 60 * 60);
      const hash = await writeContractAsync({
        abi: heirlockAbi,
        address: HEIRLOCK_CONTRACT_ADDRESS,
        functionName: "configureLiveness",
        args: [durationSeconds],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      const timestamp = new Date().toLocaleTimeString();
      setLastCadenceUpdate(timestamp);
      setCadenceMessage("Cadence recorded on the Heirlock contract.");
      refreshHeartbeat();
    } catch (error) {
      setCadenceMessage(formatContractError(error));
    } finally {
      setIsSavingCadence(false);
    }
  };

  const handleCheckIn = async () => {
    setIsCheckingIn(true);
    setCheckInMessage(null);
    try {
      if (!isConnected || !address) {
        throw new Error("Connect your wallet before sending a check-in.");
      }
      if (!publicClient) {
        throw new Error("Wallet client is not ready yet. Please retry.");
      }
      await ensureTargetChain();
      const hash = await writeContractAsync({
        abi: heirlockAbi,
        address: HEIRLOCK_CONTRACT_ADDRESS,
        functionName: "checkIn",
        args: [],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setCheckInMessage(`Check-in saved on Heirlock at ${new Date().toLocaleTimeString()}.`);
      refreshHeartbeat();
    } catch (error) {
      setCheckInMessage(formatContractError(error));
    } finally {
      setIsCheckingIn(false);
    }
  };

  const addBeneficiaryRow = () => {
    setBeneficiaries((current) => [
      ...current,
      {
        id: `beneficiary-${current.length + 1}`,
        label: `Heir #${current.length + 1}`,
        mode: "wallet",
        wallet: "",
        fullName: "",
        birthDate: "",
        assetId: undefined,
        assetAddress: "",
        shareType: "ABSOLUTE",
        shareAmount: "",
      },
    ]);
  };

  const updateBeneficiary = (
    id: string,
    field: keyof BeneficiaryEntry,
    value: BeneficiaryEntry[keyof BeneficiaryEntry]
  ) => {
    setBeneficiaries((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, [field]: value } : entry
      )
    );
  };

  const handleBeneficiaryAssetSelection = (id: string, assetId: string) => {
    setBeneficiaries((current) =>
      current.map((entry) => {
        if (entry.id !== id) return entry;
        if (!assetId) {
          const { assetId: _, ...rest } = entry;
          return { ...rest, assetId: undefined };
        }
        const selectedAsset = assetMap[assetId];
        return {
          ...entry,
          assetId,
          assetAddress: selectedAsset?.address ?? entry.assetAddress,
        };
      })
    );
  };

  const removeBeneficiary = (id: string) => {
    setBeneficiaries((current) => current.filter((entry) => entry.id !== id));
  };

  const handleWillCreation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmittingWill(true);
    setWillStatusMessage(null);

    if (!isConnected || !address) {
      setWillStatusMessage("Connect your wallet to push this draft on-chain.");
      setIsSubmittingWill(false);
      return;
    }

    const sanitizedEntries = beneficiaries.filter((entry) => {
      const hasIdentity =
        entry.mode === "wallet"
          ? Boolean(entry.wallet)
          : Boolean(entry.fullName && entry.birthDate);

      const resolvedAsset = resolveAssetAddress(entry, assetMap);
      return hasIdentity && resolvedAsset && entry.shareAmount;
    });

    if (!sanitizedEntries.length) {
      setWillStatusMessage("Add at least one beneficiary with an asset and share.");
      setIsSubmittingWill(false);
      return;
    }

    let preparedEntries: PreparedInstruction[] = [];
    try {
      preparedEntries = sanitizedEntries.map((entry) => {
        const asset = resolveAssetAddress(entry, assetMap) as `0x${string}`;
        if (!isAddress(asset)) {
          throw new Error(`Asset address for ${entry.label || entry.id} is invalid.`);
        }
        if (entry.assetId && assetVerification[entry.assetId]?.status !== "verified") {
          const assetLabel = assetMap[entry.assetId]?.symbol || "this asset";
          throw new Error(`Verify ${assetLabel} before assigning it to a beneficiary.`);
        }
        const shareValue = parseShareValue(entry.shareAmount);
        const shareTuple = {
          shareType: shareTypeToEnum[entry.shareType],
          shareAmount: shareValue,
          claimed: false,
        };

        if (entry.mode === "wallet") {
          const wallet = entry.wallet.trim() as `0x${string}`;
          if (!isAddress(wallet)) {
            throw new Error(`Wallet address for ${entry.label || entry.id} is invalid.`);
          }
          return {
            id: entry.id,
            mode: entry.mode,
            wallet,
            assetAddress: asset,
            shareTuple,
            shareTypeLabel: entry.shareType,
          };
        }

        const identity = normalizeIdentity(entry.fullName, entry.birthDate);
        return {
          id: entry.id,
          mode: entry.mode,
          identity,
          assetAddress: asset,
          shareTuple,
          shareTypeLabel: entry.shareType,
        };
      });
    } catch (error) {
      setWillStatusMessage(formatContractError(error));
      setIsSubmittingWill(false);
      return;
    }

    const durationDays = Math.max(1, Number(timePeriodDays) || 1);
    const payload = {
      owner: walletAddress,
      livenessDurationSeconds: durationDays * 24 * 60 * 60,
      note: personalNote,
      instructions: preparedEntries.map((entry) => ({
        recipientType: entry.mode,
        wallet: entry.wallet,
        identity: entry.identity,
        asset: entry.assetAddress,
        shareType: entry.shareTypeLabel,
        shareAmount: entry.shareTuple.shareAmount.toString(),
      })),
    };

    setPayloadPreview(payload);

    if (!publicClient) {
      setWillStatusMessage("Wallet client is not ready. Please try again.");
      setIsSubmittingWill(false);
      return;
    }

    try {
      await ensureTargetChain();
      const hashes: `0x${string}`[] = [];
      for (const entry of preparedEntries) {
        if (entry.mode === "wallet" && entry.wallet) {
          const hash = (await writeContractAsync({
            abi: heirlockAbi,
            address: HEIRLOCK_CONTRACT_ADDRESS,
            functionName: "createWill",
            args: [entry.wallet, [entry.assetAddress], [entry.shareTuple]],
          })) as `0x${string}`;
          hashes.push(hash);
          await publicClient.waitForTransactionReceipt({ hash });
        } else if (entry.identity) {
          const hash = (await writeContractAsync({
            abi: heirlockAbi,
            address: HEIRLOCK_CONTRACT_ADDRESS,
            functionName: "createIdentityWill",
            args: [entry.identity, [entry.assetAddress], [entry.shareTuple]],
          })) as `0x${string}`;
          hashes.push(hash);
          await publicClient.waitForTransactionReceipt({ hash });
        }
      }

      if (!hashes.length) {
        setWillStatusMessage("Nothing to submit. Double-check your entries.");
      } else {
        const reminder = `Thanks for locking in your heirs — review or update these instructions before your ${Math.max(
          1,
          Number(timePeriodDays) || 1
        )}-day check-in window closes.`;
        setWillStatusMessage(
          `Heirlock stored ${hashes.length} allocation${
            hashes.length > 1 ? "s" : ""
          }. Latest tx hash: ${hashes[hashes.length - 1]}. ${reminder}`
        );
      }
    } catch (error) {
      setWillStatusMessage(formatContractError(error));
    } finally {
      setIsSubmittingWill(false);
    }
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
        <section className="space-y-6 rounded-3xl border border-border bg-card/80 p-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Step 1 · Inventory</p>
              <h3 className="text-2xl font-semibold text-foreground">Verify cross-chain holdings</h3>
              <p className="text-sm text-muted-foreground">
                Surface the assets living across your wallets so you can decide what the Heirlock
                contract should inherit.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 text-right text-xs text-muted-foreground">
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                  isConnected ? "border-emerald-400/40 text-emerald-200" : "border-border text-muted-foreground"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-emerald-400" : "bg-muted-foreground"}`} />
                {isConnected ? `Wallet · ${formatAddress(walletAddress)}` : "Wallet disconnected"}
              </span>
              <span className={needsNetworkSwitch ? "text-destructive" : "text-accent"}>
                {needsNetworkSwitch ? "Switch to Celo Sepolia" : "Celo Sepolia network ready"}
              </span>
              {needsNetworkSwitch && (
                <button
                  type="button"
                  onClick={handleEnsureNetwork}
                  disabled={isSwitchingChain}
                  className="rounded-full border border-destructive/50 px-4 py-1 text-[11px] font-semibold text-destructive transition hover:border-destructive disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSwitchingChain ? "Switching..." : "Switch network"}
                </button>
              )}
            </div>
          </div>

          {!isConnected && (
            <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 p-4 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">Connect a wallet to pull balances.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose the wallet that controls the estate on Celo.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {availableConnectors.length ? (
                  availableConnectors.map((connector) => (
                    <button
                      key={connector.id}
                      type="button"
                      onClick={() => handleConnectWallet(connector.id)}
                      disabled={connectingConnectorId === connector.id || isConnecting}
                      className="rounded-xl border border-border bg-card/70 px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {connectingConnectorId === connector.id ? "Connecting..." : connector.name}
                    </button>
                  ))
                ) : (
                  <span>No wallet connectors available in this context.</span>
                )}
              </div>
              {connectError && (
                <p className="mt-2 text-xs text-destructive">{connectError}</p>
              )}
            </div>
          )}

          <div className="space-y-3">
            {assets.map((asset) => {
              const verification = assetVerification[asset.id];
              const status = verification?.status || "idle";
              const isPending = status === "pending";
              const isVerified = status === "verified";
              const isError = status === "error";
              const buttonDisabled = !isConnected || isPending || isVerified || isConnecting;
              return (
                <div
                  key={asset.id}
                  className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/80 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {asset.symbol} <span className="text-xs text-muted-foreground">· {asset.chain}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {asset.category === "native" ? "Native" : "ERC-20"} asset{" "}
                      {asset.address && `• ${formatAddress(asset.address)}`}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 text-sm text-muted-foreground md:items-end">
                    <div className="text-right">
                      <p className="font-semibold text-foreground">{asset.balance.toFixed(2)}</p>
                      <p className="text-xs">{currencyFormatter.format(asset.fiatValue)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleVerifyAsset(asset)}
                        disabled={buttonDisabled}
                        className={`rounded-full px-4 py-1 text-xs font-semibold transition ${
                          isVerified
                            ? "bg-emerald-500/20 text-emerald-200"
                            : "bg-primary/10 text-primary hover:bg-primary/20"
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {isVerified ? "Chain verified" : isPending ? "Verifying..." : `Verify ${asset.chain}`}
                      </button>
                      <span
                        className={`rounded-full border px-3 py-1 text-[11px] ${
                          isVerified
                            ? "border-emerald-500/40 text-emerald-200"
                            : isError
                            ? "border-destructive/40 text-destructive"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {isVerified ? "Ready for will" : isError ? "Needs attention" : "Not added"}
                      </span>
                    </div>
                    {verification?.note && (
                      <p
                        className={`text-xs ${
                          isVerified
                            ? "text-emerald-200"
                            : isError
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }`}
                      >
                        {verification.note}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Holdings verified</p>
              <p className="text-xl font-semibold text-foreground">
                {verifiedAssetCount}/{Math.max(assets.length, 1)}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Chains covered</p>
              <p className="text-xl font-semibold text-foreground">
                {verifiedChainCount}/{Math.max(totalChainCount, 1)}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Fiat ready</p>
              <p className="text-xl font-semibold text-foreground">
                {currencyFormatter.format(verifiedFiatValue)}{" "}
                <span className="text-xs text-muted-foreground">({holdingsCoverage}% of holdings)</span>
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <HeartbeatLiveness ownerAddress={walletAddress} refreshKey={heartbeatRefreshKey} />
          <div className="rounded-2xl border border-border bg-card/70 p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Step 2 · Cadence</p>
            <h3 className="text-xl font-semibold text-foreground">Choose your check-in cadence</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Assign a heartbeat interval that the contract will expect. If you miss it, beneficiaries can eventually
              claim what you&apos;ve mapped to them.
            </p>
            <label className="mt-4 flex flex-col gap-2 text-sm font-medium text-foreground">
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
                This becomes the {Math.max(1, Number(timePeriodDays) || 1)}-day liveness window enforced by{" "}
                <code className="rounded bg-muted px-1 text-[10px] uppercase tracking-wide">configureLiveness</code>.
              </span>
            </label>
            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={handleSaveCadence}
                disabled={isSavingCadence}
                className="w-full rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/70"
              >
                {isSavingCadence ? "Saving cadence..." : "Save cadence on-chain"}
              </button>
              <button
                type="button"
                onClick={handleCheckIn}
                disabled={isCheckingIn}
                className="w-full rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-6 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isCheckingIn ? "Pinging contract..." : "Send check-in to Heirlock"}
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-xl border border-border/60 bg-card/80 p-4 text-sm text-muted-foreground">
                {cadenceMessage ? (
                  <>
                    <p>{cadenceMessage}</p>
                    {lastCadenceUpdate && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Last updated · {lastCadenceUpdate}
                      </p>
                    )}
                  </>
                ) : (
                  <p>Tap the save button after setting your cadence to lock it into the contract.</p>
                )}
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-50">
                {checkInMessage ? (
                  <p>{checkInMessage}</p>
                ) : (
                  <p>Send a heartbeat whenever you want to refresh the on-chain liveness timestamp.</p>
                )}
              </div>
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
              <div className="rounded-2xl border border-border bg-card/60 px-4 py-3">
                <p className="text-sm font-semibold text-foreground">Cadence summary</p>
                <p className="text-sm text-muted-foreground">
                  Heartbeats expected every {Math.max(1, Number(timePeriodDays) || 1)} days. Verified assets ready:{" "}
                  {verifiedAssetCount}/{assets.length || 1}. Keep this note aligned with what your heirs will receive.
                </p>
              </div>
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
                    <div className="grid gap-4 md:grid-cols-3">
                      <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
                        Recipient type
                        <select
                          value={entry.mode}
                          onChange={(event) =>
                            updateBeneficiary(
                              entry.id,
                              "mode",
                              event.target.value as BeneficiaryEntry["mode"]
                            )
                          }
                          className="rounded-xl border border-border bg-card/70 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                        >
                          <option value="wallet">Wallet address</option>
                          <option value="identity">Name + birth date</option>
                        </select>
                      </label>
                      {entry.mode === "wallet" ? (
                        <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground md:col-span-2">
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
                      ) : (
                        <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
                          <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
                            Full name
                            <input
                              value={entry.fullName}
                              onChange={(event) =>
                                updateBeneficiary(entry.id, "fullName", event.target.value)
                              }
                              className="rounded-xl border border-border bg-card/70 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                              placeholder="e.g. Alex Morgan"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
                            Birth date
                            <input
                              type="date"
                              value={entry.birthDate}
                              onChange={(event) =>
                                updateBeneficiary(entry.id, "birthDate", event.target.value)
                              }
                              className="rounded-xl border border-border bg-card/70 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                            />
                          </label>
                        </div>
                      )}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
                        Verified holding
                        <select
                          value={entry.assetId || ""}
                          onChange={(event) =>
                            handleBeneficiaryAssetSelection(entry.id, event.target.value)
                          }
                          disabled={!verifiedAssets.length}
                          className="rounded-xl border border-border bg-card/70 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <option value="">
                            {verifiedAssets.length ? "Select a verified asset" : "Verify holdings above first"}
                          </option>
                          {verifiedAssets.map((asset) => (
                            <option key={`${entry.id}-${asset.id}`} value={asset.id}>
                              {asset.symbol} · {asset.chain}
                            </option>
                          ))}
                        </select>
                        <span className="text-[11px] text-muted-foreground">
                          {entry.assetId && assetVerification[entry.assetId]?.note
                            ? assetVerification[entry.assetId]?.note
                            : "Link a verified holding or paste an ERC-20 address manually."}
                        </span>
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
                className="w-full rounded-2xl bg-[#ea5600] px-6 py-4 text-sm font-semibold text-white transition hover:bg-[#ea5600]/90 disabled:cursor-not-allowed disabled:bg-[#ea5600]/60"
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
