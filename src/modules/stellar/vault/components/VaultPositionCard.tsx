import { ArrowRight, Sparkles, Wallet2 } from 'lucide-react';
import React from 'react';

import type { SingleVaultConfig } from '../config/vault.config';
import type { UserVaultPosition } from '../types/vault.types';

interface VaultPositionCardProps {
  vault: SingleVaultConfig;
  position?: UserVaultPosition;
  isConnected: boolean;
  onOpenWithdraw: () => void;
  onConnectWallet: () => void;
}

export const VaultPositionCard: React.FC<VaultPositionCardProps> = ({
  vault,
  position,
  isConnected,
  onOpenWithdraw,
  onConnectWallet,
}) => {
  const hasDeposit = position && position.shares > 0n;

  return (
    <div className="bg-(--color-bg-secondary) border border-(--color-border) rounded-2xl p-6 flex flex-col justify-between hover:border-brand-primary/40 transition-all shadow-sm">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]" />
            <span className="text-xs font-bold tracking-wider text-purple-400 uppercase">
              Your Position
            </span>
          </div>
          {hasDeposit && (
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary font-semibold border border-brand-primary/20">
              Pool Share: {position.poolSharePercentage.toFixed(2)}%
            </span>
          )}
        </div>

        {!isConnected ? (
          <div className="py-6 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-10 h-10 rounded-xl bg-(--color-bg-tertiary) border border-(--color-border) flex items-center justify-center text-(--color-text-secondary)">
              <Wallet2 className="w-5 h-5" />
            </div>
            <p className="text-xs text-(--color-text-secondary) max-w-[240px]">
              Connect your Stellar wallet to view your active deposit balance and accrued yield.
            </p>
            <button
              onClick={onConnectWallet}
              className="px-4 py-2 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white font-semibold text-xs transition-colors shadow-sm cursor-pointer"
            >
              Connect Wallet
            </button>
          </div>
        ) : (
          <>
            <div>
              <div className="text-xs text-(--color-text-secondary)">Current Position Value</div>
              <div className="text-3xl font-extrabold text-(--color-text-primary) font-mono mt-1">
                {position?.formatted?.underlying || '0.00'}{' '}
                <span className="text-sm font-normal text-(--color-text-secondary)">
                  {vault.underlyingAsset.symbol}
                </span>
              </div>
            </div>

            <div className="space-y-2.5 pt-3 border-t border-(--color-border) text-xs">
              <div className="flex items-center justify-between">
                <span className="text-(--color-text-secondary)">Deposited Principal</span>
                <span className="font-semibold text-(--color-text-primary)">
                  {position?.formatted?.deposited || '0.00'} {vault.underlyingAsset.symbol}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-(--color-text-secondary) flex items-center gap-1">
                  <span>Accrued Yield</span>
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                </span>
                <span className="font-bold text-emerald-400">
                  {position?.formatted?.yield || '+0.00'} {vault.underlyingAsset.symbol}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-(--color-text-secondary)">Vault Shares</span>
                <span className="font-mono text-(--color-text-secondary)">
                  {position?.formatted?.shares || '0.0000'} {vault.symbol}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {isConnected && (
        <button
          onClick={onOpenWithdraw}
          disabled={!hasDeposit}
          className={`w-full mt-6 py-3 px-4 rounded-xl font-semibold text-sm flex items-center justify-between transition-all ${
            hasDeposit
              ? 'bg-(--color-bg-tertiary) hover:bg-(--color-bg-hover) text-(--color-text-primary) border border-(--color-border) hover:border-brand-primary/50 shadow-sm cursor-pointer group'
              : 'bg-(--color-bg-tertiary)/50 text-(--color-text-muted) border border-(--color-border)/40 cursor-not-allowed opacity-50'
          }`}
        >
          <span>Withdraw {vault.underlyingAsset.symbol}</span>
          <ArrowRight
            className={`w-4 h-4 ${
              hasDeposit
                ? 'group-hover:translate-x-1 text-brand-primary'
                : 'text-(--color-text-muted)'
            } transition-transform`}
          />
        </button>
      )}
    </div>
  );
};
