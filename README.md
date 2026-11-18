# Crypto Focus Garden

**Crypto Focus Garden** is a productivity game designed to gamify deep work in an era of constant distraction. The core concept is simple yet powerful: users earn a unique NFT tree for every successfully completed focus session.

By turning productivity into a game where users compete to grow the largest forest, we aim to help people reclaim their attention span and achieve "flow" states more frequently.

## Vision
More than just a tool, this is a **game**. In the age of Reels, TikTok, and high-speed content consumption, our ability to focus is diminishing. Crypto Focus Garden makes the act of slowing down and focusing rewarding and competitive.

## MVP Status & Technical Context
This project is currently in the **MVP (Minimum Viable Product)** stage, designed to demonstrate the "Proof of Focus" mechanic via blockchain.

### Product direction

- **Platform:** React Native / Expo for iOS and Android. The native app is in `packages/mobile`; the Next.js app in `packages/dapp` remains a web prototype. Ionic is no longer the migration target.
- **Blockchain:** Bitcoin Cash using CashTokens; current development is chipnet only.
- **Hybrid wallets:** an on-device app wallet receives limited transaction credit from the backend and pays for interactions. Earned rewards go directly to the user's separate external wallet. The backend must never receive the app wallet's private key.
- **Rewards:** a new garden begins empty. Each claimed reward adds one tree, with no automatic merging or burning.
- **Lock:** contract v3 fixes the external recipient at planting and requires a consensus relative time lock before release. Browser/native countdowns are estimates, not authorization to spend.
- **Native compatibility:** browser wallet connectors and Node/WASM-heavy contract builders remain outside the native app. Native address/key handling and XO account setup use the local Libauth C/JSI adapter; full v3 transaction validation/local signing and the Bun/SQLite funding service are now wired in code; a deployed/funded Chipnet acceptance pass remains required.

The separate Expo implementation is now consolidated into `packages/mobile` on SDK 58; web and native share the original voxel island through `packages/garden`. The source archive remains preserved, but is not a second active client.

See [native app setup](packages/mobile/README.md), [funding service setup](docs/funding-service.md), [hybrid wallet architecture](docs/native-hybrid-wallet.md), and [garden migration rules](docs/garden-rules-and-migration.md) for implementation status and release requirements. No production deployment or treasury funding has been performed.

---

## Unified workspace commands

```sh
bun install --frozen-lockfile
bun run dev:web          # Next.js on 3477
bun run mobile:start     # Metro on 8083
bun run mobile:android   # native build; pass assigned --device
bun run mobile:ios       # native build; pass assigned --device
bun run check            # mobile/service types, mobile lint + v3/mobile/service tests
bun run mobile:export    # iOS + Android Hermes exports
```

See [Expo consolidation](docs/expo-consolidation.md) for migration choices, app identities and remaining limits. Production web builds require a real `NEXT_PUBLIC_POMODORO_CATEGORY_ID`; the validation build used a placeholder only in its process environment. No placeholder was written to project configuration.

## Functional Chipnet delivery

`testnetFunctionalReady=false`; `publicReleaseReady=false`. Current scope is the complete native onboarding → bounded credit → v3 plant → background/restart → actual CSV maturity → fixed-recipient claim → confirmed garden/recovery journey. Public publication and cosmetic polish are deferred. See [delivery matrix](RELEASE-STATUS.md), [active work status](WORK-STATUS.md), and [reproducible Chipnet acceptance](docs/chipnet-acceptance.md).

The service now uses an operator-owned validating node with genesis/fork/confirmation checks; Electrum is untrusted discovery only. Dedicated bounded setup and local debug acceptance paths are implemented. The shared node endpoint and usable newly owned native targets remain blocking verification prerequisites; no live financial or current native runtime journey is claimed.

## Project language

Use English for project names, thread titles, progress updates, explanations, current README/status/handoff files, and new documentation. The Arabic coordinator thread is the sole exception. Preserve historical user messages as written.

## Technical Setup (Original Starter Info)
BCH dApp starter repository featuring a testing suite set up to develop and test cashscript contracts and a Next.js web app to integrate them.