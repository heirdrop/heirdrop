"use client";

import { useCallback, useEffect, useState } from "react";
import type { PublicClient } from "viem";
import { formatUnits } from "viem";
import { HEIRLOCK_CONTRACT_ADDRESS } from "@/lib/heirlock-contract";
import {
  AssetHolding,
  CELO_NATIVE_ADDRESS,
  celoSepoliaTokenCandidates,
  generateRemoteHoldings,
} from "@/lib/assets";
import { erc20AllowanceAbi, erc20BalanceAbi } from "@/lib/erc20";

type UseWalletAssetsArgs = {
  owner?: `0x${string}` | null;
  publicClient?: PublicClient;
  chainId?: number;
  targetChainId: number;
  isConnected: boolean;
  includeRemoteHoldings?: boolean;
};

export function useWalletAssets({
  owner,
  publicClient,
  chainId,
  targetChainId,
  isConnected,
  includeRemoteHoldings = true,
}: UseWalletAssetsArgs) {
  const [assets, setAssets] = useState<AssetHolding[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const refresh = useCallback(() => {
    setRefreshNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!owner || !owner.startsWith("0x")) {
      setAssets(includeRemoteHoldings ? generateRemoteHoldings(owner) : []);
      setError(null);
      return;
    }
    if (!publicClient || !isConnected) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      setIsLoading(true);
      setError(null);

      if (chainId !== targetChainId) {
        if (!cancelled) {
          setAssets(includeRemoteHoldings ? generateRemoteHoldings(owner) : []);
          setError("Switch to Celo Sepolia to inspect on-chain holdings.");
          setIsLoading(false);
        }
        return;
      }

      try {
        const ownerAddress = owner as `0x${string}`;
        const holdings: AssetHolding[] = [];

        const nativeBalance = await publicClient.getBalance({ address: ownerAddress });
        if (nativeBalance > 0n) {
          const amount = Number(formatUnits(nativeBalance, 18));
          holdings.push({
            id: "celo-native",
            chain: "Celo (Sepolia)",
            chainId: targetChainId,
            symbol: "CELO",
            balance: amount,
            fiatValue: amount,
            category: "native",
            address: CELO_NATIVE_ADDRESS,
          });
        }

        for (const token of celoSepoliaTokenCandidates) {
          const code = await publicClient.getCode({ address: token.address });
          if (!code || code === "0x") continue;
          const [balance, allowance] = await Promise.all([
            publicClient.readContract({
              abi: erc20BalanceAbi,
              address: token.address,
              functionName: "balanceOf",
              args: [ownerAddress],
            }) as Promise<bigint>,
            publicClient.readContract({
              abi: erc20AllowanceAbi,
              address: token.address,
              functionName: "allowance",
              args: [ownerAddress, HEIRLOCK_CONTRACT_ADDRESS],
            }) as Promise<bigint>,
          ]);
          if (balance === 0n && allowance === 0n) continue;
          const decimals = token.decimals ?? 18;
          const amount = Number(formatUnits(balance, decimals));
          holdings.push({
            id: token.id,
            chain: "Celo (Sepolia)",
            chainId: targetChainId,
            symbol: token.symbol,
            balance: amount,
            fiatValue: amount,
            category: token.category,
            address: token.address,
            decimals,
            allowance,
            hasAllowance: allowance > 0n,
          });
        }

        const combined = includeRemoteHoldings
          ? [...holdings, ...generateRemoteHoldings(owner)]
          : holdings;

        if (!cancelled) {
          setAssets(combined);
        }
      } catch (error) {
        if (!cancelled) {
          setAssets(includeRemoteHoldings ? generateRemoteHoldings(owner) : []);
          const message =
            error instanceof Error ? error.message : "Unable to load wallet holdings.";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [
    owner,
    publicClient,
    isConnected,
    chainId,
    targetChainId,
    includeRemoteHoldings,
    refreshNonce,
  ]);

  return { assets, isLoading, error, refresh };
}
