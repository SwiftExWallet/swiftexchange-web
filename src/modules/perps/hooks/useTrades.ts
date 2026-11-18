import { useMarketStore } from '../core/stores/marketStore';
import { useTradeStore } from '../core/stores/tradeStore';

/**
 * Returns the live trade tape for the currently selected symbol.
 * The ?? [] fallback is intentionally outside the Zustand selector — putting it
 * inside would create a new array reference on every call, causing infinite re-renders.
 */
export const useTrades = () => {
  const symbol = useMarketStore(state => state.selectedSymbol);
  const trades = useTradeStore(state => {
    const map = state.tradesBySymbol;
    if (map[symbol]?.length) return map[symbol];
    const withHyphen = symbol.includes('-') ? symbol : symbol.replace(/(USDT|USDC)$/, '-$1');
    if (map[withHyphen]?.length) return map[withHyphen];
    const noHyphen = symbol.replace('-', '');
    if (map[noHyphen]?.length) return map[noHyphen];
    return map[symbol];
  });
  return trades ?? [];
};
