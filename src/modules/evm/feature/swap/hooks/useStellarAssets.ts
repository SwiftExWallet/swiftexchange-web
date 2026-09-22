import { useState } from 'react';
import { useEffect } from 'react';

import { getGlobalAssetMetadata } from '../../../utils/Chainregistry';
import { isStellar } from '../utils/swapAssetUtils';

export interface UseStellarAssetsParams {
  fromChainId: number | string;
  toChainId: number | string;
  ammService: any;
  stellarAddress: string;
  sellAssetSymbol: string;
  buyAssetSymbol: string;
  actionType: 'SWAP' | 'BRIDGE';
  isStellarAccountActive?: boolean | null;
  bridgeTxStatus: string;
  /** Nonce bumped from outside to force a re-fetch (e.g. after a trustline is added). */
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

/**
 * Fetches Stellar account balances and maps them to the unified asset shape.
 * Also handles default sell/buy asset selection for Stellar-to-Stellar swaps.
 *
 * Previously embedded as a `useEffect` block inside `SwapAssets.tsx`.
 */
export function useStellarAssets(params: UseStellarAssetsParams): UseStellarAssetsResult {
  const {
    fromChainId,
    toChainId,
    ammService,
    stellarAddress,
    sellAssetSymbol,
    buyAssetSymbol,
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
            return {
              id: `stellar-${fromChainId}-${b.code}`,
              symbol: b.code,
              name: b.name || b.code,
              logoURI: b.icon || getGlobalAssetMetadata(b.code)?.logoURI,
              balance: balanceToUse,
              decimals: b.decimals || 7,
              isNative: b.asset.isNative(),
              asset: b.asset,
              chainId: fromChainId,
              address: b.asset.isNative() ? 'native' : b.asset.getIssuer(),
              hasTrustline: b.hasTrustline,
            };
          });
          setStellarAssets(mapped);

          // Default asset selection for Stellar-to-Stellar swaps
          if (actionType === 'SWAP' && isStellar(fromChainId)) {
            const currentSellInStellar = mapped.find((t: any) => t.symbol === sellAssetSymbol);
            const currentBuyInStellar = mapped.find((t: any) => t.symbol === buyAssetSymbol);

            let finalSellSymbol = sellAssetSymbol;

            if (!currentSellInStellar && mapped.length > 0) {
              const defaultSell = mapped.find((t: any) => t.symbol === 'XLM') || mapped[0];
              setSellAssetSymbol(defaultSell.symbol);
              setSellAssetAddress(defaultSell.address || '');
              finalSellSymbol = defaultSell.symbol;
            }

            if ((!currentBuyInStellar || finalSellSymbol === buyAssetSymbol) && mapped.length > 1) {
              const defaultBuy = mapped.find((t: any) => t.symbol !== finalSellSymbol) || mapped[1];
              if (defaultBuy) {
                setBuyAssetSymbol(defaultBuy.symbol);
                setBuyAssetAddress(defaultBuy.address || '');
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
    actionType,
    isStellarAccountActive,
    bridgeTxStatus,
    trustlineRefreshNonce,
    // Setters are stable Zustand references — safe to omit from deps, but listed for clarity
    setSellAssetSymbol,
    setSellAssetAddress,
    setBuyAssetSymbol,
    setBuyAssetAddress,
  ]);

  return { stellarAssets, isFetchingStellarAssets };
}
