/**
 * Pure form validation. Kept separate from the DOM so every rule is testable.
 */

import { parseUnits, isEvmAddress } from '../l2/format.js'
import { validateRecipient } from '../wallet/send.js'

/**
 * @returns {{ok: boolean, errors: Record<string, string>, amount?: bigint}}
 */
export function validateSendForm({ recipient, amount, decimals, balance, symbol = 'BTCS' }) {
  const errors = {}
  let parsedAmount

  if (typeof recipient !== 'string' || recipient.trim().length === 0) {
    errors.recipient = 'Enter a recipient address.'
  } else {
    try {
      validateRecipient(recipient)
    } catch (error) {
      errors.recipient = error.message
    }
  }

  if (typeof amount !== 'string' || amount.trim().length === 0) {
    errors.amount = 'Enter an amount.'
  } else {
    try {
      parsedAmount = parseUnits(amount, decimals)
    } catch (error) {
      errors.amount = error.message
    }
  }

  if (parsedAmount !== undefined && typeof balance === 'bigint' && parsedAmount > balance) {
    errors.amount = `The amount exceeds the available ${symbol} balance.`
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    ...(parsedAmount === undefined ? {} : { amount: parsedAmount }),
  }
}

export function validateWatchAddress(value) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (trimmed.length === 0) return { ok: false, error: 'Enter an address to watch.' }
  if (!isEvmAddress(trimmed)) {
    return { ok: false, error: 'Enter an address as 0x followed by 40 hexadecimal characters.' }
  }
  return { ok: true, address: trimmed }
}

export function validateTokenForm(value) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (trimmed.length === 0) return { ok: false, error: 'Enter a token contract address.' }
  if (!isEvmAddress(trimmed)) {
    return { ok: false, error: 'Enter a token address as 0x followed by 40 hexadecimal characters.' }
  }
  return { ok: true, address: trimmed }
}

/** Guard any user-supplied text before it is inserted into the DOM. */
export function sanitizeDisplayText(value, maxLength = 120) {
  if (value === null || value === undefined) return ''
  const text = String(value).replace(/[\u0000-\u001f\u007f<>]+/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}
