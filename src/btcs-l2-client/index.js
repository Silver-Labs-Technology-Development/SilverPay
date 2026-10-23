// BTCS L2 Client - SilverPay Adaptation
// Simplified client for SilverPay wallet functionality

const QUANTITY_PATTERN = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/
const HASH_PATTERN = /^0x[0-9a-f]{64}$/

export const BTCS_L2_LOCAL = Object.freeze({
  id: 'btcs-l2-local',
  profileType: 'local-development',
  chainId: '31337',
  clientVersionPrefix: 'BTCSL2/',
})

export const NETWORK_IDENTITY_SCHEMA_VERSION = 1

export class BtcsL2ClientError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = new.target.name
  }
}

export class RpcTransportError extends BtcsL2ClientError {
  constructor(message, { cause, status } = {}) {
    super(message, { cause })
    this.status = status
  }
}

export class RpcProtocolError extends BtcsL2ClientError {
  constructor(code, message, data) {
    super(`JSON-RPC error ${code}: ${message}`)
    this.code = code
    this.data = data
  }
}

export class NetworkMismatchError extends BtcsL2ClientError {}

export class UnsupportedNetworkProfileError extends BtcsL2ClientError {
  constructor(profileId) {
    super(`Unsupported BTCS L2 network profile: ${String(profileId)}`)
  }
}

export class UnsupportedNetworkIdentitySchemaError extends BtcsL2ClientError {
  constructor(schemaVersion) {
    super(`Unsupported BTCS L2 network identity schema version: ${String(schemaVersion)}`)
    this.schemaVersion = schemaVersion
  }
}

export class NetworkIdentityValidationError extends BtcsL2ClientError {}

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

  const requiredFields = [
    'schemaVersion',
    'profileType',
    'profileId',
    'chainId',
    'clientVersion',
  ]
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
      `Expected chain id ${BTCS_L2_LOCAL.chainId}; received ${value.chainId}`
    )
  }
  if (!value.clientVersion.startsWith(BTCS_L2_LOCAL.clientVersionPrefix)) {
    throw new NetworkMismatchError(
      `Expected a client version beginning ${BTCS_L2_LOCAL.clientVersionPrefix}; received ${value.clientVersion}`
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

function parseQuantity(value, label) {
  if (typeof value !== 'string' || !QUANTITY_PATTERN.test(value)) {
    throw new RpcProtocolError(`${label} is not a valid JSON-RPC quantity`)
  }
  // In SilverPay we just return the string representation for now
  return value
}

function parseAddress(value) {
  if (typeof value !== 'string' || !ADDRESS_PATTERN.test(value)) {
    throw new RpcProtocolError(`${label} is not a valid Ethereum address`)
  }
  return value
}

function parseHash(value, label = 'Hash') {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    throw new RpcProtocolError(`${label} is not a valid 32-byte hash`)
  }
  return value
}

// RPC Transport - simplified for SilverPay
class RpcTransport {
  constructor(rpcUrl) {
    this.rpcUrl = rpcUrl
  }

  async request(method, params = []) {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params }),
    })
    
    if (!response.ok) {
      throw new RpcProtocolError(
        -32603,
        `RPC request failed: ${response.status}`,
        await response.text()
      )
    }
    
    const result = await response.json()
    
    if (result.error) {
      throw new RpcProtocolError(
        result.error.code,
        result.error.message,
        result.error.data
      )
    }
    
    return result.result
  }
}

// BTCS L2 Client class
export class BtcsL2Client {
  constructor(rpcUrl = 'http://127.0.0.1:8545') {
    this.transport = new RpcTransport(rpcUrl)
  }

  async connect() {
    await this.transport.request('eth_requestAccounts', [])
  }

  async getAccounts() {
    return this.transport.request('eth_accounts', [])
  }

  async getBalance(address, reference = 'latest') {
    return parseQuantity(
      await this.transport.request('eth_getBalance', [address, reference]),
      'Account balance'
    )
  }

  async getBlockNumber() {
    return parseQuantity(await this.transport.request('eth_blockNumber'), 'Block number')
  }

  async getChainId() {
    return Number(parseQuantity(await this.transport.request('eth_chainId'), 'Chain id'))
  }

  async getBlock(reference = 'latest', fullTransactions = false) {
    const blockReference = reference
    return this.transport.request('eth_getBlockByNumber', [blockReference, fullTransactions])
  }

  async getTransaction(hash) {
    return this.transport.request('eth_getTransactionByHash', [hash])
  }

  async getTransactionReceipt(hash) {
    return this.transport.request('eth_getTransactionReceipt', [hash])
  }

  async getTransactionStatus(hash) {
    const receipt = await this.getTransactionReceipt(hash)
    if (receipt !== null) {
      return {
        status: receipt.status === '0x1' ? 'confirmed' : 'reverted',
        blockHash: receipt.blockHash,
        blockNumber: parseQuantity(receipt.blockNumber, 'Receipt block number'),
      }
    }
    
    const transaction = await this.getTransaction(hash)
    if (transaction === null) return { status: 'missing' }
    if (transaction.blockHash === null && transaction.blockNumber === null) {
      return { status: 'pending' }
    }
    throw new RpcProtocolError('Transaction is block-associated but has no canonical receipt')
  }

  async getCode(address, reference = 'latest') {
    return this.transport.request('eth_getCode', [address, reference])
  }

  async verifyNetwork() {
    await this.ensureNetworkVerified()
  }

  async ensureNetworkVerified() {
    const chainId = await this.getChainId()
    const expectedChainId = 31337 // BTCS L2 local chain ID
    
    if (chainId !== expectedChainId) {
      throw new RpcProtocolError(
        -32603,
        `Wrong network: expected chain ID ${expectedChainId}, got ${chainId}`
      )
    }
  }
}
