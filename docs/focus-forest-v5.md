# Focus Forest v5: rewards that grow with focus, a public directory, a leaderboard and tips

> **Historical.** The garden service (`packages/service`) and its BCHN node described below were removed. The app now builds, signs and broadcasts every transaction itself and reads the chain through public Electrum servers; see `packages/protocol/src/build.ts`, `chain.ts` and `garden.ts`.

Status (15 November 2026): implemented and tested locally. **Not deployed.** It supersedes v4 (docs/focus-forest-v4.md), which was never deployed either, so nothing migrates.

## Product rules (user-directed)

More verified focus earns a bigger reward. Short sessions grow small items, and small items merge into bigger ones without changing their value.

| Tier | Earned by a verified lock of | Or merge | Focus units (score) |
|---|---|---|---|
| Sprout | ≥ 1 unit (8.5 min) | — | 1 |
| Tree | ≥ 3 units (25.6 min) | 3 Sprouts | 3 |
| Big Tree | ≥ 6 units (51.2 min) | 2 Trees | 6 |
| House | ≥ 11 units (93.9 min) | 2 Big Trees | 12 |

Bitcoin Cash relative time locks count in 512-second units, so the chain cannot verify a 1-minute session. Local practice sessions of any length still grow in the app, but on-chain rewards start at 8.5 minutes. The species (oak, cherry, pine, maple, birch, cash) is the planter's cosmetic choice. A merged item keeps the style of its first ingredient. Rewards stay in the contract until claimed. Only matured, unclaimed items can merge, and only the app wallet that planted them can authorize the merge (the user's earlier "merge in the contract" choice). Only the owner's reward wallet or the planting app wallet can release an item, so nobody else can pull matured items out before they are merged. Deposits always follow the item: a merge keeps the sum of its ingredients' deposits, and a release pays the full value to the owner.

## Contracts

- `contracts/FocusForest.cash` (779 bytes, deployed as P2SH32). Commitment (39 bytes): `05 | owner pkh 20 | planter tag 12 | stamp 4 | units 1 | look 1`, where `look = tier*16 + species`.
  - `plantTree` enforces each tier's minimum lock and species 1–6, refuses the paying wallet as owner, and refuses extra contract inputs. The stamp is an unsigned 32-bit planting time (valid until 2106). It is caller-supplied metadata: the service sets it from its own clock and binds it to the transaction locktime, and a chain-wide indexer must rank by block time, not by the stamp.
  - `mergeTrees` runs on every ingredient, and each one proves its own CSV maturity. The leader checks the count (3, 2 or 2), that all ingredients share a tier, owner and planter, and that the planter signed. It derives the next tier and the first ingredient's style, writes a lineage stamp, and keeps the result in the contract with the sum of the ingredients' deposits. The app wallet pays only the fee.
  - `claimTree` releases the immutable NFT and its full deposit to the owner. The transaction must include a signed P2PKH input from the owner or from the planting app wallet. Merged items (units 0) need no further delay. The app releases through the planting app wallet; an owner-signed release is the recovery path if that wallet is lost.
- `contracts/FocusDirectory.cash` (147 bytes, P2SH32). Anyone can mint their own profile card: an immutable NFT with commitment `01 | name (3–32 bytes)`, held by the app wallet that pays and signs. Nobody can mint a card for another wallet. An optional "about me" text travels in an OP_RETURN (`FGP1`, up to 140 bytes). Cards are immutable, so every card of the category carries a name the contract accepted; renaming means registering a new card, and indexers use the holder's latest card. UTF-8 validity and name uniqueness are checked off-chain (`parseProfile` rejects invalid UTF-8; the service keeps names unique).

Each contract has its own category and minting baton. `bun run testnet:setup prepare-baton` and `prepare-directory-baton` prepare them from separate genesis inputs.

## Review hardening (18 November 2026)

An independent review (Claude Opus and GPT Sol) led to these changes before deployment: owner-or-planter authorization for releases, merges that keep every deposit, unsigned 32-bit planting times, immutable profile cards, no plain outputs stranded at the contracts, P2SH32 addresses, service-side uniqueness of session commitments, and contract tests with a byte-order-sensitive category. The contracts' loops require the May 2026 BCH VM rules; confirm they are active on Chipnet before acceptance.

## Leaderboard and tipping (service)

- **Leaderboard:** only members with a confirmed profile appear (opt-in). Score is the sum of tier points over confirmed planted rewards, so merging never changes it. Two periods: this week and all time.
- **Tips:** the app sends a profile id, an amount and the recipient address returned by the leaderboard. The service re-resolves the id to the reward wallet of the member's latest confirmed reward, refuses mismatches and self-tips, and builds a single-input transaction. The app validates the destination and amount before signing. Tips come from the app wallet's own balance.
- **Names:** unique case-insensitively within the service's directory table. A global, chain-wide index of all profile cards and rewards is the job of the project's CashTokens indexer; that is the next step after deployment.

## Evidence (local only)

- **Contracts:** 52 tests. These include 35 v5/Directory cases: every tier minimum, species bounds, forged tiers and planters, burn guards for plant and claim, every merge step, merged items merging again, wrong counts or mixed tiers, houses not merging, maturity per ingredient, owner and planter mismatch, the signer, the destination and lineage, and Directory registration, name length, holder binding and exact name.
- **Service end-to-end** (`v5:` test in `packages/service/test/flow.test.ts`; every transaction checked by the BCH 2026 VM): register a profile, plant 3 sprouts one at a time, appear on the leaderboard with 3 points, merge into a tree with the score unchanged, then a second member tips by profile id and the tip arrives.
