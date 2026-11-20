# Review package

The local `artifacts/review/` directory contains four separate handoff artifacts and `SHA256SUMS`:

- `focus-garden-next-source.tar.gz`: the committed application, packages, tests, lockfile and documentation. Dependencies, native build outputs, wallet data and credentials are excluded. Install from the lockfile and use the root README.
- `focus-garden-next-contracts.tar.gz`: current contract source/artifacts and their hash/provenance documents for focused inspection. Use the full source workspace to run tests; the contract package shares protocol code.
- `focus-garden-next.bundle`: the task branch and its complete original Git ancestry for offline inspection. Clone with `git clone -b feat/expo-rebuild focus-garden-next.bundle focus-garden-review`.
- `focus-garden-next-evidence.zip`: the recordings, logs and evidence manifest described in VERIFICATION. It includes diagnostic failures as well as successful checkpoints. It contains no operational wallet data or credentials.

`SOURCE-COMMIT.txt` identifies the exact Git commit archived. Check the SHA-256 manifest before distributing these files. The GitHub task branch contains the same committed source; the draft comparison PR shows original `main` → `feat/expo-rebuild` and is left unmerged for the user's review.

Start with ARCHITECTURE, the two `.cash` sources, protocol transaction policy, native signing/recovery, and the service ledger. VERIFICATION separates completed checks from the live-chain, financial-policy, browser-signing and distribution work still needed. This is not an independently audited production release.
