/**
 * Transaction preparation, submission, and confirmation.
 *
 * Fee fields are computed from the latest canonical block's base fee because
 * the local BTCS L2 node does not implement eth_gasPrice or eth_feeHistory.
 * Signing is delegated to the injected wallet; this module never sees a key.
 */

import { BTCS_L2_LOCAL } from '../l2/client.js'
import { isEvmAddress, fromQuantity, formatUnits } from '../l2/format.js'
import { encodeErc20Transfer } from './assets.js'

export const DEFAULT_PRIORITY_FEE_PER_GAS = 1_000_000_000n // 1 gwei
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
export const CONFIRMATION_TIMEOUT_MS = 120_000
export const CONFIRMATION_POLL_MS = 1_500

export class TransferError extends Error {
  constructor(message, { code = 'transfer_error', hint = '', cause } = {}) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = new.target.name
    this.code = code
    this.hint = hint
  }
}

/**
 * Build EIP-1559 fee fields from a base fee. Doubling the base fee leaves room
 * for several blocks of base-fee movement while keeping the cap explicit.
 */
export function buildFeeFields(baseFeePerGas, { priorityFeePerGas = DEFAULT_PRIORITY_FEE_PER_GAS } = {}) {
  if (typeof baseFeePerGas !== 'bigint' || baseFeePerGas < 0n) {
    throw new TypeError('baseFeePerGas must be a non-negative bigint')
  }
  if (typeof priorityFeePerGas !== 'bigint' || priorityFeePerGas < 0n) {
    throw new TypeError('priorityFeePerGas must be a non-negative bigint')
  }
  return Object.freeze({
    maxPriorityFeePerGas: priorityFeePerGas,
    maxFeePerGas: baseFeePerGas * 2n + priorityFeePerGas,
  })
}

export function validateRecipient(value) {
  const recipient = typeof value === 'string' ? value.trim() : ''
  if (!isEvmAddress(recipient)) {
    throw new TransferError(
      'Enter a recipient address as 0x followed by 40 hexadecimal characters.',
      { code: 'invalid_recipient', hint: 'Copy the address from the receiving wallet and check every character.' },
    )
  }
  if (recipient.toLowerCase() === ZERO_ADDRESS) {
    throw new TransferError('The zero address cannot receive funds.', {
      code: 'zero_address',
      hint: 'Tokens sent to 0x000…000 are unrecoverable.',
    })
  }
  return recipient
}

function baseFeeFromBlock(block) {
  if (block === null || typeof block !== 'object') {
    throw new TransferError('The node returned no latest block, so a fee cannot be computed.', {
      code: 'no_block',
      hint: 'Check that the local BTCS L2 node is running and try again.',
    })
  }
  const baseFee = fromQuantity(block.baseFeePerGas)
  if (baseFee === null) {
    throw new TransferError('The latest block does not report a base fee; EIP-1559 fees cannot be prepared.', {
      code: 'no_base_fee',
      hint: 'This wallet only sends EIP-1559 transactions on the BTCS L2 local profile.',
    })
  }
  return baseFee
}

async function requireBalance({ client, address, minimum, symbol }) {
  const balance = await client.getBalance(address)
  if (balance < minimum) {
    throw new TransferError(
      `Insufficient ${symbol} for this transaction. The maximum cost is ${formatUnits(minimum, 18)} ${symbol}; the account holds ${formatUnits(balance, 18)} ${symbol}.`,
      {
        code: 'insufficient_funds',
        hint: 'On the local development chain only the harness genesis account is funded. See docs/LOCAL-NETWORK.md.',
      },
    )
  }
  return balance
}

/**
 * Prepare a native BTCS transfer. Returns a review object; nothing is signed.
 */
export async function prepareNativeTransfer({ client, from, to, amount, priorityFeePerGas }) {
  if (typeof amount !== 'bigint' || amount <= 0n) {
    throw new TransferError('Enter an amount greater than zero.', { code: 'invalid_amount' })
  }
  const recipient = validateRecipient(to)
  const latest = await client.getBlock('latest', false)
  const fees = buildFeeFields(baseFeeFromBlock(latest), { priorityFeePerGas })
  const gasLimit = await client.estimateGas({ from, to: recipient, value: amount })
  const maximumCost = amount + gasLimit * fees.maxFeePerGas
  await requireBalance({ client, address: from, minimum: maximumCost, symbol: 'BTCS' })

  return Object.freeze({
    kind: 'native',
    chainId: Number(BTCS_L2_LOCAL.chainId),
    from,
    to: recipient,
    value: amount,
    data: '0x',
    gasLimit,
    ...fees,
    expectedMaxFee: gasLimit * fees.maxFeePerGas,
  })
}

/**
 * Prepare an ERC-20 transfer. `tokenBalance` is required so the wallet can
 * fail before asking for a signature.
 */
export async function prepareTokenTransfer({ client, from, to, amount, tokenAddress, tokenSymbol, tokenDecimals, tokenBalance }) {
  if (typeof amount !== 'bigint' || amount <= 0n) {
    throw new TransferError('Enter an amount greater than zero.', { code: 'invalid_amount' })
  }
  if (typeof tokenBalance !== 'bigint') {
    throw new TransferError('The token balance is not loaded yet.', { code: 'missing_balance' })
  }
  if (amount > tokenBalance) {
    throw new TransferError(
      `Insufficient ${tokenSymbol ?? 'token'} balance. The transfer needs ${formatUnits(amount, tokenDecimals)} but the account holds ${formatUnits(tokenBalance, tokenDecimals)}.`,
      { code: 'insufficient_token_balance' },
    )
  }
  const recipient = validateRecipient(to)
  const data = encodeErc20Transfer(recipient, amount)
  const latest = await client.getBlock('latest', false)
  const fees = buildFeeFields(baseFeeFromBlock(latest))
  const gasLimit = await client.estimateGas({ from, to: tokenAddress, data })
  const maximumCost = gasLimit * fees.maxFeePerGas
  await requireBalance({ client, address: from, minimum: maximumCost, symbol: 'BTCS' })

  return Object.freeze({
    kind: 'erc20',
    chainId: Number(BTCS_L2_LOCAL.chainId),
    from,
    to: tokenAddress,
    recipient,
    value: 0n,
    data,
    gasLimit,
    tokenSymbol: tokenSymbol ?? 'TOKEN',
    tokenDecimals: tokenDecimals ?? 18,
    tokenAmount: amount,
    ...fees,
    expectedMaxFee: maximumCost,
  })
}

/** Submit a prepared transfer through the injected wallet. */
export async function submitTransfer({ wallet, prepared }) {
  const hash = await wallet.sendTransaction({
    from: prepared.from,
    to: prepared.to,
    value: prepared.value,
    data: prepared.data,
    gasLimit: prepared.gasLimit,
    maxFeePerGas: prepared.maxFeePerGas,
    maxPriorityFeePerGas: prepared.maxPriorityFeePerGas,
  })
  return hash
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Poll for a receipt. On the local development sequencer a submitted
 * transaction stays pending until a block is produced, so `mine` asks the
 * node's `btcs_dev_mine` method for one block. That call is development-only
 * and must be labelled as such in the UI.
 */
export async function confirmTransaction({
  client,
  hash,
  mine = false,
  timeoutMs = CONFIRMATION_TIMEOUT_MS,
  pollMs = CONFIRMATION_POLL_MS,
  onUpdate,
  sleepImpl = sleep,
  now = () => Date.now(),
}) {
  const started = now()
  let mined = false
  let lastStatus = 'pending'
  onUpdate?.({ status: 'pending', hash })

  while (now() - started < timeoutMs) {
    let status
    try {
      status = await client.getTransactionStatus(hash)
    } catch (error) {
      onUpdate?.({ status: 'error', hash, error })
      throw error
    }
    lastStatus = status.status
    onUpdate?.({ status: status.status, hash, blockNumber: status.blockNumber })

    if (status.status === 'confirmed' || status.status === 'reverted') {
      return Object.freeze({ ...status, hash, mined })
    }
    if (status.status === 'missing') {
      // A brand-new transaction can be briefly absent while the wallet
      // forwards it. Give it a few polls before calling it lost.
      if (now() - started > Math.min(timeoutMs, 15_000)) {
        throw new TransferError(
          'The node has no record of this transaction. It may have been dropped, or the wallet may be pointed at a different node.',
          {
            code: 'transaction_missing',
            hint: 'Confirm the wallet network is the local BTCS L2 node, then re-check the hash.',
          },
        )
      }
    }
    if (mine && !mined && (status.status === 'pending' || status.status === 'missing')) {
      try {
        await client.devMine()
        mined = true
      } catch (error) {
        onUpdate?.({ status: 'mine_failed', hash, error })
        throw new TransferError(
          'The transaction was submitted but the development sequencer refused to produce a block.',
          {
            code: 'mine_failed',
            hint: 'Start the local node with --dev-sequencer, then re-check the transaction hash.',
            cause: error,
          },
        )
      }
    }
    await sleepImpl(pollMs)
  }

  throw new TransferError(
    `No receipt after ${Math.round(timeoutMs / 1000)} s (last status: ${lastStatus}). The transaction may still be pending.`,
    {
      code: 'confirmation_timeout',
      hint: 'Keep the hash and re-check it later. A missing receipt is not proof that the transaction was never submitted.',
    },
  )
}

/** Turn any thrown value into a message the UI can show safely. */
export function describeTransferError(error) {
  if (error instanceof TransferError) {
    return { message: error.message, hint: error.hint, code: error.code }
  }
  const message = typeof error?.message === 'string' ? error.message : 'The transaction failed.'
  return { message, hint: 'Nothing was retried automatically. Review the wallet prompt and try again.', code: error?.code ?? 'unknown' }
}
