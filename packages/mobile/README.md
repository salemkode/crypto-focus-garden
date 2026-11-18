# Focus Garden app

The Focus Garden client for iOS, Android and web: Expo SDK 58, React Native 0.88, Expo Router,
NativeWind, SQLite and a native Libauth bridge. It needs a development build; **Expo Go is not
supported**.

## Run

From the repository root:

```sh
bun install --frozen-lockfile
bun run mobile:start                     # Metro on port 8083
bun run mobile:ios --device <UDID>
bun run mobile:android --device <SERIAL>
```

Copy `.env.example` to `.env.local` and fill in the public garden service settings. Only public
values belong there: never put private keys or account credentials in `EXPO_PUBLIC_*` variables.

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_GARDEN_API_URL` | Garden service URL (HTTPS; release builds refuse HTTP) |
| `EXPO_PUBLIC_GARDEN_CONTRACT_BYTECODE`, `EXPO_PUBLIC_GARDEN_CATEGORY` | The deployed contract the app trusts |
| `EXPO_PUBLIC_GARDEN_GENESIS_HASH`, `..._CHECKPOINT_HEIGHT`, `..._CHECKPOINT_HASH`, `..._MIN_CONFIRMATIONS` | Chain identity and confirmation policy |
| `EXPO_PUBLIC_VALLEY_RENDERER` | `filament` (default, native) or `webview` (three.js) |
| `EXPO_PUBLIC_VALLEY_STATS=1` | Shows the valley's frame-rate overlay (off by default) |

## Layout

| Path | Contents |
|---|---|
| `src/app` | Screens (Expo Router): Focus, Leaders, Stats and Profile tabs, plus sheets and onboarding |
| `src/ui` | Design system. iOS renders SwiftUI through `@expo/ui` (`*.ios.tsx`); Android and web use React Native (`*.rn.tsx`). See [docs/design-system.md](../../docs/design-system.md). |
| `src/components` | Screen building blocks, including the 3D valley (`valley/`, Filament on native, three.js on web) |
| `src/features` | Focus sessions and stats, rewards, wallet, wallet linking, profile |
| `modules/libauth-native` | Native Libauth C/JSI bridge (secp256k1, hashes) |
| `modules/focus-shield` | App blocking: Screen Time on iOS, a usage-access guard on Android |
| `targets/activity` | iOS Device Activity extension used by app blocking |
| `tests`, `test` | Unit tests (`bun run test`) |

## App identities

The product bundle ID is `com.arquebus.focusgarden`. Earlier prototype identities stay buildable
with `FOCUS_GARDEN_APP_VARIANT=expo-prototype` (`com.salemkode.libauthreactnative`) or
`foundation` (`com.focusgarden.mobile`), so test wallets on existing installs stay reachable in their
own sandbox. Keys are never copied between sandboxes. Don't uninstall an app that holds a funded
wallet, or change its signing identity, to work around an install error.

`FOCUS_SHIELD_IOS=0` builds without Apple's Family Controls entitlement (needed until Apple approves
it for distribution). `IOS_BUILD_NUMBER` sets the build number.

## Wallet safety

- The on-device Focus Garden wallet only pays network fees and signs; grown trees go to the user's
  own linked wallet.
- A local timer never releases a tree. Release follows the contract's on-chain time lock.
- Recovery phrases and raw keys are stored separately and are never reinterpreted or silently
  replaced by a failed read.

## Checks

```sh
bun run typecheck
bun run lint
bun run test
bun run test:native-core   # native crypto vs. the WebAssembly Libauth
bun run check:valley       # the bundled web valley is up to date
bun run export:check       # iOS and Android Hermes exports
```
