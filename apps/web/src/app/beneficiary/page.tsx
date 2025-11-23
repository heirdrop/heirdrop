"use client";

export default function Beneficiary() {
  return (
    <main className="flex-1 bg-background text-foreground">
      <div className="mx-auto max-w-5xl space-y-10 px-4 py-10">
        {/* Self Verification Test Section */}
        <section className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-background p-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
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
                <h3 className="text-2xl font-semibold text-foreground">
                  Identity Verification Testing
                </h3>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                Test the Self.xyz identity verification integration that powers identity-verified 
                beneficiaries in the Heirlock contract. This allows you to create wills for 
                beneficiaries identified by their real-world identity (name and date of birth) 
                instead of just wallet addresses.
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
            <div className="flex flex-col gap-3 w-full md:w-auto">
              <a
                href="/verify"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 shadow-lg shadow-primary/30"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                  />
                </svg>
                Test Self Verification
              </a>
              <p className="text-center text-xs text-muted-foreground">
                Scan QR code with Self app
              </p>
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
                <p className="mb-1 text-xs font-semibold text-foreground">
                  How it works with Heirlock
                </p>
                <p className="text-xs text-muted-foreground">
                  When you create an identity-verified will using{" "}
                  <code className="rounded bg-muted px-1 text-[10px] uppercase tracking-wide">
                    createIdentityWill()
                  </code>
                  , the contract stores a hash of the beneficiary's identity (first name, 
                  last name, date of birth). When they claim, they prove their identity 
                  through Self.xyz, and the contract's{" "}
                  <code className="rounded bg-muted px-1 text-[10px] uppercase tracking-wide">
                    customVerificationHook()
                  </code>{" "}
                  verifies the match and releases the assets.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

