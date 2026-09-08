import React, { memo, useMemo, useState } from 'react';

import { ConfirmationModal } from '../../../../../components/common/ConfirmationModal';
import { useAccountStore } from '../../../core/stores/accountStore';
import { useLeverageStore } from '../../../core/stores/leverageStore';
import { useMarketStore } from '../../../core/stores/marketStore';
import { usePositionStore } from '../../../core/stores/positionStore';
import { useTickerStore } from '../../../core/stores/tickerStore';
import { useUnifiedExecution } from '../../../services/useUnifiedExecution';
import {
  calculateLiquidationPrice,
  formatPricePrecision,
} from '../../../utils/liquidationCalculator';
import { PositionTpSlModal } from '../../trade/PositionTpSlModal';

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

    const assetCtx = useTickerStore(state => state.assetCtxByMarket[position.symbol]);
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
      if (!isReady) return;
      const isLong = parseFloat(position.size) > 0;
      const curPx = parseFloat(assetCtx?.markPx || position.markPrice || '0') || undefined;
      await closePosition(position.symbol, position.size, isLong, curPx);
      setCloseModalOpen(false);
    };

    const handleConfirmReverse = async () => {
      if (!isReady) return;
      const isLong = parseFloat(position.size) > 0;
      const curPx = parseFloat(assetCtx?.markPx || position.markPrice || '0') || undefined;
      await reversePosition(position.symbol, position.size, isLong, curPx);
      setReverseModalOpen(false);
    };

    const isLong = parseFloat(position.size) > 0;
    const markPrice = assetCtx?.markPx || position.markPrice || '0';

    const entryVal = parseFloat(position.entryPrice || '0');
    const sizeVal = parseFloat(position.size || '0');
    const absSize = Math.abs(sizeVal);
    const markVal = parseFloat(markPrice) || entryVal;
    const leverage = position.leverage > 0 ? position.leverage : 20;

    const notional = absSize * entryVal;
    const marginCalc =
      position.marginType === 'isolated' && parseFloat(position.isolatedMargin || '0') > 0
        ? parseFloat(position.isolatedMargin)
        : notional / leverage;

    const pnlVal = isLong ? (markVal - entryVal) * absSize : (entryVal - markVal) * absSize;
    const marginDenom = marginCalc === 0 ? 1 : marginCalc;
    const roe = (pnlVal / marginDenom) * 100;

    const breakEven = isLong ? entryVal * 1.0008 : entryVal * 0.9992;

    const liqPrice = useMemo(() => {
      return calculateLiquidationPrice({
        position,
        allPositions,
        balances,
        isMultiAsset,
        bracketsBySymbol,
      });
    }, [position, allPositions, balances, isMultiAsset, bracketsBySymbol]);

    const tickSize = market?.tickSize;
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
            <span className="font-medium">{notional.toFixed(2)} USDT</span>
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
            <span>{marginCalc.toFixed(2)} USDT</span>
            <span className="text-[10px] text-secondary">
              ({position.marginType === 'isolated' ? 'Isolated' : 'Cross'})
            </span>
          </div>
        </td>
        <td className="px-2.5 py-1.5 text-primary font-mono-tabular">
          {liqPrice != null && liqPrice > 0 ? formatPricePrecision(liqPrice, tickSize) : '--'}
        </td>
        <td className="px-2.5 py-1.5 text-primary font-mono-tabular">
          {formatPricePrecision(breakEven, tickSize)}
        </td>
        <td
          className={`px-2.5 py-1.5 font-mono-tabular ${pnlVal > 0 ? 'text-success' : pnlVal < 0 ? 'text-danger' : 'text-primary'}`}
        >
          <div className="flex flex-col">
            <span className="font-medium">
              {pnlVal > 0 ? '+' : ''}
              {pnlVal.toFixed(2)} USDT
            </span>
            <span className="text-[10px]">
              {roe > 0 ? '+' : ''}
              {roe.toFixed(2)}%
            </span>
          </div>
        </td>
        <td className="px-2.5 py-1.5 text-primary">
          <button
            type="button"
            onClick={() => setTpSlModalOpen(true)}
            className="flex items-center space-x-1 text-secondary hover:text-primary transition-colors text-[11px] cursor-pointer"
          >
            <span>Add</span>
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </button>
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

        {/* Modals */}
        <ConfirmationModal
          isOpen={closeModalOpen}
          title="Close Position"
          message={
            <div className="flex flex-col gap-2 p-3 bg-secondary rounded-lg border border-color text-xs mt-2">
              <div className="flex justify-between items-center text-secondary">
                <span>Symbol</span>
                <span className="text-primary font-bold">{position.symbol.replace('-', '')}</span>
              </div>
              <div className="flex justify-between items-center text-secondary">
                <span>Size</span>
                <span className="text-primary font-medium">
                  {absSize} {baseSymbol}
                </span>
              </div>
              <div className="flex justify-between items-center text-secondary">
                <span>Estimated PnL</span>
                <span
                  className={`font-mono font-medium ${pnlVal > 0 ? 'text-success' : pnlVal < 0 ? 'text-danger' : 'text-primary'}`}
                >
                  {pnlVal > 0 ? '+' : ''}
                  {pnlVal.toFixed(2)} USDT
                </span>
              </div>
            </div>
          }
          onConfirm={handleConfirmClose}
          onCancel={() => setCloseModalOpen(false)}
          confirmText="Confirm Market Close"
          confirmButtonType="danger"
        />

        <ConfirmationModal
          isOpen={reverseModalOpen}
          title="Reverse Position"
          message={
            <div className="flex flex-col gap-3 p-3 bg-secondary rounded-lg border border-color text-xs mt-2">
              <div className="flex justify-between items-center text-secondary">
                <span>Symbol</span>
                <span className="text-primary font-bold">{position.symbol.replace('-', '')}</span>
              </div>
              <div className="flex justify-between items-center text-secondary">
                <span>Size</span>
                <span className="text-primary font-medium">
                  {absSize} {baseSymbol}
                </span>
              </div>
              <div className="flex justify-between items-center text-secondary">
                <span>Direction Change</span>
                <div className="flex items-center gap-1.5 font-medium">
                  <span className={isLong ? 'text-success' : 'text-danger'}>
                    {isLong ? 'LONG' : 'SHORT'}
                  </span>
                  <span className="text-muted">➔</span>
                  <span className={!isLong ? 'text-success' : 'text-danger'}>
                    {!isLong ? 'LONG' : 'SHORT'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-1 pt-2 border-t border-color text-center">
                <div className="p-2 bg-tertiary rounded flex flex-col items-center">
                  <span className="text-muted text-[10px]">1. Close Current</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${isLong ? 'text-danger bg-danger/10' : 'text-success bg-success/10'}`}
                  >
                    {isLong ? 'SELL' : 'BUY'} {absSize}
                  </span>
                  <span className="text-secondary text-[11px] mt-1.5 font-medium">
                    Market Price
                  </span>
                </div>
                <div className="p-2 bg-tertiary rounded flex flex-col items-center">
                  <span className="text-muted text-[10px]">2. Open Opposite</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${!isLong ? 'text-success bg-success/10' : 'text-danger bg-danger/10'}`}
                  >
                    {!isLong ? 'LONG' : 'SHORT'} {leverage}x
                  </span>
                  <span className="text-secondary text-[11px] mt-1.5 font-medium">
                    Market Price
                  </span>
                </div>
              </div>
            </div>
          }
          onConfirm={handleConfirmReverse}
          onCancel={() => setReverseModalOpen(false)}
          confirmText="Confirm Reverse"
          confirmButtonType="primary"
        />

        <PositionTpSlModal
          isOpen={tpSlModalOpen}
          onClose={() => setTpSlModalOpen(false)}
          position={position}
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
  const { isReady, loading: isClosingAll, closeAllPositions } = useUnifiedExecution();

  const positionList = useMemo(() => Object.values(positions), [positions]);

  const handleConfirmCloseAll = async () => {
    if (!isReady) return;
    await closeAllPositions(positionList);
    setCloseAllModalOpen(false);
  };

  return (
    <div className="w-full h-full overflow-x-auto overflow-y-auto scrollbar-thin">
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
          {positionList.length === 0 ? (
            <tr>
              <td colSpan={11} className="px-4 py-8 text-center text-muted">
                No positions found
              </td>
            </tr>
          ) : (
            positionList.map(p => (
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
            ))
          )}
        </tbody>
      </table>

      {/* Close All Confirmation Modal */}
      <ConfirmationModal
        isOpen={closeAllModalOpen}
        title="Close All Positions"
        message={
          <div className="flex flex-col gap-2 p-3 bg-secondary rounded-lg border border-color text-xs mt-2">
            <p className="text-primary font-medium">
              Are you sure you want to market close all{' '}
              <strong className="text-warning">{positionList.length}</strong> open positions?
            </p>
            <div className="text-muted text-[11px] space-y-1 mt-1 max-h-40 overflow-y-auto">
              {positionList.map(p => (
                <div
                  key={p.symbol}
                  className="flex justify-between items-center py-0.5 border-b border-color/40 last:border-0"
                >
                  <span className="font-semibold text-secondary">{p.symbol.replace('-', '')}</span>
                  <span
                    className={
                      parseFloat(p.size) > 0
                        ? 'text-success font-medium'
                        : 'text-danger font-medium'
                    }
                  >
                    {parseFloat(p.size) > 0 ? 'LONG' : 'SHORT'} {Math.abs(parseFloat(p.size))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        }
        onConfirm={handleConfirmCloseAll}
        onCancel={() => setCloseAllModalOpen(false)}
        confirmText={isClosingAll ? 'Closing...' : 'Confirm Market Close All'}
        confirmButtonType="danger"
      />
    </div>
  );
};
