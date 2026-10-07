import * as StellarSDK from '@stellar/stellar-sdk';
import BigNumber from 'bignumber.js';

import { getChainById } from '../../evm/utils/Chainregistry';
import type { TokenInfo } from '../types/stellar.types';
import { SOROSWAP_TESTNET_SUPPORTED_TOKENS, isSoroswapTestnetSupported } from './soroswapService';

const accountCache = new Map<string, { data: StellarSDK.Horizon.AccountResponse; ts: number }>();
const serverPool = new Map<string, StellarSDK.Horizon.Server>();

export const getStellarExpertTestnetValueUrl = (address: string): string => {
  if (typeof window === 'undefined') {
    return `https://api.stellar.expert/explorer/testnet/account/${address}/value`;
  }
  return `/api-stellar-expert/explorer/testnet/account/${address}/value`;
};

export class StellarBaseService {
  protected server: StellarSDK.Horizon.Server;
  protected networkPassphrase: string;
  protected networkKey: string;

  constructor(horizonUrl: string, networkPassphrase: string, networkKey: string) {
    this.server = StellarBaseService.getOrCreateServer(horizonUrl);
    this.networkPassphrase = networkPassphrase;
    this.networkKey = networkKey;
  }

  static getOrCreateServer(horizonUrl: string): StellarSDK.Horizon.Server {
    let instance = serverPool.get(horizonUrl);
    if (!instance) {
      const serverOptions: any = {};
      if (horizonUrl.startsWith('http://')) {
        serverOptions.allowHttp = true;
      }
      instance = new StellarSDK.Horizon.Server(horizonUrl, serverOptions);
      serverPool.set(horizonUrl, instance);
    }
    return instance;
  }

  static clearServerPool() {
    serverPool.clear();
  }

  static calculateSpendableBalance(
    balance: string | number,
    subentryCount: number = 0,
    isNative: boolean = false,
    sellingLiabilities: string | number = 0
  ): string {
    const bal = new BigNumber(balance?.toString() || '0');
    const liabilities = new BigNumber(sellingLiabilities?.toString() || '0');
    if (bal.isNaN() || bal.isLessThanOrEqualTo(0)) {
      return '0.0000000';
    }

    if (isNative) {
      const baseReserve = new BigNumber('0.5');
      const buffer = new BigNumber('0.01');
      const reserve = new BigNumber(2 + subentryCount).multipliedBy(baseReserve).plus(buffer);
      const spendable = bal.minus(reserve).minus(liabilities);
      return BigNumber.max(0, spendable).toFixed(7, BigNumber.ROUND_DOWN);
    }

    const spendable = bal.minus(liabilities);
    return BigNumber.max(0, spendable).toFixed(7, BigNumber.ROUND_DOWN);
  }

  static clearAccountCache() {
    accountCache.clear();
  }

  static invalidateAccountCache(address: string, networkPassphrase?: string) {
    if (networkPassphrase) {
      accountCache.delete(`${networkPassphrase}-${address}`);
    } else {
      for (const key of accountCache.keys()) {
        if (key.endsWith(`-${address}`)) {
          accountCache.delete(key);
        }
      }
    }
  }

  async getAccountData(address: string): Promise<{ tokens: TokenInfo[]; subentryCount: number }> {
    if (!StellarSDK.StrKey.isValidEd25519PublicKey(address)) {
      throw new Error('Invalid Stellar address');
    }

    try {
      let response: StellarSDK.Horizon.AccountResponse;
      const cacheKey = `${this.networkPassphrase}-${address}`;
      const cached = accountCache.get(cacheKey);

      if (cached && Date.now() - cached.ts < 10000) {
        response = cached.data;
      } else {
        response = await this.server.loadAccount(address);
        accountCache.set(cacheKey, { data: response, ts: Date.now() });
      }
      const tokens: TokenInfo[] = [];

      for (const balance of response.balances) {
        if (balance.asset_type === 'native') {
          tokens.push({
            asset: StellarSDK.Asset.native(),
            code: 'XLM',
            balance: balance.balance,
            isPopular: true,
            hasTrustline: true,
          });
        } else if (
          balance.asset_type === 'credit_alphanum4' ||
          balance.asset_type === 'credit_alphanum12'
        ) {
          const asset = new StellarSDK.Asset(balance.asset_code, balance.asset_issuer);
          tokens.push({
            asset,
            code: balance.asset_code,
            issuer: balance.asset_issuer,
            balance: balance.balance,
            isPopular: false,
            hasTrustline: true,
          });
        }
      }

      return { tokens, subentryCount: response.subentry_count };
    } catch (error: any) {
      if (error.response?.status === 404) {
        return {
          tokens: [
            {
              asset: StellarSDK.Asset.native(),
              code: 'XLM',
              balance: '0',
              isPopular: true,
              hasTrustline: true,
            },
          ],
          subentryCount: 0,
        };
      }
      console.error('Failed to fetch token balances:', error);
      throw new Error('Failed to load account balances');
    }
  }

  async getTokenBalances(address: string): Promise<TokenInfo[]> {
    const { tokens } = await this.getAccountData(address);
    return tokens;
  }

  async getAssetsWithBalances(
    address: string
  ): Promise<{ tokens: TokenInfo[]; subentryCount: number }> {
    const isMainnet = this.networkPassphrase.includes('Public Global Stellar Network');
    const chainId = isMainnet ? 'pubnet' : 'testnet';
    const chainConfig = getChainById(chainId);

    if (!chainConfig) return { tokens: [], subentryCount: 0 };

    let balances: TokenInfo[] = [];
    let subentryCount = 0;
    if (address && StellarSDK.StrKey.isValidEd25519PublicKey(address)) {
      try {
        const accountData = await this.getAccountData(address);
        balances = accountData.tokens;
        subentryCount = accountData.subentryCount;
      } catch (error) {
        console.warn(error, 'Could not load balances, using zero balances');
      }
    }

    const expertBalances = new Map<string, string>();
    if (!isMainnet && address && StellarSDK.StrKey.isValidEd25519PublicKey(address)) {
      try {
        const res = await fetch(getStellarExpertTestnetValueUrl(address));
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.balances)) {
            for (const b of data.balances) {
              if (b?.asset && b?.balance !== undefined) {
                const formatted = new BigNumber(b.balance).dividedBy(1e7).toString();
                expertBalances.set(b.asset, formatted);
              }
            }
          }
        }
      } catch (error) {
        console.warn('Could not load testnet balances from stellar.expert:', error);
      }
      if (expertBalances.size > 0) {
        subentryCount = Math.max(subentryCount, expertBalances.size);
      }
    }

    let registryTokens: TokenInfo[] = chainConfig.assets
      .map(a => {
        const isNative =
          a.type === 'NATIVE' ||
          a.symbol === 'XLM' ||
          a.address === 'native' ||
          (!a.address && !a.contract);

        let asset: any;
        const effectiveIssuer = a.issuer || (a.address?.startsWith('G') ? a.address : undefined);
        const effectiveContract =
          a.contract || (a.address?.startsWith('C') ? a.address : undefined);

        if (isNative) {
          asset = StellarSDK.Asset.native();
        } else if (effectiveIssuer && effectiveIssuer.startsWith('G')) {
          try {
            asset = new StellarSDK.Asset(a.symbol, effectiveIssuer);
          } catch {
            asset = {
              isNative: () => false,
              getCode: () => a.symbol,
              getIssuer: () => effectiveIssuer,
              contractId: () => effectiveContract,
            };
          }
        } else {
          asset = {
            isNative: () => false,
            getCode: () => a.symbol,
            getIssuer: () => effectiveContract || a.address || '',
            contractId: () => effectiveContract || a.address,
            toString: () => `${a.symbol}:${effectiveContract || a.address || ''}`,
          };
        }

        const balRecord = balances.find(b => this.assetsEqual(b.asset, asset));

        let balance = balRecord?.balance || '0';
        if (!isMainnet && expertBalances.size > 0) {
          const expertBal =
            (effectiveContract && expertBalances.get(effectiveContract)) ||
            (a.contract && expertBalances.get(a.contract)) ||
            (a.address && expertBalances.get(a.address)) ||
            (effectiveIssuer && expertBalances.get(`${a.symbol}-${effectiveIssuer}`)) ||
            (effectiveIssuer && expertBalances.get(`${a.symbol}:${effectiveIssuer}`)) ||
            (isNative ? expertBalances.get('XLM') : undefined);
          if (expertBal !== undefined && (balance === '0' || !balRecord)) {
            balance = expertBal;
          }
        }

        return {
          asset,
          code: a.symbol,
          issuer: isNative ? undefined : effectiveIssuer,
          balance,
          name: a.name,
          icon: a.logoURI,
          decimals: a.decimals,
          isPopular: true,
          hasTrustline:
            isNative ||
            !effectiveIssuer ||
            !effectiveIssuer.startsWith('G') ||
            (balRecord ? (balRecord.hasTrustline ?? true) : false) ||
            balance !== '0' ||
            (effectiveContract && expertBalances.has(effectiveContract)) ||
            (a.contract && expertBalances.has(a.contract)) ||
            (a.address && expertBalances.has(a.address)) ||
            (effectiveIssuer && expertBalances.has(`${a.symbol}-${effectiveIssuer}`)) ||
            (effectiveIssuer && expertBalances.has(`${a.symbol}:${effectiveIssuer}`)),
          homeDomain: a.domain || (isNative ? 'stellar.org' : undefined),
          domain: a.domain || (isNative ? 'stellar.org' : undefined),
          contract: effectiveContract,
        };
      })
      .filter(Boolean);

    if (!isMainnet) {
      for (const [sym, contractId] of Object.entries(SOROSWAP_TESTNET_SUPPORTED_TOKENS)) {
        if (sym === 'XLM') continue;
        const existing = registryTokens.find(
          rt => rt.code === sym || (rt as any).contract === contractId
        );
        const bal = expertBalances.get(contractId) || '0';
        if (!existing) {
          registryTokens.push({
            asset: {
              isNative: () => false,
              getCode: () => sym,
              getIssuer: () => contractId,
              contractId: () => contractId,
              toString: () => `${sym}:${contractId}`,
            } as any,
            code: sym,
            balance: bal,
            name: sym === 'XTAR' ? 'Dogstar' : sym === 'USDC' ? 'USD Coin' : sym,
            icon:
              sym === 'XTAR'
                ? 'https://dogstarcoin.com/logo.png'
                : 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
            decimals: 7,
            isPopular: true,
            hasTrustline: true,
            contract: contractId,
          });
        } else {
          (existing as any).contract = contractId;
          if (bal !== '0' || existing.balance === '0') {
            existing.balance = bal;
          }
          if (
            existing.hasTrustline ||
            expertBalances.has(contractId) ||
            (existing.issuer && expertBalances.has(`${sym}-${existing.issuer}`)) ||
            balances.some(b => b.code === sym)
          ) {
            existing.hasTrustline = true;
          }
        }
      }

      const xlmToken = registryTokens.find(
        rt => rt.code === 'XLM' || (typeof rt.asset?.isNative === 'function' && rt.asset.isNative())
      );
      if (xlmToken && expertBalances.has('XLM')) {
        xlmToken.balance = expertBalances.get('XLM') || xlmToken.balance;
      }

      registryTokens = registryTokens.filter(t =>
        isSoroswapTestnetSupported({
          symbol: t.code,
          address: t.contract || t.issuer,
          contract: t.contract,
          isNative:
            (typeof t.asset?.isNative === 'function' && t.asset.isNative()) || t.code === 'XLM',
        })
      );
    }

    const otherTokens = balances.filter(
      b => !registryTokens.some(rt => this.assetsEqual(rt.asset, b.asset))
    );

    return { tokens: [...registryTokens, ...otherTokens], subentryCount };
  }

  protected assetsEqual(a: any, b: any): boolean {
    if (!a || !b) return false;
    const aIsNative =
      typeof a.isNative === 'function' ? a.isNative() : a === 'native' || a === 'XLM';
    const bIsNative =
      typeof b.isNative === 'function' ? b.isNative() : b === 'native' || b === 'XLM';
    if (aIsNative && bIsNative) return true;
    if (aIsNative || bIsNative) return false;
    const aCode = typeof a.getCode === 'function' ? a.getCode() : a.code || a.symbol;
    const bCode = typeof b.getCode === 'function' ? b.getCode() : b.code || b.symbol;
    const aIssuer =
      typeof a.getIssuer === 'function' ? a.getIssuer() : a.issuer || a.contract || a.address;
    const bIssuer =
      typeof b.getIssuer === 'function' ? b.getIssuer() : b.issuer || b.contract || b.address;
    return aCode === bCode && aIssuer === bIssuer;
  }

  protected ensureTrustline(
    txBuilder: StellarSDK.TransactionBuilder,
    sourceAccount: StellarSDK.Horizon.AccountResponse,
    asset: StellarSDK.Asset
  ) {
    if (asset.isNative()) return;

    const hasTrustline = sourceAccount.balances.some(
      (b: any) =>
        (b.asset_type === 'credit_alphanum4' || b.asset_type === 'credit_alphanum12') &&
        b.asset_code === asset.getCode() &&
        b.asset_issuer === asset.getIssuer()
    );

    if (!hasTrustline) {
      const nativeBalRecord = sourceAccount.balances.find((b: any) => b.asset_type === 'native');
      const totalXlm = new BigNumber(nativeBalRecord?.balance || '0');
      const subentryCount = sourceAccount.subentry_count || 0;
      const liabilities = new BigNumber((nativeBalRecord as any)?.selling_liabilities || '0');
      const baseReserve = new BigNumber('0.5');
      const buffer = new BigNumber('0.01');
      const requiredReserve = new BigNumber(2 + subentryCount + 1)
        .multipliedBy(baseReserve)
        .plus(liabilities)
        .plus(buffer);

      if (totalXlm.isLessThan(requiredReserve)) {
        throw new Error(
          `Insufficient XLM balance to establish trustline for ${asset.getCode()}. You need at least ${requiredReserve.toFixed(2)} XLM to cover Stellar minimum reserves (current balance: ${totalXlm.toFixed(2)} XLM).`
        );
      }

      txBuilder.addOperation(
        StellarSDK.Operation.changeTrust({
          asset: asset,
        })
      );
    }
  }
}
