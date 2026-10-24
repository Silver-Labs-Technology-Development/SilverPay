import assert from 'node:assert/strict'
import test from 'node:test'

import {
  sanitizeDisplayText,
  validateSendForm,
  validateTokenForm,
  validateWatchAddress,
} from '../src/ui/forms.js'

const RECIPIENT = '0x00000000000000000000000000000000000000aa'

test('accepts a valid native send form', () => {
  const result = validateSendForm({
    recipient: RECIPIENT,
    amount: '1.5',
    decimals: 18,
    balance: 2n * 10n ** 18n,
    symbol: 'BTCS',
  })
  assert.equal(result.ok, true)
  assert.equal(result.amount, 1_500_000_000_000_000_000n)
  assert.deepEqual(result.errors, {})
})

test('reports every invalid field without throwing', () => {
  const result = validateSendForm({ recipient: 'nope', amount: 'abc', decimals: 18, balance: 0n })
  assert.equal(result.ok, false)
  assert.match(result.errors.recipient, /40 hexadecimal/)
  assert.match(result.errors.amount, /positive decimal/)
})

test('rejects an empty form and a zero recipient', () => {
  const empty = validateSendForm({ recipient: '', amount: '', decimals: 18, balance: 0n })
  assert.equal(empty.ok, false)
  assert.match(empty.errors.recipient, /Enter a recipient/)
  assert.match(empty.errors.amount, /Enter an amount/)

  const zero = validateSendForm({
    recipient: '0x0000000000000000000000000000000000000000',
    amount: '1',
    decimals: 18,
    balance: 10n,
  })
  assert.match(zero.errors.recipient, /zero address/)
})

test('rejects an amount above the available balance', () => {
  const result = validateSendForm({
    recipient: RECIPIENT,
    amount: '2',
    decimals: 18,
    balance: 10n ** 18n,
    symbol: 'BTCS',
  })
  assert.equal(result.ok, false)
  assert.match(result.errors.amount, /exceeds the available BTCS balance/)
})

test('rejects excess precision for the selected asset', () => {
  const result = validateSendForm({ recipient: RECIPIENT, amount: '1.1234567', decimals: 6, balance: 10n ** 18n })
  assert.match(result.errors.amount, /at most 6 decimal places/)
})

test('validates watch addresses and token addresses', () => {
  assert.deepEqual(validateWatchAddress(RECIPIENT), { ok: true, address: RECIPIENT })
  assert.match(validateWatchAddress('').error, /Enter an address/)
  assert.match(validateWatchAddress('0x12').error, /40 hexadecimal/)
  assert.deepEqual(validateTokenForm(' ' + RECIPIENT + ' '), { ok: true, address: RECIPIENT })
  assert.match(validateTokenForm('').error, /Enter a token contract address/)
})

test('strips markup and control characters from display text', () => {
  assert.equal(sanitizeDisplayText('<img src=x onerror=alert(1)>'), 'img src=x onerror=alert(1)')
  assert.equal(sanitizeDisplayText('a\u0000b'), 'a b')
  assert.equal(sanitizeDisplayText('x'.repeat(20), 5), 'xxxx…')
  assert.equal(sanitizeDisplayText(null), '')
})
