import { Layers, Plus } from 'lucide-react';
import React, { memo, useEffect, useMemo, useState } from 'react';

import BigNumber from 'bignumber.js';

import { ConfirmationModal } from '../../../../../components/common/ConfirmationModal';
import { fetchAsterSnapshot } from '../../../adapters/aster/hooks/useAsterDataSync';
import { useAccountStore } from '../../../core/stores/accountStore';
import { useLeverageStore } from '../../../core/stores/leverageStore';
import { useMarketStore } from '../../../core/stores/marketStore';
import { useOrderEntryStore } from '../../../core/stores/orderEntryStore';
import { useOrderStore } from '../../../core/stores/orderStore';
import { usePositionStore } from '../../../core/stores/positionStore';
import { useTickerStore } from '../../../core/stores/tickerStore';
import { useUnifiedExecution } from '../../../services/useUnifiedExecution';
import {
  calculateLiquidationPrice,
  formatPricePrecision,
} from '../../../utils/liquidationCalculator';
import { PositionTpSlModal } from '../../trade/PositionTpSlModal';
import { TabEmptyState } from './TabEmptyState';

interface Props {
  signer?: any;
  userAddr?: string;
}

interface PositionRowProps {
  position: any;
  allPositions: any[];
  balances: Record<string, any> | any[];
  isMultiAsset: boolean;
  bracketsBySymbol: Record<string, any[]>;
  signer?: any;
  userAddr?: string;
}

const PositionRow = memo(
  ({ position, allPositions, balances, isMultiAsset, bracketsBySymbol }: PositionRowProps) => {
    const [closeModalOpen, setCloseModalOpen] = useState(false);
    const [reverseModalOpen, setReverseModalOpen] = useState(false);
    const [tpSlModalOpen, setTpSlModalOpen] = useState(false);
    const [isClosingThis, setIsClosingThis] = useState(false);
    const [isReversingThis, setIsReversingThis] = useState(false);
    const [optimisticTp, setOptimisticTp] = useState<string | null>(null);
    const [optimisticSl, setOptimisticSl] = useState<string | null>(null);

    const orders = useOrderStore(state => state.orders);
    const posCleanSym = position.symbol.replace('-', '').toUpperCase();

    const { tpOrder, slOrder } = useMemo(() => {
      const activeOrders = Object.values(orders).filter(o => {
        if (o.status !== 'new' && o.status !== 'partially_filled') return false;
        const oSym = o.symbol.replace('-', '').toUpperCase();
        return oSym === posCleanSym;
      });

      const tp = activeOrders.find(o => {
        const raw = (o.rawType || o.origType || o.type || '').toUpperCase();
        return raw.includes('PROFIT');
      });

      const sl = activeOrders.find(o => {
        const raw = (o.rawType || o.origType || o.type || '').toUpperCase();
        return raw.includes('STOP');
      });

      return { tpOrder: tp, slOrder: sl };
    }, [orders, posCleanSym]);

    const effectiveTp = tpOrder?.stopPrice || optimisticTp;
    const effectiveSl = slOrder?.stopPrice || optimisticSl;

    const assetCtx = useTickerStore(
      state =>
        state.assetCtxByMarket[position.symbol] ||
        state.assetCtxByMarket[position.symbol.replace('-', '')] ||
        state.assetCtxByMarket[position.symbol.replace('USDT', '-USDT')]
    );
    const {
      isReady,
      loading: isProcessing,
      closePosition,
      reversePosition,
    } = useUnifiedExecution();

    const market = useMarketStore(
      state =>
        state.markets[position.symbol] || state.markets[position.symbol.replace('USDT', '-USDT')]
    );

    const handleConfirmClose = async () => {
      if (!isReady || isClosingThis) return;
      setIsClosingThis(true);
      try {
        const isLong = parseFloat(position.size) > 0;
        const curPx = parseFloat(assetCtx?.markPx || position.markPrice || '0') || undefined;
        await closePosition(position.symbol, position.size, isLong, curPx);
        setCloseModalOpen(false);
      } catch (err) {
        console.error('Failed to close position:', err);
      } finally {
        setIsClosingThis(false);
      }
    };

    const handleConfirmReverse = async () => {
      if (!isReady || isReversingThis) return;
      setIsReversingThis(true);
      try {
        const isLong = parseFloat(position.size) > 0;
        const curPx = parseFloat(assetCtx?.markPx || position.markPrice || '0') || undefined;
        await reversePosition(position.symbol, position.size, isLong, curPx);
        setReverseModalOpen(false);
      } catch (err) {
        console.error('Failed to reverse position:', err);
      } finally {
        setIsReversingThis(false);
      }
    };

    const isLong = parseFloat(position.size) > 0;
    const markPrice = assetCtx?.markPx || position.markPrice || '0';

    const entryVal = parseFloat(position.entryPrice || '0');
    const sizeVal = parseFloat(position.size || '0');
    const absSize = Math.abs(sizeVal);
    const markVal = parseFloat(markPrice) || entryVal;
    const storedLeverage =
      useOrderEntryStore.getState().leverageBySymbol[position.symbol] ||
      useOrderEntryStore.getState().leverageBySymbol[position.symbol.replace('-', '')] ||
      useOrderEntryStore.getState().leverageBySymbol[position.symbol.replace('USDT', '-USDT')] ||
      useOrderEntryStore.getState().leverage;

    const leverage =
      position.leverage && position.leverage > 0
        ? position.leverage
        : storedLeverage && storedLeverage > 0
          ? storedLeverage
          : 20;

    const bnEntry = new BigNumber(entryVal);
    const bnAbsSize = new BigNumber(absSize);
    const bnMark = new BigNumber(markVal);
    const bnNotional = bnAbsSize.times(bnEntry);

    const marginCalc =
      position.marginType === 'isolated' && parseFloat(position.isolatedMargin || '0') > 0
        ? parseFloat(position.isolatedMargin)
        : position.initialMargin && parseFloat(position.initialMargin) > 0
          ? parseFloat(position.initialMargin)
          : bnNotional.dividedBy(leverage).toNumber();

    const bnPnl =
      markVal > 0 && entryVal > 0
        ? isLong
          ? bnMark.minus(bnEntry).times(bnAbsSize)
          : bnEntry.minus(bnMark).times(bnAbsSize)
        : position.unrealizedPnl != null && position.unrealizedPnl !== ''
          ? new BigNumber(position.unrealizedPnl)
          : new BigNumber(0);

    const pnlVal = bnPnl.toNumber();
    const marginDenom = marginCalc === 0 ? 1 : marginCalc;
    const roe = bnPnl.dividedBy(marginDenom).times(100).toNumber();

    // Aster Futures standard round-trip taker fee rate is 0.04% (0.0004)
    const ASTER_TAKER_FEE_RATE = 0.0004;
    const breakEven = isLong
      ? bnEntry.times(1 + ASTER_TAKER_FEE_RATE).toNumber()
      : bnEntry.times(1 - ASTER_TAKER_FEE_RATE).toNumber();

    const officialLiq = parseFloat(position.liquidationPrice || '0');
    const liqPrice = useMemo(() => {
      if (officialLiq > 0) return officialLiq;
      return calculateLiquidationPrice({
        position: { ...position, leverage },
        allPositions,
        balances,
        isMultiAsset,
        bracketsBySymbol,
      });
    }, [officialLiq, position, leverage, allPositions, balances, isMultiAsset, bracketsBySymbol]);

    const tickSize = market?.tickSize;
    const tickDecimals =
      tickSize && String(tickSize).includes('.') ? String(tickSize).split('.')[1].length : 1;
    const baseSymbol = position.symbol.replace('-USDT', '').replace('USDT', '');

    return (
      <tr className="border-b border-color hover:bg-hover transition-colors">
        <td className="px-2.5 py-1.5 text-primary font-medium">
          <div className="flex flex-col">
            <span className="font-semibold">{position.symbol.replace('-', '')}</span>
            <span
              className={`text-[10px] font-medium flex items-center gap-1 ${isLong ? 'text-success' : 'text-danger'}`}
            >
              {isLong ? 'Buy' : 'Sell'} {leverage}x
              <span className="opacity-60 text-[9px] tracking-tighter">||||</span>
            </span>
          </div>
        </td>
        <td
          className={`px-2.5 py-1.5 ${isLong ? 'text-success' : 'text-danger'} font-mono-tabular`}
        >
          <div className="flex flex-col">
            <span className="font-medium">
              {bnNotional.toNumber().toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              USDT
            </span>
            <span className="text-[10px] text-secondary">
              {absSize} {baseSymbol}
            </span>
          </div>
        </td>
        <td className="px-2.5 py-1.5 text-primary font-mono-tabular">
          {formatPricePrecision(entryVal, tickSize)}
        </td>
        <td className="px-2.5 py-1.5 text-primary font-mono-tabular">
          {formatPricePrecision(markVal, tickSize)}
        </td>
        <td className="px-2.5 py-1.5 text-primary font-mono-tabular">
          <div className="flex flex-col">
            <span>
              {marginCalc.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              USDT
            </span>
            <span className="text-[10px] text-secondary">
              ({position.marginType === 'isolated' ? 'Isolated' : 'Cross'})
            </span>
          </div>
        </td>
        <td className="px-2.5 py-1.5 text-primary font-mono-tabular">
          {liqPrice != null && liqPrice > 0 ? formatPricePrecision(liqPrice, tickSize) : '--'}
        </td>
        <td className="px-2.5 py-1.5 text-primary font-mono-tabular">
          {formatPricePrecision(breakEven, tickSize, tickDecimals)}
        </td>
        <td
          className={`px-2.5 py-1.5 font-mono-tabular ${pnlVal > 0 ? 'text-success' : pnlVal < 0 ? 'text-danger' : 'text-primary'}`}
        >
          <div className="flex flex-col">
            <span className="font-medium">
              {pnlVal > 0 ? '+' : ''}
              {pnlVal.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              USDT
            </span>
            <span className="text-[10px]">
              {roe > 0 ? '+' : ''}
              {roe.toFixed(2)}%
            </span>
          </div>
        </td>
        <td className="px-2.5 py-1.5 text-primary">
          {effectiveTp || effectiveSl ? (
            <div className="flex items-center gap-1.5 font-mono">
              <div className="flex flex-col text-[10px] leading-tight">
                <span className={effectiveTp ? 'text-success font-medium' : 'text-muted'}>
                  TP:{' '}
                  {effectiveTp
                    ? formatPricePrecision(parseFloat(effectiveTp), tickSize, tickDecimals)
                    : '--'}
                </span>
                <span className={effectiveSl ? 'text-danger font-medium' : 'text-muted'}>
                  SL:{' '}
                  {effectiveSl
                    ? formatPricePrecision(parseFloat(effectiveSl), tickSize, tickDecimals)
                    : '--'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setTpSlModalOpen(true)}
                className="p-1 rounded text-secondary hover:text-primary hover:bg-tertiary transition-colors cursor-pointer"
                title="Edit TP/SL"
              >
                <Plus size={11} strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setTpSlModalOpen(true)}
              className="flex items-center gap-1 text-secondary hover:text-primary transition-colors text-[11px] cursor-pointer"
            >
              <span>Add</span>
              <Plus size={11} strokeWidth={2.5} />
            </button>
          )}
        </td>
        <td className="px-2.5 py-1.5">
          <button
            onClick={() => setReverseModalOpen(true)}
            disabled={isProcessing || !isReady}
            className="text-warning hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-medium cursor-pointer"
            title={!isReady ? 'Trading session not active' : 'Reverse position'}
          >
            Reverse
          </button>
        </td>
        <td className="px-2.5 py-1.5 text-right">
          <button
            onClick={() => setCloseModalOpen(true)}
            disabled={isProcessing || !isReady}
            className="text-secondary hover:text-danger hover:bg-danger/10 p-1 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center cursor-pointer"
            title={!isReady ? 'Trading session not active' : 'Close Position'}
          >
            {isProcessing ? (
              <span className="text-[10px]">...</span>
            ) : (
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            )}
          </button>
        </td>

        <ConfirmationModal
          isOpen={closeModalOpen}
          title="Close Position"
          message={
            <div className="space-y-3 pt-0.5">
              <div className="bg-tertiary rounded-xl p-3 border border-color space-y-2 text-[11px]">
                <div className="flex justify-between text-secondary">
                  <span>Symbol</span>
                  <span className="text-primary font-mono font-semibold">
                    {position.symbol.replace('-', '')}
                  </span>
                </div>
                <div className="flex justify-between text-secondary">
                  <span>Position Size</span>
                  <div className="flex items-center gap-1.5 font-mono">
                    <span
                      className={
                        isLong ? 'text-success font-semibold' : 'text-danger font-semibold'
                      }
                    >
                      {isLong ? 'LONG' : 'SHORT'} {leverage}x
                    </span>
                    <span className="text-primary font-medium">
                      {absSize} {baseSymbol}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between text-secondary">
                  <span>Entry Price</span>
                  <span className="text-primary font-mono font-medium">
                    $
                    {parseFloat(position.entryPrice || '0').toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="flex justify-between text-secondary border-t border-color pt-2 font-semibold">
                  <span>Estimated PnL</span>
                  <span
                    className={`font-mono ${pnlVal > 0 ? 'text-success' : pnlVal < 0 ? 'text-danger' : 'text-primary'}`}
                  >
                    {pnlVal > 0 ? '+' : ''}
                    {pnlVal.toFixed(2)} USDT
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-secondary leading-relaxed px-0.5">
                Your position will be closed immediately at best available market price.
              </p>
            </div>
          }
          onConfirm={handleConfirmClose}
          onCancel={() => {
            if (!isClosingThis) setCloseModalOpen(false);
          }}
          confirmText="Confirm Market Close"
          confirmButtonType="danger"
          isLoading={isClosingThis}
        />

        <ConfirmationModal
          isOpen={reverseModalOpen}
          title="Reverse Position"
          message={
            <div className="space-y-3 pt-0.5">
              <div className="bg-tertiary rounded-xl p-3 border border-color space-y-2 text-[11px]">
                <div className="flex justify-between text-secondary">
                  <span>Symbol</span>
                  <span className="text-primary font-mono font-semibold">
                    {position.symbol.replace('-', '')}
                  </span>
                </div>
                <div className="flex justify-between text-secondary">
                  <span>Position Size</span>
                  <span className="text-primary font-mono font-medium">
                    {absSize} {baseSymbol}
                  </span>
                </div>
                <div className="flex justify-between text-secondary">
                  <span>Reversal Direction</span>
                  <div className="flex items-center gap-1.5 font-mono">
                    <span
                      className={
                        isLong ? 'text-success font-semibold' : 'text-danger font-semibold'
                      }
                    >
                      {isLong ? 'LONG' : 'SHORT'}
                    </span>
                    <span className="text-muted">➔</span>
                    <span
                      className={
                        !isLong ? 'text-success font-semibold' : 'text-danger font-semibold'
                      }
                    >
                      {!isLong ? 'LONG' : 'SHORT'} {leverage}x
                    </span>
                  </div>
                </div>
                <div className="flex justify-between text-secondary border-t border-color pt-2">
                  <span>Execution Type</span>
                  <span className="text-primary font-medium">Market Order (Immediate)</span>
                </div>
              </div>

              <p className="text-[11px] text-secondary leading-relaxed px-0.5">
                Your active {isLong ? 'LONG' : 'SHORT'} will be closed and an opposite position of{' '}
                {absSize} {baseSymbol} ({leverage}x) will be opened immediately at market price.
              </p>
            </div>
          }
          onConfirm={handleConfirmReverse}
          onCancel={() => {
            if (!isReversingThis) setReverseModalOpen(false);
          }}
          confirmText="Confirm Reverse"
          confirmButtonType="primary"
          isLoading={isReversingThis}
        />

        <PositionTpSlModal
          isOpen={tpSlModalOpen}
          onClose={() => setTpSlModalOpen(false)}
          position={position}
          currentTpPrice={effectiveTp}
          currentSlPrice={effectiveSl}
          onSuccess={(tp, sl) => {
            if (tp) setOptimisticTp(tp);
            if (sl) setOptimisticSl(sl);
          }}
        />
      </tr>
    );
  }
);

export const PositionsTab: React.FC<Props> = ({ signer, userAddr }) => {
  const positions = usePositionStore(state => state.positions);
  const balances = useAccountStore(state => state.balances);
  const isMultiAsset = useAccountStore(state => state.multiAssetsMargin);
  const bracketsBySymbol = useLeverageStore(state => state.bracketsBySymbol);

  const [closeAllModalOpen, setCloseAllModalOpen] = useState(false);
  const [isClosingAllLocal, setIsClosingAllLocal] = useState(false);
  const { isReady, loading: isExecutionLoading, closeAllPositions } = useUnifiedExecution();
  const isClosingAll = isClosingAllLocal || isExecutionLoading;

  const positionList = useMemo(() => Object.values(positions), [positions]);

  useEffect(() => {
    if (signer && userAddr) {
      fetchAsterSnapshot(signer, userAddr).catch(() => {});
    }
  }, [signer, userAddr]);

  const handleConfirmCloseAll = async () => {
    if (!isReady || isClosingAll) return;
    setIsClosingAllLocal(true);
    try {
      await closeAllPositions(positionList);
      setCloseAllModalOpen(false);
    } catch (err) {
      console.error('Failed to close all positions:', err);
    } finally {
      setIsClosingAllLocal(false);
    }
  };

  if (positionList.length === 0) {
    return (
      <TabEmptyState
        icon={Layers}
        title="No open positions"
        description="You currently have no open positions."
      />
    );
  }

  return (
    <div className="w-full h-full overflow-x-auto overflow-y-auto scrollbar-none">
      <table className="w-full text-[11px] text-left whitespace-nowrap">
        <thead className="text-secondary border-b border-color sticky top-0 bg-secondary z-10">
          <tr>
            <th className="px-2.5 py-1.5 font-medium">Symbol</th>
            <th className="px-2.5 py-1.5 font-medium">Size</th>
            <th className="px-2.5 py-1.5 font-medium">Entry Price</th>
            <th className="px-2.5 py-1.5 font-medium">Mark Price</th>
            <th className="px-2.5 py-1.5 font-medium">Margin</th>
            <th className="px-2.5 py-1.5 font-medium">Liq. Price</th>
            <th className="px-2.5 py-1.5 font-medium">Break-Even</th>
            <th className="px-2.5 py-1.5 font-medium">PNL (ROE%)</th>
            <th className="px-2.5 py-1.5 font-medium">TP/SL</th>
            <th className="px-2.5 py-1.5 font-medium">Reverse</th>
            <th className="px-2.5 py-1.5 font-medium text-right">
              {positionList.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCloseAllModalOpen(true)}
                  disabled={isClosingAll || !isReady}
                  className="text-warning hover:opacity-80 transition-opacity font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title={
                    !isReady
                      ? 'Active trading session required to close positions'
                      : 'Market close all open positions'
                  }
                >
                  {isClosingAll ? 'Closing...' : 'Close All'}
                </button>
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {positionList.map(p => (
            <PositionRow
              key={p.symbol}
              position={p}
              allPositions={positionList}
              balances={balances}
              isMultiAsset={isMultiAsset}
              bracketsBySymbol={bracketsBySymbol}
              signer={signer}
              userAddr={userAddr}
            />
          ))}
        </tbody>
      </table>

      <ConfirmationModal
        isOpen={closeAllModalOpen}
        title="Close All Positions"
        message={
          <div className="space-y-3 pt-0.5">
            <div className="bg-tertiary rounded-xl p-3 border border-color space-y-2 text-[11px]">
              <div className="flex justify-between text-secondary">
                <span>Positions to Close</span>
                <span className="text-primary font-mono font-semibold">
                  {positionList.length} Open
                </span>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1.5 pt-2 border-t border-color">
                {positionList.map(p => {
                  const sizeNum = parseFloat(p.size);
                  const isL = sizeNum > 0;
                  return (
                    <div key={p.symbol} className="flex justify-between items-center text-[11px]">
                      <span className="text-primary font-mono">{p.symbol.replace('-', '')}</span>
                      <div className="flex items-center gap-1.5 font-mono">
                        <span
                          className={
                            isL ? 'text-success font-semibold' : 'text-danger font-semibold'
                          }
                        >
                          {isL ? 'LONG' : 'SHORT'}
                        </span>
                        <span className="text-secondary">{Math.abs(sizeNum)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-[11px] text-secondary leading-relaxed px-0.5">
              All {positionList.length} positions will be closed immediately at current best
              available market prices.
            </p>
          </div>
        }
        onConfirm={handleConfirmCloseAll}
        onCancel={() => {
          if (!isClosingAll) setCloseAllModalOpen(false);
        }}
        confirmText="Confirm Market Close All"
        confirmButtonType="danger"
        isLoading={isClosingAll}
      />
    </div>
  );
};
