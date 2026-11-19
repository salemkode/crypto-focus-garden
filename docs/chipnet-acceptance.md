# Focus Garden functional Chipnet acceptance

`testnetFunctionalReady=false` · `publicReleaseReady=false`

This is the reproducible path for the implemented native/service journey. It has **not** been executed against a live validating Chipnet node. Local tests and compiled artifacts support it but do not establish financial or device acceptance. Cosmetic polish, store publication and unrelated launch infrastructure are deferred.

## 1. Connect a validating Chipnet node

Run, or get access to, a fully validating BCHN Chipnet node (see the requirements below). No public node is assumed, and nothing here downloads the chain for you.

The independently established fork checkpoint is height **115252**, hash **00000000040ba9641ba98a37b2e5ceead38e4e2930ac8f145c8094f94c708727**, from official BCHN v29.2.0 `src/chainparams.cpp`. It distinguishes Chipnet from testnet4. It has not yet been measured against an available shared BCHN endpoint.

Configure the service and the app with the node's measured genesis hash, this checkpoint and credential-free endpoint metadata. Keep RPC credentials in mode-0600 files outside the repository, never in source, chat or `EXPO_PUBLIC_*` variables.

The service requires an operator-owned fully validating, synchronized BCHN Chipnet node with retained raw-transaction lookup (`txindex=1`, `prune=0`, `assumevalid=0`). Its read route needs `getblockchaininfo`, `getblockhash`, `getblockheader`, `getrawtransaction`, and `gettxout`. A **separate bounded test-write route** needs `getblockhash` (to verify genesis and the fork checkpoint), `testmempoolaccept` and `sendrawtransaction`. No automatic elevation of indexer read credentials occurs. Both capabilities must identify the same agreed Chipnet. Plain address prefixes and chain labels are insufficient.

Default policy requires six canonical confirmations; configuration may explicitly select 2–144 for an isolated test environment, with the mobile build requiring at least its configured minimum. Record the actual choice. A node acceptance or mempool receipt is not a claimed tree. Maturity uses canonical block headers and validated-node MTP, not phone time. Electrum only suggests address outpoints; the own node verifies scripts, amounts, tokens, unspent status and confirmations.

Use a dedicated test phone, emulator or simulator with a fresh install, never one that holds a wallet with real funds.

## 2. Prepare dedicated test identities and the v3 baton

Do not use pre-existing user wallets, seeds or funds. The on-device app wallet must be created/restored explicitly on an owned fresh target; its private key never reaches the service. For the treasury and a separate test recipient, the implemented CLI writes fresh dedicated identities to exclusive mode-0600 `.credential` files. These are JSON records bound to the verified network identity; they must never be printed or committed.

After the shared node connection is configured and independently verified, from `packages/service`:

```sh
bun run testnet:setup identity /private/path/focus-treasury.credential treasury
bun run testnet:setup identity /private/path/focus-recipient.credential recipient
```

Commands print only public addresses/metadata. No test identities were created on the real network by this implementation. Use a Chipnet faucet or dedicated test-coin source for the treasury; CAPTCHA remains user-controlled. Do not paste a seed into a browser, terminal log, screenshot or conversation.

The setup helper selects confirmed **plain BCH** test outputs. A category genesis needs input 0 to spend output index 0. If the faucet did not supply such an output, explicitly prepare the bounded self-transfer first:

```sh
bun run testnet:setup prepare-genesis-input /private/path/focus-treasury.credential /private/path/genesis-input.signed.json
# Review its public txid and dedicated identity, then explicitly approve submission:
bun run testnet:setup broadcast-once /private/path/genesis-input.signed.json
bun run testnet:setup reconcile /private/path/genesis-input.signed.json
```

The self-transfer returns all value to the same dedicated treasury except a 2,000-sat fee. Wait for the configured confirmations, then prepare the v3 minting baton:

```sh
bun run testnet:setup prepare-baton /private/path/focus-treasury.credential /private/path/v3-baton.signed.json
bun run testnet:setup broadcast-once /private/path/v3-baton.signed.json
bun run testnet:setup reconcile /private/path/v3-baton.signed.json
```

Baton setup locks 1,000 sats and spends a 2,000-sat fee; all other BCH returns to the dedicated treasury. Source transaction, wallet script, amounts and VM validity are checked. The category, v3 address/locking bytecode, artifact SHA-256, exact signed bytes and txid are persisted. Submission first persists `pending`; `broadcast-once` refuses a second submission of a pending record. Reconciliation is read-only. Do not generate another transaction after an ambiguous result. Investigate the original txid/bytes with the owner; do not force a replacement.

Keep old deployed contracts/artifacts/recovery records available. This setup does not migrate or relabel v1/v2 assets. No old deployment inventory has been supplied.

## 3. Start the limited-credit service locally

Configure the actual category/baton, node identity and scoped capabilities from the prepared/confirmed records, not dummy build values. `GARDEN_TREASURY_KEY_FILE` points to the dedicated treasury **JSON identity** above, not a bare user WIF. Its role and network pins must match. Default lifetime/daily treasury budgets remain zero. For a single fresh planting grant, a deliberate 10,000-sat treasury allowance covers the 8,000-sat app credit plus the 2,000-sat grant fee. Account grants/reservations remain capped at 16,000 sats per UTC day. Additional sessions require deliberate bounded test allowances.

Provision a single authenticated test account and write its token privately:

```sh
bun run account /private/path/garden.sqlite focus-test-account /private/path/focus-account.credential
# From the root, with the private service environment configured:
bun run service:start
```

The service listens only on loopback port **3487**. No public deployment or publication is needed for a local debug acceptance run. `/healthz` is process health; `/readyz` checks node/ledger availability, not functional acceptance. They never set public release readiness.

For an Android debug build, bridge the ports with `adb reverse tcp:3487 tcp:3487` and `adb reverse tcp:8083 tcp:8083`. Set public mobile configuration to the actual category, v3 locking bytecode, genesis/fork pins, and minimum confirmations. For this isolated local run only, set `EXPO_PUBLIC_GARDEN_API_URL=http://127.0.0.1:3487` and `EXPO_PUBLIC_GARDEN_LOCAL_TEST_HTTP=1`. The code allows that exact port/loopback route only when `__DEV__` is true. LAN HTTP and all release-build HTTP remain rejected; normal/release integration requires HTTPS. Credentials remain in SecureStore.

The current standalone APK embeds JavaScript but has no live backend/category/genesis configuration. Rebuild its JS with actual public configuration if used for acceptance. It will not accept debug HTTP. Native debug APK and iOS simulator build contain the new auth/privacy modules and can load the development bundle. Do not install over a different signing identity or wipe a wallet to fix an install problem.

## 4. Execute the actual native journeys

Keep recovery phrases, private backups and tokens out of screenshots, logs and saved test flows: type them through secure input and write backups down by hand.

1. Check the device, a fresh install and the app ID before launching. Confirm the empty starting island renders.
2. Explicitly create the dedicated XO app wallet. Record its **public** address. Verify original raw-key and XO namespaces/app identifiers remain separate. With device authentication configured, verify backup protection; cancel captured reveal prompts. A user may privately write down the backup and restore through secure input on a second owned clean target. Do not expose it through automation. The restore route cannot replace an existing vault or change identity during a saved operation.
3. Save the dedicated external recipient's public receive address and the test-account access token. Address entry does not claim external-wallet ownership verification. The service verifies possession of the **app** key with a one-use challenge.
4. Request limited planting credit. Record grant txid and exact response status. Confirm mempool/shallow observations remain pending/confirming, no second grant is allocated, and six (or the recorded configured minimum) canonical confirmations are required before completion. Restart the app while pending; recover the same operation, not a replacement.
5. Prepare the 3-unit (1,536-second) plant, review the fixed external destination and fee/deposit/change, and explicitly sign/submit. Record source/grant/plant IDs, category, commitment, contract artifact, confirmation block/hash/time, and node policy. Confirm no reward/tree is earned by local practice-timer completion.
6. Background/close/reopen the app. Verify the actual chain session returns and continues independently of local pause/reset. Repeat with the service temporarily unavailable: a cached, wallet/category/checkpoint-bound session is labeled stale and cannot authorize a claim. Restore local-request loss from the authenticated server record; no grant/claim/broadcast is automatic.
7. Attempt an early claim through the normal path before maturity and record rejection. Wait through **actual canonical CSV maturity** from confirmation MTP. Capture relevant block hashes/header MTP values and the node's current maturity result. Phone time/countdown zero is not evidence of spendability.
8. Prepare and explicitly approve the claim. Its immutable NFT and original deposit must go directly to the planting-time external recipient; app change stays internal. Record signed txid/commitment and required confirmations. An unconfirmed claim is `claiming`, not an earned tree.
9. Verify a held, confirmed immutable reward is one tree; test planting/estimated-release/actual-claim-day filters and empty/duplicate handling. If the NFT is subsequently moved in an explicitly authorized test, keep history but do not count it as a held tree. No automatic merging or burning occurs.
10. Repeat the required 6-unit (3,072-second) path and onboarding/restart/recovery checks on **both configured native platforms**. Do not claim iOS proof from Android or a simulator compile.
11. Exercise lost-response recovery without generating new bytes. Read-only reconciliation comes first; an explicit user action may resubmit only the server's original recorded signed bytes after verifying the same network. A confirmed/reorg-regressed record retains input reservations and cannot authorize replacement credit.

Reorg behavior has deterministic adapter/integration tests. Do not invalidate the shared node or manufacture a public-chain fork for a badge. If a real Chipnet reorg is observed, retain canonical before/after hashes and state regressions separately. Controlled regtest/fixture reorg evidence must remain labeled supporting evidence, never live Chipnet proof.

On a physical phone, confirm every irreversible action by hand, even with test coins.

## 5. Record evidence and resume safely

Record only public identities, category/artifact/source revision and code fingerprint, exact commands, public txids/outpoints, block/hash/MTP/confirmation state, result/recovery/error observations, and public UI screenshots with target ownership. Retain secrets only in device secure storage or ignored private files. No live transaction has been recorded yet, and both readiness flags are false.

A consistent SQLite backup can be taken online with `bun run backup SOURCE NEW_BACKUP`. It checks integrity and writes mode 0600. To restore: drain/stop only this service instance, preserve the old ledger and WAL, integrity-check the backup, restore to the configured path, start without any automatic broadcasts, and reconcile all recorded pending txids against the node before allowing grants. Never lose pending history, replace a submitted transaction, or treat a missing receipt as permission to pay again.

Account operations: `bun run admin revoke DB ACCOUNT`, `bun run admin rotate DB ACCOUNT NEW_PRIVATE_TOKEN_FILE`, `bun run admin pause DB treasury.paused`, and `bun run admin pause DB broadcasts.paused`. Rotation preserves the authenticated account and pending operations. Client credential replacement during a pending operation must match that original account. Never-prepared reservations may be inspected/released with the existing guarded recovery utility; prepared or submitted records are not canceled automatically.
