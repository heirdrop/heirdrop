import { sendLayerZeroApprovalIntent } from "@/lib/layerzero-client";
import { NextResponse } from "next/server";
import { isAddress } from "viem";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { owner, token, layerZeroChainId } = body ?? {};
    if (!isAddress(owner)) {
      return NextResponse.json({ error: "Invalid owner address" }, { status: 400 });
    }
    if (!isAddress(token)) {
      return NextResponse.json({ error: "Invalid token address" }, { status: 400 });
    }
    if (typeof layerZeroChainId !== "number") {
      return NextResponse.json({ error: "Missing LayerZero chain id" }, { status: 400 });
    }
    const result = await sendLayerZeroApprovalIntent({
      owner,
      token,
      layerZeroChainId,
    });
    return NextResponse.json({ success: true, messageId: result.messageId, chain: result.chain });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send LayerZero intent";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
