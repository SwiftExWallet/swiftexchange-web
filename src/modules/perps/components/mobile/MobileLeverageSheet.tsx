import { X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface MobileLeverageSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentLeverage: number;
  currentMarginType: 'cross' | 'isolated';
  maxLeverage?: number;
  onConfirm: (leverage: number, marginType: 'cross' | 'isolated') => void;
}

const PRESET_LEVERAGES = [5, 10, 20, 50, 100];

export const MobileLeverageSheet: React.FC<MobileLeverageSheetProps> = ({
  isOpen,
  onClose,
  currentLeverage,
  currentMarginType,
  maxLeverage = 100,
  onConfirm,
}) => {
  const [leverage, setLeverage] = useState(currentLeverage);
  const [marginType, setMarginType] = useState<'cross' | 'isolated'>(currentMarginType);

  useEffect(() => {
    if (isOpen) {
      setLeverage(currentLeverage);
      setMarginType(currentMarginType);
    }
  }, [isOpen, currentLeverage, currentMarginType]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-secondary border-t border-color rounded-t-3xl p-5 shadow-2xl flex flex-col gap-5 pb-8 animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-border-color rounded-full self-center" />

        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-primary">Adjust Leverage</h3>
          <button
            onClick={onClose}
            className="text-secondary hover:text-primary transition-colors p-1 rounded-full hover:bg-tertiary"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 bg-tertiary p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setMarginType('cross')}
            className={`py-2 text-xs font-semibold rounded-lg transition-all ${
              marginType === 'cross'
                ? 'bg-secondary text-primary shadow-sm'
                : 'text-secondary hover:text-primary'
            }`}
          >
            Cross Margin
          </button>
          <button
            type="button"
            onClick={() => setMarginType('isolated')}
            className={`py-2 text-xs font-semibold rounded-lg transition-all ${
              marginType === 'isolated'
                ? 'bg-secondary text-primary shadow-sm'
                : 'text-secondary hover:text-primary'
            }`}
          >
            Isolated Margin
          </button>
        </div>

        <div className="text-center py-2">
          <span className="text-4xl font-black font-mono text-primary">{leverage}</span>
          <span className="text-xl font-bold text-brand ml-1">x</span>
        </div>

        <div className="space-y-2">
          <input
            type="range"
            min={1}
            max={maxLeverage}
            value={leverage}
            onChange={e => setLeverage(Number(e.target.value))}
            className="w-full accent-brand cursor-pointer"
          />
          <div className="flex justify-between text-[11px] text-muted font-mono">
            <span>1x</span>
            <span>{Math.round(maxLeverage / 2)}x</span>
            <span>{maxLeverage}x</span>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {PRESET_LEVERAGES.filter(l => l <= maxLeverage).map(preset => (
            <button
              key={preset}
              type="button"
              onClick={() => setLeverage(preset)}
              className={`py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
                leverage === preset
                  ? 'bg-brand text-white'
                  : 'bg-tertiary text-secondary hover:text-primary hover:bg-hover'
              }`}
            >
              {preset}x
            </button>
          ))}
        </div>

        <div className="text-[11px] text-muted leading-relaxed px-1">
          {leverage > 20 && (
            <p className="text-amber-400/90">
              High leverage trading carries substantial risk of liquidation. Manage your position
              size responsibly.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            onConfirm(leverage, marginType);
            onClose();
          }}
          className="w-full bg-brand hover:bg-brand-hover text-white py-3 rounded-xl font-bold text-sm transition-all shadow-md active:scale-[0.99] cursor-pointer"
        >
          Confirm
        </button>
      </div>
    </div>,
    document.body
  );
};
