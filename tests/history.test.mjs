import assert from 'node:assert/strict'
import test from 'node:test'

import { scanRecentActivity, DEFAULT_HISTORY_BLOCKS, MAX_HISTORY_BLOCKS } from '../src/l2/history.js'

const USER = '0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a'
const OTHER = '0x00000000000000000000000000000000000000aa'

function tx(hashByte, from, to, value) {
  return {
    hash: `0x${String(hashByte).padStart(2, '0').repeat(32)}`,
    from,
    to,
    value: `0x${value.toString(16)}`,
    blockNumber: null,
    transactionIndex: '0x0',
  }
}

function fakeClient(blocks) {
  const tip = BigInt(blocks.length - 1)
  return {
    async getBlockNumber() {
      return tip
    },
    async getBlock(reference) {
      const index = Number(reference)
      return blocks[index] ?? null
    },
  }
}

test('filters a bounded block scan by from/to address', async () => {
  const blocks = [
    { number: '0x0', transactions: [] },
    { number: '0x1', transactions: [tx(1, OTHER, USER, 5n)] },
    { number: '0x2', transactions: [tx(2, USER, OTHER, 7n), tx(3, OTHER, OTHER, 1n)] },
  ]
  const result = await scanRecentActivity({ client: fakeClient(blocks), address: USER, maxBlocks: 10 })
  assert.equal(result.entries.length, 2)
  assert.equal(result.entries[0].blockNumber, 2n)
  assert.equal(result.entries[0].value, 7n)
  assert.equal(result.entries[1].blockNumber, 1n)
  assert.equal(result.entries[0].state, 'included')
  assert.equal(result.indexed, false)
  assert.equal(result.scannedBlocks, 3)
  assert.match(result.note, /not an indexer/)
})

test('reports truncation when the scan is smaller than the chain', async () => {
  const blocks = Array.from({ length: 10 }, (_, index) => ({ number: `0x${index.toString(16)}`, transactions: [] }))
  const result = await scanRecentActivity({ client: fakeClient(blocks), address: USER, maxBlocks: 3 })
  assert.equal(result.fromBlock, 7n)
  assert.equal(result.toBlock, 9n)
  assert.equal(result.scannedBlocks, 3)
  assert.equal(result.truncated, true)
  assert.equal(result.entries.length, 0)
})

test('handles a genesis-only chain and empty results', async () => {
  const result = await scanRecentActivity({
    client: fakeClient([{ number: '0x0', transactions: [] }]),
    address: USER,
    maxBlocks: 25,
  })
  assert.equal(result.scannedBlocks, 1)
  assert.equal(result.entries.length, 0)
  assert.equal(result.truncated, false)
})

test('validates address and scan bounds before reading blocks', async () => {
  const client = fakeClient([{ number: '0x0', transactions: [] }])
  await assert.rejects(() => scanRecentActivity({ client, address: '0x123' }), TypeError)
  await assert.rejects(() => scanRecentActivity({ client, address: USER, maxBlocks: 0 }), RangeError)
  await assert.rejects(
    () => scanRecentActivity({ client, address: USER, maxBlocks: MAX_HISTORY_BLOCKS + 1 }),
    RangeError,
  )
  assert.ok(DEFAULT_HISTORY_BLOCKS > 0)
})
