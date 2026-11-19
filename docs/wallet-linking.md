# Linking the user's wallet (16 November 2026)

Grown trees are sent to the user's own Bitcoin Cash wallet. The app links it in one of two ways,
both supported by Selene and Paytaca. The sheet leads with the two protocols (WalletConnect,
WizardConnect, each with its logo); Selene and Paytaca sit under "Shortcuts" and only open one of those
protocols straight in that wallet. A protocol started without a shortcut shows its QR code, "Copy link" and
"Open in wallet" (hands the link to whichever installed wallet registers `wc:` or `wiz://`). Logos are in
`assets/wallets/` (WalletConnect brand kit, the WizardConnect hat from Paytaca's repo, each wallet's own icon). Code: `packages/mobile/src/features/wallet-link/`, screen
`src/components/WalletLink.tsx` (used by the wallet sheet and the last onboarding page).

| | WalletConnect v2 (wc2-bch-bcr) | WizardConnect (RiftenLabs) |
|---|---|---|
| Library | `@walletconnect/sign-client` 2.26.0 + `@walletconnect/react-native-compat` 2.21.8 | `@wizardconnect/dapp` 0.2.7 + `@wizardconnect/core` 0.2.10 |
| Transport | Reown relay; needs a project ID | End-to-end encrypted over public Nostr relays; no account |
| Link | `wc:…` | `wiz://?p=…&s=…` |
| What the app reads | The `bch` namespace account (or `bch_getAddresses`) | The wallet's receive xpub; address index 0 |
| Wallet button | **Paytaca** (registers `wc:`; has no `wiz://` handler) | **Selene** (the only wallet registering `wiz://`) |

Wallet URL schemes, verified in source on 16 November 2026:
- Paytaca (`paytaca/paytaca-app`, Info.plist and AndroidManifest): `bitcoincash`, `paytaca`, `ethereum`,
  `bch-wif`, `wc`. Its deep-link handler routes raw `wc:` URIs to WalletConnect. WizardConnect links are
  accepted only by scanning or pasting in Apps → WizardConnect.
- Selene (`selene.cash/selene-wallet`): `bitcoincash`, `bch-wif`, `wc`, `wiz`.

Because both wallets register `wc:`, a WalletConnect link may open either one when both are installed;
the Paytaca button therefore cannot force Paytaca. "Copy link" and the QR code cover any wallet and a
second device.

Rules:
- Only the address is needed. Each session is closed once the address is known; Focus Garden never asks
  the linked wallet to sign. The on-device helper wallet still pays fees and signs the planting.
- The app runs on Chipnet. A wallet that shares a mainnet address identifies the same key, so the
  address is converted to its `bchtest:` form (tested in `tests/wallet-link.test.ts`). The user's wallet
  must be in Chipnet/testnet mode to see the trees.
- Linking goes through `RewardProvider.saveRecipient`, so the existing checks still apply (no linking
  while a saved operation is pending; the helper wallet's own address is refused).
- The project ID comes from `EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID` in the git-ignored
  `packages/mobile/.env.local` (the workspace's existing Reown project). Without it the WalletConnect
  options are disabled; WizardConnect still works.
- iOS declares `wiz`, `wc`, `paytaca`, `bitcoincash` in `LSApplicationQueriesSchemes` so the app can tell
  whether a wallet is installed (otherwise it opens the App Store page).
- Manual address entry remains, labelled for testing.

Not yet verified against a live wallet: approving a pairing in Selene or Paytaca on a device.
