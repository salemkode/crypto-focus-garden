# Focus Garden + Expo consolidation

Snapshot: 15 November 2026. Branch: `feat/unify-focus-garden-expo`. The user explicitly requested one software project; no commit, push, PR merge, deployment or financial transaction was performed.

## Canonical architecture

- `packages/dapp`: original Next.js web garden and web contract integration.
- `packages/contracts`: authoritative v3 CashScript covenant and credit policy. Its external recipient is fixed at planting; actual relative lock enforcement remains on-chain.
- `packages/mobile`: **one** Expo SDK 58 / React Native 0.88 / Expo Router application. The previous SDK 54 shell has been replaced, not kept as another runtime.
- `packages/garden`: original voxel island/tree/sapling models shared by both web and mobile. Web uses Three.js WebGL; mobile uses Expo GL/Three. No WebView or unrelated native checkerboard substitutes for the original garden.

The separate native repository is a preserved source archive, not a runtime dependency. No imports/configuration depend on its absolute path.

## Migrated and deliberately retained boundaries

Integrated native Libauth C/JSI module, Metro/Babel crypto replacements, XO account initialization and restore, SQLite deadline-based local sessions, foreground recovery, Router navigation and native assets. Source raw-key and recovery-phrase formats remain distinct. UI components use the existing garden's light palette rather than the old native layout.

The old v1 reward manager and WalletConnect reward-transaction routes were **not** imported. That deployed legacy contract cannot enforce v3's true delay or fixed external-recipient rules. Legacy pending records are not relabeled as v3, replayed or discarded. Their original source and storage are retained for a dedicated migration/recovery adapter.

The local timer and on-chain reward history are separate. Timer completion persists local productivity history only. Only service-reported **claimed v3 rewards** become earned trees; confirming, locked and claimable entries do not. The service response rejects duplicate commitments, wrong networks, unsafe integer credit values, legacy commitment formats and premature release estimates. It does not replace independent backend chain verification.

## App identities and storage

Default identity: `com.salemkode.libauthreactnative`, matching the existing richer Expo app. `FOCUS_GARDEN_APP_VARIANT=foundation` builds the same code for `com.focusgarden.mobile`, preserving the earlier SDK54 sandbox. Keychain groups remain based on the installed app identifier. Installing over an existing wallet also requires preserving its signing certificate; no reinstall/uninstall was performed.

Namespaces retained:

- `focusgarden.chipnet.internal.v1`: foundation raw private key, SecureStore.
- `focus-garden-chipnet-mnemonic-v1`: XO recovery phrase, SecureStore.
- `focusgarden.reward.chipnet`: external reward address, SecureStore.
- `focus-garden-v1`: local timer/history, Expo SQLite key-value store.
- XO engine path `./focus-garden`, database name `FocusGarden`, plus address caches tied to the mnemonic identity.

No cross-sandbox secret copying or raw-key-to-mnemonic conversion occurs. Existing vault read failures remain visible and cannot automatically create replacement keys. The previous complete SDK54 mobile source was saved by the first worker at `/tmp/focus-garden-mobile-before-consolidation`; it is a local rollback snapshot, not a runtime dependency.

## Dependency and native setup

Bun owns the root workspace and lockfile. SDK58 and SDK54 dependencies are not mixed in the native client. The mobile app declares the Babel 7 JSX transform and NativeWind CSS interop peer explicitly, fixing otherwise hidden dependencies exposed by isolated workspace resolution. The local module is Expo-autolinked; Android's build reaches `libauth-native` CMake compilation. Generated Android/iOS files, binary host harness and exports are ignored.

Expo Go is unsuitable because the custom Libauth native module requires a development build. Mobile Hermes exports do not imply mobile Web support: `packages/dapp` remains the supported browser client.

## Commands from the repository root

```sh
bun install --frozen-lockfile
bun run dev:web             # Next.js, port 3477
bun run mobile:start        # Metro, assigned port 8083
bun run mobile:android --device YOUR_ASSIGNED_SERIAL
bun run mobile:ios --device YOUR_ASSIGNED_UDID
bun run typecheck:mobile
bun run lint:mobile
bun run test:mobile
bun run test:contracts      # current v3 covenant + credit policy suites
bun run test:native-core
bun run mobile:export
bun run build:web           # requires configured category ID
```

Use the documented build app variant and preserve the device/session/Metro assignment. An absent listener may be started; an existing user's Metro must not be stopped automatically. The pre-restart Metro was no longer running; this worker did not start a persistent replacement or interact with a device.

## Verified during this task

- Frozen Bun install succeeds.
- Mobile typecheck and lint pass.
- 19 mobile tests pass: address boundaries, mnemonic normalization/overwrite protection, wallet identity, deadline/restart recovery, claimed-only trees, duplicate rewards and v3/network validation.
- 17 v3 covenant and credit-policy tests pass, including early/disabled/height-based lock rejection and inability to redirect rewards.
- Native C host harness: **39,130 / 39,130** results match the installed Libauth WASM reference.
- Android and iOS Hermes exports pass (2,230 modules on the recorded iOS export; both platform `.hbc` bundles generated).
- Original Next.js production build and TypeScript pass. A dummy category ID was supplied to that build process only, to validate compilation without inventing a deployed contract.
- Android native prebuild and full `:app:assembleDebug --no-daemon` compile pass (429 tasks, 4m 11s), including the local Libauth native module and all default architectures. APK: `packages/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. It was not installed or launched; JavaScript exports are separate proof and this debug APK loads the development bundle from Metro.
- No mainnet test, transfer, mint, claim or deployment occurred.

## Device evidence and remaining limitations

This checkpoint did not include device QA. Later passes checked every screen on iOS, Android and the web; see [design-system.md](design-system.md). The earlier native iOS blank-GL issue no longer applies: the valley now renders with Filament natively and three.js on the web.

Authenticated transaction credit and full v3 native plant/claim signing remain unfinished. Those actions are visibly unavailable; no simulated balance or local timer completion pretends to be a funded on-chain reward. WalletConnect v3 transaction support also remains future integration. The full upstream starter test suite is not represented by the focused v3 test command.

## Next completion gate

Validate startup/rendering and wallet restoration on an owned development device, then connect authenticated credit and native v3 transactions. Exercise a real Chipnet plant → reject early claim → mature → claim to the fixed external wallet → restart/recover cycle before release. Do not fall back to legacy v1 transactions to make a demo appear complete.

## Subsequent funding/signing work

The consolidation results above are its checkpoint, not verification of later edits. The subsequent service/native-v3 work is owned by the main implementation task and documented in [funding-service.md](funding-service.md). Code for authenticated credit, preparation, local full-transaction validation/signing and recovery now exists. Deployment, financial acceptance and owned-device QA remain unperformed.
