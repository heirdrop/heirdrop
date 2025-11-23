# Heirdrop
[https://www.canva.com/design/DAG5gvc-YM0/b6ad6Qs4-40E7y3QcxQllw/edit?utm_content=DAG5gvc-YM0&utm_campaign=designshare&utm_medium=link2&utm_source=sharebutton]
<p align="left">
  <img src="apps/web/public/icon.png" alt="Heirdrop icon" width="180" />
</p>

Onchain succession for multi-chain portfolios. Heirdrop packages compliant KYC, autonomous liveness checks, and deterministic ERC-20 payouts into a Farcaster-native experience so wealth owners can keep their assets moving even when they are not around.

## Why Heirdrop

Family offices and crypto-native operators need more than a cold wallet seed phrase - they need auditable, automated instructions that can be honored when someone stops responding. Heirdrop combines a battle-tested smart contract (Heirlock) with a Warpcast - built on Celo- mini app and Self.xyz identity proofs to give operators:

- **Programmable wills** that encode beneficiaries, ERC-20 allocations (absolute or BPS), and liveness windows directly on Celo.
- **Intent-aware check-ins** that ping owners via Farcaster push so assets only move when a check-in is missed.
- **Identity-verified beneficiaries** that can prove who they are with zero-knowledge credentials instead of sharing wallets up front.
- **Cross-chain context** rendered in the Next.js dashboard so fiduciaries can see holdings pulled from every supported EVM chain before finalizing a will.

## Core Features

- **Heirlock smart contract**
  - Configurable `configureLiveness`, `checkIn`, `createWill`, and `createIdentityWill` flows with ShareType enforcement, basis-point caps, and asset snapshots for deterministic claims.
  - Extends `SelfVerificationRoot` to honor `claimWithIdentity` when a beneficiary proves their name + date of birth via Self.xyz.
  - Built with Foundry, OpenZeppelin, and comprehensive unit tests covering liveness, claim flows, and failure recovery.
- **Succession workspace (Next.js app)**
  - Draft wills, assign ERC-20 addresses, set cadence reminders, and preview the payload before pushing it on-chain.
  - `/verify` route issues Self.xyz QR codes so beneficiaries can pre-verify identity and check sanctions / age requirements.
  - Warpcast mini-app shell (via `@farcaster/frame-sdk`) auto-connects Farcaster wallets, supports add-to-mini-app actions, and stores notification tokens for push reminders.
- **Notification + compliance rails**
  - `/api/webhook` and `/api/notify` manage Farcaster notification tokens with in-memory storage or any downstream cache.
  - Self Backend Verifier endpoint validates zero-knowledge proofs, enforces age + geography filters, and checks whether an identity hash already claimed a payout.
- **Enterprise-ready ops**
  - Turborepo monorepo with pnpm workspaces, shared env parsing, Tailwind/shadcn UI system, wagmi + RainbowKit wallet UX, and viem clients pointing to the Celo Alfajores RPC by default.

## Tech Stack

| Layer            | Technologies                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| Smart contracts  | Solidity 0.8.28, Foundry, OpenZeppelin, Self.xyz Verification Root, Celo (Alfajores)                  |
| Web experience   | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS + shadcn/ui, wagmi, RainbowKit            |
| Mini app surface | Farcaster Frame SDK, Farcaster mini-app Wagmi connector, Frame notifications, Warpcast manifest utils |
| Identity & data  | Self.xyz QR builder + backend verifier, viem public clients, in-memory notification store             |
| Tooling          | Turborepo, pnpm, Zod env validation, ESLint, Prettier/Tailwind plugins                                |

## Repository Layout

```
heirdrop/
|- apps/
|  |- web/          # Next.js mini-app + dashboard (Next 14, Tailwind, wagmi, Self QR flows)
|  \- contracts/    # Foundry project for the Heirlock smart contract and tests
|- FARCASTER_SETUP.md # Step-by-step instructions for manifest + account association
|- package.json      # Turborepo scripts (dev, build, lint, type-check)
\- turbo.json        # Pipeline configuration
```

## Getting Started

1. **Install dependencies**
   ```bash
   pnpm install
   ```
2. **Run every package in watch mode**
   ```bash
   pnpm dev
   ```
   This executes `turbo dev`, which launches the Next.js app (`apps/web`).
3. Open [`http://localhost:3000`](http://localhost:3000) or run `pnpm --filter web dev` if you only want the web surface.

### Smart-contract toolchain

```bash
cd apps/contracts
forge install
forge build
forge test
```

Set `IDENTITY_VERIFICATION_HUB` and `SCOPE_SEED` in your Foundry `.env` when deploying (`forge script script/DeployHeirlock.s.sol`).

## Environment Configuration

Add a `.env.local` (web) and/or `.env` (contracts) file with the variables below:

| Variable                                | Purpose                                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_URL`                       | Base URL for the Next.js app and Warpcast manifest (use ngrok URL when testing mini apps).     |
| `NEXT_PUBLIC_NGROK_URL`                 | Optional override so `/api/auth/self/verify` matches your public tunnel during development.    |
| `NEXT_PUBLIC_APP_ENV`                   | `development` or `production` toggle used for Farcaster manifest validation.                   |
| `NEXT_PUBLIC_FARCASTER_HEADER`          | Signed account association header from Warpcast (see `FARCASTER_SETUP.md`).                    |
| `NEXT_PUBLIC_FARCASTER_PAYLOAD`         | Matching payload for the account association.                                                  |
| `NEXT_PUBLIC_FARCASTER_SIGNATURE`       | Matching signature for the account association.                                                |
| `NEXT_PUBLIC_HEIRLOCK_CONTRACT_ADDRESS` | Deployed Heirlock contract address (defaults to a placeholder).                                |
| `CELO_RPC_URL`                          | Optional custom RPC endpoint for the viem public client (defaults to Alfajores Forno).         |
| `SELF_SCOPE_SEED` / `SCOPE_SEED`        | Scope seed shared between Self QR builder (frontend) and verifier (backend + Foundry scripts). |
| `IDENTITY_VERIFICATION_HUB`             | Self.xyz hub contract address referenced by Foundry deploy/test scripts.                       |
| `JWT_SECRET`                            | Secret for Farcaster quick-auth endpoints if you enable authenticated API routes.              |

> Need help with Warpcast onboarding? Follow `FARCASTER_SETUP.md` for manifest signing, ngrok tips, and troubleshooting steps.

## Useful Scripts

- `pnpm dev` - Turbo-powered dev mode across apps.
- `pnpm build` - Production build across web + contracts packages.
- `pnpm lint` - Runs ESLint (Next.js rules + Tailwind plugins) for the web app.
- `pnpm type-check` - TypeScript project references for every package.
- `pnpm --filter web dev:ngrok` - Boots Next.js and opens an ngrok tunnel for Farcaster testing.
- `forge test` / `forge script` - Execute Foundry test suites and deployments for Heirlock.

## Integration Notes

- **Farcaster mini app**
  - Manifest served from `/.well-known/farcaster.json` using values controlled in `warpcast.ts`.
  - `/api/webhook` stores notification tokens (can be swapped for Redis) and optionally delivers welcome pushes through Warpcast.
  - `/api/notify` exposes a programmatic notification endpoint so you can schedule liveness reminders or "check-in missed" alerts.
- **Self.xyz identity**
  - `/verify` page builds QR codes with `SelfAppBuilder` so heirs can scan, sign, and send verifiable credentials.
  - `/api/auth/self/verify` consumes the callback, validates ZK proofs, enforces sanction rules, hashes the identity, and cross-references Heirlock via viem (`generateIdentityHash`, `hasIdentityClaimed`, `getIdentityBeneficiaries`).
- **Heirlock contract**
  - Allocations are stored per asset with BPS tracking to prevent over-commitment, snapshots lock balances at first claim, and `_safeTransferFrom` handles ERC-20s with or without return values.
  - Identity claims call `customVerificationHook` to match Self disclosed data to on-chain identity hashes before transferring.

## Next Steps

1. Deploy Heirlock to Celo or any EVM chain, update `NEXT_PUBLIC_HEIRLOCK_CONTRACT_ADDRESS`, and re-run `pnpm build`.
2. Expose your local app with `pnpm --filter web dev:ngrok` and complete the Farcaster manifest steps.
3. Point the liveness notification cron or backend scheduler to `/api/notify` and wire it to your ops playbook.
4. Customize the UI copy, asset indexer integration, or treasury logic to match your institutional flows.
