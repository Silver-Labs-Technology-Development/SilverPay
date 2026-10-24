import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
const app = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')

function idsInHtml() {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]))
}

function referencedIds(source) {
  const ids = new Set()
  for (const match of source.matchAll(/\bel\('([^']+)'\)/g)) ids.add(match[1])
  for (const match of source.matchAll(/\bsetText\('([^']+)'/g)) ids.add(match[1])
  for (const match of source.matchAll(/\bsetHidden\('([^']+)'/g)) ids.add(match[1])
  return ids
}

test('every DOM id referenced by the app exists in the page', () => {
  const present = idsInHtml()
  const missing = [...referencedIds(app)].filter((id) => !present.has(id))
  assert.deepEqual(missing, [])
})

test('the page keeps its accessible structure', () => {
  assert.match(html, /<html lang="en">/)
  assert.match(html, /<a class="skip-link" href="#main">/)
  assert.match(html, /<main id="main">/)
  assert.match(html, /role="status"/)
  assert.match(html, /aria-live="polite"/)
  assert.match(html, /role="alert"/)
  assert.match(html, /<meta name="viewport"/)
  assert.match(html, /<title>SilverPay/)
})

test('every input has an associated label', () => {
  const inputs = [...html.matchAll(/<(input|select)\b[^>]*id="([^"]+)"/g)].map((match) => match[2])
  assert.ok(inputs.length >= 4)
  for (const id of inputs) {
    assert.match(html, new RegExp(`<label for="${id}"`), `missing label for #${id}`)
  }
})

test('the page does not use inline event handlers or remote scripts', () => {
  assert.doesNotMatch(html, /\son[a-z]+="/i)
  assert.doesNotMatch(html, /<script[^>]+src="https?:/i)
  assert.match(html, /<script type="module" src="\/src\/index\.js"><\/script>/)
})

test('the wallet never asks for a secret', () => {
  const forbidden = /type="password"|seed phrase input|private key input/i
  assert.doesNotMatch(html, forbidden)
  assert.match(html, /never asks for a private key or seed phrase/i)
})

test('unsupported capabilities are stated explicitly', () => {
  assert.match(html, /Not supported/)
  assert.match(html, /NFT display/)
  assert.match(html, /payments/)
  assert.match(html, /local BTCS L2 development chain/)
})
