import { NextRequest, NextResponse } from "next/server";
import {
  generateIdentityHash,
  getIdentityBeneficiaries,
  hasIdentityClaimed,
} from "@/lib/heirlock-contract";
import type { Address } from "viem";
import { SelfBackendVerifier, DefaultConfigStore, AllIds } from "@selfxyz/core";
import { env } from "@/lib/env";
import { writeWithRelayer } from "@/lib/heirlock-writer";

// Initialize SelfBackendVerifier instance
// Configuration matches the frontend SelfAppBuilder settings
const selfBackendVerifier = new SelfBackendVerifier(
  process.env.NEXT_PUBLIC_SELF_SCOPE_SEED!,
  process.env.NEXT_PUBLIC_NGROK_URL
    ? `${process.env.NEXT_PUBLIC_NGROK_URL}/api/auth/self/verify`
    : `${
        process.env.NEXT_PUBLIC_URL || "http://heirdrop-web.vercel.com"
      }/api/auth/self/verify`, // endpoint
  true, // mockPassport = true for staging_https (testnet)
  AllIds, // allowed attestation IDs
  new DefaultConfigStore({
    minimumAge: 18,
    excludedCountries: ["CUB", "IRN", "PRK", "RUS"], // 3-letter ISO country codes
    ofac: false,
  }),
  "hex" // userIdentifierType
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("Self verification callback received:", {
      timestamp: new Date().toISOString(),
      data: body,
    });

    // The Self.xyz SDK will send the verification result to this endpoint
    const { attestationId, proof, publicSignals, userContextData } = body;

    // Validate required fields (per Self.xyz API spec)
    if (!proof || !publicSignals || !attestationId || !userContextData) {
      return NextResponse.json(
        {
          status: "error",
          result: false,
          reason:
            "Proof, publicSignals, attestationId and userContextData are required",
        },
        { status: 200 } // Always return 200 per Self.xyz spec
      );
    }

    // Verify the proof using SelfBackendVerifier
    const result = await selfBackendVerifier.verify(
      attestationId,
      proof,
      publicSignals,
      userContextData
    );

    console.log("Verification result:", result);

    // Check if verification is valid
    const { isValid, isMinimumAgeValid } = result.isValidDetails;
    if (!isValid || !isMinimumAgeValid) {
      let reason = "Verification failed";
      if (!isMinimumAgeValid) reason = "Minimum age verification failed";
      return NextResponse.json(
        {
          status: "error",
          result: false,
          reason,
        },
        { status: 200 } // Always return 200 per Self.xyz spec
      );
    }

    // Extract identity data from verification result
    const discloseOutput = result.discloseOutput || {};
    const userData = result.userData || {};

    // Parse name - can be array [firstName, lastName] or object
    let firstName: string | null = null;
    let lastName: string | null = null;
    if (discloseOutput.name) {
      if (
        Array.isArray(discloseOutput.name) &&
        discloseOutput.name.length >= 2
      ) {
        const nameArray = discloseOutput.name as unknown[];
        firstName = (nameArray[0] as string) || null;
        lastName = (nameArray[1] as string) || null;
      } else if (
        typeof discloseOutput.name === "object" &&
        discloseOutput.name !== null
      ) {
        const nameObj = discloseOutput.name as Record<string, unknown>;
        firstName = (nameObj.firstName || nameObj.first || null) as
          | string
          | null;
        lastName = (nameObj.lastName || nameObj.last || null) as string | null;
      }
    }

    const dateOfBirth = (discloseOutput.dateOfBirth || null) as string | null;
    const nationality = discloseOutput.nationality || null;

    // Parse userDefinedData to extract owner address if provided
    let ownerAddress: Address | null = null;
    let parsedUserDefinedData: any = null;
    if (userData.userDefinedData) {
      try {
        parsedUserDefinedData =
          typeof userData.userDefinedData === "string"
            ? JSON.parse(userData.userDefinedData)
            : userData.userDefinedData;

        // Try to extract owner address from userDefinedData
        if (parsedUserDefinedData.ownerAddress) {
          ownerAddress = parsedUserDefinedData.ownerAddress as Address;
        }
      } catch (error) {
        console.warn("Could not parse userDefinedData:", error);
      }
    }

    // Generate identity hash if we have the required data
    let identityHash: string | null = null;
    if (firstName && lastName && dateOfBirth) {
      try {
        identityHash = await generateIdentityHash(
          firstName,
          lastName,
          dateOfBirth
        );
        console.log("Generated identity hash:", identityHash);
      } catch (error) {
        console.error("Error generating identity hash:", error);
      }
    }

    // Check if identity has already claimed (if owner is known and identity hash is available)
    let alreadyClaimed = false;
    if (ownerAddress && identityHash) {
      try {
        alreadyClaimed = await hasIdentityClaimed(
          ownerAddress,
          identityHash as `0x${string}`
        );
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

    let claimTxHash: `0x${string}` | null = null;
    const proofBytes = normalizeProof(proof);

    if (
      ownerAddress &&
      identityHash &&
      proofBytes &&
      env.HEIRLOCK_RELAYER_PRIVATE_KEY &&
      !alreadyClaimed
    ) {
      try {
        const { hash } = await writeWithRelayer({
          functionName: "claimWithIdentity",
          args: [ownerAddress, identityHash as `0x${string}`, proofBytes],
        });
        claimTxHash = hash;
        alreadyClaimed = true;
        console.log("Triggered claimWithIdentity via relayer:", hash);
      } catch (error) {
        console.error("Failed to call claimWithIdentity:", error);
      }
    } else if (!env.HEIRLOCK_RELAYER_PRIVATE_KEY) {
      console.warn("Skipped claimWithIdentity relay - relayer key missing");
    } else if (!proofBytes) {
      console.warn("Skipped claimWithIdentity relay - proof payload missing 0x data");
    }

    // Return success response per Self.xyz API spec
    return NextResponse.json(
      {
        status: "success",
        result: true,
        data: {
          attestationId: result.attestationId,
          identity: {
            firstName,
            lastName,
            dateOfBirth,
            nationality,
            minimumAge: discloseOutput.minimumAge,
          },
          userData: {
            userIdentifier: userData.userIdentifier,
            userDefinedData: parsedUserDefinedData,
          },
          contract: {
            ownerAddress,
            alreadyClaimed,
            beneficiaries,
            identityHash,
          },
          timestamp: new Date().toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error processing Self verification:", error);
    return NextResponse.json(
      {
        status: "error",
        result: false,
        reason: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 200 } // Always return 200 per Self.xyz spec
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

function normalizeProof(value: unknown): `0x${string}` | null {
  if (typeof value === "string" && value.startsWith("0x")) {
    return value as `0x${string}`;
  }

  if (value && typeof value === "object") {
    const container = value as Record<string, unknown>;
    const nested = container.proof || container.proofData;
    if (typeof nested === "string" && nested.startsWith("0x")) {
      return nested as `0x${string}`;
    }
  }

  return null;
}
