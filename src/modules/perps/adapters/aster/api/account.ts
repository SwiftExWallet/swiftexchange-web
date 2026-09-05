import type { Signer } from 'ethers';
import { getAddress, isAddress } from 'ethers';

import {
  ASTER_ENDPOINTS,
  getAsterBapiUrl,
  getAsterRestUrl,
  getAsterSpotRestUrl,
} from '../constants';
import type {
  AsterAccountInfo,
  AsterBalance,
  AsterPositionRisk,
  AsterUserTrade,
  GetIncomeHistoryParams,
  IncomeRecord,
  MarginType,
  SymbolLeverageBracket,
} from '../types/account';
import { signedRequest } from './auth';

export interface DepositAsset {
  name: string;
  displayName: string;
  contractAddress: string;
  decimals: number;
  network: string;
  chainId: number;
  isNative: boolean;
  isProfit: boolean;
  rank: number;
  withdrawType?: string;
}

export type WithdrawAsset = DepositAsset;

export interface ChainWithdrawBalance {
  chainId: number;
  spotMaxWithdrawAmount: number;
  perpMaxWithdrawAmount: number;
  chainLimit: number;
  withdrawFee: number;
}

export interface AssetWithdrawBalance {
  currency: string;
  spotTotalWithdrawAmount: number;
  perpTotalWithdrawAmount: number;
  dailyLimit: number;
  chainBalances: Record<string, ChainWithdrawBalance>;
}

export interface UserWithdrawInfo {
  userDailyLimit: number;
  userRemainingDailyLimit: number;
  totalDailyLimit: number;
  totalRemainingDailyLimit: number;
  balances: Record<string, AssetWithdrawBalance>;
}

export function getChainWithdrawDetails(
  info: UserWithdrawInfo | null,
  assetName: string,
  chainId: number,
  accountType: 'spot' | 'perp' = 'perp'
): { fee: number; maxAmount: number; chainLimit: number } {
  if (!info?.balances) return { fee: 0, maxAmount: 0, chainLimit: 0 };
  const assetInfo = info.balances[assetName];
  if (!assetInfo) return { fee: 0, maxAmount: 0, chainLimit: 0 };
  const chainBal = assetInfo.chainBalances?.[String(chainId)];
  if (!chainBal) return { fee: 0, maxAmount: 0, chainLimit: 0 };
  const maxAmount =
    accountType === 'spot' ? chainBal.spotMaxWithdrawAmount : chainBal.perpMaxWithdrawAmount;
  return {
    fee: chainBal.withdrawFee,
    maxAmount,
    chainLimit: chainBal.chainLimit,
  };
}

export interface DepositWithdrawRecord {
  id: string;
  txHash: string;
  chainId: number;
  asset: string;
  amount: string;
  fee?: string;
  state: 'PENDING' | 'SUCCESS' | 'FAILED' | 'PROCESSING';
  type: 'DEPOSIT' | 'WITHDRAW';
  time: number;
  accountType?: string;
  address?: string;
}

export async function getAccountInfo(signer: Signer, userAddr: string): Promise<AsterAccountInfo> {
  return signedRequest(signer, userAddr, 'GET', ASTER_ENDPOINTS.ACCOUNT);
}

export async function getBalance(signer: Signer, userAddr: string): Promise<AsterBalance[]> {
  return signedRequest(signer, userAddr, 'GET', ASTER_ENDPOINTS.BALANCE);
}

export async function getPositionRisk(
  signer: Signer,
  userAddr: string,
  symbol?: string
): Promise<AsterPositionRisk[]> {
  const p: Record<string, string> = {};
  if (symbol) p.symbol = symbol;
  return signedRequest(signer, userAddr, 'GET', ASTER_ENDPOINTS.POSITION_RISK, p);
}

export async function changeLeverage(
  signer: Signer,
  userAddr: string,
  symbol: string,
  leverage: number
): Promise<{ leverage: number; maxNotionalValue: string; symbol: string }> {
  return signedRequest(signer, userAddr, 'POST', ASTER_ENDPOINTS.LEVERAGE, {
    symbol,
    leverage: String(leverage),
  });
}

export async function changeMarginType(
  signer: Signer,
  userAddr: string,
  symbol: string,
  marginType: MarginType
): Promise<{ code: number; msg: string }> {
  return signedRequest(signer, userAddr, 'POST', ASTER_ENDPOINTS.MARGIN_TYPE, {
    symbol,
    marginType,
  });
}

export async function changePositionMargin(
  signer: Signer,
  userAddr: string,
  symbol: string,
  amount: string,
  type: 1 | 2
): Promise<{ amount: number; code: number; msg: string; type: number }> {
  return signedRequest(signer, userAddr, 'POST', ASTER_ENDPOINTS.POSITION_MARGIN, {
    symbol,
    amount,
    type: String(type),
  });
}

export async function getLeverageBracket(
  signer: Signer,
  userAddr: string,
  symbol?: string
): Promise<SymbolLeverageBracket[]> {
  const p: Record<string, string> = {};
  if (symbol) p.symbol = symbol;
  return signedRequest(signer, userAddr, 'GET', ASTER_ENDPOINTS.LEVERAGE_BRACKET, p);
}

export async function getIncomeHistory(
  signer: Signer,
  userAddr: string,
  params: GetIncomeHistoryParams = {}
): Promise<IncomeRecord[]> {
  const p: Record<string, string> = {};
  if (params.symbol) p.symbol = params.symbol;
  if (params.incomeType) p.incomeType = params.incomeType;
  if (params.startTime !== undefined) p.startTime = String(params.startTime);
  if (params.endTime !== undefined) p.endTime = String(params.endTime);
  if (params.limit !== undefined) p.limit = String(params.limit);
  return signedRequest(signer, userAddr, 'GET', ASTER_ENDPOINTS.INCOME, p);
}

export async function changeMultiAssetsMargin(
  signer: Signer,
  userAddr: string,
  multiAssetsMargin: boolean
): Promise<{ code: number; msg: string }> {
  return signedRequest(signer, userAddr, 'POST', ASTER_ENDPOINTS.MULTI_ASSETS_MARGIN, {
    multiAssetsMargin: multiAssetsMargin ? 'true' : 'false',
  });
}

export async function getMultiAssetsMargin(
  signer: Signer,
  userAddr: string
): Promise<{ multiAssetsMargin: boolean }> {
  return signedRequest(signer, userAddr, 'GET', ASTER_ENDPOINTS.MULTI_ASSETS_MARGIN);
}

export async function getUserTrades(
  signer: Signer,
  userAddr: string,
  symbol?: string,
  opts: { startTime?: number; endTime?: number; limit?: number; fromId?: number } = {}
): Promise<AsterUserTrade[]> {
  const p: Record<string, string> = {};
  if (symbol) p.symbol = symbol;
  if (opts.startTime !== undefined) p.startTime = String(opts.startTime);
  if (opts.endTime !== undefined) p.endTime = String(opts.endTime);
  if (opts.limit !== undefined) p.limit = String(opts.limit);
  if (opts.fromId !== undefined) p.fromId = String(opts.fromId);
  return signedRequest(signer, userAddr, 'GET', ASTER_ENDPOINTS.USER_TRADES, p);
}

const depositAssetsCache: Record<string, { timestamp: number; data: DepositAsset[] }> = {};
const withdrawAssetsCache: Record<string, { timestamp: number; data: WithdrawAsset[] }> = {};
const CACHE_TTL_MS = 180000;

export async function getDepositAssets(
  chainIds: string = '56',
  accountType: 'spot' | 'perp' = 'perp',
  networks: string = 'EVM'
): Promise<DepositAsset[]> {
  const cacheKey = `dep_${chainIds}_${accountType}_${networks}`;
  const cached = depositAssetsCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const qs = new URLSearchParams({ chainIds, networks, accountType }).toString();
    const res = await fetch(`${getAsterBapiUrl()}/aster/deposit/assets?${qs}`);
    const data = await res.json();

    const isSuccess = data.success === true || data.code === '000000';
    if (isSuccess && Array.isArray(data.data) && data.data.length > 0) {
      const result: DepositAsset[] = data.data;
      depositAssetsCache[cacheKey] = { timestamp: Date.now(), data: result };
      return result;
    }
  } catch (err) {
    console.warn('[Deposit] Failed to fetch deposit assets from Aster bapi, using fallback:', err);
  }

  // Fallback default assets for BSC Testnet (97) and BSC Mainnet (56)
  const isTestnet = chainIds === '97' || chainIds === '421614' || chainIds === '11155111';
  const fallback: DepositAsset[] = [
    {
      name: 'USDT',
      displayName: 'USDT',
      contractAddress:
        chainIds === '97'
          ? '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd'
          : chainIds === '42161'
            ? '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
            : '0x55d398326f99059fF775485246999027B3197955',
      decimals: 18,
      network: isTestnet ? 'BSC Testnet' : 'BSC',
      chainId: Number(chainIds) || 56,
      isNative: false,
      isProfit: true,
      rank: 1,
    },
    {
      name: 'USDC',
      displayName: 'USDC',
      contractAddress:
        chainIds === '97'
          ? '0x64544969ed7EBf5f083679233325356EbE738930'
          : chainIds === '42161'
            ? '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
            : '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      decimals: 18,
      network: isTestnet ? 'BSC Testnet' : 'BSC',
      chainId: Number(chainIds) || 56,
      isNative: false,
      isProfit: false,
      rank: 2,
    },
  ];
  return fallback;
}

export async function getWithdrawAssets(
  chainIds: string = '56',
  accountType: 'spot' | 'perp' = 'perp',
  networks: string = 'EVM'
): Promise<WithdrawAsset[]> {
  const cacheKey = `wd_${chainIds}_${accountType}_${networks}`;
  const cached = withdrawAssetsCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const qs = new URLSearchParams({ chainIds, networks, accountType }).toString();
  const res = await fetch(`${getAsterBapiUrl()}/aster/withdraw/assets?${qs}`);
  const data = await res.json();

  const isSuccess = data.success === true || data.code === '000000';
  if (!isSuccess || !Array.isArray(data.data)) {
    throw new Error(data.message || data.messageDetail || 'Failed to fetch withdraw assets');
  }

  const result: WithdrawAsset[] = data.data;
  withdrawAssetsCache[cacheKey] = { timestamp: Date.now(), data: result };
  return result;
}

export async function getUserWithdrawInfo(
  signer: Signer,
  userAddr: string,
  accountType: 'spot' | 'perp' = 'perp'
): Promise<UserWithdrawInfo> {
  const baseUrl = accountType === 'spot' ? getAsterSpotRestUrl() : getAsterRestUrl();
  const res = await signedRequest(
    signer,
    userAddr,
    'POST',
    ASTER_ENDPOINTS.ASTER_USER_WITHDRAW_INFO,
    {},
    baseUrl
  );

  return res as UserWithdrawInfo;
}

export async function getDepositWithdrawHistory(
  signer: Signer,
  userAddr: string,
  opts: {
    type?: 'DEPOSIT' | 'WITHDRAW';
    startTime?: number;
    endTime?: number;
    limit?: number;
    accountType?: 'spot' | 'perp';
  } = {}
): Promise<DepositWithdrawRecord[]> {
  const params: Record<string, string> = {};
  if (opts.type) params.type = opts.type;
  if (opts.startTime) params.startTime = String(opts.startTime);
  if (opts.endTime) params.endTime = String(opts.endTime);
  if (opts.limit) params.limit = String(opts.limit);

  const baseUrl = opts.accountType === 'spot' ? getAsterSpotRestUrl() : getAsterRestUrl();
  const res = await signedRequest(
    signer,
    userAddr,
    'POST',
    ASTER_ENDPOINTS.DEPOSIT_WITHDRAW_HISTORY,
    params,
    baseUrl
  );

  return Array.isArray(res) ? res : res?.data || [];
}

export async function submitWithdraw(
  signer: Signer,
  userAddr: string,
  params: {
    chainId: number;
    asset: string;
    amount: string;
    fee: string;
    receiver: string;
    userNonce: string;
    userSignature: string;
    accountType?: 'spot' | 'perp';
  }
): Promise<{ success: boolean; id?: string; msg?: string }> {
  if (!isAddress(params.receiver)) {
    throw new Error(`Invalid receiver address format: ${params.receiver}`);
  }

  const checksummedReceiver = getAddress(params.receiver);
  const baseUrl = params.accountType === 'spot' ? getAsterSpotRestUrl() : getAsterRestUrl();

  return signedRequest(
    signer,
    userAddr,
    'POST',
    ASTER_ENDPOINTS.ASTER_USER_WITHDRAW,
    {
      chainId: String(params.chainId),
      asset: params.asset,
      amount: params.amount,
      fee: params.fee,
      receiver: checksummedReceiver,
      userNonce: params.userNonce,
      userSignature: params.userSignature,
    },
    baseUrl
  );
}
