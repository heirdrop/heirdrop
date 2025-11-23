import { NextRequest, NextResponse } from "next/server";
import { generateIdentityHash, getIdentityBeneficiaries, hasIdentityClaimed } from "@/lib/heirlock-contract";
import type { Address } from "viem";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    console.log("Self verification callback received:", {
      timestamp: new Date().toISOString(),
      data: body,
    });

    // The Self.xyz SDK will send the verification result to this endpoint
    const { 
      userIdentifier, 
      nullifier, 
      name, 
      dateOfBirth, 
      nationality,
      minimumAge,
      proof,
    } = body;

    // Validate required fields
    if (!name || !Array.isArray(name) || name.length < 2) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid name data",
          message: "Name must be an array with at least 2 elements (firstName, lastName)",
        },
        { status: 400 }
      );
    }

    if (!dateOfBirth) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing dateOfBirth",
        },
        { status: 400 }
      );
    }

    const [firstName, lastName] = name;

    // Generate identity hash to match against contract records
    let identityHash: string;
    try {
      identityHash = await generateIdentityHash(firstName, lastName, dateOfBirth);
      console.log("Generated identity hash:", identityHash);
    } catch (error) {
      console.error("Error generating identity hash:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to generate identity hash",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }

    // Extract owner address from userDefinedData if available
    // The userDefinedData should contain the owner address for the will
    let ownerAddress: Address | null = null;
    try {
      const userDefinedData = body.userDefinedData;
      if (userDefinedData) {
        const parsed = typeof userDefinedData === "string" 
          ? JSON.parse(userDefinedData) 
          : userDefinedData;
        if (parsed.ownerAddress) {
          ownerAddress = parsed.ownerAddress as Address;
        }
      }
    } catch (error) {
      console.warn("Could not parse userDefinedData:", error);
    }

    // Check if identity has already claimed (if owner is known)
    let alreadyClaimed = false;
    if (ownerAddress) {
      try {
        alreadyClaimed = await hasIdentityClaimed(ownerAddress, identityHash as `0x${string}`);
        console.log("Identity claim status:", alreadyClaimed);
      } catch (error) {
        console.warn("Could not check claim status:", error);
      }
    }

    // Get identity beneficiaries for the owner (if owner is known)
    let beneficiaries: `0x${string}`[] = [];
    if (ownerAddress) {
      try {
        beneficiaries = await getIdentityBeneficiaries(ownerAddress);
        console.log("Found beneficiaries:", beneficiaries);
      } catch (error) {
        console.warn("Could not fetch beneficiaries:", error);
      }
    }

    // Return verification result with contract interaction data
    return NextResponse.json({
      success: true,
      message: "Verification received and processed",
      data: {
        userIdentifier,
        nullifier,
        identityHash,
        identity: {
          firstName,
          lastName,
          dateOfBirth,
          nationality,
        },
        contract: {
          ownerAddress,
          alreadyClaimed,
          beneficiaries,
          identityHash,
        },
        proof: proof ? "present" : "missing", // Don't send full proof in response
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error processing Self verification:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process verification",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: "Self verification endpoint is active",
    timestamp: new Date().toISOString(),
  });
}

