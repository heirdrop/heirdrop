import { getOwnerLiveliness } from "@/lib/heirlock-contract";
import { NextResponse } from "next/server";
import { isAddress } from "viem";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");

  if (!owner) {
    return NextResponse.json({ error: "Missing owner parameter" }, { status: 400 });
  }

  if (!isAddress(owner)) {
    return NextResponse.json({ error: "Invalid owner address" }, { status: 400 });
  }

  try {
    const result = await getOwnerLiveliness(owner);
    const durationSeconds = Number(result.duration ?? 0);
    const lastCheckInSeconds = Number(result.lastCheckIn ?? 0);

    return NextResponse.json({
      owner,
      durationSeconds,
      lastCheckInSeconds,
      nextCheckpointSeconds: lastCheckInSeconds + durationSeconds,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to fetch liveness" },
      { status: 500 }
    );
  }
}
