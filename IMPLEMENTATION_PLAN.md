# SilverPay Self-Custodial Transformation Plan

## Overview
Transform from injected-wallet-only EVM wallet to genuine self-custodial multi-chain wallet with local key management, BIP39 mnemonics, and support for Bitcoin, Ethereum, BTCS L1, BTCS L2.

## Phase 1: Core Infrastructure (Foundation)
- [ ] Create secure key management module (`src/core/keystore.js`)
- [ ] Implement BIP39 mnemonic generation/recovery using ethers
- [ ] Add encrypted storage (AES-GCM) with password protection
- [ ] Create wallet manager for multi-account/multi-chain
- [ ] Add crypto utilities (secure random, encryption)

## Phase 2: UI/UX Redesign
- [ ] Redesign onboarding flow (Create/Import/Watch/Connect modes)
- [ ] Add mnemonic display and backup verification
- [ ] Add unlock/lock functionality
- [ ] Update styling to match Silver Labs identity (charcoal/black, silver/white, BTCS gold #c9a84c)
- [ ] Add network selector (multi-chain support)
- [ ] Add settings/security tab

## Phase 3: Chain Support
### Bitcoin (BTC) - Priority 1
- [ ] Research derivation paths (BIP44 m/44'/0'/0/i, BIP49 m/49'/0'/0/i, BIP84 m/84'/0'/0/i)
- [ ] Add Bitcoin address generation
- [ ] Add Bitcoin transaction construction and signing
- [ ] Need Bitcoin libraries (consider @scure/btc-signer or bitcoinjs-lib)
- [ ] Add Bitcoin RPC/client

### Ethereum/EVM - Priority 2  
- [ ] Extend existing EVM support with local key signing
- [ ] Add support for mainnet/testnets with proper chain configs
- [ ] Use ethers Wallet for signing
- [ ] Keep local BTCS L2 as first EVM network

### Bitcoin Silver (BTCS L1) - Priority 3
- [ ] Research if compatible with Bitcoin (same address format?)
- [ ] Check btcs-core for wallet compatibility
- [ ] May use Bitcoin libraries with different network params

### BTCS L2 - Already exists
- [ ] Migrate to use local signing alongside injected

## Phase 4: RPC/Node Access
- [ ] Create multi-chain RPC manager
- [ ] Add support for public RPC providers
- [ ] Add user-configurable RPC endpoints
- [ ] Implement provider failover
- [ ] Add connection status per network
- [ ] Keep privacy considerations in mind

## Phase 5: Testing & Documentation
- [ ] Unit tests for crypto/derivation
- [ ] Test vectors for address generation
- [ ] Recovery tests
- [ ] Write recovery guide per chain
- [ ] Security audit of key storage
- [ ] Test in independent wallets

## Dependencies to Add
```json
{
  "@scure/bip39": "^1.3.0",
  "@scure/bip32": "^1.4.0", 
  "@scure/btc-signer": "^1.4.0",
  "qrcode": "^1.5.3"
}
```

Or use ethers more heavily (it has bip39/bip32 support). Let us check what's lighter/simpler.

## Security Requirements
- [ ] Keys never leave browser unencrypted
- [ ] Mnemonic only shown once with warnings
- [ ] Backup verification required
- [ ] Auto-lock after inactivity
- [ ] Clear sensitive data from memory
- [ ] No logging of secrets
- [ ] Encrypted storage with strong KDF
