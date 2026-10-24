# SilverPay

SilverPay is the Silver Labs wallet and payment product. This repository is the
**wallet application** (`SilverPay` on GitHub; the local workspace directory is
also `SilverPay/`). Payment processing is a later phase and is not implemented.

**Status: local development prototype.** The wallet reads and writes against a
disposable local BTCS L2 development node (chain ID `31337`, `BTCSL2/` client
banner). There is no public network, real-value network, custody service, or
production approval.

## What works

- **Network identity** — verifies chain ID `31337` and the `BTCSL2/` client
  banner before showing balances. A different chain or a missing banner is an
  explicit error, not a warning.
- **Account display** — connect an injected EVM wallet, or watch any address
  read-only. Addresses can be copied; no key material is ever requested.
- **Balances** — native BTCS balance plus any ERC-20 token you track by
  contract address.
- **Send** — native BTCS and ERC-20 transfers, prepared locally, reviewed, then
  signed by the injected wallet. Includes insufficient-funds, wrong-network,
  rejected-signature, reverted, pending, and missing-transaction states.
- **Receive** — displays and copies the active address.
- **History** — a bounded scan of recent canonical blocks, labelled as a scan
  rather than an indexer.
- **Recovery** — a submitted hash can be re-checked; a missing receipt is never
  reported as a failed transaction.
- **Accessibility** — labelled inputs, live regions, keyboard focus styles, and
  a responsive single-column layout.

## Not implemented

- Networks other than the local BTCS L2 development chain.
- NFT display, token deployment, swaps, payments, and payment requests.
- Seed-phrase or private-key import/generation, account recovery, address books.
- Full address history, token/NFT indexing, finality, or settlement guarantees.
- Multi-account management beyond what the injected wallet exposes.

## Requirements

- Node.js `>=20.18.0` (verified with 24.17.0) and npm.
- A browser with an injected EIP-1193 wallet (for sending).
- A disposable local BTCS L2 node for live reads and writes:

  ```sh
  cd ../btcs-l2/execution/evm
  npm ci
  npm run rpc -- --datadir /tmp/btcs-l2-wallet-datadir --port 8545 --dev-sequencer
  ```

  `--dev-sequencer` enables `eth_sendRawTransaction` and `btcs_dev_mine`. Without
  it the node is read-only and the wallet's send flow will fail with a clear
  sequencer error.

## Install, run, test

```sh
npm ci
npm test            # unit + mocked integration tests
npm run build       # production bundle in dist/
npm run dev         # http://127.0.0.1:5173
```

Optional real local-network checks (read paths always; the transfer case needs
the documented harness genesis key from
`btcs-l2/execution/evm/src/config.ts`):

```sh
BTCS_L2_RPC_URL=http://127.0.0.1:8545 npm run test:integration
BTCS_L2_RPC_URL=http://127.0.0.1:8545 \
BTCS_L2_DEV_PRIVATE_KEY=0x1111...1111 npm run test:integration
```

The integration test signs **outside** the wallet with a test-only key. The
wallet application itself never receives a key.

## Why `/rpc` and not `127.0.0.1:8545`?

The BTCS L2 RPC does not send CORS headers, so a browser page cannot call it
cross-origin. The Vite dev and preview servers proxy `/rpc` to
`http://127.0.0.1:8545` (override with `BTCS_L2_RPC_URL`). A static deployment
needs the same reverse proxy; `dist/` alone cannot reach the node. See
[`docs/LOCAL-NETWORK.md`](docs/LOCAL-NETWORK.md).

The injected wallet must also be configured for chain `31337` with RPC
`http://127.0.0.1:8545`. The app offers to add/switch the network through
`wallet_addEthereumChain` / `wallet_switchEthereumChain`.

## A funded account on the local chain

The local harness funds exactly one genesis account, derived from the
documented development key in `btcs-l2/execution/evm/src/config.ts`. That key is
a public test fixture, not a secret, and it must only be used on a disposable
local chain. To exercise sending, import it into your browser wallet yourself
(or send funds to an account your wallet already controls once a faucet
exists). SilverPay never asks for it and never stores it.

## Architecture and scope

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — modules, boundaries, and the
  canonical SilverPay location decision.
- [`docs/LOCAL-NETWORK.md`](docs/LOCAL-NETWORK.md) — node, proxy, funded account,
  and known RPC gaps.
- [`docs/whitepapers/SilverPay-Whitepaper-v1-draft.pdf`](docs/whitepapers/SilverPay-Whitepaper-v1-draft.pdf)
  — historical product whitepaper draft (not an implementation statement).
- [`SECURITY.md`](SECURITY.md) — threat model and reporting.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contribution rules.

The read client in `src/l2/client.js` is a deliberately small browser port of
`silver-labs-platform/packages/btcs-l2-client` (schema v1). It exists because
the platform package is not published to a registry and this repository must
stay cloneable on its own. A conformance test compares the constants with the
platform schema when that checkout is present.

## License

No open-source license is granted. See [`LICENSE`](LICENSE). The repository is
public for review and development, not for reuse or redistribution.

## Repository

<https://github.com/Silver-Labs-Technology-Development/SilverPay>
