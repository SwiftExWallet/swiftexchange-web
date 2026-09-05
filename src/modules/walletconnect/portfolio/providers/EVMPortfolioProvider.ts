import { Contract, formatEther, formatUnits } from 'ethers';

import { ERC20_ABI } from '../../../../abi/Erc20AbI';
import { getTestnetTokensForChain } from '../../../../data/testnet/evm-testnet-tokens';
import { fetchApiResponseFromServer } from '../../../../service/apiService';
import {
  type NetworkType,
  // getChainBySlug,
  findChain,
  getAssetByAddress,
  getChainLogoUrl,
  getChainName,
  getChainNativeSymbol,
  getEvmChainsForNetwork,
} from '../../../evm/utils/Chainregistry';
import {
  AGGREGATOR_NATIVE_ADDRESS,
  NATIVE_ADDRESS,
} from '../../../evm/utils/assetmanagement/constants';
import { rpcManager } from '../../../evm/utils/rpcProvider';
import { type Asset } from '../../store/portfolioStore';
import { type IPortfolioProvider, type PortfolioFetchParams } from '../types';

interface BackendResponse {
  data: {
    tokens: BackendToken[];
  };
}

interface BackendToken {
  address: string;
  network: string;
  tokenAddress: string | null;
  tokenBalance: string;
  tokenMetadata: {
    symbol: string | null;
    decimals: number | null;
    name: string | null;
    logo: string | null;
  };
  tokenPrices: Array<{
    currency: string;
    value: string;
  }>;
}

export class EVMPortfolioProvider implements IPortfolioProvider {
  public id = 'evm';

  async fetch(params: PortfolioFetchParams): Promise<Asset[]> {
    const { connectedWallets, network } = params;
    const evmAddress = connectedWallets.evm?.address;

    if (!evmAddress) return [];
    const walletAddress: string = evmAddress;

    try {
      console.info(
        `[EVMPortfolioProvider] Fetching portfolio from backend API for ${walletAddress} (${network})`
      );
      const response = await fetchApiResponseFromServer<BackendResponse>(
        `/portfolio/${walletAddress}`,
        'GET'
      );

      if (!response.data?.data?.tokens) {
        console.warn(
          '[EVMPortfolioProvider] Unexpected response format or empty data from backend'
        );
        if (network === 'testnet') {
          return this.fetchTestnet(walletAddress);
        }
        return [];
      }

      const backendTokens = response.data.data.tokens;

      const parsedAssets = (
        backendTokens.map((token: BackendToken) => {
          const [rawSlug, net] = token.network.split('-');

          // Standardize common backend slugs to match our internal names/keys
          let id = rawSlug.toLowerCase();
          if (id === 'matic') id = 'polygon';
          if (id === 'bnb') id = 'binance';

          // Determine network type: use token's network suffix or current network context
          const networkType = (net as NetworkType) || (network as NetworkType) || 'mainnet';

          // Lookup chain configuration in registry
          const chain = findChain(id, networkType);
          if (!chain) return null;

          // Ensure token matches the currently requested network (mainnet vs testnet)
          if (chain.networkType !== network) return null;

          const chainId = chain.chainId as number;
          const lowerTokenAddress = (token.tokenAddress || '').toLowerCase();
          const isNative =
            !token.tokenAddress ||
            lowerTokenAddress === NATIVE_ADDRESS.toLowerCase() ||
            lowerTokenAddress === AGGREGATOR_NATIVE_ADDRESS.toLowerCase();
          const assetAddress = isNative ? NATIVE_ADDRESS : token.tokenAddress!;

          const registryAsset = getAssetByAddress(chainId, assetAddress);

          const decimals = token.tokenMetadata.decimals ?? registryAsset?.decimals ?? 18;
          const symbol =
            token.tokenMetadata.symbol ??
            registryAsset?.symbol ??
            (isNative ? getChainNativeSymbol(chainId) : 'TOKEN');
          const name =
            token.tokenMetadata.name ??
            registryAsset?.name ??
            (isNative ? getChainName(chainId) : 'Unknown Token');
          const logo =
            token.tokenMetadata.logo ?? registryAsset?.logoURI ?? getChainLogoUrl(chainId) ?? '';

          let balance = 0;
          try {
            if (token.tokenBalance && token.tokenBalance !== '0x' && token.tokenBalance !== '0x0') {
              balance = parseFloat(formatUnits(token.tokenBalance, decimals));
            }
          } catch (e) {
            console.error(`[EVMPortfolioProvider] Failed to parse balance for ${symbol}:`, e);
          }

          const price = parseFloat(token.tokenPrices[0]?.value || '0');

          return {
            id: `evm-${chainId}-${assetAddress}`,
            symbol,
            name,
            image: logo,
            balance,
            current_price: price,
            price_change_percentage_24h: 0,
            chainId,
            chainName: getChainName(chainId),
            chainType: 'evm' as const,
            address: assetAddress,
            decimals,
            isNative,
          };
        }) as (Asset | null)[]
      ).filter((asset: Asset | null): asset is Asset => {
        if (!asset || asset.balance === 0 || !asset.address || !asset.chainId) return false;

        const address = asset.address as string;
        const chainId = asset.chainId as number;
        const isNative = address.toLowerCase() === NATIVE_ADDRESS.toLowerCase();
        const isInRegistry = !!getAssetByAddress(chainId, address);

        return isNative || isInRegistry;
      });

      if (parsedAssets.length > 0) {
        return parsedAssets;
      }

      // If on testnet and backend returned 0 tokens, use testnet fallback
      if (network === 'testnet') {
        console.info(
          '[EVMPortfolioProvider] Backend returned 0 testnet tokens, falling back to testnet RPC'
        );
        return this.fetchTestnet(walletAddress);
      }

      return [];
    } catch (error) {
      console.error('[EVMPortfolioProvider] Failed to fetch EVM portfolio from backend:', error);
      if (network === 'testnet') {
        console.info(
          '[EVMPortfolioProvider] Backend error on testnet, falling back to testnet RPC'
        );
        return this.fetchTestnet(walletAddress);
      }
      throw error;
    }
  }

  private async fetchTestnet(evmAddress: string): Promise<Asset[]> {
    const testnetChains = getEvmChainsForNetwork('testnet').filter(
      c => typeof c.chainId === 'number'
    );

    const chainPromises = testnetChains.map(async chainConfig => {
      const chainId = Number(chainConfig.chainId);
      const rpcUrls = chainConfig.rpcUrls || [];
      if (!rpcUrls.length) return [];

      const chainAssets: Asset[] = [];

      try {
        // 1. Fetch native currency balance
        const nativeBalWei = await rpcManager.fetchWithFallback(chainId, rpcUrls, provider =>
          provider.getBalance(evmAddress)
        );
        const nativeBal = parseFloat(formatEther(nativeBalWei));

        const nativeSymbol = chainConfig.nativeCurrency?.symbol || 'ETH';
        const nativeName = chainConfig.nativeCurrency?.name || nativeSymbol;
        const nativeLogo = chainConfig.nativeCurrency?.logoURI || chainConfig.logoURI || '';

        chainAssets.push({
          id: `evm-${chainId}-${NATIVE_ADDRESS}`,
          symbol: nativeSymbol,
          name: nativeName,
          image: nativeLogo,
          balance: nativeBal,
          current_price: 0,
          price_change_percentage_24h: 0,
          chainId,
          chainName: chainConfig.name,
          chainType: 'evm' as const,
          address: NATIVE_ADDRESS,
          decimals: 18,
          isNative: true,
        });

        // 2. Fetch known ERC20 testnet tokens
        const tokens = getTestnetTokensForChain(chainId).filter(t => !t.isNative);
        if (tokens.length > 0) {
          const tokenPromises = tokens.map(async token => {
            try {
              const balStr = await rpcManager.fetchWithFallback(
                chainId,
                rpcUrls,
                async provider => {
                  const contract = new Contract(token.address, ERC20_ABI, provider);
                  const rawBal = await contract.balanceOf(evmAddress);
                  return formatUnits(rawBal, token.decimals);
                }
              );
              const parsedBal = parseFloat(balStr);
              return {
                id: `evm-${chainId}-${token.address}`,
                symbol: token.symbol,
                name: token.name,
                image: token.logoURI,
                balance: parsedBal,
                current_price: 0,
                price_change_percentage_24h: 0,
                chainId,
                chainName: chainConfig.name,
                chainType: 'evm' as const,
                address: token.address,
                decimals: token.decimals,
                isNative: false,
              };
            } catch {
              return null;
            }
          });

          const tokenResults = await Promise.all(tokenPromises);
          tokenResults.forEach(t => {
            if (t) chainAssets.push(t);
          });
        }
      } catch (err) {
        console.warn(
          `[EVMPortfolioProvider] Testnet balance fetch failed for chain ${chainId}:`,
          err
        );
      }

      return chainAssets;
    });

    const results = await Promise.all(chainPromises);
    return results.flat();
  }
}
