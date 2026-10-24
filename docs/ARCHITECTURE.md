# SilverPay wallet architecture

## Canonical location

**The canonical SilverPay wallet application is this repository (`SilverPay`).**
The local workspace directory and the GitHub repository now use the same name.

Three SilverPay-related surfaces exist in the workspace:

| Surface | Location | Role |
| --- | --- | --- |
| Wallet application | this repository | Canonical wallet UI and send/receive flows. |
| Read-only SilverPay service | `btcs-l2/services/silverpay-service` | Loopback L1/L2 read gateway. No keys, signing, history, or payments. |
| Studio SilverPay page | `btcs-l2/studio` | Read-only L1 UTXO / L2 account status page. |

The `btcs-l2` copies are **not** duplicated here and are not deleted. They are
owned by the protocol repository and remain useful as a read-only operator
view. This repository is the only place a user-facing wallet with signing
should live. See
`silver-labs-platform/docs/decisions/0002-canonical-silverpay-app.md`.

## Modules

```text
index.html            static shell; every dynamic value is written with textContent
src/index.js          DOM wiring, state, rendering, event handling
src/l2/client.js      browser read client; schema v1 identity verification
src/l2/format.js      exact bigint formatting/parsing; no floating point
src/l2/history.js     bounded canonical-block scan (not an indexer)
src/wallet/assets.js  ERC-20 metadata/balance reads and transfer encoding
src/wallet/injected.js EIP-1193 adapter; connect, chain switch, send, events
src/wallet/send.js    preparation, fee ceiling, submission, confirmation
src/ui/forms.js       pure validation and display sanitisation
```

## Trust and security boundaries

- **Signing:** delegated to the injected wallet via `eth_sendTransaction`. The
  app has no key storage, no key input, and no signing code.
- **Reads:** direct JSON-RPC through the same-origin `/rpc` proxy, after
  identity verification. Reads never fall back to the injected wallet silently.
- **Identity:** chain ID `31337` and the `BTCSL2/` banner must both match. A
  mismatch is a hard error.
- **History:** bounded block scan. Absence of an entry is not proof of absence;
  inclusion is not finality.
- **Fees:** computed from the latest block base fee because the node lacks
  `eth_gasPrice` / `eth_feeHistory`. The maximum fee is shown before signing.
- **Development mining:** on the local profile the app calls `btcs_dev_mine`
  after submission so a receipt exists. This is labelled in the UI and must
  never be used on a public network.

## Data kept in the browser

`localStorage` under `silverpay.wallet.v1` stores only:

- a watch-only address (if the user chose watch mode), and
- tracked ERC-20 contract addresses.

No keys, signatures, seed phrases, or transaction history are stored.

## Why a local client port

`silver-labs-platform/packages/btcs-l2-client` is the canonical read contract,
but it is not published and declares `UNLICENSED`. Depending on a `file:` path
to a sibling checkout would break a standalone clone of this repository.
`src/l2/client.js` therefore implements the same v1 identity rules in the
browser and is covered by `tests/l2-client.test.mjs`, including a conformance
check against the platform schema when both checkouts are present.

Next step: publish a reviewed `@silver-labs/btcs-l2-client` with a browser
entry, then delete the port and import the package.

## Deliberate non-goals

- No mock success. There is no "demo mode" that fabricates balances or
  transactions. Tests use fakes; the app does not.
- No explorer. A minimal bounded block view belongs in Silver Scan or Studio,
  not in the wallet.
- No payment protocol. Payments require settlement and recipient-discovery
  design that does not exist yet.
