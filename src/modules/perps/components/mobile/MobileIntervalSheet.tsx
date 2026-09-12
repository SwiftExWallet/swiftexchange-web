import { X } from 'lucide-react';
import React, { useEffect } from 'react';

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
      { label: '1H', value: '1h' },
      { label: '4H', value: '4h' },
      { label: '8H', value: '8h' },
      { label: '12H', value: '12h' },
    ],
  },
  {
    title: 'Days and beyond',
    intervals: [
      { label: '1D', value: '1d' },
      { label: '3D', value: '3d' },
      { label: '1W', value: '1w' },
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-secondary border-t border-color rounded-t-3xl p-5 shadow-2xl flex flex-col gap-5 pb-8 animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="w-10 h-1 bg-border-color rounded-full self-center" />

        {/* Title */}
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-primary">Candle intervals</h3>
          <button
            onClick={onClose}
            className="text-secondary hover:text-primary transition-colors p-1 rounded-full hover:bg-tertiary"
          >
            <X size={18} />
          </button>
        </div>

        {/* Groups */}
        <div className="space-y-4">
          {INTERVAL_GROUPS.map(group => (
            <div key={group.title} className="space-y-2">
              <span className="text-xs font-medium text-secondary">{group.title}</span>
              <div className="grid grid-cols-4 gap-2">
                {group.intervals.map(item => {
                  const isSelected =
                    selectedInterval.toLowerCase() === item.value.toLowerCase() ||
                    (item.value === '1M' && selectedInterval === '1M');

                  return (
                    <button
                      key={item.value}
                      onClick={() => {
                        onSelectInterval(item.value);
                        onClose();
                      }}
                      className={`h-11 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center justify-center ${
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
    </div>
  );
};
