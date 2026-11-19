# Expo Rebuild Implementation Plan

Execution: inline in the existing thread; no subagents. The user requested the completed result for later review.

**Goal:** Deliver a separate runnable Expo fork and current contracts with clean boundaries and reproducible verification.

**Architecture:** One root Expo app, shared garden and protocol packages, a current-contract package and a separately runnable hybrid service. Preserve product behavior; isolate unsupported browser/native capabilities at platform files.

**Spec:** `docs/superpowers/specs/2026-11-17-expo-rebuild-design.md`

## Tasks
1. Preserve Git ancestry and upstream URL; scaffold standard Expo configuration and migrate only source/assets/tests. Verify no original files or keys change.
2. Clean the active contract package to FocusForest/FocusDirectory. Compile deterministic artifacts, run its adversarial suite and pin hashes for review.
3. Make platform storage/wallet/shield capabilities explicit; preserve native behavior and make web sessions and external linking work without pretending SecureStore or native crypto exists.
4. Consolidate protocol tier data into the contract-facing rule source, remove redundant app preset data, and audit domain/render imports. Add meaningful rule/architecture tests before changing behavior.
5. Remove dead components/dependencies and prototype configuration; correct known wallet error cancellation and Android setup routing where migrated. Run focused regressions then the complete suites.
6. Export all three targets, run owned-target visual checks where compatible, and document any blockers rather than substituting old-device evidence.
7. Self-review the final code and produce the source/contract archive, SHA-256 manifest and reading guide. Publish the explicitly requested separate remote/task branch and draft comparison PR. Do not deploy the service, publish stores or merge protected branches.

## Review focus
- Existing wallet records must never be overwritten or silently recreated.
- Browser reload/SSR must not call native secret storage or persist private keys.
- Dependency movement must not break Metro, generated valley freshness or deterministic contracts.
- The local valley ladder must not masquerade as an on-chain reward or verification.
- Network/configuration failures and ambiguous submissions must remain explicit and recoverable.
