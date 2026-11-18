# Focus Garden · Expo mobile

The single native client in the Focus Garden monorepo. Expo SDK 58, React Native 0.88, Expo Router, NativeWind, SQLite and the local Libauth C/JSI bridge. Requires a native development build; **Expo Go is not supported**.

## Run from the repository root

```sh
bun install --frozen-lockfile
bun run mobile:start
# A separate shell; pass the device assigned to this task:
bun run mobile:android --device YOUR_ASSIGNED_SERIAL
bun run mobile:ios --device YOUR_ASSIGNED_UDID
```

Metro remains **8083**. The web client is separate on **3477** (`bun run dev:web`). Inspect current device ownership before running; a historical assignment does not override a foreign claim. Never enable T3 agent-device access to obtain a controller. Use Argent for interaction. Android may need `adb -s YOUR_ASSIGNED_SERIAL reverse tcp:8083 tcp:8083` after ownership is established.

## One codebase, preserved identities

The default app identity is `com.salemkode.libauthreactnative`, preserving the richer Expo prototype's sandbox and Keychain access groups. To rebuild the earlier foundation sandbox, set `FOCUS_GARDEN_APP_VARIANT=foundation`; its identity remains `com.focusgarden.mobile`. Use the same signing identity/certificate as the installed app. Do not uninstall a funded wallet or change its signing identity to work around an install error.

Both variants use this same source. No automatic cross-sandbox key copying occurs. The legacy raw-key entry `focusgarden.chipnet.internal.v1`, XO phrase entry `focus-garden-chipnet-mnemonic-v1`, and external reward entry `focusgarden.reward.chipnet` remain separate. Existing raw keys are never interpreted as recovery phrases. XO creation/restoration is explicit; a failed or corrupt vault read cannot silently replace it.

## Integrated functionality

- Focus/Garden/Wallet Router tabs and recovery-phrase restoration.
- Deadline-based local focus with SQLite history and restart/foreground recovery. Local completion does **not** mint an NFT or award an earned tree.
- Original voxel floating island from `@focus-garden/garden`, shared with the web renderer; no replacement native grid or automatic tier merging.
- Native Libauth bridge, XO engine storage adapter and secure account initialization.
- A separate external reward address, rejecting either known on-device app address.
- Authenticated, schema-checked v3 garden service; claimed rewards alone count as trees. Duplicate commitments, legacy formats and invalid release estimates are rejected.

## Credit and v3 transactions

The native client now supports account-authenticated credit, one-use app-wallet ownership proofs, v3 transaction preparation, independent full-transaction validation, local raw-key/XO signing, and durable pending-operation recovery. Set the public deployment pins using `.env.example`; save the account access token in Wallet. Never put private keys or account credentials in public Expo variables.

`packages/service` implements the Bun/SQLite backend; no service or treasury has been deployed/provisioned. See [functional Chipnet acceptance](../../docs/chipnet-acceptance.md) and [funding service setup and recovery](../../docs/funding-service.md) before enabling funded actions. A real mined Chipnet cycle and owned-device validation are still required. The local focus timer never authorizes NFT release, and the v1 reward manager remains archived.

## Current functional testnet gate

`testnetFunctionalReady=false`; `publicReleaseReady=false`. The actual planted session, foreground refresh, stale offline cache, confirmed-tree/actual claim-day filters, pending server-record recovery, protected backup and raw/XO selection are now implemented. A local timer alone never completes the product journey.

Service and signing calls pin the shared genesis/post-fork checkpoint and minimum confirmation policy. Electrum discovery cannot authorize credit. For an owned Android debug session only, the explicit local-test flag permits loopback port3487 via adb reverse; release builds continue to require HTTPS. Keep Metro8083.

The new exclusive target is Blaze_FocusGarden_20261115, session blaze-focus-garden-acceptance-20261115. No ready serial exists: Argent terminated the diagnostic recovery boot on early offline adb. Its cold-boot window is released to coordinator/Libauth. Do not retry automatically or use historical targets. A fresh iOS simulator remains uncreated/unassigned. Current builds are not device/runtime proof.

## Checks

```sh
bun run typecheck:mobile
bun run lint:mobile
bun run test:mobile
bun run test:contracts
bun run test:service
bun run test:native-core
bun run mobile:export
```

See [consolidation evidence](../../docs/expo-consolidation.md) for actual results and outstanding device checks.
