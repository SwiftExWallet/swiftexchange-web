# 🏗️ Recovery Module: Frontend & Integration Architecture

This document outlines the architecture of the **Recovery Module** within the SwiftEx web application, detailing how the frontend integrates with connected Stellar wallets, the backend relayer API, and Stellar Soroban Testnet.

---

## 📌 Table of Contents

1. [Overview & Responsibilities](#-overview--responsibilities)
2. [Frontend Architecture & State Machine](#-frontend-architecture--state-machine)
3. [Integration Points](#-integration-points)
   - [1. Wallet Layer (Freighter)](#1-wallet-layer-freighter)
   - [2. Backend Relayer API](#2-backend-relayer-api)
   - [3. Stellar Horizon & Soroban RPC](#3-stellar-horizon--soroban-rpc)
4. [Supported Stellar Assets & Reserve Floor](#-supported-stellar-assets--reserve-floor)
5. [On-Chain Contract Reference](#-on-chain-contract-reference)

---

## 🎯 Overview & Responsibilities

The Recovery Module (`src/modules/recovery/`) serves as the user-facing interface for decentralized account protection and emergency recovery:

- **Separation of Concerns:** Deep cryptographic ZK circuit proofs (Groth16/Circom) and on-chain Soroban contract logic reside in their respective backend and smart contract repositories.
- **Frontend Responsibility:** The web frontend manages wallet connections, guides users through guardian setup, displays live on-chain status, and coordinates the recovery flow with the backend relayer.

---

## 🧩 Frontend Architecture & State Machine

```
+-------------------------------------------------------------------------------+
|                                RecoveryPage.tsx                               |
|               (Main Container, Tab Navigation, Route Synchronizer)             |
+-------------------------------------------------------------------------------+
           |                                                      |
           v                                                      v
+-----------------------+                              +------------------------+
| ProtectWalletForm.tsx |                              | RecoverWalletFlow.tsx  |
| (Setup & Registration)|                              | (Emergency Claim Flow) |
+-----------------------+                              +------------------------+
           |                                                      |
           |-- 1. Check Registration Status                      |-- 1. Destination Input
           |-- 2. Build Registration XDR                         |-- 2. Email Verification
           |-- 3. Freighter Transaction Signing                  |-- 3. Timelock Countdown
           |-- 4. Confirm Registration                           |-- 4. Execute Sweep
           v                                                      v
+-------------------------------------------------------------------------------+
|                       State & Data Layer (Zustand + Hooks)                     |
|  - useRecoverWalletFlow.ts (Multi-step state machine)                         |
|  - recoveryStore.ts (Persistent local recovery state)                         |
|  - sparekeyContractService.ts (Horizon & Soroban RPC balance checks)         |
|  - recoveryApi.ts (HTTP client for Backend Relayer)                           |
+-------------------------------------------------------------------------------+
```

---

## 🔌 Integration Points

### 1. Wallet Layer (Freighter)

- Connects to the user's active Stellar account.
- Signs on-chain transaction XDR during initial guardian registration without transferring or depositing funds into escrow.

### 2. Backend Relayer API

- **Base Endpoint:** `https://hackathon.swiftexchange.io/api/v1/recovery`
- **Relayer Inbox:** `claim@swiftexwallet.in`
- **Endpoints Used by Frontend:**
  - `GET /v1/recovery/:ownerAddress` — Fetches current protection status, registered guardian commitment, and active challenge states.
  - `POST /v1/recovery/registration/prepare` — Requests unsigned registration transaction XDR.
  - `POST /v1/recovery/registration/confirm` — Informs relayer of completed registration transaction hash.
  - `POST /v1/recovery/start` — Triggers DKIM proof processing and opens on-chain challenge.
  - `POST /v1/recovery/execute` — Requests execution of asset sweep once the safety timelock expires.

### 3. Stellar Horizon & Soroban RPC

- **Horizon (`https://horizon-testnet.stellar.org`):** Used by the frontend to read live account balances (XLM and USDC classic trustlines) and verify destination account validity.
- **Soroban RPC (`https://soroban-testnet.stellar.org`):** Used for smart contract simulations and on-chain status verification.

---

## 💰 Supported Stellar Assets & Reserve Floor

1. **Native Stellar Lumens (XLM):**
   - **Stellar Asset Contract (SAC):** `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`
   - **Reserve Floor:** The frontend enforces a minimum **2 XLM floor** (`BASE_RESERVE_FLOOR_STROOPS = 20,000,000`). This ensures the original account retains the minimum reserve required by the Stellar ledger, preventing un-fund transaction errors.

2. **USD Coin (USDC):**
   - **Stellar Asset Contract (SAC):** `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`
   - **Issuer:** `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`
   - **Trustline Check:** The frontend verifies active trustline status on the destination address before initiating recovery execution.

---

## 📜 On-Chain Contract Reference

| Contract                       | Network         | Address                                                    |
| :----------------------------- | :-------------- | :--------------------------------------------------------- |
| **SpareKey Recovery Contract** | Stellar Testnet | `CD4D3YHVYIYIM3WUJYY6XTIQCU3KOBNPJN52S4KAPNRFBI7JVFFRPLQ5` |
| **Native XLM SAC**             | Stellar Testnet | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| **USDC SAC**                   | Stellar Testnet | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
