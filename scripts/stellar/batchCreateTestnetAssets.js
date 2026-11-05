import * as StellarSDK from '@stellar/stellar-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  createAndFundAccount,
  createLiquidityPool,
  depositLiquidity,
  issueAsset,
} from './createCustomAssetAndPool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSET_SPECS = [
  {
    code: 'USDC',
    name: 'USD Coin (Testnet)',
    mintAmount: '5000000',
    depositAsset: '1000000',
    depositXlm: '1000',
  },
  {
    code: 'AQUA',
    name: 'Aqua Network (Testnet)',
    mintAmount: '10000000',
    depositAsset: '2000000',
    depositXlm: '1000',
  },
  {
    code: 'SWIFT',
    name: 'SwiftEx Token (Testnet)',
    mintAmount: '10000000',
    depositAsset: '2000000',
    depositXlm: '1500',
  },
  {
    code: 'WBTC',
    name: 'Wrapped Bitcoin (Testnet)',
    mintAmount: '100',
    depositAsset: '10',
    depositXlm: '2000',
  },
  {
    code: 'WETH',
    name: 'Wrapped Ethereum (Testnet)',
    mintAmount: '1000',
    depositAsset: '100',
    depositXlm: '1500',
  },
  {
    code: 'EURC',
    name: 'Euro Coin (Testnet)',
    mintAmount: '5000000',
    depositAsset: '1000000',
    depositXlm: '1000',
  },
  {
    code: 'ACME',
    name: 'Acme Corp Asset (Testnet)',
    mintAmount: '1000000',
    depositAsset: '500000',
    depositXlm: '1000',
  },
];

async function main() {
  console.log(`=======================================================`);
  console.log(` Batch Creating ${ASSET_SPECS.length} Testnet Assets & XLM AMM Pools`);
  console.log(` Network: Stellar TESTNET`);
  console.log(`=======================================================\n`);

  const results = {
    network: 'TESTNET',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    timestamp: new Date().toISOString(),
    distributionAccount: null,
    assets: [],
  };

  const distribution = await createAndFundAccount('Master Distribution Account');
  results.distributionAccount = {
    publicKey: distribution.publicKey,
    secretKey: distribution.secretKey,
  };

  for (let i = 0; i < ASSET_SPECS.length; i++) {
    const spec = ASSET_SPECS[i];
    console.log(`\n-------------------------------------------------------`);
    console.log(`Processing Asset [${i + 1}/${ASSET_SPECS.length}]: ${spec.code} (${spec.name})`);
    console.log(`-------------------------------------------------------`);

    try {
      const issuer = await createAndFundAccount(`Issuer for ${spec.code}`);

      const { asset, trustHash, mintHash } = await issueAsset({
        issuerKeypair: issuer.keypair,
        distKeypair: distribution.keypair,
        assetCode: spec.code,
        amount: spec.mintAmount,
      });

      const { poolId, txHash: poolTrustHash } = await createLiquidityPool({
        distKeypair: distribution.keypair,
        customAsset: asset,
        feeBps: 30,
      });

      const { txHash: depositHash } = await depositLiquidity({
        distKeypair: distribution.keypair,
        poolId: poolId,
        maxAmountA: spec.depositXlm,
        maxAmountB: spec.depositAsset,
      });

      results.assets.push({
        code: spec.code,
        name: spec.name,
        issuerPublicKey: issuer.publicKey,
        issuerSecretKey: issuer.secretKey,
        mintAmount: spec.mintAmount,
        poolId: poolId,
        liquidityPoolPair: `XLM/${spec.code}`,
        depositXlm: spec.depositXlm,
        depositAsset: spec.depositAsset,
        txs: {
          trustHash,
          mintHash,
          poolTrustHash,
          depositHash,
        },
      });

      console.log(`✓ Completed setup for ${spec.code}`);
    } catch (err) {
      console.error(`✕ Failed to setup ${spec.code}:`, err.message);
    }
  }

  const outputPath = path.join(__dirname, 'testnet-assets.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');

  console.log(`\n=======================================================`);
  console.log(`🎉 BATCH CREATION COMPLETE!`);
  console.log(`Saved deployment manifest to: ${outputPath}`);
  console.log(`Total Assets Created: ${results.assets.length}`);
  console.log(`Distribution Account: ${distribution.publicKey}`);
  console.log(`=======================================================\n`);
}

main().catch(err => {
  console.error('Fatal batch setup error:', err);
  process.exit(1);
});
