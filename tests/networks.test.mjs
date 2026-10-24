import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { networks, defaultNetworkId } from '../src/networks.js'
import { formatTokenBalance, getTokenSymbolByDecimals } from '../src/token-management.js'

test('defaults to the local BTCS L2 development profile', () => {
  const network = networks[defaultNetworkId]
  assert.equal(network.chainId, '31337')
  assert.equal(network.family, 'evm')
  assert.match(network.rpcUrl, /^http:\/\/127\.0\.0\.1:/)
  assert.equal(network.testnet, false)
})

test('formats token balances without floating-point rounding', () => {
  assert.equal(formatTokenBalance(0n, 18), '0')
  assert.equal(formatTokenBalance(1_000_000_000_000_000_000n, 18), '1.000000000000000000')
  assert.equal(formatTokenBalance(1_234_500_000_000_000_000n, 18), '1.234500000000000000')
  assert.equal(formatTokenBalance(42n, 0), '42')
})

test('selects the documented display symbol by decimals', () => {
  assert.equal(getTokenSymbolByDecimals(8), 'SLV')
  assert.equal(getTokenSymbolByDecimals(18), 'BTCS')
})

test('Vite entry point loads the wallet module', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  assert.match(html, /<title>SilverPay/)
  assert.match(html, /<script type="module" src="\/src\/index\.js"><\/script>/)
})
