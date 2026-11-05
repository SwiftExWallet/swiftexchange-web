import * as StellarSdk from '@stellar/stellar-sdk';
import BigNumber from 'bignumber.js';

import { getAssetBySymbol, getGlobalAssetMetadata } from '../../../evm/utils/Chainregistry';
import { getStellarExpertTestnetValueUrl } from '../../../stellar/service/StellarBaseService';
import { SOROSWAP_TESTNET_SUPPORTED_TOKENS } from '../../../stellar/service/soroswapService';
import { getStellarConfig } from '../../config/chains';
import { type Asset } from '../../store/portfolioStore';
import { type IPortfolioProvider, type PortfolioFetchParams } from '../types';

export class StellarPortfolioProvider implements IPortfolioProvider {
  public id = 'stellar';

  async fetch(params: PortfolioFetchParams): Promise<Asset[]> {
    const { connectedWallets, network } = params;
    const stellarAddress = connectedWallets.stellar?.address;

    if (!stellarAddress) return [];

    try {
      const stellarChainId = network === 'mainnet' ? 'pubnet' : 'testnet';
      const assets: Asset[] = [];

      if (network === 'mainnet') {
        const config = getStellarConfig('mainnet');
        const server = new StellarSdk.Horizon.Server(config.horizonUrl);
        const account = await server.loadAccount(stellarAddress);

        for (const b of account.balances) {
          const isNative = b.asset_type === 'native';
          const symbol = 'asset_code' in b ? b.asset_code : 'XLM';
          const issuer = ('asset_issuer' in b ? b.asset_issuer : undefined) ?? undefined;

          const registryAsset = getAssetBySymbol(stellarChainId, symbol);
          const globalMeta = !registryAsset ? getGlobalAssetMetadata(symbol) : undefined;

          const name = registryAsset?.name || symbol;
          const image =
            registryAsset?.logoURI ||
            globalMeta?.logoURI ||
            `https://ui-avatars.com/api/?name=${symbol}&background=random`;

          assets.push({
            id: isNative ? 'stellar-XLM' : `stellar-${symbol}-${issuer}`,
            symbol,
            name,
            image,
            balance: parseFloat(b.balance),
            current_price: 0,
            price_change_percentage_24h: 0,
            chainName: 'Stellar',
            chainType: 'stellar',
            chainId: stellarChainId,
            address: issuer,
            decimals: 7,
            isNative,
          });
        }
      } else {
        try {
          const res = await fetch(getStellarExpertTestnetValueUrl(stellarAddress));
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data?.balances)) {
              for (const eb of data.balances) {
                if (!eb?.asset) continue;
                const formattedBal =
                  parseFloat(new BigNumber(eb.balance).dividedBy(1e7).toString()) || 0;

                if (eb.asset === 'XLM') {
                  const registryAsset = getAssetBySymbol(stellarChainId, 'XLM');
                  assets.push({
                    id: 'stellar-XLM',
                    symbol: 'XLM',
                    name: registryAsset?.name || 'Stellar',
                    image:
                      registryAsset?.logoURI ||
                      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/stellar/info/logo.png',
                    balance: formattedBal,
                    current_price: 0,
                    price_change_percentage_24h: 0,
                    chainName: 'Stellar Testnet',
                    chainType: 'stellar',
                    chainId: stellarChainId,
                    address: 'native',
                    decimals: 7,
                    isNative: true,
                  });
                  continue;
                }

                const matchingSupported = Object.entries(SOROSWAP_TESTNET_SUPPORTED_TOKENS).find(
                  ([sym, cId]) => cId === eb.asset && sym !== 'XLM'
                );
                if (!matchingSupported) continue;

                const symbol = matchingSupported[0];
                const contractId = matchingSupported[1];
                const registryAsset = getAssetBySymbol(stellarChainId, symbol);
                const globalMeta = !registryAsset ? getGlobalAssetMetadata(symbol) : undefined;
                const name = registryAsset?.name || symbol;
                const image =
                  registryAsset?.logoURI ||
                  globalMeta?.logoURI ||
                  `https://ui-avatars.com/api/?name=${symbol}&background=random`;

                assets.push({
                  id: `stellar-${symbol}-${contractId}`,
                  symbol,
                  name,
                  image,
                  balance: formattedBal,
                  current_price: 0,
                  price_change_percentage_24h: 0,
                  chainName: 'Stellar Testnet',
                  chainType: 'stellar',
                  chainId: stellarChainId,
                  address: contractId,
                  decimals: 7,
                  isNative: false,
                });
              }
            }
          }
        } catch (e) {
          console.warn('[StellarPortfolioProvider] Failed to fetch testnet balances:', e);
        }

        if (assets.length === 0) {
          try {
            const config = getStellarConfig('testnet');
            const server = new StellarSdk.Horizon.Server(config.horizonUrl);
            const account = await server.loadAccount(stellarAddress);
            for (const b of account.balances) {
              const isNative = b.asset_type === 'native';
              const symbol = 'asset_code' in b ? b.asset_code : 'XLM';
              const issuer = ('asset_issuer' in b ? b.asset_issuer : undefined) ?? undefined;
              const registryAsset = getAssetBySymbol(stellarChainId, symbol);
              const globalMeta = !registryAsset ? getGlobalAssetMetadata(symbol) : undefined;
              const name = registryAsset?.name || symbol;
              const image =
                registryAsset?.logoURI ||
                globalMeta?.logoURI ||
                (isNative
                  ? 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/stellar/info/logo.png'
                  : `https://ui-avatars.com/api/?name=${symbol}&background=random`);

              assets.push({
                id: isNative ? 'stellar-XLM' : `stellar-${symbol}-${issuer}`,
                symbol,
                name,
                image,
                balance: parseFloat(b.balance),
                current_price: 0,
                price_change_percentage_24h: 0,
                chainName: 'Stellar Testnet',
                chainType: 'stellar',
                chainId: stellarChainId,
                address: issuer,
                decimals: 7,
                isNative,
              });
            }
          } catch {
            // fallback
          }
        }

        if (!assets.some(a => a.symbol === 'XLM')) {
          const registryAsset = getAssetBySymbol(stellarChainId, 'XLM');
          assets.unshift({
            id: 'stellar-XLM',
            symbol: 'XLM',
            name: registryAsset?.name || 'Stellar',
            image:
              registryAsset?.logoURI ||
              'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/stellar/info/logo.png',
            balance: 0,
            current_price: 0,
            price_change_percentage_24h: 0,
            chainName: 'Stellar Testnet',
            chainType: 'stellar',
            chainId: stellarChainId,
            address: 'native',
            decimals: 7,
            isNative: true,
          });
        }
      }

      return assets;
    } catch (error: any) {
      if (error?.response?.status === 404 || error?.status === 404) {
        return [];
      }
      console.error('[StellarPortfolioProvider] Failed to fetch Stellar portfolio:', error);
      return [];
    }
  }
}
