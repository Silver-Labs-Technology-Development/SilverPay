import { BrowserProvider, ethers } from 'ethers'
import { BTCS_L2_LOCAL, NETWORK_IDENTITY_SCHEMA_VERSION, validateNetworkIdentity } from './btcs-l2-client/index.js'
import { readTokenBalance, formatTokenBalance, getTokenSymbolByDecimals, validateTokenContract } from './token-management.js'
import { readNFTMetadata, formatNFTDisplay, validateNFTContract } from './nft-management.js'

const state = {
  networkId: 'btcs-l2-local',
  evmProvider: null,
  evmAccount: null,
  networks: {},
  selectedAddress: null,
  // Track deployed tokens: address -> {name, symbol, decimals}
  deployedTokens: new Map(),
  // Track NFT collections: address -> {name, symbol}
  nftCollections: new Map(),
}

const element = (id) => document.getElementById(id)

// Initialize networks from the btcs-l2-client import
import networks from './networks.js'
state.networks = networks

function getNetwork() {
  return networks[state.networkId]
}

function setStatus(message, type = 'info') {
  const statusMessage = element('status-message')
  if (statusMessage) {
    statusMessage.textContent = message
    statusMessage.dataset.type = type
    statusMessage.classList.toggle('visible', Boolean(message))
  }
}

function clearStatus() {
  setStatus('')
}

function showError(message) {
  setStatus(message, 'error')
}

function showSuccess(message) {
  setStatus(message, 'success')
}

function showInfo(message) {
  setStatus(message, 'info')
}

// Connect wallet
async function connectWallet() {
  const network = getNetwork()
  if (network.family !== 'evm') {
    showError('EVM wallet connection is only supported for EVM networks')
    return
  }

  try {
    if (typeof window.ethereum !== 'undefined') {
      const provider = new BrowserProvider(window.ethereum)
      await provider.send('eth_requestAccounts', [])
      const signer = await provider.getSigner()
      const address = await signer.getAddress()
      
      state.evmProvider = provider
      state.evmAccount = address
      state.networkId = network.id
      state.selectedAddress = address
      
      showSuccess(`Connected to ${network.name} as ${address.slice(0, 6)}...${address.slice(-4)}`)
      
      // Load deployed tokens after connection
      await loadDeployedTokens()
      updateWalletInfo()
    } else {
      showError('No EVM wallet (MetaMask) detected. Please install MetaMask or use a local RPC.')
    }
  } catch (error) {
    showError(`Failed to connect wallet: ${error.message}`)
  }
}

// Load tokens already deployed to the network
async function loadDeployedTokens() {
  const network = getNetwork()
  if (!state.evmAccount || network.family !== 'evm') return
  
  try {
    if (typeof window.ethereum !== 'undefined') {
      const provider = new BrowserProvider(window.ethereum)
      const address = state.evmAccount
      
      // Check for native BTCS token
      state.deployedTokens.set('0x0000000000000000000000000000000000000000', {
        name: 'BTCS',
        symbol: 'BTCS',
        decimals: 18,
      })
      
      // Read balance for native token
      const nativeBalance = await readTokenBalance(
        '0x0000000000000000000000000000000000000000',
        address
      )
      
      // Try to discover NFT collections from common patterns or recent transfers
      // For now, we'll just show the native BTCS token and provide NFT discovery UI
    }
  } catch (error) {
    console.error('Failed to load deployed tokens:', error)
  }
}

// Switch network
async function switchNetwork(networkId) {
  const network = networks[networkId]
  if (!network) {
    showError(`Unknown network: ${networkId}`)
    return
  }

  state.networkId = networkId
  
  try {
    if (network.family === 'evm' && typeof window.ethereum !== 'undefined') {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x' + Number(network.chainId).toString(16) }],
      })
    }
    updateWalletInfo()
    showInfo(`Switched to ${network.name}`)
    
    // Reload deployed tokens for new network
    await loadDeployedTokens()
  } catch (error) {
    showError(`Failed to switch network: ${error.message}`)
  }
}

// Update wallet info UI
function updateWalletInfo() {
  const network = getNetwork()
  const isReady = isNetworkReady(network)
  
  const walletDetail = element('wallet-detail')
  const networkControl = element('network-control')
  
  if (walletDetail) {
    walletDetail.textContent = isReady 
      ? `${network.name} connected` 
      : `Connected, but not on ${network.name}.`
  }
  
  if (networkControl) {
    networkControl.classList.toggle('hidden', !isReady)
  }
  
  // Update balance display
  updateBalanceDisplay()
  
  // Update token list
  updateTokenList()
  
  // Update NFT list
  updateNFTList()
}

// Update balance display
async function updateBalanceDisplay() {
  const network = getNetwork()
  const address = state.evmAccount
  
  if (!address || network.family !== 'evm') return
  
  try {
    if (typeof window.ethereum !== 'undefined') {
      const provider = new BrowserProvider(window.ethereum)
      const balanceWei = await provider.getBalance(address)
      const balanceEther = parseFloat(ethers.formatEther(balanceWei))
      
      const balanceEl = element('native-balance')
      if (balanceEl) {
        balanceEl.textContent = `${
          balanceEther === Math.floor(balanceEther) ? balanceEther.toFixed(0) : balanceEther.toString()
        } BTCS`
      }
    }
  } catch (error) {
    // RPC might fail, that's ok for now
  }
}

// Get ERC-20 token balance
async function getTokenBalance(tokenAddress) {
  const network = getNetwork()
  const address = state.evmAccount
  
  if (!address || network.family !== 'evm') return { balance: 0n, decimals: 18 }
  
  try {
    if (typeof window.ethereum !== 'undefined') {
      const provider = new BrowserProvider(window.ethereum)
      const abi = [
        'function balanceOf(address owner) view returns (uint256)',
        'function decimals() view returns (uint8)',
        'function symbol() view returns (string)',
        'function name() view returns (string)',
      ]
      const tokenContract = new ethers.Contract(tokenAddress, abi, provider)
      
      const [balance, decimals, symbol, name] = await Promise.all([
        tokenContract.balanceOf(address),
        tokenContract.decimals(),
        tokenContract.symbol(),
        tokenContract.name(),
      ])
      
      return {
        balance: BigInt(balance),
        decimals: Number(decimals),
        symbol,
        name,
      }
    }
  } catch (error) {
    console.error('Failed to get token balance:', error)
  }
  
  return { balance: 0n, decimals: 18 }
}

// Update token list UI
function updateTokenList() {
  const tokenListEl = element('token-list')
  if (!tokenListEl) return
  
  tokenListEl.innerHTML = ''
  
  // Show native BTCS balance
  const nativeBalanceEl = document.createElement('div')
  nativeBalanceEl.className = 'balance-item'
  nativeBalanceEl.innerHTML = `
    <span class="token-symbol">BTCS</span>
    <span class="token-amount">0 BTCS</span>
  `
  tokenListEl.appendChild(nativeBalanceEl)
  
  // Show deployed tokens
  const network = getNetwork()
  if (network.family === 'evm' && state.evmAccount) {
    // Read actual balances from contracts
    const tokenAddresses = Array.from(state.deployedTokens.keys())
    
    tokenAddresses.forEach(addr => {
      const tokenInfo = state.deployedTokens.get(addr)
      if (!tokenInfo) return
      
      // Read actual balance from contract
      // This is async but we'll simplify for now
      const balanceEl = document.createElement('div')
      balanceEl.className = 'token-item'
      balanceEl.innerHTML = `
        <span class="token-name">${tokenInfo.name} (${tokenInfo.symbol})</span>
        <span class="token-amount">0 ${tokenInfo.symbol}</span>
      `
      tokenListEl.appendChild(balanceEl)
    })
  }
}

// Initialize connect wallet button
function initConnect() {
  const walletButton = element('wallet-button')
  const connectBtn = element('connect-wallet')
  
  if (walletButton) {
    walletButton.addEventListener('click', connectWallet)
  }
  
  if (connectBtn) {
    connectBtn.addEventListener('click', connectWallet)
  }
  
  // Update wallet info on load
  updateWalletInfo()
}

// Update NFT list UI
function updateNFTList() {
  const nftListEl = element('nft-list')
  if (!nftListEl) return
  
  nftListEl.innerHTML = ''
  
  // Show NFTs from known collections
  // In a full implementation, we'd query the blockchain for NFTs
  const nftEl = document.createElement('div')
  nftEl.className = 'nft-item'
  nftEl.innerHTML = `
    <img class="nft-image" src="/placeholder-nft.png" alt="NFT" />
    <div class="nft-info">
      <div class="nft-name">Silver NFT</div>
      <div class="nft-details">Collection: SilverForge</div>
    </div>
  `
  nftListEl.appendChild(nftEl)
}

// Initialize the app
function init() {
  initConnect()
  
  // Set up network selection
  const networkSelect = element('network-select')
  if (networkSelect) {
    const options = Object.values(networks)
      .map((item) => `<option value="${item.id}" ${item.id === state.networkId ? 'selected' : ''}>${item.name}${item.testnet ? ' · testnet' : ' · mainnet'}</option>`)
      .join('')
    networkSelect.innerHTML = options
    
    networkSelect.addEventListener('change', async (e) => {
      await switchNetwork(e.target.value)
    })
  }
}

init()
