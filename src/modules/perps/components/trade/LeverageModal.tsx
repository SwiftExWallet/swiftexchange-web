import { AlertCircle, Loader2, Minus, Plus, Wallet, Zap } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import { useAsterAgent } from '../../adapters/aster/hooks/useAsterAgent';
import { useHyperliquidAgent } from '../../adapters/hyperliquid/hooks/useHyperliquidAgent';
import { useExchangeManager } from '../../core/ExchangeManager';
import { useLeverageStore } from '../../core/stores/leverageStore';
import { useMarketStore } from '../../core/stores/marketStore';
import { useOrderEntryStore } from '../../core/stores/orderEntryStore';
import { useUnifiedExecution } from '../../services/useUnifiedExecution';
import { Modal } from '../ui/Modal';

interface LeverageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LeverageModal: React.FC<LeverageModalProps> = ({ isOpen, onClose }) => {
  const store = useOrderEntryStore();
  const selectedSymbol = useMarketStore(state => state.selectedSymbol);
  const { isReady, updateLeverageForSymbol } = useUnifiedExecution();

  const isEvmConnected = useWalletStore(state => !!state.connectedWallets.evm?.address);
  const openWalletModal = useWalletStore(state => state.openModal);

  const currentExchange = useExchangeManager(s => s.currentExchange);
  const asterAgent = useAsterAgent();
  const hyperliquidAgent = useHyperliquidAgent();
  const activeAgent = currentExchange === 'hyperliquid' ? hyperliquidAgent : asterAgent;

  const quoteAsset = currentExchange === 'hyperliquid' ? 'USDC' : 'USDT';
  const exchangeName = currentExchange === 'hyperliquid' ? 'Hyperliquid' : 'Aster DEX';

  const [leverage, setLeverage] = useState<number>(store.leverage);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const formattedSymbol = selectedSymbol.replace('-', '');
  const leverageBrackets = useLeverageStore(state => state.bracketsBySymbol[formattedSymbol]) || [];

  useEffect(() => {
    if (isOpen) {
      setLeverage(store.leverage);
      setSubmitError(null);
    }
  }, [isOpen, store.leverage]);

  const maxLeverage = useMemo(() => {
    if (leverageBrackets.length === 0) return 20; // fallback
    return Math.max(...leverageBrackets.map(b => b.initialLeverage));
  }, [leverageBrackets]);

  const remainingNotional = useMemo(() => {
    if (leverageBrackets.length === 0) return '...';

    let maxCap = 0;
    for (const b of leverageBrackets) {
      if (b.initialLeverage >= leverage) {
        if (b.notionalCap > maxCap) {
          maxCap = b.notionalCap;
        }
      }
    }

    if (maxCap === 0) return '...';

    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(maxCap);
  }, [leverage, leverageBrackets]);

  const handleConfirm = async () => {
    if (!isReady) {
      setSubmitError(`Please connect wallet and enable 1-Click Trading for ${exchangeName}.`);
      return;
    }

    if (leverage === store.leverage) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await updateLeverageForSymbol(selectedSymbol, leverage, store.marginType !== 'isolated');
      store.setLeverage(leverage, selectedSymbol);
      onClose();
    } catch (err: any) {
      console.error('Failed to change leverage:', err);
      setSubmitError(err?.message || 'Failed to change leverage.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLeverage(parseInt(e.target.value, 10));
  };

  const increment = () => setLeverage(Math.min(maxLeverage, leverage + 1));
  const decrement = () => setLeverage(Math.max(1, leverage - 1));

  const generateSteps = () => {
    const steps = [1];
    const stepSize = Math.floor(maxLeverage / 5);
    for (let i = 1; i < 5; i++) {
      steps.push(Math.round(stepSize * i));
    }
    steps.push(maxLeverage);
    return steps;
  };

  const steps = useMemo(generateSteps, [maxLeverage]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${selectedSymbol} Adjust leverage`}
      width="w-[400px]"
    >
      <div className="space-y-5">
        {/* Warning / Call-to-action banner when agent wallet is not ready */}
        {!isEvmConnected ? (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-[11px] text-amber-300 space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-amber-400">
              <Wallet size={14} />
              <span>Wallet Not Connected</span>
            </div>
            <p className="text-secondary leading-relaxed">
              Connect your EVM wallet to update on-chain leverage on {exchangeName}.
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
              Updating leverage sends an on-chain signed instruction to {exchangeName}. Please
              enable 1-Click Trading first.
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

        <div>
          <label className="text-secondary text-[12px] block mb-2">Leverage</label>
          <div className="flex items-center justify-between border border-color bg-primary rounded-xl px-4 py-3">
            <button
              onClick={decrement}
              className="text-primary hover:text-white transition-colors cursor-pointer"
            >
              <Minus size={16} />
            </button>
            <input
              type="number"
              value={leverage}
              onChange={e =>
                setLeverage(Math.max(1, Math.min(maxLeverage, parseInt(e.target.value) || 1)))
              }
              className="bg-transparent text-primary text-center font-semibold w-16 outline-none text-base"
            />
            <button
              onClick={increment}
              className="text-primary hover:text-white transition-colors cursor-pointer"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div className="relative pt-2">
          <input
            type="range"
            min="1"
            max={maxLeverage}
            value={leverage}
            onChange={handleSliderChange}
            className="w-full h-1.5 bg-tertiary rounded-lg appearance-none cursor-pointer accent-brand"
          />
          <div className="flex justify-between text-secondary text-[10px] mt-2 px-1">
            {steps.map((step, i) => (
              <span key={i}>{step}x</span>
            ))}
          </div>
        </div>

        <div className="border border-color bg-primary p-4 rounded-xl text-center space-y-1">
          <p className="text-secondary text-[11px]">Remaining openable notional value</p>
          <p className="text-primary text-[14px] font-semibold">
            {remainingNotional} {quoteAsset}
          </p>
          <p className="text-secondary text-[10px] pt-1">
            The maximum notional value you can open under your current leverage and system risk
            control limits.
          </p>
        </div>

        <p className="text-secondary text-[11px] leading-relaxed">
          Please note that leverage changing will also apply for open positions and open orders.
          Selecting higher leverage increases your chances of liquidation.
        </p>

        {submitError && (
          <div className="text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5 text-[11px] flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        <button
          onClick={handleConfirm}
          disabled={isSubmitting || !isReady}
          className="w-full bg-brand hover:bg-brand-hover text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-[13px]"
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
