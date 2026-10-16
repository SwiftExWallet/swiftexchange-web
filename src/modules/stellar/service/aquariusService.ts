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

export const AQUARIUS_MAINNET_API_URL =
  import.meta.env.VITE_AQUARIUS_MAINNET_API_URL ||
  import.meta.env.VITE_AQUARIUS_API_URL ||
  'https://amm-api.aqua.network/api/external/v2';

export const AQUARIUS_TESTNET_API_URL =
  import.meta.env.VITE_AQUARIUS_TESTNET_API_URL ||
  'https://amm-api-testnet.aqua.network/api/external/v2';

export const AQUARIUS_API_URL = AQUARIUS_MAINNET_API_URL;

export const SOROBAN_MAINNET_RPC_URLS = [
  import.meta.env.VITE_SOROBAN_MAINNET_RPC_URL || 'https://mainnet.sorobanrpc.com',
];

export const SOROBAN_TESTNET_RPC_URLS = [
  import.meta.env.VITE_SOROBAN_TESTNET_RPC_URL || 'https://soroban-testnet.stellar.org',
];

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
    let isTestnet: boolean;
    if (typeof networkPassphrase === 'string') {
      isTestnet =
        networkPassphrase.includes('Test SDF') ||
        networkPassphrase.toLowerCase().includes('testnet');
    } else {
      isTestnet = getCurrentNetwork() === 'testnet';
    }
    const config = getStellarConfig(isTestnet ? 'testnet' : 'mainnet');

    this.isTestnet = isTestnet;
    this.networkPassphrase = networkPassphrase || config.networkPassphrase;
    this.horizonUrl = horizonUrl || config.horizonUrl;
    this.routerContractId = this.isTestnet ? AQUARIUS_TESTNET_ROUTER : AQUARIUS_MAINNET_ROUTER;
  }

  public getApiUrl(): string {
    return this.isTestnet ? AQUARIUS_TESTNET_API_URL : AQUARIUS_MAINNET_API_URL;
  }

  public getContractId(asset: any, passphrase = this.networkPassphrase): string {
    if (!asset) {
      throw new Error('No asset provided to getContractId');
    }

    if (typeof asset === 'string') {
      const trimmed = asset.trim();
      if (trimmed.startsWith('C') && trimmed.length === 56) {
        return trimmed;
      }
      if (trimmed.toUpperCase() === 'XLM' || trimmed.toLowerCase() === 'native') {
        return StellarSDK.Asset.native().contractId(passphrase);
      }
      if (this.isTestnet) {
        if (trimmed.toUpperCase() === 'USDC') {
          return 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
        }
        if (trimmed.toUpperCase() === 'XTAR') {
          return 'CCZGLAUBDKJSQK72QOZHVU7CUWKW45OZWYWCLL27AEK74U2OIBK6LXF2';
        }
      }
      if (trimmed.includes(':') || trimmed.includes('-')) {
        const separator = trimmed.includes(':') ? ':' : '-';
        const [code, issuer] = trimmed.split(separator);
        if (this.isTestnet && code.toUpperCase() === 'USDC') {
          return 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
        }
        if (this.isTestnet && code.toUpperCase() === 'XTAR') {
          return 'CCZGLAUBDKJSQK72QOZHVU7CUWKW45OZWYWCLL27AEK74U2OIBK6LXF2';
        }
        if (issuer.startsWith('G')) {
          return new StellarSDK.Asset(code, issuer).contractId(passphrase);
        }
        if (issuer.startsWith('C') && issuer.length === 56) {
          return issuer;
        }
      }
      throw new Error(`Cannot derive Soroban contract ID for asset: ${asset}`);
    }

    if (typeof asset === 'object') {
      if (asset.contract && typeof asset.contract === 'string' && asset.contract.startsWith('C')) {
        if (this.isTestnet && (asset.code === 'USDC' || asset.symbol === 'USDC')) {
          return 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
        }
        return asset.contract;
      }
      if (
        asset.contractAddress &&
        typeof asset.contractAddress === 'string' &&
        asset.contractAddress.startsWith('C')
      ) {
        if (this.isTestnet && (asset.code === 'USDC' || asset.symbol === 'USDC')) {
          return 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
        }
        return asset.contractAddress;
      }
      if (asset.address && typeof asset.address === 'string' && asset.address.startsWith('C')) {
        if (this.isTestnet && (asset.code === 'USDC' || asset.symbol === 'USDC')) {
          return 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
        }
        return asset.address;
      }
      if (
        asset.isNative === true ||
        (typeof asset.isNative === 'function' && asset.isNative()) ||
        asset.symbol === 'XLM' ||
        asset.code === 'XLM'
      ) {
        return StellarSDK.Asset.native().contractId(passphrase);
      }

      const code =
        typeof asset.getCode === 'function' ? asset.getCode() : asset.code || asset.symbol;

      if (this.isTestnet && code) {
        if (code.toUpperCase() === 'USDC') {
          return 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
        }
        if (code.toUpperCase() === 'XTAR') {
          return 'CCZGLAUBDKJSQK72QOZHVU7CUWKW45OZWYWCLL27AEK74U2OIBK6LXF2';
        }
      }

      if (typeof asset.contractId === 'function') {
        const cid = asset.contractId(passphrase);
        if (cid && typeof cid === 'string' && cid.startsWith('C')) return cid;
      }

      if (asset instanceof StellarSDK.Asset) {
        return asset.contractId(passphrase);
      }

      const issuer = asset.issuer || (asset.address?.startsWith('G') ? asset.address : undefined);
      if (code && issuer && issuer.startsWith('G')) {
        return new StellarSDK.Asset(code, issuer).contractId(passphrase);
      }
      if (asset.asset instanceof StellarSDK.Asset) {
        return asset.asset.contractId(passphrase);
      }
    }

    throw new Error('Invalid asset passed to getContractId');
  }

  async getQuote(
    fromAsset: any,
    toAsset: any,
    amount: string,
    options: { slippageTolerance?: number; maxDepth?: number } = {}
  ): Promise<SwapQuote> {
    const token_in_address = this.getContractId(fromAsset);
    const token_out_address = this.getContractId(toAsset);

    const slippageTolerance = options.slippageTolerance ?? 1;
    const slippageFraction = (slippageTolerance / 100).toFixed(6);

    const amountSmallest = new BigNumber(amount).shiftedBy(7).integerValue().toFixed(0);

    const payload = {
      token_in_address,
      token_out_address,
      amount: amountSmallest,
      slippage: slippageFraction,
      provider_fee: '0.000000',
      max_depth: options.maxDepth ?? 4,
    };

    const apiUrl = this.getApiUrl();
    const res = await fetch(`${apiUrl}/find-path/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data: AquariusFindPathResponse = await res.json().catch(() => ({ success: false }));
    const swapChainXdr = data.swap_chain_xdr || data.swapChainXdr;

    if (!res.ok || !data.success || !data.amount || !swapChainXdr) {
      throw new Error('Aquarius found no viable swap route for this pair');
    }

    const estimatedOutput = new BigNumber(data.amount)
      .shiftedBy(-7)
      .toFixed(7, BigNumber.ROUND_DOWN);
    const minimumOutput = new BigNumber(data.amount_with_fee ?? data.amount)
      .shiftedBy(-7)
      .toFixed(7, BigNumber.ROUND_DOWN);

    let priceImpact = 0;
    const rawPriceImpact = data.price_impact ?? data.priceImpact;
    if (rawPriceImpact !== undefined && rawPriceImpact !== null) {
      const piBN = new BigNumber(rawPriceImpact);
      if (piBN.isFinite() && piBN.gte(0)) {
        priceImpact = piBN.toNumber();
      }
    }

    const fromCode =
      (fromAsset && typeof fromAsset.getCode === 'function'
        ? fromAsset.getCode()
        : fromAsset?.code || fromAsset?.symbol) ||
      (token_in_address === 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'
        ? 'XLM'
        : 'Asset');
    const toCode =
      (toAsset && typeof toAsset.getCode === 'function'
        ? toAsset.getCode()
        : toAsset?.code || toAsset?.symbol) ||
      (token_out_address === 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA' ||
      token_out_address === 'CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F'
        ? 'USDC'
        : 'Asset');

    const fromPathAsset =
      fromAsset instanceof StellarSDK.Asset
        ? fromAsset
        : fromCode === 'XLM'
          ? StellarSDK.Asset.native()
          : ({ code: fromCode, isNative: () => false, getCode: () => fromCode } as any);

    const toPathAsset =
      toAsset instanceof StellarSDK.Asset
        ? toAsset
        : toCode === 'XLM'
          ? StellarSDK.Asset.native()
          : ({ code: toCode, isNative: () => false, getCode: () => toCode } as any);

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
        path: [fromPathAsset, toPathAsset],
        pools: [],
        estimatedOutput,
        priceImpact,
        hops: data.pools?.length || 1,
      },
      alternativePaths: [],
    };
  }

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

    const tokenInContractId = this.getContractId(quote.fromAsset);
    const tokenInScVal = new StellarSDK.Address(tokenInContractId).toScVal();
    const amountInScVal = StellarSDK.nativeToScVal(BigInt(amountInSmallest), { type: 'u128' });
    const minOutScVal = StellarSDK.nativeToScVal(BigInt(minOutSmallest), { type: 'u128' });
    const swapChainScVal = StellarSDK.xdr.ScVal.fromXDR(quote.swapChainXdr, 'base64');

    const op = routerContract.call(
      'swap_chained',
      userScVal,
      swapChainScVal,
      tokenInScVal,
      amountInScVal,
      minOutScVal
    );

    const txBuilder = new StellarSDK.TransactionBuilder(account, {
      fee: (options.fee || '100000').toString(),
      networkPassphrase: this.networkPassphrase,
    });
    txBuilder.addOperation(op);
    txBuilder.setTimeout(options.timeout ?? 300);

    const rawTx = txBuilder.build();

    const rpcUrls = this.isTestnet ? SOROBAN_TESTNET_RPC_URLS : SOROBAN_MAINNET_RPC_URLS;
    let simResponse: any = null;
    let simError: string | null = null;

    for (const rpcUrl of rpcUrls) {
      try {
        const rpcServer = new StellarSDK.rpc.Server(rpcUrl);
        const res = await rpcServer.simulateTransaction(rawTx);
        if (StellarSDK.rpc.Api.isSimulationSuccess(res)) {
          simResponse = res;
          break;
        } else {
          simError =
            (res as any)?.error ||
            (res as any)?.result?.error ||
            'Soroban simulation rejected by network';
        }
      } catch (err) {
        simError = err instanceof Error ? err.message : String(err);
      }
    }

    if (!simResponse) {
      throw new Error(simError || 'Failed to simulate Aquarius swap on Soroban RPC');
    }

    const assembledTx = StellarSDK.rpc.assembleTransaction(rawTx, simResponse).build();

    return {
      xdr: assembledTx.toXDR(),
      transaction: assembledTx,
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
