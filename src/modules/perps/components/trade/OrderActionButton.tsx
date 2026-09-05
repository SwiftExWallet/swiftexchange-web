import { AlertCircle, Loader2, Wallet, Zap } from 'lucide-react';
import React from 'react';

import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import { useAsterAgent } from '../../adapters/aster/hooks/useAsterAgent';
import { useHyperliquidAgent } from '../../adapters/hyperliquid/hooks/useHyperliquidAgent';
import { useExchangeManager } from '../../core/ExchangeManager';

interface OrderActionButtonProps {
  onSubmit: (side: 'BUY' | 'SELL') => void;
  isLoading?: boolean;
  isValid?: boolean;
  validationError?: string;
  onOpenDepositModal: () => void;
  walletBalance: number;
  actionSubtext?: string;
}

export const OrderActionButton: React.FC<OrderActionButtonProps> = ({
  onSubmit,
  isLoading,
  isValid = true,
  validationError,
  onOpenDepositModal,
  walletBalance,
  actionSubtext,
}) => {
  const isEvmConnected = useWalletStore(state => !!state.connectedWallets.evm?.address);
  const openWalletModal = useWalletStore(state => state.openModal);

  const asterAgent = useAsterAgent();
  const hyperliquidAgent = useHyperliquidAgent();
  const currentExchange = useExchangeManager(s => s.currentExchange);
  const currentNetwork = useExchangeManager(s => s.currentNetwork);
  const activeAgent = currentExchange === 'hyperliquid' ? hyperliquidAgent : asterAgent;
  const { isReady: isAgentReady, deriveAgentKey, deriveState, error: deriveError } = activeAgent;
  const hasFunds = walletBalance > 0;
  const isDepositError = deriveState === 'error' && deriveError?.message?.includes('Must deposit');

  if (!isEvmConnected) {
    return (
      <button
        type="button"
        onClick={openWalletModal}
        className="w-full bg-brand hover:bg-brand-hover text-white rounded-lg py-2.5 font-semibold text-[13px] transition-all mt-2 cursor-pointer shadow-sm flex items-center justify-center gap-2"
      >
        <Wallet className="w-4 h-4" />
        <span>Connect EVM Wallet</span>
      </button>
    );
  }

  if (!isAgentReady) {
    const isSigning = deriveState === 'signing';
    const isError = deriveState === 'error';

    return (
      <div className="mt-2 space-y-1.5">
        <button
          type="button"
          onClick={() => {
            if (isDepositError) {
              onOpenDepositModal();
            } else {
              deriveAgentKey();
            }
          }}
          disabled={isSigning}
          className={`w-full h-10 rounded-lg font-semibold text-[13px] transition-all flex items-center justify-center gap-2 cursor-pointer select-none active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed ${
            isSigning
              ? 'bg-brand/80 text-white cursor-wait'
              : isError
                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25'
                : 'bg-brand hover:bg-brand-hover text-white shadow-[0_2px_12px_rgba(var(--color-brand-rgb),0.3)] hover:shadow-[0_4px_20px_rgba(var(--color-brand-rgb),0.45)]'
          }`}
        >
          {isSigning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>Waiting for Wallet Signature...</span>
            </>
          ) : isError ? (
            <>
              <AlertCircle className="w-4 h-4 text-rose-400" />
              <span>
                {isDepositError ? 'Deposit to Enable Trading' : 'Signature Rejected — Try Again'}
              </span>
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 text-white fill-white" />
              <span>Enable 1-Click Trading</span>
            </>
          )}
        </button>

        <p className="text-[10px] text-center text-secondary leading-tight">
          {isSigning
            ? 'Confirm the signature request in your wallet'
            : `One-time signature to activate gas-free execution on ${currentExchange === 'hyperliquid' ? 'Hyperliquid' : 'Aster V3'}`}
        </p>
      </div>
    );
  }

  if (!hasFunds) {
    return (
      <div className="mt-2 space-y-1.5">
        <button
          type="button"
          onClick={onOpenDepositModal}
          className="w-full h-10 bg-brand hover:bg-brand-hover text-white rounded-lg font-semibold text-[13px] transition-all cursor-pointer shadow-sm flex items-center justify-center gap-2 active:scale-[0.99]"
        >
          <span>
            {currentNetwork === 'testnet' ? 'Claim Testnet Faucet' : 'Deposit Funds to Trade'}
          </span>
        </button>
        <p className="text-[10px] text-center text-muted">
          Available margin is 0.00 {currentExchange === 'hyperliquid' ? 'USDC' : 'USDT'}
        </p>
      </div>
    );
  }

  const isInvalid = isValid === false || !!validationError;

  return (
    <div className="flex gap-2 mt-2">
      <button
        type="button"
        onClick={() => !isInvalid && onSubmit('BUY')}
        disabled={isLoading || isInvalid}
        className="flex-1 h-10 flex flex-col items-center justify-center rounded-lg font-semibold text-[13px] bg-success text-white hover:bg-success/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm cursor-pointer active:scale-[0.99]"
      >
        <span>{isLoading ? 'Placing...' : 'Buy / Long'}</span>
        {actionSubtext && (
          <span className="text-[10px] font-medium opacity-90">{actionSubtext}</span>
        )}
      </button>
      <button
        type="button"
        onClick={() => !isInvalid && onSubmit('SELL')}
        disabled={isLoading || isInvalid}
        className="flex-1 h-10 flex flex-col items-center justify-center rounded-lg font-semibold text-[13px] bg-danger text-white hover:bg-danger/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm cursor-pointer active:scale-[0.99]"
      >
        <span>{isLoading ? 'Placing...' : 'Sell / Short'}</span>
        {actionSubtext && (
          <span className="text-[10px] font-medium opacity-90">{actionSubtext}</span>
        )}
      </button>
    </div>
  );
};
