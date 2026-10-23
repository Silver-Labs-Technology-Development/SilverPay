// NFT Management for SilverPay
// Handles ERC-721 and ERC-1155 NFT reading and display

/**
 * Read NFT metadata from a contract
 * @param {string} nftContractAddress - NFT contract address
 * @param {number} tokenId - Token ID to read
 * @returns {Promise<Object>} NFT metadata
 */
export async function readNFTMetadata(nftContractAddress, tokenId) {
  const network = getNetwork()
  if (!nftContractAddress || !tokenId || network.family !== 'evm') {
    return { 
      name: '', 
      description: '', 
      image: '', 
      error: 'Invalid network or parameters' 
    }
  }

  try {
    if (typeof window.ethereum !== 'undefined') {
      const provider = new BrowserProvider(window.ethereum)
      const erc721Abi = [
        'function name() view returns (string)',
        'function symbol() view returns (string)',
        'function tokenURI(uint256 tokenId) view returns (string)',
        'function balanceOf(address owner) view returns (uint256)',
      ]
      const erc1155Abi = [
        'function name() view returns (string)',
        'function symbol() view returns (string)',
        'function uri(uint256 id) view returns (string)',
        'function balanceOf(address owner, uint256 id) view returns (uint256)',
      ]
      
      // Try ERC-721 first
      try {
        const nftContract = new ethers.Contract(nftContractAddress, erc721Abi, provider)
        const [name, symbol, tokenURI] = await Promise.all([
          nftContract.name(),
          nftContract.symbol(),
          nftContract.tokenURI(tokenId),
        ])
        const balance = await nftContract.balanceOf(address)
        
        // Fetch metadata from IPFS/HTTP URL
        let metadata = {}
        if (tokenURI && tokenURI.startsWith('ipfs://')) {
          // Handle IPFS gateway
          const ipfsHash = tokenURI.replace('ipfs://', '')
          // Try gateway URLs
          const gatewayResponses = await fetch(`https://gateway.ipfs.io/ipfs/${ipfsHash}`)
          if (gatewayResponses.ok) {
            metadata = await gatewayResponses.json()
          }
        } else if (tokenURI && tokenURI.startsWith('http')) {
          const metadataResponses = await fetch(tokenURI)
          if (metadataResponses.ok) {
            metadata = await metadataResponses.json()
          }
        }
        
        return {
          name,
          symbol,
          description: metadata.description || '',
          image: metadata.image || '',
          tokenURI,
          mediaRetrievable: !!metadata.image,
        }
      } catch (err721) {
        // Try ERC-1155
        try {
          const nftContract = new ethers.Contract(nftContractAddress, erc1155Abi, provider)
          const [name, symbol, uri] = await Promise.all([
            nftContract.name(),
            nftContract.symbol(),
            nftContract.uri(tokenId),
          ])
          const balance = await nftContract.balanceOf(address, tokenId)
          
          // Fetch metadata
          let metadata = {}
          if (uri && uri.startsWith('ipfs://')) {
            const ipfsHash = uri.replace('ipfs://', '')
            const gatewayResponses = await fetch(`https://gateway.ipfs.io/ipfs/${ipfsHash}`)
            if (gatewayResponses.ok) {
              metadata = await gatewayResponses.json()
            }
          } else if (uri && uri.startsWith('http')) {
            const metadataResponses = await fetch(uri)
            if (metadataResponses.ok) {
              metadata = await metadataResponses.json()
            }
          }
          
          return {
            name,
            symbol,
            description: metadata.description || '',
            image: metadata.image || '',
            tokenURI: uri,
            mediaRetrievable: !!metadata.image,
            balance: Number(balance > 0),
          }
        } catch (err1155) {
          return { 
            name: '', 
            description: '', 
            image: '', 
            error: 'NFT contract read failed' 
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to read NFT metadata:', error)
    return { name: '', description: '', image: '', error: error.message }
  }
}

/**
 * Format NFT display information
 * @param {Object} nft - NFT metadata object
 * @returns {Object} Formatted display data
 */
export function formatNFTDisplay(nft) {
  if (nft.error) return { ...nft, displayImage: '/placeholder-nft.png' }
  
  const displayImage = nft.image ? nft.image : '/placeholder-nft.png'
  const name = nft.name || 'Unnamed NFT'
  const collection = nft.symbol || 'Unknown Collection'
  const tokenId = nft.tokenId || '0'
  
  return {
    displayImage,
    name,
    collection,
    tokenId,
    description: nft.description || '',
    mediaRetrievable: nft.mediaRetrievable || false,
  }
}

/**
 * Check if address is a valid NFT contract
 * @param {string} address - Address to check
 * @returns {Promise<boolean>}
 */
export async function validateNFTContract(address) {
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return false

  try {
    if (typeof window.ethereum !== 'undefined') {
      const provider = new BrowserProvider(window.ethereum)
      // Check if contract has ERC-721 or ERC-1155 functions
      const code = await provider.getCode(address)
      if (code === '0x' || code.length <= 2) return false
      
      // Try to read name function (present in both ERC-721 and ERC-1155)
      try {
        const abi = ['function name() view returns (string)']
        const { ethers } = require('/home/user/Silver-Labs/SilverForge-Studio/node_modules/ethers/dist/ethers.js')
        const nftContract = new ethers.Contract(address, abi, provider)
        const name = await nftContract.name()
        return name && name !== ''
      } catch {
        return false
      }
    }
  } catch (error) {
    console.error('Failed to validate NFT contract:', error)
  }

  return false
}
