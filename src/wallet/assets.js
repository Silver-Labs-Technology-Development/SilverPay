/**
 * Minimal ERC-20 reads and transfer encoding for the wallet.
 *
 * Only the four standard read calls plus `transfer` are used. The wallet does
 * not deploy tokens, mint, or approve allowances, so those selectors are not
 * present.
 */

import { AbiCoder, Interface } from 'ethers'

const ERC20 = new Interface([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
])

const coder = AbiCoder.defaultAbiCoder()

export const MAX_TOKEN_DECIMALS = 36

export function encodeErc20Transfer(to, amount) {
  if (typeof to !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(to)) {
    throw new TypeError('Recipient must be a 20-byte address')
  }
  if (typeof amount !== 'bigint' || amount <= 0n) {
    throw new RangeError('Transfer amount must be a positive bigint')
  }
  return ERC20.encodeFunctionData('transfer', [to, amount])
}

export function encodeBalanceOf(owner) {
  if (typeof owner !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(owner)) {
    throw new TypeError('Owner must be a 20-byte address')
  }
  return ERC20.encodeFunctionData('balanceOf', [owner])
}

export function decodeUint256(hex) {
  if (typeof hex !== 'string' || !/^0x[0-9a-fA-F]*$/.test(hex)) {
    throw new TypeError('Expected hexadecimal return data')
  }
  if (hex === '0x') throw new Error('The contract returned no data')
  return coder.decode(['uint256'], hex)[0]
}

export function decodeString(hex) {
  if (typeof hex !== 'string' || hex === '0x') return null
  try {
    return coder.decode(['string'], hex)[0]
  } catch {
    return null
  }
}

/** Validate a token contract address before any network call. */
export function validateTokenAddress(value) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw new Error('Enter the token contract address as 0x followed by 40 hexadecimal characters')
  }
  return trimmed
}

export async function isContract(client, address) {
  const code = await client.getCode(address)
  return code !== '0x' && code.length > 2
}

/**
 * Read token metadata and balance. Returns a plain record; callers decide how
 * to render partial failures.
 */
export async function readToken(client, address, owner) {
  const tokenAddress = validateTokenAddress(address)
  const contract = await isContract(client, tokenAddress)
  if (!contract) {
    throw new Error('No contract code exists at that address on this network')
  }

  const [nameHex, symbolHex, decimalsHex, balanceHex] = await Promise.all([
    client.call(tokenAddress, ERC20.encodeFunctionData('name')),
    client.call(tokenAddress, ERC20.encodeFunctionData('symbol')),
    client.call(tokenAddress, ERC20.encodeFunctionData('decimals')),
    client.call(tokenAddress, encodeBalanceOf(owner)),
  ])

  const decimals = Number(decodeUint256(decimalsHex))
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_TOKEN_DECIMALS) {
    throw new Error(`The contract reported an unsupported decimals value (${decimals})`)
  }

  return Object.freeze({
    address: tokenAddress,
    name: decodeString(nameHex) ?? 'Unnamed token',
    symbol: decodeString(symbolHex) ?? 'TOKEN',
    decimals,
    balance: decodeUint256(balanceHex),
  })
}
