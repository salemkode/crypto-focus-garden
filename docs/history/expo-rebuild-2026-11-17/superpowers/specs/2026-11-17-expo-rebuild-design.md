# Focus Garden Next — rebuild design

## Intent
Build a separate, conventional Expo application descended from Salem's hackathon repository, with reviewable application, rendering, tree mathematics, wallet/protocol and contract boundaries. Preserve the original project, history, wallets and evidence. The user requested execution and a complete review afterward; implementation choices below are builder decisions, not additional product approvals.

## Approach
Create a separate local fork with the full original Git history, then build a single Expo Router app at its root. Selectively migrate current working components and tested business logic; remove the Next.js application, historical contract implementations, generated native projects, build caches and experimental prototypes from the active tree. A new Git history would lose provenance; a second app hidden inside the old prototype workspace would not provide the requested clean project.

## Boundaries
- `src/app`: routes and composition only. Platform-specific UI remains `.ios.tsx`/React Native files, not runtime platform conditionals throughout screens.
- `src/features`: focus sessions, wallet identity/linking, rewards, profile and shielding. Persistence and service I/O stay outside rendering and domain rules.
- `src/components`: reusable product components and rendering adapters. Filament is native; three.js is web and fallback. No signing or credit operations in the renderer.
- `packages/garden`: deterministic tree geometry/layout/merge engine. Its local valley ladder is explicitly distinct from the four on-chain reward tiers.
- `packages/protocol`: validated wire formats, commitments and local transaction checks. The protocol is shared by app, contracts tests and service.
- `packages/contracts`: current FocusForest and FocusDirectory source, deterministic artifacts and adversarial tests. Old Pomodoro source remains recoverable in Git history, outside the active build.
- `packages/service`: current bounded hybrid-credit service, with local signing, persisted transaction recovery and no ambiguous automatic rebroadcast. Production policy remains explicitly unresolved.
- Native integrations are source-only Expo modules and config plugins. Generated `ios`/`android` projects are disposable prebuild output.

## Product scope and financial decisions
Keep Focus, Leaders, Stats and Profile, onboarding, valley interaction/merging, history and notes, species selection, wallet linking, native helper-wallet backup/recovery and app-blocking setup. Keep the existing hybrid-credit behavior and current v5 contract rules during this architectural rebuild; the preceding recommendations to replace treasury sponsorship with user-funded top-ups and change web signing policy are not silently treated as approval. Default to Chipnet. Do not deploy, publish, transfer funds or announce production readiness.

Web must build from this Expo app and keep private helper keys out of browser persistence. Native wallet and shielding capabilities must be declared unavailable on web, while local sessions, valley, stats and external wallet linking remain usable. A manual reward address is distinct from proof of wallet ownership.

## Cleanup and quality
Use a new app ID/scheme/storage sandbox. Preserve the bottom-tab design. Keep real crypto/contract tests and migration provenance; remove dead rendering experiments, stale app variants, unused direct dependencies and prototype references. Avoid invented abstraction layers, redundant types, barrel proliferation and test code that just repeats implementation.

## Verification
Run app/protocol/service type checking, lint, mobile/domain/service tests, current contract compilation/adversarial tests, dependency-boundary checks, and Android/iOS/web exports. Exercise visible changes through Argent on owned QA targets where a compatible build is available, using a dedicated Metro port 8183. Record exact build/device limitations. Deliver source plus a review archive with hashes, contract sources/artifacts and a concise reading guide.

## Constraints
No subagents or new top-level threads. No protected commits/pushes or merges. No changes to the original workspace. No secrets, keystores, node_modules, build outputs or wallet data in the review archive. No hardware or mainnet acceptance claims from local tests.
