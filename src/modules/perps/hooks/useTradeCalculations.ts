import { useMemo } from 'react';

import BigNumber from 'bignumber.js';

import { useAccountStore } from '../core/stores/accountStore';
import { useLeverageStore } from '../core/stores/leverageStore';
import { usePositionStore } from '../core/stores/positionStore';
import { useTickerStore } from '../core/stores/tickerStore';
import { calculateLiquidationPrice } from '../utils/liquidationCalculator';

export function useTradeCalculations(
  symbol: string,
  inputSize: string,
  sizeAsset: 'base' | 'quote',
  leverage: number,
  marginType: 'cross' | 'isolated'
) {
  const balances = useAccountStore(state => state.balances);
  const positions = usePositionStore(state => state.positions);
  const bracketsBySymbol = useLeverageStore(state => state.bracketsBySymbol);
  const assetCtxByMarket = useTickerStore(state => state.assetCtxByMarket);

  const multiAssetsMargin = useAccountStore(state => state.multiAssetsMargin);
  const availableBalance = useAccountStore(state => state.availableBalance);

  const parsedSize = new BigNumber(inputSize || '0');
  const currentPrice = new BigNumber(assetCtxByMarket[symbol]?.markPx || '0');

  // Wallet Balance
  const walletBalance = useMemo(() => {
    if (multiAssetsMargin && availableBalance && parseFloat(availableBalance) > 0) {
      return new BigNumber(availableBalance).toNumber();
    }

    if (!multiAssetsMargin) {
      // In Single-Asset Mode, buying power is the settlement currency (USDC or USDT or USD)
      const quoteAsset = symbol.includes('-')
        ? symbol.split('-')[1]
        : symbol.endsWith('USDC')
          ? 'USDC'
          : 'USDT';
      const quoteBal =
        balances[quoteAsset] || balances['USDC'] || balances['USD'] || balances['USDT'];
      return quoteBal ? new BigNumber(quoteBal.available || quoteBal.total || '0').toNumber() : 0;
    }

    // In Multi-Asset Mode fallback, calculate total equity across all supported assets
    return Object.values(balances).reduce((acc, b) => {
      if (b.usdValue && !isNaN(parseFloat(b.usdValue))) {
        return acc + parseFloat(b.usdValue);
      }
      let price = new BigNumber(1);
      if (b.asset !== 'USDT' && b.asset !== 'USDC') {
        const markPrice =
          assetCtxByMarket[`${b.asset}-USDT`]?.markPx || assetCtxByMarket[`${b.asset}USDT`]?.markPx;
        if (markPrice) price = new BigNumber(markPrice);
        else if (b.asset === 'ASTER') price = new BigNumber('0.783681');
        else price = new BigNumber(0);
      }
      return acc + new BigNumber(b.total).times(price).toNumber();
    }, 0);
  }, [balances, assetCtxByMarket, multiAssetsMargin, availableBalance, symbol]);

  // Max Position Size Calculation (0% to 100% slider bounds)
  const maxPossibleSize = useMemo(() => {
    if (currentPrice.lte(0) || walletBalance <= 0) return 0;
    // Apply a slight safety buffer (e.g. 99%) so we don't immediately liquidate on fees
    const maxNotional = new BigNumber(walletBalance).times(leverage).times(0.99);
    return sizeAsset === 'quote'
      ? maxNotional.toNumber()
      : maxNotional.div(currentPrice).toNumber();
  }, [walletBalance, leverage, currentPrice, sizeAsset]);

  // Order Cost (Required Margin)
  const orderCost = useMemo(() => {
    if (currentPrice.lte(0) || parsedSize.lte(0)) return 0;

    // If input is in Quote asset (USDT), then parsedSize is the notional value.
    // If input is in Base asset (BTC), then parsedSize * currentPrice is the notional value.
    const notional = sizeAsset === 'quote' ? parsedSize : parsedSize.times(currentPrice);

    return notional.div(leverage).toNumber();
  }, [currentPrice, parsedSize, leverage, sizeAsset]);

  // --- CROSS MARGIN CALCULATIONS ---
  // Cross Account Equity = walletBalance + sum(unrealizedPnL of all cross positions)
  const crossAccountEquity = useMemo(() => {
    const crossPositions = Object.values(positions).filter(p => p.marginType === 'cross');
    const totalPnl = crossPositions.reduce(
      (acc, p) => acc + new BigNumber(p.unrealizedPnl || '0').toNumber(),
      0
    );
    return walletBalance + totalPnl;
  }, [positions, walletBalance]);

  // Total Maintenance Margin = sum(MM_i) for every open cross position
  // MM_i = positionNotional_i * maintMarginRatio_i - cum_i
  const totalMaintenanceMargin = useMemo(() => {
    const crossPositions = Object.values(positions).filter(p => p.marginType === 'cross');

    return crossPositions.reduce((acc, p) => {
      const symNoDash = p.symbol.replace('-', '');
      const brackets = bracketsBySymbol[symNoDash];
      if (!brackets || brackets.length === 0) return acc; // No bracket data, can't calc

      const notional = new BigNumber(p.size).abs().times(new BigNumber(p.markPrice || '0'));

      // Find the appropriate bracket for the notional
      const bracket =
        brackets.find(b => notional.lte(b.notionalCap)) || brackets[brackets.length - 1];

      const mm = notional.times(bracket.maintMarginRatio).minus(bracket.cum);
      return acc + (mm.gt(0) ? mm.toNumber() : 0);
    }, 0);
  }, [positions, bracketsBySymbol]);

  // Cross Margin Ratio
  const crossMarginRatio =
    crossAccountEquity > 0 ? (totalMaintenanceMargin / crossAccountEquity) * 100 : 0;

  const estimatedIsolatedLiqPrice = useMemo(() => {
    if (currentPrice.lte(0) || parsedSize.isNaN() || parsedSize.lte(0)) {
      return { long: null, short: null };
    }

    if (marginType === 'cross' && walletBalance > 0) {
      const baseQty = sizeAsset === 'quote' ? parsedSize.div(currentPrice) : parsedSize;
      const longLiq = calculateLiquidationPrice({
        position: {
          symbol,
          size: baseQty.toString(),
          entryPrice: currentPrice.toString(),
          markPrice: currentPrice.toString(),
          liquidationPrice: '0',
          unrealizedPnl: '0',
          leverage,
          marginType: 'cross',
          isolatedMargin: '0',
        },
        allPositions: Object.values(positions),
        balances,
        isMultiAsset: multiAssetsMargin,
        bracketsBySymbol,
      });

      const shortLiq = calculateLiquidationPrice({
        position: {
          symbol,
          size: baseQty.negated().toString(),
          entryPrice: currentPrice.toString(),
          markPrice: currentPrice.toString(),
          liquidationPrice: '0',
          unrealizedPnl: '0',
          leverage,
          marginType: 'cross',
          isolatedMargin: '0',
        },
        allPositions: Object.values(positions),
        balances,
        isMultiAsset: multiAssetsMargin,
        bracketsBySymbol,
      });

      if (longLiq !== null || shortLiq !== null) {
        return {
          long: longLiq !== null && longLiq > 0 ? longLiq : null,
          short: shortLiq !== null && shortLiq > 0 ? shortLiq : null,
        };
      }
    }

    const symNoDash = symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const brackets = bracketsBySymbol[symNoDash] || bracketsBySymbol[symbol];
    const notional = sizeAsset === 'quote' ? parsedSize : parsedSize.times(currentPrice);

    let mmr = 0.005;
    if (brackets && brackets.length > 0 && notional.gt(0)) {
      const bracket =
        brackets.find(b => notional.lte(b.notionalCap)) || brackets[brackets.length - 1];
      if (bracket) mmr = bracket.maintMarginRatio;
    }

    const mmrBn = new BigNumber(mmr);
    const levBn = new BigNumber(Math.max(1, leverage));

    const longDenom = new BigNumber(1).minus(mmrBn);
    const longNumerator = currentPrice.times(new BigNumber(1).minus(new BigNumber(1).div(levBn)));
    const longLiq = longDenom.gt(0) ? longNumerator.div(longDenom) : new BigNumber(0);

    const shortDenom = new BigNumber(1).plus(mmrBn);
    const shortNumerator = currentPrice.times(new BigNumber(1).plus(new BigNumber(1).div(levBn)));
    const shortLiq = shortDenom.gt(0) ? shortNumerator.div(shortDenom) : new BigNumber(0);

    return {
      long: longLiq.gt(0) ? longLiq.toNumber() : null,
      short: shortLiq.gt(0) ? shortLiq.toNumber() : null,
    };
  }, [
    symbol,
    currentPrice,
    parsedSize,
    leverage,
    marginType,
    walletBalance,
    sizeAsset,
    positions,
    balances,
    multiAssetsMargin,
    bracketsBySymbol,
  ]);

  return {
    walletBalance,
    maxPossibleSize,
    orderCost,
    crossAccountEquity,
    totalMaintenanceMargin,
    crossMarginRatio,
    estimatedIsolatedLiqPrice,
    currentPrice: currentPrice.toNumber(),
  };
}
