/**
 * KeyStore - Secure local key management for SilverPay
 * Handles BIP39 mnemonics, HD wallet derivation, and encrypted storage
 */

import { ethers } from 'ethers';
import { encryptWithPassword, decryptWithPassword } from './crypto.js';

const STORAGE_KEY = 'silverpay.keystore.v1';
const DEFAULT_LOCK_TIMEOUT = 15 * 60 * 1000; // 15 minutes

// Derivation paths
export const DERIVATION_PATHS = {
  BTC_BIP44: "m/44'/0'/0'/0",      // Legacy P2PKH
  BTC_BIP49: "m/49'/0'/0'/0",      // P2SH-P2WPKH (nested segwit)
  BTC_BIP84: "m/84'/0'/0'/0",      // P2WPKH (native segwit)
  BTC_BIP86: "m/86'/0'/0'/0",      // P2TR (taproot)
  ETH_BIP44: "m/44'/60'/0'/0",     // Ethereum
  BTCS_BIP44: "m/44'/0'/0'/0",     // Bitcoin Silver (same as BTC initially?)
};

export class KeyStoreError extends Error {
  constructor(message, code = 'KEYSTORE_ERROR') {
    super(message);
    this.name = 'KeyStoreError';
    this.code = code;
  }
}

export class KeyStore {
  constructor() {
    this.hdWallet = null;
    this.password = null;
    this.lockTimer = null;
    this.accounts = new Map(); // chain -> accounts
    this.isUnlocked = false;
    this.lockTimeout = DEFAULT_LOCK_TIMEOUT;
    this.onLock = null;
  }

  /**
   * Generate a new wallet with BIP39 mnemonic
   */
  static generateMnemonic(strength = 128) {
    // strength: 128 = 12 words, 160 = 15 words, 192 = 18 words, 224 = 21 words, 256 = 24 words
    const wallet = ethers.Wallet.createRandom();
    return wallet.mnemonic.phrase;
  }

  /**
   * Validate mnemonic
   */
  static validateMnemonic(mnemonic) {
    try {
      ethers.Mnemonic.fromPhrase(mnemonic);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create keystore from mnemonic
   */
  async createFromMnemonic(mnemonic, password) {
    if (!KeyStore.validateMnemonic(mnemonic)) {
      throw new KeyStoreError('Invalid mnemonic phrase', 'INVALID_MNEMONIC');
    }
    if (!password || password.length < 8) {
      throw new KeyStoreError('Password must be at least 8 characters', 'WEAK_PASSWORD');
    }

    try {
      const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic);
      const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonicObj);
      
      // Encrypt the mnemonic
      const encryptedMnemonic = await encryptWithPassword(mnemonic, password);
      
      const keystoreData = {
        version: 1,
        encryptedMnemonic,
        createdAt: Date.now(),
        // Don't store derived accounts until needed - derive on unlock
      };
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(keystoreData));
      
      // Unlock immediately
      this.hdWallet = hdNode;
      this.password = password;
      this.isUnlocked = true;
      this.resetLockTimer();
      
      return {
        success: true,
        address: hdNode.address // For EVM
      };
    } catch (error) {
      throw new KeyStoreError(`Failed to create wallet: ${error.message}`, 'CREATE_FAILED');
    }
  }

  /**
   * Load and unlock existing keystore
   */
  async unlock(password) {
    if (!password) {
      throw new KeyStoreError('Password required', 'PASSWORD_REQUIRED');
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        throw new KeyStoreError('No wallet found', 'NO_WALLET');
      }
      
      const keystoreData = JSON.parse(stored);
      const mnemonic = await decryptWithPassword(keystoreData.encryptedMnemonic, password);
      
      if (!KeyStore.validateMnemonic(mnemonic)) {
        throw new KeyStoreError('Invalid password or corrupted wallet', 'UNLOCK_FAILED');
      }
      
      const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic);
      const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonicObj);
      
      this.hdWallet = hdNode;
      this.password = password;
      this.isUnlocked = true;
      this.resetLockTimer();
      
      return { success: true };
    } catch (error) {
      if (error instanceof KeyStoreError) throw error;
      throw new KeyStoreError('Failed to unlock wallet', 'UNLOCK_FAILED');
    }
  }

  /**
   * Lock the wallet
   */
  lock() {
    this.hdWallet = null;
    this.password = null;
    this.isUnlocked = false;
    this.accounts.clear();
    if (this.lockTimer) {
      clearTimeout(this.lockTimer);
      this.lockTimer = null;
    }
    if (this.onLock) {
      this.onLock();
    }
  }

  /**
   * Check if wallet exists
   */
  static hasWallet() {
    return localStorage.getItem(STORAGE_KEY) !== null;
  }

  /**
   * Reset auto-lock timer
   */
  resetLockTimer() {
    if (this.lockTimer) {
      clearTimeout(this.lockTimer);
    }
    if (this.lockTimeout > 0 && this.isUnlocked) {
      this.lockTimer = setTimeout(() => {
        this.lock();
      }, this.lockTimeout);
    }
  }

  /**
   * Get EVM account (ethers wallet)
   */
  getEvmAccount(index = 0, path = DERIVATION_PATHS.ETH_BIP44) {
    if (!this.isUnlocked || !this.hdWallet) {
      throw new KeyStoreError('Wallet is locked', 'WALLET_LOCKED');
    }
    
    const fullPath = `${path}/${index}`;
    const account = this.hdWallet.derivePath(fullPath);
    return new ethers.Wallet(account.privateKey);
  }

  /**
   * Get Bitcoin account info (placeholder - needs bitcoin library)
   */
  getBitcoinAccount(index = 0, path = DERIVATION_PATHS.BTC_BIP84) {
    if (!this.isUnlocked || !this.hdWallet) {
      throw new KeyStoreError('Wallet is locked', 'WALLET_LOCKED');
    }
    
    // For now, derive using ethers and note that we need proper Bitcoin derivation
    const fullPath = `${path}/${index}`;
    const account = this.hdWallet.derivePath(fullPath);
    return {
      index,
      path: fullPath,
      publicKey: account.publicKey,
      privateKey: account.privateKey,
      // address would need Bitcoin-specific derivation
      address: null
    };
  }

  /**
   * Get all accounts for a chain
   */
  getAccounts(chain, count = 5) {
    const accounts = [];
    if (chain === 'ethereum' || chain === 'evm') {
      for (let i = 0; i < count; i++) {
        const wallet = this.getEvmAccount(i);
        accounts.push({
          index: i,
          address: wallet.address,
          type: 'evm'
        });
      }
    } else if (chain === 'bitcoin') {
      for (let i = 0; i < count; i++) {
        accounts.push(this.getBitcoinAccount(i));
      }
    }
    return accounts;
  }

  /**
   * Export mnemonic (requires password confirmation - caller must verify)
   */
  async exportMnemonic(password) {
    if (!this.isUnlocked) {
      throw new KeyStoreError('Wallet is locked', 'WALLET_LOCKED');
    }
    if (password !== this.password) {
      throw new KeyStoreError('Invalid password', 'INVALID_PASSWORD');
    }
    // Return from the hdWallet mnemonic
    return this.hdWallet.mnemonic.phrase;
  }

  /**
   * Delete wallet (requires password)
   */
  async deleteWallet(password) {
    if (!this.isUnlocked) {
      // Try to unlock first
      await this.unlock(password);
    }
    if (password !== this.password) {
      throw new KeyStoreError('Invalid password', 'INVALID_PASSWORD');
    }
    localStorage.removeItem(STORAGE_KEY);
    this.lock();
    return true;
  }
}

// Singleton instance
export const keyStore = new KeyStore();
