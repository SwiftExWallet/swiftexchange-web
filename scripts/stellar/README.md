# Stellar Testnet Asset Issuer & Liquidity Pool Manager

Production-ready Node.js automation scripts to generate keypairs, fund accounts with Friendbot, define custom assets, establish trustlines, mint supplies, create AMM Liquidity Pools against native XLM (30 bps fee), and deposit liquidity on the **Stellar TESTNET** using `@stellar/stellar-sdk`.

---

## 📋 Features

1. **Automated Account Creation & Funding**: Uses official Stellar Friendbot (`https://friendbot.stellar.org`) to fund accounts with 10,000 testnet XLM.
2. **Custom Asset Minting**: Defines custom tokens (`Asset(code, issuer)`), establishes trustlines from distribution accounts, and issues initial supplies via `Operation.payment`.
3. **AMM Liquidity Pool Creation**: Builds `LiquidityPoolAsset` (30 bps fee) paired with native `XLM`, computes deterministic `LiquidityPoolId`, and establishes pool share trustlines.
4. **Liquidity Deposits**: Submits `Operation.liquidityPoolDeposit` with slippage protection boundaries (`minPrice` / `maxPrice`).
5. **Batch Multi-Asset Provisioning**: Automatically provisions 7 testnet assets (`USDC`, `AQUA`, `SWIFT`, `WBTC`, `WETH`, `EURC`, `ACME`) with active liquidity pools and outputs a manifest `testnet-assets.json`.

---

## 🚀 Prerequisites & Installation

Ensure you have Node.js 18+ installed.

Dependencies are already installed in the root project:

```bash
npm install
```

---

## 🛠️ Usage

### 1. Single Asset Creation (`ACME` or custom)

Run the single-asset script:

```bash
npm run stellar:create-asset
```

or directly:

```bash
node scripts/stellar/createCustomAssetAndPool.js
```

#### Custom Asset Code & Amounts via Environment Variables:

```bash
ASSET_CODE=MYTOKEN MINT_AMOUNT=2000000 POOL_XLM_AMOUNT=1500 POOL_ASSET_AMOUNT=1000000 node scripts/stellar/createCustomAssetAndPool.js
```

---

### 2. Batch Creation (7 Testnet Assets with AMM Liquidity Pools)

Provisions the following assets with XLM liquidity pools:

- `USDC` (USD Coin Testnet)
- `AQUA` (Aqua Network Testnet)
- `SWIFT` (SwiftEx Token Testnet)
- `WBTC` (Wrapped Bitcoin Testnet)
- `WETH` (Wrapped Ethereum Testnet)
- `EURC` (Euro Coin Testnet)
- `ACME` (Acme Corp Testnet)

Run batch command:

```bash
npm run stellar:batch-assets
```

or directly:

```bash
node scripts/stellar/batchCreateTestnetAssets.js
```

This generates `scripts/stellar/testnet-assets.json` containing all issuer public keys, pool IDs, and transaction hashes for direct integration into the UI.

---

## 📦 Modular Architecture & API Functions

You can import and compose the functions into other scripts or backend services:

```javascript
import {
  createAndFundAccount,
  createLiquidityPool,
  depositLiquidity,
  issueAsset,
} from './scripts/stellar/createCustomAssetAndPool.js';

// 1. Create and fund accounts
const issuer = await createAndFundAccount('Issuer');
const distribution = await createAndFundAccount('Distribution');

// 2. Issue custom asset
const { asset } = await issueAsset({
  issuerKeypair: issuer.keypair,
  distKeypair: distribution.keypair,
  assetCode: 'ACME',
  amount: '1000000',
});

// 3. Create liquidity pool with XLM
const { poolId } = await createLiquidityPool({
  distKeypair: distribution.keypair,
  customAsset: asset,
  feeBps: 30,
});

// 4. Deposit liquidity
await depositLiquidity({
  distKeypair: distribution.keypair,
  poolId: poolId,
  maxAmountA: '1000', // XLM
  maxAmountB: '500000', // ACME
});
```

---

## 🔍 Network Details

- **Network Passphrase**: `Test SDF Network ; September 2015` (`StellarSDK.Networks.TESTNET`)
- **Horizon Server**: `https://horizon-testnet.stellar.org`
- **Friendbot Endpoint**: `https://friendbot.stellar.org?addr=<PUBLIC_KEY>`
