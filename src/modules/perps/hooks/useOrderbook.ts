import { useMarketStore } from '../core/stores/marketStore';
import { useOrderbookStore } from '../core/stores/orderbookStore';

export interface OrderbookSnapshot {
  bids: { price: string; size: string }[];
  asks: { price: string; size: string }[];
  isReady: boolean;
  isSyncing: boolean;
}

const EMPTY: OrderbookSnapshot = { bids: [], asks: [], isReady: false, isSyncing: false };

export const useOrderbook = (): OrderbookSnapshot => {
  const symbol = useMarketStore(state => state.selectedSymbol);
  const book = useOrderbookStore(state => {
    const books = state.books;
    if (books[symbol]) return books[symbol];

    const withHyphen = symbol.includes('-')
      ? symbol
      : symbol.endsWith('USDT')
        ? symbol.replace(/USDT$/, '-USDT')
        : symbol.endsWith('USDC')
          ? symbol.replace(/USDC$/, '-USDC')
          : symbol;
    if (books[withHyphen]) return books[withHyphen];

    const noHyphen = symbol.replace('-', '');
    if (books[noHyphen]) return books[noHyphen];

    return undefined;
  });

  return book
    ? {
        bids: book.bids,
        asks: book.asks,
        isReady: book.isReady,
        isSyncing: book.isSyncing ?? false,
      }
    : EMPTY;
};
