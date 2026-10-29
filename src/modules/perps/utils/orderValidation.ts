import BigNumber from 'bignumber.js';

import type { AccountBalance, Market } from '../core/models';
import type { OrderSide, OrderType } from '../core/stores/orderEntryStore';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  errorField?: 'price' | 'size' | 'stopPrice' | 'callbackRate';
}

function isMultipleOf(val: number | string, step: number | string): boolean {
  const bnVal = new BigNumber(val);
  const bnStep = new BigNumber(step);
  if (bnStep.isZero() || bnStep.isNaN() || bnVal.isNaN()) return true;
  const div = bnVal.div(bnStep);
  const diff = div.minus(div.integerValue()).abs();
  return diff.lt(1e-7);
}

export function validateOrder(
  market: Market | null,
  currentPrice: number,
  _balances: AccountBalance[],
  _side: OrderSide,
  orderType: OrderType,
  priceStr: string,
  sizeStr: string,
  sizeAsset: 'base' | 'quote',
  stopPriceStr?: string,
  callbackRateStr?: string,
  maxPossibleSize?: number
): ValidationResult {
  if (!market) {
    return { isValid: false };
  }

  const baseAsset = market.baseAsset || 'ASSET';
  const quoteAsset = market.quoteAsset || 'USDT';
  const bnPrice = new BigNumber(priceStr || 'NaN');
  const bnSize = new BigNumber(sizeStr || 'NaN');
  const bnCurrentPrice = new BigNumber(currentPrice || 0);

  const isPriceRequired =
    orderType === 'LIMIT' ||
    orderType === 'POST_ONLY' ||
    orderType === 'STOP' ||
    orderType === 'TAKE_PROFIT';

  const isStopRequired =
    orderType === 'STOP' ||
    orderType === 'STOP_MARKET' ||
    orderType === 'TAKE_PROFIT' ||
    orderType === 'TAKE_PROFIT_MARKET';

  if (isPriceRequired) {
    if (!priceStr || priceStr.trim() === '') {
      return { isValid: false, errorField: 'price' };
    }
    if (bnPrice.isNaN() || bnPrice.lte(0)) {
      return { isValid: false, error: 'Enter a valid price', errorField: 'price' };
    }
    if (market.tickSize && market.tickSize > 0) {
      if (!isMultipleOf(priceStr, market.tickSize)) {
        return {
          isValid: false,
          error: `Price must be a multiple of ${market.tickSize} ${quoteAsset}`,
          errorField: 'price',
        };
      }
    }
  }

  if (isStopRequired) {
    if (!stopPriceStr || stopPriceStr.trim() === '') {
      return { isValid: false, errorField: 'stopPrice' };
    }
    const bnStopPrice = new BigNumber(stopPriceStr);
    if (bnStopPrice.isNaN() || bnStopPrice.lte(0)) {
      return { isValid: false, error: 'Enter a valid trigger price', errorField: 'stopPrice' };
    }
  }

  if (orderType === 'TRAILING_STOP_MARKET') {
    if (!callbackRateStr || callbackRateStr.trim() === '') {
      return { isValid: false, errorField: 'callbackRate' };
    }
    const bnRate = new BigNumber(callbackRateStr);
    if (bnRate.isNaN() || bnRate.lt(0.1) || bnRate.gt(5)) {
      return {
        isValid: false,
        error: 'Callback rate must be between 0.1% and 5%',
        errorField: 'callbackRate',
      };
    }
  }

  if (!sizeStr || sizeStr.trim() === '') {
    return { isValid: false };
  }

  if (bnSize.isNaN() || bnSize.lte(0)) {
    return { isValid: false, error: 'Enter a valid size', errorField: 'size' };
  }

  const bnEffectivePrice =
    isPriceRequired && bnPrice.gt(0)
      ? bnPrice
      : bnCurrentPrice.gt(0)
        ? bnCurrentPrice
        : new BigNumber(1);

  const stepStr = market.stepSize ? String(market.stepSize) : '';
  const baseDecimals = stepStr.includes('.') ? stepStr.split('.')[1].length : 4;

  const bnMinNotional = new BigNumber(market.minNotional || 0);
  const bnMinOrderSize = new BigNumber(market.minOrderSize || 0);
  const bnMaxPossibleSize = new BigNumber(maxPossibleSize || 0);

  if (sizeAsset === 'quote') {
    const minQuoteFromLot = bnMinOrderSize.times(bnEffectivePrice);
    const minRequiredQuote = BigNumber.max(bnMinNotional, minQuoteFromLot);

    if (minRequiredQuote.gt(0) && bnSize.lt(minRequiredQuote)) {
      return {
        isValid: false,
        error: `Minimum order size is ${minRequiredQuote.toFixed(2)} ${quoteAsset}`,
        errorField: 'size',
      };
    }

    if (bnMaxPossibleSize.gt(0) && bnSize.gt(bnMaxPossibleSize.times(1.0001))) {
      return {
        isValid: false,
        error: `Exceeds max available size of ${bnMaxPossibleSize.toFixed(2)} ${quoteAsset}`,
        errorField: 'size',
      };
    }
  } else {
    const minBaseFromNotional =
      bnMinNotional.gt(0) && bnEffectivePrice.gt(0)
        ? bnMinNotional.div(bnEffectivePrice)
        : new BigNumber(0);
    const minRequiredBase = BigNumber.max(bnMinOrderSize, minBaseFromNotional);

    if (minRequiredBase.gt(0) && bnSize.lt(minRequiredBase)) {
      return {
        isValid: false,
        error: `Minimum order size is ${minRequiredBase.toFixed(baseDecimals)} ${baseAsset}`,
        errorField: 'size',
      };
    }

    if (market.stepSize && market.stepSize > 0) {
      if (!isMultipleOf(sizeStr, market.stepSize)) {
        return {
          isValid: false,
          error: `Size must be a multiple of ${market.stepSize} ${baseAsset}`,
          errorField: 'size',
        };
      }
    }

    if (bnMaxPossibleSize.gt(0) && bnSize.gt(bnMaxPossibleSize.times(1.0001))) {
      return {
        isValid: false,
        error: `Exceeds max available size of ${bnMaxPossibleSize.toFixed(baseDecimals)} ${baseAsset}`,
        errorField: 'size',
      };
    }
  }

  return { isValid: true };
}
