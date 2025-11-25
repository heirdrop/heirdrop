import { env } from "@/lib/env";
import { getRelayerAddress, writeWithRelayer } from "@/lib/heirlock-writer";
import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";

function isAuthorized(request: NextRequest) {
  if (!env.HEIRLOCK_CRON_SECRET) return true;
  const header = request.headers.get("x-cron-secret");
  return header === env.HEIRLOCK_CRON_SECRET;
}

export async function GET() {
  if (!env.HEIRLOCK_RELAYER_PRIVATE_KEY) {
    return NextResponse.json(
      { ready: false, reason: "Set HEIRLOCK_RELAYER_PRIVATE_KEY before scheduling cron calls." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ready: true,
    relayer: getRelayerAddress(),
    info: "POST to this endpoint with header `x-cron-secret` to trigger checkIn().",
  });
}

export async function POST(request: NextRequest) {
  if (!env.HEIRLOCK_RELAYER_PRIVATE_KEY) {
    return NextResponse.json(
      { status: "error", reason: "HEIRLOCK_RELAYER_PRIVATE_KEY is not configured" },
      { status: 500 }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ status: "error", reason: "Unauthorized" }, { status: 401 });
  }

  const fallbackOwner = getRelayerAddress();
  let requestedOwner: string | undefined;
  try {
    const body = await request.json();
    if (body?.ownerAddress) {
      requestedOwner = body.ownerAddress;
    }
  } catch {
    // ignore - empty body
  }

  const ownerAddress = (requestedOwner || fallbackOwner) as `0x${string}`;

  if (!isAddress(ownerAddress)) {
    return NextResponse.json(
      { status: "error", reason: "ownerAddress must be a valid checksum address" },
      { status: 400 }
    );
  }

  if (ownerAddress.toLowerCase() !== fallbackOwner.toLowerCase()) {
    return NextResponse.json(
      {
        status: "error",
        reason: "Relayer can only submit check-ins for the configured owner address",
      },
      { status: 400 }
    );
  }

  try {
    const { hash } = await writeWithRelayer({ functionName: "checkIn", args: [] });
    return NextResponse.json({
      status: "success",
      owner: ownerAddress,
      txHash: hash,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        reason: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
