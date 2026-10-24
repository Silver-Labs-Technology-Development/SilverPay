# Contributing

## Before you start

- This is a local development prototype, not a production wallet. Do not add
  real-value networks, custody, or payment features without an approved design.
- Read `docs/ARCHITECTURE.md`, `docs/LOCAL-NETWORK.md`, and `SECURITY.md`.
- Do not add seed-phrase or private-key input, storage, or generation. Signing
  belongs to the injected wallet.
- Do not add a mock mode that shows fabricated balances or successful
  transactions in the application. Test fakes belong in `tests/`.

## Workflow

```sh
npm ci
npm test
npm run build
```

For a change that touches reads, sending, or identity, also run against a
disposable local node:

```sh
BTCS_L2_RPC_URL=http://127.0.0.1:8545 npm run test:integration
```

State which commands you ran and their exact results in the pull request. A
green unit test does not prove a live-network flow.

## Rules

- Keep changes small and focused.
- Add or update tests with the code. Do not weaken or delete a test to get a
  pass; explain the root cause instead.
- Never commit `.env` files, keys, seed phrases, wallet data, chain databases,
  `node_modules/`, or `dist/`.
- Do not add a dependency without checking its license and necessity.
- Preserve the non-custodial boundary and the explicit unsupported-feature
  messaging.
- Do not claim production readiness, finality, or a complete wallet.

## Commit style

One coherent change per commit. Say what was run in the message body, for
example:

```text
Add bounded block history scan

Tests: npm test (69 pass), npm run build
Live: BTCS_L2_RPC_URL=... npm run test:integration (3 pass)
```
