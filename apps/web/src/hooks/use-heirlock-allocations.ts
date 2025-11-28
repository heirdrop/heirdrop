"use client";

import { useCallback, useEffect, useState } from "react";
import type { PublicClient } from "viem";
import heirlockAbi from "@/lib/heirlock-abi.json";
import { HEIRLOCK_CONTRACT_ADDRESS } from "@/lib/heirlock-contract";

export type OnChainShare = {
  asset: `0x${string}`;
  shareType: number;
  shareAmount: bigint;
  claimed: boolean;
};

export type OnChainAllocation = {
  beneficiary: `0x${string}`;
  shares: OnChainShare[];
};

type UseHeirlockAllocationsArgs = {
  owner?: `0x${string}` | null;
  publicClient?: PublicClient;
  enabled?: boolean;
};

export function useHeirlockAllocations({
  owner,
  publicClient,
  enabled = true,
}: UseHeirlockAllocationsArgs) {
  const [allocations, setAllocations] = useState<OnChainAllocation[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const refresh = useCallback(() => {
    setRefreshNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !owner || !publicClient) {
      setAllocations([]);
      setStatus("idle");
      setError(null);
      return;
    }

    let cancelled = false;
    const fetchAllocations = async () => {
      setStatus("loading");
      setError(null);

      try {
        const beneficiaries = (await publicClient.readContract({
          abi: heirlockAbi,
          address: HEIRLOCK_CONTRACT_ADDRESS,
          functionName: "getBeneficiaries",
          args: [owner],
        })) as `0x${string}`[];

        const entries: OnChainAllocation[] = [];
        for (const beneficiary of beneficiaries) {
          const assets = (await publicClient.readContract({
            abi: heirlockAbi,
            address: HEIRLOCK_CONTRACT_ADDRESS,
            functionName: "getWillAssets",
            args: [owner, beneficiary],
          })) as `0x${string}`[];

          if (!assets.length) continue;

          const shares: OnChainShare[] = [];
          for (const asset of assets) {
            const share = (await publicClient.readContract({
              abi: heirlockAbi,
              address: HEIRLOCK_CONTRACT_ADDRESS,
              functionName: "getAssetShare",
              args: [owner, beneficiary, asset],
            })) as {
              shareType: number;
              shareAmount: bigint;
              claimed: boolean;
            };

            shares.push({
              asset,
              shareType: Number((share as any).shareType ?? (share as any)[0] ?? 0),
              shareAmount: BigInt((share as any).shareAmount ?? (share as any)[1] ?? 0),
              claimed: Boolean((share as any).claimed ?? (share as any)[2] ?? false),
            });
          }

          if (shares.length) {
            entries.push({ beneficiary, shares });
          }
        }

        if (!cancelled) {
          setAllocations(entries);
          setStatus("idle");
        }
      } catch (caughtError) {
        if (!cancelled) {
          const message =
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to load Heirlock allocations.";
          setAllocations([]);
          setError(message);
          setStatus("error");
        }
      }
    };

    fetchAllocations();
    return () => {
      cancelled = true;
    };
  }, [enabled, owner, publicClient, refreshNonce]);

  return { allocations, status, error, refresh };
}
