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

| What | URL | How it is updated |
|---|---|---|
| Landing page | https://focus-garden-bch.netlify.app | `bun run landing:build`, then `npx netlify-cli deploy --prod --no-build --dir packages/landing/dist --site focus-garden-bch` |
| Web app (Expo web export) | https://focus-garden-app.netlify.app | `cd packages/mobile && npx expo export --platform web --output-dir dist-web`, add `dist-web/_redirects` with `/*  /index.html  200`, then `npx netlify-cli deploy --prod --no-build --dir dist-web --site focus-garden-app` |
| Web prototype (packages/dapp) | earnest-pudding-aaf5c6 (custom domain focus.salemkode.com) | Netlify builds it from `master` using the root `netlify.toml` |

`--no-build` matters: without it the Netlify CLI applies the repository's Next.js plugin to these static folders and fails.

The `focus.salemkode.com` DNS record currently points at another Netlify site (the brainware one), so the domain shows a certificate error. It is managed in the Cloudflare account that owns salemkode.com; point its CNAME at the site that should own the domain.
