import { X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-secondary border-t border-color rounded-t-3xl p-5 shadow-2xl flex flex-col gap-5 pb-8 animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 bg-border-color rounded-full self-center" />

        {/* Title */}
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-primary">Adjust Leverage</h3>
          <button
            onClick={onClose}
            className="text-secondary hover:text-primary transition-colors p-1 rounded-full hover:bg-tertiary"
          >
            <X size={18} />
          </button>
        </div>

        {/* Margin Mode Switcher */}
        <div className="flex bg-tertiary p-1 rounded-xl gap-1">
          <button
            type="button"
            onClick={() => setMarginType('cross')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              marginType === 'cross'
                ? 'bg-secondary text-primary shadow-sm'
                : 'text-secondary hover:text-primary'
            }`}
          >
            Cross
          </button>
          <button
            type="button"
            onClick={() => setMarginType('isolated')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              marginType === 'isolated'
                ? 'bg-secondary text-primary shadow-sm'
                : 'text-secondary hover:text-primary'
            }`}
          >
            Isolated
          </button>
        </div>

        {/* Leverage Display */}
        <div className="text-center py-2">
          <span className="text-4xl font-extrabold text-primary font-mono-tabular tracking-tight">
            {leverage}x
          </span>
        </div>

        {/* Slider */}
        <div className="space-y-3 px-1">
          <input
            type="range"
            min={1}
            max={maxLeverage}
            value={leverage}
            onChange={e => setLeverage(Number(e.target.value))}
            className="w-full accent-brand h-1.5 bg-tertiary rounded-lg cursor-pointer"
          />

          {/* Quick presets */}
          <div className="grid grid-cols-5 gap-2">
            {PRESET_LEVERAGES.filter(p => p <= maxLeverage).map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => setLeverage(preset)}
                className={`py-1.5 rounded-lg text-xs font-medium transition-all ${
                  leverage === preset
                    ? 'bg-brand/20 text-brand border border-brand/50 font-semibold'
                    : 'bg-tertiary text-secondary hover:text-primary'
                }`}
              >
                {preset}x
              </button>
            ))}
          </div>
        </div>

        {/* Warning text */}
        <div className="text-[11px] text-muted leading-relaxed px-1">
          {leverage > 20 && (
            <p className="text-amber-400/90">
              High leverage trading carries substantial risk of liquidation. Manage your position
              size responsibly.
            </p>
          )}
        </div>

        {/* Confirm Button */}
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
    </div>
  );
};
