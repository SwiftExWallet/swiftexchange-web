import React, { memo } from 'react';

interface StellarShimmerSkeletonProps {
  view?: 'swap' | 'orderbook' | 'assets';
}

export const StellarShimmerSkeleton: React.FC<StellarShimmerSkeletonProps> = memo(
  ({ view = 'swap' }) => {
    return (
      <div className="w-full select-none animate-fade-in">
        <style>{`
          @keyframes stellarShimmerSweep {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
          .shimmer-cell {
            position: relative;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.04);
          }
          .shimmer-cell::after {
            content: '';
            position: absolute;
            inset: 0;
            transform: translateX(-100%);
            background: linear-gradient(
              90deg,
              transparent 0%,
              rgba(255, 255, 255, 0.08) 50%,
              transparent 100%
            );
            animation: stellarShimmerSweep 1.8s infinite ease-in-out;
          }
        `}</style>

        <div className="flex flex-col lg:flex-row gap-2 lg:gap-3 items-start w-full">
          <div className="flex-1 min-w-0 flex flex-col gap-2 w-full">
            <div className="w-full h-[400px] sm:h-[460px] lg:h-[520px] bg-[var(--color-bg-secondary)] rounded-2xl border border-[var(--color-border)]/60 shadow-sm p-4 flex flex-col justify-between overflow-hidden">
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full shimmer-cell" />
                  <div className="space-y-1">
                    <div className="w-24 h-4 rounded-md shimmer-cell" />
                    <div className="w-16 h-2.5 rounded-sm shimmer-cell" />
                  </div>
                  <div className="w-20 h-6 rounded-lg shimmer-cell ml-2" />
                </div>
                <div className="flex items-center gap-1.5">
                  {['1m', '5m', '15m', '1h', '1D'].map((_, idx) => (
                    <div key={idx} className="w-8 h-6 rounded-md shimmer-cell hidden sm:block" />
                  ))}
                  <div className="w-7 h-7 rounded-md shimmer-cell" />
                </div>
              </div>

              <div className="flex-1 flex items-end justify-between px-4 py-8 gap-2 opacity-50">
                {[
                  35, 42, 38, 55, 48, 62, 58, 70, 65, 80, 75, 68, 74, 82, 78, 90, 85, 95, 90, 100,
                  92, 88, 96, 104, 98,
                ].map((height, i) => (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center justify-end h-full gap-1"
                  >
                    <div
                      className="w-1.5 sm:w-2 rounded-t-sm shimmer-cell"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-white/5 text-[10px]">
                {['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'].map((_, i) => (
                  <div key={i} className="w-10 h-3 rounded shimmer-cell" />
                ))}
              </div>
            </div>

            <div className="w-full bg-[var(--color-bg-secondary)] rounded-2xl border border-[var(--color-border)]/60 shadow-sm p-4 min-h-[300px] flex flex-col">
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <div className="w-36 h-5 rounded-md shimmer-cell" />
                </div>
                <div className="flex gap-1 bg-white/5 p-0.5 rounded-xl border border-white/5">
                  <div className="w-16 h-7 rounded-lg shimmer-cell opacity-50" />
                  <div className="w-20 h-7 rounded-lg shimmer-cell" />
                </div>
              </div>

              <div className="grid grid-cols-5 text-[11px] py-2 px-2 border-b border-white/5 gap-2">
                <div className="w-12 h-3 rounded shimmer-cell" />
                <div className="w-14 h-3 rounded shimmer-cell" />
                <div className="w-14 h-3 rounded shimmer-cell" />
                <div className="w-16 h-3 rounded shimmer-cell" />
                <div className="w-12 h-3 rounded shimmer-cell ml-auto" />
              </div>

              <div className="space-y-3 py-3">
                {[1, 2, 3, 4].map(idx => (
                  <div
                    key={idx}
                    className="grid grid-cols-5 items-center py-2 px-2 rounded-xl bg-white/[0.015] border border-white/[0.03] gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full shimmer-cell shrink-0" />
                      <div className="w-16 h-3.5 rounded shimmer-cell" />
                    </div>
                    <div className="w-20 h-3.5 rounded shimmer-cell" />
                    <div className="w-16 h-3.5 rounded shimmer-cell" />
                    <div className="w-24 h-3 rounded shimmer-cell" />
                    <div className="w-8 h-4 rounded shimmer-cell ml-auto" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="w-full lg:w-[400px] xl:w-[440px] shrink-0 flex flex-col gap-2">
            <div className="w-full bg-[var(--color-bg-secondary)] p-4 sm:p-5 rounded-2xl border border-[var(--color-border)]/60 shadow-sm space-y-5">
              <div className="flex items-center justify-between">
                <div className="w-20 h-6 rounded-lg shimmer-cell" />
                <div className="flex items-center gap-2">
                  {view === 'orderbook' ? (
                    <div className="flex gap-1 bg-white/5 p-0.5 rounded-lg">
                      <div className="w-9 h-5 rounded shimmer-cell" />
                      <div className="w-9 h-5 rounded shimmer-cell" />
                    </div>
                  ) : (
                    <div className="w-28 h-6 rounded-full shimmer-cell" />
                  )}
                  <div className="w-7 h-7 rounded-lg shimmer-cell" />
                  <div className="w-7 h-7 rounded-lg shimmer-cell" />
                </div>
              </div>

              {view === 'orderbook' && (
                <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
                  <div className="flex-1 h-9 rounded-lg shimmer-cell" />
                  <div className="flex-1 h-9 rounded-lg shimmer-cell" />
                </div>
              )}

              <div className="bg-[var(--color-bg-tertiary)]/50 rounded-2xl p-4 border border-white/5 space-y-3">
                <div className="flex justify-between items-center">
                  <div className="w-16 h-3 rounded shimmer-cell" />
                  <div className="w-12 h-5 rounded-full shimmer-cell" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="w-36 h-12 rounded-2xl shimmer-cell shrink-0" />
                  <div className="w-28 h-8 rounded-lg shimmer-cell ml-auto" />
                </div>
                <div className="pt-2 border-t border-white/5 flex justify-between items-center">
                  <div className="w-32 h-3 rounded shimmer-cell" />
                  <div className="w-5 h-5 rounded-full shimmer-cell" />
                </div>
              </div>

              <div className="flex justify-center -my-2 relative z-10">
                <div className="w-10 h-10 rounded-full shimmer-cell border-4 border-[var(--color-bg-secondary)] shadow-md" />
              </div>

              <div className="bg-[var(--color-bg-tertiary)]/50 rounded-2xl p-4 border border-white/5 space-y-3">
                <div className="flex justify-between items-center">
                  <div className="w-20 h-3 rounded shimmer-cell" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="w-36 h-12 rounded-2xl shimmer-cell shrink-0" />
                  <div className="w-28 h-8 rounded-lg shimmer-cell ml-auto" />
                </div>
                <div className="pt-2 border-t border-white/5 flex justify-between items-center">
                  <div className="w-32 h-3 rounded shimmer-cell" />
                  <div className="w-5 h-5 rounded-full shimmer-cell" />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
                <div className="flex justify-between">
                  <div className="w-20 h-3 rounded shimmer-cell" />
                  <div className="w-28 h-3 rounded shimmer-cell" />
                </div>
                <div className="flex justify-between">
                  <div className="w-16 h-3 rounded shimmer-cell" />
                  <div className="w-16 h-3 rounded shimmer-cell" />
                </div>
              </div>

              <div className="w-full h-14 rounded-2xl shimmer-cell bg-brand/20 border border-brand/20" />
            </div>

            <div className="w-full bg-[var(--color-bg-secondary)] rounded-2xl border border-[var(--color-border)]/60 shadow-sm p-4 text-xs select-none space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-white/5">
                <div className="flex items-center gap-1.5">
                  <div className="w-3.5 h-3.5 rounded shimmer-cell" />
                  <div className="w-24 h-3.5 rounded shimmer-cell" />
                </div>
                <div className="w-20 h-4 rounded shimmer-cell" />
              </div>
              <div className="flex justify-between items-center">
                <div className="w-28 h-3 rounded shimmer-cell" />
                <div className="w-24 h-3.5 rounded shimmer-cell" />
              </div>
              <div className="flex justify-between items-center">
                <div className="w-24 h-3 rounded shimmer-cell" />
                <div className="w-24 h-3.5 rounded shimmer-cell" />
              </div>
              <div className="flex justify-between items-center">
                <div className="w-24 h-3 rounded shimmer-cell" />
                <div className="w-16 h-3 rounded shimmer-cell" />
              </div>
              <div className="flex justify-between items-center">
                <div className="w-32 h-3 rounded shimmer-cell" />
                <div className="w-16 h-3 rounded shimmer-cell" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

export default StellarShimmerSkeleton;
