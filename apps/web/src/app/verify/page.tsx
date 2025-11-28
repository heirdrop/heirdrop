"use client";

import { useEffect, useState } from "react";
import { SelfQRcodeWrapper, SelfAppBuilder, countries } from "@selfxyz/qrcode";
import type { SelfApp } from "@selfxyz/qrcode";
import { useAccount } from "wagmi";
import Link from "next/link";
import { isAddress } from "viem";

export default function VerifyPage() {
  const { address } = useAccount();
  const [selfApp, setSelfApp] = useState<SelfApp | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const [verificationData, setVerificationData] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [ownerAddressForProof, setOwnerAddressForProof] = useState("");
  const [qrInitError, setQrInitError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    if (!ownerAddressForProof) {
      setSelfApp(null);
      setQrInitError("Enter the grantor's wallet so we can request the right claim.");
      return;
    }
    if (!isAddress(ownerAddressForProof as `0x${string}`)) {
      setSelfApp(null);
      setQrInitError("Owner address must be a valid checksum address.");
      return;
    }

    try {
      // Use ngrok URL if available (for development), otherwise use the origin
      const baseUrl = process.env.NEXT_PUBLIC_NGROK_URL || window.location.origin;
      const endpoint = process.env.NEXT_PUBLIC_HEIRLOCK_CONTRACT_ADDRESS!;

      const app = new SelfAppBuilder({
        version: 2,
        appName: "Heirdrop",
        scope: process.env.NEXT_PUBLIC_SELF_SCOPE_SEED!,
        endpoint,
        logoBase64: "", // Add your base64 logo if needed
        userId: address.toLowerCase() as `0x${string}`,
        endpointType: "staging_celo",
        userIdType: "hex",
        userDefinedData: JSON.stringify({
          purpose: "beneficiary_verification",
          timestamp: Date.now(),
          ownerAddress: ownerAddressForProof,
        }),
        disclosures: {
          minimumAge: 18,
          excludedCountries: [
            countries.CUBA,
            countries.IRAN,
            countries.NORTH_KOREA,
            countries.RUSSIA,
          ],
          nationality: true,
          gender: false,
          date_of_birth: true,
          name: true,
        },
      }).build();

      setSelfApp(app);
      setQrInitError(null);
    } catch (error) {
      console.error("Error building Self app:", error);
      setErrorMessage("Failed to initialize Self verification");
    }
  }, [address, ownerAddressForProof]);

  const handleVerificationSuccess = async () => {
    console.log("✅ Verification successful!");
    setVerificationStatus("success");
    
    try {
      // You can add additional logic here to process the verification
      // For example, call your backend to record the verification
      setVerificationData({
        address,
        timestamp: new Date().toISOString(),
        status: "verified",
      });
    } catch (error) {
      console.error("Error processing verification:", error);
    }
  };

  const handleVerificationError = (error: {
    error_code?: string;
    reason?: string;
  }) => {
    console.error("❌ Verification failed:", error);
    setVerificationStatus("error");
    setErrorMessage(
      error.reason || error.error_code || "Unknown verification error"
    );
  };

  if (!address) {
    return (
      <main className="flex-1 bg-background text-foreground">
        <div className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-10">
          <div className="w-full rounded-3xl border border-border bg-card/80 p-8 text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#ea5600]/20">
              <svg
                className="h-8 w-8 text-[#ea5600]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h1 className="mb-3 text-2xl font-semibold text-foreground">
              Wallet Connection Required
            </h1>
            <p className="mb-6 text-muted-foreground">
              Please connect your wallet to proceed with Self identity verification.
            </p>
            <Link
              href="/"
              className="inline-block rounded-xl bg-[#ea5600] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#ea5600]/90"
            >
              Go back to home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-background text-foreground">
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
        <header className="flex flex-col gap-4 rounded-3xl border border-border bg-card/80 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Link
              href="/"
              className="inline-flex items-center text-xs font-semibold text-emerald-300 hover:text-emerald-200"
            >
              <svg
                className="mr-2 h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back home
            </Link>
            <h1 className="mt-2 text-3xl font-semibold text-foreground">
              Self.xyz Identity Verification
            </h1>
            <p className="text-sm text-muted-foreground">
              Prove a beneficiary identity so the Heirlock relayer can call{" "}
              <code className="rounded bg-muted px-1 text-[11px] tracking-widest text-emerald-200">
                claimWithIdentity
              </code>{" "}
              on your behalf.
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3 text-sm">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Connected wallet
            </p>
            <p className="font-mono text-foreground">
              {address.slice(0, 6)}...{address.slice(-4)}
            </p>
          </div>
        </header>

        <section className="rounded-3xl border border-border bg-card/80 p-6">
          <label className="flex flex-col gap-2 text-sm font-semibold text-foreground">
            Grantor / owner address
            <input
              type="text"
              value={ownerAddressForProof}
              onChange={(event) => setOwnerAddressForProof(event.target.value.trim())}
              placeholder="0x..."
              className="rounded-2xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#ea5600] focus:outline-none"
            />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">
            We embed this address in the Self payload so the backend knows which grantor to unlock right after you pass verification.
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-4 rounded-3xl border border-border bg-card/90 p-6">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                Step 1
              </p>
              <h2 className="text-2xl font-semibold text-foreground">Scan and prove</h2>
              <p className="text-sm text-muted-foreground">
                Use the Self app to scan this QR code and complete the verification flow. Keep the app open until you see the success banner.
              </p>
            </div>
            <div className="flex items-center justify-center rounded-2xl border border-border/70 bg-background/40 p-6">
              {selfApp ? (
                <SelfQRcodeWrapper
                  selfApp={selfApp}
                  onSuccess={handleVerificationSuccess}
                  onError={handleVerificationError}
                  size={280}
                  darkMode
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
                  <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[#ea5600]" />
                  <p>{qrInitError || "Preparing QR session..."}</p>
                </div>
              )}
            </div>
            {verificationStatus === "pending" && (
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                Waiting for the Self app to finish...
              </div>
            )}
          </section>

          <section className="space-y-6">
            <div className="rounded-3xl border border-border bg-card/80 p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Verification status</h3>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    verificationStatus === "success"
                      ? "bg-emerald-500/20 text-emerald-200"
                      : verificationStatus === "error"
                      ? "bg-destructive/20 text-destructive"
                      : verificationStatus === "pending"
                      ? "bg-yellow-500/20 text-yellow-200"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {verificationStatus === "success"
                    ? "Verified"
                    : verificationStatus === "error"
                    ? "Failed"
                    : verificationStatus === "pending"
                    ? "Pending"
                    : "Idle"}
                </span>
              </div>
              {verificationData && (
                <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                  <p className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/40 px-3 py-2 font-mono text-xs text-foreground">
                    <span>Address</span>
                    <span>
                      {verificationData.address?.slice(0, 6)}...
                      {verificationData.address?.slice(-4)}
                    </span>
                  </p>
                  <p className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/40 px-3 py-2 text-xs">
                    <span>Timestamp</span>
                    <span>{new Date(verificationData.timestamp).toLocaleString()}</span>
                  </p>
                </div>
              )}
              {verificationStatus === "success" && (
                <div className="mt-4 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                  ✓ Identity proof received. The relayer can now unlock this heir once liveness expires.
                </div>
              )}
              {verificationStatus === "error" && errorMessage && (
                <div className="mt-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  ✗ {errorMessage}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-border bg-card/80 p-6">
              <h3 className="text-lg font-semibold text-foreground">What Self shares</h3>
              <p className="text-sm text-muted-foreground">
                The Self SDK issues a zero-knowledge proof with the minimum set of disclosures needed for Heirlock:
              </p>
              <ul className="mt-4 space-y-2 text-sm text-foreground">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-300">✓</span> Full name (first + last)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-300">✓</span> Date of birth (for identity hash)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-300">✓</span> Nationality + age checks
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-destructive">✗</span> Excluded countries (sanctions)
                </li>
              </ul>
            </div>

            <div className="rounded-3xl border border-[#ea5600]/30 bg-[#ea5600]/10 p-6 text-sm text-foreground">
              <h3 className="text-lg font-semibold text-[#ea5600]">Heirlock contract hook</h3>
              <p className="mt-2 text-muted-foreground">
                Once the proof lands, the relayer calls{" "}
                <code className="rounded bg-muted px-1 text-[11px] uppercase tracking-[0.2em] text-foreground">
                  claimWithIdentity(owner, hash, proof)
                </code>{" "}
                so the heir receives their allocation.
              </p>
            </div>
          </section>
        </div>

        <section className="rounded-3xl border border-border bg-card/80 p-6">
          <h3 className="text-lg font-semibold text-foreground">Documentation & Resources</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <a
              href="https://docs.self.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/40 p-4 transition hover:border-emerald-300/60"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-200">
                📘
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Self.xyz docs</p>
                <p className="text-xs text-muted-foreground">Verification specs</p>
              </div>
            </a>
            <a
              href="https://github.com/selfxyz/workshop"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/40 p-4 transition hover:border-emerald-300/60"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-200">
                🛠️
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Workshop repo</p>
                <p className="text-xs text-muted-foreground">Example integrations</p>
              </div>
            </a>
            <a
              href="/api/auth/self/verify"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/40 p-4 transition hover:border-emerald-300/60"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-200">
                🔗
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Heirlock endpoint</p>
                <p className="text-xs text-muted-foreground">POST /api/auth/self/verify</p>
              </div>
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
