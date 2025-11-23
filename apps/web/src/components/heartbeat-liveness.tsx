"use client";

import { useEffect, useMemo, useState } from "react";

type HeartbeatProps = {
  ownerAddress?: string | null;
};

type LivenessPayload = {
  owner: string;
  durationSeconds: number;
  lastCheckInSeconds: number;
  nextCheckpointSeconds: number;
};

const MIN_GRAPH_VALUE = 0.1;
const MAX_GRAPH_VALUE = 0.95;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function formatTimestamp(timestampSeconds: number) {
  if (!timestampSeconds) return "No history";
  const date = new Date(timestampSeconds * 1000);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(seconds: number) {
  if (!Number.isFinite(seconds)) return "Unknown";
  if (seconds <= 0) return "due now";
  const hours = Math.floor(seconds / 3600);
  if (hours >= 24) {
    const days = Math.ceil(hours / 24);
    return `${days} day${days > 1 ? "s" : ""}`;
  }
  if (hours > 0) {
    return `${hours} hr${hours > 1 ? "s" : ""}`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} min${minutes > 1 ? "s" : ""}`;
}

function formatAddress(address?: string | null) {
  if (!address) return "0x0000...0000";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function HeartbeatLiveness({ ownerAddress }: HeartbeatProps) {
  const [payload, setPayload] = useState<LivenessPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!ownerAddress || !ownerAddress.startsWith("0x")) return;
    let cancelled = false;
    const fetchLiveliness = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/liveliness?owner=${ownerAddress}`);
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const data = (await response.json()) as LivenessPayload;
        if (!cancelled) {
          setPayload(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load contract data");
          setPayload(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    fetchLiveliness();
    return () => {
      cancelled = true;
    };
  }, [ownerAddress]);

  const nowSeconds = Date.now() / 1000;
  const progress = useMemo(() => {
    if (!payload) return 0.3;
    if (!payload.durationSeconds) return 0;
    const elapsed = nowSeconds - payload.lastCheckInSeconds;
    return clamp(elapsed / payload.durationSeconds, 0, 1.5);
  }, [payload, nowSeconds]);

  const nextCheckpoint = payload?.nextCheckpointSeconds ?? 0;
  const secondsLeft = payload ? nextCheckpoint - nowSeconds : 0;

  const statusLabel = useMemo(() => {
    if (!payload) return "Awaiting liveness data";
    if (secondsLeft < 0) return "Checkpoint overdue";
    if (progress > 0.85) return "Check-in window opening";
    if (progress > 0.55) return "Approaching checkpoint";
    return "Rhythm locked";
  }, [payload, progress, secondsLeft]);

  const heartbeatPath = useMemo(() => {
    const baseWave = [0.5, 0.48, 0.45, 0.4, 0.7, 0.15, 0.9, 0.2, 0.55, 0.48, 0.46, 0.5];
    const tension = 0.15 + clamp(progress, 0, 1) * 0.25;
    const dynamicWave = baseWave.map((value, index) => {
      const modifier = Math.sin((progress * Math.PI * 2 + index) * 0.6) * tension;
      const nextValue = clamp(value + modifier, MIN_GRAPH_VALUE, MAX_GRAPH_VALUE);
      return nextValue;
    });
    return dynamicWave
      .map((value, index) => {
        const x = (index / (dynamicWave.length - 1)) * 120;
        const y = (1 - value) * 40;
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }, [progress]);

  const timeline = useMemo(() => {
    if (!payload) return [];
    const points = Array.from({ length: 4 }, (_, index) => {
      const timestamp = payload.nextCheckpointSeconds - payload.durationSeconds * index;
      return {
        label: index === 0 ? "Next checkpoint" : `Checkpoint -${index}`,
        timestamp,
        isFuture: timestamp >= nowSeconds,
      };
    });
    return points;
  }, [payload, nowSeconds]);

  return (
    <section className="rounded-3xl border border-white/20 bg-black/95 p-6 text-white shadow-2xl shadow-black/50">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/50">
            Pulse monitor
          </p>
          <h3 className="text-2xl font-semibold">Liveness electrogram</h3>
          <p className="text-sm text-white/60">
            Streaming the cadence of your on-chain check-ins from the Heirlock contract.
          </p>
        </div>
        <div className="rounded-2xl border border-white/30 px-4 py-2 text-right">
          <p className="text-[10px] uppercase tracking-[0.25em] text-white/50">Owner</p>
          <p className="font-mono text-sm">{formatAddress(ownerAddress)}</p>
          <p className="text-[11px] text-white/60">
            {payload ? `Every ${Math.max(payload.durationSeconds / 86400, 1).toFixed(0)} days` : "syncing"}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-gradient-to-b from-neutral-900 via-black to-neutral-950 p-4">
        <div className="relative h-40 overflow-hidden rounded-xl bg-black">
          <div className="absolute inset-0 grid grid-cols-12 grid-rows-4 gap-0 opacity-20">
            {Array.from({ length: 12 }).map((_, index) => (
              <span key={`v-${index}`} className="border-r border-white/10" />
            ))}
          </div>
          <div className="absolute inset-0 grid grid-rows-5 opacity-20">
            {Array.from({ length: 5 }).map((_, index) => (
              <span key={`h-${index}`} className="border-b border-white/10" />
            ))}
          </div>
          <svg viewBox="0 0 120 40" className="h-full w-full">
            <path
              d={heartbeatPath}
              fill="none"
              stroke={error ? "#f87171" : "#f9fafb"}
              strokeWidth={2}
              strokeLinecap="round"
              className="drop-shadow-[0_0_6px_rgba(255,255,255,0.4)]"
            />
          </svg>
          <div
            className="absolute bottom-3 left-3 text-[11px] uppercase tracking-[0.2em]"
            style={{ color: error ? "#f87171" : "#e5e7eb" }}
          >
            {statusLabel}
          </div>
          <div className="absolute bottom-3 right-3 text-xs font-mono text-white/70">
            {isLoading ? "Syncing..." : payload ? formatTimestamp(payload.lastCheckInSeconds) : "Awaiting signal"}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-[11px] uppercase tracking-[0.15em] text-white/60">Last ping</p>
          <p className="text-lg font-semibold">
            {payload ? formatRelative(nowSeconds - payload.lastCheckInSeconds) : "—"}
          </p>
          <p className="text-xs text-white/50">
            {payload ? formatTimestamp(payload.lastCheckInSeconds) : "waiting for first check-in"}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-[11px] uppercase tracking-[0.15em] text-white/60">Next window</p>
          <p className="text-lg font-semibold">
            {payload ? formatRelative(secondsLeft) : "—"}
          </p>
          <p className="text-xs text-white/50">
            {payload ? formatTimestamp(nextCheckpoint) : "contract sync pending"}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-[11px] uppercase tracking-[0.15em] text-white/60">Signal quality</p>
          <p className="text-lg font-semibold">{error ? "degraded" : "stable"}</p>
          <p className="text-xs text-white/50">
            {error ? error : "Reading directly from Heirlock smart contract"}
          </p>
        </div>
      </div>

      {timeline.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-3">
          {timeline.map((entry) => (
            <div
              key={entry.label}
              className={`flex-1 min-w-[140px] rounded-xl border px-3 py-2 text-xs ${
                entry.isFuture ? "border-white/30 bg-white/10 text-white" : "border-white/10 text-white/50"
              }`}
            >
              <p className="uppercase tracking-[0.2em] text-[10px]">{entry.label}</p>
              <p className="font-mono text-sm">{formatTimestamp(entry.timestamp)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
