/**
 * Browser-side read client for the local BTCS L2 development node.
 *
 * Canonical reference implementation:
 *   silver-labs-platform/packages/btcs-l2-client (schema v1, read-only)
 *
 * This module is a deliberately small browser port of that contract. It exists
 * because the platform package is not published to a registry, and the wallet
 * must remain cloneable and buildable on its own. It must not grow signing,
 * key storage, or generic passthrough methods. See
 * docs/ARCHITECTURE.md and the conformance test in tests/l2-client.test.mjs.
 *
 * Observed node interface (btcs-l2 execution/evm/src/rpc.ts):
 *   web3_clientVersion -> "BTCSL2/v0.14-local/ethereumjs-vm-10.1.3/osaka"
 *   eth_chainId        -> "0x7a69" (31337)
 *   net_version        -> "31337"
 *   net_listening      -> false (local single node, no peers)
 *   eth_getBlockByNumber, eth_getTransactionByHash, eth_getTransactionReceipt,
 *   eth_getBalance, eth_getTransactionCount, eth_getCode, eth_call,
 *   eth_estimateGas, eth_getLogs, btcs_dev_mine (development only)
 *
 * Deliberately absent on the node: eth_accounts, eth_requestAccounts,
 * eth_sendTransaction, eth_gasPrice, eth_feeHistory, eth_syncing,
 * eth_getBlockTransactionCount*. The wallet must not pretend they exist.
 */

const QUANTITY_PATTERN = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/
const HASH_PATTERN = /^0x[0-9a-f]{64}$/

export const BTCS_L2_LOCAL = Object.freeze({
  id: 'btcs-l2-local',
  profileType: 'local-development',
  chainId: '31337',
  chainIdHex: '0x7a69',
  clientVersionPrefix: 'BTCSL2/',
  name: 'BTCS L2 Local Development',
  nativeSymbol: 'BTCS',
  nativeDecimals: 18,
  rpcUrl: 'http://127.0.0.1:8545',
})

export const NETWORK_IDENTITY_SCHEMA_VERSION = 1

/** Base class for errors the UI can render without leaking internals. */
export class L2Error extends Error {
  constructor(message, { code = 'l2_error', retryable = false, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = new.target.name
    this.code = code
    this.retryable = retryable
  }
}

export class L2TransportError extends L2Error {
  constructor(message, options = {}) {
    super(message, { code: options.code ?? 'transport_error', retryable: true, ...options })
    this.status = options.status
  }
}

export class L2TimeoutError extends L2TransportError {
  constructor(timeoutMs) {
    super(`The BTCS L2 RPC did not answer within ${timeoutMs} ms.`, { code: 'timeout' })
  }
}

export class L2ProtocolError extends L2Error {
  constructor(message, options = {}) {
    super(message, { code: 'protocol_error', retryable: false, ...options })
  }
}

export class L2RpcError extends L2Error {
  constructor(code, message, data) {
    super(message, { code: 'rpc_error', retryable: false })
    this.rpcCode = code
    this.data = data
  }
}

export class NetworkIdentityError extends L2Error {
  constructor(message, options = {}) {
    super(message, { code: 'network_identity', retryable: false, ...options })
  }
}

export class NetworkMismatchError extends NetworkIdentityError {
  constructor(message) {
    super(message)
    this.code = 'network_mismatch'
  }
}

export class UnsupportedNetworkProfileError extends NetworkIdentityError {
  constructor(profileId) {
    super(`Unsupported BTCS L2 network profile: ${String(profileId)}`)
    this.code = 'unsupported_profile'
  }
}

export class UnsupportedNetworkIdentitySchemaError extends NetworkIdentityError {
  constructor(schemaVersion) {
    super(`Unsupported BTCS L2 network identity schema version: ${String(schemaVersion)}`)
    this.code = 'unsupported_schema'
    this.schemaVersion = schemaVersion
  }
}

export class NetworkIdentityValidationError extends NetworkIdentityError {
  constructor(message) {
    super(message)
    this.code = 'invalid_identity'
  }
}

/**
 * Validate a schema v1 local-development network identity.
 * Mirrors `validateNetworkIdentity` from the platform client.
 */
export function validateNetworkIdentity(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new NetworkIdentityValidationError('Network identity must be an object')
  }
  if (!Object.hasOwn(value, 'schemaVersion')) {
    throw new NetworkIdentityValidationError('Network identity is missing schemaVersion')
  }
  if (value.schemaVersion !== NETWORK_IDENTITY_SCHEMA_VERSION) {
    throw new UnsupportedNetworkIdentitySchemaError(value.schemaVersion)
  }
  const requiredFields = ['schemaVersion', 'profileType', 'profileId', 'chainId', 'clientVersion']
  const unknownField = Object.keys(value).find((field) => !requiredFields.includes(field))
  if (unknownField !== undefined) {
    throw new NetworkIdentityValidationError(`Network identity has an unknown field: ${unknownField}`)
  }
  const missingField = requiredFields.find((field) => !Object.hasOwn(value, field))
  if (missingField !== undefined) {
    throw new NetworkIdentityValidationError(`Network identity is missing ${missingField}`)
  }
  if (
    typeof value.profileType !== 'string' ||
    typeof value.profileId !== 'string' ||
    typeof value.chainId !== 'string' ||
    typeof value.clientVersion !== 'string'
  ) {
    throw new NetworkIdentityValidationError('Network identity fields have invalid types')
  }
  if (value.profileType !== BTCS_L2_LOCAL.profileType || value.profileId !== BTCS_L2_LOCAL.id) {
    throw new UnsupportedNetworkProfileError(value.profileId)
  }
  if (!/^(0|[1-9][0-9]*)$/.test(value.chainId)) {
    throw new NetworkIdentityValidationError('Network identity chainId must be an unsigned decimal string')
  }
  if (value.chainId !== BTCS_L2_LOCAL.chainId) {
    throw new NetworkMismatchError(
      `Expected chain id ${BTCS_L2_LOCAL.chainId}; the RPC reported ${value.chainId}.`,
    )
  }
  if (!value.clientVersion.startsWith(BTCS_L2_LOCAL.clientVersionPrefix)) {
    throw new NetworkMismatchError(
      `Expected a client version beginning ${BTCS_L2_LOCAL.clientVersionPrefix}; the RPC reported ${value.clientVersion}.`,
    )
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    profileType: value.profileType,
    profileId: value.profileId,
    chainId: value.chainId,
    clientVersion: value.clientVersion,
  })
}

export function isAddress(value) {
  return typeof value === 'string' && ADDRESS_PATTERN.test(value)
}

export function isHash(value) {
  return typeof value === 'string' && HASH_PATTERN.test(value)
}

function parseQuantity(value, label) {
  if (typeof value !== 'string' || !QUANTITY_PATTERN.test(value)) {
    throw new L2ProtocolError(`${label} is not a valid JSON-RPC quantity`)
  }
  return BigInt(value)
}

function requireObject(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new L2ProtocolError(`${label} is not an object`)
  }
  return value
}

/**
 * Accept either an absolute loopback HTTP(S) URL or a same-origin path.
 *
 * A same-origin path (for example `/rpc`) is required in the browser because
 * the local BTCS L2 node does not send CORS headers: the Vite dev server (or a
 * deployment reverse proxy) forwards `/rpc` to 127.0.0.1:8545. The platform
 * client deliberately rejects non-loopback absolute URLs; that rule is kept.
 */
export function validateEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length === 0) {
    throw new TypeError('An explicit BTCS L2 RPC endpoint is required')
  }
  if (endpoint.startsWith('/')) {
    if (endpoint.startsWith('//') || endpoint.includes('?') || endpoint.includes('#')) {
      throw new TypeError('A same-origin RPC path must be a plain absolute path such as /rpc')
    }
    return endpoint
  }
  let parsed
  try {
    parsed = new URL(endpoint)
  } catch (cause) {
    throw new TypeError('BTCS L2 RPC endpoint must be an absolute HTTP(S) URL or a same-origin path', { cause })
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new TypeError('BTCS L2 RPC endpoint must use HTTP(S) without credentials, query, or fragment')
  }
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(parsed.hostname.toLowerCase())) {
    throw new TypeError('The local BTCS L2 profile only permits loopback RPC endpoints')
  }
  return parsed.toString()
}

function validateBlockReference(reference) {
  if (typeof reference === 'bigint') {
    if (reference < 0n) throw new RangeError('Block number cannot be negative')
    return `0x${reference.toString(16)}`
  }
  if (reference === 'latest' || reference === 'earliest') return reference
  throw new TypeError('Block reference must be a non-negative bigint, latest, or earliest')
}

function validateAddress(address) {
  if (!isAddress(address)) {
    throw new TypeError('Address must be exactly 20 bytes of hexadecimal data')
  }
}

/**
 * Create a read-only client for the local BTCS L2 development profile.
 *
 * @param {object} options
 * @param {string} [options.endpoint]
 * @param {number} [options.timeoutMs]
 * @param {typeof fetch} [options.fetchImpl]
 */
export function createL2Client({
  endpoint = BTCS_L2_LOCAL.rpcUrl,
  timeoutMs = 8_000,
  fetchImpl = globalThis.fetch,
} = {}) {
  const url = validateEndpoint(endpoint)
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new RangeError('timeoutMs must be an integer from 1 through 120000')
  }
  if (typeof fetchImpl !== 'function') throw new TypeError('A Fetch-compatible implementation is required')

  let nextId = 1
  let verificationPromise

  async function request(method, params = []) {
    const id = nextId
    nextId += 1
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        signal: controller.signal,
      })
    } catch (cause) {
      if (controller.signal.aborted) throw new L2TimeoutError(timeoutMs)
      throw new L2TransportError('The BTCS L2 RPC endpoint is unavailable.', { cause })
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      throw new L2TransportError(`The BTCS L2 RPC returned HTTP ${response.status}.`, {
        status: response.status,
      })
    }

    let envelope
    try {
      envelope = await response.json()
    } catch (cause) {
      throw new L2ProtocolError('The BTCS L2 RPC returned invalid JSON.', { cause })
    }
    const body = requireObject(envelope, 'JSON-RPC response')
    if (body.jsonrpc !== '2.0' || body.id !== id) {
      throw new L2ProtocolError('JSON-RPC response version or id does not match the request.')
    }
    const hasResult = Object.hasOwn(body, 'result')
    const hasError = Object.hasOwn(body, 'error')
    if (hasResult === hasError) {
      throw new L2ProtocolError('JSON-RPC response must contain exactly one of result or error.')
    }
    if (hasError) {
      const error = requireObject(body.error, 'JSON-RPC error')
      if (!Number.isInteger(error.code) || typeof error.message !== 'string') {
        throw new L2ProtocolError('JSON-RPC error object is malformed.')
      }
      throw new L2RpcError(error.code, error.message, error.data)
    }
    return body.result
  }

  async function verifyNetwork() {
    if (verificationPromise === undefined) {
      verificationPromise = (async () => {
        const [clientVersion, chainId] = await Promise.all([
          request('web3_clientVersion'),
          request('eth_chainId'),
        ])
        if (typeof clientVersion !== 'string') {
          throw new L2ProtocolError('Client version result is not a string.')
        }
        return validateNetworkIdentity({
          schemaVersion: NETWORK_IDENTITY_SCHEMA_VERSION,
          profileType: BTCS_L2_LOCAL.profileType,
          profileId: BTCS_L2_LOCAL.id,
          chainId: parseQuantity(chainId, 'Chain id').toString(10),
          clientVersion,
        })
      })().catch((error) => {
        verificationPromise = undefined
        throw error
      })
    }
    return verificationPromise
  }

  async function verifiedRequest(method, params = []) {
    await verifyNetwork()
    return request(method, params)
  }

  async function getTransaction(hash) {
    if (!isHash(hash)) throw new TypeError('Transaction hash must be exactly 32 bytes of hexadecimal data')
    const value = await verifiedRequest('eth_getTransactionByHash', [hash])
    if (value === null) return null
    const tx = requireObject(value, 'Transaction result')
    if (typeof tx.hash !== 'string' || tx.hash.toLowerCase() !== hash.toLowerCase()) {
      throw new L2ProtocolError('Transaction result does not match the requested hash.')
    }
    return tx
  }

  async function getTransactionReceipt(hash) {
    if (!isHash(hash)) throw new TypeError('Transaction hash must be exactly 32 bytes of hexadecimal data')
    const value = await verifiedRequest('eth_getTransactionReceipt', [hash])
    if (value === null) return null
    const receipt = requireObject(value, 'Receipt result')
    if (
      typeof receipt.transactionHash !== 'string' ||
      receipt.transactionHash.toLowerCase() !== hash.toLowerCase() ||
      typeof receipt.blockHash !== 'string' ||
      !isHash(receipt.blockHash) ||
      typeof receipt.blockNumber !== 'string' ||
      !(receipt.status === '0x0' || receipt.status === '0x1')
    ) {
      throw new L2ProtocolError('Receipt result is malformed or does not match the requested hash.')
    }
    parseQuantity(receipt.blockNumber, 'Receipt block number')
    return receipt
  }

  return Object.freeze({
    endpoint: url,
    profile: BTCS_L2_LOCAL,
    verifyNetwork,
    resetNetworkVerification() {
      verificationPromise = undefined
    },

    getClientVersion: () => request('web3_clientVersion'),
    getChainId: async () => parseQuantity(await request('eth_chainId'), 'Chain id'),
    getNetworkVersion: async () => {
      await verifyNetwork()
      const value = await request('net_version')
      if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
        throw new L2ProtocolError('Network version result is not a decimal chain id.')
      }
      return value
    },
    isListening: async () => {
      await verifyNetwork()
      const value = await request('net_listening')
      if (typeof value !== 'boolean') throw new L2ProtocolError('Listening result is not a boolean.')
      return value
    },

    getBlockNumber: async () => parseQuantity(await verifiedRequest('eth_blockNumber'), 'Block number'),

    getBlock: async (reference = 'latest', fullTransactions = false) => {
      if (typeof fullTransactions !== 'boolean') throw new TypeError('fullTransactions must be a boolean')
      const block = await verifiedRequest('eth_getBlockByNumber', [
        validateBlockReference(reference),
        fullTransactions,
      ])
      if (block === null) return null
      const candidate = requireObject(block, 'Block result')
      if (
        typeof candidate.hash !== 'string' ||
        !isHash(candidate.hash) ||
        typeof candidate.parentHash !== 'string' ||
        !isHash(candidate.parentHash) ||
        typeof candidate.number !== 'string' ||
        !Array.isArray(candidate.transactions)
      ) {
        throw new L2ProtocolError('Block result is missing required fields.')
      }
      parseQuantity(candidate.number, 'Block number')
      return candidate
    },

    getBalance: async (address, reference = 'latest') => {
      validateAddress(address)
      return parseQuantity(
        await verifiedRequest('eth_getBalance', [address, validateBlockReference(reference)]),
        'Account balance',
      )
    },

    getTransactionCount: async (address, reference = 'latest') => {
      validateAddress(address)
      return parseQuantity(
        await verifiedRequest('eth_getTransactionCount', [address, validateBlockReference(reference)]),
        'Account nonce',
      )
    },

    /**
     * Probe whether the node accepts the `pending` block tag. Browser wallets
     * commonly use it for nonce lookup; this node rejects it with -32602.
     */
    async supportsPendingBlockTag(address) {
      validateAddress(address)
      await verifyNetwork()
      try {
        await request('eth_getTransactionCount', [address, 'pending'])
        return true
      } catch (error) {
        if (error instanceof L2RpcError && error.rpcCode === -32602) return false
        throw error
      }
    },

    getCode: async (address, reference = 'latest') => {
      validateAddress(address)
      const value = await verifiedRequest('eth_getCode', [address, validateBlockReference(reference)])
      if (typeof value !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) {
        throw new L2ProtocolError('Account code result is not valid hexadecimal data.')
      }
      return value.toLowerCase()
    },

    getTransaction,
    getTransactionReceipt,

    /** @returns {Promise<{status: 'missing'|'pending'|'confirmed'|'reverted', blockNumber?: bigint}>} */
    async getTransactionStatus(hash) {
      const receipt = await getTransactionReceipt(hash)
      if (receipt !== null) {
        return Object.freeze({
          status: receipt.status === '0x1' ? 'confirmed' : 'reverted',
          blockHash: receipt.blockHash,
          blockNumber: parseQuantity(receipt.blockNumber, 'Receipt block number'),
        })
      }
      const transaction = await getTransaction(hash)
      if (transaction === null) return Object.freeze({ status: 'missing' })
      if (transaction.blockHash === null && transaction.blockNumber === null) {
        return Object.freeze({ status: 'pending' })
      }
      throw new L2ProtocolError('Transaction is block-associated but has no canonical receipt.')
    },

    call: async (to, data) => {
      validateAddress(to)
      if (typeof data !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(data)) {
        throw new TypeError('Call data must be hexadecimal bytes')
      }
      const result = await verifiedRequest('eth_call', [{ to, data }, 'latest'])
      if (typeof result !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(result)) {
        throw new L2ProtocolError('Call result is not hexadecimal data.')
      }
      return result
    },

    estimateGas: async ({ from, to, data = '0x', value = 0n }) => {
      if (from !== undefined) validateAddress(from)
      if (to !== undefined) validateAddress(to)
      const call = {}
      if (from !== undefined) call.from = from
      if (to !== undefined) call.to = to
      call.data = data
      call.value = `0x${value.toString(16)}`
      return parseQuantity(await verifiedRequest('eth_estimateGas', [call]), 'Gas estimate')
    },

    /**
     * Development-only: ask the local sequencer to produce one block.
     * Reverts to a clear error if the node was started without --dev-sequencer.
     */
    devMine: async () => {
      await verifyNetwork()
      return request('btcs_dev_mine')
    },
  })
}
