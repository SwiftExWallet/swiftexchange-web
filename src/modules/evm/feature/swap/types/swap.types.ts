export interface Asset {
  code: string;
  name: string;
  decimals: number;
  address: string;
  balance: number;
  logoUri: string | null;
  isNative: boolean;
}

export type SwapType = 'EthToUsdc' | 'UsdcToWeth' | 'EthToToken' | 'TokenToEth' | 'TokenToToken';

export interface SwapQuoteRequest {
  tokenIn: {
    symbol: string;
    name: string;
    decimals: number;
    address: string;
    balance: string;
    logoUri: string | null;
    chainId?: number | string;
  };
  tokenOut: {
    symbol: string;
    name: string;
    decimals: number;
    address: string;
    balance: string;
    logoUri: string | null;
    chainId?: number | string;
  };
  amount: string;
  recipient?: string;
  slippage?: string;
}

export interface SwapQuote {
  inputAmount: string;
  inputToken: string;
  outputAmount: string;
  outputToken: string;
  pricePerToken: string;
  fee: number;
  networkFee?: number;
  poolAddress?: string;
  priceImpact: string;
  rawQuote: Record<string, unknown>;
  provider: string;
  minimumReceived?: string;
}

export interface UnifiedSwapResponse {
  success: boolean;
  provider: string;
  data: Record<string, unknown>;
}

export interface PrepareRequest {
  address: string;
  swapData: string;
  swapType: string;
  approveData: string;
  value: string;
}

export interface ExecuteRequest {
  txs: string[];
}

export interface TokenMetadata {
  name: string;
  code: string;
  decimals: number;
  logoUri: string | null;
}

export interface CachedMetadata {
  data: TokenMetadata;
  timestamp: number;
}

export interface FusionPreset {
  auctionDuration: number;
  startAuctionIn: number;
  bankFee: string;
  initialRateBump: number;
  auctionStartAmount: string;
  auctionEndAmount: string;
  tokenFee: string;
  costInDstToken?: string; // present in some 1inch Fusion Plus responses
  exclusiveResolver: string | null;
  estP: number;
  allowPartialFills: boolean;
  allowMultipleFills: boolean;
  gasCost: {
    gasBumpEstimate: number;
    gasPriceEstimate: string;
  };
  points: Array<{
    delay: number;
    coefficient: number;
  }>;
  startAmount: string;
  secretsCount?: number;
}

export interface FusionQuote {
  quoteId: string;
  fromTokenAmount: string;
  toTokenAmount: string;
  srcTokenAmount?: string;
  dstTokenAmount?: string;
  feeToken: string;
  fee?: {
    bps?: number;
    [key: string]: unknown;
  };
  presets: {
    fast: FusionPreset;
    medium: FusionPreset;
    slow: FusionPreset;
  };
  recommended_preset: string;
  prices: {
    usd: {
      fromToken: string;
      toToken: string;
      srcToken?: string; // alias used in some API versions
      dstToken?: string; // alias used in some API versions
    };
  };
  volume: {
    usd: {
      fromToken: string;
      toToken: string;
    };
  };
  priceImpact?: number; // present in cross-chain responses
  priceImpactPercent: number;
  suggested: boolean;
  marketAmount: string;
  gas: number;
  pfGas: number;
}

export interface BuildFusionOrderRequest {
  quote: FusionQuote;
  tokenIn: string;
  tokenOut: string;
  amount: string;
  walletAddress: string;
  chain: string;
  preset: string;
  permit?: string;
  toChain?: string;
  secretCount?: number;
}

export interface FusionOrder {
  order: {
    salt: string;
    makerAsset: string;
    takerAsset: string;
    maker: string;
    receiver: string;
    allowedSender: string;
    makingAmount: string;
    takingAmount: string;
    makerTraits: string;
    offsets: string;
    interactions: string;
  };
  signature: string;
  quoteId: string;
  typedData: any;
  extension: string;
  orderHash: string;
}

export type QuoteSource = 'EVM_SWAP' | 'STELLAR_SWAP' | 'FUSION_PLUS' | 'NEAR_INTENT';

/**
 * Per-source data shapes — exported for call-sites that want to narrow quote data
 * after checking `currentQuote.source`. The interface below keeps `data: any` so
 * the widespread `setCurrentQuote(prev => ({ ...prev, loading: true }))` spread
 * pattern compiles without casts on every call-site.
 *
 * Migration path: narrow with `if (q.source === 'EVM_SWAP') { const d = q.data as EvmSwapQuoteData; }`
 */
export type EvmSwapQuoteData = SwapQuote;
export type StellarSwapQuoteData = {
  estimatedOutput?: string;
  outputAmount?: string;
  minimumOutput?: string;
  networkFee?: number;
  [key: string]: unknown;
};
export type FusionPlusQuoteData = FusionQuote;
export type NearIntentQuoteData = {
  depositAddress: string;
  depositMemo?: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd?: string;
  amountIn: string;
  amountInFormatted?: string;
  amountInUsd?: string;
  minAmountOut?: string;
  timeEstimate: number;
  withdrawFee?: string;
  refundFee?: string;
  [key: string]: unknown;
};

/**
 * `data: any` preserves compatibility with the `setCurrentQuote(prev => ({ ...prev, ... }))`
 * spread pattern used throughout the codebase. Narrow via `source` when you need typed access.
 */
export interface UnifiedQuote {
  source: QuoteSource | null;

  data: any;
  error: string | null;
  loading: boolean;
  alternativeQuote?: {
    source: QuoteSource | null;

    data: any;
  };
}

export interface UnifiedAsset {
  symbol: string;
  name?: string;
  decimals: number;
  address?: string;
  contractAddress?: string;
  balance?: string;
  logoUri?: string | null;
  isNative?: boolean;
  chainId?: number | string;
  asset?: any;
  hasTrustline?: boolean;
  price?: string | number;
  priceUSD?: string | number;
}

export interface EvmGasCheckParams {
  fromChainId: number | string;
  swapAssets: UnifiedAsset[];
  selectedSellAsset: UnifiedAsset | null;
  sellAmount: string;
  actionType: 'SWAP' | 'BRIDGE';
  feePayType: 'native' | 'stablecoin';
  activeQuoteSource: QuoteSource | null;
  activeQuoteData: any;
  swapQuoteNetworkFee: number | undefined;
  isGasless: boolean;
}

export interface StellarGasCheckParams {
  fromChainId: number | string;
  stellarAssets: UnifiedAsset[];
  sellAssetSymbol: string;
  sellAmount: string;
  actionType: 'SWAP' | 'BRIDGE';
  feePayType: 'native' | 'stablecoin';
  activeQuoteData: any;
}

export interface BuyAmountParams {
  actionType: 'SWAP' | 'BRIDGE';
  isGasless: boolean;
  fusionQuote?: any; // deprecated, removing soon
  showFusionScreen: boolean;
  selectedBuyAsset: UnifiedAsset | null;
  activeQuoteSource: QuoteSource | null;
  activeQuoteData: any;
  swapQuote?: any; // deprecated, removing soon
  isSameAssetSelected: boolean;
  feePayType: 'native' | 'stablecoin';
}

export interface MinReceivedParams {
  actionType: 'SWAP' | 'BRIDGE';
  activeQuoteSource: QuoteSource | null;
  activeQuoteData: any;
  feePayType: 'native' | 'stablecoin';
  fromChainId: number | string;
  swapQuote?: any; // deprecated
  selectedBuyAsset: UnifiedAsset | null;
  userSlippageTolerance: number;
  calculatedBuyAmount: string;
}

export interface ButtonLabelParams {
  isFetchingSwapAssets: boolean;
  isQuoteLoading: boolean;
  isFetchingStellarAssets: boolean;
  sellAmount: string;
  isSameAssetSelected: boolean;
  errorMessage: string | null;
  isInsufficientBalance: boolean;
  isAmountLessThanFee: boolean;
  hasInsufficientStellarGas: boolean;
  hasInsufficientEvmGas: boolean;
  fromChainId: number | string;
  toChainId: number | string;
  selectedBuyAsset: UnifiedAsset | null;
  nativeSymbol: string;
  missingWallets?: string[];
  isStellarAccountActive?: boolean | null;
}

export interface ErrorParams {
  bridgeTxStatus: string;
  bridgeErrorMsg: string | null;
  swapError: string | null;
  activeQuoteError: string | null;
  isInsufficientBalance: boolean;
  isAmountLessThanFee: boolean;
  hasInsufficientStellarGas: boolean;
  hasInsufficientEvmGas: boolean;
  isSameAssetSelected: boolean;
  actionType: 'SWAP' | 'BRIDGE';
  crossChainWarning: string | null;
  activeQuoteData: any;
  feePayType: 'native' | 'stablecoin';
  nativeSymbol: string;
  isStellarAccountActive?: boolean | null;
  toChainId: number | string;
}
