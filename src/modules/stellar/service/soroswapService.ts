import * as StellarSDK from '@stellar/stellar-sdk';
import BigNumber from 'bignumber.js';

import { API_CONFIG, getCurrentNetwork } from '../../../service/apiConfig';
import { getConnectedWalletAddress } from '../../../service/apiService';
import { sendCustomNotification } from '../../../service/notificationService';
import { getChainById } from '../../evm/utils/Chainregistry';
import { getStellarConfig } from '../../walletconnect/config/chains';
import type { SwapQuote } from '../types/ammSwap.types';
import { StellarBaseService } from './StellarBaseService';

export const STELLAR_TESTNET_CONTRACT_MAP: Record<string, string> = {
  // XLM Native SAC on Testnet
  XLM: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  NATIVE: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',

  // USDC (GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5)
  'USDC-GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5':
    'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
  'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5':
    'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
  GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5:
    'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
  USDC: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',

  // USDC (CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F)
  'USDC-CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F':
    'CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F',
  'USDC:CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F':
    'CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F',

  // XTAR (CCZGLAUBDKJSQK72QOZHVU7CUWKW45OZWYWCLL27AEK74U2OIBK6LXF2)
  'XTAR-CCZGLAUBDKJSQK72QOZHVU7CUWKW45OZWYWCLL27AEK74U2OIBK6LXF2':
    'CCZGLAUBDKJSQK72QOZHVU7CUWKW45OZWYWCLL27AEK74U2OIBK6LXF2',
  'XTAR:CCZGLAUBDKJSQK72QOZHVU7CUWKW45OZWYWCLL27AEK74U2OIBK6LXF2':
    'CCZGLAUBDKJSQK72QOZHVU7CUWKW45OZWYWCLL27AEK74U2OIBK6LXF2',
  XTAR: 'CCZGLAUBDKJSQK72QOZHVU7CUWKW45OZWYWCLL27AEK74U2OIBK6LXF2',

  // XRP (CDDIA6HYANLPMDKBVQRIIXY3NA6S3TMHZFJUNPMBEJGZ5JSHN3E2TAUI)
  'XRP-CDDIA6HYANLPMDKBVQRIIXY3NA6S3TMHZFJUNPMBEJGZ5JSHN3E2TAUI':
    'CDDIA6HYANLPMDKBVQRIIXY3NA6S3TMHZFJUNPMBEJGZ5JSHN3E2TAUI',
  'XRP:CDDIA6HYANLPMDKBVQRIIXY3NA6S3TMHZFJUNPMBEJGZ5JSHN3E2TAUI':
    'CDDIA6HYANLPMDKBVQRIIXY3NA6S3TMHZFJUNPMBEJGZ5JSHN3E2TAUI',
  XRP: 'CDDIA6HYANLPMDKBVQRIIXY3NA6S3TMHZFJUNPMBEJGZ5JSHN3E2TAUI',

  // ARST (CBRQHWJDLPYVR4BSVUUWJCZGG4N4FF3CUZKDGRVTE36FAWNEJZEMQRME)
  'ARST-CBRQHWJDLPYVR4BSVUUWJCZGG4N4FF3CUZKDGRVTE36FAWNEJZEMQRME':
    'CBRQHWJDLPYVR4BSVUUWJCZGG4N4FF3CUZKDGRVTE36FAWNEJZEMQRME',
  'ARST:CBRQHWJDLPYVR4BSVUUWJCZGG4N4FF3CUZKDGRVTE36FAWNEJZEMQRME':
    'CBRQHWJDLPYVR4BSVUUWJCZGG4N4FF3CUZKDGRVTE36FAWNEJZEMQRME',
  ARST: 'CBRQHWJDLPYVR4BSVUUWJCZGG4N4FF3CUZKDGRVTE36FAWNEJZEMQRME',

  // AQUA (CDBCM2JWK2ERIE6EAVAZJJW3P25U5S3FLNHJDY72AVSVAVTU4E6NAQ43)
  'AQUA-CDBCM2JWK2ERIE6EAVAZJJW3P25U5S3FLNHJDY72AVSVAVTU4E6NAQ43':
    'CDBCM2JWK2ERIE6EAVAZJJW3P25U5S3FLNHJDY72AVSVAVTU4E6NAQ43',
  'AQUA:CDBCM2JWK2ERIE6EAVAZJJW3P25U5S3FLNHJDY72AVSVAVTU4E6NAQ43':
    'CDBCM2JWK2ERIE6EAVAZJJW3P25U5S3FLNHJDY72AVSVAVTU4E6NAQ43',
  AQUA: 'CDBCM2JWK2ERIE6EAVAZJJW3P25U5S3FLNHJDY72AVSVAVTU4E6NAQ43',

  // EURC (CBQDUWBOHS7P4TZIJ3KUPUZQOWMKJC6CQPPFEONSV3BH4X27YVEXWNOT)
  'EURC-CBQDUWBOHS7P4TZIJ3KUPUZQOWMKJC6CQPPFEONSV3BH4X27YVEXWNOT':
    'CBQDUWBOHS7P4TZIJ3KUPUZQOWMKJC6CQPPFEONSV3BH4X27YVEXWNOT',
  'EURC:CBQDUWBOHS7P4TZIJ3KUPUZQOWMKJC6CQPPFEONSV3BH4X27YVEXWNOT':
    'CBQDUWBOHS7P4TZIJ3KUPUZQOWMKJC6CQPPFEONSV3BH4X27YVEXWNOT',
  EURC: 'CBQDUWBOHS7P4TZIJ3KUPUZQOWMKJC6CQPPFEONSV3BH4X27YVEXWNOT',

  // BTC (CB7ICEHVRIRMF3CF6SIP2C2R3Z4E7WRPATT552QSVLIXZ5RSN6KLUDAE)
  'BTC-CB7ICEHVRIRMF3CF6SIP2C2R3Z4E7WRPATT552QSVLIXZ5RSN6KLUDAE':
    'CB7ICEHVRIRMF3CF6SIP2C2R3Z4E7WRPATT552QSVLIXZ5RSN6KLUDAE',
  'BTC:CB7ICEHVRIRMF3CF6SIP2C2R3Z4E7WRPATT552QSVLIXZ5RSN6KLUDAE':
    'CB7ICEHVRIRMF3CF6SIP2C2R3Z4E7WRPATT552QSVLIXZ5RSN6KLUDAE',
  BTC: 'CB7ICEHVRIRMF3CF6SIP2C2R3Z4E7WRPATT552QSVLIXZ5RSN6KLUDAE',

  // BRL (CAFLDVK2REIV6AWNCSTW4HVAGHJNCAROPLTXQYG23VSKL3PSUXEBHYAX)
  'BRL-CAFLDVK2REIV6AWNCSTW4HVAGHJNCAROPLTXQYG23VSKL3PSUXEBHYAX':
    'CAFLDVK2REIV6AWNCSTW4HVAGHJNCAROPLTXQYG23VSKL3PSUXEBHYAX',
  'BRL:CAFLDVK2REIV6AWNCSTW4HVAGHJNCAROPLTXQYG23VSKL3PSUXEBHYAX':
    'CAFLDVK2REIV6AWNCSTW4HVAGHJNCAROPLTXQYG23VSKL3PSUXEBHYAX',
  BRL: 'CAFLDVK2REIV6AWNCSTW4HVAGHJNCAROPLTXQYG23VSKL3PSUXEBHYAX',

  // UXIV (CADHV5C672FOGEUMCGYO2D6VQME3Y3NAP2FZRYJGA3VMDNOL5NAWQI7R)
  'UXIV-GCPJFNZAARY3Z2AM7RVXDZDLPOEBT4QHTQXFOFKMZHLV7PPDKE2M67Q6':
    'CADHV5C672FOGEUMCGYO2D6VQME3Y3NAP2FZRYJGA3VMDNOL5NAWQI7R',
  'UXIV:GCPJFNZAARY3Z2AM7RVXDZDLPOEBT4QHTQXFOFKMZHLV7PPDKE2M67Q6':
    'CADHV5C672FOGEUMCGYO2D6VQME3Y3NAP2FZRYJGA3VMDNOL5NAWQI7R',
  UXIV: 'CADHV5C672FOGEUMCGYO2D6VQME3Y3NAP2FZRYJGA3VMDNOL5NAWQI7R',

  // CYON (CBSWSTWY2OR7322PIIRU6Q6CY3VMMBBL6GX7TO5JV2M6OS2CG5ZHN7FX)
  'CYON-GCPJFNZAARY3Z2AM7RVXDZDLPOEBT4QHTQXFOFKMZHLV7PPDKE2M67Q6':
    'CBSWSTWY2OR7322PIIRU6Q6CY3VMMBBL6GX7TO5JV2M6OS2CG5ZHN7FX',
  'CYON:GCPJFNZAARY3Z2AM7RVXDZDLPOEBT4QHTQXFOFKMZHLV7PPDKE2M67Q6':
    'CBSWSTWY2OR7322PIIRU6Q6CY3VMMBBL6GX7TO5JV2M6OS2CG5ZHN7FX',
  CYON: 'CBSWSTWY2OR7322PIIRU6Q6CY3VMMBBL6GX7TO5JV2M6OS2CG5ZHN7FX',

  // JAMN (CBGFKYQJYMZC7HNW7RGQQOUR2LP5HAAQ3MPHDENMBNKBKOEDIWXJADAT)
  'JAMN-GCPJFNZAARY3Z2AM7RVXDZDLPOEBT4QHTQXFOFKMZHLV7PPDKE2M67Q6':
    'CBGFKYQJYMZC7HNW7RGQQOUR2LP5HAAQ3MPHDENMBNKBKOEDIWXJADAT',
  'JAMN:GCPJFNZAARY3Z2AM7RVXDZDLPOEBT4QHTQXFOFKMZHLV7PPDKE2M67Q6':
    'CBGFKYQJYMZC7HNW7RGQQOUR2LP5HAAQ3MPHDENMBNKBKOEDIWXJADAT',
  JAMN: 'CBGFKYQJYMZC7HNW7RGQQOUR2LP5HAAQ3MPHDENMBNKBKOEDIWXJADAT',

  // VEOF (CBV3JJ7CJK2J2YEJRM2HPFXT4GKBO574XEEVX6YL725R6CRARXITLDCH)
  'VEOF-GCPJFNZAARY3Z2AM7RVXDZDLPOEBT4QHTQXFOFKMZHLV7PPDKE2M67Q6':
    'CBV3JJ7CJK2J2YEJRM2HPFXT4GKBO574XEEVX6YL725R6CRARXITLDCH',
  'VEOF:GCPJFNZAARY3Z2AM7RVXDZDLPOEBT4QHTQXFOFKMZHLV7PPDKE2M67Q6':
    'CBV3JJ7CJK2J2YEJRM2HPFXT4GKBO574XEEVX6YL725R6CRARXITLDCH',
  VEOF: 'CBV3JJ7CJK2J2YEJRM2HPFXT4GKBO574XEEVX6YL725R6CRARXITLDCH',

  // STAK
  'STAK-GCVM2EPORQIRS24VBTXINTSLX2G55BBKIHOBCBG763OJBLJKIHJ7FCG2':
    'CBDOPXODNGCUJ22IGVHIYHIOMIBI6Y52DQZSZ6UVHA5BZPZNHJPEZLGX',
  'STAK:GCVM2EPORQIRS24VBTXINTSLX2G55BBKIHOBCBG763OJBLJKIHJ7FCG2':
    'CBDOPXODNGCUJ22IGVHIYHIOMIBI6Y52DQZSZ6UVHA5BZPZNHJPEZLGX',
  GCVM2EPORQIRS24VBTXINTSLX2G55BBKIHOBCBG763OJBLJKIHJ7FCG2:
    'CBDOPXODNGCUJ22IGVHIYHIOMIBI6Y52DQZSZ6UVHA5BZPZNHJPEZLGX',
  STAK: 'CBDOPXODNGCUJ22IGVHIYHIOMIBI6Y52DQZSZ6UVHA5BZPZNHJPEZLGX',
};

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

  public isNetworkTestnet(): boolean {
    return (
      this.isTestnet ||
      getCurrentNetwork() === 'testnet' ||
      (typeof this.networkPassphrase === 'string' &&
        (this.networkPassphrase.includes('Test SDF') ||
          this.networkPassphrase.toLowerCase().includes('testnet')))
    );
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

    // 1. Direct object support (TokenInfo / ChainAsset / IToken)
    if (asset && typeof asset === 'object' && !(asset instanceof StellarSDK.Asset)) {
      if (
        typeof asset.contract === 'string' &&
        asset.contract.startsWith('C') &&
        asset.contract.length === 56
      ) {
        return asset.contract;
      }
      if (
        typeof asset.contractAddress === 'string' &&
        asset.contractAddress.startsWith('C') &&
        asset.contractAddress.length === 56
      ) {
        return asset.contractAddress;
      }
      if (
        typeof asset.address === 'string' &&
        asset.address.startsWith('C') &&
        asset.address.length === 56
      ) {
        return asset.address;
      }
      if (asset.isNative || asset.symbol === 'XLM' || asset.code === 'XLM') {
        return isTestnet
          ? STELLAR_TESTNET_CONTRACT_MAP.XLM
          : StellarSDK.Asset.native().contractId(passphrase);
      }
      if (typeof asset.asset === 'string') {
        return this.getContractId(asset.asset, passphrase);
      }
      if (asset.symbol || asset.code) {
        const symbol = (asset.symbol || asset.code).trim().toUpperCase();
        const issuer = (asset.issuer || asset.address || '').trim();
        if (isTestnet) {
          const directKey = `${symbol}-${issuer}`;
          if (STELLAR_TESTNET_CONTRACT_MAP[directKey]) {
            return STELLAR_TESTNET_CONTRACT_MAP[directKey];
          }
          if (STELLAR_TESTNET_CONTRACT_MAP[symbol]) {
            return STELLAR_TESTNET_CONTRACT_MAP[symbol];
          }
        }
      }
    }

    // 2. String representation
    if (typeof asset === 'string') {
      const trimmed = asset.trim();
      // Already a 56-char C... Soroban contract address
      if (trimmed.startsWith('C') && trimmed.length === 56) {
        return trimmed;
      }

      if (isTestnet) {
        // Direct testnet contract mapping lookup
        if (STELLAR_TESTNET_CONTRACT_MAP[trimmed]) {
          return STELLAR_TESTNET_CONTRACT_MAP[trimmed];
        }
        if (STELLAR_TESTNET_CONTRACT_MAP[trimmed.toUpperCase()]) {
          return STELLAR_TESTNET_CONTRACT_MAP[trimmed.toUpperCase()];
        }

        // Try splitting by ':' or '-'
        const sep = trimmed.includes(':') ? ':' : trimmed.includes('-') ? '-' : null;
        if (sep) {
          const [code, issuer] = trimmed.split(sep);
          const upperCode = code.trim().toUpperCase();
          const cleanIssuer = issuer.trim();

          const keyHyphen = `${upperCode}-${cleanIssuer}`;
          if (STELLAR_TESTNET_CONTRACT_MAP[keyHyphen]) {
            return STELLAR_TESTNET_CONTRACT_MAP[keyHyphen];
          }
          const keyColon = `${upperCode}:${cleanIssuer}`;
          if (STELLAR_TESTNET_CONTRACT_MAP[keyColon]) {
            return STELLAR_TESTNET_CONTRACT_MAP[keyColon];
          }
          if (STELLAR_TESTNET_CONTRACT_MAP[cleanIssuer]) {
            return STELLAR_TESTNET_CONTRACT_MAP[cleanIssuer];
          }
          if (STELLAR_TESTNET_CONTRACT_MAP[upperCode]) {
            return STELLAR_TESTNET_CONTRACT_MAP[upperCode];
          }

          // Check chain registry dynamic testnet assets
          try {
            const chain = getChainById('testnet');
            const found = chain?.assets?.find(
              (a: any) =>
                a.contract &&
                a.contract.startsWith('C') &&
                ((a.symbol?.toUpperCase() === upperCode && a.issuer === cleanIssuer) ||
                  a.address === cleanIssuer ||
                  a.asset === trimmed)
            );
            if (found?.contract) {
              return found.contract;
            }
          } catch {
            // ignore
          }

          // Fallback SAC derivation for testnet
          try {
            return new StellarSDK.Asset(code, issuer).contractId(passphrase);
          } catch {
            // ignore
          }
        }

        if (trimmed.toUpperCase() === 'XLM' || trimmed.toLowerCase() === 'native') {
          return STELLAR_TESTNET_CONTRACT_MAP.XLM;
        }

        // Check if trimmed matches symbol only in testnet chain
        try {
          const chain = getChainById('testnet');
          const found = chain?.assets?.find(
            (a: any) =>
              a.contract &&
              a.contract.startsWith('C') &&
              (a.symbol?.toUpperCase() === trimmed.toUpperCase() ||
                a.name?.toUpperCase() === trimmed.toUpperCase())
          );
          if (found?.contract) {
            return found.contract;
          }
        } catch {
          // ignore
        }

        throw new Error(`Cannot derive Soroban testnet contract ID for asset: ${asset}`);
      }

      // Mainnet resolution
      if (trimmed.toUpperCase() === 'XLM' || trimmed.toLowerCase() === 'native') {
        return StellarSDK.Asset.native().contractId(passphrase);
      }
      const sep = trimmed.includes(':') ? ':' : trimmed.includes('-') ? '-' : null;
      if (sep) {
        const [code, issuer] = trimmed.split(sep);
        return new StellarSDK.Asset(code, issuer).contractId(passphrase);
      }
      throw new Error(`Cannot derive Soroban contract ID for asset: ${asset}`);
    }

    // 3. StellarSDK.Asset instance
    if (asset instanceof StellarSDK.Asset) {
      if (asset.isNative()) {
        return isTestnet ? STELLAR_TESTNET_CONTRACT_MAP.XLM : asset.contractId(passphrase);
      }
      if (isTestnet) {
        const code = asset.getCode().toUpperCase();
        const issuer = asset.getIssuer();
        const keyHyphen = `${code}-${issuer}`;
        if (STELLAR_TESTNET_CONTRACT_MAP[keyHyphen]) {
          return STELLAR_TESTNET_CONTRACT_MAP[keyHyphen];
        }
        if (STELLAR_TESTNET_CONTRACT_MAP[issuer]) {
          return STELLAR_TESTNET_CONTRACT_MAP[issuer];
        }
        if (STELLAR_TESTNET_CONTRACT_MAP[code]) {
          return STELLAR_TESTNET_CONTRACT_MAP[code];
        }
        try {
          const chain = getChainById('testnet');
          const found = chain?.assets?.find(
            (a: any) =>
              a.contract &&
              a.contract.startsWith('C') &&
              ((a.symbol?.toUpperCase() === code && a.issuer === issuer) || a.address === issuer)
          );
          if (found?.contract) {
            return found.contract;
          }
        } catch {
          // ignore
        }
      }
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
    fromAsset: StellarSDK.Asset | string | any,
    toAsset: StellarSDK.Asset | string | any,
    amount: string,
    options: { slippageTolerance?: number; maxHops?: number } = {}
  ): Promise<SwapQuote> {
    const assetIn = this.getContractId(fromAsset);
    const assetOut = this.getContractId(toAsset);
    const slippageTolerance = options.slippageTolerance ?? 1;

    const quoteRes: any = await this.post('/quote', {
      assetIn,
      assetOut,
      amount,
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

    // 1. Extract estimated output amount (prefer formatted decimal string if present)
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

    // 2. Extract minimum output amount (respecting slippage)
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

    // 3. Extract price impact
    const priceImpactRaw =
      quoteRes.priceImpactPct ?? quoteRes.priceImpact ?? quoteRes.price_impact ?? '0';
    const priceImpact = parseFloat(priceImpactRaw.toString());

    // 4. Platform / routing protocol (e.g. "sdex", "soroswap")
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

  /**
   * Prepares the Soroswap transaction XDR from the backend.
   */
  async prepareSwap(params: SoroswapPrepareParams): Promise<{
    transaction: StellarSDK.Transaction;
    xdr: string;
    prepared: SoroswapPrepareResponse;
  }> {
    const assetIn = this.getContractId(params.assetIn);
    const assetOut = this.getContractId(params.assetOut);
    const prepared = await this.post<SoroswapPrepareResponse>('/prepare-swap', {
      assetIn,
      assetOut,
      amount: params.amount,
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
