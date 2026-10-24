/**
 * EIP-1193 injected-wallet adapter.
 *
 * The wallet never receives, stores, or transmits a private key or seed
 * phrase. Account access and signing are delegated to the browser wallet via
 * `eth_requestAccounts` and `eth_sendTransaction`.
 */

import { BTCS_L2_LOCAL } from '../l2/client.js'

export class WalletError extends Error {
  constructor(message, { code = 'wallet_error', cause } = {}) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = new.target.name
    this.code = code
  }
}

export const WALLET_ERROR_CODES = Object.freeze({
  NO_PROVIDER: 'no_provider',
  NO_ACCOUNT: 'no_account',
  USER_REJECTED: 'user_rejected',
  ALREADY_PENDING: 'already_pending',
  WRONG_NETWORK: 'wrong_network',
  UNSUPPORTED_METHOD: 'unsupported_method',
  UNKNOWN: 'unknown',
})

const LOCAL_CHAIN_PARAMS = Object.freeze({
  chainId: BTCS_L2_LOCAL.chainIdHex,
  chainName: BTCS_L2_LOCAL.name,
  nativeCurrency: {
    name: 'Bitcoin Silver L2',
    symbol: BTCS_L2_LOCAL.nativeSymbol,
    decimals: BTCS_L2_LOCAL.nativeDecimals,
  },
  rpcUrls: [BTCS_L2_LOCAL.rpcUrl],
  blockExplorerUrls: null,
})

export function detectInjectedProvider(scope = globalThis) {
  const ethereum = scope?.ethereum
  if (!ethereum || typeof ethereum.request !== 'function') return null
  return ethereum
}

/** Map an EIP-1193 / JSON-RPC error to a stable wallet error code. */
export function normalizeWalletError(error) {
  if (error instanceof WalletError) return error
  const code = error?.code
  const message = typeof error?.message === 'string' ? error.message : ''
  if (code === 4001 || /user rejected|user denied/i.test(message)) {
    return new WalletError('The request was rejected in the wallet. Nothing was sent.', {
      code: WALLET_ERROR_CODES.USER_REJECTED,
      cause: error,
    })
  }
  if (code === -32002) {
    return new WalletError(
      'The wallet already has a pending request. Open the wallet extension and finish or dismiss it.',
      { code: WALLET_ERROR_CODES.ALREADY_PENDING, cause: error },
    )
  }
  if (code === 4902) {
    return new WalletError(
      'The wallet does not know this network. Add the local BTCS L2 development network first.',
      { code: WALLET_ERROR_CODES.WRONG_NETWORK, cause: error },
    )
  }
  if (code === -32601 || /not supported|unsupported/i.test(message)) {
    return new WalletError(
      'The connected wallet does not support this request. A standard EVM browser wallet is required.',
      { code: WALLET_ERROR_CODES.UNSUPPORTED_METHOD, cause: error },
    )
  }
  return new WalletError(message || 'The wallet request failed.', {
    code: WALLET_ERROR_CODES.UNKNOWN,
    cause: error,
  })
}

/**
 * @param {object} options
 * @param {object|null} [options.ethereum] injected provider, or null when absent
 */
export function createInjectedWallet({ ethereum = detectInjectedProvider() } = {}) {
  const available = Boolean(ethereum && typeof ethereum.request === 'function')
  const listeners = new Map()

  function requireProvider() {
    if (!available) {
      throw new WalletError(
        'No injected EVM wallet was detected. Install a browser wallet, or use watch-only mode to read an address.',
        { code: WALLET_ERROR_CODES.NO_PROVIDER },
      )
    }
  }

  async function request(method, params = []) {
    requireProvider()
    try {
      return await ethereum.request({ method, params })
    } catch (error) {
      throw normalizeWalletError(error)
    }
  }

  return Object.freeze({
    available,

    async connect() {
      const accounts = await request('eth_requestAccounts')
      if (!Array.isArray(accounts) || accounts.length === 0) {
        throw new WalletError('The wallet returned no account.', { code: WALLET_ERROR_CODES.NO_ACCOUNT })
      }
      return accounts[0]
    },

    async getAccounts() {
      const accounts = await request('eth_accounts')
      return Array.isArray(accounts) ? accounts : []
    },

    async getChainIdHex() {
      return request('eth_chainId')
    },

    /** Ask the wallet to switch to the local BTCS L2 chain, adding it if needed. */
    async ensureLocalChain() {
      const current = await request('eth_chainId')
      if (typeof current === 'string' && current.toLowerCase() === BTCS_L2_LOCAL.chainIdHex) {
        return { switched: false, added: false }
      }
      try {
        await request('wallet_switchEthereumChain', [{ chainId: BTCS_L2_LOCAL.chainIdHex }])
        return { switched: true, added: false }
      } catch (error) {
        if (error?.code !== WALLET_ERROR_CODES.WRONG_NETWORK) throw error
        await request('wallet_addEthereumChain', [LOCAL_CHAIN_PARAMS])
        return { switched: true, added: true }
      }
    },

    /**
     * Send a prepared EIP-1559 transaction. All fee fields are explicit so the
     * wallet does not need eth_gasPrice or eth_feeHistory, which this local
     * node does not implement.
     */
    async sendTransaction({ from, to, value = 0n, data = '0x', gasLimit, maxFeePerGas, maxPriorityFeePerGas }) {
      if (typeof from !== 'string') throw new WalletError('A connected account is required.')
      if (typeof to !== 'string') throw new WalletError('A recipient address is required.')
      if (typeof gasLimit !== 'bigint' || gasLimit <= 0n) throw new WalletError('A gas limit is required.')
      const tx = {
        from,
        to,
        value: `0x${value.toString(16)}`,
        data,
        gas: `0x${gasLimit.toString(16)}`,
        maxFeePerGas: `0x${maxFeePerGas.toString(16)}`,
        maxPriorityFeePerGas: `0x${maxPriorityFeePerGas.toString(16)}`,
        type: '0x2',
      }
      const hash = await request('eth_sendTransaction', [tx])
      if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
        throw new WalletError('The wallet did not return a transaction hash.', {
          code: WALLET_ERROR_CODES.UNKNOWN,
        })
      }
      return hash
    },

    on(event, handler) {
      if (!available || typeof ethereum.on !== 'function') return () => {}
      if (typeof handler !== 'function') throw new TypeError('Event handler must be a function')
      ethereum.on(event, handler)
      const bucket = listeners.get(event) ?? []
      bucket.push(handler)
      listeners.set(event, bucket)
      return () => {
        if (typeof ethereum.removeListener === 'function') ethereum.removeListener(event, handler)
        const current = listeners.get(event) ?? []
        listeners.set(event, current.filter((entry) => entry !== handler))
      }
    },
  })
}
