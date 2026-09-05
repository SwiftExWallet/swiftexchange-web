import { useAccountStore } from './accountStore';
import { useHistoryStore } from './historyStore';
import { useOrderStore } from './orderStore';
import { useOrderbookStore } from './orderbookStore';
import { usePositionStore } from './positionStore';
import { useTickerStore } from './tickerStore';
import { useTradeStore } from './tradeStore';

/**
 * Resets all normalized perps stores to prevent cross-contamination
 * when switching exchange providers (Aster <-> Hyperliquid) or networks (Mainnet <-> Testnet).
 */
export function resetPerpStores(): void {
  useOrderbookStore.getState().clear();
  useTradeStore.getState().clear();
  useTickerStore.getState().clear();
  usePositionStore.getState().clear();
  useOrderStore.getState().clear();
  useHistoryStore.getState().clear();
  useAccountStore.getState().clear();
}
