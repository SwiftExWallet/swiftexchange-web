import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  Send,
  Sparkles,
  Wallet2,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import type { NetworkType } from '@/modules/walletconnect/config/chains';

import type { SingleVaultConfig } from '../config/vault.config';
import { getExplorerTxUrl } from '../config/vault.config';
import { useVaultAction } from '../hook/useVaultAction';
import { VaultService } from '../service/vaultService';
import type { UserVaultPosition } from '../types/vault.types';
import { parseTokenUnits } from '../utils/vaultFormatters';

interface VaultActionConsoleProps {
  vault: SingleVaultConfig;
  position?: UserVaultPosition;
  userAddress: string;
  network: NetworkType;
  onSuccess: () => void;
  onOpenConnectModal?: () => void;
  externalTab?: 'deposit' | 'withdraw';
  prefilledAmount?: string;
  apy?: number;
}

export const VaultActionConsole: React.FC<VaultActionConsoleProps> = ({
  vault,
  position,
  userAddress,
  network,
  onSuccess,
  onOpenConnectModal,
  externalTab,
  prefilledAmount,
  apy,
}) => {
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [amountStr, setAmountStr] = useState<string>('');
  const [walletBalanceStr, setWalletBalanceStr] = useState<string>('0.00');
  const [walletBalanceStroops, setWalletBalanceStroops] = useState<bigint>(0n);
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(false);
  const [copiedHash, setCopiedHash] = useState<boolean>(false);
  const [submittedAmount, setSubmittedAmount] = useState<string>('');
  const [submittedTab, setSubmittedTab] = useState<'deposit' | 'withdraw'>('deposit');

  const { txState, resetTxState, executeDeposit, executeWithdraw } = useVaultAction(vault);

  useEffect(() => {
    if (externalTab) {
      setActiveTab(externalTab);
    }
  }, [externalTab]);

  useEffect(() => {
    if (prefilledAmount !== undefined) {
      setAmountStr(prefilledAmount);
    }
  }, [prefilledAmount]);

  const loadBalance = useCallback(() => {
    if (!userAddress) {
      setWalletBalanceStr('0.00');
      setWalletBalanceStroops(0n);
      return;
    }

    if (activeTab === 'deposit') {
      setIsLoadingBalance(true);
      VaultService.fetchUserWalletBalance(vault.underlyingAsset.contractId, userAddress, network)
        .then(res => {
          setWalletBalanceStr(res.balanceFormatted);
          setWalletBalanceStroops(res.stroops);
        })
        .finally(() => setIsLoadingBalance(false));
    } else {
      setWalletBalanceStr(position?.formatted?.underlying || '0.00');
      setWalletBalanceStroops(position?.shares || 0n);
    }
  }, [activeTab, userAddress, vault, network, position]);

  useEffect(() => {
    resetTxState();
    setAmountStr('');
    loadBalance();
  }, [activeTab, userAddress, loadBalance, resetTxState]);

  const handleMaxClick = () => {
    if (activeTab === 'deposit') {
      setAmountStr(walletBalanceStr.replace(/,/g, ''));
    } else {
      setAmountStr((position?.formatted?.underlying || '0.00').replace(/,/g, ''));
    }
  };

  const handlePercentageClick = (pct: number) => {
    if (pct === 100) {
      handleMaxClick();
      return;
    }
    const rawVal = parseFloat(walletBalanceStr.replace(/,/g, ''));
    if (isNaN(rawVal) || rawVal <= 0) return;
    const computed = (rawVal * pct) / 100;
    setAmountStr(computed.toFixed(2));
  };

  const handleCopyHash = (hash: string) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(hash).then(() => {
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    });
  };

  const handleReset = () => {
    resetTxState();
    setAmountStr('');
    loadBalance();
  };

  const effectiveApy = apy !== undefined && apy > 0 ? apy : vault.targetApyPercent;
  const numAmount = parseFloat(amountStr);
  const isValidPositiveAmount = !isNaN(numAmount) && numAmount > 0;
  const estAnnualYield = isValidPositiveAmount ? (numAmount * effectiveApy) / 100 : 0;
  const estMonthlyYield = estAnnualYield / 12;

  const parsedInputStroops = parseTokenUnits(amountStr);
  const isZeroOrNegative = parsedInputStroops <= 0n;
  const isExceedingBalance = parsedInputStroops > walletBalanceStroops;

  const isProcessing =
    txState.step === 'building' ||
    txState.step === 'simulating' ||
    txState.step === 'awaiting_signature' ||
    txState.step === 'submitting' ||
    txState.step === 'pending';

  const handleSubmit = async () => {
    if (!userAddress) {
      if (onOpenConnectModal) onOpenConnectModal();
      return;
    }
    if (isZeroOrNegative || isExceedingBalance || isProcessing) return;

    setSubmittedAmount(amountStr);
    setSubmittedTab(activeTab);

    try {
      if (activeTab === 'deposit') {
        await executeDeposit(parsedInputStroops);
      } else {
        await executeWithdraw(parsedInputStroops);
      }
      onSuccess();
    } catch {
      // Handled in useVaultAction state
    }
  };

  const getStepStatus = (stepName: 'build' | 'sign' | 'submit' | 'confirm') => {
    const order = [
      'idle',
      'building',
      'simulating',
      'awaiting_signature',
      'submitting',
      'pending',
      'success',
    ];
    const currentIdx = order.indexOf(txState.step);

    if (stepName === 'build') {
      if (currentIdx > 2) return 'completed';
      if (currentIdx === 1 || currentIdx === 2) return 'active';
      return 'pending';
    }
    if (stepName === 'sign') {
      if (currentIdx > 3) return 'completed';
      if (currentIdx === 3) return 'active';
      return 'pending';
    }
    if (stepName === 'submit') {
      if (currentIdx > 4) return 'completed';
      if (currentIdx === 4) return 'active';
      return 'pending';
    }
    if (stepName === 'confirm') {
      if (currentIdx >= 6) return 'completed';
      if (currentIdx === 5) return 'active';
      return 'pending';
    }
    return 'pending';
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="inline-flex p-1 bg-(--color-bg-tertiary) border border-(--color-border) rounded-xl gap-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab('deposit');
              resetTxState();
            }}
            disabled={isProcessing}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer outline-none focus:outline-none focus:ring-0 ring-0 ${
              activeTab === 'deposit'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-(--color-text-secondary) hover:text-(--color-text-primary)'
            }`}
          >
            Deposit
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('withdraw');
              resetTxState();
            }}
            disabled={isProcessing}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer outline-none focus:outline-none focus:ring-0 ring-0 ${
              activeTab === 'withdraw'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-(--color-text-secondary) hover:text-(--color-text-primary)'
            }`}
          >
            Withdraw
          </button>
        </div>

        <div className="text-xs text-(--color-text-secondary) flex items-center gap-1.5">
          <span>Available:</span>
          <span className="font-mono font-bold text-(--color-text-primary)">
            {isLoadingBalance ? '...' : walletBalanceStr} {vault.underlyingAsset.symbol}
          </span>
        </div>
      </div>

      {txState.step === 'success' ? (
        <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-5">
          <div className="w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto shadow-lg shadow-emerald-500/10 animate-bounce">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <h4 className="text-lg font-bold text-(--color-text-primary)">
              {submittedTab === 'deposit' ? 'Deposit Successful' : 'Withdrawal Successful'}
            </h4>
            <p className="text-xs text-(--color-text-secondary)">
              Your transaction has been finalized on the Stellar Soroban ledger.
            </p>
          </div>

          <div className="bg-(--color-bg-secondary) border border-(--color-border) rounded-xl p-3.5 text-xs text-left space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-(--color-text-secondary)">Transacted Amount</span>
              <span className="font-mono font-bold text-(--color-text-primary)">
                {submittedAmount || amountStr} {vault.underlyingAsset.symbol}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-(--color-text-secondary)">Strategy</span>
              <span className="font-semibold text-(--color-text-primary)">{vault.name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-(--color-text-secondary)">Status</span>
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Confirmed on Ledger
              </span>
            </div>
            {txState.txHash && (
              <div className="flex justify-between items-center pt-2 border-t border-(--color-border)/60">
                <span className="text-(--color-text-secondary)">Tx Hash</span>
                <button
                  type="button"
                  onClick={() => handleCopyHash(txState.txHash!)}
                  className="flex items-center gap-1 text-[11px] font-mono text-(--color-text-muted) hover:text-(--color-text-primary) transition-colors cursor-pointer"
                  title="Click to copy full hash"
                >
                  <span>
                    {txState.txHash.slice(0, 8)}...{txState.txHash.slice(-6)}
                  </span>
                  {copiedHash ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-1">
            {txState.txHash && (
              <a
                href={getExplorerTxUrl(txState.txHash, network)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline w-full flex items-center justify-center gap-2 font-semibold text-xs cursor-pointer"
              >
                <span>View on Stellar Expert</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            )}

            <button
              type="button"
              onClick={handleReset}
              className="btn btn-primary w-full text-xs font-bold cursor-pointer"
            >
              Make Another Transaction
            </button>
          </div>
        </div>
      ) : isProcessing ? (
        <div className="p-5 rounded-2xl bg-(--color-bg-tertiary)/60 border border-(--color-border) space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-(--color-border)">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-brand-primary" />
              <h4 className="text-xs font-bold text-(--color-text-primary) uppercase tracking-wide">
                Processing {activeTab}...
              </h4>
            </div>
            <span className="text-[11px] font-mono text-(--color-text-muted)">
              {amountStr} {vault.underlyingAsset.symbol}
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                {getStepStatus('build') === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : getStepStatus('build') === 'active' ? (
                  <Loader2 className="w-4 h-4 text-brand-primary animate-spin" />
                ) : (
                  <Clock className="w-4 h-4 text-(--color-text-muted)" />
                )}
              </div>
              <div className="space-y-0.5">
                <p
                  className={`text-xs font-semibold ${
                    getStepStatus('build') === 'active'
                      ? 'text-brand-primary'
                      : getStepStatus('build') === 'completed'
                        ? 'text-emerald-400'
                        : 'text-(--color-text-secondary)'
                  }`}
                >
                  1. Prepare & Simulate Transaction
                </p>
                <p className="text-[11px] text-(--color-text-muted)">
                  Simulating Soroban smart contract call and building envelope
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                {getStepStatus('sign') === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : getStepStatus('sign') === 'active' ? (
                  <div className="w-4 h-4 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
                ) : (
                  <Clock className="w-4 h-4 text-(--color-text-muted)" />
                )}
              </div>
              <div className="space-y-0.5">
                <p
                  className={`text-xs font-semibold ${
                    getStepStatus('sign') === 'active'
                      ? 'text-brand-primary'
                      : getStepStatus('sign') === 'completed'
                        ? 'text-emerald-400'
                        : 'text-(--color-text-secondary)'
                  }`}
                >
                  2. Wallet Signature
                </p>
                <p className="text-[11px] text-(--color-text-muted)">
                  {getStepStatus('sign') === 'active'
                    ? 'Confirm transaction approval in Freighter / SwiftEx...'
                    : 'Awaiting cryptographic signature'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                {getStepStatus('submit') === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : getStepStatus('submit') === 'active' ? (
                  <Send className="w-4 h-4 text-brand-primary animate-pulse" />
                ) : (
                  <Clock className="w-4 h-4 text-(--color-text-muted)" />
                )}
              </div>
              <div className="space-y-0.5">
                <p
                  className={`text-xs font-semibold ${
                    getStepStatus('submit') === 'active'
                      ? 'text-brand-primary'
                      : getStepStatus('submit') === 'completed'
                        ? 'text-emerald-400'
                        : 'text-(--color-text-secondary)'
                  }`}
                >
                  3. Network Broadcast
                </p>
                <p className="text-[11px] text-(--color-text-muted)">
                  Submitting signed envelope to Stellar RPC network
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                {getStepStatus('confirm') === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : getStepStatus('confirm') === 'active' ? (
                  <Loader2 className="w-4 h-4 text-brand-primary animate-spin" />
                ) : (
                  <Clock className="w-4 h-4 text-(--color-text-muted)" />
                )}
              </div>
              <div className="space-y-0.5">
                <p
                  className={`text-xs font-semibold ${
                    getStepStatus('confirm') === 'active'
                      ? 'text-brand-primary'
                      : getStepStatus('confirm') === 'completed'
                        ? 'text-emerald-400'
                        : 'text-(--color-text-secondary)'
                  }`}
                >
                  4. Soroban Consensus
                </p>
                <p className="text-[11px] text-(--color-text-muted)">
                  Validating state transition on the Soroban ledger
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3.5">
          {!userAddress && (
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-brand-primary/10 border border-brand-primary/20 text-xs text-(--color-text-primary)">
              <div className="flex items-center gap-2">
                <Wallet2 className="w-4 h-4 text-brand-primary shrink-0" />
                <span>Connect your Stellar wallet to start earning</span>
              </div>
              {onOpenConnectModal && (
                <button
                  type="button"
                  onClick={onOpenConnectModal}
                  className="btn btn-primary btn-sm text-xs font-bold cursor-pointer"
                >
                  Connect
                </button>
              )}
            </div>
          )}

          <div className="bg-(--color-bg-tertiary) border border-(--color-border) rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-(--color-text-secondary)">
              <span className="font-medium">
                {activeTab === 'deposit' ? 'Deposit Amount' : 'Withdraw Amount'}
              </span>
              <span className="font-mono text-[11px] text-(--color-text-muted)">
                Max: {walletBalanceStr}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amountStr}
                onChange={e => setAmountStr(e.target.value)}
                disabled={isProcessing}
                className="w-full bg-transparent text-2xl font-bold font-mono text-(--color-text-primary) placeholder-(--color-text-muted) focus:outline-none"
              />
              <button
                type="button"
                onClick={handleMaxClick}
                disabled={isProcessing}
                className="px-3 py-1.5 rounded-lg text-xs font-bold font-mono text-brand-primary bg-(--color-bg-secondary) hover:bg-(--color-bg-hover) border border-(--color-border) cursor-pointer outline-none focus:outline-none focus:ring-0 ring-0 hover:border-brand-primary/40 transition-colors"
              >
                MAX
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1.5 pt-2.5 border-t border-(--color-border)/50">
              {[25, 50, 75, 100].map(pct => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handlePercentageClick(pct)}
                  disabled={isProcessing}
                  className="py-1 text-center rounded-lg text-xs font-mono font-semibold bg-(--color-bg-secondary) hover:bg-(--color-bg-hover) text-(--color-text-secondary) hover:text-(--color-text-primary) border border-(--color-border) transition-colors cursor-pointer outline-none focus:outline-none focus:ring-0 ring-0"
                >
                  {pct === 100 ? '100%' : `${pct}%`}
                </button>
              ))}
            </div>
          </div>

          {isExceedingBalance && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Entered amount exceeds your available balance ({walletBalanceStr}{' '}
                {vault.underlyingAsset.symbol}).
              </span>
            </div>
          )}

          {txState.step === 'failed' && txState.errorMessage && (
            <div className="space-y-2 p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-400">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Transaction Failed</span>
              </div>
              <p className="text-[11px] text-red-300 leading-relaxed">{txState.errorMessage}</p>
              <button
                type="button"
                onClick={resetTxState}
                className="btn btn-secondary btn-sm mt-1 text-xs text-red-300 border-red-500/30 hover:bg-red-500/20 cursor-pointer"
              >
                Dismiss & Try Again
              </button>
            </div>
          )}

          <div className="bg-(--color-bg-tertiary) rounded-xl p-3.5 space-y-2 text-xs text-(--color-text-secondary) border border-(--color-border)">
            <div className="flex justify-between items-center">
              <span>Current APY</span>
              <span className="font-mono font-semibold text-emerald-400">
                {effectiveApy.toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Protocol Fee</span>
              <span className="font-mono text-(--color-text-primary)">0.00%</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Estimated Network Fee</span>
              <span className="font-mono text-(--color-text-primary)">~0.00001 XLM</span>
            </div>

            {activeTab === 'deposit' && isValidPositiveAmount && (
              <div className="pt-2.5 mt-1 border-t border-(--color-border)/60 flex items-center justify-between text-xs text-emerald-400 font-medium">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Est. Monthly Return</span>
                </span>
                <span className="font-mono font-bold">
                  ~+{estMonthlyYield.toFixed(2)} {vault.underlyingAsset.symbol}
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isProcessing || isZeroOrNegative || isExceedingBalance}
            className={`btn btn-primary w-full py-3.5 text-sm font-bold rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all ${
              isZeroOrNegative || isExceedingBalance ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          >
            <span className="capitalize">
              Confirm {activeTab} {amountStr ? `${amountStr} ${vault.underlyingAsset.symbol}` : ''}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
