# 🔐 SpareKey: Zero-Knowledge Email Recovery on Stellar Soroban

[![Stellar](https://img.shields.io/badge/Stellar-Soroban_Testnet-blue.svg?style=flat-square&logo=stellar)](https://stellar.org)
[![Zero-Knowledge](https://img.shields.io/badge/Zero--Knowledge-Groth16_DKIM-blueviolet.svg?style=flat-square)](https://en.wikipedia.org/wiki/Zero-knowledge_proof)
[![Self-Custodial](https://img.shields.io/badge/Security-Self--Custodial-emerald.svg?style=flat-square)](https://stellar.org/soroban)
[![License](https://img.shields.io/badge/License-Apache_2.0-lightgrey.svg?style=flat-square)](LICENSE)

> **SpareKey** is a decentralized, zero-knowledge account recovery guardian built natively on Stellar Soroban. It empowers self-custodial wallet owners to recover locked or lost balances using cryptographic DKIM email proofs—without centralized custodians, without exposing email addresses on the public ledger, and without moving funds during setup.

---

## 📚 Documentation Index

For in-depth guides and technical specifications, explore the dedicated documentation modules:

| Document                                                           | Description                                                                                                 |
| :----------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------- |
| 🏗️ [**Architecture & Integration Guide**](./docs/ARCHITECTURE.md)  | Frontend component hierarchy, state machine, wallet integration, relayer APIs & SAC assets                  |
| ⚙️ [**Installation & Setup Guide**](./docs/INSTALLATION.md)        | Prerequisites, environment variable configuration, local building, and troubleshooting                      |
| 🚀 [**End-to-End Walkthrough & Demo Guide**](./docs/DEMO_GUIDE.md) | Step-by-step instructions to clone, serve, fund testnet wallets, and execute live end-to-end recovery demos |

---

## 💡 The Problem & The SpareKey Solution

### The Problem

- **Seed Phrase Vulnerability:** Self-custody requires users to safeguard 12 or 24-word seed phrases. Losing or corrupting a seed phrase leads to irreversible loss of funds.
- **Custodial Pitfalls:** Centralized social recovery or cloud-based backups compromise sovereign ownership, introduce counterparty risks, and create central honeypots vulnerable to leaks or state subpoenas.
- **Privacy Leaks:** Public blockchains expose account associations if cleartext email addresses, phone numbers, or identity credentials are tied to on-chain wallets.

### The SpareKey Solution

1. **Self-Custodial by Default:** Assets stay in the user's wallet. Setup creates a standing cryptographic commitment on Soroban without depositing or locking funds into a vault.
2. **Zero-Knowledge Privacy:** The smart contract stores only a cryptographic Poseidon hash and salt. The user's cleartext email address is never committed to or exposed on the Stellar ledger.
3. **Automated Fund Sweep:** In an emergency, sending an email from the registered inbox generates a verifiable ZK proof. Once the anti-tamper timelock elapses, the contract sweeps balances into a brand-new destination address specified in the email subject.

---

## 🔄 How It Works

```
[ 1. Protect Wallet ] ───> [ 2. Send Email Trigger ] ───> [ 3. Verify & Timelock ] ───> [ 4. Recover Funds ]
 Register Guardian          Send email with new            DKIM verified on-chain        Assets swept to new
 on Soroban contract        destination in subject         & safety timelock starts      destination wallet
```

1. **Protect Wallet:** User connects wallet, inputs recovery email, and signs on-chain to store a zero-knowledge commitment on Soroban.
2. **Trigger Recovery:** If wallet access is lost, user sends an email from the registered inbox to `claim@swiftexwallet.in` with the new destination address.
3. **Verify & Timelock:** The relayer verifies the cryptographic DKIM signature on-chain, initiating a safety timelock (5 seconds on Testnet).
4. **Execute Sweep:** Once the timelock elapses, funds (XLM & USDC) are swept autonomously to the new destination wallet.

---

## ⚡ Quick 1-Minute Run

```bash
# Clone the repository & switch to the recovery feature branch
git clone https://github.com/swiftexchange/swiftex-walletexchange.git
cd swiftex-walletexchange
git checkout feature/zk-email-recovery

# Install dependencies & prepare environment
npm install
cp .env.example .env.development

# Launch local development server
npm run dev
```

Visit [http://localhost:8081](http://localhost:8081) and navigate to **Recovery** in the sidebar.

For full testing steps, see the [End-to-End Walkthrough & Demo Guide](./docs/DEMO_GUIDE.md).

---

## 📜 Key Contracts & Network Configurations

| Component                      | Identifier / Address                                       | Details                                             |
| :----------------------------- | :--------------------------------------------------------- | :-------------------------------------------------- |
| **SpareKey Recovery Contract** | `CDT5MXYHAZK6YPTWFBKPECHGPCBQFINME6WJCONXCT73RKJRDIJ2HYJK` | Main recovery manager on Soroban Testnet            |
| **Native XLM SAC**             | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` | Enforces 2 XLM (`20,000,000` stroops) reserve floor |
| **USDC SAC**                   | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` | Testnet USD Coin (USDC SAC)                         |
| **Relayer Inbox**              | `claim@swiftexwallet.in`                                   | Emergency trigger receiver for DKIM verification    |
| **Relayer API Endpoint**       | `https://hackathon.swiftexchange.io/api/v1/recovery`       | Proof verification and recovery status queries      |

---

## 📁 Directory Structure

```
src/modules/recovery/
├── docs/                               # Architecture & Verification Guides
│   ├── ARCHITECTURE.md                 # Frontend state machine, Wallet & Relayer integrations
│   ├── INSTALLATION.md                 # Step-by-step setup & environment variables
│   └── DEMO_GUIDE.md                   # End-to-end walkthrough & live testing
├── components/
│   ├── AssetSelector.tsx               # XLM/USDC selector with strict trustline validation
│   ├── HelpSupportModal.tsx            # Emergency recovery help & FAQ modal
│   ├── HowRecoveryWorksPage.tsx        # Educational architecture breakdown
│   ├── ProtectWalletForm.tsx           # Step-by-step guardian registration UI
│   ├── RecoverWalletFlow.tsx           # Main recovery coordinator component
│   ├── RecoveryActiveStatus.tsx        # Live on-chain status card & lookup tool
│   ├── RecoveryCircuit.tsx             # Interactive visual representation of ZK pipeline
│   ├── RecoveryFaqAccordion.tsx        # Common security and timelock questions
│   ├── RecoveryHero.tsx                # Landing hero card with dynamic wallet-state actions
│   └── recovery-flow/
│       ├── InitiateRecoveryStep.tsx    # Step 1: Destination input & relayer email trigger
│       ├── TrackingRecoveryStep.tsx    # Step 2: Timelock countdown & sweep execution
│       ├── RecoveryStatusTracker.tsx   # Relayer polling status progress bar
│       └── RecoverySuccessModal.tsx    # Post-sweep balance confirmation modal
├── hooks/
│   └── useRecoverWalletFlow.ts         # Central state machine hook for recovery tracking
├── services/
│   ├── recoveryApi.ts                  # HTTP client for backend relayer endpoints
│   ├── sparekeyContractService.ts      # Soroban SDK contract invocation & Horizon client
│   └── zkRecoveryService.ts            # RFC 5322 EML parsing & DKIM header extraction
├── store/
│   └── recoveryStore.ts                # Zustand store with persistent recovery state
├── constants.ts                        # Network configs, contract addresses & asset SACs
├── types.ts                            # TypeScript domain interfaces and recovery steps
├── RecoveryPage.tsx                    # Main container with tab-routing & auth synchronizer
└── README.md                           # Main documentation entry point
```

---

<p align="center">
  Built with ❤️ on <strong>Stellar Soroban</strong>.<br/>
  Empowering sovereign, trust-minimized self-custody for everyone.
</p>
