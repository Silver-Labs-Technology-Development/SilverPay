# SilverPay Audit Report

**Date:** 2025-10-25  
**Repository:** /home/user/Silver-Labs/SilverPay  
**Branch:** master  
**Status:** Clean working tree  
**Mission:** Transform from injected-wallet-only BTCS L2 prototype to genuine self-custodial multi-chain wallet

## 1. Current State Summary

### What exists (working)
- **Frontend**: Vanilla JS + Vite browser app (`src/`) 
- **Network**: BTCS L2 local development (chain ID 31337) only
- **Signing**: Delegated to injected EIP-1193 wallet (MetaMask etc) - **NO local key management**
- **Features**: Connect/watch address, view balances, send native/ERC-20, scan history, track tokens
- **Security model**: "Never asks for private key or seed phrase" - explicitly non-custodial via delegation
- **Node access**: Via `/rpc` proxy to localhost:8545, with strict network identity verification
- **Storage**: Only watch address + tracked token addresses in localStorage (no secrets)
- **Tests**: 70 tests, 67 pass, 3 skipped
- **Dependencies**: `ethers@6.13.0`, `vite@6.4.5`

### What is missing (per README and directive)
- Seed phrase/private key generation and import
- Local key storage and signing
- Account recovery
- Multi-account management beyond injected wallet
- Other networks (Bitcoin, Ethereum mainnet/testnets, BTCS mainnet, etc.)
- Full HD wallet support
- BIP39/BIP32 derivation
- Recovery documentation and testing
- Proper multi-chain architecture

## 2. Architecture Analysis

### Current modules
```
src/
├── index.js           # DOM wiring, state management
├── l2/client.js       # JSON-RPC client with strict identity verification
├── l2/format.js       # BigInt formatting/parsing
├── l2/history.js      # Bounded block scanning
├── ui/forms.js        # Form validation
└── wallet/
    ├── injected.js    # EIP-1193 adapter (delegates signing)
    ├── assets.js      # ERC-20 handling
    └── send.js        # Transaction preparation/submission/confirmation
```

### Key constraints
- **Browser-based**: Must run in browser (Vite app)
- **EIP-1193 focused**: Currently assumes EVM-compatible chains
- **Strict security**: No keys stored/transmitted
- **Local node only**: Hardcoded for BTCS L2 local dev
- **No server backend**: Pure frontend app

## 3. Requirements vs Current State

| Requirement | Current | Gap |
|-------------|---------|-----|
| User controls keys (local generation) | No - delegated to injected | **Critical** - need full key management |
| No seed phrases sent to servers | Already compliant (never asked) | OK but need to implement generation |
| Recovery outlives product | Not implemented | **Critical** |
| Sign locally | No - delegated | **Critical** |
| Multi-chain support | Only BTCS L2 local (EVM) | **Critical** |
| Bitcoin support | None | **Major** |
| Ethereum/EVM mainnet/testnets | Only local dev chain | **Major** |
| BTCS (Bitcoin Silver) | Not implemented | **Major** |
| BIP39/BIP32/BIP44 support | None | **Critical** |
| HD wallet derivation | None | **Critical** |
| Secure local storage | Only non-sensitive data | Need encrypted storage for keys |
| Recovery testing in independent wallets | None | **Critical** |

## 4. Technology Assessment

### Available in dependencies
- `ethers@6.13.0` - Has wallet/key functionality, HDNodeWallet, Mnemonic, etc. Good for EVM
- `vite@6.4.5` - Build tool

### Need to add for full self-custody
- **Bitcoin**: Need bitcoinjs-lib or similar for Bitcoin UTXO handling, PSBT, different address types
- **Crypto**: Web Crypto API available in browsers, but need careful key derivation
- **BIP39**: ethers has Mnemonic support
- **BIP32**: ethers has HDNodeWallet
- **Storage encryption**: Need to encrypt private keys with user password/biometric
- **QR codes**: For receiving addresses

But adding heavy deps needs to be careful about bundle size and security.

## 5. Security Considerations

### Current security model (good)
- No keys ever touch the app code
- Strict network verification
- Only non-sensitive data persisted
- Clear separation of concerns

### New security model requirements
- Keys must stay local and encrypted
- Derive securely from mnemonic
- Never log/export secrets
- Memory clearing
- Strong encryption for storage
- Password/biometrics for unlocking
- Clear warnings about recovery

## 6. Recommended Approach

This is a fundamental rewrite of the wallet model. I need to:
1. Design a secure local key management system
2. Support multiple chains with proper derivation paths
3. Implement BIP39 mnemonic generation/recovery
4. Add Bitcoin support (separate from EVM)
5. Maintain backward compatibility where possible? Or do clean slate
6. Keep it browser-based
7. Encrypt keys at rest

Given this is a prototype and the directive is very clear about the new direction, I should plan a major refactor while preserving good patterns from current codebase.

