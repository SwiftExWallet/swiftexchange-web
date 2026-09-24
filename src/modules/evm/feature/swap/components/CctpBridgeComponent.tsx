import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Info,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Wallet,
  Zap,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { WalletType } from '../../../../walletconnect/constants/Wallet';
import { useWalletAssets } from '../../../../walletconnect/hooks/useWalletAssets';
import { useWalletConnect } from '../../../../walletconnect/hooks/useWalletConnect';
import { useEvmToStellarCctp } from '../hooks/useEvmToStellarCctp';

interface CctpBridgeComponentProps {
  currentNetwork: 'mainnet' | 'testnet';
  onBackToSwap?: () => void;
}

export const CctpBridgeComponent: React.FC<CctpBridgeComponentProps> = ({ currentNetwork }) => {
  const { connectedWallets, getProvider, openModal } = useWalletConnect();
  const evmWallet = connectedWallets[WalletType.EVM];
  const stellarWallet = connectedWallets[WalletType.STELLAR];

  const evmAddress = evmWallet?.address || '';
  const stellarAddress = stellarWallet?.address || '';

  const { assets } = useWalletAssets(currentNetwork);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const evmUsdcBalance = useMemo(() => {
    const asset = assets.find(a => a.chainType === 'evm' && a.symbol?.toUpperCase() === 'USDC');
    return asset?.balance ?? null;
  }, [assets]);

  const stellarUsdcBalance = useMemo(() => {
    const asset = assets.find(a => a.chainType === 'stellar' && a.symbol?.toUpperCase() === 'USDC');
    return asset?.balance ?? null;
  }, [assets]);

  const evmNativeBalance = useMemo(() => {
    const asset = assets.find(
      a => a.chainType === 'evm' && (a.isNative || a.symbol?.toUpperCase() === 'ETH')
    );
    return asset?.balance ?? null;
  }, [assets]);

  const {
    amount,
    setAmount,
    fast,
    setFast,
    quote,
    transfer,
    loading,
    isSigning,
    message,
    error,
    status,
    chainConfig,
    getQuote,
    startBridge,
    retrySignature,
    refreshStatus,
    reset,
  } = useEvmToStellarCctp({
    evmAddress,
    stellarAddress,
    evmProvider: getProvider(WalletType.EVM),
    stellarProvider: getProvider(WalletType.STELLAR),
    network: currentNetwork,
  });

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleMaxAmount = () => {
    if (evmUsdcBalance !== null && evmUsdcBalance > 0) {
      setAmount(evmUsdcBalance.toString());
    }
  };

  const getSourceExplorerUrl = (txHash: string) => {
    return currentNetwork === 'testnet'
      ? `https://sepolia.etherscan.io/tx/${txHash}`
      : `https://etherscan.io/tx/${txHash}`;
  };

  const getDestExplorerUrl = (txHash: string) => {
    return currentNetwork === 'testnet'
      ? `https://stellar.expert/explorer/testnet/tx/${txHash}`
      : `https://stellar.expert/explorer/public/tx/${txHash}`;
  };

  const isSignRequired =
    (status === 'APPROVAL_SIGNATURE_REQUIRED' && !transfer?.approvalTxHash) ||
    (status === 'BRIDGE_SIGNATURE_REQUIRED' && !transfer?.sourceTxHash) ||
    status === 'STELLAR_SIGNATURE_REQUIRED';

  const displayStatus =
    transfer?.sourceTxHash && status === 'BRIDGE_SIGNATURE_REQUIRED' ? 'SOURCE_PENDING' : status;

  const getStepStatus = (step: 1 | 2 | 3 | 4) => {
    switch (step) {
      case 1:
        if (
          transfer?.approvalTxHash ||
          [
            'BRIDGE_SIGNATURE_REQUIRED',
            'SOURCE_PENDING',
            'ATTESTATION_PENDING',
            'STELLAR_SIGNATURE_REQUIRED',
            'DESTINATION_PENDING',
            'COMPLETED',
          ].includes(status)
        ) {
          return 'completed';
        }
        if (['APPROVAL_SIGNATURE_REQUIRED', 'APPROVAL_PENDING'].includes(status)) return 'active';
        return 'pending';
      case 2:
        if (
          transfer?.attestation ||
          [
            'ATTESTATION_PENDING',
            'STELLAR_SIGNATURE_REQUIRED',
            'DESTINATION_PENDING',
            'COMPLETED',
          ].includes(status)
        ) {
          return 'completed';
        }
        if (
          transfer?.sourceTxHash ||
          ['BRIDGE_SIGNATURE_REQUIRED', 'SOURCE_PENDING'].includes(status)
        ) {
          return 'active';
        }
        return 'pending';
      case 3:
        if (['STELLAR_SIGNATURE_REQUIRED', 'DESTINATION_PENDING', 'COMPLETED'].includes(status))
          return 'completed';
        if (transfer?.attestation) return 'completed';
        if (displayStatus === 'ATTESTATION_PENDING' || transfer?.sourceTxHash) return 'active';
        return 'pending';
      case 4:
        if (['STELLAR_SIGNATURE_REQUIRED', 'DESTINATION_PENDING'].includes(status)) return 'active';
        if (status === 'COMPLETED') return 'completed';
        return 'pending';
      default:
        return 'pending';
    }
  };

  return (
    <div className="mx-auto lg:px-2 sm:px-0 w-full max-w-full overflow-hidden space-y-4">
      {/* Header Banner */}
      <div className="flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-secondary/60 border border-divider/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-primary flex items-center gap-2">
              Circle CCTP Bridge
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand/15 text-brand font-semibold uppercase">
                {currentNetwork === 'testnet' ? 'Sepolia ↔ Testnet' : 'Mainnet'}
              </span>
            </h3>
            <p className="text-xs text-muted">
              Official Circle CCTP protocol: 1:1 burn-and-mint USDC cross-chain transfer.
            </p>
          </div>
        </div>
      </div>

      {/* Wallet Addresses Card */}
      <div className="bg-tertiary rounded-2xl p-4 sm:p-5 border border-divider/50 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Source EVM */}
          <div className="p-3.5 rounded-xl bg-secondary/80 border border-divider/40 flex flex-col justify-between">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-muted">
                From (Ethereum {chainConfig.chainId === 11155111 ? 'Sepolia' : 'Mainnet'})
              </span>
              {!evmAddress && (
                <button
                  type="button"
                  onClick={() => openModal?.()}
                  className="text-[11px] font-bold text-brand hover:underline"
                >
                  Connect EVM
                </button>
              )}
            </div>
            {evmAddress ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-medium text-primary">
                    {evmAddress.slice(0, 10)}...{evmAddress.slice(-8)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(evmAddress, 'evm')}
                    className="text-muted hover:text-primary p-1"
                  >
                    {copiedField === 'evm' ? (
                      <Check size={14} className="text-emerald-400" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted">
                  <span className="flex items-center gap-1">
                    <Wallet size={12} /> Balance:
                  </span>
                  <span className="font-semibold text-primary">
                    {evmUsdcBalance !== null ? `${evmUsdcBalance} USDC` : 'Loading...'}
                  </span>
                </div>
              </div>
            ) : (
              <span className="text-xs text-amber-400 font-medium">EVM wallet not connected</span>
            )}
          </div>

          {/* Destination Stellar */}
          <div className="p-3.5 rounded-xl bg-secondary/80 border border-divider/40 flex flex-col justify-between">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-muted">
                To (Stellar {currentNetwork === 'testnet' ? 'Testnet' : 'Public'})
              </span>
              {!stellarAddress && (
                <button
                  type="button"
                  onClick={() => openModal?.()}
                  className="text-[11px] font-bold text-brand hover:underline"
                >
                  Connect Stellar
                </button>
              )}
            </div>
            {stellarAddress ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-medium text-primary">
                    {stellarAddress.slice(0, 8)}...{stellarAddress.slice(-8)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(stellarAddress, 'stellar')}
                    className="text-muted hover:text-primary p-1"
                  >
                    {copiedField === 'stellar' ? (
                      <Check size={14} className="text-emerald-400" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted">
                  <span className="flex items-center gap-1">
                    <Wallet size={12} /> Balance:
                  </span>
                  <span className="font-semibold text-primary">
                    {stellarUsdcBalance !== null ? `${stellarUsdcBalance} USDC` : 'Loading...'}
                  </span>
                </div>
              </div>
            ) : (
              <span className="text-xs text-amber-400 font-medium">
                Stellar wallet not connected
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-3.5 sm:p-4 text-xs text-red-400 animate-fade-in">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Bridge Error</p>
            <p className="mt-0.5 break-words opacity-90">{error}</p>
          </div>
        </div>
      )}

      {/* Main Bridge Form OR Active Transfer Progress Card */}
      {!transfer ? (
        <div className="bg-tertiary rounded-2xl p-4 sm:p-6 border border-divider/50 space-y-4">
          {/* Amount Input Card */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-black uppercase tracking-wider text-muted">
                You Send (USDC)
              </label>
              {evmUsdcBalance !== null && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">
                    Avail: <span className="text-primary font-semibold">{evmUsdcBalance}</span> USDC
                  </span>
                  <button
                    type="button"
                    onClick={handleMaxAmount}
                    className="text-[10px] font-black text-brand hover:scale-105 active:scale-95 transition-all px-2 py-0.5 bg-brand/10 border border-brand/20 rounded-md"
                  >
                    MAX
                  </button>
                </div>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                value={amount}
                onChange={e => {
                  const val = e.target.value;
                  if (/^\d*\.?\d*$/.test(val)) {
                    setAmount(val);
                  }
                }}
                placeholder="0.00"
                className="w-full bg-secondary rounded-xl px-4 py-3.5 text-lg font-bold text-primary placeholder:text-muted/40 border border-divider/40 focus:border-brand focus:outline-none transition-colors"
              />
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-tertiary border border-divider/50">
                <span className="text-xs font-bold text-primary">USDC</span>
              </div>
            </div>

            {evmNativeBalance !== null && evmNativeBalance < 0.001 && (
              <p className="text-[11px] text-amber-400 mt-1.5 flex items-center gap-1">
                <AlertCircle size={12} /> Low native ETH for gas fee. Please ensure you have
                sufficient ETH.
              </p>
            )}
          </div>

          {/* Transfer Speed Option */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-secondary/50 border border-divider/30">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                <Zap size={16} />
              </div>
              <div>
                <span className="text-xs font-bold text-primary block">Fast Transfer</span>
                <span className="text-[11px] text-muted">
                  Circle finality 1000 blocks (~15-20 min)
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFast(!fast)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                fast ? 'bg-brand' : 'bg-muted/30'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  fast ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Quote Card */}
          {quote && (
            <div className="p-4 rounded-xl bg-secondary/80 border border-brand/20 space-y-2.5 animate-fade-in">
              <div className="flex justify-between items-center pb-2 border-b border-divider/30">
                <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                  <Info size={14} className="text-brand" /> CCTP Quote Breakdown
                </span>
                <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                  <Clock size={12} /> Active
                </span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-muted">
                  <span>Send Amount</span>
                  <span className="text-primary font-medium">{quote.amount} USDC</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>
                    Protocol Fee ({quote.feeBps ? `${Number(quote.feeBps) / 100}%` : '0.5%'})
                  </span>
                  <span className="text-primary font-medium">{quote.protocolFee} USDC</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Circle Network Fee</span>
                  <span className="text-primary font-medium">{quote.maxFee} USDC</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Finality Threshold</span>
                  <span className="text-primary font-medium">
                    {quote.finalityThreshold || (fast ? '1,000 blocks' : 'Standard')}
                  </span>
                </div>
                <div className="flex justify-between text-muted font-bold pt-2 border-t border-divider/20">
                  <span className="text-primary">Minimum Received on Stellar</span>
                  <span className="text-emerald-400 font-bold">{quote.minimumReceived} USDC</span>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {!quote ? (
            <button
              type="button"
              onClick={() => getQuote()}
              disabled={
                loading || !amount || parseFloat(amount) <= 0 || !evmAddress || !stellarAddress
              }
              className="w-full py-3.5 px-4 rounded-xl bg-brand text-white font-bold text-sm hover:opacity-95 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Fetching Quote...</span>
                </>
              ) : (
                <span>Get Quote</span>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => getQuote()}
                disabled={loading}
                className="p-3.5 rounded-xl bg-secondary border border-divider/50 hover:bg-hover text-muted hover:text-primary transition-all"
                title="Refresh Quote"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
              <button
                type="button"
                onClick={startBridge}
                disabled={loading}
                className="flex-1 py-3.5 px-4 rounded-xl bg-brand text-white font-bold text-sm hover:opacity-95 active:scale-[0.99] disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Initiating Bridge...</span>
                  </>
                ) : (
                  <>
                    <span>Bridge {quote.amount} USDC</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Transfer Execution & 4-Step Stepper Progress Card */
        <div className="bg-tertiary rounded-2xl p-4 sm:p-6 border border-divider/50 space-y-5 animate-fade-in">
          <div className="flex items-center justify-between pb-3 border-b border-divider/40">
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-muted">
                Transfer Progress
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs font-mono text-muted/80">
                  ID: {transfer.id.slice(0, 13)}...{transfer.id.slice(-6)}
                </p>
                <button
                  type="button"
                  onClick={() => handleCopy(transfer.id, 'transferId')}
                  className="text-muted hover:text-primary p-0.5 rounded transition-colors"
                  title="Copy Transfer ID"
                >
                  {copiedField === 'transferId' ? (
                    <Check size={12} className="text-emerald-400" />
                  ) : (
                    <Copy size={12} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => refreshStatus?.()}
                  disabled={loading}
                  className="text-muted hover:text-brand p-0.5 rounded transition-colors"
                  title="Refresh Transfer Status"
                >
                  <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase ${
                displayStatus === 'COMPLETED'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : displayStatus === 'FAILED'
                    ? 'bg-red-500/20 text-red-400'
                    : isSignRequired
                      ? 'bg-amber-500/20 text-amber-400 animate-pulse'
                      : 'bg-brand/20 text-brand'
              }`}
            >
              {displayStatus.replace(/_/g, ' ')}
            </span>
          </div>

          {/* 4-Step Progress Stepper */}
          <div className="py-2">
            <div className="flex items-center justify-between relative">
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-divider/40 -translate-y-1/2 z-0" />

              {/* Step 1: Approve */}
              <div className="flex flex-col items-center relative z-10">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    getStepStatus(1) === 'completed'
                      ? 'bg-emerald-500 text-white'
                      : getStepStatus(1) === 'active'
                        ? 'bg-brand text-white ring-4 ring-brand/20'
                        : 'bg-secondary text-muted'
                  }`}
                >
                  {getStepStatus(1) === 'completed' ? <Check size={14} /> : '1'}
                </div>
                <span className="text-[10px] font-semibold text-muted mt-1.5">Approve</span>
              </div>

              {/* Step 2: Deposit */}
              <div className="flex flex-col items-center relative z-10">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    getStepStatus(2) === 'completed'
                      ? 'bg-emerald-500 text-white'
                      : getStepStatus(2) === 'active'
                        ? 'bg-brand text-white ring-4 ring-brand/20'
                        : 'bg-secondary text-muted'
                  }`}
                >
                  {getStepStatus(2) === 'completed' ? <Check size={14} /> : '2'}
                </div>
                <span className="text-[10px] font-semibold text-muted mt-1.5">Deposit</span>
              </div>

              {/* Step 3: Attestation */}
              <div className="flex flex-col items-center relative z-10">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    getStepStatus(3) === 'completed'
                      ? 'bg-emerald-500 text-white'
                      : getStepStatus(3) === 'active'
                        ? 'bg-brand text-white ring-4 ring-brand/20'
                        : 'bg-secondary text-muted'
                  }`}
                >
                  {getStepStatus(3) === 'completed' ? <Check size={14} /> : '3'}
                </div>
                <span className="text-[10px] font-semibold text-muted mt-1.5">Attestation</span>
              </div>

              {/* Step 4: Mint on Stellar */}
              <div className="flex flex-col items-center relative z-10">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    getStepStatus(4) === 'completed'
                      ? 'bg-emerald-500 text-white'
                      : getStepStatus(4) === 'active'
                        ? 'bg-brand text-white ring-4 ring-brand/20'
                        : 'bg-secondary text-muted'
                  }`}
                >
                  {getStepStatus(4) === 'completed' ? <CheckCircle2 size={15} /> : '4'}
                </div>
                <span className="text-[10px] font-semibold text-muted mt-1.5">Mint</span>
              </div>
            </div>
          </div>

          {/* Dynamic Status Message */}
          {message && (
            <div className="p-3.5 rounded-xl bg-secondary/80 border border-divider/40 flex items-center gap-2.5">
              {(loading ||
                isSigning ||
                [
                  'SOURCE_PENDING',
                  'ATTESTATION_PENDING',
                  'DESTINATION_PENDING',
                  'APPROVAL_PENDING',
                ].includes(status)) && (
                <Loader2 size={16} className="animate-spin text-brand shrink-0" />
              )}
              <span className="text-xs font-medium text-primary">{message}</span>
            </div>
          )}

          {/* Transaction Hashes */}
          <div className="space-y-2 text-xs">
            {transfer.approvalTxHash && (
              <div className="flex justify-between items-center p-2.5 rounded-lg bg-secondary/50">
                <span className="text-muted">USDC Approval Tx</span>
                <a
                  href={getSourceExplorerUrl(transfer.approvalTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-brand flex items-center gap-1 hover:underline"
                >
                  <span>
                    {transfer.approvalTxHash.slice(0, 10)}...{transfer.approvalTxHash.slice(-6)}
                  </span>
                  <ExternalLink size={12} />
                </a>
              </div>
            )}
            {transfer.sourceTxHash && (
              <div className="flex justify-between items-center p-2.5 rounded-lg bg-secondary/50">
                <span className="text-muted">Ethereum Deposit Tx</span>
                <a
                  href={getSourceExplorerUrl(transfer.sourceTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-brand flex items-center gap-1 hover:underline"
                >
                  <span>
                    {transfer.sourceTxHash.slice(0, 10)}...{transfer.sourceTxHash.slice(-6)}
                  </span>
                  <ExternalLink size={12} />
                </a>
              </div>
            )}
            {transfer.attestation && (
              <div className="flex justify-between items-center p-2.5 rounded-lg bg-secondary/50">
                <span className="text-muted">Circle Attestation</span>
                <span className="font-mono text-emerald-500 font-semibold flex items-center gap-1">
                  <Check size={12} />
                  <span>
                    {transfer.attestation.slice(0, 10)}...{transfer.attestation.slice(-6)}
                  </span>
                </span>
              </div>
            )}
            {transfer.destinationTxHash && (
              <div className="flex justify-between items-center p-2.5 rounded-lg bg-secondary/50">
                <span className="text-muted">Stellar Mint Tx</span>
                <a
                  href={getDestExplorerUrl(transfer.destinationTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-brand flex items-center gap-1 hover:underline"
                >
                  <span>
                    {transfer.destinationTxHash.slice(0, 10)}...
                    {transfer.destinationTxHash.slice(-6)}
                  </span>
                  <ExternalLink size={12} />
                </a>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="pt-2">
            {isSignRequired && (
              <button
                type="button"
                onClick={retrySignature}
                disabled={isSigning}
                className="w-full py-3.5 px-4 rounded-xl bg-brand text-white font-bold text-sm hover:opacity-95 active:scale-[0.99] disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                {isSigning ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Signing in Wallet...</span>
                  </>
                ) : (
                  <span>Sign Transaction in Wallet</span>
                )}
              </button>
            )}

            {!isSignRequired &&
              [
                'SOURCE_PENDING',
                'ATTESTATION_PENDING',
                'DESTINATION_PENDING',
                'APPROVAL_PENDING',
              ].includes(displayStatus) && (
                <div className="w-full py-3.5 px-4 rounded-xl bg-secondary/80 border border-divider/40 text-primary font-medium text-xs flex items-center justify-center gap-2.5">
                  <Loader2 size={16} className="animate-spin text-brand" />
                  <span>Transaction confirming on-chain... Polling protocol progress</span>
                </div>
              )}

            {status === 'COMPLETED' && (
              <button
                type="button"
                onClick={reset}
                className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-500 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <CheckCircle2 size={16} />
                <span>Start New Transfer</span>
              </button>
            )}

            {status === 'FAILED' && (
              <button
                type="button"
                onClick={reset}
                className="w-full py-3.5 px-4 rounded-xl bg-secondary border border-divider/50 hover:bg-hover text-primary font-bold text-sm active:scale-[0.99] transition-all flex items-center justify-center gap-2"
              >
                <span>Reset & Try Again</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CctpBridgeComponent;
