export type RwaChain = 'ETH' | 'BSC' | 'XLM';

export type RwaIssuer = 'ondo' | 'xstocks' | 'paxos' | 'tether' | 'ondo-stellar' | 'etherfuse';

export type RwaRegionKey = 'ondo' | 'stellar-ondo' | 'xstocks' | 'paxos' | 'tether' | 'etherfuse';

export type RwaCategory = 'stock' | 'etf' | 'gold' | 'treasury';

export type MarketHoursKind = 'us' | '24-7' | string;

export interface RwaAsset {
  id: string;
  symbol: string;
  name: string;
  underlying: string | null;
  issuer: RwaIssuer;
  category: RwaCategory;
  chain: RwaChain;
  chainId: number | null;
  address: string | null;
  code: string | null;
  stellarIssuer: string | null;
  decimals: number;
  logo: string | null;
  multiplier: {
    kind: string;
    oracle: string | null;
  };
  marketHours: MarketHoursKind;
  termsUrl: string | null;
  regions: RwaRegionKey;
  market: string | null;
}

export interface RwaGroup {
  key: string;
  symbol: string;
  name: string;
  underlying: string | null;
  issuer: RwaIssuer;
  category: RwaCategory;
  market: string | null;
  logo: string | null;
  marketHours: MarketHoursKind;
  termsUrl: string | null;
  regions: RwaRegionKey;
  multiplier: {
    kind: string;
    oracle: string | null;
  };
  chains: RwaChain[];
  byChain: Partial<Record<RwaChain, RwaAsset>>;
  primary: RwaAsset;
}

export interface PayToken {
  symbol: 'USDC' | 'USDT';
  address: string;
  decimals: number;
}

export type MarketSessionStatus =
  'core' | 'pre' | 'post' | 'overnight' | 'closed' | 'halted' | '24-7';

export interface MarketStatus {
  status: MarketSessionStatus;
  label: string;
  open: boolean;
  nextChangeAt?: string | null;
}

export interface RwaPriceInfo {
  price: number | null;
  change24h: number | null;
}

export interface RwaQuoteSummary {
  fromAmount: string | null;
  toAmount: string | null;
  minReceived: string | null;
  tokenFee: string;
  fromUsd: number | null;
  toUsd: number | null;
  auctionSeconds: number | null;
  quoteId: string | null;
}

export type RwaOrderStage =
  | 'preparing'
  | 'signing'
  | 'approving'
  | 'submitting'
  | 'submitted'
  | 'filling'
  | 'filled'
  | 'expired'
  | 'cancelled'
  | 'failed';

export interface RwaOrderRecord {
  id: string;
  wallet: string;
  chain: RwaChain;
  chainId: number;
  side: 'buy' | 'sell';
  groupKey: string;
  assetId: string;
  assetSymbol: string;
  paySymbol: string;
  inToken: string;
  outToken: string;
  inDecimals: number;
  outDecimals: number;
  amountIn: string;
  amountText: string;
  expectedOut: string;
  minOut: string;
  outBalanceBefore: string | null;
  stage: RwaOrderStage;
  reason?: string;
  orderHash?: string;
  approvalTx?: string;
  fillTx?: string;
  filledBy?: 'balance';
  createdAt: number;
  checkedAt?: number;
  doneAt?: number;
  expiresAt?: number;
}
