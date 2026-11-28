import { ArrowRight, TrendingUp } from 'lucide-react';
import React from 'react';

import type { SingleVaultConfig } from '../config/vault.config';
import type { VaultMetrics } from '../types/vault.types';
import { formatCompactNumber, formatCurrency } from '../utils/vaultFormatters';

interface VaultSupplyCardProps {
  vault: SingleVaultConfig;
  metrics?: VaultMetrics;
  onOpenSupply: () => void;
}

export const VaultSupplyCard: React.FC<VaultSupplyCardProps> = ({
  vault,
  metrics,
  onOpenSupply,
}) => {
  const apy = metrics?.realizedApyPercent ?? 0;

  const totalAssetsNum = metrics ? Number(metrics.totalAssets) / 1e7 : 0;
  const utilization = metrics?.utilizationPercent || 0;
  const vaultYieldUnits =
    metrics && metrics.totalAssets > metrics.totalShares
      ? metrics.totalAssets - metrics.totalShares
      : 0n;
  const vaultYieldNum = Number(vaultYieldUnits) / 1e7;
  const sharePrice = metrics?.sharePrice || 1.0;

  return (
    <div className="bg-(--color-bg-secondary) border border-(--color-border) rounded-2xl p-6 flex flex-col justify-between hover:border-brand-primary/40 transition-all shadow-sm">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-primary shadow-[0_0_8px_var(--color-brand-primary)]" />
            <span className="text-xs font-bold tracking-wider text-brand-primary uppercase">
              Supply Info
            </span>
          </div>
          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
            Auto-Compounding
          </span>
        </div>

        <div>
          <div className="text-xs text-(--color-text-secondary)">Live Net Supply APY</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-extrabold text-emerald-400 font-mono">
              {metrics ? `${apy.toFixed(2)}%` : '--'}
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
        </div>

        <div className="space-y-2.5 pt-3 border-t border-(--color-border) text-xs">
          <div className="flex items-center justify-between">
            <span className="text-(--color-text-secondary)">Total Supplied (TVL)</span>
            <span className="font-semibold text-(--color-text-primary)">
              {totalAssetsNum > 1000
                ? `${formatCompactNumber(totalAssetsNum)} ${vault.underlyingAsset.symbol}`
                : `${formatCurrency(totalAssetsNum)} ${vault.underlyingAsset.symbol}`}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-(--color-text-secondary)">Strategy Utilization</span>
            <span className="font-semibold text-brand-primary">{utilization.toFixed(2)}%</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-(--color-text-secondary)">Vault Yield Earned</span>
            <span className="font-mono font-bold text-emerald-400">
              +{vaultYieldNum.toFixed(6)} {vault.underlyingAsset.symbol}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-(--color-text-secondary)">Share Price</span>
            <span className="font-mono text-(--color-text-primary)">
              1 {vault.symbol} = {sharePrice.toFixed(6)} {vault.underlyingAsset.symbol}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-(--color-text-secondary)">Underlying Protocol</span>
            <span className="font-semibold text-(--color-text-primary)">
              {vault.underlyingProtocol}
            </span>
          </div>
        </div>
      </div>

      <button
        onClick={onOpenSupply}
        className="w-full mt-6 py-3 px-4 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white font-semibold text-sm flex items-center justify-between shadow-md transition-all cursor-pointer group"
      >
        <span>Deposit {vault.underlyingAsset.symbol}</span>
        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </button>
    </div>
  );
};
