# Configuration

## Local app

Install from the checked-in lockfile. Local sessions, valley and statistics work with no service. `.env.example` lists public configuration keys as comments so placeholders cannot accidentally become a valid deployment. Expo includes `EXPO_PUBLIC_*` values in the bundle; they must never contain credentials or private keys.

The app identity is `com.arquebus.focusgarden.next`, scheme `focusgardennext`. Update wallet-provider allowlists/redirect registrations for that identity before testing third-party pairing. Supply a valid public WalletConnect project ID when using that relay.

Metro uses 8183. Do not take over another task's simulator or an existing Metro. Android emulators may need their development-server host configured for this port; physical devices need a reachable development machine. Reuse an installed compatible build for JS-only changes.

## Native blocking

Android requires the native module plus user-granted usage/accessibility/overlay permissions exposed by setup. iOS builds default to blocking disabled. `FOCUS_SHIELD_IOS=1` adds Family Controls and the activity-monitor extension. The new app and extension IDs need their own Apple signing/entitlement approval; permission from the original application does not transfer automatically. A simulator compile is not hardware or distribution acceptance.

## Verified rewards / service

The service is Chipnet-only and is not started or deployed by installing the app. The app's public service URL, contract/category, directory category, genesis hash, checkpoint and confirmation policy must match the service. Its native access token is saved through the app's Advanced settings into secure storage.

For the service, configure these environment variables outside Git:

| Variable | Required value |
| --- | --- |
| `GARDEN_DATABASE` | Dedicated SQLite database path with writable parent directory |
| `GARDEN_CATEGORY` | The actual 32-byte FocusForest token category, lowercase hex |
| `GARDEN_DIRECTORY_CATEGORY` | Optional directory token category, lowercase hex |
| `GARDEN_NODE_RPC_URL` | Your validated node's RPC URL |
| `GARDEN_NODE_CREDENTIAL_FILE` | Path to owner-readable-only RPC credentials |
| `GARDEN_NODE_GENESIS_HASH` | Expected network genesis hash |
| `GARDEN_NODE_CHECKPOINT_HEIGHT`, `GARDEN_NODE_CHECKPOINT_HASH` | Explicit validated checkpoint |
| `GARDEN_MIN_CONFIRMATIONS` | 2–144, default 6 |
| `GARDEN_MAX_TIP_AGE_SECONDS` | 300–86400, default 21600 |
| `GARDEN_TEST_WRITE_RPC_URL`, `GARDEN_TEST_WRITE_CREDENTIAL_FILE` | Optional separate test-write authority; both required to enable writes |
| `GARDEN_TREASURY_KEY_FILE` | Optional dedicated test treasury identity for the exact chain agreement |
| `GARDEN_TREASURY_BUDGET_SATS`, `GARDEN_TREASURY_DAILY_SATS` | Explicit bounded budgets, both default zero |
| `PORT` | Service port, default 3487 |

Start with `bun run service` after configuring the validated node and identity. Startup checks the node, acquires a dedicated database lock and binds **127.0.0.1**. A production-facing deployment requires an authenticated TLS boundary and a reviewed operational configuration; none is created here. Read the service account/admin/backup/recover CLI source before issuing write operations. Never use a mainnet wallet, reuse a personal seed or commit credential files.

HTTPS is required by the client. Development may explicitly enable HTTP only for loopback on port 3487 with `EXPO_PUBLIC_GARDEN_LOCAL_TEST_HTTP=1`; LAN HTTP is rejected. No public Electrum fallback overrides the configured node identity.

Contract compilation emits artifacts, not deployed addresses or minting categories. Obtain actual addresses/locking bytecode from the validated setup and compare them with the app pins. Account creation, funding, category creation, broadcasting and production deployment are separate operational actions. This fork pass performed none of those actions.
