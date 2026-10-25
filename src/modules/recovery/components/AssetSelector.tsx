import { Check, Loader2 } from 'lucide-react';
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

const truncate = (addr?: string) => {
  if (!addr || typeof addr !== 'string') return '';
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
};

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
  const canSelectAll = availableAssets.every(
    a => a.tokenAddress === SPAREKEY_CONFIG.xlmSac || Boolean(a.hasTrustline)
  );
  const isAllSelected =
    selectedAssetKeys.size === availableAssets.length && availableAssets.length > 1;
  const isXlmOnly = selectedAssetKeys.size === 1 && selectedAssetKeys.has(SPAREKEY_CONFIG.xlmSac);

  return (
    <div className="space-y-2.5 pt-3 border-t border-[var(--color-border)]/60">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-[var(--color-text-secondary)]">
            Protected Assets
          </label>
          <span className="text-[11px] font-mono text-[var(--color-text-muted)]">
            ({selectedAssetKeys.size}/{maxLimit})
          </span>
        </div>

        <div className="inline-flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-0.5">
          <button
            type="button"
            onClick={onSelectAll}
            disabled={!canSelectAll}
            title={
              !canSelectAll
                ? 'Cannot select both: USDC trustline is missing in your wallet'
                : 'Select both XLM and USDC'
            }
            className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
              isAllSelected
                ? 'bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] shadow-sm'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            } disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer`}
          >
            Both
          </button>
          <button
            type="button"
            onClick={onResetToDefault}
            className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
              isXlmOnly
                ? 'bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] shadow-sm'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            XLM Only
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5 text-xs text-[var(--color-text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
          <span>Loading balances...</span>
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
                    onToggleAsset(asset);
                  }
                }}
                className={`flex items-center justify-between rounded-xl border px-3.5 py-3 transition-colors select-none ${
                  isSelected
                    ? 'border-blue-500/35 bg-blue-500/[0.03]'
                    : 'border-[var(--color-border)] bg-[var(--color-bg-primary)]'
                } ${
                  isXlm
                    ? 'cursor-default'
                    : !hasTrustline
                      ? 'opacity-55 cursor-not-allowed'
                      : isBlockedByLimit
                        ? 'opacity-40 cursor-not-allowed'
                        : 'hover:border-[var(--color-border-dark)] hover:bg-[var(--color-bg-secondary)]/60 cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      isSelected
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)]'
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 stroke-[2.5]" />}
                  </div>

                  <div className="h-8 w-8 rounded-full bg-[var(--color-bg-secondary)] flex items-center justify-center overflow-hidden shrink-0 border border-[var(--color-border)]">
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
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs sm:text-sm text-[var(--color-text-primary)]">
                        {asset.code}
                      </span>
                      {asset.name && asset.name !== asset.code && (
                        <span className="text-xs text-[var(--color-text-muted)] truncate max-w-[120px]">
                          {asset.name}
                        </span>
                      )}
                      {asset.issuer && (
                        <span className="hidden sm:inline font-mono text-[10px] text-[var(--color-text-muted)]">
                          · {truncate(asset.issuer)}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5 flex-wrap">
                      <span>Balance:</span>
                      <span className="font-mono font-medium text-[var(--color-text-primary)]">
                        {Number(asset.balance || 0).toLocaleString(undefined, {
                          maximumFractionDigits: 4,
                        })}{' '}
                        {asset.code}
                      </span>
                      {isXlm && (
                        <span className="text-[11px] text-[var(--color-text-muted)]">
                          · 2 XLM reserved
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="shrink-0 ml-2">
                  {isXlm ? (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400">
                      Required
                    </span>
                  ) : hasTrustline ? (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400">
                      Active
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]">
                      No Trustline
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p
        className={`text-[11px] leading-relaxed ${
          notice ? 'text-amber-400' : 'text-[var(--color-text-muted)]'
        }`}
      >
        {notice ||
          'Non-native tokens (like USDC) require an active Stellar trustline in your wallet to be included.'}
      </p>
    </div>
  );
};
