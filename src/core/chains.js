/**
 * Multi-chain configuration for SilverPay
 */

export const CHAINS = {
  // Bitcoin Mainnet
  BITCOIN: {
    id: 'bitcoin',
    name: 'Bitcoin',
    symbol: 'BTC',
    decimals: 8,
    type: 'utxo', // Bitcoin uses UTXO model
    derivationPath: "m/84'/0'/0'/0", // BIP84 native segwit
    network: 'mainnet',
    rpc: {
      endpoints: [
        // Public Bitcoin APIs - these are for data only, not for sending without our own implementation
        // We'll need to implement Bitcoin transaction broadcasting
      ]
    },
    explorer: 'https://blockstream.info',
    isEvm: false,
    addressPrefix: 'bc1' // bech32
  },

  // Bitcoin Testnet
  BITCOIN_TESTNET: {
    id: 'bitcoin-testnet',
    name: 'Bitcoin Testnet',
    symbol: 'TBTC',
    decimals: 8,
    type: 'utxo',
    derivationPath: "m/84'/1'/0'/0",
    network: 'testnet',
    isEvm: false,
    addressPrefix: 'tb1'
  },

  // Bitcoin Silver (BTCS L1) - need to research
  BTCS_L1: {
    id: 'btcs-l1',
    name: 'Bitcoin Silver',
    symbol: 'BTCS',
    decimals: 8,
    type: 'utxo',
    derivationPath: "m/84'/0'/0'/0", // Guessing - needs verification
    network: 'mainnet',
    isEvm: false,
    addressPrefix: 'B' // Based on README saying "Prefix: B / bs1"
  },

  // Ethereum Mainnet
  ETHEREUM: {
    id: 'ethereum',
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
    type: 'account',
    chainId: 1,
    derivationPath: "m/44'/60'/0'/0",
    rpc: {
      endpoints: [
        'https://eth.llamarpc.com',
        'https://rpc.ankr.com/eth',
        'https://cloudflare-eth.com'
      ]
    },
    explorer: 'https://etherscan.io',
    isEvm: true
  },

  // Ethereum Sepolia Testnet
  SEPOLIA: {
    id: 'sepolia',
    name: 'Sepolia',
    symbol: 'ETH',
    decimals: 18,
    type: 'account',
    chainId: 11155111,
    derivationPath: "m/44'/60'/0'/0",
    rpc: {
      endpoints: [
        'https://rpc.sepolia.org',
        'https://rpc2.sepolia.org'
      ]
    },
    explorer: 'https://sepolia.etherscan.io',
    isEvm: true,
    testnet: true
  },

  // BTCS L2 Local Development (existing)
  BTCS_L2_LOCAL: {
    id: 'btcs-l2-local',
    name: 'BTCS L2 Local Development',
    symbol: 'BTCS',
    decimals: 18,
    type: 'account',
    chainId: 31337,
    chainIdHex: '0x7a69',
    derivationPath: "m/44'/60'/0'/0", // EVM compatible
    rpc: {
      endpoints: ['/rpc'] // Proxy to local node
    },
    explorer: null,
    isEvm: true,
    local: true
  },

  // Polygon
  POLYGON: {
    id: 'polygon',
    name: 'Polygon',
    symbol: 'MATIC',
    decimals: 18,
    type: 'account',
    chainId: 137,
    derivationPath: "m/44'/60'/0'/0",
    rpc: {
      endpoints: [
        'https://polygon-rpc.com',
        'https://rpc.ankr.com/polygon'
      ]
    },
    explorer: 'https://polygonscan.com',
    isEvm: true
  }
};

export const DEFAULT_CHAINS = ['BTCS_L2_LOCAL']; // Start with what's working

export function getChain(chainId) {
  if (typeof chainId === 'number') {
    return Object.values(CHAINS).find(c => c.chainId === chainId);
  }
  if (typeof chainId === 'string') {
    return CHAINS[chainId] || Object.values(CHAINS).find(c => c.id === chainId);
  }
  return null;
}

export function getEvmChains() {
  return Object.values(CHAINS).filter(c => c.isEvm);
}

export function getUtxoChains() {
  return Object.values(CHAINS).filter(c => c.type === 'utxo');
}
