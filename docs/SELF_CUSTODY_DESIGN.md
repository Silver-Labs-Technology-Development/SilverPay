# SilverPay Self-Custody Design

## Core Principles
1. **User controls keys** - Generated and stored locally, never sent to servers
2. **Recovery outlives product** - Standard BIP39 mnemonics, compatible with other wallets
3. **Local signing** - All transactions signed in browser
4. **Portable recovery** - Works if SilverPay disappears
5. **Multi-chain support** - With proper derivation paths per chain

## Architecture

### Key Management
- Generate BIP39 mnemonic (12/15/18/21/24 words)
- Derive keys using BIP32/BIP44/BIP49/BIP84/BIP86 as appropriate
- Store encrypted with user password using AES-GCM
- Never store unencrypted keys
- Clear from memory when locked

### Chain Support Strategy
1. **Bitcoin (BTC)** - BIP84 (native segwit, bc1q...) as default, support others
2. **Ethereum/EVM** - BIP44 path m/44'/60'/0'/0/i (ethers.js compatible)
3. **Bitcoin Silver (BTCS)** - Need to research compatibility with Bitcoin
4. **BTCS L2** - EVM compatible, chain ID 31337 (existing)

### Storage
- Encrypted keystore in localStorage (or IndexedDB)
- Key derivation for encryption using PBKDF2/Argon2
- Optional auto-lock timeout
- Never store mnemonic in plain text

### Dependencies to add
- `@scure/bip39` or use ethers' built-in (ethers has Mnemonic)
- `@scure/bip32` or use ethers HDNodeWallet
- `bitcoinjs-lib` for Bitcoin UTXO operations (if supporting Bitcoin)
- Or use `@noble/*` libraries (smaller, more secure)

But need to be mindful of bundle size. ethers v6 already has good BIP39/BIP32 support.

For Bitcoin specifically, we need:
- bitcoinjs-lib for transaction construction
- psbt support
- different address types (P2PKH, P2SH-P2WPKH, P2WPKH, P2TR)

Also need to consider browser compatibility.

### Recovery Testing
- Generate wallet in SilverPay, get mnemonic
- Restore in another wallet (e.g., Electrum for Bitcoin, MetaMask for EVM)
- Verify addresses match
- Verify can sign/receive

## Migration Plan
This is a breaking change from injected-wallet model. Need to:
1. Keep support for watch-only addresses (read-only)
2. Add "Create new wallet" vs "Import wallet" vs "Connect injected wallet" (optional)
3. Make it clear which mode is being used
