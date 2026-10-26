/**
 * Onboarding UI for wallet creation/import
 */

import { keyStore, KeyStore } from '../core/keystore.js';

export class OnboardingUI {
  constructor(container) {
    this.container = container;
    this.step = 'welcome'; // welcome, create, backup, verify, import, unlock
    this.mnemonic = null;
    this.verifiedWords = [];
  }

  render() {
    this.container.innerHTML = '';
    
    if (this.step === 'welcome') {
      this.renderWelcome();
    } else if (this.step === 'create') {
      this.renderCreate();
    } else if (this.step === 'backup') {
      this.renderBackup();
    } else if (this.step === 'verify') {
      this.renderVerify();
    } else if (this.step === 'import') {
      this.renderImport();
    } else if (this.step === 'unlock') {
      this.renderUnlock();
    }
  }

  renderWelcome() {
    const div = document.createElement('div');
    div.className = 'onboarding';
    div.innerHTML = `
      <div class="onboarding-card">
        <div class="brand-large">
          <span class="brand-mark-large">S</span>
          <h1>SilverPay</h1>
          <p class="tagline-large">Your keys. Your wallet. Your recovery.</p>
        </div>
        
        <div class="onboarding-options">
          <button class="btn btn-primary btn-large" id="create-wallet">
            Create New Wallet
          </button>
          <button class="btn btn-large" id="import-wallet">
            Import Existing Wallet
          </button>
          <button class="btn btn-quiet" id="connect-injected">
            Connect Injected Wallet (Advanced)
          </button>
        </div>
        
        <p class="hint">SilverPay is a self-custodial wallet. You are responsible for securing your recovery phrase.</p>
      </div>
    `;
    
    this.container.appendChild(div);
    
    div.querySelector('#create-wallet').onclick = () => {
      this.step = 'create';
      this.render();
    };
    div.querySelector('#import-wallet').onclick = () => {
      this.step = 'import';
      this.render();
    };
    div.querySelector('#connect-injected').onclick = () => {
      this.onInjectedWallet();
    };
  }

  renderCreate() {
    const div = document.createElement('div');
    div.className = 'onboarding';
    div.innerHTML = `
      <div class="onboarding-card">
        <h2>Create New Wallet</h2>
        <p>Set a password to encrypt your wallet. This password will be required to unlock your wallet.</p>
        
        <form id="create-form">
          <label for="password">Password (minimum 8 characters)</label>
          <input type="password" id="password" autocomplete="new-password" required minlength="8">
          
          <label for="password-confirm">Confirm Password</label>
          <input type="password" id="password-confirm" autocomplete="new-password" required>
          
          <div class="row">
            <button type="button" class="btn btn-quiet" id="back">Back</button>
            <button type="submit" class="btn btn-primary">Create Wallet</button>
          </div>
        </form>
        <p class="error" id="create-error" role="alert"></p>
      </div>
    `;
    
    this.container.appendChild(div);
    
    div.querySelector('#back').onclick = () => {
      this.step = 'welcome';
      this.render();
    };
    
    div.querySelector('#create-form').onsubmit = async (e) => {
      e.preventDefault();
      const password = div.querySelector('#password').value;
      const confirm = div.querySelector('#password-confirm').value;
      const errorEl = div.querySelector('#create-error');
      
      if (password !== confirm) {
        errorEl.textContent = 'Passwords do not match';
        return;
      }
      if (password.length < 8) {
        errorEl.textContent = 'Password must be at least 8 characters';
        return;
      }
      
      try {
        this.mnemonic = KeyStore.generateMnemonic(128); // 12 words
        this.step = 'backup';
        this.render();
      } catch (err) {
        errorEl.textContent = err.message;
      }
    };
  }

  renderBackup() {
    const words = this.mnemonic.split(' ');
    const div = document.createElement('div');
    div.className = 'onboarding';
    div.innerHTML = `
      <div class="onboarding-card onboarding-wide">
        <h2>Backup Your Recovery Phrase</h2>
        <p class="warning">⚠️ Write down these 12 words in order and store them securely. Anyone with this phrase can access your funds. SilverPay cannot recover it if lost.</p>
        
        <div class="mnemonic-grid">
          ${words.map((w, i) => `
            <div class="mnemonic-word">
              <span class="mnemonic-number">${i + 1}.</span>
              <span class="mnemonic-text">${w}</span>
            </div>
          `).join('')}
        </div>
        
        <div class="backup-checks">
          <label><input type="checkbox" id="check1"> I have written down my recovery phrase</label>
          <label><input type="checkbox" id="check2"> I understand I cannot recover it if lost</label>
          <label><input type="checkbox" id="check3"> I will not share it with anyone</label>
        </div>
        
        <div class="row">
          <button class="btn btn-quiet" id="back">Back</button>
          <button class="btn btn-primary" id="continue" disabled>Continue to Verification</button>
        </div>
      </div>
    `;
    
    this.container.appendChild(div);
    
    const checks = [div.querySelector('#check1'), div.querySelector('#check2'), div.querySelector('#check3')];
    const btn = div.querySelector('#continue');
    
    checks.forEach(c => {
      c.onchange = () => {
        btn.disabled = !checks.every(x => x.checked);
      };
    });
    
    div.querySelector('#back').onclick = () => {
      this.step = 'create';
      this.render();
    };
    
    btn.onclick = () => {
      this.step = 'verify';
      this.render();
    };
  }

  renderVerify() {
    const words = this.mnemonic.split(' ');
    // Pick 3 random words to verify
    const indices = [2, 5, 8]; // 0-indexed, asking for word 3, 6, 9
    const div = document.createElement('div');
    div.className = 'onboarding';
    div.innerHTML = `
      <div class="onboarding-card">
        <h2>Verify Your Recovery Phrase</h2>
        <p>Enter the following words from your recovery phrase to confirm you've backed it up correctly.</p>
        
        <form id="verify-form">
          <label for="word1">Word #${indices[0] + 1}</label>
          <input type="text" id="word1" autocomplete="off" required>
          
          <label for="word2">Word #${indices[1] + 1}</label>
          <input type="text" id="word2" autocomplete="off" required>
          
          <label for="word3">Word #${indices[2] + 1}</label>
          <input type="text" id="word3" autocomplete="off" required>
          
          <div class="row">
            <button type="button" class="btn btn-quiet" id="back">Back</button>
            <button type="submit" class="btn btn-primary">Verify & Create Wallet</button>
          </div>
        </form>
        <p class="error" id="verify-error" role="alert"></p>
      </div>
    `;
    
    this.container.appendChild(div);
    
    div.querySelector('#back').onclick = () => {
      this.step = 'backup';
      this.render();
    };
    
    div.querySelector('#verify-form').onsubmit = async (e) => {
      e.preventDefault();
      const w1 = div.querySelector('#word1').value.trim().toLowerCase();
      const w2 = div.querySelector('#word2').value.trim().toLowerCase();
      const w3 = div.querySelector('#word3').value.trim().toLowerCase();
      const errorEl = div.querySelector('#verify-error');
      
      if (w1 !== words[indices[0]] || w2 !== words[indices[1]] || w3 !== words[indices[2]]) {
        errorEl.textContent = 'Incorrect words. Please check your backup.';
        return;
      }
      
      try {
        const password = document.querySelector('#password')?.value || prompt('Enter password to encrypt wallet:');
        await keyStore.createFromMnemonic(this.mnemonic, password);
        this.onComplete();
      } catch (err) {
        errorEl.textContent = err.message;
      }
    };
  }

  renderImport() {
    const div = document.createElement('div');
    div.className = 'onboarding';
    div.innerHTML = `
      <div class="onboarding-card onboarding-wide">
        <h2>Import Existing Wallet</h2>
        <p>Enter your 12, 15, 18, 21, or 24 word recovery phrase.</p>
        
        <form id="import-form">
          <label for="mnemonic">Recovery Phrase</label>
          <textarea id="mnemonic" rows="4" placeholder="word1 word2 word3 ... word12" autocomplete="off" spellcheck="false"></textarea>
          
          <label for="password">New Password (minimum 8 characters)</label>
          <input type="password" id="password" autocomplete="new-password" required minlength="8">
          
          <label for="password-confirm">Confirm Password</label>
          <input type="password" id="password-confirm" autocomplete="new-password" required>
          
          <div class="row">
            <button type="button" class="btn btn-quiet" id="back">Back</button>
            <button type="submit" class="btn btn-primary">Import Wallet</button>
          </div>
        </form>
        <p class="error" id="import-error" role="alert"></p>
      </div>
    `;
    
    this.container.appendChild(div);
    
    div.querySelector('#back').onclick = () => {
      this.step = 'welcome';
      this.render();
    };
    
    div.querySelector('#import-form').onsubmit = async (e) => {
      e.preventDefault();
      const mnemonic = div.querySelector('#mnemonic').value.trim().toLowerCase().replace(/\s+/g, ' ');
      const password = div.querySelector('#password').value;
      const confirm = div.querySelector('#password-confirm').value;
      const errorEl = div.querySelector('#import-error');
      
      if (password !== confirm) {
        errorEl.textContent = 'Passwords do not match';
        return;
      }
      
      if (!KeyStore.validateMnemonic(mnemonic)) {
        errorEl.textContent = 'Invalid recovery phrase';
        return;
      }
      
      try {
        await keyStore.createFromMnemonic(mnemonic, password);
        this.onComplete();
      } catch (err) {
        errorEl.textContent = err.message;
      }
    };
  }

  renderUnlock() {
    const div = document.createElement('div');
    div.className = 'onboarding';
    div.innerHTML = `
      <div class="onboarding-card">
        <div class="brand-large">
          <span class="brand-mark-large">S</span>
          <h1>SilverPay</h1>
        </div>
        <h2>Unlock Wallet</h2>
        
        <form id="unlock-form">
          <label for="password">Password</label>
          <input type="password" id="password" autocomplete="current-password" required>
          
          <button type="submit" class="btn btn-primary btn-full">Unlock</button>
        </form>
        <p class="error" id="unlock-error" role="alert"></p>
        <button class="btn btn-quiet" id="reset">Reset Wallet</button>
      </div>
    `;
    
    this.container.appendChild(div);
    
    div.querySelector('#unlock-form').onsubmit = async (e) => {
      e.preventDefault();
      const password = div.querySelector('#password').value;
      const errorEl = div.querySelector('#unlock-error');
      
      try {
        await keyStore.unlock(password);
        this.onComplete();
      } catch (err) {
        errorEl.textContent = err.message;
      }
    };
    
    div.querySelector('#reset').onclick = () => {
      if (confirm('This will delete your wallet. Make sure you have your recovery phrase backed up. Continue?')) {
        localStorage.removeItem('silverpay.keystore.v1');
        this.step = 'welcome';
        this.render();
      }
    };
  }

  onInjectedWallet() {
    // Fall back to old injected wallet flow
    if (this.onInjected) {
      this.onInjected();
    }
  }

  onComplete() {
    if (this.onCompleteCallback) {
      this.onCompleteCallback();
    }
  }

  static show(container, callbacks = {}) {
    const ui = new OnboardingUI(container);
    ui.onCompleteCallback = callbacks.onComplete;
    ui.onInjected = callbacks.onInjected;
    
    if (KeyStore.hasWallet()) {
      ui.step = 'unlock';
    } else {
      ui.step = 'welcome';
    }
    
    ui.render();
    return ui;
  }
}
