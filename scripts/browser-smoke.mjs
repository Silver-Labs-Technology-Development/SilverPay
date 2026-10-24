// Chrome DevTools Protocol smoke check for the SilverPay preview.
//
// This is an optional manual verification aid, not part of `npm test`:
// it needs a running preview server, a local BTCS L2 node, and Chrome.
//
//   BTCS_L2_RPC_URL=http://127.0.0.1:8545 npm run preview
//   google-chrome --headless=new --no-sandbox --remote-debugging-port=9222 \
//     --user-data-dir=/tmp/silverpay-chrome http://127.0.0.1:4173/
//   node scripts/browser-smoke.mjs
//
// It verifies node identity, watch-only balance, form validation, the bounded
// history scan, and persistence across a reload. It cannot test injected-wallet
// signing: that requires a real browser wallet extension and a human approval.

const CDP = process.env.CDP_URL || 'http://127.0.0.1:9222'
const APP = process.env.APP_URL || 'http://127.0.0.1:4173/'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function pageTarget() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const list = await (await fetch(`${CDP}/json/list`)).json()
      const page = list.find((entry) => entry.type === 'page' && entry.url.startsWith(APP))
      if (page) return page
    } catch {}
    await sleep(250)
  }
  throw new Error('no page target')
}

const page = await pageTarget()
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
})

let nextId = 1
const pending = new Map()
const consoleErrors = []
const exceptions = []

ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(JSON.stringify(message.error)))
    else resolve(message.result)
    return
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '))
  }
  if (message.method === 'Runtime.exceptionThrown') {
    exceptions.push(message.params.exceptionDetails.text)
  }
})

function send(method, params = {}) {
  const id = nextId
  nextId += 1
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

async function waitFor(expression, label, timeoutMs = 15000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(expression)) return
    await sleep(250)
  }
  throw new Error(`timeout waiting for ${label}`)
}

await send('Runtime.enable')
await send('Page.enable')
await send('Page.reload', { ignoreCache: true })
await sleep(500)
await waitFor(`document.readyState === 'complete'`, 'document ready')
await waitFor(`document.getElementById('network-chip').dataset.state === 'ready'`, 'node identity')

const report = {}
report.chip = await evaluate(`document.getElementById('network-chip-label').textContent`)
report.chain = await evaluate(`document.getElementById('fact-chain').textContent`)
report.client = await evaluate(`document.getElementById('fact-client').textContent`)
report.block = await evaluate(`document.getElementById('fact-block').textContent`)
report.connectDisabled = await evaluate(`document.getElementById('connect-wallet').disabled`)
report.availability = await evaluate(`document.getElementById('wallet-availability').textContent`)

// Watch-only flow with the documented harness genesis account.
await evaluate(`(() => {
  const input = document.getElementById('watch-address')
  input.value = '0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a'
  document.getElementById('watch-form').requestSubmit()
  return true
})()`)
await waitFor(`/BTCS/.test(document.getElementById('account-balance').textContent)`, 'balance')
report.mode = await evaluate(`document.getElementById('account-mode').textContent`)
report.balance = await evaluate(`document.getElementById('account-balance').textContent`)
report.receive = await evaluate(`document.getElementById('receive-address').textContent`)
report.sendReadiness = await evaluate(`document.getElementById('send-readiness').textContent`)
report.sendDisabled = await evaluate(`document.getElementById('send-review').disabled`)

// Form validation must reject bad input without a network call.
await evaluate(`(() => {
  const to = document.getElementById('send-to')
  const amount = document.getElementById('send-amount')
  to.value = 'not-an-address'
  amount.value = 'abc'
  document.getElementById('send-form').requestSubmit()
  return true
})()`)
await sleep(200)
report.recipientError = await evaluate(`document.getElementById('send-to-error').textContent`)
report.amountError = await evaluate(`document.getElementById('send-amount-error').textContent`)

await waitFor(`!document.getElementById('history-empty').hidden || document.getElementById('history-list').children.length > 0`, 'history scan')
report.historyNote = await evaluate(`document.getElementById('history-note').textContent`)
report.historyItems = await evaluate(`document.getElementById('history-list').children.length`)

// Persistence: reload and confirm the watch address is restored.
await send('Page.reload', { ignoreCache: false })
await sleep(600)
await waitFor(`document.getElementById('account-mode').textContent === 'Watch only'`, 'restored watch mode')
report.restoredAddress = await evaluate(`document.getElementById('account-address').textContent`)

report.consoleErrors = consoleErrors
report.exceptions = exceptions
console.log(JSON.stringify(report, null, 2))
ws.close()
