import * as StellarSDK from '@stellar/stellar-sdk';

const HORIZON_URL = process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = StellarSDK.Networks.TESTNET;
const ASSET_CODE = process.env.ASSET_CODE || 'ACME';
const MINT_AMOUNT = process.env.MINT_AMOUNT || '1000000';
const POOL_XLM_AMOUNT = process.env.POOL_XLM_AMOUNT || '1000';
const POOL_ASSET_AMOUNT = process.env.POOL_ASSET_AMOUNT || '500000';
const POOL_FEE_BPS = 30;

const server = new StellarSDK.Horizon.Server(HORIZON_URL);

export async function createAndFundAccount(name = 'Account') {
  const keypair = StellarSDK.Keypair.random();
  const publicKey = keypair.publicKey();
  const secretKey = keypair.secret();

  console.log(`\n========================================`);
  console.log(`[1] Creating & Funding ${name}`);
  console.log(`    Public Key: ${publicKey}`);
  console.log(`    Secret Key: ${secretKey}`);
  console.log(`========================================`);

  try {
    const response = await fetch(
      `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`
    );
    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Friendbot failed (status ${response.status}): ${errBody}`);
    }
    const data = await response.json();
    console.log(`✓ ${name} funded successfully with 10,000 testnet XLM`);
    console.log(`  Tx Hash: ${data.hash || 'OK'}`);

    const account = await server.loadAccount(publicKey);
    const xlmBalance = account.balances.find(b => b.asset_type === 'native')?.balance;
    console.log(`  Confirmed Balance: ${xlmBalance} XLM`);

    return { keypair, publicKey, secretKey, account };
  } catch (error) {
    console.error(`✕ Failed to fund ${name}:`, error.message);
    throw error;
  }
}

export async function issueAsset({ issuerKeypair, distKeypair, assetCode, amount = '1000000' }) {
  console.log(`\n========================================`);
  console.log(`[2] Defining & Minting Asset: ${assetCode}`);
  console.log(`    Issuer:       ${issuerKeypair.publicKey()}`);
  console.log(`    Distribution: ${distKeypair.publicKey()}`);
  console.log(`    Amount:       ${amount} ${assetCode}`);
  console.log(`========================================`);

  const asset = new StellarSDK.Asset(assetCode, issuerKeypair.publicKey());

  try {
    console.log(`➔ Step A: Submitting ChangeTrust from Distribution account...`);
    let distAccount = await server.loadAccount(distKeypair.publicKey());
    const trustTx = new StellarSDK.TransactionBuilder(distAccount, {
      fee: StellarSDK.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        StellarSDK.Operation.changeTrust({
          asset: asset,
          limit: '1000000000',
        })
      )
      .setTimeout(180)
      .build();

    trustTx.sign(distKeypair);
    const trustResult = await server.submitTransaction(trustTx);
    console.log(`✓ ChangeTrust established for ${assetCode}`);
    console.log(`  Tx Hash: ${trustResult.hash}`);

    console.log(`➔ Step B: Minting ${amount} ${assetCode} from Issuer to Distribution account...`);
    let issuerAccount = await server.loadAccount(issuerKeypair.publicKey());
    const payTx = new StellarSDK.TransactionBuilder(issuerAccount, {
      fee: StellarSDK.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        StellarSDK.Operation.payment({
          destination: distKeypair.publicKey(),
          asset: asset,
          amount: amount,
        })
      )
      .setTimeout(180)
      .build();

    payTx.sign(issuerKeypair);
    const payResult = await server.submitTransaction(payTx);
    console.log(`✓ Mint payment confirmed!`);
    console.log(`  Tx Hash: ${payResult.hash}`);

    distAccount = await server.loadAccount(distKeypair.publicKey());
    const tokenBalance = distAccount.balances.find(
      b => b.asset_code === assetCode && b.asset_issuer === issuerKeypair.publicKey()
    )?.balance;
    console.log(`  Distribution Balance: ${tokenBalance} ${assetCode}`);

    return { asset, trustHash: trustResult.hash, mintHash: payResult.hash };
  } catch (error) {
    if (error.response?.data?.extras?.result_codes) {
      console.error(
        '✕ Horizon Result Codes:',
        JSON.stringify(error.response.data.extras.result_codes, null, 2)
      );
    } else {
      console.error('✕ Issue Asset Error:', error.message);
    }
    throw error;
  }
}

export async function createLiquidityPool({
  distKeypair,
  customAsset,
  baseAsset = StellarSDK.Asset.native(),
  feeBps = POOL_FEE_BPS,
}) {
  console.log(`\n========================================`);
  console.log(`[3] Creating Liquidity Pool Trustline`);
  console.log(
    `    Pair: ${baseAsset.isNative() ? 'XLM' : baseAsset.getCode()} / ${customAsset.getCode()}`
  );
  console.log(`    Fee:  ${feeBps} bps (0.3%)`);
  console.log(`========================================`);

  try {
    const lpAsset = new StellarSDK.LiquidityPoolAsset(baseAsset, customAsset, feeBps);
    const poolIdBuffer = StellarSDK.getLiquidityPoolId('constant_product', {
      assetA: lpAsset.assetA,
      assetB: lpAsset.assetB,
      fee: feeBps,
    });
    const poolIdHex = poolIdBuffer.toString('hex');

    console.log(`    Computed Pool ID: ${poolIdHex}`);

    const distAccount = await server.loadAccount(distKeypair.publicKey());
    const poolTrustTx = new StellarSDK.TransactionBuilder(distAccount, {
      fee: StellarSDK.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        StellarSDK.Operation.changeTrust({
          asset: lpAsset,
        })
      )
      .setTimeout(180)
      .build();

    poolTrustTx.sign(distKeypair);
    const poolTrustResult = await server.submitTransaction(poolTrustTx);
    console.log(`✓ Liquidity Pool Trustline added successfully!`);
    console.log(`  Tx Hash: ${poolTrustResult.hash}`);

    return { lpAsset, poolId: poolIdHex, txHash: poolTrustResult.hash };
  } catch (error) {
    if (error.response?.data?.extras?.result_codes) {
      console.error(
        '✕ Horizon Result Codes:',
        JSON.stringify(error.response.data.extras.result_codes, null, 2)
      );
    } else {
      console.error('✕ Create Liquidity Pool Error:', error.message);
    }
    throw error;
  }
}

export async function depositLiquidity({
  distKeypair,
  poolId,
  maxAmountA = POOL_XLM_AMOUNT,
  maxAmountB = POOL_ASSET_AMOUNT,
  minPrice = '0.0000001',
  maxPrice = '10000000',
}) {
  console.log(`\n========================================`);
  console.log(`[4] Depositing Initial Liquidity into Pool`);
  console.log(`    Pool ID:      ${poolId}`);
  console.log(`    Max Amount A: ${maxAmountA} (XLM)`);
  console.log(`    Max Amount B: ${maxAmountB}`);
  console.log(`    Price Range:  ${minPrice} - ${maxPrice}`);
  console.log(`========================================`);

  try {
    const distAccount = await server.loadAccount(distKeypair.publicKey());
    const depositTx = new StellarSDK.TransactionBuilder(distAccount, {
      fee: StellarSDK.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        StellarSDK.Operation.liquidityPoolDeposit({
          liquidityPoolId: poolId,
          maxAmountA: String(maxAmountA),
          maxAmountB: String(maxAmountB),
          minPrice: String(minPrice),
          maxPrice: String(maxPrice),
        })
      )
      .setTimeout(180)
      .build();

    depositTx.sign(distKeypair);
    const depositResult = await server.submitTransaction(depositTx);
    console.log(`✓ Liquidity deposited successfully!`);
    console.log(`  Tx Hash: ${depositResult.hash}`);

    const updatedAccount = await server.loadAccount(distKeypair.publicKey());
    console.log(`\n========================================`);
    console.log(`[Summary] Final Distribution Account Balances:`);
    updatedAccount.balances.forEach(b => {
      if (b.asset_type === 'liquidity_pool_shares') {
        console.log(`  • LP Shares: ${b.balance} (Pool: ${b.liquidity_pool_id.slice(0, 12)}...)`);
      } else if (b.asset_type === 'native') {
        console.log(`  • XLM: ${b.balance}`);
      } else {
        console.log(`  • ${b.asset_code}: ${b.balance}`);
      }
    });
    console.log(`========================================\n`);

    return { txHash: depositResult.hash };
  } catch (error) {
    if (error.response?.data?.extras?.result_codes) {
      console.error(
        '✕ Horizon Result Codes:',
        JSON.stringify(error.response.data.extras.result_codes, null, 2)
      );
    } else {
      console.error('✕ Deposit Liquidity Error:', error.message);
    }
    throw error;
  }
}

async function run() {
  console.log(`Starting Stellar Testnet Custom Asset & AMM Liquidity Setup...`);
  console.log(`Horizon: ${HORIZON_URL}`);
  console.log(`Network: TESTNET`);
  console.log(`Target Asset Code: ${ASSET_CODE}`);

  const issuer = await createAndFundAccount('Issuer Account');
  const distribution = await createAndFundAccount('Distribution Account');

  const { asset } = await issueAsset({
    issuerKeypair: issuer.keypair,
    distKeypair: distribution.keypair,
    assetCode: ASSET_CODE,
    amount: MINT_AMOUNT,
  });

  const { poolId } = await createLiquidityPool({
    distKeypair: distribution.keypair,
    customAsset: asset,
    feeBps: POOL_FEE_BPS,
  });

  await depositLiquidity({
    distKeypair: distribution.keypair,
    poolId: poolId,
    maxAmountA: POOL_XLM_AMOUNT,
    maxAmountB: POOL_ASSET_AMOUNT,
  });

  console.log(`\n🎉 SUCCESS! All steps completed for ${ASSET_CODE} / XLM on Stellar Testnet.`);
  console.log(`Issuer Public Key: ${issuer.publicKey}`);
  console.log(`Asset: ${ASSET_CODE}:${issuer.publicKey}`);
  console.log(`Pool ID: ${poolId}`);
}

if (process.argv[1]?.endsWith('createCustomAssetAndPool.js')) {
  run().catch(err => {
    console.error(`\nFATAL ERROR:`, err);
    process.exit(1);
  });
}
