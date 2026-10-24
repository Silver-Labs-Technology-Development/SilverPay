/**
 * Real local-network integration checks.
 *
 * Skipped unless BTCS_L2_RPC_URL points at a disposable local BTCS L2 node.
 * The optional transfer case additionally requires BTCS_L2_DEV_PRIVATE_KEY,
 * the documented harness genesis key from btcs-l2 execution/evm/src/config.ts.
 * It must never be set for a public or real-value network.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { Wallet } from 'ethers'

import { BTCS_L2_LOCAL, createL2Client } from '../src/l2/client.js'
import { scanRecentActivity } from '../src/l2/history.js'
import { readToken } from '../src/wallet/assets.js'

const RPC_URL = process.env.BTCS_L2_RPC_URL
const DEV_KEY = process.env.BTCS_L2_DEV_PRIVATE_KEY
const enabled = Boolean(RPC_URL)

const FUNDED = '0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a'

function client() {
  return createL2Client({ endpoint: RPC_URL, timeoutMs: 10_000 })
}

async function rawRpc(method, params = []) {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const body = await response.json()
  if (body.error) throw new Error(`${method}: ${body.error.message}`)
  return body.result
}

test('live: identity, height, balance, and history against the local node', { skip: !enabled }, async () => {
  const l2 = client()
  const identity = await l2.verifyNetwork()
  assert.equal(identity.chainId, BTCS_L2_LOCAL.chainId)
  assert.ok(identity.clientVersion.startsWith('BTCSL2/'))

  const height = await l2.getBlockNumber()
  assert.equal(typeof height, 'bigint')

  const balance = await l2.getBalance(FUNDED)
  assert.ok(balance > 0n, 'the harness genesis account should be funded')

  const block = await l2.getBlock('latest', false)
  assert.equal(block.number, `0x${height.toString(16)}`)

  const history = await scanRecentActivity({ client: l2, address: FUNDED, maxBlocks: 5 })
  assert.equal(typeof history.indexed, 'boolean')

  const missing = await l2.getTransactionStatus(`0x${'00'.repeat(32)}`)
  assert.equal(missing.status, 'missing')
})

test('live: rejects a token address with no code', { skip: !enabled }, async () => {
  await assert.rejects(
    () => readToken(client(), '0x00000000000000000000000000000000000000aa', FUNDED),
    /No contract code/,
  )
})

test(
  'live: a real transfer is signed outside the wallet, submitted, mined, and receipted',
  { skip: !enabled || !DEV_KEY },
  async () => {
    const l2 = client()
    const signer = new Wallet(DEV_KEY)
    const recipient = '0x00000000000000000000000000000000000000ab'

    const latest = await l2.getBlock('latest', false)
    const baseFee = BigInt(latest.baseFeePerGas)
    const nonce = await l2.getTransactionCount(signer.address)
    const before = await l2.getBalance(recipient)

    const raw = await signer.signTransaction({
      to: recipient,
      value: 1_000_000_000_000_000n,
      gasLimit: 21_000n,
      maxFeePerGas: baseFee * 2n + 1_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      nonce: Number(nonce),
      chainId: Number(BTCS_L2_LOCAL.chainId),
      type: 2,
    })
    const hash = await rawRpc('eth_sendRawTransaction', [raw])
    assert.match(hash, /^0x[0-9a-f]{64}$/)

    const pending = await l2.getTransactionStatus(hash)
    assert.ok(['pending', 'missing', 'confirmed'].includes(pending.status))

    await l2.devMine()

    let status = await l2.getTransactionStatus(hash)
    for (let attempt = 0; attempt < 20 && status.status !== 'confirmed'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      status = await l2.getTransactionStatus(hash)
    }
    assert.equal(status.status, 'confirmed')
    assert.equal(await l2.getBalance(recipient), before + 1_000_000_000_000_000n)
  },
)
