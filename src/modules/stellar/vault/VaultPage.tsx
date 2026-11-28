import {
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import React, { useState } from 'react';

import PageLayout from '@/components/layout/PageLayout';
import { getChainById } from '@/modules/evm/utils/Chainregistry';
import { useWalletConnect } from '@/modules/walletconnect/hooks/useWalletConnect';

import { VaultActionConsole } from './components/VaultActionConsole';
import { VaultActivitySection } from './components/VaultActivitySection';
import { VaultRateModel } from './components/VaultRateModel';
import { getVaultEnvironment } from './config/vault.config';
import { useVaultData } from './hook/useVaultData';
import type { VaultActionMode } from './types/vault.types';
import { formatCompactNumber } from './utils/vaultFormatters';

export const VaultPage: React.FC = () => {
  const { connectedWallets, openModal } = useWalletConnect();
  const stellarAddress = connectedWallets.stellar?.address || '';

  const { network, vaultConfigs, metrics, positions, isLoading, error, refreshData } =
    useVaultData();

  const [selectedVaultId, setSelectedVaultId] = useState<string>(
    vaultConfigs[0]?.id || 'swiftex-usdc-vault'
  );
  const [actionTab, setActionTab] = useState<VaultActionMode>('deposit');
  const [prefilledAmount, setPrefilledAmount] = useState<string | undefined>(undefined);
  const [showAnalytics, setShowAnalytics] = useState<boolean>(false);

  const selectedVault = vaultConfigs.find(v => v.id === selectedVaultId) || vaultConfigs[0];
  const env = getVaultEnvironment(network);

  const currentMetrics = selectedVault ? metrics[selectedVault.id] : undefined;
  const currentPosition = selectedVault ? positions[selectedVault.id] : undefined;

  const apy = currentMetrics?.realizedApyPercent ?? 0;
  const totalAssetsNum = currentMetrics ? Number(currentMetrics.totalAssets) / 1e7 : 0;
  const utilization = currentMetrics?.utilizationPercent ?? 0;
  const hasDeposit = Boolean(currentPosition && currentPosition.shares > 0n);
  const hasYield = Boolean(currentPosition && currentPosition.accruedYield > 0n);

  const handleHarvestClick = () => {
    if (currentPosition?.formatted?.yield) {
      const cleanYield = currentPosition.formatted.yield.replace('+', '').trim();
      setActionTab('withdraw');
      setPrefilledAmount(cleanYield);
    }
  };

  const formattedTvl =
    totalAssetsNum > 1000
      ? `$${formatCompactNumber(totalAssetsNum)}`
      : `$${totalAssetsNum.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;

  const strategyExplorerUrl = `${env.explorerBaseUrl}/contract/${selectedVault.strategyAddress}`;

  const tokenSymbol = selectedVault.underlyingAsset.symbol;
  const activeChain = getChainById(network === 'mainnet' ? 'pubnet' : 'testnet');
  const pubnetChain = getChainById('pubnet');
  const tokenIconUrl =
    selectedVault.underlyingAsset.iconUrl ||
    activeChain?.assets.find(a => a.symbol === tokenSymbol)?.logoURI ||
    pubnetChain?.assets.find(a => a.symbol === tokenSymbol)?.logoURI;

  return (
    <PageLayout
      title="Earn"
      subtitle="Simple, non-custodial USDC yield powered by Blend & DeFindex"
      maxWidth="7xl"
      isBeta
      headerActions={
        <div className="flex items-center gap-2">
          {vaultConfigs.length > 0 && (
            <select
              value={selectedVaultId}
              onChange={e => setSelectedVaultId(e.target.value)}
              className="appearance-none bg-(--color-bg-tertiary) hover:bg-(--color-bg-hover) text-(--color-text-primary) border border-(--color-border) rounded-xl px-3 py-1.5 text-xs font-semibold cursor-pointer outline-none transition-colors max-w-[180px] sm:max-w-none truncate"
            >
              {vaultConfigs.map(v => {
                const vApy = metrics[v.id]?.realizedApyPercent;
                return (
                  <option
                    key={v.id}
                    value={v.id}
                    className="bg-(--color-bg-secondary) text-(--color-text-primary)"
                  >
                    {v.name} ({v.symbol}){vApy !== undefined ? ` • ${vApy.toFixed(2)}% APY` : ''}
                  </option>
                );
              })}
            </select>
          )}

          <button
            onClick={refreshData}
            disabled={isLoading}
            className="p-2 rounded-xl bg-(--color-bg-tertiary) hover:bg-(--color-bg-hover) text-(--color-text-secondary) hover:text-(--color-text-primary) transition border border-(--color-border) cursor-pointer"
            title="Refresh On-Chain Data"
          >
            <RefreshCw
              className={`w-4 h-4 ${isLoading ? 'animate-spin text-brand-primary' : ''}`}
            />
          </button>
        </div>
      }
    >
      <div className="p-0 sm:p-2 space-y-4">
        {error && Object.keys(metrics).length === 0 ? (
          <div className="sm:rounded-2xl sm:border sm:border-(--color-border) sm:bg-(--color-bg-secondary) p-6 sm:p-12 text-center space-y-4">
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
          <div className="rounded-2xl border border-(--color-border) bg-(--color-bg-secondary) p-6 sm:p-8 space-y-5 animate-pulse">
            <div className="flex flex-col items-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-(--color-bg-tertiary)" />
              <div className="h-9 w-36 bg-(--color-bg-tertiary) rounded-lg" />
              <div className="h-4 w-56 bg-(--color-bg-tertiary)/70 rounded" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-7 h-64 bg-(--color-bg-tertiary)/60 rounded-xl" />
              <div className="lg:col-span-5 h-64 bg-(--color-bg-tertiary)/60 rounded-xl" />
            </div>
            <div className="flex items-center justify-center gap-2 text-xs font-mono text-(--color-text-muted)">
              <Loader2 className="w-4 h-4 animate-spin text-brand-primary" />
              <span>Loading live Blend vault rates...</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
            {/* LEFT: Clean Hero + Key-Value Summary + How It Works */}
            <div className="lg:col-span-7 sm:rounded-2xl sm:border sm:border-(--color-border) sm:bg-(--color-bg-secondary) overflow-hidden">
              {/* Centered Clean Hero */}
              <div className="px-5 py-6 sm:px-8 sm:py-7 text-center border-b border-(--color-border) bg-(--color-bg-tertiary)/15">
                <div className="w-12 h-12 rounded-full bg-blue-500/15 border border-white/10 text-blue-400 flex items-center justify-center font-mono font-black text-xl mx-auto overflow-hidden">
                  {tokenIconUrl ? (
                    <img
                      src={tokenIconUrl}
                      alt={tokenSymbol}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{tokenSymbol === 'EURC' ? '€' : tokenSymbol?.[0] || '$'}</span>
                  )}
                </div>
                <div className="mt-3 flex items-baseline justify-center gap-1.5">
                  <span className="text-4xl sm:text-5xl font-black tracking-tight text-emerald-400 font-mono">
                    {apy.toFixed(2)}%
                  </span>
                  <span className="text-sm font-bold text-(--color-text-secondary) uppercase tracking-wider">
                    APY
                  </span>
                </div>
                <p className="mt-1.5 text-xs sm:text-sm text-(--color-text-secondary)">
                  {selectedVault.name} • {selectedVault.underlyingProtocol} • Auto-compounding
                </p>
              </div>

              {/* Clean Key-Value Rows (LOBSTR-style clarity) */}
              <div className="divide-y divide-(--color-border) text-sm">
                <div className="px-4 py-3.5 sm:px-6 flex items-center justify-between gap-3">
                  <span className="text-(--color-text-secondary) text-xs sm:text-sm">
                    Your position
                  </span>
                  <div className="text-right">
                    {!stellarAddress ? (
                      <button
                        type="button"
                        onClick={openModal}
                        className="text-xs font-semibold text-brand-primary hover:underline cursor-pointer"
                      >
                        Connect wallet
                      </button>
                    ) : hasDeposit ? (
                      <span className="font-mono font-bold text-(--color-text-primary) text-xs sm:text-sm">
                        {currentPosition?.formatted?.underlying || '0.00'}{' '}
                        {selectedVault.underlyingAsset.symbol}
                      </span>
                    ) : (
                      <span className="text-(--color-text-muted) text-xs sm:text-sm">None yet</span>
                    )}
                  </div>
                </div>

                {stellarAddress && hasDeposit && (
                  <div className="px-4 py-3.5 sm:px-6 flex items-center justify-between gap-3">
                    <span className="text-(--color-text-secondary) text-xs sm:text-sm">
                      Earned interest
                    </span>
                    <button
                      type="button"
                      onClick={hasYield ? handleHarvestClick : undefined}
                      disabled={!hasYield}
                      className={`font-mono font-semibold text-xs sm:text-sm ${
                        hasYield
                          ? 'text-emerald-400 hover:text-emerald-300 cursor-pointer'
                          : 'text-(--color-text-muted) cursor-default'
                      }`}
                      title={hasYield ? 'Click to withdraw accrued interest' : undefined}
                    >
                      {currentPosition?.formatted?.yield || '+0.000000'}{' '}
                      {selectedVault.underlyingAsset.symbol}
                    </button>
                  </div>
                )}

                <div className="px-4 py-3.5 sm:px-6 flex items-center justify-between gap-3">
                  <span className="text-(--color-text-secondary) text-xs sm:text-sm">
                    Vault TVL
                  </span>
                  <span className="font-mono font-semibold text-(--color-text-primary) text-xs sm:text-sm">
                    {formattedTvl}{' '}
                    <span className="text-(--color-text-muted) font-normal">
                      ({totalAssetsNum.toFixed(2)} {selectedVault.underlyingAsset.symbol})
                    </span>
                  </span>
                </div>

                <div className="px-4 py-3.5 sm:px-6 flex items-center justify-between gap-3">
                  <span className="text-(--color-text-secondary) text-xs sm:text-sm">Rewards</span>
                  <span className="font-medium text-(--color-text-primary) text-xs sm:text-sm">
                    Auto-compounded continuously
                  </span>
                </div>

                <div className="px-4 py-3.5 sm:px-6 flex items-center justify-between gap-3">
                  <span className="text-(--color-text-secondary) text-xs sm:text-sm">Withdraw</span>
                  <span className="font-medium text-(--color-text-primary) text-xs sm:text-sm">
                    Any time (no lockup)
                  </span>
                </div>

                <div className="px-4 py-3.5 sm:px-6 flex items-center justify-between gap-3">
                  <span className="text-(--color-text-secondary) text-xs sm:text-sm">Strategy</span>
                  <a
                    href={strategyExplorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-brand-primary hover:underline text-xs sm:text-sm"
                  >
                    <span>{selectedVault.underlyingProtocol}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* How It Works */}
              <div className="px-4 py-4 sm:px-6 sm:py-5 border-t border-(--color-border) bg-(--color-bg-tertiary)/10 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-(--color-text-secondary)">
                  How it works
                </h3>
                <ul className="space-y-2 text-xs text-(--color-text-secondary)">
                  <li className="flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full bg-brand-primary/15 text-brand-primary font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                      1
                    </span>
                    <span>
                      Deposit {selectedVault.underlyingAsset.symbol} — funds deploy 100% into the
                      audited Blend lending pool.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full bg-emerald-500/15 text-emerald-400 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                      2
                    </span>
                    <span>
                      Borrower interest &amp; BLND rewards auto-compound into your{' '}
                      <span className="font-mono text-(--color-text-primary)">
                        {selectedVault.symbol}
                      </span>{' '}
                      share value.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full bg-purple-500/15 text-purple-400 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                      3
                    </span>
                    <span>
                      Withdraw principal + yield anytime; protocol fee applies only to earned yield.
                    </span>
                  </li>
                </ul>

                <div className="pt-2 flex items-center gap-1.5 text-[11px] text-(--color-text-muted)">
                  <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>
                    Non-custodial DeFindex vault •{' '}
                    {selectedVault.isUpgradable ? 'Upgradable • Split Roles' : 'Immutable'}
                  </span>
                </div>
              </div>
            </div>

            {/* RIGHT: Focused Deposit / Withdraw Action Console */}
            <div className="lg:col-span-5 border-t border-(--color-border) sm:border sm:rounded-2xl sm:bg-(--color-bg-secondary) pt-5 px-2 pb-2 sm:p-6">
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
        )}

        {/* Collapsible Advanced Market & Interest Rate Model */}
        {!isLoading && currentMetrics && (
          <div className="border-t border-(--color-border) sm:border sm:rounded-2xl sm:bg-(--color-bg-secondary) overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAnalytics(prev => !prev)}
              className="w-full px-4 py-3.5 sm:px-6 flex items-center justify-between text-left hover:bg-(--color-bg-tertiary)/30 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-brand-primary" />
                <span className="text-xs sm:text-sm font-semibold text-(--color-text-primary)">
                  Blend Pool Interest Rate &amp; Utilization Model
                </span>
                <span className="hidden sm:inline-block text-[11px] font-mono text-(--color-text-muted)">
                  • {utilization.toFixed(1)}% deployed
                </span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-(--color-text-secondary) transition-transform ${
                  showAnalytics ? 'rotate-180' : ''
                }`}
              />
            </button>

            {showAnalytics && (
              <div className="border-t border-(--color-border)">
                <VaultRateModel
                  data={currentMetrics.interestRateModel}
                  utilizationPercent={currentMetrics.utilizationPercent ?? 0}
                  currentApr={apy}
                  baseApr={currentMetrics.interestRateModel?.baseApr ?? 0.05}
                  targetUtil={currentMetrics.interestRateModel?.targetUtilization ?? 70.0}
                  maxUtil={currentMetrics.interestRateModel?.maxUtilization ?? 95.0}
                />
              </div>
            )}
          </div>
        )}

        {/* Activity History */}
        <div className="border-t border-(--color-border) sm:border sm:rounded-2xl sm:bg-(--color-bg-secondary) overflow-hidden">
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
