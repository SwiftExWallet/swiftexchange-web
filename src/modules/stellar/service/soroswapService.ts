import * as StellarSDK from '@stellar/stellar-sdk';
import BigNumber from 'bignumber.js';

import { API_CONFIG, getCurrentNetwork } from '../../../service/apiConfig';
import { getConnectedWalletAddress } from '../../../service/apiService';
import { sendCustomNotification } from '../../../service/notificationService';
import { getChainById } from '../../evm/utils/Chainregistry';
import { getStellarConfig } from '../../walletconnect/config/chains';
import type { SwapQuote } from '../types/ammSwap.types';
import {
  extractHashFromResult,
  extractSignedXdrFromResult,
  pollHorizonForConfirmation,
} from '../utils/transactionService';
import { StellarBaseService } from './StellarBaseService';

export const SOROSWAP_TESTNET_SUPPORTED_TOKENS = {
  XLM: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  USDC: 'CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F',
  XTAR: 'CCZGLAUBDKJSQK72QOZHVU7CUWKW45OZWYWCLL27AEK74U2OIBK6LXF2',
} as const;

export const isSoroswapTestnetSupported = (token: {
  symbol?: string;
  contract?: string;
  contractAddress?: string;
  address?: string;
  issuer?: string;
  isNative?: boolean;
}): boolean => {
  const sym = token.symbol?.toUpperCase();
  if (token.isNative || sym === 'XLM' || sym === 'NATIVE') {
    return true;
  }

  const tokenContract =
    token.contract ||
    token.contractAddress ||
    (token.address && StellarSDK.StrKey.isValidContract(token.address) ? token.address : undefined);

  if (tokenContract) {
    if (
      token.issuer?.startsWith('G') &&
      tokenContract === 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75'
    ) {
      return false;
    }
    return (
      tokenContract === SOROSWAP_TESTNET_SUPPORTED_TOKENS.USDC ||
      tokenContract === SOROSWAP_TESTNET_SUPPORTED_TOKENS.XTAR ||
      tokenContract === SOROSWAP_TESTNET_SUPPORTED_TOKENS.XLM
    );
  }

  const rawAddress = token.address || '';
  if (
    rawAddress.startsWith('G') ||
    rawAddress.includes('GBBD47') ||
    rawAddress.includes('CCW67') ||
    (token.issuer && token.issuer.startsWith('G'))
  ) {
    return false;
  }

  return sym === 'XTAR' || sym === 'USDC';
};

export const STELLAR_TESTNET_CONTRACT_MAP: Record<string, string> = {
  XLM: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  NATIVE: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  USDC: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
  XTAR: 'CCZGLAUBDKJSQK72QOZHVU7CUWKW45OZWYWCLL27AEK74U2OIBK6LXF2',
  GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5:
    'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
  'USDC-GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5':
    'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
  'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5':
    'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
  CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F:
    'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
  'USDC-CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F':
    'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
  CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75:
    'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
  CCZGLAUBDKJSQK72QOZHVU7CUWKW45OZWYWCLL27AEK74U2OIBK6LXF2:
    'CCZGLAUBDKJSQK72QOZHVU7CUWKW45OZWYWCLL27AEK74U2OIBK6LXF2',
};

export interface SoroswapQuoteParams {
  assetIn: string;
  assetOut: string;
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
  }

  public isNetworkTestnet(): boolean {
    if (typeof this.networkPassphrase === 'string') {
      if (this.networkPassphrase.includes('Public Global')) return false;
      if (
        this.networkPassphrase.includes('Test SDF') ||
        this.networkPassphrase.toLowerCase().includes('testnet')
      ) {
        return true;
      }
    }
    return this.isTestnet;
  }

  /**
   * Derives or validates the Soroban SAC (Stellar Asset Contract) ID (C...) for any asset.
   * On testnet, resolves custom and SAC contract addresses rather than raw asset issuers.
   */
  public getContractId(
    asset: StellarSDK.Asset | string | any,
    passphrase = this.networkPassphrase
  ): string {
    const isTestnet = this.isNetworkTestnet();

    if (asset && typeof asset === 'object' && !(asset instanceof StellarSDK.Asset)) {
      const contractCandidate = asset.contract || asset.contractAddress || asset.address;
      if (
        typeof contractCandidate === 'string' &&
        StellarSDK.StrKey.isValidContract(contractCandidate)
      ) {
        return contractCandidate;
      }
      if (asset.isNative || asset.symbol === 'XLM' || asset.code === 'XLM') {
        return isTestnet
          ? STELLAR_TESTNET_CONTRACT_MAP.XLM
          : StellarSDK.Asset.native().contractId(passphrase);
      }
      if (typeof asset.asset === 'string') {
        return this.getContractId(asset.asset, passphrase);
      }
      if (asset.asset instanceof StellarSDK.Asset) {
        return this.getContractId(asset.asset, passphrase);
      }
      const symbol = (asset.symbol || asset.code || '').trim().toUpperCase();
      const issuer = (asset.issuer || (asset.address?.startsWith('G') ? asset.address : '')).trim();
      if (isTestnet && STELLAR_TESTNET_CONTRACT_MAP[symbol]) {
        return STELLAR_TESTNET_CONTRACT_MAP[symbol];
      }
      if (issuer && StellarSDK.StrKey.isValidEd25519PublicKey(issuer)) {
        try {
          return new StellarSDK.Asset(symbol, issuer).contractId(passphrase);
        } catch {
          void 0;
        }
      }
      const chain = getChainById(isTestnet ? 'testnet' : 'pubnet') || getChainById('stellar');
      const found = chain?.assets?.find(
        (a: any) =>
          a.symbol?.toUpperCase() === symbol &&
          (a.contract?.startsWith('C') || a.issuer?.startsWith('G') || a.address?.startsWith('G'))
      );
      if (found) {
        if (found.contract && StellarSDK.StrKey.isValidContract(found.contract)) {
          return found.contract;
        }
        const iss = found.issuer || (found.address?.startsWith('G') ? found.address : null);
        if (iss) {
          try {
            return new StellarSDK.Asset(found.symbol, iss).contractId(passphrase);
          } catch {
            void 0;
          }
        }
      }
    }

    if (typeof asset === 'string') {
      const trimmed = asset.trim();
      if (StellarSDK.StrKey.isValidContract(trimmed)) {
        return trimmed;
      }

      if (trimmed.toUpperCase() === 'XLM' || trimmed.toLowerCase() === 'native') {
        return isTestnet
          ? STELLAR_TESTNET_CONTRACT_MAP.XLM
          : StellarSDK.Asset.native().contractId(passphrase);
      }

      if (isTestnet) {
        if (STELLAR_TESTNET_CONTRACT_MAP[trimmed]) {
          return STELLAR_TESTNET_CONTRACT_MAP[trimmed];
        }
        if (STELLAR_TESTNET_CONTRACT_MAP[trimmed.toUpperCase()]) {
          return STELLAR_TESTNET_CONTRACT_MAP[trimmed.toUpperCase()];
        }
      }

      const sep = trimmed.includes(':') ? ':' : trimmed.includes('-') ? '-' : null;
      if (sep) {
        const [code, issuer] = trimmed.split(sep);
        const upperCode = code.trim().toUpperCase();
        const cleanIssuer = issuer.trim();

        if (isTestnet) {
          const directKey = `${upperCode}-${cleanIssuer}`;
          if (STELLAR_TESTNET_CONTRACT_MAP[directKey]) {
            return STELLAR_TESTNET_CONTRACT_MAP[directKey];
          }
          if (STELLAR_TESTNET_CONTRACT_MAP[upperCode]) {
            return STELLAR_TESTNET_CONTRACT_MAP[upperCode];
          }
        }

        if (cleanIssuer && StellarSDK.StrKey.isValidEd25519PublicKey(cleanIssuer)) {
          try {
            return new StellarSDK.Asset(upperCode, cleanIssuer).contractId(passphrase);
          } catch {
            void 0;
          }
        }
      }

      const chain = getChainById(isTestnet ? 'testnet' : 'pubnet') || getChainById('stellar');
      const found = chain?.assets?.find(
        (a: any) =>
          (trimmed.startsWith('G') && (a.issuer === trimmed || a.address === trimmed)) ||
          a.symbol?.toUpperCase() === trimmed.toUpperCase() ||
          a.name?.toUpperCase() === trimmed.toUpperCase()
      );
      if (found) {
        if (found.contract && StellarSDK.StrKey.isValidContract(found.contract)) {
          return found.contract;
        }
        const iss = found.issuer || (found.address?.startsWith('G') ? found.address : null);
        if (iss) {
          try {
            return new StellarSDK.Asset(found.symbol, iss).contractId(passphrase);
          } catch {
            void 0;
          }
        }
      }
    }

    if (asset instanceof StellarSDK.Asset) {
      if (asset.isNative()) {
        return isTestnet ? STELLAR_TESTNET_CONTRACT_MAP.XLM : asset.contractId(passphrase);
      }
      const code = asset.getCode().toUpperCase();
      if (isTestnet && STELLAR_TESTNET_CONTRACT_MAP[code]) {
        return STELLAR_TESTNET_CONTRACT_MAP[code];
      }
      return asset.contractId(passphrase);
    }

    throw new Error('Invalid asset passed to getContractId');
  }

  private getBaseUrl(): string {
    return API_CONFIG.serverUrl.replace(/\/$/, '');
  }

  private getAuthHeaders(userAddress?: string): Record<string, string> {
    const token = API_CONFIG.deviceAuth;
    const walletAddress = userAddress || getConnectedWalletAddress('stellar');
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

  private async post<T>(path: string, body: unknown, userAddress?: string): Promise<T> {
    const url = this.endpoint(path);
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(userAddress),
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data?.message || data?.error || `HTTP ${res.status}`;
      const cleanMsg = typeof message === 'string' ? message : JSON.stringify(message);
      const err: any = new Error(cleanMsg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data as T;
  }

  async getQuote(
    fromAsset: StellarSDK.Asset | string | any,
    toAsset: StellarSDK.Asset | string | any,
    amount: string,
    options: { slippageTolerance?: number; maxHops?: number; userAddress?: string } = {}
  ): Promise<SwapQuote> {
    const assetIn = this.getContractId(fromAsset);
    const assetOut = this.getContractId(toAsset);
    const slippageTolerance = options.slippageTolerance ?? 1;

    const quoteRes: any = await this.post(
      '/quote',
      {
        assetIn,
        assetOut,
        amount,
      },
      options.userAddress
    );

    if (!quoteRes) {
      throw new Error('Backend did not return a valid Soroswap quote');
    }

    let scaleFactor = new BigNumber(1);
    if (quoteRes.amountIn && new BigNumber(amount).isGreaterThan(0)) {
      const calculatedScale = new BigNumber(quoteRes.amountIn).dividedBy(amount);
      if (calculatedScale.isGreaterThanOrEqualTo(10000)) {
        scaleFactor = calculatedScale;
      }
    } else {
      scaleFactor = new BigNumber(1e7);
    }

    let estimatedOutput: string;
    if (quoteRes.estimatedAmountOutFormatted != null) {
      estimatedOutput = new BigNumber(quoteRes.estimatedAmountOutFormatted).toFixed(7);
    } else if (quoteRes.rawTrade?.destination_amount) {
      estimatedOutput = new BigNumber(quoteRes.rawTrade.destination_amount).toFixed(7);
    } else {
      const estimatedOutputRaw =
        quoteRes.estimatedAmountOut ??
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

    const minMultiplier = new BigNumber(1).minus(new BigNumber(slippageTolerance).dividedBy(100));
    let minimumOutput: string;
    if (quoteRes.minimumAmountOutFormatted != null) {
      minimumOutput = new BigNumber(quoteRes.minimumAmountOutFormatted).toFixed(7);
    } else if (quoteRes.rawTrade?.min_destination_amount) {
      minimumOutput = new BigNumber(quoteRes.rawTrade.min_destination_amount).toFixed(7);
    } else if (quoteRes.minimumAmountOut != null) {
      const minStr = quoteRes.minimumAmountOut.toString();
      if (!minStr.includes('.') && scaleFactor.isGreaterThan(1)) {
        minimumOutput = new BigNumber(minStr).dividedBy(scaleFactor).toFixed(7);
      } else {
        minimumOutput = new BigNumber(minStr).toFixed(7);
      }
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

    const priceImpactRaw =
      quoteRes.priceImpactPct ?? quoteRes.priceImpact ?? quoteRes.price_impact ?? '0';
    const priceImpact = parseFloat(priceImpactRaw.toString());

    const platform =
      quoteRes.protocol ||
      quoteRes.platform ||
      quoteRes.routePlan?.[0]?.swapInfo?.protocol ||
      'soroswap';

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

  async prepareSwap(params: SoroswapPrepareParams): Promise<{
    transaction: StellarSDK.Transaction;
    xdr: string;
    prepared: SoroswapPrepareResponse;
  }> {
    const assetIn = this.getContractId(params.assetIn);
    const assetOut = this.getContractId(params.assetOut);
    const prepared = await this.post<SoroswapPrepareResponse>(
      '/prepare-swap',
      {
        assetIn,
        assetOut,
        amount: params.amount,
      },
      params.from
    );

    if (!prepared?.xdr) {
      throw new Error('Backend did not return prepared transaction XDR');
    }

    const expectedNetworkId = this.isTestnet ? 'testnet' : 'mainnet';
    const backendNet = (prepared.network || '').toLowerCase();
    const isNetworkMatch = this.isTestnet
      ? backendNet === 'testnet'
      : backendNet === 'mainnet' || backendNet === 'public' || backendNet === 'pubnet';

    if (prepared.network && !isNetworkMatch) {
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

  async broadcastSwap(signedXdr: string, userAddress?: string): Promise<SoroswapBroadcastResponse> {
    const res = await this.post<SoroswapBroadcastResponse>(
      '/broadcast',
      { signedXdr },
      userAddress
    );
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
    } else if (walletProvider?.client && walletProvider?.session) {
      const config = getStellarConfig(this.isTestnet ? 'testnet' : 'mainnet');
      const topic = walletProvider.session.topic;
      const chainId = `stellar:${config.chainId}`;
      const signParams = {
        xdr: preparedXdr,
        network: stellarNetworkEnum,
        networkPassphrase: this.networkPassphrase,
      };

      await notifySign();

      const computedHash = new StellarSDK.Transaction(preparedXdr, this.networkPassphrase)
        .hash()
        .toString('hex');

      const reqPromise = (async () => {
        try {
          return await walletProvider.client.request({
            topic,
            chainId,
            request: {
              method: 'stellar_signAndSubmitXDR',
              params: signParams,
            },
          });
        } catch {
          return await walletProvider.client.request({
            topic,
            chainId,
            request: {
              method: 'stellar_signXDR',
              params: signParams,
            },
          });
        }
      })();

      let pollTimer: ReturnType<typeof setTimeout> | undefined;
      const pollPromise = new Promise<{ hash: string; status: string }>(resolve => {
        pollTimer = setTimeout(async () => {
          try {
            const res = await pollHorizonForConfirmation(this.horizonUrl, computedHash);
            if (res) {
              resolve({ hash: res, status: 'success' });
            }
          } catch {
            // Polling error ignored while wallet request is pending
          }
        }, 2500);
      });

      let result: any;
      try {
        result = await Promise.race([reqPromise, pollPromise]);
      } finally {
        if (pollTimer) clearTimeout(pollTimer);
      }

      const extractedHash = extractHashFromResult(result, computedHash);
      if (extractedHash) {
        submittedHash = extractedHash;
      } else {
        signedXdr = extractSignedXdrFromResult(result) || null;
      }
    } else if (typeof walletProvider?.request === 'function') {
      await notifySign();

      const computedHash = new StellarSDK.Transaction(preparedXdr, this.networkPassphrase)
        .hash()
        .toString('hex');

      const reqPromise = (async () => {
        try {
          return await walletProvider.request({
            method: 'stellar_signAndSubmitXDR',
            params: {
              xdr: preparedXdr,
              network: stellarNetworkEnum,
              networkPassphrase: this.networkPassphrase,
            },
          });
        } catch {
          return await walletProvider.request({
            method: 'stellar_signXDR',
            params: {
              xdr: preparedXdr,
              network: stellarNetworkEnum,
              networkPassphrase: this.networkPassphrase,
            },
          });
        }
      })();

      let pollTimer: ReturnType<typeof setTimeout> | undefined;
      const pollPromise = new Promise<{ hash: string; status: string }>(resolve => {
        pollTimer = setTimeout(async () => {
          try {
            const res = await pollHorizonForConfirmation(this.horizonUrl, computedHash);
            if (res) {
              resolve({ hash: res, status: 'success' });
            }
          } catch {
            // Polling error ignored while wallet request is pending
          }
        }, 2500);
      });

      let result: any;
      try {
        result = await Promise.race([reqPromise, pollPromise]);
      } finally {
        if (pollTimer) clearTimeout(pollTimer);
      }

      const extractedHash = extractHashFromResult(result, computedHash);
      if (extractedHash) {
        submittedHash = extractedHash;
      } else {
        signedXdr = extractSignedXdrFromResult(result) || null;
      }
    } else {
      throw new Error('No compatible Stellar wallet provider found to sign the transaction');
    }

    if (submittedHash) {
      if (userAddress) {
        StellarBaseService.invalidateAccountCache(userAddress, this.networkPassphrase);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('stellar-trustline-added'));
        window.dispatchEvent(new Event('stellar-balance-changed'));
      }
      return submittedHash;
    }

    if (!signedXdr) {
      throw new Error('Failed to obtain signed XDR from wallet');
    }

    try {
      const broadcastRes = await this.broadcastSwap(signedXdr, userAddress);
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
