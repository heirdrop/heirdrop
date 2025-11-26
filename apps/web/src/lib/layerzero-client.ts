"use server";

import { randomUUID } from "crypto";

export type LayerZeroChainMeta = {
  name: string;
  evmChainId: number;
  layerZeroChainId: number;
};

// Reference LayerZero endpoint IDs for common L2s
export const layerZeroChains: Record<number, LayerZeroChainMeta> = {
  101: { name: "Ethereum", evmChainId: 1, layerZeroChainId: 101 },
  110: { name: "Arbitrum", evmChainId: 42161, layerZeroChainId: 110 },
  184: { name: "Base", evmChainId: 8453, layerZeroChainId: 184 },
};

type LayerZeroMessageRequest = {
  owner: `0x${string}`;
  token: `0x${string}`;
  layerZeroChainId: number;
};

export async function sendLayerZeroApprovalIntent({
  owner,
  token,
  layerZeroChainId,
}: LayerZeroMessageRequest) {
  const chain = layerZeroChains[layerZeroChainId];
  if (!chain) {
    throw new Error(`Unsupported LayerZero chain: ${layerZeroChainId}`);
  }
  const messageId = typeof randomUUID === "function" ? randomUUID() : `lz-${Date.now()}`;
  console.info("[LayerZero] Queued remote approval intent", {
    owner,
    token,
    chain,
    messageId,
  });
  return { messageId, chain };
}
