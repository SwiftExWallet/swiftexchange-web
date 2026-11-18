import { useState } from 'react';
import { useEffect } from 'react';

import { isSoroswapTestnetSupported } from '../../../../stellar/service/soroswapService';
import { getGlobalAssetMetadata } from '../../../utils/Chainregistry';
import { isStellar, matchesAddress } from '../utils/swapAssetUtils';

export interface UseStellarAssetsParams {
  fromChainId: number | string;
  toChainId: number | string;
  ammService: any;
  stellarAddress: string;
  sellAssetSymbol: string;
  sellAssetAddress?: string;
  buyAssetSymbol: string;
  buyAssetAddress?: string;
  actionType: 'SWAP' | 'BRIDGE';
  isStellarAccountActive?: boolean | null;
  bridgeTxStatus: string;
  trustlineRefreshNonce: number;
  setSellAssetSymbol: (s: string) => void;
  setSellAssetAddress: (s: string) => void;
  setBuyAssetSymbol: (s: string) => void;
  setBuyAssetAddress: (s: string) => void;
}

export interface UseStellarAssetsResult {
  stellarAssets: any[];
  isFetchingStellarAssets: boolean;
}

export function useStellarAssets(params: UseStellarAssetsParams): UseStellarAssetsResult {
  const {
    fromChainId,
    toChainId,
    ammService,
    stellarAddress,
    sellAssetSymbol,
    sellAssetAddress,
    buyAssetSymbol,
    buyAssetAddress,
    actionType,
    isStellarAccountActive,
    bridgeTxStatus,
    trustlineRefreshNonce,
    setSellAssetSymbol,
    setSellAssetAddress,
    setBuyAssetSymbol,
    setBuyAssetAddress,
  } = params;

  const [stellarAssets, setStellarAssets] = useState<any[]>([]);
  const [isFetchingStellarAssets, setIsFetchingStellarAssets] = useState(false);

  useEffect(() => {
    if (
      (isStellar(fromChainId) || isStellar(toChainId)) &&
      ammService &&
      bridgeTxStatus === 'idle'
    ) {
      const fetchStellar = async () => {
        setIsFetchingStellarAssets(true);
        try {
          const { tokens: balances, subentryCount } = await ammService.getAssetsWithBalances(
            stellarAddress || ''
          );
          // Maintain a minimum XLM reserve: 1 base + 0.5 per subentry + 0.05 buffer
          const reserve = 1 + subentryCount * 0.5 + 0.05;
          const mapped = balances.map((b: any) => {
            let balanceToUse = b.balance;
            if (b.code === 'XLM') {
              balanceToUse = Math.max(0, parseFloat(b.balance || '0') - reserve).toString();
            }
            const isNative =
              typeof b.asset?.isNative === 'function' ? b.asset.isNative() : b.code === 'XLM';
            const address = isNative
              ? 'native'
              : typeof b.asset?.getIssuer === 'function'
                ? b.asset.getIssuer()
                : b.issuer || b.contract;
            const contract = b.contract || (address?.startsWith('C') ? address : undefined);

            return {
              id: `stellar-${fromChainId}-${b.code}-${isNative ? 'native' : contract || address || ''}`,
              symbol: b.code,
              name: b.name || b.code,
              logoURI: b.icon || getGlobalAssetMetadata(b.code)?.logoURI,
              balance: balanceToUse,
              decimals: b.decimals || 7,
              isNative,
              asset: b.asset,
              chainId: fromChainId,
              address,
              contract,
              contractAddress: contract,
              issuer: b.issuer || (!isNative && address?.startsWith('G') ? address : undefined),
              domain: b.domain || b.homeDomain,
              hasTrustline: b.hasTrustline,
            };
          });
          let finalMapped = mapped;
          const isTestnetSwap =
            actionType === 'SWAP' && (fromChainId === 'testnet' || toChainId === 'testnet');

          if (isTestnetSwap) {
            const seen = new Set<string>();
            finalMapped = mapped.filter((t: any) => {
              if (!isSoroswapTestnetSupported(t)) return false;
              const sym = t.isNative || t.symbol === 'XLM' ? 'XLM' : t.symbol?.toUpperCase();
              if (!sym || seen.has(sym)) return false;
              seen.add(sym);
              return true;
            });
          }

          setStellarAssets(finalMapped);

          // Default asset selection for Stellar-to-Stellar swaps
          if (actionType === 'SWAP' && isStellar(fromChainId)) {
            const currentSellInStellar = sellAssetAddress
              ? finalMapped.find((t: any) => matchesAddress(t, sellAssetAddress))
              : finalMapped.find((t: any) => t.symbol === sellAssetSymbol);
            const currentBuyInStellar = buyAssetAddress
              ? finalMapped.find((t: any) => matchesAddress(t, buyAssetAddress))
              : finalMapped.find((t: any) => t.symbol === buyAssetSymbol);

            let finalSellSymbol = sellAssetSymbol;

            if (!currentSellInStellar && finalMapped.length > 0) {
              const defaultSell = isTestnetSwap
                ? finalMapped.find((t: any) => t.symbol === 'XTAR') || finalMapped[0]
                : finalMapped.find((t: any) => t.symbol === 'XLM') || finalMapped[0];
              const effAddr = defaultSell.isNative
                ? 'native'
                : defaultSell.contract || defaultSell.address || defaultSell.issuer || '';
              setSellAssetSymbol(defaultSell.symbol);
              setSellAssetAddress(effAddr);
              finalSellSymbol = defaultSell.symbol;
            }

            if (
              (!currentBuyInStellar || finalSellSymbol === buyAssetSymbol) &&
              finalMapped.length > 1
            ) {
              const defaultBuy = isTestnetSwap
                ? finalMapped.find(
                    (t: any) => t.symbol === 'USDC' && t.symbol !== finalSellSymbol
                  ) ||
                  finalMapped.find((t: any) => t.symbol !== finalSellSymbol) ||
                  finalMapped[1]
                : finalMapped.find((t: any) => t.symbol !== finalSellSymbol) || finalMapped[1];
              if (defaultBuy) {
                const effAddr = defaultBuy.isNative
                  ? 'native'
                  : defaultBuy.contract || defaultBuy.address || defaultBuy.issuer || '';
                setBuyAssetSymbol(defaultBuy.symbol);
                setBuyAssetAddress(effAddr);
              }
            }
          }
        } catch (err) {
          console.error('Failed to fetch Stellar balances:', err);
        } finally {
          setIsFetchingStellarAssets(false);
        }
      };

      fetchStellar();
    }
  }, [
    fromChainId,
    toChainId,
    stellarAddress,
    ammService,
    sellAssetSymbol,
    sellAssetAddress,
    buyAssetSymbol,
    buyAssetAddress,
    actionType,
    isStellarAccountActive,
    bridgeTxStatus,
    trustlineRefreshNonce,
    setSellAssetSymbol,
    setSellAssetAddress,
    setBuyAssetSymbol,
    setBuyAssetAddress,
  ]);

  return { stellarAssets, isFetchingStellarAssets };
}
