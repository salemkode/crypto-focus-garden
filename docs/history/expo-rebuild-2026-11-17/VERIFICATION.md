# Verification — 17 November 2026

This is a source-review candidate. Checks below do not establish production or mainnet readiness.

## Reproducible checks

| Check | Result |
| --- | --- |
| `bun install --frozen-lockfile` | Passed with Bun 1.4.4; native patches apply |
| `bunx expo-doctor` | **20/20 passed** |
| App and service TypeScript; ESLint | Passed through `bun run check` |
| Generated valley freshness | Passed |
| App / boundary / wallet / protocol tests | **78 passed, 0 failed** |
| Garden geometry and progression tests | **82 passed, 0 failed** |
| Service ledger / chain / operation tests | **21 passed, 0 failed** |
| Current CashScript adversarial tests | **35 passed** |
| Total automated source tests | **216 passed** |
| Native C vs. libauth WASM harness | **39,130 / 39,130 matched** |
| `bun run export` | iOS Hermes, Android Hermes and web bundles passed |
| Android native Debug arm64 build | **BUILD SUCCESSFUL**, 539 tasks |
| iOS native Debug simulator build | **BUILD SUCCEEDED**, Xcode 27.1 |
| Contract reproducibility | Two consecutive compilations matched; source hashes match migration provenance |

The final package layout uses Bun's hoisted linker and workspace links for local native modules. This removes duplicate native-module installations identified by Expo Doctor. The changed symlink layout required refreshing Metro's stale file map; subsequent export and device bundle loading passed. The app uses a direct Metro runtime dependency and platform-specific entry initialization.

Export still reports third-party package-export fallback warnings from three.js/expo-three and wallet dependencies. The contract harness logs rejected adversarial transactions; Jest retains its forced-exit setting. These checks are not a security or leak audit. Bun blocks one optional dependency lifecycle script (`is-hidden-file`); the checks pass without trusting it.

## Visible checks

| Platform | Observed evidence |
| --- | --- |
| Web, built-in T3 browser | Introduction; valley; manual public Chipnet recipient; one-minute local session → completion/tree → Stats; reload persisted session/recipient; native-wallet controls hidden |
| iOS, assigned Focus Garden QA | Introduction; native Filament valley; Stats, Profile and Leaders headers; retained native bottom tabs; wallet sheet/manual-entry expansion and dismissal |
| Android, assigned Focus Garden AVD | Corrected development-server configuration; introduction; native Filament valley; Stats, Profile and Leaders headers; bottom tabs |
| Saved Android navigation fragment | **13 passed, 0 failed, 0 errored** in one uninterrupted replay |

The Android flow at `tests/flows/android-tabs-smoke.yaml` is a **smoke fragment**, not a two-pass acceptance suite. It requires the introduced, empty local app on Focus with no warning/modal overlay. The recorder selected an ambiguous native indicator id; all four label + FrameLayout selectors passed a separate runner-tree probe before replacing raw points. No coordinates remain. Destination checks passed. Idle warned on Profile and Focus: model previews rotate (`Model3D` defaults to spinning) and the valley animates. The warnings remain in the report; this is not pixel-stability or performance acceptance.

Use Argent's flow runner against that absolute YAML path with the owned Android device explicitly selected and the prerequisite acknowledged. Do not auto-detect a foreign device. The fragment navigates tabs only; it clears no data, creates no wallet and makes no transaction.

Owned targets: iOS `9F3AAF75-0DD7-4F02-8F01-BFB3973A587E`; AVD `Blaze_FocusGarden_20261115`. Android changed from `emulator-5556` to `emulator-5554` when that same AVD booted after the old transport disappeared. No foreign AVD was substituted. Fork Metro is **8183**; original **8083** was retained. An earlier candidate port 8093 received an automatic foreign-simulator connection; the fork moved to 8183 without driving that simulator. All device interaction used Argent. The browser tab was closed.

## Recordings and artifacts

Local MP4s are in `artifacts/evidence/`, excluded from Git. All five passed ffprobe stream/duration inspection. `artifacts/verification/` holds build/check/export logs, the flow report and video metadata. These are also packaged separately in the local review evidence archive.

| File | Content / limit |
| --- | --- |
| `web-focus-session.mp4` | 619.6 s; public recipient, one-minute completion, Stats and persistence; includes work pauses |
| `ios-native-smoke.mp4` | 112.6 s after trimming; native valley, tabs, headers and wallet sheet |
| `android-native-smoke.mp4` | 176.4 s after trimming; introduction/tab walkthrough; 240 s wall-clock cap ended before the final return to Focus |
| `android-bootstrap-diagnostic.mp4` | Earlier startup failure/recovery; diagnostic, not clean acceptance |
| `ios-onboarding-diagnostic.mp4` | Earlier onboarding/transport diagnostic; rejected undelivered touch, then one scoped service recovery |

Public checkpoints: [Android valley](evidence/android-valley.png), [iOS valley](evidence/ios-valley.png), [iOS Stats](evidence/ios-stats.png), [web completed Stats](evidence/web-stats-completed.png). Screenshots do not constitute full feature acceptance.

## Release work still required

- Live Chipnet funding, third-party wallet pairing/signing, plant/maturity/claim/merge, credential rotation and interruption/reconciliation on the final service configuration.
- A reviewed financial-model decision. This fork preserves bounded treasury sponsorship/credit; it does not implement the proposed user-funded replacement.
- Browser signing and verified-reward parity. Web currently supports local sessions/public recipient and declares native financial capabilities unavailable.
- Independent contract/transaction security review; operational custody, backup, monitoring and deployment ownership.
- Android minified Release/R8 acceptance and store signing; iOS distribution/Family Controls approval and physical-device blocking acceptance.
- Hardware performance/accessibility, offline/background interruption and broader device-size regression tests.

No service/contract/category/mainnet deployment, store submission, purchase or real-fund transaction was performed. The original source workspace was preserved. The comparison PR is for human review; merging remains with the user.
