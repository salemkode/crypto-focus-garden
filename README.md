# Focus Garden

> [!IMPORTANT]
> 🚩 **This is an upgrade of our 2025 hackathon project.** Focus Garden started as *Crypto Focus
> Garden*, a Next.js web dApp we built for last year's hackathon (1–23 November 2025). The original
> submission is preserved at commit
> [`de708cd`](https://github.com/salemkode/crypto-focus-garden/tree/de708cd), and its README is
> [here](https://github.com/salemkode/crypto-focus-garden/blob/de708cd/README.md). Everything after
> that commit is this year's work. See [Before and after](#before-and-after-2025-hackathon--now).

Focus Garden is a focus timer that grows a tree while you stay off your phone. Leave the app and the
tree withers. Verified sessions are locked on Bitcoin Cash, and the grown tree is sent to your own
wallet as a collectible. Longer focus grows bigger trees (sprout, tree, big tree, house), and
smaller ones merge into bigger ones.

> There is no Focus Garden server. The app talks to Bitcoin Cash directly through public Electrum
> servers, and the contracts on chain are the whole backend. The contracts are live on mainnet
> ([`packages/contracts/deployments/mainnet.json`](packages/contracts/deployments/mainnet.json)).

## Before and after (2025 hackathon → now)

Last year's version proved the idea: finish a focus timer, receive a CashTokens NFT. It was a web
page on Chipnet, and its contract skipped the real time check so the demo could mint quickly. We
wanted a phone app, but Libauth, the library the contracts depend on, did not run on React Native.
This year we solved that and rebuilt the product around it.

| | 2025 hackathon version | Now |
|---|---|---|
| Platform | Web dApp (Next.js) in the browser | One Expo app for iOS, Android and web |
| Network | Chipnet (test coins) | Bitcoin Cash mainnet |
| Contracts | One `PomodoroRewards` contract | `FocusForest` (plant, grow, merge, claim) and `FocusDirectory` (public profiles) |
| Time check | Relaxed for the demo | Enforced on-chain: a time lock holds the tree for the full session |
| Staying focused | A timer on a web page | Leaving the app withers the tree; Screen Time (iOS) and usage access (Android) block chosen apps |
| Rewards | One NFT per finished session | Trees grow by session length (sprout, tree, big tree, house), come in six styles, and merge into bigger ones |
| Wallets | WalletConnect in the browser | Selene, Paytaca, WalletConnect, WizardConnect or a pasted address, plus an on-device wallet for fees |
| World | A Three.js scene | A voxel valley rendered natively, shared with the web |
| Social | None | On-chain leaderboard, public profile cards and tips |
| Libauth on mobile | Blocked (no React Native support) | Runs natively through `libauth-native` |

## What's in the repository

| Package | What it is |
|---|---|
| [`packages/mobile`](packages/mobile/README.md) | The app: Expo SDK 58, React Native 0.88, Expo Router. iOS, Android and web from one codebase. |
| `packages/garden` | The voxel world: tree and house models, the floating valley, seasons and camera. Shared by native and web. |
| `packages/contracts` | CashScript contracts: `FocusForest` (locks and grows trees), `FocusDirectory` (public profiles), and the earlier `PomodoroRewards`. |
| `packages/protocol` | Shared rules and the on-device chain code: reward sizes, tree styles, the on-chain data format, transaction building, garden reading and the leaderboard. |

Inside the app:

- **Focus:** pick a length and a tree style, plant, and stay. The tree withers if you leave for more than 10 seconds.
- **App blocking:** Screen Time on iOS and a usage-access guard on Android block chosen apps while a tree grows.
- **Verified trees:** a session can be locked in the Focus Forest contract. When the lock matures, the tree is released to the wallet you linked.
- **Wallets:** link your own wallet (Selene, Paytaca, WalletConnect, WizardConnect, or a pasted address). A separate on-device Focus Garden wallet pays the network fees; you fund it with a little BCH.
- **Leaders and stats:** a leaderboard of verified focus, tips by name, and your own focus history.

## Getting started

Requires [Bun](https://bun.sh) 1.4 or newer (1.3 runs out of memory installing this workspace), Xcode for iOS, and Android Studio for Android.

```sh
bun install --frozen-lockfile
bun run mobile:start      # Metro on port 8083
bun run mobile:ios        # native iOS build
bun run mobile:android    # native Android build
bun run check             # types, lint and all tests
```

Expo Go is not supported; the app needs a development build because it ships native modules
(crypto, app blocking and the Filament 3D renderer).

## Documentation

- [Design system](docs/design-system.md)
- [Focus Forest v5 product and contract rules](docs/focus-forest-v5.md) (v4: [docs/focus-forest-v4.md](docs/focus-forest-v4.md))
- [Valley design](docs/valley-design.md)
- [Hybrid wallet architecture](docs/native-hybrid-wallet.md) and [wallet linking](docs/wallet-linking.md)
- [Garden rules and migration](docs/garden-rules-and-migration.md)
- [Expo consolidation](docs/expo-consolidation.md)

## License

[MIT](LICENSE)
