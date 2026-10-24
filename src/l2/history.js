/**
 * Bounded, honest transaction history.
 *
 * The local BTCS L2 node has no address index and no
 * eth_getBlockTransactionCount* method. History is therefore produced by
 * scanning a bounded number of canonical blocks with
 * `eth_getBlockByNumber(n, true)` and filtering locally.
 *
 * This is not an indexer and not an explorer:
 *  - it only sees the last `maxBlocks` blocks,
 *  - a missing entry does not prove a transaction does not exist,
 *  - an entry in a canonical block is not a finality or settlement claim,
 *  - ERC-20 transfer logs are not indexed here.
 *
 * The UI must show the scanned range and the truncation flag.
 */

import { fromQuantity } from './format.js'

export const DEFAULT_HISTORY_BLOCKS = 25
export const MAX_HISTORY_BLOCKS = 200

function normalizeAddress(value) {
  return typeof value === 'string' ? value.toLowerCase() : null
}

function transactionEntry(tx, block) {
  const value = fromQuantity(tx.value)
  const blockNumber = fromQuantity(tx.blockNumber) ?? fromQuantity(block.number)
  return Object.freeze({
    hash: tx.hash,
    from: typeof tx.from === 'string' ? tx.from.toLowerCase() : null,
    to: typeof tx.to === 'string' ? tx.to.toLowerCase() : null,
    value: value ?? 0n,
    blockNumber: blockNumber ?? 0n,
    transactionIndex: fromQuantity(tx.transactionIndex),
    // Inclusion in a canonical block. Not finality, not settlement.
    state: 'included',
  })
}

/**
 * @param {object} options
 * @param {ReturnType<import('./client.js').createL2Client>} options.client
 * @param {string} options.address
 * @param {number} [options.maxBlocks]
 * @param {(progress: {blockNumber: bigint, remaining: number}) => void} [options.onProgress]
 */
export async function scanRecentActivity({ client, address, maxBlocks = DEFAULT_HISTORY_BLOCKS, onProgress }) {
  if (typeof address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new TypeError('A valid 20-byte address is required to scan activity')
  }
  if (!Number.isInteger(maxBlocks) || maxBlocks < 1 || maxBlocks > MAX_HISTORY_BLOCKS) {
    throw new RangeError(`maxBlocks must be an integer from 1 through ${MAX_HISTORY_BLOCKS}`)
  }
  const wanted = normalizeAddress(address)
  const tip = await client.getBlockNumber()
  const lowest = tip >= BigInt(maxBlocks - 1) ? tip - BigInt(maxBlocks - 1) : 0n
  const entries = []
  let scanned = 0

  for (let number = tip; number >= lowest; number -= 1n) {
    const block = await client.getBlock(number, true)
    scanned += 1
    if (block !== null) {
      for (const tx of block.transactions) {
        if (typeof tx !== 'object' || tx === null) continue
        const from = normalizeAddress(tx.from)
        const to = normalizeAddress(tx.to)
        if (from !== wanted && to !== wanted) continue
        entries.push(transactionEntry(tx, block))
      }
    }
    onProgress?.({ blockNumber: number, remaining: Number(number - lowest) })
    if (number === 0n) break
  }

  entries.sort((a, b) => {
    if (a.blockNumber === b.blockNumber) {
      return (b.transactionIndex ?? 0n) > (a.transactionIndex ?? 0n) ? 1 : -1
    }
    return a.blockNumber > b.blockNumber ? -1 : 1
  })

  return Object.freeze({
    entries: Object.freeze(entries),
    scannedBlocks: scanned,
    fromBlock: lowest,
    toBlock: tip,
    truncated: tip + 1n > BigInt(scanned),
    indexed: false,
    note: `Scanned the last ${scanned} canonical block${scanned === 1 ? '' : 's'}. This local view is not an indexer, and inclusion is not finality.`,
  })
}
