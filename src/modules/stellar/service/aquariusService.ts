import * as StellarSDK from '@stellar/stellar-sdk';
import BigNumber from 'bignumber.js';

import { getCurrentNetwork } from '../../../service/apiConfig';
import { getStellarConfig } from '../../walletconnect/config/chains';
import type { SwapOptions, SwapQuote } from '../types/ammSwap.types';
import { signAndSubmitTransaction } from '../utils/transactionService';
import { StellarBaseService } from './StellarBaseService';

export const AQUARIUS_MAINNET_ROUTER =
  import.meta.env.VITE_AQUARIUS_MAINNET_ROUTER ||
  'CBQDHNBFBZYE4MKPWBSJOPIYLW4SFSXAXUTSXJN76GNKYVYPCKWC6QUK';

export const AQUARIUS_TESTNET_ROUTER =
  import.meta.env.VITE_AQUARIUS_TESTNET_ROUTER ||
  'CBCFTQSPDBAIZ6R6PJQKSQWKNKWH2QIV3I4J72SHWBIK3ADRRAM5A6GD';

export const AQUARIUS_API_URL =
  import.meta.env.VITE_AQUARIUS_API_URL || 'https://amm-api.aqua.network/api/external/v2';

export interface AquariusFindPathResponse {
  success: boolean;
  amount?: number;
  amount_with_fee?: number;
  swap_chain_xdr?: string;
  pools?: string[];
  tokens?: string[];
  tokens_addresses?: string[];
  [key: string]: any;
}

export class AquariusService {
  private networkPassphrase: string;
  private horizonUrl: string;
  private isTestnet: boolean;
  private routerContractId: string;

  constructor(horizonUrl?: string, networkPassphrase?: string) {
    const isTestnet =
      getCurrentNetwork() === 'testnet' ||
      (networkPassphrase && networkPassphrase.includes('Test SDF Network'));
    const config = getStellarConfig(isTestnet ? 'testnet' : 'mainnet');

    this.isTestnet = !!isTestnet;
    this.networkPassphrase = networkPassphrase || config.networkPassphrase;
    this.horizonUrl = horizonUrl || config.horizonUrl;
    this.routerContractId = this.isTestnet ? AQUARIUS_TESTNET_ROUTER : AQUARIUS_MAINNET_ROUTER;
  }

  public getContractId(
    asset: StellarSDK.Asset | string,
    passphrase = this.networkPassphrase
  ): string {
    if (typeof asset === 'string') {
      const trimmed = asset.trim();
      if (trimmed.startsWith('C') && trimmed.length === 56) {
        return trimmed;
      }
      if (trimmed.toUpperCase() === 'XLM' || trimmed.toLowerCase() === 'native') {
        return StellarSDK.Asset.native().contractId(passphrase);
      }
      if (trimmed.includes(':')) {
        const [code, issuer] = trimmed.split(':');
        return new StellarSDK.Asset(code, issuer).contractId(passphrase);
      }
      throw new Error(`Cannot derive Soroban contract ID for asset: ${asset}`);
    }

    if (asset instanceof StellarSDK.Asset) {
      return asset.contractId(passphrase);
    }

    throw new Error('Invalid asset passed to getContractId');
  }

  /**
   * Query the Aquarius AMM External API for an optimal swap route.
   */
  async getQuote(
    fromAsset: StellarSDK.Asset,
    toAsset: StellarSDK.Asset,
    amount: string,
    options: { slippageTolerance?: number; maxDepth?: number } = {}
  ): Promise<SwapQuote> {
    const token_in_address = this.getContractId(fromAsset);
    const token_out_address = this.getContractId(toAsset);

    const slippageTolerance = options.slippageTolerance ?? 1;
    const slippageFraction = (slippageTolerance / 100).toFixed(6);

    // Aquarius amounts are integers in smallest units (1e-7 for 7 decimal Stellar assets)
    const amountSmallest = new BigNumber(amount).shiftedBy(7).integerValue().toFixed(0);

    const payload = {
      token_in_address,
      token_out_address,
      amount: amountSmallest,
      slippage: slippageFraction,
      provider_fee: '0.000000',
      max_depth: options.maxDepth ?? 4,
    };

    const res = await fetch(`${AQUARIUS_API_URL}/find-path/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data: AquariusFindPathResponse = await res.json().catch(() => ({ success: false }));

    if (!res.ok || !data.success || !data.amount || !data.swap_chain_xdr) {
      throw new Error('Aquarius found no viable swap route for this pair');
    }

    const estimatedOutput = new BigNumber(data.amount).shiftedBy(-7).toFixed(7);
    const minimumOutput = new BigNumber(data.amount_with_fee ?? data.amount)
      .shiftedBy(-7)
      .toFixed(7);

    // Compute price impact if available
    const estimatedOutputNum = parseFloat(estimatedOutput);
    const inputAmountNum = parseFloat(amount);
    let priceImpact = 0;
    if (inputAmountNum > 0 && estimatedOutputNum > 0) {
      const minMultiplier = 1 - slippageTolerance / 100;
      priceImpact = Math.max(0, parseFloat(((1 - minMultiplier) * 100).toFixed(2)));
    }

    return {
      fromAsset,
      toAsset,
      inputAmount: amount,
      estimatedOutput,
      minimumOutput,
      priceImpact,
      slippageTolerance,
      timestamp: Date.now(),
      source: 'AQUARIUS',
      swapChainXdr: data.swap_chain_xdr,
      pools: data.pools || [],
      path: {
        path: [fromAsset, toAsset],
        pools: [],
        estimatedOutput,
        priceImpact,
        hops: data.pools?.length || 1,
      },
      alternativePaths: [],
    };
  }

  /**
   * Build the transaction calling swap_chained on the Aquarius router contract.
   */
  async buildSwapTransaction(
    userAddress: string,
    quote: SwapQuote,
    options: SwapOptions = {}
  ): Promise<{
    xdr: string;
    transaction: StellarSDK.Transaction;
    isAquarius: boolean;
  }> {
    if (!quote.swapChainXdr) {
      throw new Error('Missing Aquarius swap_chain_xdr for transaction build');
    }

    const server = new StellarSDK.Horizon.Server(this.horizonUrl);
    const account = await server.loadAccount(userAddress);

    const routerContract = new StellarSDK.Contract(this.routerContractId);
    const userScVal = new StellarSDK.Address(userAddress).toScVal();

    const amountInSmallest = new BigNumber(quote.inputAmount)
      .shiftedBy(7)
      .integerValue()
      .toFixed(0);
    const minOutSmallest = new BigNumber(quote.minimumOutput)
      .shiftedBy(7)
      .integerValue()
      .toFixed(0);

    const amountInScVal = StellarSDK.nativeToScVal(BigInt(amountInSmallest), { type: 'i128' });
    const minOutScVal = StellarSDK.nativeToScVal(BigInt(minOutSmallest), { type: 'i128' });
    const swapChainScVal = StellarSDK.xdr.ScVal.fromXDR(quote.swapChainXdr, 'base64');

    const op = routerContract.call(
      'swap_chained',
      userScVal,
      amountInScVal,
      minOutScVal,
      swapChainScVal
    );

    const txBuilder = new StellarSDK.TransactionBuilder(account, {
      fee: (options.fee || '100000').toString(), // 0.01 XLM standard Soroban fee headroom
      networkPassphrase: this.networkPassphrase,
    });
    txBuilder.addOperation(op);
    txBuilder.setTimeout(options.timeout ?? 60);

    const tx = txBuilder.build();
    return {
      xdr: tx.toXDR(),
      transaction: tx,
      isAquarius: true,
    };
  }

  /**
   * Execute the Aquarius swap transaction via connected wallet provider.
   */
  async executeSwap(transaction: any, walletProvider: any, userAddress?: string): Promise<string> {
    const xdr = typeof transaction === 'string' ? transaction : transaction.xdr;
    const network = this.isTestnet ? 'testnet' : 'mainnet';

    const result = await signAndSubmitTransaction({
      xdr,
      network,
      networkPassphrase: this.networkPassphrase,
      provider: walletProvider,
      stellarAddress: userAddress,
    });

    if (result.success && result.hash) {
      if (userAddress) {
        StellarBaseService.invalidateAccountCache(userAddress, this.networkPassphrase);
      }
      return result.hash;
    }

    throw new Error(result.error || 'Aquarius swap transaction failed');
  }
}
