# SilverPay Self-Custody Security

## Security Model
SilverPay is a **non-custodial** wallet. We do not:
- Store your private keys
- Store your recovery phrase
- Have access to your funds
- Require accounts or registration
- Transmit keys to any server

## Key Management
- **Generation**: Cryptographically secure random via Web Crypto API
- **Storage**: Encrypted with AES-GCM using password-derived key (PBKDF2, 310000 iterations)
- **Derivation**: BIP39 mnemonics → BIP32 HD wallets
- **Signing**: All transactions signed locally in browser
- **Memory**: Keys cleared on lock

## Security Best Practices
1. Use a strong, unique password
2. Write down recovery phrase on physical paper
3. Store recovery phrase in secure, offline location
4. Never screenshot or digital copy recovery phrase
5. Test recovery with small amounts first
6. Keep browser and OS updated
7. Use on trusted devices only
8. Consider using hardware wallet integration (future)

## Known Limitations
- Browser-based wallets are vulnerable to malicious extensions
- Keys in memory while unlocked
- localStorage can be accessed by same-origin scripts
- No hardware wallet support yet
- Auto-lock depends on browser tab activity

## Reporting Security Issues
Do not open public issues. Report privately to Silver Labs.
