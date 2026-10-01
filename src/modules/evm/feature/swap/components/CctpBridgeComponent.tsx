import {
  AlertCircle,
  ArrowRight,
  ArrowUpDown,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Info,
  Layers,
  Loader2,
  RefreshCw,
  Zap,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { WalletType } from '../../../../walletconnect/constants/Wallet';
import { useWalletAssets } from '../../../../walletconnect/hooks/useWalletAssets';
import { useWalletConnect } from '../../../../walletconnect/hooks/useWalletConnect';
import { portfolioUtils } from '../../../../walletconnect/utils/portfolioUtils';
import { useEvmToStellarCctp } from '../hooks/useEvmToStellarCctp';

const STELLAR_LOGO =
  'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/stellar/info/logo.png';
const USDC_LOGO =
  'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png';

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

  const {
    assets,
    loading: assetsLoading,
    isRefreshing: assetsRefreshing,
  } = useWalletAssets(currentNetwork);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [manualHash, setManualHash] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  const {
    direction,
    toggleDirection,
    selectedEvmChain,
    setSelectedEvmChainId,
    supportedEvmChains,
    amount,
    setAmount,
    isAvax,
    quote,
    setQuote,
    transfer,
    loading,
    isFetchingQuote,
    isSigning,
    message,
    error,
    status,
    getQuote,
    startBridge,
    retrySignature,
    refreshStatus,
    manualSubmitTxHash,
    reset,
  } = useEvmToStellarCctp({
    evmAddress,
    stellarAddress,
    evmProvider: getProvider(WalletType.EVM),
    stellarProvider: getProvider(WalletType.STELLAR),
    network: currentNetwork,
  });

  const selectedChainId = selectedEvmChain[currentNetwork].chainId;
  const nativeGasSymbol = selectedEvmChain.symbol;

  const evmUsdcBalance = useMemo(() => {
    const asset = assets.find(
      a =>
        a.chainType === 'evm' &&
        Number(a.chainId) === Number(selectedChainId) &&
        a.symbol?.toUpperCase() === 'USDC' &&
        !a.isNative
    );
    return asset?.balance ?? null;
  }, [assets, selectedChainId]);

  const stellarUsdcBalance = useMemo(() => {
    const asset = assets.find(
      a => a.chainType === 'stellar' && a.symbol?.toUpperCase() === 'USDC' && !a.isNative
    );
    return asset?.balance ?? null;
  }, [assets]);

  const evmNativeBalance = useMemo(() => {
    const asset = assets.find(
      a =>
        a.chainType === 'evm' &&
        Number(a.chainId) === Number(selectedChainId) &&
        a.isNative === true
    );
    return asset?.balance ?? null;
  }, [assets, selectedChainId]);

  const stellarXlmBalance = useMemo(() => {
    const asset = assets.find(
      a => a.chainType === 'stellar' && a.symbol?.toUpperCase() === 'XLM' && a.isNative === true
    );
    return asset?.balance ?? null;
  }, [assets]);

  const sourceUsdcBalance = direction === 'EVM_TO_STELLAR' ? evmUsdcBalance : stellarUsdcBalance;
  const sourceNativeBalance = direction === 'EVM_TO_STELLAR' ? evmNativeBalance : stellarXlmBalance;
  const sourceNativeSymbol = direction === 'EVM_TO_STELLAR' ? nativeGasSymbol : 'XLM';
  const isBalanceLoading = assetsLoading || assetsRefreshing;
  const hasLowGas = sourceNativeBalance !== null && sourceNativeBalance < 0.001;

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleMaxAmount = () => {
    if (sourceUsdcBalance !== null && sourceUsdcBalance > 0) {
      setAmount(sourceUsdcBalance.toString());
    }
  };

  const evmExplorerUrl = selectedEvmChain[currentNetwork].explorerUrl;
  const stellarExplorerBase =
    currentNetwork === 'testnet'
      ? 'https://stellar.expert/explorer/testnet/tx'
      : 'https://stellar.expert/explorer/public/tx';

  const isEvmSource = direction === 'EVM_TO_STELLAR';
  const selectedChainDisplayName =
    selectedEvmChain[currentNetwork]?.displayName || selectedEvmChain.name;

  const isSignRequired =
    (status === 'APPROVAL_SIGNATURE_REQUIRED' && !transfer?.approvalTxHash) ||
    ((status === 'BRIDGE_SIGNATURE_REQUIRED' || status === 'BURN_SIGNATURE_REQUIRED') &&
      !transfer?.sourceTxHash) ||
    (status === 'STELLAR_SIGNATURE_REQUIRED' && !transfer?.destinationTxHash) ||
    (status === 'MINT_SIGNATURE_REQUIRED' && !transfer?.destinationTxHash);

  const displayStatus =
    transfer?.sourceTxHash &&
    (status === 'BRIDGE_SIGNATURE_REQUIRED' || status === 'BURN_SIGNATURE_REQUIRED')
      ? 'SOURCE_PENDING'
      : status;

  interface TimelineStep {
    id: string;
    number: number;
    title: string;
    description: string;
    status: 'completed' | 'active' | 'pending';
    statusLabel: string;
    txHash?: string | null;
    txUrl?: string | null;
    extraNote?: string | null;
    requiresAction?: boolean;
    actionLabel?: string;
    onAction?: () => void;
  }

  const verticalSteps = useMemo<TimelineStep[]>(() => {
    if (!transfer) return [];

    if (direction === 'EVM_TO_STELLAR') {
      // Step 1: Approval
      const isApproveDone = Boolean(
        transfer.approvalTxHash ||
        [
          'BRIDGE_SIGNATURE_REQUIRED',
          'SOURCE_PENDING',
          'ATTESTATION_PENDING',
          'STELLAR_SIGNATURE_REQUIRED',
          'DESTINATION_PENDING',
          'COMPLETED',
        ].includes(status)
      );
      const isApproveAction = status === 'APPROVAL_SIGNATURE_REQUIRED' && !transfer.approvalTxHash;
      const isApprovePending = status === 'APPROVAL_PENDING';
      const step1Status: 'completed' | 'active' | 'pending' = isApproveDone
        ? 'completed'
        : isApproveAction || isApprovePending
          ? 'active'
          : 'pending';

      // Step 2: Deposit
      const isDepositDone = Boolean(
        transfer.attestation ||
        [
          'ATTESTATION_PENDING',
          'STELLAR_SIGNATURE_REQUIRED',
          'DESTINATION_PENDING',
          'COMPLETED',
        ].includes(status)
      );
      const isDepositAction = status === 'BRIDGE_SIGNATURE_REQUIRED' && !transfer.sourceTxHash;
      const isDepositPending =
        Boolean(transfer.sourceTxHash && !transfer.attestation && status === 'SOURCE_PENDING') ||
        (status === 'BRIDGE_SIGNATURE_REQUIRED' && Boolean(transfer.sourceTxHash));
      const step2Status: 'completed' | 'active' | 'pending' = isDepositDone
        ? 'completed'
        : isDepositAction || isDepositPending || Boolean(transfer.sourceTxHash)
          ? 'active'
          : 'pending';

      // Step 3: Attestation
      const isAttestationDone = Boolean(
        transfer.attestation ||
        ['STELLAR_SIGNATURE_REQUIRED', 'DESTINATION_PENDING', 'COMPLETED'].includes(status)
      );
      const isAttestationPending =
        !isAttestationDone &&
        (status === 'ATTESTATION_PENDING' ||
          (Boolean(transfer.sourceTxHash) && !transfer.attestation));
      const step3Status: 'completed' | 'active' | 'pending' = isAttestationDone
        ? 'completed'
        : isAttestationPending
          ? 'active'
          : 'pending';

      // Step 4: Mint
      const isMintDone = status === 'COMPLETED' || Boolean(transfer.destinationTxHash);
      const isMintAction = status === 'STELLAR_SIGNATURE_REQUIRED' && !transfer.destinationTxHash;
      const isMintPending = status === 'DESTINATION_PENDING';
      const step4Status: 'completed' | 'active' | 'pending' = isMintDone
        ? 'completed'
        : isMintAction || isMintPending
          ? 'active'
          : 'pending';

      return [
        {
          id: 'approval',
          number: 1,
          title: 'USDC Token Approval',
          description: `Allow Circle TokenMessenger router to spend USDC on ${selectedChainDisplayName}`,
          status: step1Status,
          statusLabel: isApproveDone
            ? 'Approved'
            : isApproveAction
              ? 'Action Required'
              : isApprovePending
                ? 'Confirming...'
                : 'Pending',
          txHash: transfer.approvalTxHash,
          txUrl: transfer.approvalTxHash ? `${evmExplorerUrl}/tx/${transfer.approvalTxHash}` : null,
          requiresAction: isApproveAction,
          actionLabel: `Approve USDC in ${selectedChainDisplayName} Wallet`,
          onAction: retrySignature,
        },
        {
          id: 'deposit',
          number: 2,
          title: 'Deposit & Burn USDC',
          description: `Burn USDC on ${selectedChainDisplayName} via Circle CCTP contract`,
          status: step2Status,
          statusLabel: isDepositDone
            ? 'Burn Confirmed'
            : isDepositAction
              ? 'Action Required'
              : Boolean(transfer.sourceTxHash) || isDepositPending
                ? 'Confirming On-Chain...'
                : 'Pending',
          txHash: transfer.sourceTxHash,
          txUrl: transfer.sourceTxHash ? `${evmExplorerUrl}/tx/${transfer.sourceTxHash}` : null,
          requiresAction: isDepositAction,
          actionLabel: `Sign & Broadcast Deposit in ${selectedChainDisplayName} Wallet`,
          onAction: retrySignature,
        },
        {
          id: 'attestation',
          number: 3,
          title: 'Circle Iris Verification',
          description: 'Decentralized Circle validator network issues signed burn attestation',
          status: step3Status,
          statusLabel: isAttestationDone
            ? 'Attestation Verified'
            : isAttestationPending
              ? 'Verifying (~1-2 min)...'
              : 'Pending',
          extraNote: transfer.attestation
            ? `Proof: ${transfer.attestation.slice(0, 10)}...${transfer.attestation.slice(-6)}`
            : null,
        },
        {
          id: 'mint',
          number: 4,
          title: 'Mint USDC on Stellar',
          description: `Receive native USDC in Stellar wallet (${stellarAddress ? `${stellarAddress.slice(0, 6)}...${stellarAddress.slice(-4)}` : 'Stellar'})`,
          status: step4Status,
          statusLabel: isMintDone
            ? 'Mint Completed'
            : isMintAction
              ? 'Action Required'
              : isMintPending
                ? 'Submitting to Stellar...'
                : 'Pending',
          txHash: transfer.destinationTxHash,
          txUrl: transfer.destinationTxHash
            ? `${stellarExplorerBase}/${transfer.destinationTxHash}`
            : null,
          requiresAction: isMintAction,
          actionLabel: 'Sign & Mint in Stellar Wallet',
          onAction: retrySignature,
        },
      ];
    } else {
      // STELLAR_TO_EVM
      // Step 1: Stellar Approval
      const isApproveDone = Boolean(
        transfer.approvalTxHash ||
        [
          'BURN_SIGNATURE_REQUIRED',
          'BRIDGE_SIGNATURE_REQUIRED',
          'SOURCE_PENDING',
          'ATTESTATION_PENDING',
          'DESTINATION_PENDING',
          'COMPLETED',
        ].includes(status)
      );
      const isApproveAction = status === 'APPROVAL_SIGNATURE_REQUIRED' && !transfer.approvalTxHash;
      const isApprovePending = status === 'APPROVAL_PENDING';
      const step1Status: 'completed' | 'active' | 'pending' = isApproveDone
        ? 'completed'
        : isApproveAction || isApprovePending
          ? 'active'
          : 'pending';

      // Step 2: Stellar Burn
      const isBurnDone = Boolean(
        transfer.sourceTxHash ||
        [
          'ATTESTATION_PENDING',
          'MINT_SIGNATURE_REQUIRED',
          'DESTINATION_PENDING',
          'COMPLETED',
        ].includes(status)
      );
      const isBurnAction =
        !transfer.sourceTxHash &&
        ([
          'BURN_SIGNATURE_REQUIRED',
          'BRIDGE_SIGNATURE_REQUIRED',
          'STELLAR_SIGNATURE_REQUIRED',
        ].includes(status) ||
          (status === 'APPROVAL_SIGNATURE_REQUIRED' && Boolean(transfer.approvalTxHash)));
      const step2Status: 'completed' | 'active' | 'pending' = isBurnDone
        ? 'completed'
        : isBurnAction || (Boolean(transfer.sourceTxHash) && !transfer.attestation)
          ? 'active'
          : 'pending';

      // Step 3: Attestation
      const isAttestDone = Boolean(
        transfer.attestation ||
        ['MINT_SIGNATURE_REQUIRED', 'DESTINATION_PENDING', 'COMPLETED'].includes(status)
      );
      const isAttestPending = !isAttestDone && status === 'ATTESTATION_PENDING';
      const step3Status: 'completed' | 'active' | 'pending' = isAttestDone
        ? 'completed'
        : isAttestPending
          ? 'active'
          : 'pending';

      // Step 4: EVM Mint
      const isMintDone = status === 'COMPLETED' || Boolean(transfer.destinationTxHash);
      const isMintAction =
        !isMintDone &&
        (status === 'MINT_SIGNATURE_REQUIRED' ||
          (status === 'DESTINATION_PENDING' && !transfer.destinationTxHash));
      const isMintPending = status === 'DESTINATION_PENDING' && Boolean(transfer.destinationTxHash);
      const step4Status: 'completed' | 'active' | 'pending' = isMintDone
        ? 'completed'
        : isMintAction || isMintPending
          ? 'active'
          : 'pending';

      return [
        {
          id: 'stellar_approval',
          number: 1,
          title: 'Approve USDC on Stellar',
          description: 'Authorize CCTP TokenMessenger contract to access USDC on Stellar',
          status: step1Status,
          statusLabel: isApproveDone
            ? 'Approved'
            : isApproveAction
              ? 'Action Required'
              : isApprovePending
                ? 'Confirming on Stellar...'
                : 'Pending',
          txHash: transfer.approvalTxHash,
          txUrl: transfer.approvalTxHash
            ? `${stellarExplorerBase}/${transfer.approvalTxHash}`
            : null,
          requiresAction: isApproveAction,
          actionLabel: 'Sign Approval in Stellar Wallet',
          onAction: retrySignature,
        },
        {
          id: 'stellar_burn',
          number: 2,
          title: 'Burn USDC on Stellar',
          description: 'Initiate CCTP transfer on Stellar network via Circle TokenMessenger',
          status: step2Status,
          statusLabel: isBurnDone
            ? 'Burn Confirmed'
            : isBurnAction
              ? 'Action Required'
              : transfer.sourceTxHash
                ? 'Confirming On-Chain...'
                : 'Pending',
          txHash: transfer.sourceTxHash,
          txUrl: transfer.sourceTxHash ? `${stellarExplorerBase}/${transfer.sourceTxHash}` : null,
          requiresAction: isBurnAction,
          actionLabel:
            status === 'APPROVAL_SIGNATURE_REQUIRED' && transfer.approvalTxHash
              ? 'Proceed to Burn USDC'
              : 'Sign & Broadcast Burn on Stellar',
          onAction: retrySignature,
        },
        {
          id: 'attestation',
          number: 3,
          title: 'Circle Iris Verification',
          description: 'Decentralized Circle validator network issues signed burn attestation',
          status: step3Status,
          statusLabel: isAttestDone
            ? 'Attestation Verified'
            : isAttestPending
              ? 'Verifying...'
              : 'Pending',
          extraNote: transfer.attestation
            ? `Proof: ${transfer.attestation.slice(0, 10)}...${transfer.attestation.slice(-6)}`
            : null,
        },
        {
          id: 'evm_mint',
          number: 4,
          title: `Mint USDC on ${selectedChainDisplayName}`,
          description: `Submit attestation to Circle TokenMessenger on ${selectedChainDisplayName}`,
          status: step4Status,
          statusLabel: isMintDone
            ? 'Mint Completed'
            : isMintAction
              ? 'Action Required'
              : isMintPending
                ? 'Submitting to EVM...'
                : 'Pending',
          txHash: transfer.destinationTxHash,
          txUrl: transfer.destinationTxHash
            ? `${evmExplorerUrl}/tx/${transfer.destinationTxHash}`
            : null,
          requiresAction: isMintAction,
          actionLabel: `Sign & Mint in ${selectedChainDisplayName} Wallet`,
          onAction: retrySignature,
        },
      ];
    }
  }, [
    transfer,
    direction,
    status,
    selectedChainDisplayName,
    evmExplorerUrl,
    stellarExplorerBase,
    stellarAddress,
    retrySignature,
  ]);

  const sortedSupportedChains = useMemo(() => {
    return [...supportedEvmChains].sort((a, b) => {
      if (a.id === selectedEvmChain.id) return -1;
      if (b.id === selectedEvmChain.id) return 1;
      return 0;
    });
  }, [supportedEvmChains, selectedEvmChain.id]);

  return (
    <div className="mx-auto w-full max-w-full overflow-hidden space-y-3 font-sans">
      {/* EVM Chain Selection Bar */}
      <div className="bg-secondary/40 backdrop-blur-sm rounded-2xl p-2.5 sm:p-3 border border-divider/40 space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
            <Layers size={13} className="text-brand shrink-0" />
            {isEvmSource ? 'Select Source EVM Chain' : 'Select Destination EVM Chain'}
          </span>
          {!isEvmSource && (
            <span className="text-[10px] text-amber-400 font-semibold bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              {currentNetwork === 'testnet' ? 'Sepolia only' : 'Ethereum only'}
            </span>
          )}
        </div>
        <div className="relative -mx-1 px-1">
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar scroll-smooth py-1 px-0.5">
            {sortedSupportedChains.map(chain => {
              const isSupportedForDirection = isEvmSource || chain.id === 'ethereum';
              const isSelected = chain.id === selectedEvmChain.id;
              const chainDisplayName = chain[currentNetwork]?.displayName || chain.symbol;
              const isChainAvax = chain.id === 'avalanche' || chain.symbol === 'AVAX';

              return (
                <button
                  key={chain.id}
                  type="button"
                  onClick={() => {
                    if (transfer || !isSupportedForDirection) return;
                    setSelectedEvmChainId(chain[currentNetwork].chainId);
                    setQuote(null);
                  }}
                  disabled={Boolean(transfer) || !isSupportedForDirection}
                  className={`shrink-0 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs whitespace-nowrap transition-all duration-200 relative ${
                    isSelected
                      ? 'bg-brand text-white shadow-md shadow-brand/20 font-bold scale-[1.02] ring-1 ring-brand/50'
                      : isSupportedForDirection
                        ? 'bg-secondary/80 border border-divider/40 text-muted hover:text-primary hover:bg-secondary font-semibold active:scale-[0.98]'
                        : 'bg-secondary/30 border border-divider/20 text-muted/30 cursor-not-allowed opacity-40'
                  } ${transfer ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={
                    !isSupportedForDirection
                      ? `Stellar to EVM is currently supported for ${currentNetwork === 'testnet' ? 'Sepolia' : 'Ethereum'} only`
                      : chain.name
                  }
                >
                  <img
                    src={chain.logo}
                    alt={chain.name}
                    className={`w-4 h-4 rounded-full object-contain shrink-0 ${!isSupportedForDirection ? 'opacity-30 grayscale' : ''}`}
                    onError={e => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <span>{chainDisplayName}</span>
                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0 shadow-sm animate-pulse" />
                  )}
                  {isChainAvax && (
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      Std
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Avalanche Informational Alert Banner (Clean & Non-Crowded) */}
      {isAvax && (
        <div className="flex items-center gap-2 p-2.5 sm:p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs animate-fade-in">
          <Info size={14} className="shrink-0 text-amber-400" />
          <p className="text-[11px] leading-snug">
            <strong className="text-amber-100">Avalanche Notice:</strong> Fast Transfer is not
            supported on Avalanche. Transfers execute with standard ~15–20 min finality.
          </p>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-400 animate-fade-in">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Bridge Notice</p>
            <p className="mt-0.5 break-words opacity-90">{error}</p>
          </div>
        </div>
      )}

      {!transfer ? (
        <div className="space-y-0 relative">
          {/* Pay Card - Monolithic Native Swap Style */}
          <div className="bg-tertiary rounded-2xl p-4 py-6 lg:p-6 shadow-sm relative overflow-hidden flex flex-col border border-divider/50 w-full max-w-full">
            <div
              className={`absolute left-0 top-0 bottom-0 w-1 bg-brand transition-all duration-300 ${
                isInputFocused ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-50'
              }`}
            />

            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <label className="text-xs font-black uppercase tracking-[0.15em] text-muted opacity-90">
                You Pay
              </label>
              {sourceUsdcBalance !== null && sourceUsdcBalance > 0 && (
                <button
                  type="button"
                  onClick={handleMaxAmount}
                  className="text-[10px] font-black text-brand hover:scale-110 active:scale-95 transition-all px-3 py-1 bg-brand/10 border border-brand/20 rounded-full"
                >
                  MAX
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 sm:gap-4">
              {/* Token Selector Pill matching native swap UI */}
              <div
                className="flex items-center gap-2 bg-secondary rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 relative group flex-[0_0_auto] min-w-0"
                style={{ width: 'clamp(120px, 32vw, 160px)' }}
              >
                <div className="relative min-w-[36px] sm:min-w-[40px]">
                  <img
                    src={USDC_LOGO}
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-tertiary object-cover shadow-sm"
                    alt="USDC"
                  />
                  <img
                    src={isEvmSource ? selectedEvmChain.logo : STELLAR_LOGO}
                    className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full border-2 border-secondary bg-secondary object-contain"
                    alt={isEvmSource ? selectedChainDisplayName : 'Stellar'}
                  />
                </div>
                <div className="flex flex-col items-start pr-1 min-w-0 overflow-hidden">
                  <span className="font-bold text-[13px] sm:text-[15px] leading-tight truncate w-full text-primary">
                    USDC
                  </span>
                  <span className="text-[8px] sm:text-[9px] text-muted font-bold tracking-tight truncate w-full uppercase">
                    {isEvmSource ? selectedChainDisplayName : 'STELLAR'}
                  </span>
                </div>
              </div>

              {/* Amount Input */}
              <div className="flex-1 w-0 min-w-0">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  onChange={e => {
                    const val = e.target.value;
                    if (/^\d*\.?\d*$/.test(val)) {
                      setAmount(val);
                    }
                  }}
                  className={`w-full bg-transparent border-none text-right font-black focus:ring-0 p-0 placeholder:text-muted/10 transition-all outline-none min-w-0 block ${
                    amount.length > 10
                      ? 'text-xl sm:text-2xl md:text-3xl'
                      : amount.length > 7
                        ? 'text-2xl sm:text-3xl md:text-4xl'
                        : 'text-3xl sm:text-4xl'
                  } text-primary`}
                />
              </div>
            </div>

            {/* Bottom Row */}
            <div className="mt-4 sm:mt-6 space-y-2">
              <div className="flex flex-wrap justify-between items-center gap-2 text-[10px] sm:text-[11px] font-bold">
                <div className="flex items-center gap-1.5 sm:gap-2 text-muted">
                  <span>Balance:</span>
                  {isBalanceLoading ? (
                    <span className="w-20 h-3 rounded animate-shimmer-brand bg-white/10 inline-block" />
                  ) : (
                    <span className="text-primary font-black">
                      {sourceUsdcBalance !== null
                        ? `${portfolioUtils.formatBalance(sourceUsdcBalance)} USDC`
                        : '--'}
                    </span>
                  )}
                  {isEvmSource
                    ? !evmAddress && (
                        <button
                          type="button"
                          onClick={() => openModal?.()}
                          className="text-brand hover:underline font-bold ml-1"
                        >
                          (Connect EVM)
                        </button>
                      )
                    : !stellarAddress && (
                        <button
                          type="button"
                          onClick={() => openModal?.()}
                          className="text-brand hover:underline font-bold ml-1"
                        >
                          (Connect Stellar)
                        </button>
                      )}
                </div>
                <span className="text-muted font-semibold">
                  ≈ ${amount && parseFloat(amount) > 0 ? parseFloat(amount).toFixed(2) : '0.00'} USD
                </span>
              </div>

              <div className="flex flex-wrap justify-between items-center gap-2 text-[10px] sm:text-[11px] font-bold">
                <div className="flex items-center gap-1.5 text-muted">
                  <span>Gas ({sourceNativeSymbol}):</span>
                  {isBalanceLoading ? (
                    <span className="w-16 h-3 rounded animate-shimmer-brand bg-white/10 inline-block" />
                  ) : (
                    <span
                      className={`font-black ${hasLowGas ? 'text-red-400' : sourceNativeBalance !== null && sourceNativeBalance > 0 ? 'text-emerald-400' : 'text-muted'}`}
                    >
                      {sourceNativeBalance !== null
                        ? `${portfolioUtils.formatBalance(sourceNativeBalance)} ${sourceNativeSymbol}`
                        : '--'}
                    </span>
                  )}
                  {hasLowGas && (
                    <span className="text-red-400 text-[9px] font-bold bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full">
                      Low Gas
                    </span>
                  )}
                </div>
                <span className="text-[9px] text-muted/60 font-semibold">Needed for tx fees</span>
              </div>
            </div>
          </div>

          {/* Swap Middle Button matching native swap UI */}
          <div className="flex justify-center -my-4 lg:-my-5 relative z-10">
            <div className="relative flex items-center justify-center w-12 h-12 md:w-14 md:h-14">
              <button
                type="button"
                onClick={toggleDirection}
                disabled={Boolean(transfer)}
                className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-secondary flex items-center justify-center shadow-lg hover:scale-115 active:scale-90 transition-all duration-300 text-brand group backdrop-blur-md border border-white/10 hover:border-brand/40 relative z-10 disabled:opacity-40"
                title="Switch bridge direction"
              >
                <ArrowUpDown
                  size={18}
                  className="group-hover:rotate-180 transition-transform duration-500"
                />
              </button>
            </div>
          </div>

          {/* Receive Card - Monolithic Native Swap Style */}
          <div className="bg-tertiary rounded-2xl p-4 py-6 lg:p-6 shadow-sm relative overflow-hidden flex flex-col border border-divider/50 w-full max-w-full">
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <label className="text-xs font-black uppercase tracking-[0.15em] text-muted opacity-90">
                You Receive
              </label>
              <span className="text-[10px] font-bold text-muted">
                {!isEvmSource
                  ? quote?.estimatedTime
                    ? String(quote.estimatedTime)
                    : '~50s – 1m'
                  : isAvax
                    ? 'Standard Finality (~15-20m)'
                    : '⚡ Fast Transfer (~1-2m)'}
              </span>
            </div>

            <div className="flex items-center gap-3 sm:gap-4">
              {/* Token Selector Pill matching native swap UI */}
              <div
                className="flex items-center gap-2 bg-secondary rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 relative group flex-[0_0_auto] min-w-0"
                style={{ width: 'clamp(120px, 32vw, 160px)' }}
              >
                <div className="relative min-w-[36px] sm:min-w-[40px]">
                  <img
                    src={USDC_LOGO}
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-tertiary object-cover shadow-sm"
                    alt="USDC"
                  />
                  <img
                    src={!isEvmSource ? selectedEvmChain.logo : STELLAR_LOGO}
                    className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full border-2 border-secondary bg-secondary object-contain"
                    alt={!isEvmSource ? selectedChainDisplayName : 'Stellar'}
                  />
                </div>
                <div className="flex flex-col items-start pr-1 min-w-0 overflow-hidden">
                  <span className="font-bold text-[13px] sm:text-[15px] leading-tight truncate w-full text-primary">
                    USDC
                  </span>
                  <span className="text-[8px] sm:text-[9px] text-muted font-bold tracking-tight truncate w-full uppercase">
                    {!isEvmSource ? selectedChainDisplayName : 'STELLAR'}
                  </span>
                </div>
              </div>

              {/* Output Display */}
              <div className="flex-1 w-0 min-w-0 flex flex-col items-end">
                <div className="max-w-full overflow-x-auto whitespace-nowrap scrollbar-hide">
                  <div
                    className={`font-black text-primary transition-all duration-300 tabular-nums ${
                      (quote?.minimumReceived || amount || '').length > 10
                        ? 'text-xl sm:text-2xl md:text-3xl'
                        : (quote?.minimumReceived || amount || '').length > 7
                          ? 'text-2xl sm:text-3xl md:text-4xl'
                          : 'text-3xl sm:text-4xl'
                    }`}
                  >
                    {isFetchingQuote ? (
                      <div className="flex flex-col items-end gap-1.5 py-1">
                        <div className="w-32 sm:w-44 h-8 sm:h-9 rounded-xl animate-shimmer-brand bg-white/5" />
                      </div>
                    ) : quote ? (
                      <span>{quote.minimumReceived}</span>
                    ) : amount && parseFloat(amount) > 0 ? (
                      <span>{(parseFloat(amount) * 0.995).toFixed(4)}</span>
                    ) : (
                      '0.00'
                    )}
                  </div>
                </div>
                {amount && parseFloat(amount) > 0 && (
                  <div className="text-[11px] font-bold text-muted/60 mt-1">
                    ≈ $
                    {quote
                      ? parseFloat(quote.minimumReceived).toFixed(2)
                      : (parseFloat(amount) * 0.995).toFixed(2)}{' '}
                    USD
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Row */}
            <div className="mt-4 sm:mt-6 flex flex-wrap justify-between items-center gap-2 text-[10px] sm:text-[11px] font-bold">
              <div className="flex items-center gap-1.5 sm:gap-2 text-muted">
                <span>Balance:</span>
                {isBalanceLoading ? (
                  <span className="w-20 h-3 rounded animate-shimmer-brand bg-white/10 inline-block" />
                ) : (
                  <span className="text-primary font-black">
                    {!isEvmSource
                      ? evmUsdcBalance !== null
                        ? `${portfolioUtils.formatBalance(evmUsdcBalance)} USDC`
                        : '--'
                      : stellarUsdcBalance !== null
                        ? `${portfolioUtils.formatBalance(stellarUsdcBalance)} USDC`
                        : '--'}
                  </span>
                )}
                {!isEvmSource
                  ? !evmAddress && (
                      <button
                        type="button"
                        onClick={() => openModal?.()}
                        className="text-brand hover:underline font-bold ml-1"
                      >
                        (Connect EVM)
                      </button>
                    )
                  : !stellarAddress && (
                      <button
                        type="button"
                        onClick={() => openModal?.()}
                        className="text-brand hover:underline font-bold ml-1"
                      >
                        (Connect Stellar)
                      </button>
                    )}
              </div>
              <span className="text-muted font-semibold">1 USDC = 1 USDC (Native)</span>
            </div>

            {/* QUOTE BREAKDOWN - SEAMLESS INLINE MONOLITHIC DISPLAY (NO BORDER BOX) */}
            <div className="pt-4 sm:pt-5 mt-4 sm:mt-5 border-t border-dotted border-white/10 space-y-1">
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                  Provider
                </span>
                <div className="flex items-center gap-1.5">
                  <img src={USDC_LOGO} className="w-4 h-4 rounded-full" alt="Circle Iris CCTP" />
                  <span className="text-[11px] font-bold text-primary">Circle Iris CCTP</span>
                </div>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                  Route
                </span>
                <span className="text-[11px] font-bold text-primary">
                  {isEvmSource
                    ? `${selectedChainDisplayName} → Stellar`
                    : `Stellar → ${selectedChainDisplayName}`}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                  Transfer Time
                </span>
                <span
                  className={`text-[11px] font-bold ${
                    !isEvmSource ? 'text-primary' : isAvax ? 'text-amber-400' : 'text-emerald-400'
                  }`}
                >
                  {!isEvmSource
                    ? quote?.estimatedTime
                      ? String(quote.estimatedTime)
                      : '~50s – 1m'
                    : isAvax
                      ? 'Standard Finality (~15-20m)'
                      : '⚡ Fast Transfer (~1-2m)'}
                </span>
              </div>

              {quote && (
                <>
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                      Protocol Fee ({quote.feeBps ? `${Number(quote.feeBps) / 100}%` : '0.5%'})
                    </span>
                    <span className="text-[11px] font-bold text-primary">
                      {quote.protocolFee} USDC
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                      Circle Network Fee
                    </span>
                    <span className="text-[11px] font-bold text-primary">{quote.maxFee} USDC</span>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                      Guaranteed Minimum
                    </span>
                    <span className="text-xs font-black text-emerald-400">
                      {quote.minimumReceived} USDC
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
          {/* Low Gas Warning Banner */}
          {hasLowGas && (evmAddress || stellarAddress) && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300 animate-fade-in">
              <Info size={14} className="shrink-0 mt-0.5 text-amber-400" />
              <p className="leading-snug">
                <strong className="text-amber-200">
                  {sourceNativeSymbol} balance is very low.
                </strong>{' '}
                You may not have enough gas to complete this bridge transaction. Please top up{' '}
                {sourceNativeSymbol} before proceeding.
              </p>
            </div>
          )}

          {/* ACTION BUTTON */}
          <div className="pt-3">
            {!quote ? (
              <button
                type="button"
                onClick={() => getQuote()}
                disabled={
                  loading ||
                  isFetchingQuote ||
                  !amount ||
                  parseFloat(amount) <= 0 ||
                  !evmAddress ||
                  !stellarAddress
                }
                className="w-full py-4 px-4 rounded-2xl bg-brand text-white font-bold text-sm hover:opacity-95 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand/20"
              >
                {isFetchingQuote ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Fetching Best CCTP Quote...</span>
                  </>
                ) : !amount || parseFloat(amount) <= 0 ? (
                  <span>Enter USDC Amount</span>
                ) : !evmAddress || !stellarAddress ? (
                  <span>Connect Both Wallets to Bridge</span>
                ) : (
                  <span>Get Bridge Quote</span>
                )}
              </button>
            ) : (
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => getQuote()}
                  disabled={loading || isFetchingQuote}
                  className="p-4 rounded-2xl bg-secondary border border-divider/50 hover:bg-hover text-muted hover:text-primary transition-all shrink-0"
                  title="Refresh Quote"
                >
                  <RefreshCw size={16} className={isFetchingQuote ? 'animate-spin' : ''} />
                </button>
                <button
                  type="button"
                  onClick={startBridge}
                  disabled={loading || isFetchingQuote}
                  className="flex-1 py-4 px-4 rounded-2xl bg-brand text-white font-bold text-sm hover:opacity-95 active:scale-[0.99] disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand/20"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Initiating Transfer...</span>
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
        </div>
      ) : (
        /* Transfer Execution & Vertical Stepper Card */
        <div className="bg-secondary/60 backdrop-blur-md rounded-2xl p-4 sm:p-6 border border-divider/40 space-y-5 animate-fade-in">
          {/* Header Info */}
          <div className="flex items-center justify-between pb-3 border-b border-divider/40">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-muted">
                Bridge Progress (
                {isEvmSource
                  ? `${selectedChainDisplayName} → Stellar`
                  : `Stellar → ${selectedChainDisplayName}`}
                )
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs font-mono text-muted/80">
                  ID: {transfer.id.slice(0, 10)}...{transfer.id.slice(-6)}
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
                  title="Refresh Status"
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
                    : displayStatus === 'CANCELLED'
                      ? 'bg-orange-500/20 text-orange-400'
                      : isSignRequired
                        ? 'bg-amber-500/20 text-amber-400 animate-pulse'
                        : 'bg-brand/20 text-brand'
              }`}
            >
              {displayStatus.replace(/_/g, ' ')}
            </span>
          </div>

          {/* Vertical Modern Step Timeline */}
          <div className="space-y-3 py-1">
            {verticalSteps.map((step, idx) => {
              const isLast = idx === verticalSteps.length - 1;
              const isCompleted = step.status === 'completed';
              const isActive = step.status === 'active';

              return (
                <div key={step.id} className="relative flex gap-3.5">
                  {/* Left Vertical Node & Track */}
                  <div className="flex flex-col items-center">
                    <div className="relative flex items-center justify-center">
                      {isActive && (
                        <span
                          className={`absolute -inset-1 rounded-full ${
                            step.requiresAction ? 'bg-amber-500/30' : 'bg-brand/30'
                          } animate-ping opacity-75`}
                        />
                      )}
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 shrink-0 z-10 ${
                          isCompleted
                            ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 shadow-sm shadow-emerald-500/20'
                            : isActive
                              ? step.requiresAction
                                ? 'bg-amber-500/20 border border-amber-500/60 text-amber-400 ring-2 ring-amber-500/30 shadow-md shadow-amber-500/20'
                                : 'bg-brand/20 border border-brand/60 text-brand ring-2 ring-brand/30 shadow-md shadow-brand/20'
                              : 'bg-secondary border border-divider/40 text-muted/50'
                        }`}
                      >
                        {isCompleted ? (
                          <Check size={14} className="stroke-[3]" />
                        ) : isActive && !step.requiresAction ? (
                          <Loader2 size={13} className="animate-spin text-brand" />
                        ) : (
                          <span>{step.number}</span>
                        )}
                      </div>
                    </div>
                    {!isLast && (
                      <div
                        className={`w-0.5 flex-1 my-1 transition-all duration-500 ${
                          isCompleted
                            ? 'bg-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                            : isActive
                              ? 'bg-gradient-to-b from-brand/50 to-divider/30 animate-pulse'
                              : 'bg-divider/30'
                        }`}
                      />
                    )}
                  </div>

                  {/* Step Card */}
                  <div
                    className={`flex-1 rounded-xl p-3 border transition-all duration-300 ${
                      isActive
                        ? step.requiresAction
                          ? 'bg-gradient-to-r from-amber-500/10 via-secondary/95 to-secondary/90 border-amber-500/40 shadow-md shadow-amber-500/5 ring-1 ring-amber-500/20'
                          : 'bg-gradient-to-r from-brand/10 via-secondary/95 to-secondary/90 border-brand/40 shadow-md shadow-brand/5 ring-1 ring-brand/20'
                        : isCompleted
                          ? 'bg-secondary/70 border-emerald-500/20'
                          : 'bg-secondary/30 border-divider/20 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4
                        className={`text-xs font-bold ${
                          isActive ? 'text-primary' : isCompleted ? 'text-primary/90' : 'text-muted'
                        }`}
                      >
                        {step.title}
                      </h4>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                          isCompleted
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : isActive
                              ? step.requiresAction
                                ? 'bg-amber-500/15 text-amber-400 animate-pulse'
                                : 'bg-brand/15 text-brand'
                              : 'bg-secondary text-muted/60'
                        }`}
                      >
                        {step.statusLabel}
                      </span>
                    </div>

                    <p className="text-[11px] text-muted mt-0.5 leading-relaxed">
                      {step.description}
                    </p>

                    {/* Tx Hash Link */}
                    {step.txHash && step.txUrl && (
                      <div className="mt-2 pt-2 border-t border-divider/30 flex items-center justify-between text-[11px]">
                        <span className="text-muted font-mono">
                          Tx: {step.txHash.slice(0, 8)}...{step.txHash.slice(-6)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleCopy(step.txHash!, `step_${step.id}`)}
                            className="text-muted hover:text-primary p-0.5"
                            title="Copy Hash"
                          >
                            {copiedField === `step_${step.id}` ? (
                              <Check size={12} className="text-emerald-400" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                          <a
                            href={step.txUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand hover:underline flex items-center gap-0.5 font-medium"
                          >
                            <span>Explorer</span>
                            <ExternalLink size={11} />
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Extra note (Attestation proof) */}
                    {step.extraNote && (
                      <div className="mt-1.5 text-[11px] font-mono text-emerald-400/90 flex items-center gap-1">
                        <Check size={11} />
                        <span>{step.extraNote}</span>
                      </div>
                    )}

                    {/* Step Action Button right inside this step */}
                    {step.requiresAction && step.onAction && (
                      <div className="space-y-2 mt-2.5">
                        <button
                          type="button"
                          onClick={step.onAction}
                          disabled={isSigning}
                          className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-brand to-brand/90 hover:from-brand/95 hover:to-brand text-white font-bold text-xs hover:opacity-95 active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-md shadow-brand/25 relative overflow-hidden group"
                        >
                          <span className="absolute inset-0 w-full h-full bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                          {isSigning ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              <span>Confirming in Wallet...</span>
                            </>
                          ) : (
                            <>
                              <Zap size={13} className="fill-current text-white animate-pulse" />
                              <span>{step.actionLabel}</span>
                            </>
                          )}
                        </button>

                        {/* Manual Tx Hash Option (for cases where mobile wallet doesn't return hash across bridge) */}
                        <div className="pt-1 text-center">
                          {!showManualInput ? (
                            <button
                              type="button"
                              onClick={() => setShowManualInput(true)}
                              className="text-[11px] text-muted hover:text-brand transition-colors underline"
                            >
                              Signed in wallet but not progressing? Enter Tx Hash
                            </button>
                          ) : (
                            <div className="p-2.5 rounded-lg bg-secondary border border-divider/50 space-y-1.5 text-left">
                              <span className="text-[10px] text-muted font-semibold block">
                                Enter 64-character transaction hash:
                              </span>
                              <div className="flex gap-1.5">
                                <input
                                  type="text"
                                  value={manualHash}
                                  onChange={e => setManualHash(e.target.value)}
                                  placeholder="0a08dc... or 0x..."
                                  className="flex-1 bg-tertiary px-2 py-1 text-xs font-mono rounded border border-divider/40 text-primary placeholder:text-muted/40 focus:outline-none focus:border-brand"
                                />
                                <button
                                  type="button"
                                  disabled={!manualHash.trim() || manualSubmitting}
                                  onClick={async () => {
                                    if (!manualHash.trim()) return;
                                    setManualSubmitting(true);
                                    try {
                                      await manualSubmitTxHash(manualHash.trim());
                                      setManualHash('');
                                      setShowManualInput(false);
                                    } finally {
                                      setManualSubmitting(false);
                                    }
                                  }}
                                  className="px-2.5 py-1 bg-brand text-white text-xs font-bold rounded hover:opacity-90 disabled:opacity-40 shrink-0 flex items-center gap-1"
                                >
                                  {manualSubmitting ? (
                                    <Loader2 size={12} className="animate-spin" />
                                  ) : (
                                    'Submit'
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setShowManualInput(false)}
                                  className="px-2 py-1 text-xs text-muted hover:text-primary rounded border border-divider/40 shrink-0"
                                >
                                  Close
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Dynamic Status Message */}
          {message && (
            <div className="p-3 rounded-xl bg-secondary/80 border border-divider/40 flex items-center gap-2 text-xs text-primary">
              {(loading ||
                isSigning ||
                [
                  'SOURCE_PENDING',
                  'ATTESTATION_PENDING',
                  'DESTINATION_PENDING',
                  'APPROVAL_PENDING',
                ].includes(status)) && (
                <Loader2 size={14} className="animate-spin text-brand shrink-0" />
              )}
              <span>{message}</span>
            </div>
          )}

          {/* Completed State Celebration */}
          {status === 'COMPLETED' && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-2">
              <div className="flex items-center justify-center gap-1.5 text-emerald-400 font-bold text-sm">
                <CheckCircle2 size={18} />
                <span>Bridge Transfer Successful!</span>
              </div>
              <p className="text-xs text-muted">
                Received native USDC on {isEvmSource ? 'Stellar' : selectedChainDisplayName}.
              </p>
              <button
                type="button"
                onClick={reset}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-sm"
              >
                Start New Transfer
              </button>
            </div>
          )}

          {/* Failed or Cancelled State */}
          {(status === 'FAILED' || status === 'CANCELLED') && (
            <div
              className={`p-4 rounded-xl border space-y-3 ${
                status === 'CANCELLED'
                  ? 'bg-orange-500/10 border-orange-500/20'
                  : 'bg-red-500/10 border-red-500/20'
              }`}
            >
              <div
                className={`flex items-center gap-2 font-bold text-xs ${
                  status === 'CANCELLED' ? 'text-orange-400' : 'text-red-400'
                }`}
              >
                <AlertCircle size={16} />{' '}
                {status === 'CANCELLED' ? 'Transfer Cancelled / Rejected' : 'Transfer Failed'}
              </div>
              <p className="text-xs text-muted">
                {error ||
                  (status === 'CANCELLED'
                    ? 'Transaction was rejected or cancelled in your wallet.'
                    : 'An error occurred during transfer execution.')}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={retrySignature}
                  className="flex-1 py-2 rounded-xl bg-brand text-white font-bold text-xs hover:opacity-90 transition-all"
                >
                  Retry Signing
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="flex-1 py-2 rounded-xl bg-secondary border border-divider/50 hover:bg-hover text-primary font-bold text-xs transition-all"
                >
                  Reset
                </button>
              </div>
            </div>
          )}

          {/* Reset link for non-completed transfers so user is never stuck */}
          {status !== 'COMPLETED' && status !== 'FAILED' && status !== 'CANCELLED' && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={reset}
                className="text-[11px] text-muted hover:text-red-400 hover:underline transition-colors"
              >
                Cancel & Reset Transfer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CctpBridgeComponent;
