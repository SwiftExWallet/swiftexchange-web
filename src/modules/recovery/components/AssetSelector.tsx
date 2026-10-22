import { Check, Coins, Loader2 } from 'lucide-react';
import type { FC } from 'react';

import { SPAREKEY_CONFIG } from '../constants';
import type { ProtectedAssetSpec } from '../services/sparekeyContractService';

interface AssetSelectorProps {
  availableAssets: ProtectedAssetSpec[];
  selectedAssetKeys: Set<string>;
  onToggleAsset: (asset: ProtectedAssetSpec) => void;
  onSelectAll: () => void;
  onResetToDefault: () => void;
  maxLimit?: number;
  loading?: boolean;
  notice?: string;
}

export const AssetSelector: FC<AssetSelectorProps> = ({
  availableAssets,
  selectedAssetKeys,
  onToggleAsset,
  onSelectAll,
  onResetToDefault,
  maxLimit = 2,
  loading = false,
  notice = '',
}) => {
  const isLimitReached = (selectedAssetKeys?.size || 0) >= maxLimit;

  const truncate = (addr?: string) => {
    if (!addr || typeof addr !== 'string') return '';
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  };

  return (
    <div className="space-y-3 pt-3 border-t border-[var(--color-border)]/60">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-1.5">
          <Coins className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
          <span>Protected Assets for Recovery</span>
        </label>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-[var(--color-text-muted)]">
            {selectedAssetKeys.size} / {maxLimit} Selected
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onSelectAll}
              disabled={
                !availableAssets.every(
                  a => a.tokenAddress === SPAREKEY_CONFIG.xlmSac || Boolean(a.hasTrustline)
                )
              }
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title={
                !availableAssets.every(
                  a => a.tokenAddress === SPAREKEY_CONFIG.xlmSac || Boolean(a.hasTrustline)
                )
                  ? 'Cannot select both: USDC trustline is missing in your wallet'
                  : 'Select both XLM and USDC'
              }
            >
              <span>Both</span>
            </button>
            <button
              type="button"
              onClick={onResetToDefault}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer"
            >
              <span>XLM Only</span>
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-300/90 leading-relaxed">
        <span>
          Important: Non-native assets (such as USDC) require an active trustline. Without a
          trustline, an account cannot hold or receive funds, and recovery transfer will fail.
        </span>
      </div>

      {notice && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 leading-relaxed">
          <span>{notice}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-xs text-[var(--color-text-muted)] gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--color-text-muted)]" />
          <span>Loading balances and trustlines...</span>
        </div>
      ) : (
        <div className="space-y-2">
          {availableAssets.map(asset => {
            const isSelected = selectedAssetKeys.has(asset.tokenAddress);
            const isXlm = asset.tokenAddress === SPAREKEY_CONFIG.xlmSac;
            const hasTrustline = isXlm ? true : Boolean(asset.hasTrustline);
            const isBlockedByLimit = !isSelected && isLimitReached;
            const isClickBlocked = isXlm ? false : !hasTrustline || isBlockedByLimit;

            return (
              <div
                key={asset.tokenAddress}
                onClick={() => {
                  if (!isClickBlocked) {
                    onToggleAsset(asset);
                  } else if (!hasTrustline && !isXlm) {
                    onToggleAsset(asset); // Will trigger explanatory notice in parent
                  }
                }}
                className={`flex items-center justify-between rounded-xl border px-3.5 py-3 transition-colors select-none ${
                  isXlm
                    ? 'cursor-default border-blue-500/30 bg-blue-500/[0.02]'
                    : !hasTrustline
                      ? 'opacity-60 cursor-not-allowed bg-[var(--color-bg-primary)]/40 border-[var(--color-border)]/50'
                      : isBlockedByLimit
                        ? 'opacity-40 cursor-not-allowed border-[var(--color-border)] bg-[var(--color-bg-primary)]'
                        : 'border-[var(--color-border)] bg-[var(--color-bg-primary)] hover:border-[var(--color-border-dark)] hover:bg-[var(--color-bg-secondary)] cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors ${
                      isSelected
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : !hasTrustline && !isXlm
                          ? 'border-[var(--color-border)]/40 bg-[var(--color-bg-tertiary)] opacity-30'
                          : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)]'
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 stroke-[2.5]" />}
                  </div>

                  <div className="w-8 h-8 rounded-full bg-[var(--color-bg-secondary)] flex items-center justify-center overflow-hidden shrink-0 border border-[var(--color-border)]">
                    {asset.iconUrl ? (
                      <img
                        src={asset.iconUrl}
                        alt={asset.code}
                        className="w-full h-full object-cover"
                        onError={e => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="font-bold text-xs text-[var(--color-text-secondary)]">
                        {asset.code?.[0] || '?'}
                      </span>
                    )}
                  </div>

                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs sm:text-sm text-[var(--color-text-primary)]">
                        {asset.code}
                      </span>
                      {asset.name && asset.name !== asset.code && (
                        <span className="text-xs text-[var(--color-text-muted)] truncate max-w-[120px]">
                          {asset.name}
                        </span>
                      )}
                      {asset.issuer && (
                        <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                          · {truncate(asset.issuer)}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5 flex-wrap">
                      <span>Balance: </span>
                      <span className="font-mono font-medium text-[var(--color-text-primary)]">
                        {Number(asset.balance || 0).toLocaleString(undefined, {
                          maximumFractionDigits: 4,
                        })}{' '}
                        {asset.code}
                      </span>
                      {isXlm && (
                        <span className="text-[10px] text-blue-400 font-mono">
                          (2 XLM floor reserved)
                        </span>
                      )}
                    </div>

                    {!hasTrustline && !isXlm && (
                      <span className="text-[10px] text-rose-400 font-medium block pt-0.5">
                        Trustline required in wallet before this asset can be selected.
                      </span>
                    )}
                  </div>
                </div>

                <div className="shrink-0 ml-2">
                  {isXlm ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      Required
                    </span>
                  ) : hasTrustline ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Trustline Active
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      No Trustline
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
