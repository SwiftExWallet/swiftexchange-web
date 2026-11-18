import {
  AlertTriangle,
  ChevronDown,
  Coins,
  Flame,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import React, { useState } from 'react';

import PageLayout from '@/components/layout/PageLayout';
import { useWalletConnect } from '@/modules/walletconnect/hooks/useWalletConnect';

import { VaultActionConsole } from './components/VaultActionConsole';
import { VaultActivitySection } from './components/VaultActivitySection';
import { VaultAssetSupplyTable } from './components/VaultAssetSupplyTable';
import { VaultRateModel } from './components/VaultRateModel';
import { useVaultData } from './hook/useVaultData';
import { formatCompactNumber } from './utils/vaultFormatters';

export const VaultPage: React.FC = () => {
  const {
    network,
    stellarAddress,
    vaultConfigs,
    metrics,
    positions,
    walletBalances,
    isLoading,
    error,
    refreshData,
  } = useVaultData();

  const { openModal } = useWalletConnect();

  const [selectedVaultId, setSelectedVaultId] = useState<string>(
    vaultConfigs[0]?.id || 'swiftex-usdc-vault'
  );

  const [actionTab, setActionTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [prefilledAmount, setPrefilledAmount] = useState<string | undefined>(undefined);

  const selectedVault = vaultConfigs.find(v => v.id === selectedVaultId) || vaultConfigs[0];

  const currentMetrics = selectedVault ? metrics[selectedVault.id] : undefined;
  const currentPosition = selectedVault ? positions[selectedVault.id] : undefined;

  const apy =
    currentMetrics?.realizedApyPercent && currentMetrics.realizedApyPercent > 0
      ? currentMetrics.realizedApyPercent
      : selectedVault?.targetApyPercent || 0;

  const totalAssetsNum = currentMetrics ? Number(currentMetrics.totalAssets) / 1e7 : 0;
  const selectedVaultTvlUsd =
    totalAssetsNum * (selectedVault?.underlyingAsset?.oraclePriceUsd || 1);
  const utilization = currentMetrics?.utilizationPercent || 0;
  const hasDeposit = currentPosition && currentPosition.shares > 0n;
  const hasYield = Boolean(currentPosition && currentPosition.accruedYield > 0n);

  const positionValueNum = currentPosition
    ? parseFloat(currentPosition.formatted.underlying || '0')
    : 0;
  const principalNum = currentPosition ? parseFloat(currentPosition.formatted.deposited || '0') : 0;
  const pnlUsdc = positionValueNum - principalNum;
  const pnlPct = principalNum > 0 ? (pnlUsdc / principalNum) * 100 : 0;
  const estimatedMonthly = hasDeposit ? (positionValueNum * (apy / 100)) / 12 : 0;
  const estimatedQuarterly = hasDeposit ? (positionValueNum * (apy / 100)) / 4 : 0;

  const handleHarvestClick = () => {
    if (currentPosition?.formatted?.yield) {
      const cleanYield = currentPosition.formatted.yield.replace('+', '').trim();
      setActionTab('withdraw');
      setPrefilledAmount(cleanYield);
    }
  };

  const statCells = [
    {
      title: 'Total Value Locked',
      value: `${totalAssetsNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${selectedVault.underlyingAsset.symbol}`,
      subtext: `≈ $${selectedVaultTvlUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`,
      icon: <Coins size={18} className="text-brand-primary" />,
      highlight: false,
    },
    {
      title: 'Your Deposited Principal',
      value: `${currentPosition?.formatted?.deposited || '0.00'} ${selectedVault.underlyingAsset.symbol}`,
      subtext: stellarAddress ? 'Current position holdings' : 'Connect Stellar wallet',
      icon: <Wallet size={18} className="text-purple-400" />,
      highlight: false,
    },
    {
      title: 'Accrued Yield',
      value: `${currentPosition?.formatted?.yield || '+0.00'} ${selectedVault.underlyingAsset.symbol}`,
      subtext: 'Auto-compounded on-chain',
      icon: <Sparkles size={18} className="text-emerald-400" />,
      highlight: hasYield,
    },
    {
      title: 'Security Architecture',
      value: 'Non-Custodial',
      subtext: 'Immutable • Upgrades Disabled',
      icon: <ShieldCheck size={18} className="text-cyan-400" />,
      highlight: false,
    },
  ];

  return (
    <PageLayout
      title="Earn"
      subtitle="Automated, non-custodial yield vault with fixed strategy allocation on Stellar Soroban"
      maxWidth="7xl"
      isBeta
      headerActions={
        <div className="flex items-center gap-2.5">
          <div className="relative max-w-[210px] sm:max-w-none">
            <select
              value={selectedVaultId}
              onChange={e => setSelectedVaultId(e.target.value)}
              className="appearance-none bg-(--color-bg-tertiary) hover:bg-(--color-bg-hover) text-(--color-text-primary) border border-(--color-border) rounded-xl px-3.5 py-1.5 pr-8 text-xs font-semibold cursor-pointer outline-none transition-colors truncate max-w-[200px] sm:max-w-none"
            >
              {vaultConfigs.map(v => {
                const vaultApy =
                  metrics[v.id]?.realizedApyPercent && metrics[v.id].realizedApyPercent > 0
                    ? metrics[v.id].realizedApyPercent
                    : v.targetApyPercent;
                return (
                  <option
                    key={v.id}
                    value={v.id}
                    className="bg-(--color-bg-secondary) text-(--color-text-primary)"
                  >
                    {v.name} ({v.symbol}) • {vaultApy.toFixed(2)}% APY
                  </option>
                );
              })}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-(--color-text-secondary) absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            onClick={refreshData}
            disabled={isLoading}
            className="p-1.5 rounded-xl bg-(--color-bg-tertiary) hover:bg-(--color-bg-hover) text-(--color-text-secondary) hover:text-(--color-text-primary) transition border border-(--color-border) cursor-pointer"
            title="Refresh On-Chain Data"
          >
            <RefreshCw
              className={`w-4 h-4 ${isLoading ? 'animate-spin text-brand-primary' : ''}`}
            />
          </button>
        </div>
      }
    >
      <div className="p-0 sm:p-6">
        <div className="border-y sm:border border-(--color-border) rounded-none sm:rounded-2xl overflow-hidden bg-(--color-bg-secondary) shadow-sm divide-y divide-(--color-border)">
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-(--color-border)">
            {statCells.map(c => (
              <div key={c.title} className="p-3.5 sm:p-5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] sm:text-xs font-semibold text-(--color-text-secondary) truncate mr-1">
                    {c.title}
                  </span>
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-(--color-bg-tertiary) border border-(--color-border) flex items-center justify-center shrink-0">
                    {c.icon}
                  </div>
                </div>
                <div className="space-y-0.5 sm:space-y-1 mt-2 sm:mt-3">
                  {isLoading && !currentMetrics ? (
                    <div className="space-y-2 py-0.5">
                      <div className="h-6 sm:h-7 w-28 bg-(--color-bg-tertiary) rounded-md animate-pulse" />
                      <div className="h-3 w-36 bg-(--color-bg-tertiary)/60 rounded animate-pulse" />
                    </div>
                  ) : (
                    <>
                      <h3
                        className={`text-lg sm:text-2xl font-black font-mono tracking-tight truncate ${
                          c.highlight ? 'text-emerald-400' : 'text-(--color-text-primary)'
                        }`}
                      >
                        {c.value}
                      </h3>
                      <p className="text-[10px] sm:text-[11px] text-(--color-text-muted) truncate">
                        {c.subtext}
                      </p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 bg-(--color-bg-tertiary)/20 text-xs text-(--color-text-secondary)">
            <div className="flex items-center gap-2">
              <span className="font-bold text-(--color-text-primary)">{selectedVault.name}</span>
              <span>•</span>
              <span>{selectedVault.strategyName}</span>
            </div>
            <div>
              Oracle Price:{' '}
              <span className="font-mono font-bold text-(--color-text-primary)">
                ${selectedVault.underlyingAsset.oraclePriceUsd.toFixed(2)}
              </span>
            </div>
          </div>

          {error && Object.keys(metrics).length === 0 ? (
            <div className="p-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="max-w-md mx-auto space-y-1.5">
                <h3 className="text-sm font-bold text-(--color-text-primary)">
                  Soroban RPC Sync Issue
                </h3>
                <p className="text-xs text-(--color-text-secondary)">
                  {error || 'Unable to establish live connection with Stellar Soroban RPC.'}
                </p>
              </div>
              <button
                type="button"
                onClick={refreshData}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-bold transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Connection</span>
              </button>
            </div>
          ) : isLoading && Object.keys(metrics).length === 0 ? (
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-pulse">
                <div className="space-y-4">
                  <div className="h-6 w-48 bg-(--color-bg-tertiary) rounded-lg" />
                  <div className="h-10 w-32 bg-(--color-bg-tertiary) rounded-lg" />
                  <div className="h-44 bg-(--color-bg-tertiary) rounded-xl" />
                </div>
                <div className="space-y-4">
                  <div className="h-6 w-36 bg-(--color-bg-tertiary) rounded-lg" />
                  <div className="h-10 w-28 bg-(--color-bg-tertiary) rounded-lg" />
                  <div className="h-44 bg-(--color-bg-tertiary) rounded-xl" />
                </div>
              </div>
              <div className="flex items-center justify-center gap-2 text-xs font-mono text-(--color-text-muted) pt-4 border-t border-(--color-border)">
                <Loader2 className="w-4 h-4 animate-spin text-brand-primary" />
                <span>Fetching Soroban contract states from Stellar Testnet...</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-(--color-border)">
              <div className="divide-y divide-(--color-border)">
                <div className="p-4 sm:p-6 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold tracking-wider text-brand-primary uppercase">
                      Supply & Yield Intelligence
                    </h3>
                  </div>

                  <div>
                    <div className="text-xs text-(--color-text-secondary) flex items-center gap-1.5">
                      <span>Current APY</span>
                      <Flame className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
                    </div>
                    <div className="flex items-baseline gap-2 mt-1">
                      {isLoading && !currentMetrics ? (
                        <div className="h-8 w-24 bg-(--color-bg-tertiary) rounded-md animate-pulse" />
                      ) : (
                        <>
                          <span className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono">
                            {apy.toFixed(2)}%
                          </span>
                          <TrendingUp className="w-4 h-4 text-emerald-400" />
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 divide-x divide-(--color-border) bg-(--color-bg-tertiary)/15">
                  <div className="p-3.5 sm:p-4 sm:px-6">
                    <div className="text-[11px] text-(--color-text-secondary)">Total TVL</div>
                    {isLoading && !currentMetrics ? (
                      <div className="h-4 w-20 bg-(--color-bg-tertiary) rounded animate-pulse mt-1" />
                    ) : (
                      <div className="text-xs font-bold text-(--color-text-primary) font-mono mt-0.5 truncate">
                        {totalAssetsNum > 1000
                          ? `${formatCompactNumber(totalAssetsNum)} ${selectedVault.underlyingAsset.symbol}`
                          : `${totalAssetsNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${selectedVault.underlyingAsset.symbol}`}
                      </div>
                    )}
                  </div>

                  <div className="p-3.5 sm:p-4 sm:px-6 flex items-center justify-between">
                    <div>
                      <div className="text-[11px] text-(--color-text-secondary)">Utilization</div>
                      {isLoading && !currentMetrics ? (
                        <div className="h-4 w-14 bg-(--color-bg-tertiary) rounded animate-pulse mt-1" />
                      ) : (
                        <div className="text-xs font-bold text-brand-primary font-mono mt-0.5">
                          {utilization.toFixed(2)}%
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-(--color-bg-tertiary) text-(--color-text-secondary) border border-(--color-border)">
                      {selectedVault.underlyingProtocol}
                    </span>
                  </div>
                </div>

                <div>
                  <VaultRateModel
                    data={currentMetrics?.interestRateModel}
                    utilizationPercent={currentMetrics?.utilizationPercent ?? 0}
                    currentApr={apy}
                    baseApr={currentMetrics?.interestRateModel?.baseApr ?? 2.5}
                    targetUtil={currentMetrics?.interestRateModel?.targetUtilization ?? 80.0}
                    maxUtil={currentMetrics?.interestRateModel?.maxUtilization ?? 90.0}
                  />
                </div>

                <VaultAssetSupplyTable
                  vaults={vaultConfigs}
                  selectedVaultId={selectedVaultId}
                  onSelectVault={setSelectedVaultId}
                  metrics={metrics}
                  walletBalances={walletBalances}
                  isConnected={Boolean(stellarAddress)}
                />
              </div>

              <div className="divide-y divide-(--color-border)">
                <div className="p-4 sm:p-6 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold tracking-wider text-purple-400 uppercase">
                      Your Position
                    </h3>
                    {hasDeposit && (
                      <span className="text-xs font-mono font-semibold text-brand-primary">
                        Pool Share: {currentPosition.poolSharePercentage.toFixed(2)}%
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="text-xs text-(--color-text-secondary)">
                      Current Position Value
                    </div>
                    <div className="flex flex-wrap items-baseline gap-2.5 mt-1">
                      {isLoading && !currentPosition && Boolean(stellarAddress) ? (
                        <div className="h-8 w-28 bg-(--color-bg-tertiary) rounded-md animate-pulse" />
                      ) : (
                        <>
                          <div className="text-2xl sm:text-3xl font-extrabold text-(--color-text-primary) font-mono truncate">
                            {currentPosition?.formatted?.underlying || '0.00'}{' '}
                            <span className="text-sm font-normal text-(--color-text-secondary)">
                              {selectedVault.underlyingAsset.symbol}
                            </span>
                          </div>
                          {hasDeposit && (
                            <div className="flex items-center gap-1.5 font-mono text-xs">
                              <span className="text-(--color-text-muted)">
                                ≈ ${positionValueNum.toFixed(2)}
                              </span>
                              {pnlUsdc !== 0 && (
                                <span
                                  className={`font-semibold ${
                                    pnlUsdc >= 0 ? 'text-emerald-400' : 'text-red-400'
                                  }`}
                                >
                                  ({pnlUsdc >= 0 ? '+' : ''}
                                  {pnlPct.toFixed(2)}%)
                                </span>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 divide-x divide-(--color-border) bg-(--color-bg-tertiary)/15">
                  <div className="p-3.5 sm:p-4 sm:px-6">
                    <div className="text-[11px] text-(--color-text-secondary)">Principal</div>
                    <div className="text-xs font-bold text-(--color-text-primary) font-mono mt-0.5 truncate">
                      {currentPosition?.formatted?.deposited || '0.00'}{' '}
                      {selectedVault.underlyingAsset.symbol}
                    </div>
                  </div>

                  <div className="p-3.5 sm:p-4 sm:px-6 flex items-center justify-between">
                    <div>
                      <div className="text-[11px] text-(--color-text-secondary)">Accrued Yield</div>
                      <div className="text-xs font-bold text-emerald-400 font-mono mt-0.5 truncate">
                        {currentPosition?.formatted?.yield || '+0.00'}{' '}
                        {selectedVault.underlyingAsset.symbol}
                      </div>
                    </div>
                    {hasYield && (
                      <button
                        type="button"
                        onClick={handleHarvestClick}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-colors cursor-pointer"
                        title="Withdraw accrued profit only"
                      >
                        Harvest
                      </button>
                    )}
                  </div>
                </div>

                {hasDeposit && (
                  <div className="px-4 sm:px-6 py-2.5 bg-(--color-bg-tertiary)/25 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                    <div className="flex items-center gap-1.5 text-(--color-text-secondary) text-[11px] font-sans">
                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                      <span>Est. Yield ({apy.toFixed(2)}% APY):</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <div>
                        <span className="text-(--color-text-muted) text-[10px] mr-1">1M</span>
                        <span className="font-bold text-emerald-400">
                          ~+{estimatedMonthly.toFixed(2)} USDC
                        </span>
                      </div>
                      <span className="text-(--color-border)">•</span>
                      <div>
                        <span className="text-(--color-text-muted) text-[10px] mr-1">3M</span>
                        <span className="font-bold text-emerald-400">
                          ~+{estimatedQuarterly.toFixed(2)} USDC
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                <div className="p-4 sm:p-6">
                  <VaultActionConsole
                    vault={selectedVault}
                    position={currentPosition}
                    userAddress={stellarAddress}
                    network={network}
                    onSuccess={refreshData}
                    onOpenConnectModal={openModal}
                    externalTab={actionTab}
                    prefilledAmount={prefilledAmount}
                    apy={apy}
                  />
                </div>
              </div>
            </div>
          )}

          <VaultActivitySection
            vault={selectedVault}
            userAddress={stellarAddress}
            network={network}
            onOpenConnectModal={openModal}
          />
        </div>
      </div>
    </PageLayout>
  );
};

export default VaultPage;
