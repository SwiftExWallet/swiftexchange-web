import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type OrderSide = 'BUY' | 'SELL';
export type OrderType =
  | 'LIMIT'
  | 'MARKET'
  | 'STOP'
  | 'STOP_MARKET'
  | 'TAKE_PROFIT'
  | 'TAKE_PROFIT_MARKET'
  | 'TRAILING_STOP_MARKET'
  | 'POST_ONLY'
  | 'CHASE'
  | 'TWAP'
  | 'SCALED';

export type TimeInForce = 'GTC' | 'IOC' | 'FOK' | 'GTX';
export type WorkingType = 'MARK_PRICE' | 'CONTRACT_PRICE';

interface OrderEntryStoreState {
  side: OrderSide;
  orderType: OrderType;
  size: string;
  price: string;
  leverage: number;
  marginType: 'cross' | 'isolated';
  leverageBySymbol: Record<string, number>;
  marginTypeBySymbol: Record<string, 'cross' | 'isolated'>;
  isReduceOnly: boolean;
  isPostOnly: boolean;

  timeInForce: TimeInForce;
  stopPrice: string;
  activationPrice: string;
  callbackRate: string;
  workingType: WorkingType;

  chaseOffset: string;
  maxChaseOffset: string;
  maxChaseDifferenceEnabled: boolean;
  chasePriceMode: 'BBO' | 'GAP';

  scaledPriceLower: string;
  scaledPriceUpper: string;
  scaledOrderCount: string;
  scaledDistribution: 'FLAT' | 'ASCENDING' | 'DESCENDING';

  slippageEnabled: boolean;
  slippageTolerance: string;
  attachedTpEnabled: boolean;
  attachedTpPrice: string;
  attachedTpTrigger: WorkingType;
  attachedSlEnabled: boolean;
  attachedSlPrice: string;
  attachedSlTrigger: WorkingType;

  tpEnabled: boolean;
  tp: string;
  slEnabled: boolean;
  sl: string;

  sizeAsset: 'base' | 'quote';
  setSide: (side: OrderSide) => void;
  setOrderType: (type: OrderType) => void;
  setSizeAsset: (asset: 'base' | 'quote') => void;
  setSize: (size: string) => void;
  setPrice: (price: string) => void;
  setLeverage: (leverage: number, symbol?: string) => void;
  setMarginType: (type: 'cross' | 'isolated', symbol?: string) => void;
  syncForSymbol: (symbol: string) => void;
  setSymbolSettings: (symbol: string, leverage: number, marginType: 'cross' | 'isolated') => void;
  setReduceOnly: (val: boolean) => void;
  setPostOnly: (val: boolean) => void;

  setTimeInForce: (tif: TimeInForce) => void;
  setStopPrice: (price: string) => void;
  setActivationPrice: (price: string) => void;
  setCallbackRate: (rate: string) => void;
  setWorkingType: (wt: WorkingType) => void;

  setChaseOffset: (offset: string) => void;
  setMaxChaseOffset: (offset: string) => void;
  setMaxChaseDifferenceEnabled: (enabled: boolean) => void;
  setChasePriceMode: (mode: 'BBO' | 'GAP') => void;

  setScaledPriceLower: (price: string) => void;
  setScaledPriceUpper: (price: string) => void;
  setScaledOrderCount: (count: string) => void;
  setScaledDistribution: (dist: 'FLAT' | 'ASCENDING' | 'DESCENDING') => void;

  setTpEnabled: (enabled: boolean) => void;
  setTp: (tp: string) => void;
  setSlEnabled: (enabled: boolean) => void;
  setSl: (sl: string) => void;

  setSlippageEnabled: (enabled: boolean) => void;
  setSlippageTolerance: (tol: string) => void;
  setAttachedTpEnabled: (enabled: boolean) => void;
  setAttachedTpPrice: (price: string) => void;
  setAttachedTpTrigger: (trigger: WorkingType) => void;
  setAttachedSlEnabled: (enabled: boolean) => void;
  setAttachedSlPrice: (price: string) => void;
  setAttachedSlTrigger: (trigger: WorkingType) => void;

  activeInput: 'price' | 'stopPrice' | 'activationPrice' | null;
  setActiveInput: (input: 'price' | 'stopPrice' | 'activationPrice' | null) => void;
  applyOrderbookPrice: (price: string) => void;

  reset: () => void;
}

const initialState = {
  side: 'BUY' as OrderSide,
  orderType: 'MARKET' as OrderType,
  size: '',
  price: '',
  leverage: 20,
  marginType: 'cross' as const,
  leverageBySymbol: {} as Record<string, number>,
  marginTypeBySymbol: {} as Record<string, 'cross' | 'isolated'>,
  isReduceOnly: false,
  isPostOnly: false,

  timeInForce: 'GTC' as TimeInForce,
  stopPrice: '',
  activationPrice: '',
  callbackRate: '',
  workingType: 'CONTRACT_PRICE' as WorkingType,

  chaseOffset: '0',
  maxChaseOffset: '',
  maxChaseDifferenceEnabled: false,
  chasePriceMode: 'BBO' as const,

  scaledPriceLower: '',
  scaledPriceUpper: '',
  scaledOrderCount: '5',
  scaledDistribution: 'FLAT' as const,

  slippageEnabled: false,
  slippageTolerance: '0.5',
  attachedTpEnabled: false,
  attachedTpPrice: '',
  attachedTpTrigger: 'MARK_PRICE' as WorkingType,
  attachedSlEnabled: false,
  attachedSlPrice: '',
  attachedSlTrigger: 'MARK_PRICE' as WorkingType,

  tpEnabled: false,
  tp: '',
  slEnabled: false,
  sl: '',

  sizeAsset: 'base' as const,
  activeInput: null as 'price' | 'stopPrice' | 'activationPrice' | null,
};

export const useOrderEntryStore = create<OrderEntryStoreState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setSide: side => set({ side }),
      setOrderType: orderType =>
        set(state => ({
          orderType,
          ...(orderType === 'TRAILING_STOP_MARKET' && !state.callbackRate
            ? { callbackRate: '1.0' }
            : {}),
          ...(orderType === 'CHASE'
            ? {
                chaseOffset: state.chaseOffset || '0',
                maxChaseOffset: state.maxChaseOffset || '10',
              }
            : {}),
          ...(orderType === 'SCALED'
            ? {
                scaledOrderCount: state.scaledOrderCount || '5',
                scaledDistribution: state.scaledDistribution || 'FLAT',
              }
            : {}),
        })),
      setSizeAsset: sizeAsset => set({ sizeAsset }),
      setSize: size => set({ size }),
      setPrice: price => set({ price }),
      setLeverage: (leverage, symbol) =>
        set(state => ({
          leverage,
          leverageBySymbol: symbol
            ? { ...state.leverageBySymbol, [symbol]: leverage }
            : state.leverageBySymbol,
        })),
      setMarginType: (marginType, symbol) =>
        set(state => ({
          marginType,
          marginTypeBySymbol: symbol
            ? { ...state.marginTypeBySymbol, [symbol]: marginType }
            : state.marginTypeBySymbol,
        })),
      syncForSymbol: symbol => {
        const state = get();
        const storedLev = state.leverageBySymbol[symbol];
        const storedMt = state.marginTypeBySymbol[symbol];
        set({
          ...(storedLev ? { leverage: storedLev } : {}),
          ...(storedMt ? { marginType: storedMt } : {}),
        });
      },
      setSymbolSettings: (symbol, leverage, marginType) =>
        set(state => ({
          leverageBySymbol: { ...state.leverageBySymbol, [symbol]: leverage },
          marginTypeBySymbol: { ...state.marginTypeBySymbol, [symbol]: marginType },
        })),
      setReduceOnly: isReduceOnly => set({ isReduceOnly }),
      setPostOnly: isPostOnly => set({ isPostOnly }),

      setTimeInForce: timeInForce => set({ timeInForce }),
      setStopPrice: stopPrice => set({ stopPrice }),
      setActivationPrice: activationPrice => set({ activationPrice }),
      setCallbackRate: callbackRate => set({ callbackRate }),
      setWorkingType: workingType => set({ workingType }),

      setChaseOffset: chaseOffset => set({ chaseOffset }),
      setMaxChaseOffset: maxChaseOffset => set({ maxChaseOffset }),
      setMaxChaseDifferenceEnabled: maxChaseDifferenceEnabled => set({ maxChaseDifferenceEnabled }),
      setChasePriceMode: chasePriceMode => set({ chasePriceMode }),

      setScaledPriceLower: scaledPriceLower => set({ scaledPriceLower }),
      setScaledPriceUpper: scaledPriceUpper => set({ scaledPriceUpper }),
      setScaledOrderCount: scaledOrderCount => set({ scaledOrderCount }),
      setScaledDistribution: scaledDistribution => set({ scaledDistribution }),

      setTpEnabled: tpEnabled => set({ tpEnabled }),
      setTp: tp => set({ tp }),
      setSlEnabled: slEnabled => set({ slEnabled }),
      setSl: sl => set({ sl }),

      setSlippageEnabled: slippageEnabled => set({ slippageEnabled }),
      setSlippageTolerance: slippageTolerance => set({ slippageTolerance }),
      setAttachedTpEnabled: attachedTpEnabled => set({ attachedTpEnabled }),
      setAttachedTpPrice: attachedTpPrice => set({ attachedTpPrice }),
      setAttachedTpTrigger: attachedTpTrigger => set({ attachedTpTrigger }),
      setAttachedSlEnabled: attachedSlEnabled => set({ attachedSlEnabled }),
      setAttachedSlPrice: attachedSlPrice => set({ attachedSlPrice }),
      setAttachedSlTrigger: attachedSlTrigger => set({ attachedSlTrigger }),

      setActiveInput: activeInput => set({ activeInput }),
      applyOrderbookPrice: price => {
        set(state => {
          // 1. If STOP_MARKET or TAKE_PROFIT_MARKET: only stopPrice exists!
          if (state.orderType === 'STOP_MARKET' || state.orderType === 'TAKE_PROFIT_MARKET') {
            return { stopPrice: price };
          }
          // 2. If user specifically focused a field
          if (state.activeInput === 'stopPrice') {
            return { stopPrice: price };
          }
          if (state.activeInput === 'activationPrice') {
            return { activationPrice: price };
          }
          if (state.activeInput === 'price') {
            return { price };
          }
          // 3. If STOP (Stop Limit) or TAKE_PROFIT (Take Profit Limit):
          if (state.orderType === 'STOP' || state.orderType === 'TAKE_PROFIT') {
            // If trigger price is empty, fill trigger price first!
            if (!state.stopPrice || state.stopPrice === '' || state.stopPrice === '0') {
              return { stopPrice: price };
            }
            // Else fill order price
            return { price };
          }
          // 4. Trailing Stop
          if (state.orderType === 'TRAILING_STOP_MARKET') {
            return { activationPrice: price };
          }
          // 5. Default (LIMIT, POST_ONLY, etc.)
          return { price };
        });
      },

      reset: () =>
        set(state => ({
          ...initialState,
          leverage: state.leverage,
          marginType: state.marginType,
          leverageBySymbol: state.leverageBySymbol,
          marginTypeBySymbol: state.marginTypeBySymbol,
        })),
    }),
    {
      name: 'swiftex_perps_order_entry_settings',
      partialize: state => ({
        leverage: state.leverage,
        marginType: state.marginType,
        leverageBySymbol: state.leverageBySymbol,
        marginTypeBySymbol: state.marginTypeBySymbol,
        orderType: state.orderType,
        sizeAsset: state.sizeAsset,
      }),
    }
  )
);
