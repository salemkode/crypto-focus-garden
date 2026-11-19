# Starting point → Expo rebuild

The Git comparison uses original commit `de708cd` as `main`. The working development app contained later uncommitted work; its selected source was migrated into this fork. `FORK-PROVENANCE.json` records both facts so the comparison does not imply that all later features existed in the original hackathon commit.

| Original/development location | New location | Result |
| --- | --- | --- |
| Hackathon `packages/dapp` Next.js application | Root Expo Router `src/app` | Separate web app removed; web shares the Expo application |
| Development `packages/mobile` app | Root `src`, `assets`, config and scripts | Conventional Expo layout and separate app identity |
| Development garden package | `packages/garden` | Geometry retained; pure progression extracted to `rules.ts` |
| Development protocol package | `packages/protocol` | Transaction guards retained; pure tier/species/lock constants extracted |
| Original Pomodoro and experimental credit contracts | Original Git history | Excluded from the active build to avoid ambiguous contract selection |
| Current FocusForest v5 and Directory | `packages/contracts/contracts` | Sources unchanged; compiler deterministic, artifacts and 35 adversarial tests retained |
| Current bounded credit service | `packages/service` | Financial behavior and recovery retained; not deployed |
| Native crypto/blocking modules | Root `modules`, `plugins`, `targets` | Source and vendor licenses retained; generated builds excluded |
| Old AppDrop publishing script | Removed | It referenced the original app's workspace/distribution link |

## Changes made during this rebuild

- Fresh Expo template provenance, root scripts, lockfile and source-only native integration.
- New bundle/package ID, URL scheme and dedicated Metro port 8183.
- Corrected malformed patch-file separators so a clean Bun install applies the native compatibility patches.
- Synchronous native root registration after crypto; browser WASM readiness before Router; direct Metro runtime dependency.
- Browser public-storage adapter and explicit native-wallet capability boundary. No browser seed or fake credit state.
- Pure local/on-chain rules separated from model generation and crypto initialization. Reward preset durations derive from the protocol constants.
- Renderer/protocol dependency checks and real boundary/storage tests.
- Android tab title inset, wallet-link cancellation/manual-entry error clearing, and blocking-permission setup routing carried into the fork.
- React effect ordering/cancellation fixes in the retained reward provider, without changing credit intent, signing guards or operation recovery policy.
- Two unused rendering components, stale variants and legacy contract tooling removed from active source.

The native bottom navigation and established product design are retained. This migration is not another UI redesign. Model preview generation, Filament/three.js, legacy key recovery and the hybrid credit model intentionally remain visible review areas.

## Git review

```sh
git log --oneline --all --graph
git diff main...feat/expo-rebuild --stat
git diff main...feat/expo-rebuild -- packages/contracts
git remote -v
```

`origin` is the new repository; `upstream` is the original repository. Protected `main` is the baseline and must not receive further direct pushes. Review/merge is left to the user.
