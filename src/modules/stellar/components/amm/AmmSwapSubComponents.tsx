import { AlertCircle, ChevronDown, Info } from 'lucide-react';
import React, { memo, useState } from 'react';

import { getTokenIcon } from '../../../evm/utils/ChainUrlHelpers';
import { getChainById } from '../../../evm/utils/Chainregistry';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import type { SwapQuote, TokenInfo, TokenPlaceholder } from '../../types/ammSwap.types';

interface TokenSelectorProps {
  selectedToken: TokenInfo | TokenPlaceholder;
  onSelect: (token: TokenInfo) => void;
  tokens: TokenInfo[];
  label?: string;
}

export const TokenSelector: React.FC<TokenSelectorProps> = memo(
  ({ selectedToken, onSelect, tokens }) => {
    const [isOpen, setIsOpen] = useState(false);
    const network = useWalletStore(state => state.network);
    const chainId = network === 'mainnet' ? 'pubnet' : 'testnet';
    const chainConfig = getChainById(chainId);

    const tokenIcon = getTokenIcon(
      selectedToken.code,
      chainConfig,
      'issuer' in selectedToken ? selectedToken.issuer : undefined
    );

    return (
      <div className="relative ">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-5 rounded-lg bg-primary hover:bg-hover transition-colors min-w-[120px]"
        >
          {tokenIcon ? (
            <img
              src={tokenIcon}
              alt={selectedToken.code}
              className="w-5 h-5 rounded-full"
              onError={e => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white">
              {selectedToken.code[0]}
            </div>
          )}
          <span className="font-semibold text-sm text-primary">{selectedToken.code}</span>
          <ChevronDown
            className={`w-4 h-4 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <div className="absolute right-0 top-full mt-2 z-50 bg-secondary rounded-lg border border-color py-1 min-w-[180px] max-h-[300px] overflow-y-auto">
              {tokens.map(token => {
                const icon = getTokenIcon(token.code, chainConfig, token.issuer);
                const isSelected = selectedToken.code === token.code;

                return (
                  <button
                    key={`${token.code}-${token.issuer || 'native'}`}
                    onClick={() => {
                      onSelect(token);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-hover transition-colors ${
                      isSelected ? 'bg-hover' : ''
                    }`}
                  >
                    {icon ? (
                      <img
                        src={icon}
                        alt={token.code}
                        className="w-6 h-6 rounded-full"
                        onError={e => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white">
                        {token.code[0]}
                      </div>
                    )}

                    <div className="flex-1 text-left">
                      <div className="font-semibold text-sm text-primary">{token.code}</div>
                      {token.balance && (
                        <div className="text-xs text-muted">
                          {parseFloat(token.balance).toFixed(4)}
                        </div>
                      )}
                    </div>

                    {isSelected && <div className="w-2 h-2 rounded-full bg-green-500" />}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }
);

interface SettingsPanelProps {
  slippage: number;
  onSlippageChange: (slippage: number, dynamic?: boolean) => void;
  isOpen: boolean;
  onClose: () => void;
  isDynamic?: boolean;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = memo(
  ({ slippage, onSlippageChange, isOpen, onClose, isDynamic }: SettingsPanelProps) => {
    const presets = [0.1, 0.5, 1, 2, 5];
    const [custom, setCustom] = useState('');

    if (!isOpen) return null;

    return (
      <>
        <div className="fixed inset-0 bg-bg-overlay z-20" onClick={onClose} />
        <div className="absolute card right-0 top-14 z-30 w-80 bg-secondary rounded-xl border border-color p-4 animate-slide-up shadow-xl">
          <h3 className="heading-3 mb-4">Transaction Settings</h3>

          <div className="mb-4">
            <label className="text-small text-muted mb-2 block">Slippage Tolerance</label>
            <div className="grid grid-cols-6 gap-1.5 mb-2">
              <button
                onClick={() => {
                  onSlippageChange(0.5, true);
                  setCustom('');
                }}
                className={`btn btn-secondary btn-sm text-xs font-bold ${
                  isDynamic ? 'bg-brand-primary text-text-inverse ring-1 ring-brand-primary' : ''
                }`}
              >
                Auto
              </button>
              {presets.map(preset => (
                <button
                  key={preset}
                  onClick={() => {
                    onSlippageChange(preset, false);
                    setCustom('');
                  }}
                  className={`btn btn-secondary btn-sm ${
                    !isDynamic && slippage === preset ? 'bg-brand-primary text-text-inverse' : ''
                  }`}
                >
                  {preset}%
                </button>
              ))}
            </div>
            <input
              type="number"
              placeholder="Custom"
              value={custom}
              onChange={e => {
                setCustom(e.target.value);
                const val = parseFloat(e.target.value);
                if (!isNaN(val) && val > 0) {
                  onSlippageChange(val, false);
                }
              }}
              className="input input-primary w-full text-sm"
            />
          </div>

          {isDynamic ? (
            <div className="flex items-center gap-2 p-2.5 bg-brand-primary/10 border border-brand-primary/20 rounded-lg text-xs text-brand-primary">
              <Info className="w-4 h-4 shrink-0" />
              <span>Dynamic auto-slippage active (optimizes based on market conditions).</span>
            </div>
          ) : slippage > 5 ? (
            <div className="flex items-start gap-2 p-3 bg-warning-light border border-warning rounded-lg animate-fade-in">
              <AlertCircle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
              <p className="text-xs text-warning">
                High slippage tolerance may result in unfavorable rates
              </p>
            </div>
          ) : null}
        </div>
      </>
    );
  }
);

interface SwapDetailsProps {
  quote: SwapQuote | null;
  isLoading?: boolean;
}

export const SwapDetails: React.FC<SwapDetailsProps> = memo(
  ({ quote, isLoading }: SwapDetailsProps) => {
    if (!quote) {
      if (isLoading) {
        return (
          <div className="pt-4 border-t border-dotted border-white/10 space-y-2 animate-fade-in">
            <div className="flex items-center justify-between py-1.5 border-b border-white/5">
              <div className="w-16 h-3 rounded bg-white/5 animate-shimmer" />
              <div className="w-28 h-4 rounded-md animate-shimmer-brand" />
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-white/5">
              <div className="w-12 h-3 rounded bg-white/5 animate-shimmer" />
              <div className="w-36 h-3.5 rounded-md animate-shimmer" />
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-white/5">
              <div className="w-20 h-3 rounded bg-white/5 animate-shimmer" />
              <div className="w-24 h-3.5 rounded-md animate-shimmer" />
            </div>
            <div className="flex items-center justify-between py-1.5">
              <div className="w-20 h-3 rounded bg-white/5 animate-shimmer" />
              <div className="w-24 h-3.5 rounded-md animate-shimmer-brand" />
            </div>
          </div>
        );
      }
      return null;
    }

    const inputNum = parseFloat(quote.inputAmount) || 1;
    const outputNum = parseFloat(quote.estimatedOutput) || 0;
    const rate =
      quote.path.path[0].code === quote.path.path[1].code
        ? '1.000000'
        : (outputNum / inputNum).toFixed(6);

    const priceImpactColor =
      quote.priceImpact > 5
        ? 'text-red-500'
        : quote.priceImpact > 2
          ? 'text-amber-500'
          : 'text-[#00E08B]';

    const providerName =
      quote.source === 'SOROSWAP'
        ? quote.platform?.toLowerCase() === 'sdex'
          ? 'Soroswap Router (SDEX)'
          : 'Soroswap Router'
        : quote.source === 'AQUARIUS'
          ? 'Aquarius Router'
          : 'Classic Horizon AMM';

    const providerLogo =
      quote.source === 'SOROSWAP'
        ? '/soroswap.png'
        : quote.source === 'AQUARIUS'
          ? '/aqua-logo.png'
          : 'https://cryptologos.cc/logos/stellar-xlm-logo.png';

    const fromCode = quote.path.path[0]?.code || 'Asset';
    const toCode = quote.path.path[quote.path.path.length - 1]?.code || 'Asset';
    const hops = quote.path.hops || 1;

    return (
      <div className="pt-4 border-t border-dotted border-white/10 space-y-1 animate-fade-in">
        {/* Routing Provider */}
        <div className="flex items-center justify-between py-2 border-b border-white/5">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted">
            Provider
          </span>
          <div className="flex items-center gap-1.5">
            <img
              src={providerLogo}
              className="w-4 h-4 rounded-full object-contain"
              alt={providerName}
              onError={e => {
                (e.target as HTMLImageElement).src =
                  'https://cryptologos.cc/logos/stellar-xlm-logo.png';
              }}
            />
            <span className="text-[11px] font-black text-brand uppercase tracking-wider">
              {providerName}
            </span>
          </div>
        </div>

        {/* Rate */}
        <div className="flex items-center justify-between py-2 border-b border-white/5">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted">Rate</span>
          <span className="text-[11px] font-black text-primary truncate ml-2 flex-1 w-0 text-right min-w-0">
            1 {fromCode} ≈ {rate} {toCode}
          </span>
        </div>

        {/* Route */}
        <div className="flex items-center justify-between py-2 border-b border-white/5">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted">Route</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-black text-primary">
              {quote.path.path.map(t => t.code).join(' → ')}
            </span>
            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-white/5 text-muted border border-white/10">
              {hops === 1 ? 'Direct' : `${hops} hops`}
            </span>
          </div>
        </div>

        {/* Price Impact */}
        <div className="flex items-center justify-between py-2 border-b border-white/5">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted">
            Price Impact
          </span>
          <span className={`text-[11px] font-black ${priceImpactColor}`}>
            {quote.priceImpact.toFixed(2)}%
          </span>
        </div>

        {/* Minimum Received */}
        <div className="flex items-center justify-between py-2 border-b border-white/5">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted">
            Min. Received
          </span>
          <span className="text-[11px] font-black text-primary">
            {(() => {
              const minNum = parseFloat(quote.minimumOutput) || 0;
              return minNum < 1 && minNum > 0 ? minNum.toFixed(6) : minNum.toFixed(4);
            })()}{' '}
            {toCode}
          </span>
        </div>

        {/* Network Fee */}
        <div className="flex items-center justify-between py-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted">
            Network Fee
          </span>
          <span className="text-[11px] font-black text-primary">~0.00001 XLM</span>
        </div>
      </div>
    );
  }
);
