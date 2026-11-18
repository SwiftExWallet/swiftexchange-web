import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCw,
  Wallet2,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';

import type { NetworkType } from '@/modules/walletconnect/config/chains';

import type { SingleVaultConfig } from '../config/vault.config';
import { getExplorerTxUrl } from '../config/vault.config';
import { useVaultActivity } from '../hook/useVaultActivity';
import { VaultTransparency } from './VaultTransparency';

interface VaultActivitySectionProps {
  vault: SingleVaultConfig;
  userAddress: string;
  network: NetworkType;
  onOpenConnectModal?: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const VaultActivitySection: React.FC<VaultActivitySectionProps> = ({
  vault,
  userAddress,
  network,
  onOpenConnectModal,
}) => {
  const [sectionTab, setSectionTab] = useState<'activity' | 'governance'>('activity');
  const [filterType, setFilterType] = useState<'all' | 'deposit' | 'withdraw'>('all');

  const { activities, isLoading, isLoadingMore, hasMore, sentinelRef, refreshHistory, fetchMore } =
    useVaultActivity(vault, userAddress, network);

  const filteredActivities = useMemo(() => {
    if (filterType === 'all') return activities;
    return activities.filter(a => a.type === filterType);
  }, [activities, filterType]);

  const depositCount = useMemo(
    () => activities.filter(a => a.type === 'deposit').length,
    [activities]
  );
  const withdrawCount = useMemo(
    () => activities.filter(a => a.type === 'withdraw').length,
    [activities]
  );

  return (
    <div className="border-t border-(--color-border)">
      <div className="flex items-center justify-between border-b border-(--color-border) px-3 sm:px-6 bg-(--color-bg-secondary)/30">
        <div className="flex items-center gap-6 sm:gap-8 -mb-[1px]">
          <button
            type="button"
            onClick={() => setSectionTab('activity')}
            className={`py-3.5 text-xs sm:text-sm font-semibold transition-all relative cursor-pointer outline-none focus:outline-none ${
              sectionTab === 'activity'
                ? 'text-(--color-text-primary)'
                : 'text-(--color-text-secondary) hover:text-(--color-text-primary)'
            }`}
          >
            <span>Activity</span>
            {sectionTab === 'activity' && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-primary" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setSectionTab('governance')}
            className={`py-3.5 text-xs sm:text-sm font-semibold transition-all relative cursor-pointer outline-none focus:outline-none ${
              sectionTab === 'governance'
                ? 'text-(--color-text-primary)'
                : 'text-(--color-text-secondary) hover:text-(--color-text-primary)'
            }`}
          >
            <span>On-Chain Governance</span>
            {sectionTab === 'governance' && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-primary" />
            )}
          </button>
        </div>

        {sectionTab === 'activity' && userAddress && (
          <div className="hidden sm:flex items-center gap-2">
            <div className="flex items-center gap-1 bg-(--color-bg-tertiary)/60 border border-(--color-border) rounded-lg p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer outline-none ${
                  filterType === 'all'
                    ? 'bg-brand-primary text-white font-bold'
                    : 'text-(--color-text-secondary) hover:text-(--color-text-primary)'
                }`}
              >
                All ({activities.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('deposit')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer outline-none ${
                  filterType === 'deposit'
                    ? 'bg-brand-primary text-white font-bold'
                    : 'text-(--color-text-secondary) hover:text-(--color-text-primary)'
                }`}
              >
                Deposits ({depositCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('withdraw')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer outline-none ${
                  filterType === 'withdraw'
                    ? 'bg-brand-primary text-white font-bold'
                    : 'text-(--color-text-secondary) hover:text-(--color-text-primary)'
                }`}
              >
                Withdrawals ({withdrawCount})
              </button>
            </div>

            <button
              type="button"
              onClick={refreshHistory}
              disabled={isLoading}
              title="Refresh activity"
              className="p-1.5 rounded-lg bg-(--color-bg-tertiary)/60 hover:bg-(--color-bg-hover) text-(--color-text-secondary) hover:text-(--color-text-primary) border border-(--color-border) transition-colors cursor-pointer disabled:opacity-40 outline-none"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-brand-primary' : ''}`}
              />
            </button>
          </div>
        )}
      </div>

      {sectionTab === 'activity' && userAddress && (
        <div className="sm:hidden flex items-center justify-between gap-2 px-3 py-2 bg-(--color-bg-tertiary)/15 border-b border-(--color-border)">
          <div className="flex items-center gap-1 text-[11px] overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer shrink-0 outline-none ${
                filterType === 'all'
                  ? 'bg-brand-primary text-white font-bold'
                  : 'bg-(--color-bg-secondary) text-(--color-text-secondary) border border-(--color-border)'
              }`}
            >
              All ({activities.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('deposit')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer shrink-0 outline-none ${
                filterType === 'deposit'
                  ? 'bg-brand-primary text-white font-bold'
                  : 'bg-(--color-bg-secondary) text-(--color-text-secondary) border border-(--color-border)'
              }`}
            >
              Deposits ({depositCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('withdraw')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer shrink-0 outline-none ${
                filterType === 'withdraw'
                  ? 'bg-brand-primary text-white font-bold'
                  : 'bg-(--color-bg-secondary) text-(--color-text-secondary) border border-(--color-border)'
              }`}
            >
              Withdrawals ({withdrawCount})
            </button>
          </div>

          <button
            type="button"
            onClick={refreshHistory}
            disabled={isLoading}
            className="p-1.5 rounded-lg bg-(--color-bg-secondary) hover:bg-(--color-bg-hover) text-(--color-text-secondary) border border-(--color-border) shrink-0 outline-none"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-brand-primary' : ''}`}
            />
          </button>
        </div>
      )}

      {sectionTab === 'governance' ? (
        <VaultTransparency vault={vault} network={network} />
      ) : (
        <div>
          {!userAddress ? (
            <div className="p-8 text-center space-y-3">
              <div className="w-10 h-10 rounded-xl bg-brand-primary/10 border border-brand-primary/20 text-brand-primary flex items-center justify-center mx-auto">
                <Wallet2 className="w-5 h-5" />
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <h4 className="text-xs font-bold text-(--color-text-primary)">
                  Connect Wallet to View History
                </h4>
                <p className="text-[11px] text-(--color-text-secondary)">
                  Connect your Stellar wallet to see your latest deposits and withdrawals.
                </p>
              </div>
              {onOpenConnectModal && (
                <button
                  type="button"
                  onClick={onOpenConnectModal}
                  className="btn btn-primary btn-sm text-xs font-bold cursor-pointer"
                >
                  Connect Stellar Wallet
                </button>
              )}
            </div>
          ) : isLoading && activities.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <RefreshCw className="w-5 h-5 animate-spin text-brand-primary mx-auto" />
              <p className="text-xs text-(--color-text-muted)">
                Checking on-chain activity for your wallet...
              </p>
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="p-10 text-center space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-(--color-bg-tertiary) border border-(--color-border) text-(--color-text-muted) flex items-center justify-center mx-auto">
                <Clock className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-(--color-text-primary)">No Activity Found</h4>
                <p className="text-[11px] text-(--color-text-secondary) max-w-md mx-auto">
                  Your deposits and withdrawals will appear here automatically.
                </p>
              </div>
            </div>
          ) : (
            <div>
              <div className="sm:hidden divide-y divide-(--color-border)">
                {filteredActivities.map(record => (
                  <div
                    key={record.id || record.txHash}
                    className="p-3.5 flex items-center justify-between gap-3 hover:bg-(--color-bg-tertiary)/20 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          record.type === 'deposit'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                        }`}
                      >
                        {record.type === 'deposit' ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs capitalize text-(--color-text-primary)">
                            {record.type}
                          </span>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span className="text-[10px] text-emerald-400 font-medium">
                            Confirmed
                          </span>
                        </div>
                        <div className="text-[11px] text-(--color-text-muted) font-mono">
                          {formatRelativeTime(record.timestamp)}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 space-y-0.5">
                      <div
                        className={`font-mono font-bold text-xs ${
                          record.type === 'deposit'
                            ? 'text-emerald-400'
                            : 'text-(--color-text-primary)'
                        }`}
                      >
                        {record.type === 'deposit' ? '+' : '-'}
                        {record.amount} {record.symbol}
                      </div>
                      {record.txHash && (
                        <a
                          href={getExplorerTxUrl(record.txHash, network)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-brand-primary font-mono hover:underline"
                        >
                          <span>
                            {record.txHash.slice(0, 4)}...{record.txHash.slice(-4)}
                          </span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-(--color-border) text-[11px] font-semibold text-(--color-text-secondary) bg-(--color-bg-tertiary)/10 uppercase tracking-wider">
                      <th className="py-3 px-4 sm:px-6">Action</th>
                      <th className="py-3 px-4">Strategy</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 sm:px-6 text-right">Explorer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--color-border)">
                    {filteredActivities.map(record => (
                      <tr
                        key={record.id || record.txHash}
                        className="hover:bg-(--color-bg-tertiary)/30 transition-colors"
                      >
                        <td className="py-3 px-4 sm:px-6">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                                record.type === 'deposit'
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                              }`}
                            >
                              {record.type === 'deposit' ? (
                                <ArrowDownLeft className="w-3.5 h-3.5" />
                              ) : (
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              )}
                            </div>
                            <span
                              className={`font-semibold capitalize text-xs ${
                                record.type === 'deposit' ? 'text-emerald-400' : 'text-purple-400'
                              }`}
                            >
                              {record.type}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-semibold text-(--color-text-primary)">
                            {record.vaultName}
                          </div>
                          <div className="text-[10px] text-(--color-text-muted)">
                            DeFindex Yield Strategy
                          </div>
                        </td>

                        <td className="py-3 px-4 font-mono font-bold">
                          <span
                            className={
                              record.type === 'deposit'
                                ? 'text-emerald-400'
                                : 'text-(--color-text-primary)'
                            }
                          >
                            {record.type === 'deposit' ? '+' : '-'}
                            {record.amount} {record.symbol}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-(--color-text-secondary) font-mono text-[11px]">
                          {formatRelativeTime(record.timestamp)}
                        </td>

                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>Confirmed</span>
                          </span>
                        </td>

                        <td className="py-3 px-4 sm:px-6 text-right">
                          {record.txHash ? (
                            <a
                              href={getExplorerTxUrl(record.txHash, network)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-xs text-brand-primary hover:underline hover:text-brand-primary-hover transition-colors"
                              title="Verify on Stellar Expert"
                            >
                              <span>
                                {record.txHash.slice(0, 6)}...{record.txHash.slice(-4)}
                              </span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-mono text-[11px] text-(--color-text-muted)">
                              --
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {hasMore && activities.length > 0 && (
                <div
                  ref={sentinelRef}
                  className="py-3 px-4 flex items-center justify-center border-t border-(--color-border)/40"
                >
                  {isLoadingMore ? (
                    <div className="flex items-center gap-2 text-xs font-mono text-(--color-text-muted)">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-primary" />
                      <span>Loading older transactions...</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fetchMore()}
                      disabled={isLoadingMore}
                      className="text-[11px] font-semibold text-(--color-text-secondary) hover:text-brand-primary disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      Load More
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
