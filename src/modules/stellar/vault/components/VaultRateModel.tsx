import React from 'react';

import type { InterestRateModelData } from '../types/vault.types';

interface VaultRateModelProps {
  data?: Partial<InterestRateModelData>;
  utilizationPercent?: number;
  currentApr?: number;
  baseApr?: number;
  targetUtil?: number;
  maxUtil?: number;
}

export const VaultRateModel: React.FC<VaultRateModelProps> = ({
  data,
  utilizationPercent = 0,
  currentApr = 0,
  baseApr = 2.5,
  targetUtil = 80.0,
  maxUtil = 90.0,
}) => {
  const currentUtil = data?.currentUtilization ?? utilizationPercent;
  const targetU = data?.targetUtilization ?? targetUtil;
  const maxU = data?.maxUtilization ?? maxUtil;
  const effectiveApr = data?.currentApr ?? currentApr;
  const effectiveBaseApr = data?.baseApr ?? baseApr;
  const maxApr = 25.0;

  const clampUtil = Math.max(0, Math.min(100, currentUtil));

  const xMin = 28;
  const xMax = 454;
  const yMin = 18;
  const yMax = 135;
  const chartWidth = xMax - xMin;
  const chartHeight = yMax - yMin;

  const kinkX = xMin + (targetU / 100) * chartWidth;
  const y0 = yMax - (effectiveBaseApr / maxApr) * chartHeight;
  const yKink = yMax - (effectiveApr / maxApr) * chartHeight;

  let currentY = y0;
  if (clampUtil <= targetU) {
    const ratio = clampUtil / targetU;
    currentY = y0 - ratio * (y0 - yKink);
  } else {
    const ratio = (clampUtil - targetU) / (100 - targetU);
    currentY = yKink - ratio * (yKink - yMin);
  }
  const currentX = xMin + (clampUtil / 100) * chartWidth;

  const curvePath = `M ${xMin},${y0.toFixed(1)} L ${kinkX.toFixed(1)},${yKink.toFixed(1)} L ${xMax},${yMin.toFixed(1)}`;
  const areaPath = `M ${xMin},${yMax} L ${xMin},${y0.toFixed(1)} L ${kinkX.toFixed(1)},${yKink.toFixed(1)} L ${xMax},${yMin.toFixed(1)} L ${xMax},${yMax} Z`;

  return (
    <div className="select-none divide-y divide-(--color-border)">
      <div className="p-5 sm:p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xs font-bold tracking-wider text-brand-primary uppercase">
            Interest Rate & Utilization Model
          </h3>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              <span className="text-(--color-text-secondary)">
                Current ({effectiveApr.toFixed(2)}%)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-(--color-text-muted) inline-block" />
              <span className="text-(--color-text-secondary)">
                Base ({effectiveBaseApr.toFixed(2)}%)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-brand-primary inline-block" />
              <span className="text-(--color-text-secondary)">Util ({clampUtil.toFixed(1)}%)</span>
            </div>
          </div>
        </div>

        <div className="w-full h-44 relative -ml-1">
          <svg
            viewBox="0 0 460 155"
            preserveAspectRatio="none"
            className="w-full h-full overflow-visible"
          >
            <defs>
              <linearGradient id="rateGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand-primary)" stopOpacity="0.25" />
                <stop offset="100%" stopColor="var(--color-brand-primary)" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            <line
              x1={xMin}
              y1={yMin}
              x2={xMax}
              y2={yMin}
              stroke="currentColor"
              className="text-(--color-border)"
              strokeDasharray="3,3"
              opacity="0.5"
            />
            <line
              x1={xMin}
              y1={yMin + chartHeight * 0.33}
              x2={xMax}
              y2={yMin + chartHeight * 0.33}
              stroke="currentColor"
              className="text-(--color-border)"
              strokeDasharray="3,3"
              opacity="0.5"
            />
            <line
              x1={xMin}
              y1={yMin + chartHeight * 0.66}
              x2={xMax}
              y2={yMin + chartHeight * 0.66}
              stroke="currentColor"
              className="text-(--color-border)"
              strokeDasharray="3,3"
              opacity="0.5"
            />
            <line
              x1={xMin}
              y1={yMax}
              x2={xMax}
              y2={yMax}
              stroke="currentColor"
              className="text-(--color-border)"
            />
            <line
              x1={xMin}
              y1={yMin}
              x2={xMin}
              y2={yMax}
              stroke="currentColor"
              className="text-(--color-border)"
              opacity="0.5"
            />

            <text
              x="22"
              y={yMin + 3}
              fill="var(--color-text-muted)"
              fontSize="8"
              fontFamily="monospace"
              textAnchor="end"
            >
              25%
            </text>
            <text
              x="22"
              y={yMin + chartHeight * 0.33 + 3}
              fill="var(--color-text-muted)"
              fontSize="8"
              fontFamily="monospace"
              textAnchor="end"
            >
              16%
            </text>
            <text
              x="22"
              y={yMin + chartHeight * 0.66 + 3}
              fill="var(--color-text-muted)"
              fontSize="8"
              fontFamily="monospace"
              textAnchor="end"
            >
              8%
            </text>
            <text
              x="22"
              y={yMax + 3}
              fill="var(--color-text-muted)"
              fontSize="8"
              fontFamily="monospace"
              textAnchor="end"
            >
              0%
            </text>

            <text
              x={xMin}
              y={yMax + 14}
              fill="var(--color-text-muted)"
              fontSize="8"
              fontFamily="monospace"
              textAnchor="start"
            >
              0%
            </text>
            <text
              x={xMin + chartWidth * 0.25}
              y={yMax + 14}
              fill="var(--color-text-muted)"
              fontSize="8"
              fontFamily="monospace"
              textAnchor="middle"
            >
              25%
            </text>
            <text
              x={xMin + chartWidth * 0.5}
              y={yMax + 14}
              fill="var(--color-text-muted)"
              fontSize="8"
              fontFamily="monospace"
              textAnchor="middle"
            >
              50%
            </text>
            <text
              x={xMin + chartWidth * 0.75}
              y={yMax + 14}
              fill="var(--color-text-muted)"
              fontSize="8"
              fontFamily="monospace"
              textAnchor="middle"
            >
              75%
            </text>
            <text
              x={xMax}
              y={yMax + 14}
              fill="var(--color-text-muted)"
              fontSize="8"
              fontFamily="monospace"
              textAnchor="end"
            >
              100%
            </text>

            <path d={areaPath} fill="url(#rateGradient)" />

            <path
              d={curvePath}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            <line
              x1={currentX}
              y1={yMin}
              x2={currentX}
              y2={yMax}
              stroke="var(--color-brand-primary)"
              strokeWidth="1.5"
              strokeDasharray="4,4"
              opacity="0.8"
            />

            <circle
              cx={currentX}
              cy={currentY}
              r="5.5"
              fill="var(--color-brand-primary)"
              stroke="var(--color-bg-secondary)"
              strokeWidth="2"
              className="drop-shadow-[0_0_8px_var(--color-brand-primary)]"
            />
          </svg>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-(--color-border) bg-(--color-bg-tertiary)/20">
        <div className="p-4 sm:px-6">
          <div className="text-[11px] text-(--color-text-secondary)">Current Util</div>
          <div className="text-sm font-bold text-brand-primary font-mono mt-0.5">
            {clampUtil.toFixed(2)}%
          </div>
        </div>

        <div className="p-4 sm:px-6 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-(--color-text-secondary)">Target Util</div>
            <div className="text-sm font-bold text-(--color-text-primary) font-mono mt-0.5">
              {targetU.toFixed(2)}%
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-(--color-text-muted)">Max Util</div>
            <div className="text-xs font-mono font-bold text-(--color-text-secondary)">
              {maxU.toFixed(2)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
