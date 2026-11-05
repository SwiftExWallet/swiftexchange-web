import { Check, CheckCircle2, Copy, Search, X } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';

import { getTokenIcon } from '../../../evm/utils/ChainUrlHelpers';
import { getChainById } from '../../../evm/utils/Chainregistry';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import { portfolioUtils } from '../../../walletconnect/utils/portfolioUtils';
import type { TokenInfo } from '../../types/ammSwap.types';

interface StellarAssetSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokens: TokenInfo[];
  selectedToken: TokenInfo | null;
  onSelect: (token: TokenInfo) => void;
  title?: string;
}

const StellarAssetSelectorModal: React.FC<StellarAssetSelectorModalProps> = ({
  isOpen,
  onClose,
  tokens,
  selectedToken,
  onSelect,
  title = 'Select Asset',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const network = useWalletStore((state: any) => state.network);
  const isTestnet = network !== 'mainnet';
  const stellarChainId = network === 'mainnet' ? 'pubnet' : 'testnet';
  const chainConfig = getChainById(stellarChainId);

  const handleCopyAddress = useCallback((e: React.MouseEvent, addr: string, code: string) => {
    e.stopPropagation();
    if (!addr) return;
    navigator.clipboard.writeText(addr);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }, []);

  const filteredTokens = useMemo(() => {
    const isTestnet = network !== 'mainnet';

    // Sort so canonical contract tokens or tokens with balance take precedence before deduplication
    const sortedTokens = [...tokens].sort((a, b) => {
      const aBal = parseFloat(a.balance || '0');
      const bBal = parseFloat(b.balance || '0');
      if (aBal !== bBal) return bBal - aBal;
      const aScore = (a.contract ? 2 : 0) + (a.isPopular ? 1 : 0);
      const bScore = (b.contract ? 2 : 0) + (b.isPopular ? 1 : 0);
      return bScore - aScore;
    });

    const seen = new Set<string>();
    const deduplicated: TokenInfo[] = [];

    for (const token of sortedTokens) {
      const isNative =
        token.code === 'XLM' ||
        (typeof token.asset?.isNative === 'function' && token.asset.isNative());
      const key = isNative
        ? 'XLM'
        : isTestnet
          ? token.code.toUpperCase()
          : `${token.code.toUpperCase()}:${token.issuer || token.contract || ''}`;

      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(token);
      } else {
        const existing = deduplicated.find(item =>
          isNative
            ? item.code === 'XLM' ||
              (typeof item.asset?.isNative === 'function' && item.asset.isNative())
            : isTestnet
              ? item.code.toUpperCase() === token.code.toUpperCase()
              : item.code.toUpperCase() === token.code.toUpperCase() &&
                (item.issuer === token.issuer || item.contract === token.contract)
        );
        if (
          existing &&
          (!existing.balance || existing.balance === '0') &&
          token.balance &&
          token.balance !== '0'
        ) {
          existing.balance = token.balance;
        }
      }
    }

    return deduplicated
      .filter(token => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return true;
        const code = (token.code || '').toLowerCase();
        const name = (token.name || '').toLowerCase();
        const issuer = (token.issuer || '').toLowerCase();
        const contract = (token.contract || '').toLowerCase();
        return (
          code.includes(query) ||
          name.includes(query) ||
          issuer.includes(query) ||
          contract.includes(query)
        );
      })
      .sort((a, b) => {
        const balanceA = parseFloat(a.balance || '0');
        const balanceB = parseFloat(b.balance || '0');
        return balanceB - balanceA;
      });
  }, [tokens, searchQuery, network]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md bg-secondary rounded-3xl shadow-2xl border border-divider overflow-hidden animate-scale-in">
        <div className="p-4 border-b border-divider flex items-center justify-between">
          <h3 className="text-lg font-black uppercase tracking-wider text-primary">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-hover rounded-full transition-colors text-muted hover:text-primary"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
            <input
              type="text"
              placeholder="Search by symbol or issuer address"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-tertiary border border-divider rounded-2xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-brand transition-all placeholder:text-muted/50 text-primary"
            />
          </div>

          <div className="max-h-[400px] overflow-y-auto no-scrollbar space-y-1">
            {filteredTokens.length === 0 ? (
              <div className="text-center py-8 text-muted">
                <p className="text-sm font-bold uppercase tracking-widest">No assets found</p>
              </div>
            ) : (
              filteredTokens.map((token: any) => {
                const isNative =
                  token.code === 'XLM' ||
                  (typeof token.asset?.isNative === 'function' && token.asset.isNative());
                const isSelected =
                  selectedToken?.code === token.code &&
                  (isNative ||
                    selectedToken?.issuer === token.issuer ||
                    selectedToken?.contract === token.contract);
                const icon =
                  token.icon ||
                  getTokenIcon(token.code, chainConfig, token.issuer || token.contract);
                const addressVal = token.contract || token.issuer || '';
                const displayName =
                  token.name ||
                  (isNative
                    ? 'Stellar'
                    : isTestnet && token.code === 'USDC'
                      ? 'USD Coin'
                      : isTestnet && token.code === 'XTAR'
                        ? 'Dogstar'
                        : token.homeDomain || token.code || 'Stellar Network');

                return (
                  <button
                    key={`${token.code}-${token.contract || token.issuer || 'native'}`}
                    onClick={() => {
                      onSelect(token);
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all group ${
                      isSelected
                        ? 'bg-brand/10 border border-brand/20'
                        : 'hover:bg-hover border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative w-10 h-10 rounded-full bg-tertiary flex items-center justify-center overflow-hidden border border-divider/50 shadow-sm flex-shrink-0">
                        <img
                          src={
                            icon ||
                            `https://ui-avatars.com/api/?name=${token.code}&background=random`
                          }
                          alt={token.code}
                          className="w-full h-full object-cover"
                          onError={e => {
                            (e.target as HTMLImageElement).src =
                              `https://ui-avatars.com/api/?name=${token.code}&background=random`;
                          }}
                        />
                        <img
                          src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/stellar/info/logo.png"
                          alt="Stellar"
                          className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border border-secondary bg-secondary"
                        />
                      </div>
                      <div className="text-left min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-black text-[14px] text-primary">{token.code}</span>
                          {isNative ? (
                            <span className="text-[10px] bg-brand/10 text-brand px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                              Native
                            </span>
                          ) : addressVal ? (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] bg-tertiary text-muted px-1.5 py-0.5 rounded font-mono font-bold uppercase truncate max-w-[85px]">
                                {addressVal.slice(0, 6)}...{addressVal.slice(-4)}
                              </span>
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={e => handleCopyAddress(e, addressVal, token.code)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    handleCopyAddress(e as any, addressVal, token.code);
                                  }
                                }}
                                className="p-0.5 hover:bg-hover rounded text-muted hover:text-primary transition-colors cursor-pointer"
                                title="Copy address"
                              >
                                {copiedCode === token.code ? (
                                  <Check size={11} className="text-green-500" />
                                ) : (
                                  <Copy size={11} />
                                )}
                              </span>
                            </div>
                          ) : null}
                          {isSelected && <CheckCircle2 size={13} className="text-brand ml-0.5" />}
                        </div>
                        <div className="text-xs text-muted truncate max-w-[190px]">
                          {displayName}
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0 ml-3">
                      <div className="text-[13px] font-black text-primary">
                        {portfolioUtils.formatBalance(token.balance || '0')}
                      </div>
                      <div className="text-[10px] text-muted font-bold uppercase tracking-wider">
                        Balance
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="p-4 bg-tertiary border-t border-divider text-center">
          <p className="text-[10px] text-muted font-bold uppercase tracking-widest opacity-60">
            Secure Asset Selection | Stellar network
          </p>
        </div>
      </div>
    </div>
  );
};

export default StellarAssetSelectorModal;
