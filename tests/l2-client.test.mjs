import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import test from 'node:test'

import {
  BTCS_L2_LOCAL,
  L2ProtocolError,
  L2RpcError,
  L2TimeoutError,
  L2TransportError,
  NetworkIdentityValidationError,
  NetworkMismatchError,
  UnsupportedNetworkIdentitySchemaError,
  createL2Client,
  validateEndpoint,
  validateNetworkIdentity,
} from '../src/l2/client.js'

const VALID_IDENTITY = {
  schemaVersion: 1,
  profileType: 'local-development',
  profileId: 'btcs-l2-local',
  chainId: '31337',
  clientVersion: 'BTCSL2/v0.14-local/ethereumjs-vm-10.1.3/osaka',
}

function fakeFetch(handler) {
  return async (url, init) => {
    const request = JSON.parse(init.body)
    const result = await handler(request, init)
    return {
      ok: true,
      status: 200,
      async json() {
        return result
      },
    }
  }
}

test('accepts the local-development schema v1 identity', () => {
  const identity = validateNetworkIdentity(VALID_IDENTITY)
  assert.equal(identity.chainId, '31337')
  assert.equal(identity.profileId, 'btcs-l2-local')
  assert.ok(Object.isFrozen(identity))
})

test('rejects a wrong chain id with a network mismatch error', () => {
  assert.throws(
    () => validateNetworkIdentity({ ...VALID_IDENTITY, chainId: '1' }),
    (error) => error instanceof NetworkMismatchError && /Expected chain id 31337/.test(error.message),
  )
})

test('rejects a non-BTCS client banner', () => {
  assert.throws(
    () => validateNetworkIdentity({ ...VALID_IDENTITY, clientVersion: 'Geth/v1.13.0' }),
    (error) => error instanceof NetworkMismatchError && /BTCSL2\//.test(error.message),
  )
})

test('rejects unsupported schema versions and unknown fields', () => {
  assert.throws(
    () => validateNetworkIdentity({ ...VALID_IDENTITY, schemaVersion: 2 }),
    UnsupportedNetworkIdentitySchemaError,
  )
  assert.throws(
    () => validateNetworkIdentity({ ...VALID_IDENTITY, extra: true }),
    NetworkIdentityValidationError,
  )
  assert.throws(() => validateNetworkIdentity(null), NetworkIdentityValidationError)
})

test('only permits loopback absolute URLs or same-origin paths', () => {
  assert.equal(validateEndpoint('/rpc'), '/rpc')
  assert.equal(validateEndpoint('http://127.0.0.1:8545'), 'http://127.0.0.1:8545/')
  assert.throws(() => validateEndpoint('https://rpc.example.com'), /loopback/)
  assert.throws(() => validateEndpoint('http://user:pass@127.0.0.1:8545'), /credentials/)
  assert.throws(() => validateEndpoint('//evil.example/rpc'), /same-origin/)
  assert.throws(() => validateEndpoint('/rpc?x=1'), /same-origin/)
})

test('verifies identity before a read and caches the result', async () => {
  const calls = []
  const client = createL2Client({
    endpoint: 'http://127.0.0.1:8545',
    fetchImpl: fakeFetch((request) => {
      calls.push(request.method)
      if (request.method === 'web3_clientVersion') return { jsonrpc: '2.0', id: request.id, result: VALID_IDENTITY.clientVersion }
      if (request.method === 'eth_chainId') return { jsonrpc: '2.0', id: request.id, result: '0x7a69' }
      if (request.method === 'eth_getBalance') return { jsonrpc: '2.0', id: request.id, result: '0xde0b6b3a7640000' }
      throw new Error(`unexpected ${request.method}`)
    }),
  })
  const balance = await client.getBalance('0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a')
  assert.equal(balance, 1_000_000_000_000_000_000n)
  await client.getBalance('0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a')
  assert.equal(calls.filter((method) => method === 'web3_clientVersion').length, 1)
})

test('surfaces JSON-RPC errors without inventing a result', async () => {
  const client = createL2Client({
    endpoint: 'http://127.0.0.1:8545',
    fetchImpl: fakeFetch((request) => {
      if (request.method === 'web3_clientVersion') return { jsonrpc: '2.0', id: request.id, result: VALID_IDENTITY.clientVersion }
      if (request.method === 'eth_chainId') return { jsonrpc: '2.0', id: request.id, result: '0x7a69' }
      return { jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found' } }
    }),
  })
  await assert.rejects(
    () => client.getTransactionReceipt(`0x${'ab'.repeat(32)}`),
    (error) => error instanceof L2RpcError && error.rpcCode === -32601,
  )
})

test('times out a hung request instead of waiting forever', async () => {
  const client = createL2Client({
    endpoint: 'http://127.0.0.1:8545',
    timeoutMs: 25,
    fetchImpl: (url, init) =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }),
  })
  await assert.rejects(() => client.getClientVersion(), L2TimeoutError)
})

test('reports an unreachable endpoint as a transport error', async () => {
  const client = createL2Client({
    endpoint: 'http://127.0.0.1:8545',
    fetchImpl: async () => {
      throw new TypeError('fetch failed')
    },
  })
  await assert.rejects(() => client.getClientVersion(), L2TransportError)
})

test('rejects malformed envelopes and mismatched ids', async () => {
  const mismatched = createL2Client({
    endpoint: 'http://127.0.0.1:8545',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { jsonrpc: '2.0', id: 999, result: 'x' }
      },
    }),
  })
  await assert.rejects(() => mismatched.getClientVersion(), L2ProtocolError)

  const malformed = createL2Client({
    endpoint: 'http://127.0.0.1:8545',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { jsonrpc: '2.0', id: 1, result: 'x', error: { code: 1, message: 'both' } }
      },
    }),
  })
  await assert.rejects(() => malformed.getClientVersion(), L2ProtocolError)
})

test('conformance: constants match the platform schema when it is checked out', async (t) => {
  const schemaPath = new URL('../../silver-labs-platform/schemas/v1/network-identity.schema.json', import.meta.url)
  if (!existsSync(schemaPath)) {
    t.skip('silver-labs-platform checkout is not present next to this repository')
    return
  }
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
  const properties = schema.properties ?? {}
  assert.equal(properties.profileType?.const, BTCS_L2_LOCAL.profileType)
  assert.equal(properties.profileId?.const, BTCS_L2_LOCAL.id)
  assert.equal(properties.chainId?.const, BTCS_L2_LOCAL.chainId)
  assert.equal(schema.properties?.schemaVersion?.const, 1)
  assert.match(properties.clientVersion?.pattern ?? '', /BTCSL2/)
})

test('detects a node that rejects the pending block tag', async () => {
  const client = createL2Client({
    endpoint: 'http://127.0.0.1:8545',
    fetchImpl: fakeFetch((request) => {
      if (request.method === 'web3_clientVersion') return { jsonrpc: '2.0', id: request.id, result: VALID_IDENTITY.clientVersion }
      if (request.method === 'eth_chainId') return { jsonrpc: '2.0', id: request.id, result: '0x7a69' }
      if (request.method === 'eth_getTransactionCount') {
        if (request.params[1] === 'pending') {
          return { jsonrpc: '2.0', id: request.id, error: { code: -32602, message: 'Invalid params' } }
        }
        return { jsonrpc: '2.0', id: request.id, result: '0x1' }
      }
      throw new Error(request.method)
    }),
  })
  assert.equal(await client.supportsPendingBlockTag('0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a'), false)
})
