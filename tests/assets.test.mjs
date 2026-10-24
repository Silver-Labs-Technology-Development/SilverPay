import assert from 'node:assert/strict'
import test from 'node:test'
import { AbiCoder, Interface } from 'ethers'

import {
  MAX_TOKEN_DECIMALS,
  decodeString,
  decodeUint256,
  encodeBalanceOf,
  encodeErc20Transfer,
  readToken,
  validateTokenAddress,
} from '../src/wallet/assets.js'

const TOKEN = '0x1111111111111111111111111111111111111111'
const OWNER = '0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a'
const coder = AbiCoder.defaultAbiCoder()
const abi = new Interface([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
])

function fakeTokenClient({ code = '0x6000', decimals = 6, balance = 2_500_000n } = {}) {
  return {
    async getCode() {
      return code
    },
    async call(to, data) {
      const parsed = abi.parseTransaction({ data })
      switch (parsed.name) {
        case 'name':
          return coder.encode(['string'], ['Silver Test'])
        case 'symbol':
          return coder.encode(['string'], ['SLVT'])
        case 'decimals':
          return coder.encode(['uint8'], [decimals])
        case 'balanceOf':
          return coder.encode(['uint256'], [balance])
        default:
          throw new Error(`unexpected call ${parsed.name}`)
      }
    },
  }
}

test('encodes a transfer with the standard ERC-20 selector', () => {
  const data = encodeErc20Transfer(OWNER, 1_000_000n)
  assert.match(data, /^0xa9059cbb/)
  const decoded = abi.decodeFunctionData('balanceOf', encodeBalanceOf(OWNER))
  assert.equal(decoded[0].toLowerCase(), OWNER)
  assert.throws(() => encodeErc20Transfer('0x123', 1n), TypeError)
  assert.throws(() => encodeErc20Transfer(OWNER, 0n), RangeError)
})

test('decodes uint256 and strings', () => {
  assert.equal(decodeUint256(coder.encode(['uint256'], [42])), 42n)
  assert.equal(decodeString(coder.encode(['string'], ['abc'])), 'abc')
  assert.equal(decodeString('0x'), null)
  assert.equal(decodeString('0xdeadbeef'), null)
  assert.throws(() => decodeUint256('0x'), /no data/)
})

test('reads metadata and balance from a token contract', async () => {
  const token = await readToken(fakeTokenClient(), TOKEN, OWNER)
  assert.deepEqual(token, {
    address: TOKEN,
    name: 'Silver Test',
    symbol: 'SLVT',
    decimals: 6,
    balance: 2_500_000n,
  })
})

test('refuses an address with no contract code', async () => {
  await assert.rejects(() => readToken(fakeTokenClient({ code: '0x' }), TOKEN, OWNER), /No contract code/)
})

test('rejects absurd decimals instead of mis-scaling balances', async () => {
  await assert.rejects(
    () => readToken(fakeTokenClient({ decimals: MAX_TOKEN_DECIMALS + 1 }), TOKEN, OWNER),
    /unsupported decimals/,
  )
})

test('validates token addresses before any network call', () => {
  assert.equal(validateTokenAddress(` ${TOKEN} `), TOKEN)
  assert.throws(() => validateTokenAddress('0x12'), /40 hexadecimal/)
  assert.throws(() => validateTokenAddress(''), /40 hexadecimal/)
})
