import { AlertCircle, Check, Loader2, Wallet, Zap } from 'lucide-react';
import React, { useState } from 'react';

import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import { useAsterAgent } from '../../adapters/aster/hooks/useAsterAgent';
import { useHyperliquidAgent } from '../../adapters/hyperliquid/hooks/useHyperliquidAgent';
import { useExchangeManager } from '../../core/ExchangeManager';
import { useMarketStore } from '../../core/stores/marketStore';
import { useOrderEntryStore } from '../../core/stores/orderEntryStore';
import { useUnifiedExecution } from '../../services/useUnifiedExecution';
import { Modal } from '../ui/Modal';

interface MarginModeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MarginModeModal: React.FC<MarginModeModalProps> = ({ isOpen, onClose }) => {
  const store = useOrderEntryStore();
  const selectedSymbol = useMarketStore(state => state.selectedSymbol);
  const { isReady, updateMarginModeForSymbol } = useUnifiedExecution();

  const isEvmConnected = useWalletStore(state => !!state.connectedWallets.evm?.address);
  const openWalletModal = useWalletStore(state => state.openModal);

  const currentExchange = useExchangeManager(s => s.currentExchange);
  const asterAgent = useAsterAgent();
  const hyperliquidAgent = useHyperliquidAgent();
  const activeAgent = currentExchange === 'hyperliquid' ? hyperliquidAgent : asterAgent;

  const [selectedMode, setSelectedMode] = useState<'cross' | 'isolated'>(store.marginType);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const exchangeName = currentExchange === 'hyperliquid' ? 'Hyperliquid' : 'Aster DEX';

  const handleConfirm = async () => {
    if (!isReady) {
      setSubmitError(`Please connect wallet and enable 1-Click Trading for ${exchangeName}.`);
      return;
    }

    if (selectedMode === store.marginType) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await updateMarginModeForSymbol(selectedSymbol, selectedMode, store.leverage);
      store.setMarginType(selectedMode, selectedSymbol);
      onClose();
    } catch (err: any) {
      console.error('Failed to change margin type:', err);
      setSubmitError(err?.message || 'Failed to change margin type.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${selectedSymbol} Margin mode`}
      width="w-[400px]"
    >
      <div className="space-y-4">
        <p className="text-secondary text-[12px]">
          Switching of margin mode only applies to the selected contract ({selectedSymbol}) on{' '}
          {exchangeName}.
        </p>

        {/* Warning / Call-to-action banner when agent wallet is not ready */}
        {!isEvmConnected ? (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-[11px] text-amber-300 space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-amber-400">
              <Wallet size={14} />
              <span>Wallet Not Connected</span>
            </div>
            <p className="text-secondary leading-relaxed">
              Connect your EVM wallet to change on-chain margin mode on {exchangeName}.
            </p>
            <button
              type="button"
              onClick={openWalletModal}
              className="w-full py-2 bg-brand hover:bg-brand-hover text-white rounded-lg font-semibold text-[12px] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Wallet size={13} />
              <span>Connect EVM Wallet</span>
            </button>
          </div>
        ) : !isReady ? (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-[11px] text-amber-300 space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-amber-400">
              <AlertCircle size={14} />
              <span>Trading Session Required</span>
            </div>
            <p className="text-secondary leading-relaxed">
              Changing margin mode requires an authorized trading session on {exchangeName}.
            </p>
            <button
              type="button"
              onClick={async () => {
                try {
                  await activeAgent.deriveAgentKey();
                } catch (err) {
                  console.error('Failed to enable agent:', err);
                }
              }}
              disabled={activeAgent.deriveState === 'signing'}
              className="w-full py-2 bg-brand hover:bg-brand-hover text-white rounded-lg font-semibold text-[12px] transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {activeAgent.deriveState === 'signing' ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Waiting for Wallet Signature...</span>
                </>
              ) : (
                <>
                  <Zap size={13} className="fill-white" />
                  <span>Enable 1-Click Trading</span>
                </>
              )}
            </button>
          </div>
        ) : null}

        <div className="flex gap-4">
          <button
            onClick={() => setSelectedMode('cross')}
            className={`flex-1 py-3 rounded-xl border relative font-medium text-[13px] transition-colors cursor-pointer
              ${
                selectedMode === 'cross'
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-color bg-secondary text-primary hover:bg-hover'
              }`}
          >
            Cross
            {selectedMode === 'cross' && (
              <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-brand text-white rounded-full flex items-center justify-center">
                <Check size={10} strokeWidth={4} />
              </div>
            )}
          </button>

          <button
            onClick={() => setSelectedMode('isolated')}
            className={`flex-1 py-3 rounded-xl border relative font-medium text-[13px] transition-colors cursor-pointer
              ${
                selectedMode === 'isolated'
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-color bg-secondary text-primary hover:bg-hover'
              }`}
          >
            Isolated
            {selectedMode === 'isolated' && (
              <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-brand rounded-full flex items-center justify-center text-white">
                <Check size={10} strokeWidth={4} />
              </div>
            )}
          </button>
        </div>

        <div className="bg-primary p-4 rounded-xl space-y-2 mt-2 border border-color">
          <h4 className="text-primary text-[12px] font-semibold">
            What are cross and isolated modes?
          </h4>
          <p className="text-secondary text-[11px] leading-relaxed">
            The Margin assigned to a position is restricted to a certain amount. If the Margin falls
            below the Maintenance Margin level, the position is liquidated. However, you can add and
            remove Margin at will under this mode.
          </p>
        </div>

        {submitError && (
          <div className="text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5 text-[11px] flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        <button
          onClick={handleConfirm}
          disabled={isSubmitting || !isReady}
          className="w-full mt-4 bg-brand hover:bg-brand-hover text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-[13px]"
        >
          {!isEvmConnected
            ? 'Connect Wallet to Confirm'
            : !isReady
              ? 'Enable 1-Click Trading to Confirm'
              : isSubmitting
                ? 'Confirming...'
                : 'Confirm'}
        </button>
      </div>
    </Modal>
  );
};
