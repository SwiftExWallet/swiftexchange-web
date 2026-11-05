import { memo, useEffect, useState } from 'react';

export type ScaleMode = 'normal' | 'logarithmic' | 'percentage';

export interface ChartScaleControlsProps {
  scaleMode: ScaleMode;
  onScaleModeChange: (mode: ScaleMode) => void;
  isMobile?: boolean;
}

export const ChartScaleControls = memo(function ChartScaleControls({
  scaleMode,
  onScaleModeChange,
  isMobile,
}: ChartScaleControlsProps) {
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getUTCHours()).padStart(2, '0');
      const minutes = String(now.getUTCMinutes()).padStart(2, '0');
      const seconds = String(now.getUTCSeconds()).padStart(2, '0');
      setTimeStr(`${hours}:${minutes}:${seconds} UTC`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute bottom-2 right-[68px] z-20 flex items-center gap-2.5 text-[10px] select-none pointer-events-auto font-mono text-gray-400">
      {/* Live UTC Time Clock (like Aster DEX) */}
      {!isMobile && timeStr && (
        <span className="opacity-75 tracking-tight hidden md:inline-block">{timeStr}</span>
      )}

      {/* Scale Mode Selectors: % | log | auto */}
      <div className="flex items-center gap-1 bg-secondary/80 backdrop-blur-sm border border-color/60 rounded px-1.5 py-0.5 shadow-sm">
        <button
          type="button"
          onClick={() => onScaleModeChange('percentage')}
          className={`px-1 py-0.2 rounded transition-colors cursor-pointer ${
            scaleMode === 'percentage'
              ? 'text-brand font-bold bg-brand/15'
              : 'text-gray-400 hover:text-primary'
          }`}
          title="Percentage Scale Mode"
        >
          %
        </button>

        <span className="text-gray-600 opacity-40">|</span>

        <button
          type="button"
          onClick={() => onScaleModeChange('logarithmic')}
          className={`px-1 py-0.2 rounded transition-colors cursor-pointer ${
            scaleMode === 'logarithmic'
              ? 'text-brand font-bold bg-brand/15'
              : 'text-gray-400 hover:text-primary'
          }`}
          title="Logarithmic Scale Mode"
        >
          log
        </button>

        <span className="text-gray-600 opacity-40">|</span>

        <button
          type="button"
          onClick={() => onScaleModeChange('normal')}
          className={`px-1 py-0.2 rounded transition-colors cursor-pointer ${
            scaleMode === 'normal'
              ? 'text-brand font-bold bg-brand/15'
              : 'text-gray-400 hover:text-primary'
          }`}
          title="Auto / Linear Scale Mode"
        >
          auto
        </button>
      </div>
    </div>
  );
});
