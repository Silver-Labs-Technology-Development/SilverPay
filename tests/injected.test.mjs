import assert from 'node:assert/strict'
import test from 'node:test'

import {
  WALLET_ERROR_CODES,
  WalletError,
  createInjectedWallet,
  detectInjectedProvider,
  normalizeWalletError,
} from '../src/wallet/injected.js'

const ACCOUNT = '0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a'
const HASH = `0x${'ab'.repeat(32)}`

function fakeEthereum(handler) {
  const calls = []
  const listeners = new Map()
  return {
    calls,
    async request({ method, params }) {
      calls.push({ method, params })
      return handler(method, params)
    },
    on(event, handler) {
      listeners.set(event, handler)
    },
    removeListener(event, handler) {
      if (listeners.get(event) === handler) listeners.delete(event)
    },
    listeners,
  }
}

test('detects an injected provider only when request() exists', () => {
  assert.equal(detectInjectedProvider({}), null)
  assert.equal(detectInjectedProvider({ ethereum: {} }), null)
  const ethereum = fakeEthereum(async () => [])
  assert.equal(detectInjectedProvider({ ethereum }), ethereum)
})

test('fails clearly when no provider is available', async () => {
  const wallet = createInjectedWallet({ ethereum: null })
  assert.equal(wallet.available, false)
  await assert.rejects(() => wallet.connect(), (error) => error.code === WALLET_ERROR_CODES.NO_PROVIDER)
})

test('maps a user rejection without treating it as success', () => {
  const error = normalizeWalletError({ code: 4001, message: 'User rejected the request.' })
  assert.equal(error.code, WALLET_ERROR_CODES.USER_REJECTED)
  assert.match(error.message, /rejected/)
})

test('maps a pending wallet request and unknown chain', () => {
  assert.equal(normalizeWalletError({ code: -32002 }).code, WALLET_ERROR_CODES.ALREADY_PENDING)
  assert.equal(normalizeWalletError({ code: 4902 }).code, WALLET_ERROR_CODES.WRONG_NETWORK)
  assert.equal(normalizeWalletError({ code: -32601 }).code, WALLET_ERROR_CODES.UNSUPPORTED_METHOD)
})

test('connects and returns the first account', async () => {
  const ethereum = fakeEthereum(async (method) => {
    if (method === 'eth_requestAccounts') return [ACCOUNT]
    throw new Error(method)
  })
  const wallet = createInjectedWallet({ ethereum })
  assert.equal(await wallet.connect(), ACCOUNT)
})

test('does not switch when the wallet is already on the local chain', async () => {
  const ethereum = fakeEthereum(async (method) => {
    if (method === 'eth_chainId') return '0x7a69'
    throw new Error(method)
  })
  const wallet = createInjectedWallet({ ethereum })
  assert.deepEqual(await wallet.ensureLocalChain(), { switched: false, added: false })
  assert.equal(ethereum.calls.filter((call) => call.method === 'wallet_switchEthereumChain').length, 0)
})

test('switches to the local chain and adds it when unknown', async () => {
  let added = false
  const ethereum = fakeEthereum(async (method, params) => {
    if (method === 'eth_chainId') return '0x1'
    if (method === 'wallet_switchEthereumChain') {
      if (!added) throw { code: 4902, message: 'Unrecognized chain ID' }
      return null
    }
    if (method === 'wallet_addEthereumChain') {
      assert.equal(params[0].chainId, '0x7a69')
      assert.equal(params[0].nativeCurrency.symbol, 'BTCS')
      assert.deepEqual(params[0].rpcUrls, ['http://127.0.0.1:8545'])
      added = true
      return null
    }
    throw new Error(method)
  })
  const wallet = createInjectedWallet({ ethereum })
  assert.deepEqual(await wallet.ensureLocalChain(), { switched: true, added: true })
})

test('sends an explicit EIP-1559 transaction', async () => {
  const ethereum = fakeEthereum(async (method) => {
    if (method === 'eth_sendTransaction') return HASH
    throw new Error(method)
  })
  const wallet = createInjectedWallet({ ethereum })
  const hash = await wallet.sendTransaction({
    from: ACCOUNT,
    to: '0x00000000000000000000000000000000000000aa',
    value: 1_000_000_000_000_000_000n,
    data: '0x',
    gasLimit: 21_000n,
    maxFeePerGas: 3_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
  })
  assert.equal(hash, HASH)
  const sent = ethereum.calls.at(-1).params[0]
  assert.equal(sent.value, '0xde0b6b3a7640000')
  assert.equal(sent.gas, '0x5208')
  assert.equal(sent.type, '0x2')
  assert.equal(sent.maxFeePerGas, '0xb2d05e00')
})

test('rejects a wallet response that is not a transaction hash', async () => {
  const ethereum = fakeEthereum(async () => 'not-a-hash')
  const wallet = createInjectedWallet({ ethereum })
  await assert.rejects(
    () =>
      wallet.sendTransaction({
        from: ACCOUNT,
        to: '0x00000000000000000000000000000000000000aa',
        gasLimit: 21_000n,
        maxFeePerGas: 1n,
        maxPriorityFeePerGas: 1n,
      }),
    (error) => error instanceof WalletError,
  )
})

test('subscribes and unsubscribes account events', () => {
  const ethereum = fakeEthereum(async () => [])
  const wallet = createInjectedWallet({ ethereum })
  const unsubscribe = wallet.on('accountsChanged', () => {})
  assert.ok(ethereum.listeners.has('accountsChanged'))
  unsubscribe()
  assert.equal(ethereum.listeners.has('accountsChanged'), false)
})
