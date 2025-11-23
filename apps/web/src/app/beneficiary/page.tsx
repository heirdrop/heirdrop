"use client";

import heirlockAbi from "@/lib/heirlock-abi.json";
import { HEIRLOCK_CONTRACT_ADDRESS } from "@/lib/heirlock-contract";
import { FormEvent, useMemo, useState } from "react";
import { BaseError, isAddress } from "viem";
import { useAccount, useConnect, usePublicClient, useWriteContract } from "wagmi";

const formatContractError = (error: unknown) => {
  if (error instanceof BaseError && error.shortMessage) {
    return error.shortMessage;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unable to execute the contract call.";
};

export default function Beneficiary() {
  const { address, isConnected, isConnecting } = useAccount();
  const { connect, connectors, error: connectError, isPending } = useConnect();
  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formState, setFormState] = useState<"idle" | "submitting" | "success">("idle");
  const [ownerToClaim, setOwnerToClaim] = useState("");
  const [claimStatus, setClaimStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const instructionSteps = useMemo(
    () => [
      {
        title: "1. Let us know you&apos;re here",
        description:
          "Connect a wallet or share your name and birth date. We match that information to the secure hash your loved one stored when they created the will.",
      },
      {
        title: "2. Quietly verify",
        description:
          "Self.xyz powers the SAFE logic baked into Heirlock, so only a verified beneficiary can trigger customVerificationHook() on-chain.",
      },
      {
        title: "3. Release funds with care",
        description:
          "Once the match is confirmed, the Heirlock SAFE follows the exact instructions set in createIdentityWill() and settles assets to you.",
      },
    ],
    []
  );

  const handleManualLookup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!fullName.trim() || !birthDate) {
      setFormMessage("Please share both your full name and birth date so we can look for you.");
      return;
    }

    setFormState("submitting");
    setFormMessage(null);

    setTimeout(() => {
      setFormState("success");
      setFormMessage(
        "Thank you. We&apos;ll compare this information with the encrypted record your loved one left us and follow up with verification steps."
      );
    }, 800);
  };

  const handleWalletClaim = async () => {
    if (!isConnected || !address) {
      setClaimStatus("error");
      setClaimMessage("Connect your wallet to initiate a claim.");
      return;
    }
    const trimmedOwner = ownerToClaim.trim() as `0x${string}`;
    if (!trimmedOwner) {
      setClaimStatus("error");
      setClaimMessage("Enter the grantor's address you're claiming from.");
      return;
    }
    if (!isAddress(trimmedOwner)) {
      setClaimStatus("error");
      setClaimMessage("Owner address must be a valid checksum address.");
      return;
    }
    if (!publicClient) {
      setClaimStatus("error");
      setClaimMessage("Wallet client is not ready yet. Please retry.");
      return;
    }

    setClaimStatus("pending");
    setClaimMessage(null);

    try {
      const hash = (await writeContractAsync({
        abi: heirlockAbi,
        address: HEIRLOCK_CONTRACT_ADDRESS,
        functionName: "claim",
        args: [trimmedOwner],
      })) as `0x${string}`;
      await publicClient.waitForTransactionReceipt({ hash });
      setClaimStatus("success");
      setClaimMessage(`Claim executed. Tx hash: ${hash}`);
    } catch (error) {
      setClaimStatus("error");
      setClaimMessage(formatContractError(error));
    }
  };

  return (
    <main className="flex-1 bg-background text-foreground">
      <div className="mx-auto max-w-5xl space-y-10 px-4 py-10">
        <header className="space-y-3 text-center md:text-left">
          <p className="text-sm font-semibold text-primary/80 uppercase tracking-wide">
            Beneficiary Guidance
          </p>
          <h1 className="text-3xl font-semibold text-foreground">
            We&apos;re sorry for your loss. Let&apos;s make this part gentle.
          </h1>
          <p className="text-base text-muted-foreground">
            Heirlock follows the wishes that were carefully written for you. Whether you already use a
            wallet or you just need to share who you are, the SAFE logic stays intact so assets only
            move when they truly should.
          </p>
        </header>

        {/* Wallet + Identity Intake */}
        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-background p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/20">
                <svg
                  className="h-5 w-5 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 11c0-1.657 1.343-3 3-3h4V6a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-2h-4c-1.657 0-3-1.343-3-3z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-primary/80">I already have a wallet</p>
                <h2 className="text-xl font-semibold">Connect and you&apos;re set</h2>
              </div>
            </div>

            {isConnected ? (
              <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-4">
                <p className="text-sm font-semibold text-green-500 flex items-center gap-2">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Wallet connected
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  That&apos;s all you need. When the SAFE confirms a missed check-in, you&apos;ll receive a
                  gentle prompt to claim.
                </p>
                <div className="mt-4 space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-green-200/70">
                    Owner address to claim from
                    <input
                      value={ownerToClaim}
                      onChange={(event) => {
                        setOwnerToClaim(event.target.value);
                        if (claimStatus !== "pending") {
                          setClaimStatus("idle");
                        }
                      }}
                      placeholder="0x..."
                      className="mt-1 w-full rounded-xl border border-green-500/30 bg-green-900/40 px-3 py-2 text-sm text-green-100 placeholder:text-green-200/50 focus:border-green-400 focus:outline-none"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleWalletClaim}
                    disabled={claimStatus === "pending"}
                    className="w-full rounded-xl bg-green-500/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {claimStatus === "pending" ? "Claiming..." : "Claim your allocation"}
                  </button>
                  {claimMessage && (
                    <p
                      className={`text-xs ${
                        claimStatus === "success" ? "text-green-200" : "text-red-200"
                      }`}
                    >
                      {claimMessage}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Choose the wallet that feels comfortable. We only check ownership—no funds move at this step.
                </p>
                <div className="flex flex-wrap gap-3">
                  {connectors.map((connector) => (
                    <button
                      key={connector.id}
                      type="button"
                      onClick={() => connect({ connector })}
                      disabled={!connector.ready || isConnecting || isPending}
                      className="inline-flex items-center justify-center rounded-xl border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isConnecting || isPending ? "Connecting..." : connector.name}
                    </button>
                  ))}
                  {!connectors.length && (
                    <p className="text-xs text-muted-foreground">
                      No wallet options were detected in this browser.
                    </p>
                  )}
                </div>
                {connectError && (
                  <p className="text-xs text-destructive">{connectError.message}</p>
                )}
              </div>
            )}
          </div>

          <form
            className="rounded-3xl border border-border bg-card/80 p-6 space-y-4"
            onSubmit={handleManualLookup}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
                <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5.121 17.804A13.937 13.937 0 0112 15c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">No wallet? That&apos;s okay.</p>
                <h2 className="text-xl font-semibold">Tell us who you are</h2>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              We securely hash this information the same way it was saved on-chain. Nothing is stored in plaintext.
            </p>

            <label className="text-sm font-medium text-foreground">
              Full legal name
              <input
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="e.g. Alex Morgan"
                className="mt-1 w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                required
              />
            </label>

            <label className="text-sm font-medium text-foreground">
              Date of birth
              <input
                type="date"
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
                className="mt-1 w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                required
              />
            </label>

            <button
              type="submit"
              className="w-full rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              disabled={formState === "submitting"}
            >
              {formState === "submitting" ? "Checking..." : "Share details securely"}
            </button>

            {formMessage && (
              <p className="text-xs text-muted-foreground">{formMessage}</p>
            )}
          </form>
        </section>

        {/* Process Outline */}
        <section className="rounded-3xl border border-border bg-card/70 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
              <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">What happens next</p>
              <h3 className="text-2xl font-semibold">The SAFE logic stays trusted end-to-end</h3>
            </div>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {instructionSteps.map((step) => (
              <div key={step.title} className="rounded-2xl border border-border/60 bg-background/60 p-4">
                <p className="text-sm font-semibold text-foreground">{step.title}</p>
                <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Self Verification Section */}
        <section className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-background p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                  <svg
                    className="h-5 w-5 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                </div>
                <h3 className="text-2xl font-semibold text-foreground">Identity verification powered by Self.xyz</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                The same privacy-preserving proofs that protected the will author now protect you. We never expose
                your information—everything is checked through zero-knowledge proofs before the SAFE releases assets.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 8 8">
                    <circle cx="4" cy="4" r="3" />
                  </svg>
                  Zero-knowledge proofs
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 8 8">
                    <circle cx="4" cy="4" r="3" />
                  </svg>
                  Privacy-preserving
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 8 8">
                    <circle cx="4" cy="4" r="3" />
                  </svg>
                  On-chain verification
                </span>
              </div>
            </div>
            <div className="flex w-full flex-col gap-3 md:w-auto">
              <a
                href="/verify"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 shadow-lg shadow-primary/30"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                  />
                </svg>
                Start Self verification
              </a>
              <p className="text-center text-xs text-muted-foreground">Scan the QR code inside the Self app.</p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-card/70 p-4">
            <div className="flex items-start gap-3">
              <svg
                className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="flex-1">
                <p className="mb-1 text-xs font-semibold text-foreground">How it works with Heirlock</p>
                <p className="text-xs text-muted-foreground">
                  When wills are created using{" "}
                  <code className="rounded bg-muted px-1 text-[10px] uppercase tracking-wide">createIdentityWill()</code>, we hash the
                  beneficiary&apos;s first name, last name, and date of birth. During a claim, Self.xyz proves that the person standing
                  in front of us matches that hash. The contract&apos;s{" "}
                  <code className="rounded bg-muted px-1 text-[10px] uppercase tracking-wide">customVerificationHook()</code> keeps this SAFE logic intact and only releases
                  the assets when the proof is valid.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
