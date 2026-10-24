# Local network setup and observed RPC gaps

## Start a disposable node

```sh
cd ../btcs-l2/execution/evm
npm ci
rm -rf /tmp/btcs-l2-wallet-datadir
npm run rpc -- --datadir /tmp/btcs-l2-wallet-datadir --port 8545 --dev-sequencer
```

Verified banner: `BTCSL2/v0.14-local/ethereumjs-vm-10.1.3/osaka`.
Verified chain ID: `31337` (`0x7a69`).

Use a fresh data directory for each experiment. The node is a development
prototype with a trusted single sequencer; do not reuse its data directory for
anything else.

## Funded genesis account

`btcs-l2/execution/evm/src/config.ts` funds one account in genesis:

- address: `0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a`
- balance: `10 000 BTCS`
- key: the documented development fixture `0x` + `11` × 32

The key is public test material. Import it into a browser wallet **only** for a
disposable local chain, or watch the address read-only. SilverPay itself never
asks for, reads, or stores it.

There is no faucet or funding RPC. This is a real gap: an ordinary injected
wallet account cannot receive local BTCS without either a transfer from the
genesis account or a new development funding method. Requested interface:
`btcs_dev_fund` (local-only, disabled unless `--dev-sequencer`) or a documented
genesis allocation mechanism for named test accounts.

## Browser access requires a proxy

The RPC binds to `127.0.0.1` and does **not** send
`Access-Control-Allow-Origin`. A page served from another origin cannot call it
directly. This repository's Vite dev/preview server proxies `/rpc` to the node.

For a static deployment, put the same reverse proxy in front of the node:

```text
https://wallet.example/        -> static dist/
https://wallet.example/rpc     -> http://127.0.0.1:8545 (POST only, loopback upstream)
```

Do not expose the RPC to the public internet: it has no authentication and
includes `btcs_dev_mine` when the sequencer is enabled.

## RPC methods the wallet relies on

| Method | Use |
| --- | --- |
| `web3_clientVersion` | `BTCSL2/` banner identity check |
| `eth_chainId`, `net_version` | chain identity |
| `eth_blockNumber`, `eth_getBlockByNumber` | height and bounded history |
| `eth_getBalance`, `eth_getTransactionCount` | balances and nonce |
| `eth_call`, `eth_estimateGas`, `eth_getCode` | ERC-20 reads and gas |
| `eth_getTransactionByHash`, `eth_getTransactionReceipt` | status and recovery |
| `btcs_dev_mine` | produce a block after a local submission |

## Observed gaps (integration requirements)

These are absent from `btcs-l2/execution/evm/src/rpc.ts` as of the verified
checkout. The wallet does not pretend they exist:

1. `eth_gasPrice`, `eth_feeHistory`, `eth_maxPriorityFeePerGas` — absent.
   The wallet derives an explicit EIP-1559 fee ceiling from the latest block's
   `baseFeePerGas`. Browser wallets may still call these methods themselves.
2. `eth_accounts`, `eth_requestAccounts`, `eth_sendTransaction` — absent. The
   node is not an account manager; signing is delegated to the injected wallet.
3. CORS headers / preflight handling — absent. Requires a reverse proxy.
4. A funding method (`btcs_dev_fund` or equivalent) — absent. Only the genesis
   fixture account holds funds.
5. Address history / indexed logs — absent. History is a bounded block scan.
6. `eth_syncing`, `eth_getBlockTransactionCount*` — absent.
7. The `pending` block tag — `eth_getTransactionCount(addr, "pending")` returns
   `-32602 Invalid params`. Browser wallets (and ethers v6) commonly use that
   tag for nonce lookup, so injected-wallet signing may fail even though the
   node accepts `eth_sendRawTransaction`. The wallet probes this and shows a
   compatibility warning. Requested change: accept `pending` as an alias for
   the current canonical/pool view, or document that wallets must use `latest`.

## Reproducible evidence

```sh
# identity and balance
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
  http://127.0.0.1:8545

# real transfer, signed by a test key outside the wallet
BTCS_L2_RPC_URL=http://127.0.0.1:8545 \
BTCS_L2_DEV_PRIVATE_KEY=0x1111...1111 npm run test:integration
```

The optional browser smoke check (`scripts/browser-smoke.mjs`) additionally
verifies identity, watch-only balance, validation, history, and persistence in
Chrome. It cannot verify injected-wallet signing; that remains manual.
