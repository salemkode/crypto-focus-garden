# Focus Garden

Focus Garden is a focus timer that grows a tree while you stay off your phone. Leave the app and the
tree withers. Verified sessions are locked on Bitcoin Cash, and the grown tree is sent to your own
wallet as a collectible. Longer focus grows bigger trees (sprout, tree, big tree, house), and
smaller ones merge into bigger ones.

> Status: development on **Chipnet**, the Bitcoin Cash test network. Nothing is deployed to
> mainnet, and test coins have no value.

## What's in the repository

| Package | What it is |
|---|---|
| [`packages/mobile`](packages/mobile/README.md) | The app: Expo SDK 58, React Native 0.88, Expo Router. iOS, Android and web from one codebase. |
| `packages/garden` | The voxel world: tree and house models, the floating valley, seasons and camera. Shared by native and web. |
| `packages/contracts` | CashScript contracts: `FocusForest` (locks and grows trees), `FocusDirectory` (public profiles), and the earlier `PomodoroRewards`. |
| `packages/protocol` | Shared rules: reward sizes, tree styles and the on-chain data format. |
| `packages/service` | The garden service that pays network fees for planting and claiming, with an operator-owned BCHN node. |

Inside the app:

- **Focus:** pick a length and a tree style, plant, and stay. The tree withers if you leave for more than 10 seconds.
- **App blocking:** Screen Time on iOS and a usage-access guard on Android block chosen apps while a tree grows.
- **Verified trees:** a session can be locked in the Focus Forest contract. When the lock matures, the tree is released to the wallet you linked.
- **Wallets:** link your own wallet (Selene, Paytaca, WalletConnect, WizardConnect, or a pasted address). A separate on-device Focus Garden wallet only pays network fees.
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
- [Garden service](docs/funding-service.md)
- [Garden rules and migration](docs/garden-rules-and-migration.md)
- [Expo consolidation](docs/expo-consolidation.md)
- [Chipnet acceptance procedure](docs/chipnet-acceptance.md)

## License

[MIT](LICENSE)
