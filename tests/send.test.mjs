import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_PRIORITY_FEE_PER_GAS,
  TransferError,
  buildFeeFields,
  confirmTransaction,
  describeTransferError,
  prepareNativeTransfer,
  prepareTokenTransfer,
  submitTransfer,
  validateRecipient,
} from '../src/wallet/send.js'

const USER = '0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a'
const RECIPIENT = '0x00000000000000000000000000000000000000aa'
const TOKEN = '0x1111111111111111111111111111111111111111'
const ONE_GWEI = 1_000_000_000n

function fakeClient(overrides = {}) {
  return {
    async getBlock() {
      return { baseFeePerGas: `0x${ONE_GWEI.toString(16)}` }
    },
    async estimateGas() {
      return 21_000n
    },
    async getBalance() {
      return 10n ** 20n
    },
    async getTransactionStatus() {
      return { status: 'pending' }
    },
    async devMine() {
      return { number: '0x1' }
    },
    ...overrides,
  }
}

test('builds explicit EIP-1559 fee fields from the base fee', () => {
  const fees = buildFeeFields(ONE_GWEI)
  assert.equal(fees.maxPriorityFeePerGas, DEFAULT_PRIORITY_FEE_PER_GAS)
  assert.equal(fees.maxFeePerGas, 3n * ONE_GWEI)
  assert.ok(Object.isFrozen(fees))
  assert.throws(() => buildFeeFields(-1n), TypeError)
})

test('validates recipients including the zero address', () => {
  assert.equal(validateRecipient(` ${RECIPIENT} `), RECIPIENT)
  assert.throws(() => validateRecipient('0x123'), TransferError)
  assert.throws(
    () => validateRecipient('0x0000000000000000000000000000000000000000'),
    /zero address/,
  )
})

test('prepares a native transfer with a fee ceiling and no signing', async () => {
  const prepared = await prepareNativeTransfer({
    client: fakeClient(),
    from: USER,
    to: RECIPIENT,
    amount: 10n ** 18n,
  })
  assert.equal(prepared.kind, 'native')
  assert.equal(prepared.value, 10n ** 18n)
  assert.equal(prepared.gasLimit, 21_000n)
  assert.equal(prepared.maxFeePerGas, 3n * ONE_GWEI)
  assert.equal(prepared.expectedMaxFee, 63_000n * ONE_GWEI)
  assert.equal(prepared.data, '0x')
})

test('refuses a native transfer that cannot cover amount plus fee', async () => {
  await assert.rejects(
    () =>
      prepareNativeTransfer({
        client: fakeClient({ getBalance: async () => 10n ** 18n }),
        from: USER,
        to: RECIPIENT,
        amount: 10n ** 18n,
      }),
    (error) => error instanceof TransferError && error.code === 'insufficient_funds',
  )
})

test('refuses to prepare when the node has no base fee', async () => {
  await assert.rejects(
    () =>
      prepareNativeTransfer({
        client: fakeClient({ getBlock: async () => ({ baseFeePerGas: undefined }) }),
        from: USER,
        to: RECIPIENT,
        amount: 1n,
      }),
    /base fee/,
  )
})

test('prepares an ERC-20 transfer and checks the token balance', async () => {
  const prepared = await prepareTokenTransfer({
    client: fakeClient(),
    from: USER,
    to: RECIPIENT,
    amount: 5n,
    tokenAddress: TOKEN,
    tokenSymbol: 'SLVT',
    tokenDecimals: 6,
    tokenBalance: 10n,
  })
  assert.equal(prepared.kind, 'erc20')
  assert.equal(prepared.to, TOKEN)
  assert.equal(prepared.recipient, RECIPIENT)
  assert.equal(prepared.value, 0n)
  assert.match(prepared.data, /^0xa9059cbb/)

  await assert.rejects(
    () =>
      prepareTokenTransfer({
        client: fakeClient(),
        from: USER,
        to: RECIPIENT,
        amount: 11n,
        tokenAddress: TOKEN,
        tokenSymbol: 'SLVT',
        tokenDecimals: 6,
        tokenBalance: 10n,
      }),
    (error) => error.code === 'insufficient_token_balance',
  )
})

test('submits through the injected wallet with explicit fee fields', async () => {
  let sent
  const wallet = {
    async sendTransaction(tx) {
      sent = tx
      return `0x${'ab'.repeat(32)}`
    },
  }
  const hash = await submitTransfer({
    wallet,
    prepared: {
      from: USER,
      to: RECIPIENT,
      value: 1n,
      data: '0x',
      gasLimit: 21_000n,
      maxFeePerGas: 3n * ONE_GWEI,
      maxPriorityFeePerGas: ONE_GWEI,
    },
  })
  assert.equal(hash, `0x${'ab'.repeat(32)}`)
  assert.equal(sent.gasLimit, 21_000n)
  assert.equal(sent.maxFeePerGas, 3n * ONE_GWEI)
})

function clock(start = 0) {
  let value = start
  return {
    now: () => value,
    sleep: async (ms) => {
      value += ms
    },
  }
}

test('confirms after the development sequencer mines a block', async () => {
  let calls = 0
  const updates = []
  const fake = clock()
  const client = fakeClient({
    async getTransactionStatus() {
      calls += 1
      return calls < 3 ? { status: 'pending' } : { status: 'confirmed', blockNumber: 7n }
    },
  })
  const result = await confirmTransaction({
    client,
    hash: `0x${'ab'.repeat(32)}`,
    mine: true,
    now: fake.now,
    sleepImpl: fake.sleep,
    onUpdate: (update) => updates.push(update.status),
  })
  assert.equal(result.status, 'confirmed')
  assert.equal(result.blockNumber, 7n)
  assert.equal(result.mined, true)
  assert.deepEqual(updates.slice(0, 2), ['pending', 'pending'])
})

test('reports a reverted transaction without pretending success', async () => {
  const fake = clock()
  const result = await confirmTransaction({
    client: fakeClient({
      async getTransactionStatus() {
        return { status: 'reverted', blockNumber: 3n }
      },
    }),
    hash: `0x${'ab'.repeat(32)}`,
    mine: false,
    now: fake.now,
    sleepImpl: fake.sleep,
  })
  assert.equal(result.status, 'reverted')
})

test('gives up on a missing transaction after a grace period', async () => {
  const fake = clock()
  await assert.rejects(
    () =>
      confirmTransaction({
        client: fakeClient({ getTransactionStatus: async () => ({ status: 'missing' }) }),
        hash: `0x${'ab'.repeat(32)}`,
        mine: false,
        now: fake.now,
        sleepImpl: fake.sleep,
      }),
    (error) => error.code === 'transaction_missing',
  )
})

test('times out a transaction that stays pending', async () => {
  const fake = clock()
  await assert.rejects(
    () =>
      confirmTransaction({
        client: fakeClient(),
        hash: `0x${'ab'.repeat(32)}`,
        mine: false,
        timeoutMs: 10_000,
        pollMs: 1_000,
        now: fake.now,
        sleepImpl: fake.sleep,
      }),
    (error) => error.code === 'confirmation_timeout',
  )
})

test('explains a sequencer that refuses to mine', async () => {
  const fake = clock()
  await assert.rejects(
    () =>
      confirmTransaction({
        client: fakeClient({
          async devMine() {
            throw new Error('Method not found')
          },
        }),
        hash: `0x${'ab'.repeat(32)}`,
        mine: true,
        now: fake.now,
        sleepImpl: fake.sleep,
      }),
    (error) => error.code === 'mine_failed',
  )
})

test('describes unknown errors without leaking a stack', () => {
  const described = describeTransferError(new Error('boom'))
  assert.equal(described.message, 'boom')
  assert.match(described.hint, /Nothing was retried/)
})
