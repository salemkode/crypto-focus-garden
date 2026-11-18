# Focus Forest v4: tree rules and merging

Status: **superseded by v5** (docs/focus-forest-v5.md) before any deployment. Kept for history.

## Why v4

The user directed that every tree species has its own rules, and that some species can only be obtained by merging other trees, enforced by the contract. Because v3 was never deployed (no v3 category, baton or NFT exists), v4 replaces v3 as the contract to deploy; no on-chain migration is required. The v3 source, artifact and tests remain for history and are not used by the service or app.

The user chose **merge before claiming**. Trees stay in the contract until their owner claims them. The contract merges matured trees, and only the app wallet that planted them can authorize a merge. A tree claimed to the external wallet can no longer be merged.

## Commitment (39 bytes, within the 40-byte CashTokens limit)

`04 | owner pkh (20) | planter tag (12) | stamp (4, LE) | lock units (1) | species (1)`

- **planter tag**: the first 12 bytes of `hash160(app-wallet P2PKH locking bytecode)`. Only that wallet can merge.
- **stamp**: the planting time for planted trees, or the first 4 bytes of `hash256` of the burned ingredient commitments for merged trees.
- **units**: 512-second CSV units (3, 6 or 12). Merged trees use `00`.

## Rules (contract `contracts/FocusForest.cash`, mirrored in `packages/protocol/src/forest.ts`)

| Code | Tree | How it is earned |
|---|---|---|
| 1 | Meadow Oak | Plant with a lock of at least 25.6 min |
| 2 | Blossom Cherry | Plant with a lock of at least 25.6 min |
| 3 | Ridge Pine | Plant with a lock of at least 51.2 min |
| 4 | Ember Maple | Plant with a lock of at least 51.2 min |
| 5 | Silver Birch | Plant with a lock of at least 102.4 min |
| 16 | Grove Oak (rare) | Merge 3 Meadow Oaks |
| 17 | Sakura Grove (rare) | Merge 3 Blossom Cherries |
| 18 | Ancient Pine (rare) | Merge 3 Ridge Pines |
| 19 | Autumn Crown (rare) | Merge 2 Ember Maples and 1 Silver Birch (in that order) |
| 32 | Cash Tree (legendary) | Merge Grove Oak, Sakura Grove, Ancient Pine and Autumn Crown (in that order) |

## Contract functions

- `plantTree(plantedAt, units, species, ownerPkh)` checks the species' minimum lock and that the owner is not the paying app wallet. It records the planter tag and keeps the minting baton. No other contract input may be spent in the same transaction.
- `mergeTrees(recipe)` runs on every ingredient input, and each one proves its own CSV maturity. Input 0 checks that every ingredient comes from the same contract, category, owner and planter, and that the recipe's species are in the required order. It also checks that the last input is the planter's own P2PKH, which requires that wallet's signature. The merged tree stays in the contract with the deterministic lineage stamp. The other ingredients are burned.
- `claimTree()` releases a matured tree (merged trees have no further delay) as an immutable NFT to the owner's P2PKH. No other contract input may be spent in the same transaction.

The compiled redeem script is 728 bytes, valid under the May 2025 VM-limits upgrade (active on Chipnet). A burn attack, where a victim's matured trees are added as fake merge inputs to a plant or claim, is rejected by the plant and claim guards; the tests assert that the failure happens at those guards.

## Service and app

- **Service:** only one tree may *grow* at a time. Matured trees may wait in the contract. A merge requires every ingredient to be confirmed, matured, unclaimed and unmerged. Merged ingredients are recorded with `mergedInto`, and leave the garden once the merge confirms.
- **App:** planting shows each species and its rule. The Merge workshop lists recipes, the trees available for each, and an explicit irreversible-burn confirmation. Sign and submit use the same saved-operation recovery as planting and claiming. Each NFT's look is derived from its commitment: the species sets the base tree and rarity, and a hash of the commitment varies it.

## Evidence (local only)

- **Contract tests:** 30 v4 cases cover the planting rules, the burn guards, claims, every recipe, ordering, maturity, owner and planter mismatch, the signer, lineage and the destination. They run alongside the 17 retained v3/credit-policy tests.
- **Service end-to-end:** plant 3 oaks one at a time, a wrong recipe is refused, merge into a Grove Oak, burned trees are rejected, and the Grove Oak is claimed to the owner. Every transaction is checked by the BCH 2026 VM.
- **Totals:** `bun run check` passes 108 tests (47 contract, 40 mobile, 21 service).

## Remaining before Chipnet acceptance

The same live prerequisites as before: a verified BCHN read route and a bounded write route, then baton setup for the **v4** artifact (`testnet-setup` now uses `FocusForest`) and the device journeys, plus an explicit live merge cycle.
