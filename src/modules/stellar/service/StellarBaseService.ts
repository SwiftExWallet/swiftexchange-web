import * as StellarSDK from '@stellar/stellar-sdk';

import { getChainById } from '../../evm/utils/Chainregistry';
import type { TokenInfo } from '../types/stellar.types';

const accountCache = new Map<string, { data: StellarSDK.Horizon.AccountResponse; ts: number }>();
const serverPool = new Map<string, StellarSDK.Horizon.Server>();

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
    const bal = parseFloat(balance?.toString() || '0') || 0;
    const liabilities = parseFloat(sellingLiabilities?.toString() || '0') || 0;
    if (isNative) {
      const reserve = (2 + subentryCount) * 0.5 + 0.01;
      const spendable = Math.max(0, bal - reserve - liabilities);
      return spendable.toFixed(7);
    }
    const spendable = Math.max(0, bal - liabilities);
    return spendable.toFixed(7);
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
    try {
      const accountData = await this.getAccountData(address);
      balances = accountData.tokens;
      subentryCount = accountData.subentryCount;
    } catch (error) {
      console.warn(error, 'Could not load balances, using zero balances');
    }

    const registryTokens: TokenInfo[] = chainConfig.assets
      .map(a => {
        const isNative =
          a.type === 'NATIVE' || a.symbol === 'XLM' || a.address === 'native' || !a.address;

        let asset: StellarSDK.Asset;
        try {
          asset = isNative ? StellarSDK.Asset.native() : new StellarSDK.Asset(a.symbol, a.address);
        } catch {
          try {
            asset = StellarSDK.Asset.native();
          } catch {
            return null as any;
          }
        }

        const balRecord = balances.find(b => this.assetsEqual(b.asset, asset));

        return {
          asset,
          code: a.symbol,
          issuer: isNative ? undefined : a.address,
          balance: balRecord?.balance || '0',
          name: a.name,
          icon: a.logoURI,
          decimals: a.decimals,
          isPopular: true,
          hasTrustline: isNative || !!balRecord,
          homeDomain: a.domain || (isNative ? 'stellar.org' : undefined),
          domain: a.domain || (isNative ? 'stellar.org' : undefined),
        };
      })
      .filter(Boolean);

    const otherTokens = balances.filter(
      b => !registryTokens.some(rt => this.assetsEqual(rt.asset, b.asset))
    );

    return { tokens: [...registryTokens, ...otherTokens], subentryCount };
  }

  protected assetsEqual(a: StellarSDK.Asset, b: StellarSDK.Asset): boolean {
    if (a.isNative() && b.isNative()) return true;
    if (a.isNative() || b.isNative()) return false;
    return a.getCode() === b.getCode() && a.getIssuer() === b.getIssuer();
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
      const totalXlm = parseFloat(nativeBalRecord?.balance || '0');
      const subentryCount = sourceAccount.subentry_count || 0;
      const liabilities = parseFloat((nativeBalRecord as any)?.selling_liabilities || '0');
      const requiredReserve = (2 + subentryCount + 1) * 0.5 + liabilities + 0.01;

      if (totalXlm < requiredReserve) {
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
