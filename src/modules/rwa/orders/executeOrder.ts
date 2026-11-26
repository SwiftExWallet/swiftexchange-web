import {
  ensureFusionAllowance,
  readAllowance,
} from '@/modules/evm/feature/swap/execution/approvalExecutor';
import { parseSwapError } from '@/modules/evm/feature/swap/utils/swapErrorHandler';
import { parseRawChainId, switchOrAddChain } from '@/modules/evm/utils/evmChainUtils';
import { fetchApiResponseFromProxy } from '@/service/apiService';

import { tokenBalance } from '../api/balances';
import { buildQuoteRequest } from '../api/quote';
import { CHAIN_INFO, ONEINCH_LOP } from '../config/rwaConfig';
import type { PayToken, RwaAsset, RwaOrderRecord, RwaQuoteSummary } from '../types/rwa.types';
import { verifyRwaFusionOrder } from './fusionCheck';
import { canStartOrder, expiryFor, quoteIsFresh } from './orderState';
import { loadOrders, renameOrder, upsertOrder } from './orderStore';

let inFlight = false;
const PREPARE_FAILED = "Couldn't prepare the order. Nothing was signed or sent — please try again.";

export interface ExecuteRwaOrderParams {
  wallet: string;
  provider: any;
  asset: RwaAsset;
  side: 'buy' | 'sell';
  payToken: PayToken;
  amountUnits: string;
  amountText: string;
  quote: any;
  summary: RwaQuoteSummary;
  quotedAt: number;
  groupKey: string;
}

export const executeRwaOrder = async (
  params: ExecuteRwaOrderParams,
  onUpdate: (record: RwaOrderRecord) => void = () => {}
): Promise<RwaOrderRecord | { error: string; code?: string }> => {
  const {
    wallet,
    provider,
    asset,
    side,
    payToken,
    amountUnits,
    amountText,
    quote,
    summary,
    quotedAt,
    groupKey,
  } = params;

  if (!provider) return { error: 'EVM wallet not connected.' };
  if (inFlight) return { error: 'An order is already being sent.' };
  if (!quoteIsFresh(quotedAt)) {
    return { error: 'This quote has expired. Get a new quote first.', code: 'quote-expired' };
  }

  const existing = loadOrders(wallet);
  const can = canStartOrder(existing);
  if (!can.ok) {
    return {
      error:
        can.reason === 'open'
          ? 'You already have an open order in progress.'
          : 'Please wait a few seconds before placing another order.',
    };
  }

  const chainInfo = CHAIN_INFO[asset.chain];
  const chainId = chainInfo.chainId!;
  const inToken = side === 'buy' ? payToken.address : asset.address!;
  const outToken = side === 'buy' ? asset.address! : payToken.address;
  const inDecimals = side === 'buy' ? payToken.decimals : asset.decimals;
  const outDecimals = side === 'buy' ? asset.decimals : payToken.decimals;
  const expectedOut = summary.toAmount || '0';
  const minOut = summary.minReceived || expectedOut;

  const createdAt = Date.now();
  let record: RwaOrderRecord = {
    id: `rwa_${createdAt}`,
    wallet,
    chain: asset.chain,
    chainId,
    side,
    groupKey,
    assetId: asset.id,
    assetSymbol: asset.symbol,
    paySymbol: payToken.symbol,
    inToken,
    outToken,
    inDecimals,
    outDecimals,
    amountIn: String(amountUnits),
    amountText,
    expectedOut,
    minOut,
    outBalanceBefore: null,
    stage: 'preparing',
    createdAt,
    expiresAt: expiryFor(createdAt, summary.auctionSeconds),
  };

  inFlight = true;
  try {
    upsertOrder(wallet, record);
    onUpdate(record);

    // Ensure wallet is on target chain
    const rawChainId = await provider.request({ method: 'eth_chainId' });
    if (parseRawChainId(rawChainId) !== chainId) {
      await switchOrAddChain(provider, chainId);
      await new Promise(r => setTimeout(r, 300));
    }

    // Snapshot output balance before order for ground-truth fill detection
    try {
      record = { ...record, outBalanceBefore: await tokenBalance(asset.chain, outToken, wallet) };
    } catch {
      record = { ...record, outBalanceBefore: null };
    }

    // 1. Build Fusion order on backend
    const buildBody = {
      ...buildQuoteRequest({ side, asset, payToken, amountUnits, wallet }),
      quote,
    };
    const buildRes = await fetchApiResponseFromProxy<any>(
      '/swap/1inch/buildFusionOrder',
      'POST',
      buildBody
    );
    const built = buildRes.data?.data || buildRes.data;
    if (buildRes.error || !built || !built.typedData || !built.orderHash) {
      throw new Error(PREPARE_FAILED);
    }

    // 2. Strict client-side Fusion verification before signing
    verifyRwaFusionOrder(built.typedData, {
      wallet,
      chainId,
      extension: built.extension,
      orderHash: built.orderHash,
      minTakingAmount: minOut,
    });

    // 3. Approve exact amount if needed
    const amountBN = BigInt(amountUnits);
    const currentAllowance = await readAllowance(inToken, wallet, ONEINCH_LOP, chainId, provider);
    if (currentAllowance < amountBN) {
      record = { ...record, stage: 'approving' };
      upsertOrder(wallet, record);
      onUpdate(record);

      const approval = await ensureFusionAllowance(
        inToken,
        wallet,
        amountBN,
        provider,
        chainId,
        undefined,
        false,
        currentAllowance,
        hash => {
          record = { ...record, approvalTx: hash };
          upsertOrder(wallet, record);
          onUpdate(record);
        }
      );
      if (approval.approvalTxHash) {
        record = { ...record, approvalTx: approval.approvalTxHash };
      }
    }

    // 4. Sign EIP-712 typed data
    record = { ...record, stage: 'signing' };
    upsertOrder(wallet, record);
    onUpdate(record);

    const typedData = built.typedData;
    const signature: string = await provider.request({
      method: 'eth_signTypedData_v4',
      params: [wallet, JSON.stringify(typedData)],
    });
    if (!signature) throw new Error('Signature cancelled.');

    // 5. Submit signed order
    record = { ...record, stage: 'submitting' };
    upsertOrder(wallet, record);
    onUpdate(record);

    const submitPayload = {
      order: typedData.message,
      signature,
      extension: built.extension,
      quoteId: summary.quoteId || quote?.quoteId,
      orderHash: built.orderHash,
      chain: chainInfo.backend,
    };
    const submitRes = await fetchApiResponseFromProxy<any>(
      '/swap/1inch/submitOrder',
      'POST',
      submitPayload
    );
    const submitData = submitRes.data?.data || submitRes.data;
    if (
      submitRes.error ||
      submitData?.success === false ||
      submitData?.code === 'PROVIDER_BAD_RESPONSE'
    ) {
      throw new Error(submitRes.error || submitData?.message || 'Failed to submit order.');
    }

    const oldId = record.id;
    record = {
      ...record,
      id: built.orderHash,
      orderHash: built.orderHash,
      stage: 'submitted',
    };
    renameOrder(wallet, oldId, record);
    onUpdate(record);
    return record;
  } catch (err: any) {
    const msg = parseSwapError(err) || String(err?.message || PREPARE_FAILED);
    record = { ...record, stage: 'failed', reason: msg, doneAt: Date.now() };
    upsertOrder(wallet, record);
    onUpdate(record);
    return { error: msg };
  } finally {
    inFlight = false;
  }
};
