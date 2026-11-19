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

When it finishes it prints the values every app build needs:

```
EXPO_PUBLIC_GARDEN_CATEGORY=...
EXPO_PUBLIC_GARDEN_CONTRACT_BYTECODE=aa20...87
EXPO_PUBLIC_GARDEN_DIRECTORY_CATEGORY=...
EXPO_PUBLIC_GARDEN_DIRECTORY_BYTECODE=aa20...87
```

Commit `deployments/<network>.json` (it holds only public data) so the app, the landing page and any indexer use the same deployment. If the contracts change, that is a new deployment with new addresses.

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
| Web app (Expo web export) | https://focus-app.salemkode.com | `cd packages/mobile && npx expo export --platform web --output-dir dist-web`, then `cd ../../deploy/web-app && cf deploy ../../packages/mobile/dist-web` (Worker `focus-garden-app`, single-page-app fallback) |
| iPhone | https://appdrop.app/d/prvhsh4gyx | `packages/mobile/scripts/appdrop.sh <next build number>` |
| Android | https://appdrop.app/d/njfetdhs4s | `./gradlew assembleRelease` in `packages/mobile/android`, then `npx appdrop app-release.apk --update https://appdrop.app/d/njfetdhs4s` |

The landing page reads the public deployment record (`packages/contracts/deployments/mainnet.json`) at build time and the leaderboard live from public Electrum servers. Netlify is no longer used for hosting.

## 4. Mainnet deployment (19 November 2026)

| | Category | Contract address |
|---|---|---|
| Focus Forest | `0949e4d7094966ac9e0bedceb8cde8a92d2d53e79fd9efe6686376e640ea3401` | `bitcoincash:pvh9q4ts2wngk5ts44eyjvu6r6uzswlf5qlmg78tzhacva9luc47se32m43xj` |
| Focus Directory | `9edee153596de9b8c370e728b9ded8696a9fa094e6f1a0ca8de2dd5d74b3ee8f` | `bitcoincash:pwa4g6w9xflqxk98yynjhwkxyu5dagzzc2e89v2qzc4p09yvuf6aje3m0fs2u` |

All four transactions are in `packages/contracts/deployments/mainnet.json`; each minting baton was verified on chain inside its contract. The deployer wallet keeps the unused funds.
