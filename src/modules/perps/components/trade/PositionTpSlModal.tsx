import { Loader2, X } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { useNotificationStore } from '../../../../store/notificationStore';
import { useUnifiedExecution } from '../../services/useUnifiedExecution';
import { Modal } from '../ui/Modal';

interface PositionTpSlModalProps {
  isOpen: boolean;
  onClose: () => void;
  position: any;
  currentTpPrice?: string | null;
  currentSlPrice?: string | null;
  onSuccess?: (tp: string, sl: string) => void;
}

const TP_PERCENTAGES = [5, 10, 25, 50, 100];
const SL_PERCENTAGES = [5, 10, 25, 50];

export const PositionTpSlModal: React.FC<PositionTpSlModalProps> = ({
  isOpen,
  onClose,
  position,
  currentTpPrice,
  currentSlPrice,
  onSuccess,
}) => {
  const [tpPrice, setTpPrice] = useState(currentTpPrice || '');
  const [slPrice, setSlPrice] = useState(currentSlPrice || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setTpPrice(currentTpPrice || '');
      setSlPrice(currentSlPrice || '');
    }
  }, [isOpen, currentTpPrice, currentSlPrice]);

  const { isReady, executeOrder } = useUnifiedExecution();

  const isLong = useMemo(() => {
    return parseFloat(position?.size || '0') > 0;
  }, [position]);

  const absSize = useMemo(() => {
    return Math.abs(parseFloat(position?.size || '0'));
  }, [position]);

  const entryPrice = parseFloat(position?.entryPrice || '0');
  const markPrice = parseFloat(position?.markPrice || '0') || entryPrice;
  const leverage = parseFloat(position?.leverage || '20') || 20;
  const initialMargin = (absSize * entryPrice) / leverage;

  const symbolDisplay = position?.symbol ? position.symbol.replace('-', '').toUpperCase() : '';
  const baseSymbol = position?.symbol ? position.symbol.split('-')[0].toUpperCase() : '';

  const tpStats = useMemo(() => {
    const tp = parseFloat(tpPrice);
    if (isNaN(tp) || tp <= 0 || absSize <= 0 || entryPrice <= 0) return null;
    const pnl = isLong ? (tp - entryPrice) * absSize : (entryPrice - tp) * absSize;
    const roi = initialMargin > 0 ? (pnl / initialMargin) * 100 : 0;
    return { pnl, roi };
  }, [tpPrice, isLong, absSize, entryPrice, initialMargin]);

  const slStats = useMemo(() => {
    const sl = parseFloat(slPrice);
    if (isNaN(sl) || sl <= 0 || absSize <= 0 || entryPrice <= 0) return null;
    const pnl = isLong ? (sl - entryPrice) * absSize : (entryPrice - sl) * absSize;
    const roi = initialMargin > 0 ? (pnl / initialMargin) * 100 : 0;
    return { pnl, roi };
  }, [slPrice, isLong, absSize, entryPrice, initialMargin]);

  if (!isOpen || !position) return null;

  const handleSelectTpPercent = (percent: number) => {
    const priceDelta = (entryPrice * (percent / 100)) / leverage;
    const targetPrice = isLong ? entryPrice + priceDelta : entryPrice - priceDelta;
    if (targetPrice > 0) {
      setTpPrice(targetPrice.toFixed(2));
    }
  };

  const handleSelectSlPercent = (percent: number) => {
    const priceDelta = (entryPrice * (percent / 100)) / leverage;
    const targetPrice = isLong ? entryPrice - priceDelta : entryPrice + priceDelta;
    if (targetPrice > 0) {
      setSlPrice(targetPrice.toFixed(2));
    }
  };

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
      onSuccess?.(tpPrice, slPrice);
      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'TP/SL Orders Set',
        status: 'success',
        message: `Take Profit & Stop Loss orders placed for ${symbolDisplay}.`,
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`TP / SL — ${symbolDisplay}`}
      width="w-[420px]"
      isLocked={isSubmitting}
    >
      <div className="space-y-3.5">
        <div className="bg-tertiary rounded-xl p-3 border border-color space-y-1.5 text-[11px]">
          <div className="flex justify-between text-secondary">
            <span>Position</span>
            <div className="flex items-center gap-1.5 font-mono">
              <span className={isLong ? 'text-success font-semibold' : 'text-danger font-semibold'}>
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
              ${entryPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between text-secondary">
            <span>Mark Price</span>
            <span className="text-primary font-mono font-medium">
              ${markPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <p className="text-[10px] text-secondary font-medium uppercase tracking-wide">
              Take Profit Price
            </p>
            <div className="flex items-center gap-1">
              {TP_PERCENTAGES.map(pct => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handleSelectTpPercent(pct)}
                  className="text-[10px] font-mono text-secondary hover:text-success px-1.5 py-0.5 rounded bg-tertiary hover:bg-hover transition-colors cursor-pointer"
                >
                  +{pct}%
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center bg-tertiary border border-color rounded-xl h-11 px-3.5 transition-colors focus-within:border-brand">
            <input
              type="text"
              inputMode="decimal"
              placeholder={`Trigger price (${isLong ? '>' : '<'} ${markPrice.toFixed(2)})`}
              value={tpPrice}
              onChange={e => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) setTpPrice(val);
              }}
              className="flex-1 bg-transparent text-primary font-mono text-[12px] outline-none placeholder:text-muted"
            />
            {tpPrice && (
              <button
                type="button"
                onClick={() => setTpPrice('')}
                className="text-muted hover:text-secondary p-1 mr-1 cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
            <span className="text-[11px] font-mono font-medium text-secondary">USDT</span>
          </div>
          {tpStats && (
            <div className="flex justify-between text-[11px] mt-1.5 px-0.5 font-mono">
              <span className="text-secondary">Est. Profit</span>
              <span className="text-success font-semibold">
                +${tpStats.pnl.toFixed(2)} USDT (+{tpStats.roi.toFixed(1)}%)
              </span>
            </div>
          )}
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <p className="text-[10px] text-secondary font-medium uppercase tracking-wide">
              Stop Loss Price
            </p>
            <div className="flex items-center gap-1">
              {SL_PERCENTAGES.map(pct => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handleSelectSlPercent(pct)}
                  className="text-[10px] font-mono text-secondary hover:text-danger px-1.5 py-0.5 rounded bg-tertiary hover:bg-hover transition-colors cursor-pointer"
                >
                  -{pct}%
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center bg-tertiary border border-color rounded-xl h-11 px-3.5 transition-colors focus-within:border-brand">
            <input
              type="text"
              inputMode="decimal"
              placeholder={`Trigger price (${isLong ? '<' : '>'} ${markPrice.toFixed(2)})`}
              value={slPrice}
              onChange={e => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) setSlPrice(val);
              }}
              className="flex-1 bg-transparent text-primary font-mono text-[12px] outline-none placeholder:text-muted"
            />
            {slPrice && (
              <button
                type="button"
                onClick={() => setSlPrice('')}
                className="text-muted hover:text-secondary p-1 mr-1 cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
            <span className="text-[11px] font-mono font-medium text-secondary">USDT</span>
          </div>
          {slStats && (
            <div className="flex justify-between text-[11px] mt-1.5 px-0.5 font-mono">
              <span className="text-secondary">Est. Loss</span>
              <span className="text-danger font-semibold">
                -${Math.abs(slStats.pnl).toFixed(2)} USDT ({slStats.roi.toFixed(1)}%)
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={isSubmitting || (!tpPrice && !slPrice) || !isReady}
          className="w-full h-11 bg-brand hover:bg-brand-hover text-white font-semibold text-[13px] rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm flex items-center justify-center gap-2 mt-4"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span>Placing Orders...</span>
            </>
          ) : !isReady ? (
            'Session Required'
          ) : (
            'Confirm TP / SL'
          )}
        </button>
      </div>
    </Modal>
  );
};
