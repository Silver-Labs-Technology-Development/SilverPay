// Token Management for SilverPay
// Handles ERC-20 token balance reading and display

/**
 * Read ERC-20 token balance for a given address
 * @param {string} tokenAddress - Token contract address
 * @param {string} userAddress - User's wallet address
 * @returns {Promise<Object>} {balance, decimals, symbol, name}
 */
export async function readTokenBalance(tokenAddress, userAddress) {
  const network = getNetwork()
  if (!userAddress || network.family !== 'evm') {
    return { balance: 0n, decimals: 18, symbol: '', name: '' }
  }

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
        tokenContract.balanceOf(userAddress),
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
    console.error('Failed to read token balance:', error)
  }

  return { balance: 0n, decimals: 18, symbol: '', name: '' }
}

/**
 * Format token balance for display
 * @param {bigint} balance - Raw balance from contract
 * @param {number} decimals - Token decimals
 * @returns {string} Formatted balance string
 */
export function formatTokenBalance(balance, decimals) {
  if (balance === 0n) return '0'

  const whole = Number(balance / (10n ** decimals)).toString()
  const fractional = Number(balance % (10n ** decimals))
    .toString()
    .padStart(decimals, '0')
    .slice(0, decimals)

  return `${whole}.${fractional}`
}

/**
 * Get token symbol
 * @param {number} decimals - Token decimals
 * @returns {string} Token symbol
 */
export function getTokenSymbolByDecimals(decimals) {
  return decimals <= 9 ? 'SLV' : 'BTCS'
}

/**
 * Check if address is a valid ERC-20 token contract
 * @param {string} address - Address to check
 * @returns {Promise<boolean>}
 */
export async function validateTokenContract(address) {
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return false

  try {
    if (typeof window.ethereum !== 'undefined') {
      const provider = new BrowserProvider(window.ethereum)
      const abi = ['function __EXTCODESIZE() view returns (uint256)']
      const code = await provider.getCode(address)
      return code !== '0x' && code.length > 2
    }
  } catch (error) {
    console.error('Failed to validate token contract:', error)
  }

  return false
}
