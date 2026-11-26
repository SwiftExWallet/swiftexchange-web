import { useCallback, useEffect, useMemo, useState } from 'react';

import { getCachedPrice, loadPrices } from '../api/prices';
import { type RwaQuoteResult, getRwaQuote } from '../api/quote';
import { getCachedXStatus, loadXStatuses } from '../api/xstocksStatus';
import { RWA_TRADING_ENABLED } from '../config/rwaConfig';
import { findEvmRwaAsset, llamaKey } from '../data/assets';
import { groupKey } from '../data/groups';
import { executeRwaOrder } from '../orders/executeOrder';
import { hasAttested, saveAttestation } from '../storage/attestation';
import type { MarketStatus, PayToken, RwaAsset, RwaOrderRecord } from '../types/rwa.types';
import { fmtAmount, fromUnits, toUnits } from '../utils/amounts';
import { assetMarketStatus } from '../utils/marketHours';
import { quoteFigures } from '../utils/quoteMath';
import { QUOTE_DEBOUNCE_MS, QUOTE_REFRESH_MS, closedText, rateText } from '../utils/swapForm';
import { payOptionsFor, tradeChecks } from '../utils/tradeRules';
import { useOrderTracker } from './useOrderTracker';
import { useRwaAvailability } from './useRwaAvailability';

export interface UseRwaSwapParams {
  fromChainId: number | string;
  toChainId: number | string;
  sellAddress: string;
  buyAddress: string;
  sellAmount: string;
  evmAddress: string;
  getProvider: () => any;
}

export const useRwaSwapIntegration = ({
  fromChainId,
  toChainId,
  sellAddress,
  buyAddress,
  sellAmount,
  evmAddress,
  getProvider,
}: UseRwaSwapParams) => {
  const { rwaVisible, country } = useRwaAvailability();
  const { orders, reload: reloadOrders } = useOrderTracker(evmAddress);

  const sellRwa = useMemo(
    () => findEvmRwaAsset(fromChainId, sellAddress),
    [fromChainId, sellAddress]
  );
  const buyRwa = useMemo(() => findEvmRwaAsset(toChainId, buyAddress), [toChainId, buyAddress]);

  const activeAsset: RwaAsset | null = buyRwa || sellRwa || null;
  const side: 'buy' | 'sell' = buyRwa ? 'buy' : 'sell';
  const isActive = Boolean(rwaVisible && activeAsset);

  const payToken: PayToken | null = useMemo(() => {
    if (!activeAsset) return null;
    const opts = payOptionsFor(activeAsset);
    const otherAddr = (side === 'buy' ? sellAddress : buyAddress).toLowerCase();
    return opts.find(o => o.address.toLowerCase() === otherAddr) || opts[0] || null;
  }, [activeAsset, side, sellAddress, buyAddress]);

  const [priceTick, setPriceTick] = useState(0);
  const [quoteState, setQuoteState] = useState<{
    loading: boolean;
    result: RwaQuoteResult | null;
    quotedAt: number | null;
  }>({ loading: false, result: null, quotedAt: null });

  const [attested, setAttested] = useState(() => hasAttested(evmAddress));
  const [showAttestation, setShowAttestation] = useState(false);
  const [activeOrder, setActiveOrder] = useState<RwaOrderRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setAttested(hasAttested(evmAddress));
  }, [evmAddress]);

  useEffect(() => {
    if (!isActive || !activeAsset) return;
    let alive = true;
    const key = llamaKey(activeAsset);
    if (key) loadPrices([key]).then(() => alive && setPriceTick(t => t + 1));
    if (activeAsset.issuer === 'xstocks') {
      loadXStatuses([activeAsset.symbol]).then(() => alive && setPriceTick(t => t + 1));
    }
    return () => {
      alive = false;
    };
  }, [isActive, activeAsset]);

  const marketPrice =
    activeAsset && priceTick >= 0 ? (getCachedPrice(llamaKey(activeAsset))?.price ?? null) : null;
  const xStatus = activeAsset?.issuer === 'xstocks' ? getCachedXStatus(activeAsset.symbol) : null;
  const marketStatus: MarketStatus | null = activeAsset
    ? xStatus || assetMarketStatus(activeAsset)
    : null;
  const closedLabel = activeAsset
    ? closedText(marketStatus, new Date(), activeAsset.issuer === 'ondo')
    : null;

  const spendDecimals = side === 'buy' ? payToken?.decimals || 6 : activeAsset?.decimals || 18;
  const amountUnits = toUnits(sellAmount, spendDecimals);

  const ruleCheck = useMemo(
    () =>
      activeAsset
        ? tradeChecks({
            asset: activeAsset,
            side,
            amount: sellAmount,
            unitPriceUsd: side === 'buy' ? 1 : marketPrice,
          })
        : { error: null },
    [activeAsset, side, sellAmount, marketPrice]
  );

  const fetchQuote = useCallback(async () => {
    if (!isActive || !evmAddress || !activeAsset || !payToken || !amountUnits || ruleCheck.error) {
      setQuoteState({ loading: false, result: null, quotedAt: null });
      return;
    }
    setQuoteState(prev => ({ ...prev, loading: true }));
    const res = await getRwaQuote({
      side,
      asset: activeAsset,
      payToken,
      amountUnits,
      wallet: evmAddress,
    });
    setQuoteState({ loading: false, result: res, quotedAt: res.ok ? Date.now() : null });
  }, [isActive, evmAddress, activeAsset, payToken, amountUnits, ruleCheck.error, side]);

  useEffect(() => {
    if (!isActive || !evmAddress || !amountUnits || ruleCheck.error) {
      setQuoteState({ loading: false, result: null, quotedAt: null });
      return;
    }
    const t = setTimeout(fetchQuote, QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [isActive, evmAddress, amountUnits, ruleCheck.error, fetchQuote]);

  useEffect(() => {
    if (!isActive || !quoteState.quotedAt) return;
    const t = setInterval(fetchQuote, QUOTE_REFRESH_MS);
    return () => clearInterval(t);
  }, [isActive, quoteState.quotedAt, fetchQuote]);

  const quoteOk = quoteState.result?.ok ? quoteState.result : null;
  const quoteErr = quoteState.result && !quoteState.result.ok ? quoteState.result.error : null;

  const outDecimals = side === 'buy' ? activeAsset?.decimals || 18 : payToken?.decimals || 6;
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
    amountIn: sellAmount,
    out: outHuman,
    fee: feeHuman,
    marketPrice,
  });

  const runOrder = useCallback(async () => {
    if (
      !activeAsset ||
      !payToken ||
      !quoteOk ||
      !quoteState.quotedAt ||
      !amountUnits ||
      !evmAddress
    )
      return;
    setSubmitError(null);
    setSubmitting(true);
    const spendSym = side === 'buy' ? payToken.symbol : activeAsset.symbol;
    const recvSym = side === 'buy' ? activeAsset.symbol : payToken.symbol;
    const amountText = `${sellAmount} ${spendSym} → ~${fmtAmount(outHuman)} ${recvSym}`;
    const res = await executeRwaOrder(
      {
        wallet: evmAddress,
        provider: getProvider(),
        asset: activeAsset,
        side,
        payToken,
        amountUnits,
        amountText,
        quote: quoteOk.quote,
        summary: quoteOk.summary,
        quotedAt: quoteState.quotedAt,
        groupKey: groupKey(activeAsset),
      },
      record => {
        setActiveOrder(record);
        reloadOrders();
      }
    );
    setSubmitting(false);
    if ('error' in res) setSubmitError(res.error);
  }, [
    activeAsset,
    payToken,
    quoteOk,
    quoteState.quotedAt,
    amountUnits,
    evmAddress,
    side,
    sellAmount,
    outHuman,
    getProvider,
    reloadOrders,
  ]);

  const executeSwap = useCallback(() => {
    if (!evmAddress) return;
    if (!attested) {
      setShowAttestation(true);
      return;
    }
    runOrder();
  }, [evmAddress, attested, runOrder]);

  const acceptAttestation = useCallback(() => {
    saveAttestation(evmAddress, country);
    setAttested(true);
    setShowAttestation(false);
    runOrder();
  }, [evmAddress, country, runOrder]);

  return {
    isActive,
    activeAsset,
    side,
    payToken,
    country,
    marketPrice,
    marketStatus,
    closedLabel,
    quoteLoading: quoteState.loading,
    quoteOk,
    quoteError: ruleCheck.error || quoteErr?.text || submitError || null,
    calculatedBuyAmount: outHuman ? fmtAmount(outHuman) : '',
    minReceivedText: minHuman
      ? `${fmtAmount(minHuman)} ${side === 'buy' ? activeAsset?.symbol : payToken?.symbol}`
      : null,
    rateLabel:
      activeAsset && outHuman
        ? rateText({ side, symbol: activeAsset.symbol, amountIn: sellAmount, amountOut: outHuman })
        : null,
    feePctLabel: figs.feePct !== null ? `${figs.feePct.toFixed(2)}%` : null,
    canExecute: Boolean(
      RWA_TRADING_ENABLED &&
      evmAddress &&
      quoteOk &&
      !ruleCheck.error &&
      !quoteState.loading &&
      !submitting
    ),
    submitting,
    fetchQuote,
    executeSwap,
    showAttestation,
    setShowAttestation,
    acceptAttestation,
    activeOrder: activeOrder ? orders.find(o => o.id === activeOrder.id) || activeOrder : null,
    setActiveOrder,
  };
};
