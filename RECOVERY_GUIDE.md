# SilverPay Recovery Guide

## Overview
SilverPay is a self-custodial wallet. Your recovery phrase (mnemonic) is the only way to recover your funds if you lose access to this app, device, or if SilverPay disappears.

## Important Warnings
- **Never share your recovery phrase** with anyone, including Silver Labs support
- **Never enter your recovery phrase** on websites, apps, or forms
- **Store it offline** - write on paper, store in a secure location
- **SilverPay cannot recover your funds** if you lose your recovery phrase
- **If someone has your recovery phrase, they have access to all your funds**

## Supported Recovery Methods

### In SilverPay
1. Open SilverPay
2. Click "Import Existing Wallet"
3. Enter your 12-word recovery phrase
4. Set a new password
5. Your wallet will be restored

### In Other Compatible Wallets

#### For Ethereum/EVM chains
- **MetaMask**: Import with Secret Recovery Phrase
- **Rabby**: Import wallet → Seed Phrase
- **Trust Wallet**: I already have a wallet → Secret phrase
- **Use derivation path**: m/44'/60'/0'/0 (BIP44)

#### For Bitcoin (when implemented)
- **Electrum**: Standard wallet → I already have a seed → BIP39 seed
- **BlueWallet**: Add wallet → Import wallet → Mnemonic
- **Sparrow Wallet**: File → New Wallet → Import Seed
- **Use derivation path**: m/84'/0'/0'/0 (BIP84 for native SegWit)

#### For Bitcoin Silver (BTCS L1)
- Check if compatible with Bitcoin wallets using same derivation
- May need specific wallet support
- Address format may differ

## Derivation Paths Used
| Chain | Derivation Path | Address Type |
|-------|----------------|--------------|
| Ethereum/EVM | m/44'/60'/0'/0 | EIP-55 checksummed |
| Bitcoin (Native SegWit) | m/84'/0'/0'/0 | bc1q... (bech32) |
| Bitcoin (Nested SegWit) | m/49'/0'/0'/0 | 3... (P2SH-P2WPKH) |
| Bitcoin (Legacy) | m/44'/0'/0'/0 | 1... (P2PKH) |

## Testing Recovery
Before sending significant funds:
1. Create a test wallet with a new mnemonic
2. Write down the mnemonic
3. Delete/reset the wallet in SilverPay
4. Restore using the mnemonic
5. Verify addresses match
6. Test with a small amount first

## What If SilverPay Disappears?
1. Download any compatible wallet software
2. Import your recovery phrase using the correct derivation path
3. Your funds will be accessible on the blockchain
4. No need for SilverPay servers or accounts
