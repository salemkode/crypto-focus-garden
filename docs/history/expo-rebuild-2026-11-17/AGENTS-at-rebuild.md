# Focus Garden Next

This is a separate fork of https://github.com/salemkode/crypto-focus-garden.

- One Expo Router app at the repository root. No second web application.
- `src/app` composes feature code. Renderers must not import wallet, service or transaction modules.
- `packages/garden` owns deterministic valley geometry/layout; `packages/protocol` owns validated on-chain formats and policy.
- Contract source and compiled artifacts live in `packages/contracts`. Contract changes require compile + adversarial tests.
- Preserve explicit local/verified distinctions and all pending-operation/key recovery safeguards.
- Browser storage may hold local sessions and public addresses, never helper-wallet secrets.
- Mainnet deployment, store publication and financial policy changes need an explicit request.
- `main`/`master` are protected. Never merge, enable auto-merge, bypass hooks or push protected refs.
- Keep owned QA targets. This fork uses Metro 8183; original project Metro 8083 must remain untouched.
- No subagents or new top-level threads unless explicitly requested.
