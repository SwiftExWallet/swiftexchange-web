import * as StellarSDK from '@stellar/stellar-sdk';
import BigNumber from 'bignumber.js';

import { API_CONFIG, getCurrentNetwork } from '../../../service/apiConfig';
import { getConnectedWalletAddress } from '../../../service/apiService';
import { sendCustomNotification } from '../../../service/notificationService';
import { getStellarConfig } from '../../walletconnect/config/chains';
import type { SwapQuote } from '../types/ammSwap.types';
import { StellarBaseService } from './StellarBaseService';

export interface SoroswapQuoteParams {
  assetIn: string; // Soroban contract ID or Asset / code
  assetOut: string; // Soroban contract ID or Asset / code
  amount: string;
  slippageBps?: number;
  maxHops?: number;
}

export interface SoroswapPrepareParams {
  assetIn: string;
  assetOut: string;
  amount: string;
  slippageBps?: number;
  from?: string;
}

export interface SoroswapPrepareResponse {
  xdr: string;
  network?: string;
  networkPassphrase?: string;
  [key: string]: any;
}

export interface SoroswapBroadcastResponse {
  hash?: string;
  txHash?: string;
  result?: any;
  [key: string]: any;
}

export class SoroswapService {
  private networkPassphrase: string;
  private horizonUrl: string;
  private isTestnet: boolean;

  constructor(horizonUrl?: string, networkPassphrase?: string) {
    const isTestnet =
      getCurrentNetwork() === 'testnet' ||
      (networkPassphrase && networkPassphrase.includes('Test SDF Network'));
    const config = getStellarConfig(isTestnet ? 'testnet' : 'mainnet');

    this.isTestnet = !!isTestnet;
    this.networkPassphrase = networkPassphrase || config.networkPassphrase;
    this.horizonUrl = horizonUrl || config.horizonUrl;
  }

  /**
   * Derives or validates the Soroban SAC (Stellar Asset Contract) ID (C...) for any asset.
   */
  public getContractId(
    asset: StellarSDK.Asset | string,
    passphrase = this.networkPassphrase
  ): string {
    if (typeof asset === 'string') {
      const trimmed = asset.trim();
      // Already a 56-char C... Soroban contract address
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

  private getBaseUrl(): string {
    return API_CONFIG.serverUrl.replace(/\/$/, '');
  }

  private getAuthHeaders(): Record<string, string> {
    const token = API_CONFIG.deviceAuth;
    const walletAddress = getConnectedWalletAddress();
    return {
      'content-type': 'application/json',
      'x-auth-wallet-token': token,
      'x-auth-device-token': token,
      ...(walletAddress ? { 'x-wallet-address': walletAddress } : {}),
      Authorization: token ? `Bearer ${token}` : '',
    };
  }

  private endpoint(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.getBaseUrl()}/soroswap${normalizedPath}`;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const url = this.endpoint(path);
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data?.message || data?.error || `HTTP ${res.status}`;
      throw new Error(
        `Soroswap ${path} failed: ${typeof message === 'string' ? message : JSON.stringify(message)}`
      );
    }
    return data as T;
  }

  /**
   * Request a quote from Soroswap router.
   */
  async getQuote(
    fromAsset: StellarSDK.Asset,
    toAsset: StellarSDK.Asset,
    amount: string,
    options: { slippageTolerance?: number; maxHops?: number } = {}
  ): Promise<SwapQuote> {
    const assetIn = this.getContractId(fromAsset);
    const assetOut = this.getContractId(toAsset);
    const slippageTolerance = options.slippageTolerance ?? 1;
    const slippageBps = Math.round(slippageTolerance * 100);
    const maxHops = options.maxHops ?? 3;

    const quoteRes: any = await this.post('/quote', {
      assetIn,
      assetOut,
      amount,
      slippageBps,
      maxHops,
    });

    if (!quoteRes) {
      throw new Error('Backend did not return a valid Soroswap quote');
    }

    // Determine decimal scaling factor if backend returns amounts in base units (stroops)
    let scaleFactor = new BigNumber(1);
    if (quoteRes.amountIn && new BigNumber(amount).isGreaterThan(0)) {
      const calculatedScale = new BigNumber(quoteRes.amountIn).dividedBy(amount);
      if (calculatedScale.isGreaterThanOrEqualTo(10000)) {
        scaleFactor = calculatedScale;
      }
    } else {
      // Standard Stellar / Soroban SAC asset decimals (10^7 stroops)
      scaleFactor = new BigNumber(1e7);
    }

    // 1. Extract estimated output amount (prefer rawTrade decimal string if present)
    let estimatedOutput: string;
    if (quoteRes.rawTrade?.destination_amount) {
      estimatedOutput = new BigNumber(quoteRes.rawTrade.destination_amount).toFixed(7);
    } else {
      const estimatedOutputRaw =
        quoteRes.amountOut ??
        quoteRes.dstAmount ??
        quoteRes.returnAmount ??
        quoteRes.expectedAmountOut ??
        quoteRes.outputAmount ??
        quoteRes.amount;

      if (!estimatedOutputRaw) {
        throw new Error('Soroswap quote response did not contain an output amount');
      }

      const rawStr = estimatedOutputRaw.toString();
      if (!rawStr.includes('.') && scaleFactor.isGreaterThan(1)) {
        estimatedOutput = new BigNumber(rawStr).dividedBy(scaleFactor).toFixed(7);
      } else {
        estimatedOutput = new BigNumber(rawStr).toFixed(7);
      }
    }

    // 2. Extract minimum output amount (respecting slippage)
    const minMultiplier = new BigNumber(1).minus(new BigNumber(slippageTolerance).dividedBy(100));
    let minimumOutput: string;
    if (quoteRes.rawTrade?.min_destination_amount) {
      minimumOutput = new BigNumber(quoteRes.rawTrade.min_destination_amount).toFixed(7);
    } else if (quoteRes.otherAmountThreshold) {
      const threshStr = quoteRes.otherAmountThreshold.toString();
      if (!threshStr.includes('.') && scaleFactor.isGreaterThan(1)) {
        minimumOutput = new BigNumber(threshStr).dividedBy(scaleFactor).toFixed(7);
      } else {
        minimumOutput = new BigNumber(threshStr).toFixed(7);
      }
    } else {
      const minimumOutputRaw =
        quoteRes.minAmountOut ??
        quoteRes.minimumReceived ??
        new BigNumber(estimatedOutput).multipliedBy(minMultiplier).toFixed(7);
      minimumOutput = new BigNumber(minimumOutputRaw).toFixed(7);
    }

    // 3. Extract price impact
    const priceImpactRaw =
      quoteRes.priceImpactPct ?? quoteRes.priceImpact ?? quoteRes.price_impact ?? '0';
    const priceImpact = parseFloat(priceImpactRaw.toString());

    // 4. Platform / routing protocol (e.g. "sdex", "soroswap")
    const platform = quoteRes.platform || quoteRes.routePlan?.[0]?.swapInfo?.protocol || 'sdex';

    return {
      fromAsset,
      toAsset,
      inputAmount: amount,
      estimatedOutput,
      minimumOutput: new BigNumber(minimumOutput).toFixed(7),
      priceImpact: isNaN(priceImpact) ? 0 : priceImpact,
      slippageTolerance,
      timestamp: Date.now(),
      source: 'SOROSWAP',
      platform,
      path: {
        path: [fromAsset, toAsset],
        pools: [],
        estimatedOutput,
        priceImpact: isNaN(priceImpact) ? 0 : priceImpact,
        hops: quoteRes.routePlan?.length
          ? quoteRes.routePlan.length
          : quoteRes.path?.length
            ? Math.max(1, quoteRes.path.length - 1)
            : 1,
      },
      alternativePaths: [],
    };
  }

  /**
   * Prepares the Soroswap transaction XDR from the backend.
   */
  async prepareSwap(params: SoroswapPrepareParams): Promise<{
    transaction: StellarSDK.Transaction;
    xdr: string;
    prepared: SoroswapPrepareResponse;
  }> {
    const prepared = await this.post<SoroswapPrepareResponse>('/prepare-swap', {
      assetIn: params.assetIn,
      assetOut: params.assetOut,
      amount: params.amount,
      slippageBps: params.slippageBps ?? 100,
      ...(params.from ? { from: params.from } : {}),
    });

    if (!prepared?.xdr) {
      throw new Error('Backend did not return prepared transaction XDR');
    }

    const expectedNetworkId = this.isTestnet ? 'testnet' : 'mainnet';
    if (prepared.network && prepared.network !== expectedNetworkId) {
      throw new Error(`Backend network is ${prepared.network}, expected ${expectedNetworkId}`);
    }
    if (prepared.networkPassphrase && prepared.networkPassphrase !== this.networkPassphrase) {
      throw new Error('Backend network passphrase does not match this app network');
    }

    const transaction = StellarSDK.TransactionBuilder.fromXDR(prepared.xdr, this.networkPassphrase);

    if (!(transaction instanceof StellarSDK.Transaction)) {
      throw new Error('Backend returned an unsupported transaction envelope');
    }

    return {
      transaction,
      xdr: prepared.xdr,
      prepared,
    };
  }

  /**
   * Broadcasts signed XDR to the Soroswap backend route.
   */
  async broadcastSwap(signedXdr: string): Promise<SoroswapBroadcastResponse> {
    const res = await this.post<SoroswapBroadcastResponse>('/broadcast', { signedXdr });
    return res;
  }

  /**
   * Signs and executes a Soroswap swap via the connected web wallet provider.
   */
  async executeSoroswap(
    preparedXdr: string,
    walletProvider: any,
    userAddress?: string
  ): Promise<string> {
    const stellarNetworkEnum = this.isTestnet ? 'TESTNET' : 'PUBLIC';

    const notifySign = async () => {
      const token = localStorage.getItem('device_token');
      if (!token) return;
      await sendCustomNotification(token, {
        title: 'Wallet Signature Required',
        body: 'Open your wallet to sign the Soroswap transaction.',
      }).catch(console.error);
    };

    let signedXdr: string | null = null;
    let submittedHash: string | null = null;

    // 1. Browser extension (Freighter, xBull, etc.)
    if (walletProvider && typeof walletProvider.signTransaction === 'function') {
      await notifySign();
      const signResult = await walletProvider.signTransaction(preparedXdr, {
        network: stellarNetworkEnum,
        networkPassphrase: this.networkPassphrase,
        networkUrl: this.horizonUrl,
        accountToSign: userAddress,
      });

      if (signResult && typeof signResult === 'object' && signResult.error) {
        throw new Error(signResult.error);
      }

      signedXdr =
        typeof signResult === 'string'
          ? signResult
          : signResult?.signedTxXdr || (signResult as any)?.signedXDR;

      if (!signedXdr) {
        throw new Error('Extension failed to sign the Soroswap transaction');
      }
    }
    // 2. WalletConnect session
    else if (walletProvider?.client && walletProvider?.session) {
      const config = getStellarConfig(this.isTestnet ? 'testnet' : 'mainnet');
      const topic = walletProvider.session.topic;
      const chainId = `stellar:${config.chainId}`;
      const signParams = {
        xdr: preparedXdr,
        network: stellarNetworkEnum,
        networkPassphrase: this.networkPassphrase,
      };

      await notifySign();

      let result: any;
      try {
        result = await walletProvider.client.request({
          topic,
          chainId,
          request: {
            method: 'stellar_signXDR',
            params: signParams,
          },
        });
      } catch {
        // Fallback to signAndSubmit if signXDR not supported
        result = await walletProvider.client.request({
          topic,
          chainId,
          request: {
            method: 'stellar_signAndSubmitXDR',
            params: signParams,
          },
        });
      }

      if (result?.hash || result?.status === 'success') {
        submittedHash =
          result?.hash ||
          new StellarSDK.Transaction(preparedXdr, this.networkPassphrase).hash().toString('hex');
      } else {
        signedXdr =
          result?.signedXDR || result?.signedTxXdr || (typeof result === 'string' ? result : null);
      }
    }
    // 3. Generic provider.request
    else if (typeof walletProvider?.request === 'function') {
      await notifySign();
      const result = await walletProvider.request({
        method: 'stellar_signXDR',
        params: {
          xdr: preparedXdr,
          network: stellarNetworkEnum,
          networkPassphrase: this.networkPassphrase,
        },
      });

      signedXdr =
        result?.signedXDR || result?.signedTxXdr || (typeof result === 'string' ? result : null);
    } else {
      throw new Error('No compatible Stellar wallet provider found to sign the transaction');
    }

    if (submittedHash) {
      if (userAddress) {
        StellarBaseService.invalidateAccountCache(userAddress, this.networkPassphrase);
      }
      return submittedHash;
    }

    if (!signedXdr) {
      throw new Error('Failed to obtain signed XDR from wallet');
    }

    // Broadcast to backend Soroswap /broadcast endpoint
    try {
      const broadcastRes = await this.broadcastSwap(signedXdr);
      const txHash =
        broadcastRes.hash ||
        broadcastRes.txHash ||
        (broadcastRes.result && (broadcastRes.result.hash || broadcastRes.result.id)) ||
        new StellarSDK.Transaction(signedXdr, this.networkPassphrase).hash().toString('hex');

      if (userAddress) {
        StellarBaseService.invalidateAccountCache(userAddress, this.networkPassphrase);
      }
      return txHash;
    } catch (broadcastErr: any) {
      console.warn(
        'Soroswap backend broadcast failed, submitting directly to Horizon:',
        broadcastErr
      );
      // Failover to Horizon direct submit
      const broadcastUrl = `${this.horizonUrl}/transactions`;
      const body = new URLSearchParams({ tx: signedXdr });
      const res = await fetch(broadcastUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.title || broadcastErr.message || 'Transaction submission failed');
      }
      if (userAddress) {
        StellarBaseService.invalidateAccountCache(userAddress, this.networkPassphrase);
      }
      return json.hash;
    }
  }
}
