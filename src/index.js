import {
  BTCS_L2_LOCAL,
  L2Error,
  createL2Client,
  NetworkIdentityError,
} from './l2/client.js'
import { describeAge, formatUnits, isEvmAddress, shortenAddress, safeText } from './l2/format.js'
import { scanRecentActivity, DEFAULT_HISTORY_BLOCKS } from './l2/history.js'
import { readToken, validateTokenAddress } from './wallet/assets.js'
import { createInjectedWallet, detectInjectedProvider, WalletError, WALLET_ERROR_CODES } from './wallet/injected.js'
import {
  prepareNativeTransfer,
  prepareTokenTransfer,
  submitTransfer,
  confirmTransaction,
  describeTransferError,
} from './wallet/send.js'
import {
  validateSendForm,
  validateWatchAddress,
  validateTokenForm,
  sanitizeDisplayText,
} from './ui/forms.js'

const STORAGE_KEY = 'silverpay.wallet.v1'
const RPC_ENDPOINT = import.meta.env.VITE_L2_RPC_URL || '/rpc'
const STALE_AFTER_MS = 60_000

const el = (id) => document.getElementById(id)

const state = {
  client: createL2Client({ endpoint: RPC_ENDPOINT }),
  wallet: null,
  node: { status: 'checking', identity: null, blockNumber: null, error: null, updatedAt: null },
  account: { mode: 'none', address: null, chainIdHex: null, balance: null, source: null },
  tokens: [],
  history: { status: 'idle', result: null, error: null },
  send: { status: 'idle', prepared: null, hash: null, message: '', hint: '', error: null },
  busy: { tokens: false, history: false, account: false },
  compat: { pendingTag: null },
}

/* ------------------------------------------------------------------ */
/* Small DOM helpers                                                   */
/* ------------------------------------------------------------------ */

function setText(id, value) {
  const node = el(id)
  if (node) node.textContent = value
}

function setHidden(id, hidden) {
  const node = el(id)
  if (node) node.hidden = hidden
}

function toast(message, type = 'info') {
  const node = el('status-message')
  if (!node) return
  node.textContent = message
  node.dataset.type = type
  node.hidden = message.length === 0
  if (message.length > 0) {
    window.clearTimeout(toast.timer)
    toast.timer = window.setTimeout(() => {
      node.hidden = true
    }, 6000)
  }
}

function setBanner(message, type = 'error') {
  const node = el('global-banner')
  if (!node) return
  node.textContent = message
  node.dataset.type = type
  node.hidden = message.length === 0
}

function copyText(value, successMessage) {
  if (!navigator.clipboard?.writeText) {
    toast('Clipboard access is unavailable in this browser. Select and copy the address manually.', 'error')
    return
  }
  navigator.clipboard.writeText(value).then(
    () => toast(successMessage, 'success'),
    () => toast('The browser blocked clipboard access. Select and copy the address manually.', 'error'),
  )
}

/* ------------------------------------------------------------------ */
/* Persistence (public addresses only — never keys or secrets)         */
/* ------------------------------------------------------------------ */

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { watchAddress: null, tokenAddresses: [] }
    const parsed = JSON.parse(raw)
    const tokenAddresses = Array.isArray(parsed?.tokenAddresses)
      ? parsed.tokenAddresses.filter((entry) => typeof entry === 'string' && isEvmAddress(entry)).slice(0, 20)
      : []
    return {
      watchAddress: isEvmAddress(parsed?.watchAddress) ? parsed.watchAddress : null,
      tokenAddresses,
    }
  } catch {
    return { watchAddress: null, tokenAddresses: [] }
  }
}

function persist() {
  const payload = {
    watchAddress: state.account.mode === 'watch' ? state.account.address : null,
    tokenAddresses: state.tokens.map((token) => token.address),
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Storage may be disabled; the app still works for this session.
  }
}

/* ------------------------------------------------------------------ */
/* Node status                                                         */
/* ------------------------------------------------------------------ */

function describeNodeError(error) {
  if (error instanceof NetworkIdentityError) {
    return {
      message: error.message,
      hint: 'A different chain answered on this endpoint. SilverPay only supports the BTCS L2 local development profile.',
    }
  }
  if (error instanceof L2Error) {
    if (error.code === 'timeout') {
      return {
        message: 'The local BTCS L2 node did not answer in time.',
        hint: 'Confirm the node is running, then refresh. Nothing was signed or sent.',
      }
    }
    if (error.code === 'transport_error') {
      return {
        message: 'The local BTCS L2 node is unreachable.',
        hint: `Start the node and make sure ${RPC_ENDPOINT} forwards to 127.0.0.1:8545. Nothing was signed or sent.`,
      }
    }
    return { message: error.message, hint: 'The node returned an unexpected response.' }
  }
  return { message: 'The node check failed.', hint: 'Refresh the page and try again.' }
}

async function refreshNode({ quiet = false } = {}) {
  if (!quiet) state.node.status = 'checking'
  renderNode()
  try {
    const identity = await state.client.verifyNetwork()
    const blockNumber = await state.client.getBlockNumber()
    state.node = {
      status: 'ready',
      identity,
      blockNumber,
      error: null,
      updatedAt: Date.now(),
    }
  } catch (error) {
    state.node = {
      status: 'error',
      identity: null,
      blockNumber: null,
      error: describeNodeError(error),
      updatedAt: Date.now(),
    }
  }
  renderNode()
  renderSendReadiness()
}

function renderNode() {
  const { status, identity, blockNumber, updatedAt, error } = state.node
  const chip = el('network-chip')
  const label = el('network-chip-label')

  chip.dataset.state = status
  if (status === 'ready') {
    label.textContent = `${BTCS_L2_LOCAL.nativeSymbol} L2 local · block ${blockNumber}`
    setBanner('')
  } else if (status === 'checking') {
    label.textContent = 'Checking node…'
  } else {
    label.textContent = 'Node unavailable'
  }

  setText('fact-profile', BTCS_L2_LOCAL.name)
  setText('fact-chain', identity ? identity.chainId : '—')
  setText('fact-client', identity ? safeText(identity.clientVersion, 80) : '—')
  setText('fact-block', blockNumber === null ? '—' : blockNumber.toString())
  setText('fact-rpc', RPC_ENDPOINT)
  setText('fact-updated', updatedAt === null ? 'never' : describeAge(Math.floor(updatedAt / 1000)))

  if (error) {
    setText('node-note', `${error.message} ${error.hint}`)
    setBanner(error.message, 'error')
  } else if (status === 'ready') {
    setText(
      'node-note',
      'Identity verified: chain 31337 and the BTCSL2/ client banner matched before any read. Inclusion in a block is not finality or settlement.',
    )
  }

  if (status === 'ready' && updatedAt !== null && Date.now() - updatedAt > STALE_AFTER_MS) {
    setBanner('The network snapshot is more than a minute old. Refresh before sending.', 'warning')
  }
}

/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

function renderAccount() {
  const { mode, address, balance, chainIdHex } = state.account
  setHidden('account-empty', mode !== 'none')
  setHidden('account-details', mode === 'none')
  setText('account-mode', mode === 'connected' ? 'Injected wallet' : mode === 'watch' ? 'Watch only' : 'Not connected')

  if (mode === 'none') {
    setHidden('receive-details', true)
    setHidden('receive-empty', false)
    renderSendReadiness()
    return
  }

  setText('account-address', address)
  setText('receive-address', address)
  setHidden('receive-details', false)
  setHidden('receive-empty', true)

  if (balance === null) {
    setText('account-balance', state.busy.account ? 'Loading balance…' : '—')
  } else {
    setText('account-balance', `${formatUnits(balance, 18)} ${BTCS_L2_LOCAL.nativeSymbol}`)
  }

  if (mode === 'watch') {
    setText('account-source', 'Read-only: no wallet is connected, so sending is disabled.')
  } else if (chainIdHex && chainIdHex.toLowerCase() !== BTCS_L2_LOCAL.chainIdHex) {
    setText('account-source', `The wallet is on chain ${chainIdHex}. SilverPay reads the local node, so switch the wallet to 31337 before signing.`)
  } else {
    setText('account-source', 'Signing is delegated to the injected wallet. SilverPay never sees a key.')
  }
  renderSendReadiness()
}

async function refreshAccount() {
  const { address } = state.account
  if (!address) return
  state.busy.account = true
  renderAccount()
  try {
    state.account.balance = await state.client.getBalance(address)
    if (state.account.mode === 'connected') {
      try {
        state.compat.pendingTag = await state.client.supportsPendingBlockTag(address)
      } catch {
        state.compat.pendingTag = null
      }
    }
  } catch (error) {
    state.account.balance = null
    const described = describeNodeError(error)
    toast(`${described.message} Balance not updated.`, 'error')
  } finally {
    state.busy.account = false
    renderAccount()
    renderSendReadiness()
  }
}

async function connectWallet() {
  if (!state.wallet.available) {
    toast('No injected EVM wallet detected. Use watch-only mode, or install a browser wallet.', 'error')
    return
  }
  try {
    const address = await state.wallet.connect()
    let chainIdHex = null
    try {
      await state.wallet.ensureLocalChain()
      chainIdHex = await state.wallet.getChainIdHex()
    } catch (error) {
      chainIdHex = await state.wallet.getChainIdHex().catch(() => null)
      if (error?.code === WALLET_ERROR_CODES.USER_REJECTED) {
        toast('The network switch was rejected. Reads work, but sending needs chain 31337.', 'warning')
      } else {
        toast(`The wallet could not switch to the local network: ${error.message}`, 'error')
      }
    }
    state.account = { mode: 'connected', address, chainIdHex, balance: null, source: 'wallet' }
    renderAccount()
    await refreshAccount()
    await refreshTokens()
    await scanHistory()
    toast(`Connected ${shortenAddress(address)}`, 'success')
  } catch (error) {
    const message = error instanceof WalletError ? error.message : 'The wallet connection failed.'
    toast(message, 'error')
  }
}

function disconnectWallet({ silent = false } = {}) {
  state.account = { mode: 'none', address: null, chainIdHex: null, balance: null, source: null }
  state.history = { status: 'idle', result: null, error: null }
  state.send = { status: 'idle', prepared: null, hash: null, message: '', hint: '', error: null }
  renderAccount()
  renderHistory()
  renderSend()
  persist()
  if (!silent) toast('Disconnected. Balances and history are cleared from this view.', 'info')
}

function watchAddress(address) {
  state.account = { mode: 'watch', address, chainIdHex: null, balance: null, source: 'watch' }
  renderAccount()
  refreshAccount()
  refreshTokens()
  scanHistory()
  persist()
  toast(`Watching ${shortenAddress(address)} (read-only)`, 'success')
}

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

function renderTokens() {
  const list = el('token-list')
  if (!list) return
  list.replaceChildren()
  setHidden('token-empty', state.tokens.length > 0)

  for (const token of state.tokens) {
    const item = document.createElement('li')
    item.className = 'list-item'

    const main = document.createElement('div')
    const title = document.createElement('span')
    title.className = 'item-title'
    title.textContent = `${sanitizeDisplayText(token.symbol, 16)} · ${sanitizeDisplayText(token.name, 40)}`
    const meta = document.createElement('span')
    meta.className = 'item-meta'
    meta.textContent = shortenAddress(token.address)
    main.append(title, meta)

    const right = document.createElement('div')
    right.className = 'item-right'
    const amount = document.createElement('span')
    amount.className = 'item-amount'
    amount.textContent =
      token.balance === null ? (state.busy.tokens ? '…' : '—') : `${formatUnits(token.balance, token.decimals)} ${sanitizeDisplayText(token.symbol, 16)}`
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'btn btn-quiet btn-small'
    remove.textContent = 'Remove'
    remove.addEventListener('click', () => {
      state.tokens = state.tokens.filter((entry) => entry.address !== token.address)
      persist()
      renderTokens()
      renderAssetOptions()
    })
    right.append(amount, remove)

    item.append(main, right)
    list.append(item)
  }
  renderAssetOptions()
}

async function refreshTokens() {
  const { address } = state.account
  if (!address) return
  if (state.tokens.length === 0) {
    renderTokens()
    return
  }
  state.busy.tokens = true
  renderTokens()
  const results = []
  for (const token of state.tokens) {
    try {
      const fresh = await readToken(state.client, token.address, address)
      results.push({ ...fresh, balance: fresh.balance })
    } catch (error) {
      results.push({ ...token, balance: null, error: error.message })
    }
  }
  state.tokens = results
  state.busy.tokens = false
  renderTokens()
}

async function addToken(value) {
  const check = validateTokenForm(value)
  setText('token-error', '')
  if (!check.ok) {
    setText('token-error', check.error)
    return
  }
  if (state.tokens.some((token) => token.address.toLowerCase() === check.address.toLowerCase())) {
    setText('token-error', 'That token is already tracked.')
    return
  }
  if (!state.account.address) {
    setText('token-error', 'Connect a wallet or watch an address first so balances can be read.')
    return
  }
  state.busy.tokens = true
  renderTokens()
  try {
    const token = await readToken(state.client, check.address, state.account.address)
    state.tokens = [...state.tokens, token]
    persist()
    el('token-address').value = ''
    toast(`Added ${token.symbol}`, 'success')
  } catch (error) {
    setText('token-error', error.message)
  } finally {
    state.busy.tokens = false
    renderTokens()
  }
}

function renderAssetOptions() {
  const select = el('send-asset')
  if (!select) return
  const previous = select.value
  select.replaceChildren()

  const native = document.createElement('option')
  native.value = 'native'
  native.textContent = `BTCS (native)`
  select.append(native)

  for (const token of state.tokens) {
    const option = document.createElement('option')
    option.value = token.address
    option.textContent = `${sanitizeDisplayText(token.symbol, 16)} (${shortenAddress(token.address)})`
    select.append(option)
  }

  if ([...select.options].some((option) => option.value === previous)) {
    select.value = previous
  }
  updateSendHint()
}

function selectedAsset() {
  const value = el('send-asset')?.value ?? 'native'
  if (value === 'native') {
    return { kind: 'native', symbol: 'BTCS', decimals: 18, balance: state.account.balance, token: null }
  }
  const token = state.tokens.find((entry) => entry.address === value)
  if (!token) return { kind: 'native', symbol: 'BTCS', decimals: 18, balance: state.account.balance, token: null }
  return { kind: 'erc20', symbol: token.symbol, decimals: token.decimals, balance: token.balance, token }
}

function updateSendHint() {
  const asset = selectedAsset()
  const hint = el('send-amount-hint')
  if (!hint) return
  if (asset.balance === null || asset.balance === undefined) {
    hint.textContent = `Available ${asset.symbol} balance is not loaded.`
  } else {
    hint.textContent = `Available: ${formatUnits(asset.balance, asset.decimals)} ${asset.symbol}`
  }
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

function renderHistory() {
  const list = el('history-list')
  const empty = el('history-empty')
  const note = el('history-note')
  if (!list) return
  list.replaceChildren()

  const { status, result, error } = state.history
  if (status === 'loading') {
    note.textContent = `Scanning the last ${DEFAULT_HISTORY_BLOCKS} canonical blocks…`
    empty.hidden = true
    return
  }
  if (status === 'error') {
    note.textContent = error ?? 'The block scan failed.'
    empty.hidden = true
    return
  }
  if (status !== 'ready' || !result) {
    note.textContent = 'History is a bounded scan of recent canonical blocks. It is not an indexer.'
    empty.hidden = true
    return
  }

  note.textContent = result.note
  empty.hidden = result.entries.length > 0

  for (const entry of result.entries) {
    const item = document.createElement('li')
    item.className = 'list-item'

    const main = document.createElement('div')
    const title = document.createElement('span')
    title.className = 'item-title'
    const direction = entry.from === state.account.address?.toLowerCase() ? 'Out' : 'In'
    title.textContent = `${direction} · ${formatUnits(entry.value, 18)} BTCS`
    const meta = document.createElement('span')
    meta.className = 'item-meta'
    meta.textContent = `Block ${entry.blockNumber} · ${shortenAddress(entry.hash, 10, 8)}`
    main.append(title, meta)

    const right = document.createElement('div')
    right.className = 'item-right'
    const stateLabel = document.createElement('span')
    stateLabel.className = 'pill pill-small'
    stateLabel.textContent = 'included'
    right.append(stateLabel)

    item.append(main, right)
    list.append(item)
  }
}

async function scanHistory() {
  const { address } = state.account
  if (!address) return
  state.history = { status: 'loading', result: null, error: null }
  renderHistory()
  try {
    const result = await scanRecentActivity({
      client: state.client,
      address,
      maxBlocks: DEFAULT_HISTORY_BLOCKS,
    })
    state.history = { status: 'ready', result, error: null }
  } catch (error) {
    const described = describeNodeError(error)
    state.history = { status: 'error', result: null, error: `${described.message} ${described.hint}` }
  }
  renderHistory()
}

/* ------------------------------------------------------------------ */
/* Send                                                                */
/* ------------------------------------------------------------------ */

function renderSendReadiness() {
  const { mode, chainIdHex } = state.account
  const nodeReady = state.node.status === 'ready'
  let text = 'Connect a wallet to send'
  if (mode === 'watch') text = 'Watch-only: sending disabled'
  else if (mode === 'connected' && chainIdHex && chainIdHex.toLowerCase() !== BTCS_L2_LOCAL.chainIdHex) text = 'Wallet on the wrong chain'
  else if (mode === 'connected' && !nodeReady) text = 'Waiting for the node'
  else if (mode === 'connected') text = 'Ready to send'

  setText('send-readiness', text)

  const compat = el('send-compat')
  if (compat) {
    const unsupported = mode === 'connected' && state.compat.pendingTag === false
    compat.hidden = !unsupported
    compat.textContent = unsupported
      ? 'Compatibility warning: this node rejects the "pending" block tag (-32602). Browser wallets commonly request a nonce with that tag, so signing may fail until the node implements it. The transaction is still prepared and validated locally.'
      : ''
  }

  const disabled = !(mode === 'connected' && nodeReady && chainIdHex?.toLowerCase() === BTCS_L2_LOCAL.chainIdHex)
  const review = el('send-review')
  if (review) review.disabled = disabled
  updateSendHint()
}

function resetSend() {
  state.send = { status: 'idle', prepared: null, hash: null, message: '', hint: '', error: null }
  setHidden('send-review-panel', true)
  setHidden('send-status', true)
  setHidden('send-status-actions', true)
}

function renderSend() {
  const { status, prepared, hash, message, hint } = state.send
  const panel = el('send-review-panel')
  if (panel) panel.hidden = prepared === null || status === 'submitting' || status === 'pending' || status === 'confirmed' || status === 'reverted'

  if (prepared) {
    setText('review-from', shortenAddress(prepared.from, 10, 8))
    setText('review-to', shortenAddress(prepared.recipient ?? prepared.to, 10, 8))
    if (prepared.kind === 'native') {
      setText('review-amount', `${formatUnits(prepared.value, 18)} BTCS`)
    } else {
      setText('review-amount', `${formatUnits(prepared.tokenAmount, prepared.tokenDecimals)} ${prepared.tokenSymbol}`)
    }
    setText('review-gas', prepared.gasLimit.toString())
    setText('review-fee-rate', `${formatUnits(prepared.maxFeePerGas, 9, 9)} gwei`)
    setText('review-fee', `${formatUnits(prepared.expectedMaxFee, 18, 12)} BTCS`)
    setText('review-network', `${BTCS_L2_LOCAL.name} (${BTCS_L2_LOCAL.chainId})`)
  }

  const statusBox = el('send-status')
  if (statusBox) statusBox.hidden = status === 'idle' || status === 'reviewing'
  setText('send-status-text', message)
  setText('send-status-hint', hint)
  setText('send-status-hash', hash ?? '')
  setHidden('send-status-actions', !hash || status === 'confirmed' || status === 'reverted' || status === 'pending')
}

async function reviewSend(event) {
  event.preventDefault()
  resetSend()
  const asset = selectedAsset()
  const form = {
    recipient: el('send-to').value,
    amount: el('send-amount').value,
    decimals: asset.decimals,
    balance: asset.balance,
    symbol: asset.symbol,
  }
  const check = validateSendForm(form)
  setText('send-to-error', check.errors.recipient ?? '')
  setText('send-amount-error', check.errors.amount ?? '')
  if (!check.ok) return

  state.send = { status: 'preparing', prepared: null, hash: null, message: 'Preparing transaction…', hint: '', error: null }
  renderSend()
  try {
    const prepared =
      asset.kind === 'native'
        ? await prepareNativeTransfer({
            client: state.client,
            from: state.account.address,
            to: form.recipient.trim(),
            amount: check.amount,
          })
        : await prepareTokenTransfer({
            client: state.client,
            from: state.account.address,
            to: form.recipient.trim(),
            amount: check.amount,
            tokenAddress: asset.token.address,
            tokenSymbol: asset.token.symbol,
            tokenDecimals: asset.token.decimals,
            tokenBalance: asset.token.balance,
          })
    state.send = { status: 'reviewing', prepared, hash: null, message: '', hint: '', error: null }
  } catch (error) {
    const described = describeTransferError(error)
    state.send = { status: 'error', prepared: null, hash: null, message: described.message, hint: described.hint, error: described.code }
  }
  renderSend()
}

async function confirmSend() {
  const prepared = state.send.prepared
  if (!prepared) return
  state.send = { ...state.send, status: 'submitting', message: 'Waiting for the wallet to sign…', hint: 'Approve the transaction in your wallet extension.', error: null }
  renderSend()

  let hash
  try {
    hash = await submitTransfer({ wallet: state.wallet, prepared })
  } catch (error) {
    const described = describeTransferError(error)
    state.send = {
      status: 'error',
      prepared,
      hash: null,
      message: described.message,
      hint: described.hint,
      error: described.code,
    }
    renderSend()
    return
  }

  state.send = {
    status: 'pending',
    prepared,
    hash,
    message: 'Submitted. Waiting for a receipt…',
    hint: 'The local development sequencer only includes transactions when a block is produced. SilverPay requests one block after submission.',
    error: null,
  }
  renderSend()

  try {
    const result = await confirmTransaction({
      client: state.client,
      hash,
      mine: true,
      onUpdate: (update) => {
        if (update.status === 'pending') {
          setText('send-status-text', 'Submitted. Waiting for a receipt…')
        }
      },
    })
    if (result.status === 'confirmed') {
      state.send = {
        status: 'confirmed',
        prepared,
        hash,
        message: `Confirmed in block ${result.blockNumber}.`,
        hint: 'Inclusion in a local canonical block is not finality or settlement. Re-check after a node restart.',
        error: null,
      }
      el('send-form').reset()
      await refreshAccount()
      await scanHistory()
    } else {
      state.send = {
        status: 'reverted',
        prepared,
        hash,
        message: `The transaction reverted in block ${result.blockNumber}. No value transfer was applied.`,
        hint: 'The fee was still charged. Check the token contract and the recipient before retrying.',
        error: 'reverted',
      }
    }
  } catch (error) {
    const described = describeTransferError(error)
    state.send = {
      status: 'error',
      prepared,
      hash,
      message: described.message,
      hint: described.hint,
      error: described.code,
    }
  }
  renderSend()
}

async function recheckTransaction() {
  const hash = state.send.hash
  if (!hash) return
  state.send = { ...state.send, message: 'Re-checking the transaction…', hint: '', error: null }
  renderSend()
  try {
    const status = await state.client.getTransactionStatus(hash)
    if (status.status === 'confirmed') {
      state.send = { ...state.send, status: 'confirmed', message: `Confirmed in block ${status.blockNumber}.`, hint: 'Inclusion is not finality.' }
    } else if (status.status === 'reverted') {
      state.send = { ...state.send, status: 'reverted', message: `Reverted in block ${status.blockNumber}.`, hint: 'No value transfer was applied; the fee was charged.' }
    } else if (status.status === 'pending') {
      state.send = { ...state.send, status: 'pending', message: 'Still pending in the development sequencer.', hint: 'Produce a block on the local node, then re-check.' }
    } else {
      state.send = { ...state.send, status: 'error', message: 'The node has no record of this transaction.', hint: 'Confirm the wallet and the reader point at the same node.' }
    }
  } catch (error) {
    const described = describeTransferError(error)
    state.send = { ...state.send, status: 'error', message: described.message, hint: described.hint }
  }
  renderSend()
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

function wireEvents() {
  el('refresh-node').addEventListener('click', () => refreshNode())
  el('connect-wallet').addEventListener('click', connectWallet)
  el('disconnect-wallet').addEventListener('click', () => disconnectWallet())

  el('copy-address').addEventListener('click', () => {
    if (state.account.address) copyText(state.account.address, 'Address copied.')
  })
  el('copy-receive').addEventListener('click', () => {
    if (state.account.address) copyText(state.account.address, 'Receiving address copied.')
  })

  el('watch-form').addEventListener('submit', (event) => {
    event.preventDefault()
    const check = validateWatchAddress(el('watch-address').value)
    setText('watch-error', check.ok ? '' : check.error)
    if (check.ok) watchAddress(check.address)
  })

  el('token-form').addEventListener('submit', (event) => {
    event.preventDefault()
    addToken(el('token-address').value)
  })
  el('refresh-tokens').addEventListener('click', () => refreshTokens())

  el('refresh-history').addEventListener('click', () => scanHistory())

  el('send-form').addEventListener('submit', reviewSend)
  el('send-asset').addEventListener('change', updateSendHint)
  el('send-cancel').addEventListener('click', resetSend)
  el('send-confirm').addEventListener('click', confirmSend)
  el('send-recheck').addEventListener('click', recheckTransaction)

  state.wallet.on('accountsChanged', (accounts) => {
    if (state.account.mode !== 'connected') return
    if (!Array.isArray(accounts) || accounts.length === 0) {
      disconnectWallet()
      toast('The wallet reports no account. Disconnected.', 'warning')
      return
    }
    state.account.address = accounts[0]
    state.account.balance = null
    renderAccount()
    refreshAccount()
    refreshTokens()
    scanHistory()
  })

  state.wallet.on('chainChanged', (chainIdHex) => {
    if (state.account.mode !== 'connected') return
    state.account.chainIdHex = typeof chainIdHex === 'string' ? chainIdHex : null
    renderAccount()
    if (state.account.chainIdHex?.toLowerCase() !== BTCS_L2_LOCAL.chainIdHex) {
      toast('The wallet switched away from chain 31337. Sending is disabled until it switches back.', 'warning')
    }
  })
}

function init() {
  const stored = loadStored()
  state.wallet = createInjectedWallet()
  const availability = el('wallet-availability')
  if (availability) {
    availability.textContent = state.wallet.available
      ? 'An injected wallet is available.'
      : 'No injected EVM wallet detected. Watch-only mode still works.'
  }
  if (!state.wallet.available) {
    el('connect-wallet').disabled = true
  }

  wireEvents()
  renderNode()
  renderAccount()
  renderTokens()
  renderHistory()
  renderSend()
  refreshNode()

  // Restore tracked tokens first, then the watch address (if any).
  if (stored.tokenAddresses.length > 0) {
    state.tokens = stored.tokenAddresses.map((address) => ({
      address,
      name: 'Loading…',
      symbol: '…',
      decimals: 18,
      balance: null,
    }))
    renderTokens()
  }
  if (stored.watchAddress) {
    watchAddress(stored.watchAddress)
  } else {
    refreshTokens()
  }

  window.setInterval(() => {
    renderNode()
    if (state.account.address) refreshAccount({ quiet: true })
  }, 30_000)
}

init()
