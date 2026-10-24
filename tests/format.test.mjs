import assert from 'node:assert/strict'
import test from 'node:test'

import {
  describeAge,
  formatUnits,
  fromQuantity,
  isEvmAddress,
  isTxHash,
  parseUnits,
  parseWholeAmount,
  safeText,
  shortenAddress,
  toQuantity,
} from '../src/l2/format.js'

test('formats atomic units exactly without floating point', () => {
  assert.equal(formatUnits(0n, 18), '0')
  assert.equal(formatUnits(1_000_000_000_000_000_000n, 18), '1')
  assert.equal(formatUnits(1_234_500_000_000_000_000n, 18), '1.2345')
  assert.equal(formatUnits(42n, 0), '42')
  assert.equal(formatUnits(1n, 18, 18), '0.000000000000000001')
  assert.equal(formatUnits(1n, 18, 6), '0')
  assert.equal(formatUnits(999_999_999_999_999_999_999n, 18), '999.999999')
})

test('rejects invalid format input instead of coercing it', () => {
  assert.throws(() => formatUnits(1, 18), TypeError)
  assert.throws(() => formatUnits(-1n, 18), RangeError)
  assert.throws(() => formatUnits(1n, 37), RangeError)
})

test('parses decimal amounts exactly and rejects ambiguous input', () => {
  assert.equal(parseUnits('1', 18), 1_000_000_000_000_000_000n)
  assert.equal(parseUnits('0.000000000000000001', 18), 1n)
  assert.equal(parseUnits('12.5', 6), 12_500_000n)
  assert.throws(() => parseUnits('', 18), /Enter an amount/)
  assert.throws(() => parseUnits('1e18', 18), /positive decimal/)
  assert.throws(() => parseUnits('1,000', 18), /positive decimal/)
  assert.throws(() => parseUnits('-1', 18), /positive decimal/)
  assert.throws(() => parseUnits('1.123456789', 6), /at most 6 decimal places/)
  assert.throws(() => parseUnits('0', 18), /greater than zero/)
})

test('parses whole supplies only', () => {
  assert.equal(parseWholeAmount('1000000'), 1_000_000n)
  assert.throws(() => parseWholeAmount('1.5'), /whole number/)
  assert.throws(() => parseWholeAmount('0'), /greater than zero/)
})

test('round-trips JSON-RPC quantities', () => {
  assert.equal(toQuantity(0n), '0x0')
  assert.equal(toQuantity(31_337n), '0x7a69')
  assert.equal(fromQuantity('0x7a69'), 31_337n)
  assert.equal(fromQuantity('0x'), null)
  assert.equal(fromQuantity('7a69'), null)
  assert.equal(fromQuantity('0x01'), null)
})

test('validates addresses and hashes', () => {
  assert.equal(isEvmAddress('0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a'), true)
  assert.equal(isEvmAddress('0x123'), false)
  assert.equal(isTxHash(`0x${'ab'.repeat(32)}`), true)
  assert.equal(isTxHash('0xabc'), false)
})

test('shortens addresses for display only', () => {
  assert.equal(shortenAddress('0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a'), '0x19e7…ff2a')
  assert.equal(shortenAddress('0xabc'), '0xabc')
})

test('describes ages without going negative', () => {
  assert.equal(describeAge(100, 100), '0s ago')
  assert.equal(describeAge(100, 130), '30s ago')
  assert.equal(describeAge(100, 400), '5m ago')
  assert.equal(describeAge(100, 100 + 7200), '2h ago')
  assert.equal(describeAge(100, 100 + 172_800), '2d ago')
})

test('sanitizes node text before display', () => {
  assert.equal(safeText('  hello\u0000world  '), 'hello world')
  assert.equal(safeText('a'.repeat(20), 10), 'aaaaaaaaa…')
  assert.equal(safeText(undefined), '')
})
