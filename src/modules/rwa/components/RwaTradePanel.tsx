import {
  ArrowLeft,
  ArrowUpDown,
  ChevronDown,
  ExternalLink,
  Info,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ROUTES } from '@/constants/routes';
import { WalletType } from '@/modules/walletconnect/constants/Wallet';
import { useWalletConnect } from '@/modules/walletconnect/hooks/useWalletConnect';

import { gasPrice, nativeBalance, tokenBalance } from '../api/balances';
import { getCachedPrice, loadPrices } from '../api/prices';
import { type RwaQuoteResult, getRwaQuote } from '../api/quote';
import { getCachedXStatus, loadXStatuses } from '../api/xstocksStatus';
import { APPROVE_GAS, CHAIN_INFO, RWA_TRADING_ENABLED } from '../config/rwaConfig';
import { llamaKey } from '../data/assets';
import type { RwaHoldingItem } from '../hooks/useRwaHoldings';
import { executeRwaOrder } from '../orders/executeOrder';
import type { PayToken, RwaChain, RwaGroup, RwaOrderRecord } from '../types/rwa.types';
import {
  cleanAmountInput,
  fmtAmount,
  fmtPct,
  fmtUsd,
  fromUnits,
  nativeCostText,
  toUnits,
} from '../utils/amounts';
import { assetMarketStatus } from '../utils/marketHours';
import { quoteFigures, smallEthOrder } from '../utils/quoteMath';
import {
  QUOTE_DEBOUNCE_MS,
  QUOTE_REFRESH_MS,
  amountError,
  closedText,
  fmtHolding,
  pickRoute,
  rateText,
  spendToUsd,
} from '../utils/swapForm';
import { payOptionsFor, tradeChecks } from '../utils/tradeRules';
import { RwaLogo } from './RwaLogo';
import { AlertBanner, DetailRow, MarketBadge } from './RwaPrimitives';

interface RwaTradePanelProps {
  group: RwaGroup;
  side: 'buy' | 'sell';
  holdings: RwaHoldingItem[];
  onSideChange: (side: 'buy' | 'sell') => void;
  onBack: () => void;
  onOrderStarted: (record: RwaOrderRecord) => void;
  onOrderUpdated: (record: RwaOrderRecord) => void;
}

const BUY_PRESETS = ['25', '50', '100'] as const;
const SELL_PCTS = [25, 50, 75, 100] as const;

export const RwaTradePanel: React.FC<RwaTradePanelProps> = ({
  group,
  side,
  holdings,
  onSideChange,
  onBack,
  onOrderStarted,
  onOrderUpdated,
}) => {
  const navigate = useNavigate();
  const { connectedWallets, getProvider } = useWalletConnect();
  const evmAddress = connectedWallets[WalletType.EVM]?.address || '';

  const isStellarOnly = group.chains.length === 1 && group.chains[0] === 'XLM';
  const evmChains = useMemo(
    () => group.chains.filter((c): c is 'ETH' | 'BSC' => c === 'ETH' || c === 'BSC'),
    [group]
  );

  const payOptionsByChain = useMemo(() => {
    const out: Partial<Record<RwaChain, PayToken[]>> = {};
    evmChains.forEach(c => {
      out[c] = payOptionsFor(group.byChain[c]);
    });
    return out;
  }, [evmChains, group]);

  const [chain, setChain] = useState<'ETH' | 'BSC'>(
    evmChains.includes('BSC') ? 'BSC' : evmChains[0] || 'ETH'
  );
  const [paySym, setPaySym] = useState<PayToken['symbol']>('USDC');
  const [amount, setAmount] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [balances, setBalances] = useState<Partial<Record<RwaChain, Record<string, number>>>>({});
  const [nativeWei, setNativeWei] = useState<string | null>(null);
  const [gasWei, setGasWei] = useState<string | null>(null);
  const [priceTick, setPriceTick] = useState(0);

  const [quoteState, setQuoteState] = useState<{
    loading: boolean;
    result: RwaQuoteResult | null;
    quotedAt: number | null;
  }>({ loading: false, result: null, quotedAt: null });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const routePickedRef = useRef(false);

  const activeAsset = group.byChain[chain] || group.primary;
  const payOpts = payOptionsByChain[chain] || [];
  const payToken = payOpts.find(p => p.symbol === paySym) || payOpts[0];

  const px = priceTick >= 0 ? getCachedPrice(llamaKey(activeAsset)) : null;
  const marketPrice = px?.price ?? null;
  const nativePrice = getCachedPrice(CHAIN_INFO[chain].nativePriceKey)?.price ?? null;
  const xStatus = group.issuer === 'xstocks' ? getCachedXStatus(group.symbol) : null;
  const mStatus = xStatus || assetMarketStatus(group);
  const closed = closedText(mStatus, new Date(), group.issuer === 'ondo');

  const assetHoldings = holdings.filter(h =>
    group.chains.some(c => group.byChain[c]?.id === h.asset.id)
  );

  useEffect(() => {
    let alive = true;
    loadPrices([llamaKey(activeAsset), CHAIN_INFO[chain].nativePriceKey]).then(
      () => alive && setPriceTick(t => t + 1)
    );
    if (group.issuer === 'xstocks') {
      loadXStatuses([group.symbol]).then(() => alive && setPriceTick(t => t + 1));
    }

    if (!evmAddress || isStellarOnly)
      return () => {
        alive = false;
      };
    (async () => {
      const nextBals: Partial<Record<RwaChain, Record<string, number>>> = {};
      await Promise.all(
        evmChains.map(async c => {
          const entry: Record<string, number> = {};
          const a = group.byChain[c];
          if (a?.address) {
            const rawA = await tokenBalance(c, a.address, evmAddress).catch(() => '0');
            entry.asset = Number(fromUnits(rawA, a.decimals) || 0);
          }
          await Promise.all(
            (payOptionsByChain[c] || []).map(async p => {
              const rawP = await tokenBalance(c, p.address, evmAddress).catch(() => '0');
              entry[p.symbol] = Number(fromUnits(rawP, p.decimals) || 0);
            })
          );
          nextBals[c] = entry;
        })
      );
      if (!alive) return;
      setBalances(nextBals);
      if (!routePickedRef.current) {
        routePickedRef.current = true;
        const picked = pickRoute({
          side,
          chains: evmChains,
          payOptionsByChain,
          balances: nextBals,
        });
        if (picked && (picked.chain === 'ETH' || picked.chain === 'BSC')) {
          setChain(picked.chain);
          setPaySym(picked.paySym);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [evmAddress, evmChains, group, payOptionsByChain, side, activeAsset, chain, isStellarOnly]);

  useEffect(() => {
    if (!evmAddress || isStellarOnly) return;
    let alive = true;
    Promise.all([
      nativeBalance(chain, evmAddress).catch(() => null),
      gasPrice(chain).catch(() => null),
    ]).then(([nb, gp]) => {
      if (!alive) return;
      setNativeWei(nb);
      setGasWei(gp);
    });
    return () => {
      alive = false;
    };
  }, [chain, evmAddress, isStellarOnly]);

  const spendSymbol = side === 'buy' ? payToken?.symbol || 'USDC' : activeAsset.symbol;
  const spendDecimals = side === 'buy' ? payToken?.decimals || 6 : activeAsset.decimals;
  const receiveSymbol = side === 'buy' ? activeAsset.symbol : payToken?.symbol || 'USDC';
  const spendBal = (balances[chain] || {})[side === 'buy' ? spendSymbol : 'asset'] ?? 0;
  const receiveBal =
    (balances[chain] || {})[side === 'buy' ? 'asset' : payToken?.symbol || 'USDC'] ?? 0;
  const amountUnits = toUnits(amount, spendDecimals);

  const ruleCheck = tradeChecks({
    asset: activeAsset,
    side,
    amount,
    unitPriceUsd: side === 'buy' ? 1 : marketPrice,
  });

  const hasAmount = Boolean(amountUnits);
  const insufficient = hasAmount && Number(amount) > spendBal;
  const approveFeeWei = gasWei ? (BigInt(gasWei) * BigInt(APPROVE_GAS)).toString() : null;
  const lowGas =
    hasAmount && Boolean(nativeWei && approveFeeWei && BigInt(nativeWei) < BigInt(approveFeeWei));

  const inlineError = amountError({
    ruleError: ruleCheck.error,
    insufficient,
    spendSymbol,
    lowGas,
    nativeSymbol: CHAIN_INFO[chain].native,
  });

  const quoteWallet = evmAddress || '0x000000000000000000000000000000000000dEaD';

  const fetchQuote = useCallback(async () => {
    if (!payToken || !amountUnits || ruleCheck.error || isStellarOnly) {
      setQuoteState({ loading: false, result: null, quotedAt: null });
      return;
    }
    setQuoteState(prev => ({ ...prev, loading: true }));
    const res = await getRwaQuote({
      side,
      asset: activeAsset,
      payToken,
      amountUnits,
      wallet: quoteWallet,
    });
    setQuoteState({ loading: false, result: res, quotedAt: res.ok ? Date.now() : null });
  }, [quoteWallet, payToken, amountUnits, ruleCheck.error, side, activeAsset, isStellarOnly]);

  useEffect(() => {
    if (!amountUnits || ruleCheck.error || isStellarOnly) {
      setQuoteState({ loading: false, result: null, quotedAt: null });
      return;
    }
    const t = setTimeout(fetchQuote, QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [amountUnits, ruleCheck.error, fetchQuote, isStellarOnly]);

  useEffect(() => {
    if (!quoteState.quotedAt) return;
    const t = setInterval(fetchQuote, QUOTE_REFRESH_MS);
    return () => clearInterval(t);
  }, [quoteState.quotedAt, fetchQuote]);

  const quoteOk = quoteState.result?.ok ? quoteState.result : null;
  const quoteErr = quoteState.result && !quoteState.result.ok ? quoteState.result.error : null;

  const outDecimals = side === 'buy' ? activeAsset.decimals : payToken?.decimals || 6;
  const outHuman = quoteOk?.summary.toAmount
    ? fromUnits(quoteOk.summary.toAmount, outDecimals)
    : null;
  const minHuman = quoteOk?.summary.minReceived
    ? fromUnits(quoteOk.summary.minReceived, outDecimals)
    : null;
  const feeHuman = quoteOk?.summary.tokenFee
    ? fromUnits(quoteOk.summary.tokenFee, outDecimals)
    : '0';

  const figs = quoteFigures({
    side,
    amountIn: amount,
    out: outHuman,
    fee: feeHuman,
    marketPrice,
  });
  const usdVal = spendToUsd({ side, amount, price: marketPrice });

  const flipSide = () => {
    setAmount('');
    setSubmitError(null);
    onSideChange(side === 'buy' ? 'sell' : 'buy');
  };

  const handleConfirm = async () => {
    if (!quoteOk || !quoteState.quotedAt || !payToken || !amountUnits || !evmAddress) return;
    setSubmitError(null);
    setSubmitting(true);
    const provider = getProvider(WalletType.EVM);
    const amountText = `${amount} ${spendSymbol} → ~${fmtAmount(outHuman)} ${receiveSymbol}`;
    const res = await executeRwaOrder(
      {
        wallet: evmAddress,
        provider,
        asset: activeAsset,
        side,
        payToken,
        amountUnits,
        amountText,
        quote: quoteOk.quote,
        summary: quoteOk.summary,
        quotedAt: quoteState.quotedAt,
        groupKey: group.key,
      },
      record => {
        if (record.stage === 'preparing') onOrderStarted(record);
        else onOrderUpdated(record);
      }
    );
    setSubmitting(false);
    if ('error' in res) setSubmitError(res.error);
  };

  const canConfirm = Boolean(
    RWA_TRADING_ENABLED &&
    evmAddress &&
    quoteOk &&
    !inlineError &&
    !quoteState.loading &&
    !submitting
  );

  const buttonLabel = !evmAddress
    ? 'Connect EVM Wallet'
    : submitting
      ? 'Submitting Order…'
      : ruleCheck.error
        ? ruleCheck.error
        : insufficient
          ? `Insufficient ${spendSymbol}`
          : lowGas
            ? `Insufficient ${CHAIN_INFO[chain].native} for Gas`
            : quoteState.loading
              ? 'Fetching Best Quote…'
              : `${side === 'buy' ? 'Buy' : 'Sell'} ${group.symbol}`;

  const renderPaySelector = () =>
    payOpts.length > 1 ? (
      <div className="relative">
        <select
          value={payToken?.symbol || 'USDC'}
          onChange={e => setPaySym(e.target.value as PayToken['symbol'])}
          className="appearance-none bg-secondary border border-divider/50 rounded-2xl pl-3.5 pr-8 py-2.5 text-sm font-bold text-primary focus:outline-none cursor-pointer hover:bg-hover transition-colors"
        >
          {payOpts.map(p => (
            <option key={p.symbol} value={p.symbol}>
              {p.symbol}
            </option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 text-muted pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
      </div>
    ) : (
      <div className="flex items-center gap-2 bg-secondary border border-divider/50 rounded-2xl px-3.5 py-2 text-sm font-bold text-primary shrink-0">
        <span>{payToken?.symbol || 'USDC'}</span>
      </div>
    );

  const renderAssetBadge = () => (
    <div className="flex items-center gap-2.5 bg-secondary border border-divider/50 rounded-2xl px-3.5 py-2 shrink-0">
      <RwaLogo logo={group.logo} symbol={group.symbol} size={24} />
      <span className="text-sm font-bold text-primary">{group.symbol}</span>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Top Bar: Back + Chain Selector */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          All Stocks &amp; RWA
        </button>

        {!isStellarOnly && evmChains.length > 1 && (
          <div className="flex items-center gap-1 bg-secondary/80 p-1 rounded-xl border border-divider/40">
            {evmChains.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setChain(c)}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                  chain === c ? 'bg-brand text-white shadow-sm' : 'text-muted hover:text-primary'
                }`}
              >
                {CHAIN_INFO[c].short}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Compact Asset Header */}
      <div className="bg-tertiary rounded-2xl p-4 border border-divider/50 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <RwaLogo logo={group.logo} symbol={group.symbol} size={38} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-primary truncate">{group.symbol}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-muted uppercase font-bold">
                {group.issuer}
              </span>
              <MarketBadge status={mStatus} closedLabel={closed} />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted mt-0.5">
              <span className="truncate">{group.name}</span>
              {group.termsUrl && (
                <a
                  href={group.termsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand hover:underline inline-flex items-center gap-0.5 shrink-0"
                >
                  Terms <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-sm font-bold text-primary">
            {px && px.price !== null ? fmtUsd(px.price) : '—'}
          </div>
          {px && px.change24h !== null && (
            <div
              className={`text-[11px] font-semibold ${
                px.change24h >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {fmtPct(px.change24h)}
            </div>
          )}
        </div>
      </div>

      {isStellarOnly ? (
        <div className="bg-tertiary rounded-2xl p-5 border border-divider/50 space-y-3">
          <div className="flex items-start gap-2 text-xs text-muted">
            <Info className="w-4 h-4 text-brand shrink-0 mt-0.5" />
            <span>This asset trades on the Stellar DEX against Stellar USDC.</span>
          </div>
          <button
            type="button"
            onClick={() => navigate(ROUTES.TRADING_STELLAR)}
            className="w-full py-3 rounded-xl bg-brand text-white text-xs font-bold hover:opacity-90 transition-opacity"
          >
            Trade on Stellar DEX
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {/* You Pay Card */}
          <div className="bg-tertiary rounded-2xl p-4 lg:p-5 shadow-sm relative overflow-hidden flex flex-col border border-divider/50">
            <div
              className={`absolute left-0 top-0 bottom-0 w-1 bg-brand transition-all duration-300 ${
                isInputFocused ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-50'
              }`}
            />

            <div className="flex justify-between items-center mb-3">
              <label className="text-xs font-black uppercase tracking-[0.15em] text-muted opacity-90">
                You Pay
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted">
                  Bal: <strong className="text-primary">{fmtAmount(spendBal)}</strong> {spendSymbol}
                </span>
                {spendBal > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmount(cleanAmountInput(String(spendBal), spendDecimals))}
                    className="text-[10px] font-black text-brand hover:scale-105 active:scale-95 transition-all px-2.5 py-0.5 bg-brand/10 border border-brand/20 rounded-full"
                  >
                    MAX
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              {side === 'buy' ? renderPaySelector() : renderAssetBadge()}
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                onChange={e => setAmount(cleanAmountInput(e.target.value, spendDecimals))}
                placeholder="0.00"
                className="w-full text-right bg-transparent text-2xl sm:text-3xl font-bold text-primary placeholder:text-muted/35 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-divider/30">
              <div className="flex items-center gap-1.5">
                {side === 'buy'
                  ? BUY_PRESETS.map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setAmount(v)}
                        className="px-2.5 py-1 rounded-lg bg-secondary/80 hover:bg-hover text-[11px] font-bold text-muted hover:text-primary border border-divider/30 transition-colors"
                      >
                        ${v}
                      </button>
                    ))
                  : SELL_PCTS.map(pct => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() =>
                          setAmount(cleanAmountInput(String((spendBal * pct) / 100), spendDecimals))
                        }
                        className="px-2.5 py-1 rounded-lg bg-secondary/80 hover:bg-hover text-[11px] font-bold text-muted hover:text-primary border border-divider/30 transition-colors"
                      >
                        {pct === 100 ? 'Max' : `${pct}%`}
                      </button>
                    ))}
              </div>
              <span className="text-xs font-medium text-muted">
                {usdVal !== null ? `≈ ${fmtUsd(usdVal)}` : '—'}
              </span>
            </div>
          </div>

          {/* Swap Direction Flipper */}
          <div className="flex justify-center -my-3 relative z-10">
            <button
              type="button"
              onClick={flipSide}
              title={`Switch to ${side === 'buy' ? 'Sell' : 'Buy'}`}
              className="p-2.5 rounded-full bg-secondary border border-brand/30 text-brand hover:bg-brand/10 hover:scale-110 active:scale-95 transition-all shadow-md"
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>
          </div>

          {/* You Receive Card */}
          <div className="bg-tertiary rounded-2xl p-4 lg:p-5 shadow-sm border border-divider/50 flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <label className="text-xs font-black uppercase tracking-[0.15em] text-muted opacity-90">
                You Receive
              </label>
              <span className="text-[11px] text-muted">
                Bal:{' '}
                <strong className="text-primary">
                  {side === 'buy'
                    ? fmtHolding(
                        assetHoldings.reduce((s, h) => s + Number(h.amount), 0) || receiveBal
                      )
                    : fmtAmount(receiveBal)}
                </strong>{' '}
                {receiveSymbol}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              {side === 'buy' ? renderAssetBadge() : renderPaySelector()}
              <div className="flex items-center justify-end gap-2 w-full">
                {quoteState.loading && (
                  <Loader2 className="w-4 h-4 animate-spin text-brand shrink-0" />
                )}
                <span
                  className={`text-2xl sm:text-3xl font-bold truncate ${
                    outHuman ? 'text-primary' : 'text-muted/35'
                  }`}
                >
                  {outHuman ? fmtAmount(outHuman) : '0.00'}
                </span>
              </div>
            </div>

            {quoteOk && (
              <div className="mt-3 pt-3 border-t border-divider/30 space-y-1.5">
                <DetailRow
                  label="Rate"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      {rateText({
                        side,
                        symbol: activeAsset.symbol,
                        amountIn: amount,
                        amountOut: outHuman || 0,
                      }) || '—'}
                      <button
                        type="button"
                        onClick={fetchQuote}
                        className="text-muted hover:text-primary"
                        title="Refresh quote"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    </span>
                  }
                />
                <DetailRow
                  label="Minimum Received"
                  value={`${fmtAmount(minHuman)} ${receiveSymbol}`}
                />
                {figs.feePct !== null && (
                  <DetailRow label="Provider Fee" value={`${figs.feePct.toFixed(2)}%`} />
                )}
                {approveFeeWei && (
                  <DetailRow
                    label="Approval Gas (est.)"
                    value={nativeCostText(approveFeeWei, CHAIN_INFO[chain].native, nativePrice)}
                  />
                )}
              </div>
            )}
          </div>

          {smallEthOrder(chain, usdVal) && !ruleCheck.error && (
            <AlertBanner variant="warning">
              Orders under $500 on Ethereum incur higher relative gas costs. BNB Chain is usually
              cheaper.
            </AlertBanner>
          )}

          {quoteErr && <AlertBanner variant="error">{quoteErr.text}</AlertBanner>}
          {submitError && <AlertBanner variant="error">{submitError}</AlertBanner>}

          <button
            type="button"
            disabled={!canConfirm}
            onClick={handleConfirm}
            className="w-full py-3.5 mt-1 rounded-2xl bg-brand text-white text-sm font-bold hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2 shadow-sm"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {buttonLabel}
          </button>
        </div>
      )}
    </div>
  );
};
