# Current contracts

This package contains the current **FocusForest v5** and **FocusDirectory** CashScript contracts. Original Pomodoro/experimental contracts remain in Git history and are excluded from this build.

```sh
bun run contracts:compile
bun run test:contracts
```

Run these commands from the repository root after `bun install --frozen-lockfile`. The compiler is pinned to `cashc 0.13.0-next.1`. Artifacts contain the source, ABI and compiled ASM; `updatedAt` is deliberately fixed to the Unix epoch so repeated compilation is byte-for-byte deterministic. This timestamp is not a deployment date. Source and artifact SHA-256 values are recorded in [`docs/CONTRACT-HASHES.json`](../../docs/CONTRACT-HASHES.json).

`FocusForest.cash` keeps NFTs in the covenant until their owners claim them. Planting preserves the minting authority; the commitment binds owner, planter, stamp, delay, tier and species. Each merge input proves its own maturity; merge ingredients, owner/planter agreement, lineage and output are checked. `FocusDirectory.cash` validates profile registration and ownership. Read the complete source and 35 adversarial tests rather than treating this description as an audit.

The current sources are unchanged from the development source recorded in the fork provenance. Compilation/tests use local mocks and do not deploy, fund, create token categories or broadcast transactions. A real deployment needs the category, validated network agreement, operator configuration, independent security review and live acceptance. No mainnet readiness is claimed.

The tests use explicitly public deterministic fixtures. Those keys must never be funded or used as operational identities.
