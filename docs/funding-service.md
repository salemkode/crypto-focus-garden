# Chipnet credit, signing and recovery service

`testnetFunctionalReady=false` · `publicReleaseReady=false`

Executable code is in `packages/service`, `packages/protocol`, and the unified Expo client. Current priority is the complete **functional Chipnet journey**; public publication and cosmetic polish are deferred. See [actual acceptance procedure](chipnet-acceptance.md) and [delivery matrix](../RELEASE-STATUS.md). No live grant, plant, claim or baton transaction has been executed by this implementation.

## Chain authority and confirmation policy

Production/test-acceptance authority is an operator-owned validating BCHN **Chipnet** node. Startup checks `chain=chip`, independently configured genesis and post-fork checkpoint hashes, synchronization/validation progress, unpruned retained lookup and a fresh consistent canonical tip. Operators must run full validation (`assumevalid=0`, `txindex=1`, `prune=0`) and provide the shared owner's measured connection contract. The service cannot turn an untrusted remote endpoint into a validating node merely by reading its RPC fields; ownership and operator validation evidence are prerequisites. It is not an SPV implementation.

The common official BCHN v29.2.0 checkpoint is height 115252, hash `00000000040ba9641ba98a37b2e5ceead38e4e2930ac8f145c8094f94c708727`. It is independently known but not yet checked against an available shared endpoint. Genesis and tip measurement remain pending. `bchtest` prefixes and protocol names alone are insufficient. Never substitute testnet3, testnet4, regtest, a fixture, or a sibling Electrum observation for the actual Chipnet gate.

Electrum is only an **untrusted address-discovery hint**. Candidate outpoints are resolved using the own node's `gettxout` and raw transaction, hash, script, value, token and confirmation checks. Electrum may omit a coin and affect availability; it cannot authorize invented funding. No own-node failure falls back to Electrum authority.

Default completion requires **six canonical confirmations**, configurable to 2–144 for an explicitly scoped test environment. The mobile build enforces its own configured minimum. Mempool and shallow observations are `confirming`, not earned rewards. Claim maturity uses the canonical planting block's predecessor MTP and current tip MTP, plus confirmation depth. It does not use phone time. Canonical view changes fail closed. Earned-tree receipts require confirmed canonical claim state and an immutable reward still held at its fixed original output. Transfers remain in history without being counted as held trees. Actual claim block dates are distinct from estimated release dates.

Read and bounded write capabilities are **separate**. The read route exposes `getblockchaininfo`, `getblockhash`, `getblockheader`, `getrawtransaction`, `gettxout`. The dedicated test-write route exposes `getblockhash` to independently match genesis/fork identity, `testmempoolaccept`, and `sendrawtransaction`. The node preflights exact signed bytes before broadcast. No write capability is inferred from indexer read access. The single indexer owner handles shared endpoint provisioning; no duplicate node/download or secure input card is needed.

## Authentication and bounded credit

Operators provision one account per authenticated test user. There is no public signup faucet or client-supplied `verified` boolean. Only SHA-256 account-token hashes enter the ledger; tokens are written to exclusive mode-0600 files and saved separately in device SecureStore. Rotation/revocation are durable, revoke outstanding ownership challenges, and retain the account/financial history. During a pending operation, a client replacement token must identify that same original account.

Wallet ownership challenges expire after two minutes and are atomically consumed once. Both sides construct a synthetic BCH transaction whose outpoint is a domain-separated hash of account, nonce and app script. The app signs a complete locally generated context, never a server-selected digest. The server verifies it in Libauth. This proves the **app** key; external receive-address entry does not claim external-wallet ownership verification.

Persistent limits include 90 requests/account/minute, 20 mutation requests/account/minute, 10 challenges/account/minute, a global request bound, at most eight linked app wallets/account, and at most 32 queued operations. Nonces, quotas, pauses and audit events survive restarts. Enrollment abuse still requires operator-controlled real account provisioning; issuing unlimited accounts defeats any per-account allowance.

Planting credit is 8,000 sats; release credit is 4,000 sats. Account grants and unresolved reservations together cannot exceed 16,000 sats per UTC day. Lifetime and daily treasury allowances include grants **and the 2,000-sat grant fee**. Both treasury defaults are zero. Only dedicated compressed testnet key identities for the exact configured network are accepted by the service's test treasury configuration. The app wallet's raw key/XO mnemonic never reaches the backend.

Funding checks individual confirmed plain-BCH UTXOs, excluding tokens and reserved coins. Planting spends a 1,000-sat deposit and a 2,000-sat fee from an input of at least 8,000 sats, retaining at least 5,000 sats for release. One active session/account prevents another planting from consuming release reserves. Current test fees are an explicit fixed approved ceiling; node preflight may reject an unsuitable fee rather than silently increasing it. Mainnet fee estimation is outside current Chipnet delivery.

## Full-transaction signing and state

`prepare` returns a complete unsigned transaction, both raw source transactions and the pinned chain identity. On-device validation checks source txids/outpoints, the build's genesis/fork pins, v3 contract/category, source ownership/plain BCH, complete output layout, token capability/amount/commitment, fixed external destination, deposit/change, version/sequence/time metadata and exact fee. The app signs only its funding input with `SIGHASH_ALL|SIGHASH_UTXOS|FORKID`, then verifies the entire signed covenant in the BCH 2026 VM. Both legacy raw-key and XO key references work without converting or replacing vaults. Signing an existing account cannot silently create a new key.

The service verifies the prepared fingerprint and complete VM before recording signed bytes and txid. Financial states are `reserved` → `prepared` → `pending` → `confirming` → `seen`. `seen` means the configured canonical depth was reached, not irreversible finality. A reorg can regress it. Input reservations are retained across confirmations/restarts and migrated from earlier checkpoint records, so a reappearing old source cannot fund a replacement grant.

A timeout leaves the same transaction pending. Reconciliation is read-only. Only an explicit user action can resubmit the **same server-recorded signed bytes**, after rechecking the same network and pause policy. No automatic resend, replacement grant, replacement signature, or ambiguous cancellation occurs. A preparation that never produced a persisted/returned payload and has no signed/broadcast record may release its reservation; prepared or submitted records are never automatically canceled.

## Native focus and recovery

The actual planted session has its own native progress/status card. It survives app background/close/restart through authoritative service recovery and a local wallet/category/checkpoint-bound last-verified cache. Offline data is labeled stale and cannot authorize a claim. A local practice timer remains independent and cannot mint, pause or bypass the blockchain lock.

The device saves an operation before requesting preparation/funding and saves its signature before submission. If local request storage is lost, authenticated unresolved records for the **same wallet/account** can restore the original intent and signed bytes. This is read-only recovery, not automatic approval. It also works without re-entering a future reward destination: existing claims retain their planting-time recipient. Explicit raw/XO account selection is blocked while a saved operation is unresolved. Neither vault nor app identity is replaced.

Backup UI requires device authentication and screen-capture/app-switcher protection, hides secrets on background/timeout, and never uploads the backup. Do not collect screenshots/accessibility logs containing a revealed seed/key. Device-level behavior is still unverified until an owned target works; native compilation is not proof of authentication or rendering.

## Configure and run

`packages/service/.env.example` and `packages/mobile/.env.example` contain public placeholders and the independently known fork pin. Leave genesis/real category empty until measured/provisioned. Credentials are private files, never `EXPO_PUBLIC_*`. `GARDEN_TREASURY_KEY_FILE` is a dedicated identity **JSON** created by `testnet:setup`, not a pre-existing user's bare WIF. See the acceptance procedure for the bounded genesis-input/baton helpers and faucet precautions.

```sh
bun run --cwd packages/service account /private/path/garden.sqlite account-id /private/path/account.credential
bun run service:start
```

The Bun server binds to `127.0.0.1:3487`. No public hosting is needed for an owned Android **debug** acceptance session: adb reverse port3487, explicitly enable `EXPO_PUBLIC_GARDEN_LOCAL_TEST_HTTP=1`, and use `http://127.0.0.1:3487`. It is accepted only under `__DEV__`; non-loopback HTTP, other ports and all release-build HTTP remain refused. Metro stays8083. Normal/release operation requires HTTPS. Optional systemd/Caddy/BCHN examples are preparation files only; nothing was deployed or enabled.

All app requests use authenticated `POST /v1/rpc`: `whoami`, `challenge`, `prove`, `credit`, `prepare`, `submit`, `reconcile`, `recover`, `rebroadcast`, or `garden`. The old unauthenticated `GET /v1/garden` placeholder is superseded. History is scoped to the authenticated account/app wallet and retains sessions for previously saved recipients. Responses are not cacheable; no key, bearer credential, raw request or stack trace is logged.

`GET /healthz` is process liveness; `/readyz` checks the configured node and database. Neither proves functional acceptance or authorizes publication. Shutdown drains requests and checkpoints the WAL. The owned process lock prevents competing service instances; after a crash, inspect only this service's recorded PID/state before any operator lock recovery.

## Backups and operator recovery

`bun run --cwd packages/service backup SOURCE NEW_DESTINATION` uses a consistent SQLite snapshot including committed WAL state, checks source/destination integrity, refuses overwrite, and writes mode0600. Back up secret files separately through operator-controlled secure storage; the database contains account hashes/public financial history, not device private keys. Stop/drain only the owned instance before restore, preserve the existing ledger/WAL, and reconcile pending txids against the node before new credit. Loss of a ledger is not repaired by reissuing grants.

```sh
bun run --cwd packages/service admin revoke DATABASE ACCOUNT
bun run --cwd packages/service admin rotate DATABASE ACCOUNT NEW_PRIVATE_TOKEN_FILE
bun run --cwd packages/service admin pause DATABASE treasury.paused
bun run --cwd packages/service admin pause DATABASE broadcasts.paused
# After inspection, only a never-prepared, never-broadcast reservation may be released:
bun run --cwd packages/service recover:reservation DATABASE OPERATION_UUID
```

Pause controls/audit records persist. `resume` is explicit. The guarded reservation utility refuses returned prepared payloads or recorded signed/broadcast bytes. If a crash occurred between saving signed bytes and calling the node, a read-only lookup may remain missing; preserve those bytes and investigate, then use an explicitly approved same-bytes resubmission. Never erase financial history, reset a wallet, or silently retry to recover from ambiguity.

## Current evidence and outstanding gates

63 local tests pass (26 mobile,17 covenant/credit,20 service), typecheck/lint pass,39,130 native crypto comparisons match, both Hermes exports and Android/iOS simulator native builds pass. Evidence/hashes are in `artifacts/testnet-delivery`. Tests use explicit offline node/discovery fixtures; no live transaction IDs exist. Owned-node endpoint/genesis/tip measurement, usable exclusively owned Android/iOS targets, dedicated funded setup, and both actual native CSV/claim/restart cycles remain required. See RELEASE-STATUS.md for the precise blockers, including the fresh Android boot failure.
