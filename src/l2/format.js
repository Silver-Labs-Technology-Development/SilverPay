/**
 * Exact integer formatting helpers.
 *
 * All token amounts are handled as bigint atomic units. Nothing in the display
 * path uses floating point, so balances cannot be rounded into a wrong value.
 */

export const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/
export const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/

export function isEvmAddress(value) {
  return typeof value === 'string' && ADDRESS_PATTERN.test(value)
}

export function isTxHash(value) {
  return typeof value === 'string' && HASH_PATTERN.test(value)
}

export function shortenAddress(value, head = 6, tail = 4) {
  if (typeof value !== 'string' || value.length === 0) return ''
  if (value.length <= head + tail + 2) return value
  return `${value.slice(0, head)}…${value.slice(-tail)}`
}

/**
 * Format atomic units as a decimal string with at most `maxFractionDigits`
 * fractional digits. Trailing zeros are trimmed; the integer part is exact.
 */
export function formatUnits(value, decimals, maxFractionDigits = 6) {
  if (typeof value !== 'bigint') throw new TypeError('formatUnits expects a bigint')
  if (value < 0n) throw new RangeError('formatUnits does not accept negative values')
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new RangeError('decimals must be an integer from 0 through 36')
  }
  if (!Number.isInteger(maxFractionDigits) || maxFractionDigits < 0) {
    throw new RangeError('maxFractionDigits must be a non-negative integer')
  }
  if (decimals === 0) return value.toString(10)

  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const remainder = value % base
  if (remainder === 0n || maxFractionDigits === 0) return whole.toString(10)

  const padded = remainder.toString(10).padStart(decimals, '0')
  const fraction = padded.slice(0, Math.min(maxFractionDigits, decimals)).replace(/0+$/, '')
  return fraction.length === 0 ? whole.toString(10) : `${whole}.${fraction}`
}

/**
 * Parse a human decimal string into exact atomic units.
 * Rejects scientific notation, signs, whitespace, and excess precision.
 */
export function parseUnits(value, decimals) {
  if (typeof value !== 'string') throw new TypeError('Enter an amount as text')
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new RangeError('decimals must be an integer from 0 through 36')
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) throw new Error('Enter an amount')
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(trimmed)) {
    throw new Error('Use a positive decimal number such as 1.5, without commas, signs, or exponents')
  }
  const [whole, fraction = ''] = trimmed.split('.')
  if (fraction.length > decimals) {
    throw new Error(`This asset supports at most ${decimals} decimal places`)
  }
  const padded = fraction.padEnd(decimals, '0')
  const result = BigInt(whole) * 10n ** BigInt(decimals) + (padded.length === 0 ? 0n : BigInt(padded))
  if (result === 0n) throw new Error('Enter an amount greater than zero')
  return result
}

/** Parse a whole-token supply with no fractional digits allowed. */
export function parseWholeAmount(value) {
  if (typeof value !== 'string') throw new TypeError('Enter an amount as text')
  const trimmed = value.trim()
  if (!/^(?:0|[1-9][0-9]*)$/.test(trimmed)) {
    throw new Error('Enter a whole number without decimals, commas, signs, or exponents')
  }
  const result = BigInt(trimmed)
  if (result === 0n) throw new Error('Enter an amount greater than zero')
  return result
}

/** Hex-encode a bigint as a JSON-RPC quantity. */
export function toQuantity(value) {
  if (typeof value !== 'bigint' || value < 0n) throw new TypeError('toQuantity expects a non-negative bigint')
  return `0x${value.toString(16)}`
}

/** Decode a JSON-RPC quantity. Returns null for non-quantity input. */
export function fromQuantity(value) {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)) return null
  return BigInt(value)
}

/**
 * Render an age from a unix timestamp in seconds. Local nodes use fixed
 * timestamps, so this is display-only and never used for ordering.
 */
export function describeAge(timestampSeconds, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!Number.isFinite(timestampSeconds)) return 'unknown time'
  const delta = Math.max(0, Math.floor(nowSeconds - timestampSeconds))
  if (delta < 60) return `${delta}s ago`
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`
  if (delta < 86_400) return `${Math.floor(delta / 3600)}h ago`
  return `${Math.floor(delta / 86_400)}d ago`
}

/** Truncate arbitrary node text before it reaches the DOM. */
export function safeText(value, maxLength = 200) {
  if (value === null || value === undefined) return ''
  const text = String(value).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}
