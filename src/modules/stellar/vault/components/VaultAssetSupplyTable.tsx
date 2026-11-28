import { Check } from 'lucide-react';
import React from 'react';

import type { SingleVaultConfig } from '../config/vault.config';
import type { VaultMetrics } from '../types/vault.types';

interface VaultAssetSupplyTableProps {
  vaults: SingleVaultConfig[];
  selectedVaultId: string;
  onSelectVault: (vaultId: string) => void;
  metrics: Record<string, VaultMetrics>;
  walletBalances: Record<string, string>;
  isConnected: boolean;
}

export const VaultAssetSupplyTable: React.FC<VaultAssetSupplyTableProps> = ({
  vaults,
  selectedVaultId,
  onSelectVault,
  metrics,
  walletBalances,
  isConnected,
}) => {
  return (
    <div className="select-none">
      <div className="p-4 sm:px-6 flex items-center justify-between border-b border-(--color-border) bg-(--color-bg-tertiary)/10">
        <div>
          <h3 className="text-xs font-bold tracking-wider text-brand-primary uppercase">
            Active Yield Market
          </h3>
          <p className="text-[11px] text-(--color-text-muted) mt-0.5">
            Single-asset automated yield compounding on Stellar Soroban
          </p>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-(--color-bg-tertiary) text-(--color-text-secondary) border border-(--color-border)">
          {vaults[0]?.underlyingProtocol || 'Blend Protocol'}
        </span>
      </div>

      <div className="divide-y divide-(--color-border)">
        {vaults.map(vault => {
          const isSelected = vault.id === selectedVaultId;
          const vaultMetric = metrics[vault.id];
          const apyNum = vaultMetric?.realizedApyPercent ?? 0;
          const balance = isConnected ? walletBalances[vault.id] || '0.00' : '--';

          return (
            <div
              key={vault.id}
              onClick={() => onSelectVault(vault.id)}
              className={`p-4 sm:px-6 flex items-center justify-between gap-3 transition-colors cursor-pointer group ${
                isSelected
                  ? 'bg-brand-primary/5 hover:bg-brand-primary/10'
                  : 'hover:bg-(--color-bg-tertiary)/40'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 flex items-center justify-center font-bold text-sm shrink-0 font-mono">
                  {vault.underlyingAsset.symbol === 'EURC' ? '€' : '$'}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-(--color-text-primary) truncate">
                      {vault.underlyingAsset.symbol}
                    </span>
                    <span className="text-[11px] text-(--color-text-muted) font-mono">
                      {vault.underlyingAsset.issuer ? 'circle.com' : 'swiftex.org'}
                    </span>
                  </div>
                  <div className="text-xs text-(--color-text-secondary) truncate">
                    {vault.name} • {vault.strategyName}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 sm:gap-6 shrink-0">
                <div className="text-right hidden sm:block">
                  <div className="text-[10px] text-(--color-text-muted)">Wallet Balance</div>
                  <div className="text-xs font-mono font-semibold text-(--color-text-primary) mt-0.5">
                    {balance} {vault.underlyingAsset.symbol}
                  </div>
                </div>

                <div className="text-right min-w-[54px]">
                  <div className="text-[10px] text-(--color-text-muted)">Current APY</div>
                  <div className="text-xs font-mono font-bold text-emerald-400 mt-0.5">
                    {apyNum.toFixed(2)}%
                  </div>
                </div>

                <div className="min-w-[64px] flex justify-end">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-primary/15 text-brand-primary text-[11px] font-bold border border-brand-primary/30">
                    <Check className="w-3 h-3" />
                    <span>Active</span>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
