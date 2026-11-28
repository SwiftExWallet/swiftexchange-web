import { useCallback, useEffect, useState } from 'react';

import { evmBalances, stellarBalances } from '../api/balances';
import { getCachedPrice, loadPrices } from '../api/prices';
import { llamaKey } from '../data/assets';
import type { RwaAsset } from '../types/rwa.types';
import { fromUnits } from '../utils/amounts';
import { isDust } from '../utils/swapForm';

export interface RwaHoldingItem {
  asset: RwaAsset;
  amount: string;
  usdValue: number | null;
}

export const useRwaHoldings = ({
  evmAddress,
  stellarAddress,
  assets,
  enabled = true,
}: {
  evmAddress?: string | null;
  stellarAddress?: string | null;
  assets: RwaAsset[];
  enabled?: boolean;
}) => {
  const [holdings, setHoldings] = useState<RwaHoldingItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled || (!evmAddress && !stellarAddress) || !assets.length) {
      setHoldings([]);
      return;
    }
    setLoading(true);
    try {
      const ethAssets = assets.filter(a => a.chain === 'ETH');
      const bscAssets = assets.filter(a => a.chain === 'BSC');
      const xlmAssets = assets.filter(a => a.chain === 'XLM');

      const [ethBals, bscBals, xlmBals] = await Promise.all([
        evmAddress
          ? evmBalances('ETH', evmAddress, ethAssets).catch(() => ({}))
          : Promise.resolve({}),
        evmAddress
          ? evmBalances('BSC', evmAddress, bscAssets).catch(() => ({}))
          : Promise.resolve({}),
        stellarAddress
          ? stellarBalances(stellarAddress, xlmAssets).catch(() => ({}))
          : Promise.resolve({}),
      ]);

      const rawMap: Record<string, string> = { ...ethBals, ...bscBals, ...xlmBals };
      const heldAssets = assets.filter(a => Boolean(rawMap[a.id]));
      if (heldAssets.length) {
        await loadPrices(heldAssets.map(llamaKey));
      }

      const items: RwaHoldingItem[] = [];
      heldAssets.forEach(asset => {
        const raw = rawMap[asset.id];
        const human = asset.chain === 'XLM' ? raw : fromUnits(raw, asset.decimals);
        if (!human) return;
        const price = getCachedPrice(llamaKey(asset))?.price ?? null;
        if (isDust(human, price)) return;
        const usdValue = price !== null ? Number(human) * price : null;
        items.push({ asset, amount: human, usdValue });
      });

      items.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
      setHoldings(items);
    } finally {
      setLoading(false);
    }
  }, [enabled, evmAddress, stellarAddress, assets]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { holdings, loading, refresh };
};
