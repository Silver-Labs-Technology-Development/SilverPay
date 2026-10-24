# SilverPay Wallet

SilverPay is one product encompassing the wallet and payment services. This
repository contains the browser wallet application and its account/asset views.

**Current status:** prototype. The wallet can connect to an injected EVM
wallet, show a native BTCS balance, and read ERC-20 balances and NFT metadata
from a local BTCS L2 development node (`chainId: 31337`). Payment processing,
transaction signing flows, persistence, and production network support are not
implemented.

## Requirements

- Node.js 20.18.0 or newer
- A browser with an injected EVM wallet for live use
- An isolated local BTCS L2 RPC at `http://127.0.0.1:8545` for live balance
  checks

## Install and run

```sh
npm ci
npm test
npm run build
npm run dev
```

Open the Vite URL (normally <http://127.0.0.1:5173/>). The production build is
written to `dist/`.

## Tests

```sh
npm test
```

The unit tests cover network configuration, display formatting, and the Vite
entry point. They do not connect to a real wallet or chain. All live RPC checks
must be performed against a disposable local development node.

## Security and scope

- The app never asks for or stores a private key or seed phrase. Signing is
  delegated to the injected wallet.
- The only configured network is the local BTCS L2 development profile. It is
  not a public network, and no real-value payment or custody service is
  provided.
- The current UI is a read-only foundation. Do not treat it as a production
  wallet.

## Repository

<https://github.com/Silver-Labs-Technology-Development/silver-wallet>
