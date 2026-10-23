export const networks = {
  'btcs-l2-local': {
    id: 'btcs-l2-local',
    family: 'evm',
    name: 'BTCS L2 Local',
    chainId: '31337',
    symbol: 'BTCS',
    rpcUrl: 'http://127.0.0.1:8545',
    explorer: 'http://localhost:3001',
    testnet: false,
    chainName: 'BTCS L2 Local Development',
  },
}

export const defaultNetworkId = 'btcs-l2-local'
