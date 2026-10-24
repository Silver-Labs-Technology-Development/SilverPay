# Security policy

## Scope

This repository is a **local development prototype** of the SilverPay wallet.
It is not a production wallet, does not hold funds, and is not authorized for
real-value use.

## Security boundaries

- The application never requests, stores, logs, or transmits a private key or
  seed phrase.
- Signing is delegated to an injected EIP-1193 wallet. The app only prepares a
  transaction and displays the wallet's result.
- Reads go to a same-origin `/rpc` proxy that must forward only to a loopback
  BTCS L2 node. Do not expose the node publicly: it has no authentication and
  includes development mining when started with `--dev-sequencer`.
- Network identity is enforced (chain ID `31337` plus the `BTCSL2/` banner)
  before balances are displayed or a transaction is prepared.
- The only persisted browser data is a watch-only address and tracked token
  contract addresses, under `silverpay.wallet.v1`.

## Known limitations

- No independent security audit.
- No finality or settlement guarantee; a receipt only proves inclusion in a
  local canonical block.
- The development sequencer is trusted and single-operator.
- No protection against a compromised browser extension, a malicious RPC
  proxy, or a hostile local node. Such a node can lie about balances and
  receipts.
- Token metadata (`name`, `symbol`, `decimals`) is untrusted contract output and
  is sanitised for display but not verified.

## Reporting

Do not open a public issue for a vulnerability. Report it privately to the
Silver Labs repository owner through GitHub's private vulnerability reporting
on <https://github.com/Silver-Labs-Technology-Development/silver-wallet> if it
is enabled, or contact the organization owner directly. Do not include secrets,
keys, or live wallet data in a report.

There is no bug-bounty program and no response-time commitment.
