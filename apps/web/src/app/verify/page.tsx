"use client";

import { useEffect, useState } from "react";
import { SelfQRcodeWrapper, SelfAppBuilder, countries } from "@selfxyz/qrcode";
import type { SelfApp } from "@selfxyz/qrcode";
import { useAccount } from "wagmi";
import Link from "next/link";
import { env } from "@/lib/env";

export default function VerifyPage() {
  const { address } = useAccount();
  const [selfApp, setSelfApp] = useState<SelfApp | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const [verificationData, setVerificationData] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    if (!address) return;

    try {
      // Use ngrok URL if available (for development), otherwise use the origin
      const baseUrl = env.NEXT_PUBLIC_NGROK_URL || window.location.origin;
      const endpoint = `${baseUrl}/api/auth/self/verify`;

      const app = new SelfAppBuilder({
        version: 2,
        appName: "Heirdrop",
        scope: process.env.SELF_SCOPE_SEED!,
        endpoint,
        logoBase64: "", // Add your base64 logo if needed
        userId: address,
        endpointType: "staging_https",
        userIdType: "hex",
        userDefinedData: JSON.stringify({
          purpose: "beneficiary_verification",
          timestamp: Date.now(),
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
    } catch (error) {
      console.error("Error building Self app:", error);
      setErrorMessage("Failed to initialize Self verification");
    }
  }, [address]);

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
      <main className="flex-1 bg-slate-950 text-slate-100 min-h-screen">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-8 text-center">
            <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-amber-500/20 flex items-center justify-center">
              <svg
                className="h-8 w-8 text-amber-400"
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
            <h1 className="text-2xl font-semibold text-white mb-3">
              Wallet Connection Required
            </h1>
            <p className="text-slate-400 mb-6">
              Please connect your wallet to proceed with Self identity verification.
            </p>
            <Link
              href="/"
              className="inline-block rounded-xl bg-indigo-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400"
            >
              Go back to home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-slate-950 text-slate-100 min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link
              href="/"
              className="inline-flex items-center text-sm text-indigo-400 hover:text-indigo-300 mb-4"
            >
              <svg
                className="h-4 w-4 mr-2"
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
              Back to home
            </Link>
            <h1 className="text-3xl font-semibold text-white">
              Self.xyz Identity Verification
            </h1>
            <p className="text-slate-400 mt-2">
              Test the Heirlock contract&apos;s identity verification integration
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3">
            <p className="text-xs text-slate-400">Connected Wallet</p>
            <p className="font-mono text-sm text-white">
              {address.slice(0, 6)}...{address.slice(-4)}
            </p>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* QR Code Section */}
          <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-900 p-8">
            <h2 className="text-xl font-semibold text-white mb-2">
              Scan QR Code
            </h2>
            <p className="text-sm text-slate-300 mb-6">
              Use the Self app to scan this QR code and verify your identity
            </p>

            <div className="flex items-center justify-center p-8 rounded-2xl bg-white/5 border border-white/10">
              {selfApp ? (
                <SelfQRcodeWrapper
                  selfApp={selfApp}
                  onSuccess={handleVerificationSuccess}
                  onError={handleVerificationError}
                  size={300}
                  darkMode={true}
                />
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400" />
                  <p className="text-sm text-slate-300">
                    Generating QR Code...
                  </p>
                </div>
              )}
            </div>

            {verificationStatus === "pending" && (
              <div className="mt-4 rounded-xl bg-blue-500/10 border border-blue-500/30 p-4">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400" />
                  <p className="text-sm text-blue-300">
                    Waiting for verification...
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Information & Status Section */}
          <section className="space-y-6">
            {/* Status Card */}
            <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                Verification Status
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60">
                  <span className="text-sm text-slate-300">Status</span>
                  <span
                    className={`text-sm font-semibold ${
                      verificationStatus === "success"
                        ? "text-green-400"
                        : verificationStatus === "error"
                        ? "text-red-400"
                        : verificationStatus === "pending"
                        ? "text-blue-400"
                        : "text-slate-400"
                    }`}
                  >
                    {verificationStatus === "success"
                      ? "✓ Verified"
                      : verificationStatus === "error"
                      ? "✗ Failed"
                      : verificationStatus === "pending"
                      ? "⋯ Pending"
                      : "○ Idle"}
                  </span>
                </div>
                {verificationData && (
                  <>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60">
                      <span className="text-sm text-slate-300">
                        Verified Address
                      </span>
                      <span className="text-sm font-mono text-white">
                        {verificationData.address?.slice(0, 6)}...
                        {verificationData.address?.slice(-4)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60">
                      <span className="text-sm text-slate-300">Timestamp</span>
                      <span className="text-xs text-slate-400">
                        {new Date(verificationData.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {verificationStatus === "success" && (
                <div className="mt-4 rounded-xl bg-green-500/10 border border-green-500/30 p-4">
                  <p className="text-sm text-green-300">
                    ✓ Identity verification successful! You can now use this
                    verified identity with the Heirlock contract.
                  </p>
                </div>
              )}

              {verificationStatus === "error" && errorMessage && (
                <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/30 p-4">
                  <p className="text-sm text-red-300">✗ {errorMessage}</p>
                </div>
              )}
            </div>

            {/* Information Card */}
            <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
              <h3 className="text-lg font-semibold text-white mb-3">
                About Self Verification
              </h3>
              <div className="space-y-3 text-sm text-slate-300">
                <p>
                  Self.xyz provides privacy-preserving identity verification
                  using zero-knowledge proofs. This integration allows Heirlock
                  to verify beneficiary identities without storing sensitive
                  personal information on-chain.
                </p>
                <div className="rounded-xl bg-slate-950/60 p-4 space-y-2">
                  <h4 className="font-semibold text-white text-xs uppercase tracking-wide">
                    Disclosure Requirements
                  </h4>
                  <ul className="space-y-1 text-xs">
                    <li className="flex items-center gap-2">
                      <span className="text-green-400">✓</span>
                      <span>Minimum age: 18 years</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-green-400">✓</span>
                      <span>Full name (first + last)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-green-400">✓</span>
                      <span>Date of birth</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-green-400">✓</span>
                      <span>Nationality</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-red-400">✗</span>
                      <span>Excluded countries (sanctions compliance)</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Contract Integration Info */}
            <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-6">
              <h3 className="text-lg font-semibold text-white mb-3">
                Contract Integration
              </h3>
              <div className="space-y-2 text-sm text-slate-300">
                <p>
                  The Heirlock contract uses{" "}
                  <code className="rounded bg-slate-800 px-2 py-0.5 text-xs text-indigo-300">
                    customVerificationHook
                  </code>{" "}
                  to process verified identity data and match it against
                  beneficiary records.
                </p>
                <div className="mt-3 p-3 rounded-xl bg-slate-950/60 font-mono text-xs text-slate-400">
                  <div>function claimWithIdentity(</div>
                  <div className="pl-4">address _owner,</div>
                  <div className="pl-4">bytes32 _identityHash,</div>
                  <div className="pl-4">bytes calldata _proof</div>
                  <div>) external</div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Documentation Links */}
        <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Documentation & Resources
          </h3>
          <div className="grid gap-4 md:grid-cols-3">
            <a
              href="https://docs.self.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-xl border border-white/10 bg-slate-950/60 hover:border-indigo-400/50 transition"
            >
              <div className="h-10 w-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                <svg
                  className="h-5 w-5 text-indigo-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  Self.xyz Docs
                </p>
                <p className="text-xs text-slate-400">Official documentation</p>
              </div>
            </a>
            <a
              href="https://github.com/selfxyz/workshop"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-xl border border-white/10 bg-slate-950/60 hover:border-indigo-400/50 transition"
            >
              <div className="h-10 w-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                <svg
                  className="h-5 w-5 text-indigo-400"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    fillRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  Workshop Repo
                </p>
                <p className="text-xs text-slate-400">Example implementations</p>
              </div>
            </a>
            <a
              href={`/api/auth/self/verify`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-xl border border-white/10 bg-slate-950/60 hover:border-indigo-400/50 transition"
            >
              <div className="h-10 w-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                <svg
                  className="h-5 w-5 text-indigo-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">API Endpoint</p>
                <p className="text-xs text-slate-400">Verification callback</p>
              </div>
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}

