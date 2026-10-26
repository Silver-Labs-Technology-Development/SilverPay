/**
 * SilverPay Self-Custodial Wallet App
 * Main application with local key management
 */

import { keyStore } from './core/keystore.js';
import { CHAINS, getChain } from './core/chains.js';
import { OnboardingUI } from './ui/onboarding.js';
import { ethers } from 'ethers';

class SilverPayApp {
  constructor() {
    this.currentChain = CHAINS.BTCS_L2_LOCAL;
    this.accounts = [];
    this.currentAccountIndex = 0;
  }

  async init() {
    const appContainer = document.getElementById('app');
    
    // Check if wallet exists
    if (!keyStore.isUnlocked && KeyStore.hasWallet()) {
      OnboardingUI.show(appContainer, {
        onComplete: () => this.showWallet(),
        onInjected: () => this.showInjectedWallet()
      });
    } else if (!KeyStore.hasWallet()) {
      OnboardingUI.show(appContainer, {
        onComplete: () => this.showWallet(),
        onInjected: () => this.showInjectedWallet()
      });
    } else {
      this.showWallet();
    }
  }

  showWallet() {
    const appContainer = document.getElementById('app');
    appContainer.innerHTML = `
      <div class="wallet-app">
        <header class="wallet-header">
          <div class="brand">
            <span class="brand-mark">S</span>
            <h1>SilverPay</h1>
          </div>
          <div class="header-actions">
            <select id="chain-selector">
              <option value="BTCS_L2_LOCAL">BTCS L2 Local</option>
              <option value="ETHEREUM">Ethereum</option>
              <option value="SEPOLIA">Sepolia</option>
            </select>
            <button class="btn btn-quiet" id="lock-wallet">Lock</button>
          </div>
        </header>
        
        <main class="wallet-main">
          <section class="card">
            <h2>Account</h2>
            <div id="account-info">
              <code id="current-address">Loading...</code>
              <button class="btn btn-quiet" id="copy-address">Copy</button>
            </div>
            <p class="balance" id="balance">0.00 ${this.currentChain.symbol}</p>
          </section>
          
          <section class="card">
            <h2>Send</h2>
            <form id="send-form">
              <label>To</label>
              <input type="text" id="send-to" placeholder="0x...">
              <label>Amount</label>
              <input type="text" id="send-amount" placeholder="0.0">
              <button type="submit" class="btn btn-primary">Send</button>
            </form>
          </section>
          
          <section class="card">
            <h2>Receive</h2>
            <p>Your address:</p>
            <code id="receive-address">Loading...</code>
            <button class="btn" id="copy-receive">Copy Address</button>
          </section>
        </main>
      </div>
    `;
    
    this.loadAccount();
    this.setupEventListeners();
  }

  loadAccount() {
    try {
      if (this.currentChain.isEvm) {
        const wallet = keyStore.getEvmAccount(this.currentAccountIndex);
        document.getElementById('current-address').textContent = wallet.address;
        document.getElementById('receive-address').textContent = wallet.address;
        this.currentWallet = wallet;
      }
    } catch (error) {
      console.error('Failed to load account:', error);
    }
  }

  setupEventListeners() {
    document.getElementById('lock-wallet').onclick = () => {
      keyStore.lock();
      location.reload();
    };
    
    document.getElementById('copy-address').onclick = () => {
      const addr = document.getElementById('current-address').textContent;
      navigator.clipboard.writeText(addr);
    };
    
    document.getElementById('copy-receive').onclick = () => {
      const addr = document.getElementById('receive-address').textContent;
      navigator.clipboard.writeText(addr);
    };
    
    document.getElementById('chain-selector').onchange = (e) => {
      const chainKey = e.target.value;
      this.currentChain = CHAINS[chainKey];
      this.loadAccount();
    };
  }

  showInjectedWallet() {
    // Redirect to old app
    window.location.href = '/index-old.html';
  }
}

// Start app when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.app = new SilverPayApp();
    window.app.init();
  });
} else {
  window.app = new SilverPayApp();
  window.app.init();
}
