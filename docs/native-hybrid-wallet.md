# Native app and hybrid-wallet rules

> **Historical.** The garden service (`packages/service`) and its BCHN node described below were removed. The app now builds, signs and broadcasts every transaction itself and reads the chain through public Electrum servers; see `packages/protocol/src/build.ts`, `chain.ts` and `garden.ts`.

Confirmed by the user on 2026-11-15: **React Native app; on-device internal wallet; backend funds limited transaction credit; earned results go to the user's external wallet.** Ionic/Capacitor and a hosted web page are not the product direction.

## Responsibilities

| Component | Holds | Can do |
| --- | --- | --- |
| Native app wallet | Small BCH transaction subsidy; private key in device secure storage | Sign and fund planting and release transactions locally |
| External wallet | Earned tree NFTs and each released NFT's BCH deposit | Receive rewards directly; retain the user's valuable assets |
| Funding backend | Treasury key, authenticated account and credit ledger | Fund limited BCH grants to verified app-wallet addresses; prepare unsigned transactions; broadcast signed transactions |
| Covenant | Minting baton and pending reward NFTs | Fix the reward destination at planting; enforce the relative time lock; pay the reward directly to that destination |

The backend never receives the app wallet's private key. The external wallet is not needed to sign each focus interaction. Save or connect the external wallet once; protect destination changes and explain that they affect future sessions only. An address entry is not evidence that the user owns that wallet. Ownership verification/WalletConnect is a separate integration, not something to imply in the UI.

Unused transaction credit stays in the app wallet and is not shown as earned income. All earned NFT rewards and their attached BCH go directly to the external wallet; they never pass through the app wallet for a later sweep. No fiat-value promise or token reward exchange rate is introduced.

## Contract v3

`mintAndLockReward(plantedAt, units, rewardPkh)` takes the external wallet's P2PKH hash explicitly, independently of funding input 1. The v3 commitment is `03 | external owner script (25) | plantedAt LE (4) | units (1)` (31 bytes). Claim output 0 must pay that owner, preserve commitment/value/category, and have immutable capability. Internal-wallet change is separate. Anyone can fund a valid claim, but cannot redirect its reward. The CSV minimum remains 3 or 6 time units after confirmation.

The SDK accepts `mintAndLockReward(duration, externalRewardAddress)`. Its default preserves the web prototype's same-wallet behavior. Claiming derives the destination from the commitment, never from the fee-paying wallet. The web prototype is not a demonstration of the native hybrid flow.

Changing to v3 changes the contract address. v1/v2 UTXOs do not migrate automatically. Keep old artifacts and old claim interfaces available for actual deployed locks. No version was deployed by these changes; v2 was an intermediate local implementation, now superseded by v3. Never relabel old rewards as v3.

## Limited credit

`decideTransactionCredit` in the contracts package is the pure eligibility policy, not a live faucet. Development defaults:

- Planting grant: 8,000 sats, enough for the current 3,000-sat planting cost and a >=4,000-sat release funding UTXO.
- Release-only grant: 4,000 sats when needed.
- Daily authenticated-account cap: 16,000 sats including both confirmed grants and reservations.
- Grant only after account authentication and proof of possession of the app-wallet key. A locally supplied `verified: true` flag is not authentication; the server must establish it.
- Enforce a treasury-wide budget and fail closed when exhausted.
- Do not grant again when an unresolved grant exists or a usable UTXO already covers the operation. Evaluate actual plain BCH UTXOs, not total balance including tokens or already reserved coins.

The backend must execute account and global reservations atomically in a durable ledger, keyed by authenticated account and idempotency key, before preparing a transfer. A device-generated address alone is not an anti-abuse identity. Release reserves must not be consumed by new planting sessions.

Ambiguous broadcasts remain pending. Reconcile the recorded txid against the network; never generate and broadcast another grant automatically. Backend-supplied financial data is validated at the native boundary. The native signer must independently validate network, source outputs, allowed destinations, category/commitment, change, amounts, and fees before signing; never sign a bare digest or trust a requested transaction's title. The service and native signing integrations are now implemented in code; deployment and live financed validation remain outstanding.

## Delivery status

Implemented: native app/wallet creation and address setup; native garden presentation and read-only service adapter; v3 reward separation and rejection tests; pure bounded-credit policy and tests. Both mobile platforms can be bundled without importing browser wallet dependencies.

Code now implements account authentication/app-key proofs, a durable sponsor ledger, transaction preparation/reconciliation, and independent native BCH transaction validation/local signing. Still required for live funded sessions: authenticated-account provisioning, treasury and v3 baton provisioning, HTTPS deployment/public contract pins, external-wallet ownership linking, and chipnet tests through actual mined maturity. No backend URL, treasury credentials or external-wallet integration was supplied or provisioned. No funds were requested, moved, or represented as available.

Before mainnet: replace development fixed fees with fee estimation, determine recovery/lost-device policy for subsidized app wallets, configure anti-abuse controls and disclosure, and validate the complete flow with real wallets. Keep personal assets in the external wallet; the internal wallet is a limited operating wallet.

## Implementation update — 15 November 2026

`packages/service` and `packages/protocol` provide the executable bounded-credit and transaction path. The consolidated Expo client signs with the existing foundation or XO vault and retains the original shared island. The removed service doc covered configuration, persisted idempotency, BCH 2026 VM checks, MTP maturity, explicit recovery, and remaining release gates. The paragraphs above retain the original rules; their earlier “implemented” list is not a complete list of the new code. No financial transaction or live service deployment was performed.

## Functional Chipnet delivery update

The public-launch checkpoint was superseded by complete functional Chipnet delivery as the current priority. `testnetFunctionalReady=false` and `publicReleaseReady=false`. Current code adds own-node genesis/fork/confirmation authority, split bounded test-write capabilities, reorg-safe receipt/holding checks, persistent account/treasury controls, backups, dedicated test setup, and native on-chain session/offline/server-record recovery and protected wallet backups. The original on-device key, fixed external destination, original island and separate raw/XO vault requirements remain unchanged.

See the root release/work status. The earlier delivery paragraphs above are historical code checkpoints. Bounded tests with newly dedicated Chipnet identities/coins are now authorized through normal approvals, but no actual financial transaction has been executed here. The validating shared node capability and usable Android/iOS targets remain unavailable; Electrum observations and successful builds do not satisfy those gates.
