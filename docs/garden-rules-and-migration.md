# Superseded wallet architecture

The initial v2 notes below describe the first web implementation. The confirmed native hybrid architecture and v3 migration rules are authoritative in [native-hybrid-wallet.md](native-hybrid-wallet.md). v3 separates the fee payer from the external reward recipient and uses commitment version `03`. No v2 deployment was executed here.

# Garden rules and v2 migration

## Product rules

- New wallets and the welcome screen show an unplanted island. No demo trees, cottage, crops, or well are awarded on entry.
- One claimed v2 NFT is one earned tree. No automatic gold/diamond conversion, merging, burning, or loss of rewards at a tier boundary. The current scene displays up to 60 trees; the total count includes all qualifying NFTs.
- Planting creates a locked sapling. Only a successfully claimed NFT held by its original planting wallet appears as an earned tree. This is a holdings view, not a lifetime activity ledger. Transfers out remove trees; imported rewards are not counted as the recipient's focus work.
- The app restores unclaimed sessions from contract UTXOs, scoped to the connected wallet and configured category. Local storage is not authoritative. The app allows one pending session at a time and recovers older pending sessions first. This is an application policy, not a contract-enforced per-wallet quota.
- A session cannot pause or reset the blockchain lock. No reward is claimed automatically. Failed claims retain the session; ambiguous transaction outcomes require a status refresh before continuing.
- BCH time locks use 512-second units. Supported delays are 3 units (25m 36s) and 6 units (51m 12s). The lock starts at confirmation, measured by consensus median time past. Confirmation and block cadence add waiting time. The browser countdown is an estimate from planting, not proof that a reward is spendable.
- Filters select local-calendar planting day or estimated release day, with an explicit All days control. Commitment timestamps are planter-supplied metadata, not verified blockchain dates. Actual confirmation/claim-day history needs a transaction indexer; do not use these estimates for billing, streak prizes, or paid attestations.
- The chain proves that a reward was locked for an interval. It cannot prove attention, prevent multiple wallets, or prevent the category's minting authority from issuing other tokens. No cash yield, token price, or redemption promise is implied.

## Contract invariants

The v2 commitment is 31 bytes: `02 | owner P2PKH script (25) | planting seconds LE (4) | duration units (1)`. The minting baton retains its script, minting capability, empty commitment, BCH value, category, and zero fungible amount. A session receives a mutable NFT with the exact owner/date/duration commitment. Claiming requires time-based CSV, pays the original owner, preserves BCH value and commitment, and produces an immutable NFT. Additional outputs cannot carry tokens.

The SDK uses a single plain BCH funding input of at least 4,000 satoshis, a 1,000-satoshi reward deposit, and a fixed 2,000-satoshi transaction fee. These are chipnet development defaults; production needs fee estimation and explicit pricing disclosure. Signing happens once per request. Network errors must not trigger automatic broadcasts or signing retries.

## Migration procedure

1. Record the old network, category, contract address, artifact, deployed frontend version, outstanding locks, and issued NFTs. The old compiled artifact is preserved in `packages/contracts/legacy/PomodoroRewards.v1.artifact.ts`.
2. Keep the old deployment available for legacy claims. Never erase `pomodoro_commitment`, `pomodoro_pubkey`, or `pomodoro_locktime` as part of migration. v1 locks do not acquire a new timer by changing frontend code; the old contract's `locktime >= 100` check provides no focus delay.
3. Treat v2 as a new contract deployment: its bytecode and address differ even with the same category. Existing UTXOs remain at the old address. Do not send funds or batons to a newly calculated address assuming they migrated.
4. Prefer a new category for v2, preserve the old deployment separately, and initialize an empty minting baton at the verified v2 token address. If reusing a category, arrange a valid minting-authority transfer explicitly; the old covenant cannot simply be redirected by this UI. Freeze new v1 planting at the release boundary.
5. Set `NEXT_PUBLIC_POMODORO_CATEGORY_ID` only after the new category and baton are provisioned. The app currently targets chipnet. Never silently reinterpret v1 commitments as v2 or combine legacy rewards into dated v2 counts. Legacy rewards need a separate undated collection if displayed later.
6. Run covenant tests, then validate on chipnet with an actual wallet: plant, refresh/reconnect, attempt an early claim, wait through confirmed CSV maturity, claim, verify immutable NFT and filters, and switch wallets. Check signing rejection, interrupted broadcast recovery, simultaneous baton contention, and both durations.
7. Keep old claim access and records until all legacy sessions have been resolved. No migration, on-chain deployment, baton transfer, or real-wallet transaction has been executed by this change.

## Validation

Run `bun run test:pomodoro` in `packages/contracts` for the focused v2 suite. It compiles an isolated test target because older P2PKH tests reference a removed contract and the utilities suite mixes Bun and Jest. The mock VM verifies CSV sequence requirements and covenant invariants; it does not simulate mined-block maturity. Real consensus timing remains a required chipnet release check.
