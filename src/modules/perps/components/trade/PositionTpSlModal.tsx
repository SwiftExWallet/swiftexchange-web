import { ShieldAlert, Target, X } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { useNotificationStore } from '../../../../store/notificationStore';
import { useUnifiedExecution } from '../../services/useUnifiedExecution';

interface PositionTpSlModalProps {
  isOpen: boolean;
  onClose: () => void;
  position: any;
}

export const PositionTpSlModal: React.FC<PositionTpSlModalProps> = ({
  isOpen,
  onClose,
  position,
}) => {
  const [tpPrice, setTpPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { isReady, executeOrder } = useUnifiedExecution();

  const isLong = useMemo(() => {
    return parseFloat(position?.size || '0') > 0;
  }, [position]);

  const absSize = useMemo(() => {
    return Math.abs(parseFloat(position?.size || '0'));
  }, [position]);

  const entryPrice = parseFloat(position?.entryPrice || '0');
  const markPrice = parseFloat(position?.markPrice || '0') || entryPrice;

  // Estimated PnL calculations
  const tpPnl = useMemo(() => {
    const tp = parseFloat(tpPrice);
    if (isNaN(tp) || tp <= 0 || absSize <= 0 || entryPrice <= 0) return null;
    const diff = isLong ? tp - entryPrice : entryPrice - tp;
    return diff * absSize;
  }, [tpPrice, isLong, absSize, entryPrice]);

  const slPnl = useMemo(() => {
    const sl = parseFloat(slPrice);
    if (isNaN(sl) || sl <= 0 || absSize <= 0 || entryPrice <= 0) return null;
    const diff = isLong ? sl - entryPrice : entryPrice - sl;
    return diff * absSize;
  }, [slPrice, isLong, absSize, entryPrice]);

  if (!isOpen || !position) return null;

  const handleConfirm = async () => {
    const hasTp = Boolean(tpPrice && parseFloat(tpPrice) > 0);
    const hasSl = Boolean(slPrice && parseFloat(slPrice) > 0);

    if (!hasTp && !hasSl) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    const oppositeSide: 'BUY' | 'SELL' = isLong ? 'SELL' : 'BUY';
    const errors: string[] = [];

    if (hasTp) {
      try {
        await executeOrder({
          symbol: position.symbol,
          side: oppositeSide,
          type: 'TAKE_PROFIT_MARKET',
          price: 0,
          size: absSize,
          reduceOnly: true,
          stopPrice: tpPrice,
          currentPrice: markPrice,
        });
      } catch (err: any) {
        errors.push(`TP: ${err?.message || 'Failed'}`);
      }
    }

    if (hasSl) {
      try {
        await executeOrder({
          symbol: position.symbol,
          side: oppositeSide,
          type: 'STOP_MARKET',
          price: 0,
          size: absSize,
          reduceOnly: true,
          stopPrice: slPrice,
          currentPrice: markPrice,
        });
      } catch (err: any) {
        errors.push(`SL: ${err?.message || 'Failed'}`);
      }
    }

    setIsSubmitting(false);

    if (errors.length === 0) {
      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'TP/SL Set',
        status: 'success',
        message: `Take Profit & Stop Loss orders placed for ${position.symbol.replace('-', '')}.`,
      });
      onClose();
    } else {
      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'TP/SL Notice',
        status: 'error',
        message: errors.join('; '),
      });
    }
  };

  const symbolDisplay = position.symbol?.replace('-', '') || '';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs animate-fade-in p-4">
      <div
        className="w-full max-w-[420px] bg-secondary border border-color rounded-xl shadow-2xl overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-4 py-3 border-b border-color">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-primary">Position TP/SL</h3>
            <span className="text-xs font-bold text-secondary">{symbolDisplay}</span>
          </div>
          <button
            onClick={onClose}
            className="text-secondary hover:text-primary transition-colors p-1 rounded-md hover:bg-tertiary"
          >
            <X size={16} />
          </button>
        </div>

        {/* Position Summary */}
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-2 p-2.5 bg-tertiary rounded-lg text-[11px]">
            <div>
              <span className="text-muted block">Side</span>
              <span className={`font-bold ${isLong ? 'text-success' : 'text-danger'}`}>
                {isLong ? 'LONG' : 'SHORT'} {absSize}
              </span>
            </div>
            <div>
              <span className="text-muted block">Entry Price</span>
              <span className="font-mono text-primary font-medium">{entryPrice.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted block">Mark Price</span>
              <span className="font-mono text-primary font-medium">{markPrice.toFixed(2)}</span>
            </div>
          </div>

          {/* Take Profit Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-1.5 text-secondary font-medium">
                <Target size={13} className="text-success" />
                <span>Take Profit Trigger Price</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  const estTp = isLong ? markPrice * 1.05 : markPrice * 0.95;
                  setTpPrice(estTp.toFixed(2));
                }}
                className="text-[10px] text-brand hover:underline font-medium"
              >
                +5% Quick
              </button>
            </div>
            <div className="relative flex items-center h-9 px-3 bg-tertiary border border-color rounded-md focus-within:border-brand">
              <input
                type="text"
                inputMode="decimal"
                value={tpPrice}
                onChange={e => {
                  const val = e.target.value;
                  if (val === '' || /^\d*\.?\d*$/.test(val)) setTpPrice(val);
                }}
                placeholder={`e.g. ${(isLong ? markPrice * 1.05 : markPrice * 0.95).toFixed(1)}`}
                className="w-full bg-transparent text-primary text-xs font-mono outline-none"
              />
              <span className="text-[11px] text-muted ml-2">USDT</span>
            </div>
            {tpPnl !== null && (
              <div className="text-[11px] flex justify-between items-center text-muted px-1">
                <span>Expected Profit:</span>
                <span
                  className={`font-mono font-medium ${tpPnl >= 0 ? 'text-success' : 'text-danger'}`}
                >
                  {tpPnl >= 0 ? '+' : ''}
                  {tpPnl.toFixed(2)} USDT
                </span>
              </div>
            )}
          </div>

          {/* Stop Loss Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-1.5 text-secondary font-medium">
                <ShieldAlert size={13} className="text-danger" />
                <span>Stop Loss Trigger Price</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  const estSl = isLong ? markPrice * 0.95 : markPrice * 1.05;
                  setSlPrice(estSl.toFixed(2));
                }}
                className="text-[10px] text-brand hover:underline font-medium"
              >
                -5% Quick
              </button>
            </div>
            <div className="relative flex items-center h-9 px-3 bg-tertiary border border-color rounded-md focus-within:border-brand">
              <input
                type="text"
                inputMode="decimal"
                value={slPrice}
                onChange={e => {
                  const val = e.target.value;
                  if (val === '' || /^\d*\.?\d*$/.test(val)) setSlPrice(val);
                }}
                placeholder={`e.g. ${(isLong ? markPrice * 0.95 : markPrice * 1.05).toFixed(1)}`}
                className="w-full bg-transparent text-primary text-xs font-mono outline-none"
              />
              <span className="text-[11px] text-muted ml-2">USDT</span>
            </div>
            {slPnl !== null && (
              <div className="text-[11px] flex justify-between items-center text-muted px-1">
                <span>Expected Loss:</span>
                <span
                  className={`font-mono font-medium ${slPnl >= 0 ? 'text-success' : 'text-danger'}`}
                >
                  {slPnl >= 0 ? '+' : ''}
                  {slPnl.toFixed(2)} USDT
                </span>
              </div>
            )}
          </div>
        </div>

        {!isReady && (
          <div className="mx-4 mt-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-[11px] text-amber-300 flex items-center gap-2">
            <ShieldAlert size={14} className="shrink-0 text-amber-400" />
            <span>Active trading session required to place TP/SL trigger orders.</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex gap-2.5 p-4 border-t border-color bg-tertiary/40">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-2 text-xs font-semibold text-secondary hover:text-primary bg-secondary border border-color rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || (!tpPrice && !slPrice) || !isReady}
            className="flex-1 py-2 text-xs font-semibold text-white bg-brand hover:bg-brand/90 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors shadow-sm cursor-pointer"
          >
            {!isReady
              ? 'Trading Session Required'
              : isSubmitting
                ? 'Submitting...'
                : 'Confirm TP/SL'}
          </button>
        </div>
      </div>
    </div>
  );
};
