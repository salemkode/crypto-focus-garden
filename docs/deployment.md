# Deploying Focus Garden (no backend)

Focus Garden has no server of its own. The chain is the backend: the app talks to Bitcoin Cash through public Electrum servers, and two contracts hold the rules. You deploy those contracts once; every user's app points at the same deployment, so all trees and profile cards share one collection.

## 1. Deploy the contracts (once per network)

Everything runs from `packages/contracts` (or `bun run contracts:deploy <command>` from the repository root).

```sh
bun run deploy init      # creates a dedicated deployer wallet and prints its address
# send at least 10,000 sats to that address (Chipnet faucet: https://tbch.googol.cash)
bun run deploy status    # shows the balance through a public Electrum server
bun run deploy deploy    # mints both minting batons into their contracts
```

What `deploy` does, in four chained transactions:

| Step | Transaction | Why |
|---|---|---|
| 1 | `forest-prep`: the deployer pays itself | CashTokens creates a category only from an output with index 0 |
| 2 | `forest-genesis`: spends that output, sends the Focus Forest minting baton into the contract | The category id is the prep transaction's id |
| 3 | `directory-prep` | A second fresh output 0 for the second category |
| 4 | `directory-genesis`: sends the Focus Directory minting baton into its contract | |

Cost: two 1,000-sat batons (they stay in the contracts) plus four 1,000-sat fees.

Safety:
- The deployer key lives in `~/.focus-garden/deployer-<network>.json` (mode 600), never in the repository. It only funds the deployment; it gets no special power over the contracts afterwards.
- The full plan, with every signed transaction, is saved to `packages/contracts/deployments/<network>.json` **before** anything is broadcast. If a run is interrupted, running `deploy` again resends the same bytes; it never creates a second collection.
- Mainnet requires `--network mainnet` and `FOCUS_GARDEN_CONFIRM_MAINNET=yes`.
- `packages/contracts/test/contract/Deploy.test.ts` checks the whole chain against BCH consensus rules and plants a tree with the resulting baton.

Commit `deployments/<network>.json` (it holds only public data). The app bundles it and checks its own compiled contracts against it at startup, so the app, the landing page and any indexer use the same deployment. `EXPO_PUBLIC_FOCUS_NETWORK` picks the record (`mainnet` by default). If the contracts change, that is a new deployment with new addresses.

## 2. The landing page

`packages/landing` is a static site: the app's real 3D valley in the hero, an interactive focus-time slider with the four on-chain tiers, a merge playground, the deployed contract addresses, an FAQ and download buttons.

```sh
bun run landing:dev     # http://localhost:4321
bun run landing:build   # static files in packages/landing/dist
```

- Download links live in `packages/landing/src/config.ts`. An empty link shows "Coming soon" instead of a dead button. The visitor's platform is offered first.
- The build copies the public deployment record from `packages/contracts/deployments/chipnet.json`, so the contracts section fills itself in after step 1.
- `dist` is plain HTML, CSS, JS and images. Any static host works (Cloudflare Pages, GitHub Pages, Netlify).

## 3. Where things are live

Everything is hosted on Cloudflare (account "Salem.m.s2030@gmail.com's Account", zone salemkode.com) as assets-only Workers, deployed with the `cf` CLI (1.0 or later):

| What | URL | Deploy |
|---|---|---|
| Landing page | https://focus.salemkode.com | `cd packages/landing && bun run build && cf deploy ./dist` (config: `packages/landing/cloudflare.config.ts`, Worker `focus-garden`) |
| Web app (Expo web export, shown as a phone on desktop) | https://focus-app.salemkode.com | `cd packages/mobile && bun run export:web`, then `cd ../../deploy/web-app && cf deploy ../../packages/mobile/dist-web` (Worker `focus-garden-app`, single-page-app fallback) |
| iPhone | https://appdrop.app/d/prvhsh4gyx | `packages/mobile/scripts/appdrop.sh <next build number>` |
| Android | https://appdrop.app/d/njfetdhs4s | `./gradlew assembleRelease` in `packages/mobile/android`, then `npx appdrop app-release.apk --update https://appdrop.app/d/njfetdhs4s` |

The landing page reads the public deployment record (`packages/contracts/deployments/mainnet.json`) at build time and the leaderboard live from public Electrum servers. Netlify is no longer used for hosting.

## 4. Mainnet deployment (19 November 2026)

The live collection is **v3**: same contracts as v1 and v2, created again so wallets show real metadata (BCMR) that only we can change.

| | Category | Contract address |
|---|---|---|
| Focus Forest | `cb351f415f5cbf974e0f5f661cdccf5b83e1827a9135d9429316e30ca13d4ae1` | `bitcoincash:p0979gfv7ncn9dne6cwjrgw4479rq0kk7dyqm2ng3376zutcrkj776ftama5r` |
| Focus Directory | `b4abb87c910f2489ea6ef1435dbc2e08074ddfc5a8424ec4a09bfa13054e795b` | `bitcoincash:pvvxgnrkuavnse76u4yc86wdg2vx94qjkw6c5ln20vwwveqzlg4x74zw0sgzw` |

**Why v3.** In v2 the genesis transaction put the minting baton at output 0. A category's BCMR authchain follows output 0, so it ran through the contract, and every plant transaction extended it. The contract allows extra OP_RETURN outputs, so any planter could have published their own metadata and renamed the collection or swapped its pictures in every wallet. In v3, genesis output 0 is a plain 1,000-sat identity output on a dedicated **metadata authority** key (`~/.focus-garden/authority-mainnet.json`, address `bitcoincash:qrfa3wsch0upzxk2gaswlvsnj067sy42es2m7jhyhc`), and the baton moves to output 1. Plant transactions are no longer part of the authchain.

**Metadata (BCMR).** The registry is hosted at https://focus.salemkode.com/.well-known/bitcoin-cash-metadata-registry.json and built by `packages/protocol/src/bcmr.ts`.
- **Collection:** both genesis transactions publish it, so wallets show "Focus Forest" with its icon.
- **Parsable trees:** wallets that run the parse bytecode (Cashonize) show each tree's name (e.g. "Meadow Oak · Sprout"), verified focus minutes and planting time.
- **Merged trees** show their lineage instead.
- **Pictures:** each of the 24 tier and style combinations has its own picture (`packages/landing/public/bcmr/trees/`). Indexers (bcmr.paytaca.com, which Cashonize and Paytaca use) don't run parse bytecode yet, so the registry also lists every known tree by its exact commitment. That entry is what gives each tree its own icon.
- **Trees planted later** get their own icon after the next `publish`. Until then they still parse correctly.
- **The app** uses the same names, via `treeName` in the protocol package.

**Updating the metadata** (new trees, new pictures or copy):

```bash
cd packages/contracts
FOCUS_GARDEN_CONFIRM_MAINNET=yes bun run deploy publish --network mainnet
# writes the new registry into packages/landing/public/.well-known/, then stops:
cd ../landing && bun run build && cf deploy ./dist
cd ../contracts && FOCUS_GARDEN_CONFIRM_MAINNET=yes bun run deploy publish --network mainnet
```

The second run checks the hosted bytes against the hash in the signed transactions before it broadcasts. It then extends both authchains from the authority key, and the deployer pays the fees. **Deploy the landing page only from a branch that contains `public/.well-known/`, `public/bcmr/` and `public/_headers`.** A build without them takes the registry offline.

**Creator trees.** The Focus Forest genesis transaction (`2d84dd8d230073be1d903d3796a008b1f392a740af1963de403ff5c53abca68f`) minted 100 trees straight to the owner's Cashonize wallet `bitcoincash:zq57pxa24rtynycq57qpsav697jtn9rugvrzurjl7d`, with no planting and no time lock:
- **Mix:** 16 Sprouts, 24 Trees, 30 Big trees and 30 Houses, across all six styles.
- **Format:** the normal tree format, immutable, so they look and behave like claimed trees and can be sent to anyone.
- **Leaderboard:** counts only trees planted through the contract, so they add no points.

The command was `bun run deploy deploy --network mainnet --creator-nfts 100 --creator-address <address>`.

All transactions, including metadata revisions, are in `packages/contracts/deployments/mainnet.json`. v2 (`deployments/mainnet-v2.json`, category `cd98a853…04e1`) and v1 (`deployments/mainnet-v1.json`) are superseded. No tree was ever planted in v2. Its 100 creator trees are still in the owner's Cashonize wallet with 1,000 sats each, but they carry no metadata.
