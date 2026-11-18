import { beforeEach, describe, expect, it } from 'vitest';

import { useDepositTrackerStore } from '../depositTrackerStore';
import { useHistoryStore } from '../historyStore';
import { leverageStore, useLeverageStore } from '../leverageStore';
import { marketStore, useMarketStore } from '../marketStore';
import { useOrderEntryStore } from '../orderEntryStore';
import { useOrderStore } from '../orderStore';
import { orderBookStore, useOrderbookStore } from '../orderbookStore';
import { usePositionStore } from '../positionStore';
import { tradeStore, useTradeStore } from '../tradeStore';

describe('Perps Core Stores', () => {
  beforeEach(() => {
    useMarketStore.setState({ markets: {}, selectedSymbol: 'BTC-USDT' });
    useLeverageStore.setState({ bracketsBySymbol: {} });
    usePositionStore.setState({ positions: {} });
    useOrderStore.setState({ orders: {} });
    useOrderEntryStore.getState().reset();
    useDepositTrackerStore.setState({
      activeTransaction: null,
      pendingDeposits: [],
      pendingWithdrawals: [],
    });
    orderBookStore.clear();
    tradeStore.clear();
    useHistoryStore.getState().clear();
  });

  describe('marketStore', () => {
    const mockMarkets = [
      {
        symbol: 'BTC-USDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        tickSize: 0.1,
        stepSize: 0.001,
        minOrderSize: 0.001,
        maxLeverage: 50,
      },
      {
        symbol: 'ETH-USDT',
        baseAsset: 'ETH',
        quoteAsset: 'USDT',
        tickSize: 0.01,
        stepSize: 0.01,
        minOrderSize: 0.01,
        maxLeverage: 25,
      },
    ];

    it('sets markets and indexes them by symbol', () => {
      marketStore.setMarkets(mockMarkets);

      expect(marketStore.isHydrated()).toBe(true);
      expect(marketStore.getAllMarkets()).toHaveLength(2);
      expect(marketStore.getMarket('BTC-USDT')?.baseAsset).toBe('BTC');
      expect(marketStore.getMarket('ETH-USDT')?.baseAsset).toBe('ETH');
    });

    it('updates selected symbol and guards against duplicate updates', () => {
      marketStore.setSelectedSymbol('SOL-USDT');
      expect(marketStore.getSelectedSymbol()).toBe('SOL-USDT');

      // Duplicate call should be a no-op
      marketStore.setSelectedSymbol('SOL-USDT');
      expect(marketStore.getSelectedSymbol()).toBe('SOL-USDT');
    });
  });

  describe('leverageStore', () => {
    it('sets and retrieves leverage brackets by symbol', () => {
      const mockBrackets = [
        {
          bracket: 1,
          initialLeverage: 50,
          notionalCap: 50000,
          notionalFloor: 0,
          maintMarginRatio: 0.01,
          cum: 0,
        },
        {
          bracket: 2,
          initialLeverage: 20,
          notionalCap: 250000,
          notionalFloor: 50000,
          maintMarginRatio: 0.025,
          cum: 750,
        },
      ];

      useLeverageStore.getState().setBrackets('BTC-USDT', mockBrackets);

      expect(leverageStore.getBrackets('BTC-USDT')).toEqual(mockBrackets);
      expect(leverageStore.getMaxLeverage('BTC-USDT')).toBe(50);
    });

    it('returns default fallback of 20 when no brackets exist', () => {
      expect(leverageStore.getBrackets('UNKNOWN')).toEqual([]);
      expect(leverageStore.getMaxLeverage('UNKNOWN')).toBe(20);
    });
  });

  describe('positionStore', () => {
    const mockPosition = {
      symbol: 'BTC-USDT',
      size: '1.5',
      entryPrice: '65000',
      markPrice: '66000',
      liquidationPrice: '52000',
      unrealizedPnl: '1500',
      leverage: 10,
      marginType: 'cross' as const,
      isolatedMargin: '0',
    };

    it('sets, updates, and removes positions', () => {
      const store = usePositionStore.getState();

      store.setPositions([mockPosition]);
      expect(usePositionStore.getState().getPosition('BTC-USDT')).toEqual(mockPosition);

      // Update position
      const updated = { ...mockPosition, size: '2.0', unrealizedPnl: '2000' };
      usePositionStore.getState().updatePosition(updated);
      expect(usePositionStore.getState().getPosition('BTC-USDT')?.size).toBe('2.0');

      // Remove position
      usePositionStore.getState().removePosition('BTC-USDT');
      expect(usePositionStore.getState().getPosition('BTC-USDT')).toBeUndefined();
    });
  });

  describe('orderStore', () => {
    const mockOrder1 = {
      id: 'ord-1',
      symbol: 'BTC-USDT',
      type: 'limit' as const,
      side: 'buy' as const,
      price: '64000',
      size: '1.0',
      filledSize: '0',
      status: 'new' as const,
      reduceOnly: false,
      timestamp: 1710000000000,
    };

    const mockOrder2 = {
      id: 'ord-2',
      symbol: 'BTC-USDT',
      type: 'limit' as const,
      side: 'buy' as const,
      price: '63000',
      size: '1.0',
      filledSize: '1.0',
      status: 'filled' as const,
      reduceOnly: false,
      timestamp: 1710000010000,
    };

    it('filters open orders correctly based on status', () => {
      useOrderStore.getState().setOrders([mockOrder1, mockOrder2]);

      const openOrders = useOrderStore.getState().getOpenOrders();
      expect(openOrders).toHaveLength(1);
      expect(openOrders[0].id).toBe('ord-1');

      // Update order to partially_filled
      useOrderStore.getState().updateOrder({ ...mockOrder1, status: 'partially_filled' as any });
      expect(useOrderStore.getState().getOpenOrders()).toHaveLength(1);

      // Remove order
      useOrderStore.getState().removeOrder('ord-1');
      expect(useOrderStore.getState().getOpenOrders()).toHaveLength(0);
    });
  });

  describe('orderEntryStore', () => {
    it('manages order entry form state and resets cleanly', () => {
      const store = useOrderEntryStore.getState();

      store.setSide('SELL');
      store.setOrderType('MARKET');
      store.setSize('0.5');
      store.setPrice('67000');
      store.setLeverage(25);
      store.setMarginType('isolated');
      store.setReduceOnly(true);

      const state = useOrderEntryStore.getState();
      expect(state.side).toBe('SELL');
      expect(state.orderType).toBe('MARKET');
      expect(state.size).toBe('0.5');
      expect(state.price).toBe('67000');
      expect(state.leverage).toBe(25);
      expect(state.marginType).toBe('isolated');
      expect(state.isReduceOnly).toBe(true);

      // Reset
      useOrderEntryStore.getState().reset();
      const resetState = useOrderEntryStore.getState();
      expect(resetState.side).toBe('BUY');
      expect(resetState.orderType).toBe('MARKET');
      expect(resetState.size).toBe('');
      expect(resetState.price).toBe('');
      expect(resetState.isReduceOnly).toBe(false);
    });
  });

  describe('depositTrackerStore & Active Transactions', () => {
    it('manages active transaction lifecycle across steps', () => {
      const store = useDepositTrackerStore.getState();

      // 1. Initial state is empty
      expect(store.activeTransaction).toBeNull();
      expect(store.hasActiveTransactions()).toBe(false);

      // 2. Start deposit transaction
      store.setActiveTransaction({
        id: 'dep-101',
        type: 'DEPOSIT',
        step: 'AWAITING_SIGNATURE',
        asset: 'USDT',
        amount: '100',
        chainId: 97,
        chainName: 'BSC Testnet',
        message: 'Awaiting wallet signature...',
        timestamp: Date.now(),
      });

      expect(useDepositTrackerStore.getState().activeTransaction?.step).toBe('AWAITING_SIGNATURE');
      expect(useDepositTrackerStore.getState().hasActiveTransactions()).toBe(true);

      // 3. Update to CONFIRMING on blockchain
      store.updateActiveTransaction({
        step: 'CONFIRMING',
        txHash: '0x123abc',
        message: 'Confirming on-chain...',
      });

      const confirmingState = useDepositTrackerStore.getState().activeTransaction;
      expect(confirmingState?.step).toBe('CONFIRMING');
      expect(confirmingState?.txHash).toBe('0x123abc');

      // 4. Update to SUCCESS
      store.updateActiveTransaction({
        step: 'SUCCESS',
        message: 'Deposit confirmed!',
      });
      expect(useDepositTrackerStore.getState().activeTransaction?.step).toBe('SUCCESS');

      // 5. Clear on "Done" / modal dismissal
      store.clearActiveTransaction();
      expect(useDepositTrackerStore.getState().activeTransaction).toBeNull();
    });

    it('tracks withdrawals and pending withdrawal state correctly', () => {
      const store = useDepositTrackerStore.getState();

      store.addWithdrawal({
        asset: 'USDT',
        amount: '50',
        chainId: 97,
        chainName: 'BSC Testnet',
        destination: '0x1111111111111111111111111111111111111111',
        status: 'PROCESSING',
      });

      expect(useDepositTrackerStore.getState().hasActiveWithdrawals()).toBe(true);
      expect(useDepositTrackerStore.getState().pendingWithdrawals).toHaveLength(1);

      const withdrawId = useDepositTrackerStore.getState().pendingWithdrawals[0].id;

      // Update to confirmed
      store.updateWithdrawalStatus(withdrawId, 'CONFIRMED');
      expect(useDepositTrackerStore.getState().hasActiveWithdrawals()).toBe(false);
      expect(useDepositTrackerStore.getState().pendingWithdrawals[0].status).toBe('CONFIRMED');

      // Clear completed
      store.clearCompleted();
      expect(useDepositTrackerStore.getState().pendingWithdrawals).toHaveLength(0);
    });

    it('handles partial updates and graceful null updates for activeTransaction', () => {
      const store = useDepositTrackerStore.getState();

      // Graceful no-op when activeTransaction is null
      expect(() => {
        store.updateActiveTransaction({ step: 'CONFIRMING' });
      }).not.toThrow();
      expect(store.activeTransaction).toBeNull();

      // Set initial
      store.setActiveTransaction({
        id: 'tx-202',
        type: 'WITHDRAW',
        step: 'AWAITING_SIGNATURE',
        asset: 'USDC',
        amount: '200',
        chainId: 42161,
        chainName: 'Arbitrum',
        timestamp: Date.now(),
      });

      // Partial update only message
      store.updateActiveTransaction({ message: 'Authorizing signature...' });
      const current = useDepositTrackerStore.getState().activeTransaction;
      expect(current?.message).toBe('Authorizing signature...');
      expect(current?.step).toBe('AWAITING_SIGNATURE');
      expect(current?.amount).toBe('200');
    });

    it('correctly evaluates hasActiveTransactions across states', () => {
      const store = useDepositTrackerStore.getState();

      // Empty state
      expect(store.hasActiveTransactions()).toBe(false);

      // AWAITING_SIGNATURE -> true
      store.setActiveTransaction({
        id: 'tx-301',
        type: 'DEPOSIT',
        step: 'AWAITING_SIGNATURE',
        asset: 'USDT',
        amount: '100',
        chainId: 56,
        chainName: 'BSC',
        timestamp: Date.now(),
      });
      expect(store.hasActiveTransactions()).toBe(true);

      // CONFIRMING -> true
      store.updateActiveTransaction({ step: 'CONFIRMING' });
      expect(store.hasActiveTransactions()).toBe(true);

      // SUCCESS -> false (poller stops, allows user to start new transaction)
      store.updateActiveTransaction({ step: 'SUCCESS' });
      expect(store.hasActiveTransactions()).toBe(false);

      // FAILED -> false
      store.updateActiveTransaction({ step: 'FAILED' });
      expect(store.hasActiveTransactions()).toBe(false);
    });

    it('allows removing specific withdrawals by ID', () => {
      const store = useDepositTrackerStore.getState();

      store.addWithdrawal({
        asset: 'USDT',
        amount: '10',
        chainId: 97,
        chainName: 'BSC Testnet',
        destination: '0x123',
        status: 'PROCESSING',
      });
      store.addWithdrawal({
        asset: 'BTC',
        amount: '0.1',
        chainId: 97,
        chainName: 'BSC Testnet',
        destination: '0x456',
        status: 'PROCESSING',
      });

      expect(useDepositTrackerStore.getState().pendingWithdrawals).toHaveLength(2);
      const firstId = useDepositTrackerStore.getState().pendingWithdrawals[0].id;

      store.removeWithdrawal(firstId);
      expect(useDepositTrackerStore.getState().pendingWithdrawals).toHaveLength(1);
      expect(useDepositTrackerStore.getState().pendingWithdrawals[0].asset).toBe('USDT');
    });
  });

  describe('orderBookStore REST + WSS Synchronization', () => {
    it('initializes buffer on startSync and buffers incoming diffs without mutating live book', () => {
      orderBookStore.startSync('BTC-USDT');
      const state = useOrderbookStore.getState();

      expect(state.books['BTC-USDT']?.isSyncing).toBe(true);
      expect(state.books['BTC-USDT']?.isReady).toBe(false);

      orderBookStore.applyDiff(
        'BTC-USDT',
        [{ price: '60000', size: '1.0' }],
        [{ price: '60100', size: '1.0' }],
        105,
        101,
        100
      );

      const afterDiff = useOrderbookStore.getState();
      expect(afterDiff.syncBuffers['BTC-USDT']).toHaveLength(1);
      expect(afterDiff.syncBuffers['BTC-USDT'][0].u).toBe(105);
      expect(afterDiff.books['BTC-USDT'].bids).toHaveLength(0);
    });

    it('applies snapshot and reconciles buffered events by discarding <= lastUpdateId and applying newer', () => {
      orderBookStore.startSync('BTC-USDT');

      orderBookStore.applyDiff(
        'BTC-USDT',
        [{ price: '59900', size: '2.0' }],
        [{ price: '60200', size: '2.0' }],
        98,
        95,
        94
      );

      orderBookStore.applyDiff(
        'BTC-USDT',
        [{ price: '59950', size: '3.0' }],
        [{ price: '60050', size: '3.0' }],
        100,
        99,
        98
      );

      orderBookStore.applyDiff(
        'BTC-USDT',
        [{ price: '60000', size: '5.0' }],
        [{ price: '60100', size: '5.0' }],
        105,
        101,
        100
      );

      orderBookStore.applySnapshot(
        'BTC-USDT',
        [{ price: '59900', size: '1.0' }],
        [{ price: '60200', size: '1.0' }],
        100
      );

      orderBookStore.reconcileAndFlush('BTC-USDT', 100);

      const reconciled = useOrderbookStore.getState();
      expect(reconciled.books['BTC-USDT'].isSyncing).toBe(false);
      expect(reconciled.books['BTC-USDT'].isReady).toBe(true);
      expect(reconciled.books['BTC-USDT'].lastUpdateId).toBe(105);
      expect(reconciled.syncBuffers['BTC-USDT']).toBeUndefined();

      const bidPrices = reconciled.books['BTC-USDT'].bids.map(b => b.price);
      expect(bidPrices).toContain('60000');
    });
  });

  describe('tradeStore REST + WSS Synchronization', () => {
    it('buffers incoming trades during sync without mutating live trade list', () => {
      tradeStore.startSync('BTC-USDT');
      expect(useTradeStore.getState().isSyncingBySymbol['BTC-USDT']).toBe(true);

      const incomingTrade = {
        id: 't-1',
        symbol: 'BTC-USDT',
        price: '60000',
        size: '0.1',
        side: 'buy' as const,
        timestamp: 1000,
      };

      tradeStore.addTrades('BTC-USDT', [incomingTrade]);

      const state = useTradeStore.getState();
      expect(state.tradesBySymbol['BTC-USDT']).toBeUndefined();
      expect(state.syncBuffers['BTC-USDT']).toHaveLength(1);
      expect(state.syncBuffers['BTC-USDT'][0].id).toBe('t-1');
    });

    it('applies snapshot and reconciles buffered trades by discarding <= latestTimestamp and applying newer', () => {
      tradeStore.startSync('BTC-USDT');

      tradeStore.addTrades('BTC-USDT', [
        {
          id: 't-old',
          symbol: 'BTC-USDT',
          price: '59900',
          size: '0.1',
          side: 'buy',
          timestamp: 900,
        },
        {
          id: 't-new',
          symbol: 'BTC-USDT',
          price: '60100',
          size: '0.2',
          side: 'sell',
          timestamp: 1100,
        },
      ]);

      const snapshotTrades = [
        {
          id: 't-snap',
          symbol: 'BTC-USDT',
          price: '60000',
          size: '0.5',
          side: 'buy' as const,
          timestamp: 1000,
        },
      ];

      tradeStore.applySnapshot('BTC-USDT', snapshotTrades);
      tradeStore.reconcileAndFlush('BTC-USDT', 1000);

      const state = useTradeStore.getState();
      expect(state.isSyncingBySymbol['BTC-USDT']).toBe(false);
      expect(state.syncBuffers['BTC-USDT']).toBeUndefined();

      const ids = state.tradesBySymbol['BTC-USDT'].map(t => t.id);
      expect(ids).toContain('t-new');
      expect(ids).toContain('t-snap');
      expect(ids).not.toContain('t-old');
      expect(ids[0]).toBe('t-new');
    });
  });

  describe('historyStore Cache-and-Append Strategy', () => {
    it('initializes flags to false and sets data on initial fetch', () => {
      const state = useHistoryStore.getState();
      expect(state.hasFetchedOrderHistory).toBe(false);
      expect(state.hasFetchedTransactionHistory).toBe(false);
      expect(state.hasFetchedTradeHistory).toBe(false);

      useHistoryStore.getState().setOrderHistory([
        {
          orderId: 101,
          symbol: 'BTCUSDT',
          status: 'FILLED',
          clientOrderId: 'c1',
          price: '65000',
          avgPrice: '65000',
          origQty: '0.1',
          executedQty: '0.1',
          cumQty: '0.1',
          cumQuote: '6500',
          timeInForce: 'GTC',
          type: 'LIMIT',
          reduceOnly: false,
          closePosition: false,
          side: 'BUY',
          positionSide: 'BOTH',
          stopPrice: '0',
          workingType: 'CONTRACT_PRICE',
          priceProtect: false,
          origType: 'LIMIT',
          time: 1000,
          updateTime: 1000,
        },
      ]);

      const afterFetch = useHistoryStore.getState();
      expect(afterFetch.hasFetchedOrderHistory).toBe(true);
      expect(afterFetch.orderHistory).toHaveLength(1);
      expect(afterFetch.orderHistory[0].orderId).toBe(101);
    });

    it('immutably prepends incoming WebSocket events without mutating existing arrays', () => {
      useHistoryStore.getState().setOrderHistory([
        {
          orderId: 100,
          symbol: 'BTCUSDT',
          status: 'NEW',
          clientOrderId: 'c0',
          price: '64000',
          avgPrice: '0',
          origQty: '0.1',
          executedQty: '0',
          cumQty: '0',
          cumQuote: '0',
          timeInForce: 'GTC',
          type: 'LIMIT',
          reduceOnly: false,
          closePosition: false,
          side: 'BUY',
          positionSide: 'BOTH',
          stopPrice: '0',
          workingType: 'CONTRACT_PRICE',
          priceProtect: false,
          origType: 'LIMIT',
          time: 500,
          updateTime: 500,
        },
      ]);

      const prevOrders = useHistoryStore.getState().orderHistory;

      useHistoryStore.getState().prependOrder({
        orderId: 102,
        symbol: 'BTCUSDT',
        status: 'FILLED',
        clientOrderId: 'c2',
        price: '66000',
        avgPrice: '66000',
        origQty: '0.2',
        executedQty: '0.2',
        cumQty: '0.2',
        cumQuote: '13200',
        timeInForce: 'GTC',
        type: 'LIMIT',
        reduceOnly: false,
        closePosition: false,
        side: 'SELL',
        positionSide: 'BOTH',
        stopPrice: '0',
        workingType: 'CONTRACT_PRICE',
        priceProtect: false,
        origType: 'LIMIT',
        time: 1500,
        updateTime: 1500,
      });

      const updatedOrders = useHistoryStore.getState().orderHistory;
      expect(updatedOrders).not.toBe(prevOrders);
      expect(updatedOrders).toHaveLength(2);
      expect(updatedOrders[0].orderId).toBe(102);
      expect(updatedOrders[1].orderId).toBe(100);
    });

    it('appends paginated data on load more and deduplicates', () => {
      useHistoryStore.getState().setTransactionHistory([
        {
          symbol: 'BTCUSDT',
          incomeType: 'REALIZED_PNL',
          income: '50',
          asset: 'USDT',
          time: 2000,
          tranId: 'tx-2',
          tradeId: 't-2',
          info: '',
        },
      ]);

      useHistoryStore.getState().appendTransactionHistory([
        {
          symbol: 'BTCUSDT',
          incomeType: 'COMMISSION',
          income: '-1',
          asset: 'USDT',
          time: 1000,
          tranId: 'tx-1',
          tradeId: 't-1',
          info: '',
        },
        {
          symbol: 'BTCUSDT',
          incomeType: 'REALIZED_PNL',
          income: '50',
          asset: 'USDT',
          time: 2000,
          tranId: 'tx-2',
          tradeId: 't-2',
          info: '',
        },
      ]);

      const history = useHistoryStore.getState().transactionHistory;
      expect(history).toHaveLength(2);
      expect(history[0].tranId).toBe('tx-2');
      expect(history[1].tranId).toBe('tx-1');
    });
  });
});
