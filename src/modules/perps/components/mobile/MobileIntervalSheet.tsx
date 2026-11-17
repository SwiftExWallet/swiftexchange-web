import { X } from 'lucide-react';
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface MobileIntervalSheetProps {
  isOpen: boolean;
  onClose: () => void;
  selectedInterval: string;
  onSelectInterval: (interval: string) => void;
}

const INTERVAL_GROUPS = [
  {
    title: 'Minutes',
    intervals: [
      { label: '1m', value: '1m' },
      { label: '5m', value: '5m' },
      { label: '15m', value: '15m' },
      { label: '30m', value: '30m' },
    ],
  },
  {
    title: 'Hours',
    intervals: [
      { label: '1h', value: '1h' },
      { label: '2h', value: '2h' },
      { label: '4h', value: '4h' },
      { label: '6h', value: '6h' },
      { label: '12h', value: '12h' },
    ],
  },
  {
    title: 'Days',
    intervals: [
      { label: '1D', value: '1D' },
      { label: '3D', value: '3D' },
      { label: '1W', value: '1W' },
      { label: '1M', value: '1M' },
    ],
  },
];

export const MobileIntervalSheet: React.FC<MobileIntervalSheetProps> = ({
  isOpen,
  onClose,
  selectedInterval,
  onSelectInterval,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

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
          <h3 className="text-base font-semibold text-primary">Candle intervals</h3>
          <button
            onClick={onClose}
            className="text-secondary hover:text-primary transition-colors p-1 rounded-full hover:bg-tertiary"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {INTERVAL_GROUPS.map(group => (
            <div key={group.title} className="flex flex-col gap-2">
              <span className="text-xs text-secondary font-medium tracking-wide">
                {group.title}
              </span>
              <div className="grid grid-cols-4 gap-2">
                {group.intervals.map(item => {
                  const isSelected = selectedInterval === item.value;
                  return (
                    <button
                      key={item.value}
                      onClick={() => {
                        onSelectInterval(item.value);
                        onClose();
                      }}
                      className={`py-2 px-3 rounded-xl text-xs font-mono font-medium transition-all text-center ${
                        isSelected
                          ? 'bg-brand/20 text-brand border border-brand/50 font-semibold shadow-sm'
                          : 'bg-tertiary text-secondary hover:text-primary hover:bg-hover'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};
