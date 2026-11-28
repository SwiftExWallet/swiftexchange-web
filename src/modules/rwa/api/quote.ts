import { extractFusionErrorMessage } from '@/modules/evm/feature/swap/services/fusionOrderService';
import { parseSwapError } from '@/modules/evm/feature/swap/utils/swapErrorHandler';
import { fetchApiResponseFromProxy } from '@/service/apiService';

import { CHAIN_INFO } from '../config/rwaConfig';
import type { PayToken, RwaAsset, RwaQuoteSummary } from '../types/rwa.types';
import { type MappedQuoteError, mapQuoteError } from '../utils/quoteErrors';

export const buildQuoteRequest = ({
  side,
  asset,
  payToken,
  amountUnits,
  wallet,
}: {
  side: 'buy' | 'sell';
  asset: RwaAsset;
  payToken: PayToken;
  amountUnits: string;
  wallet: string;
}) => ({
  tokenIn: side === 'buy' ? payToken.address : asset.address!,
  tokenOut: side === 'buy' ? asset.address! : payToken.address,
  amount: String(amountUnits),
  walletAddress: wallet,
  chain: CHAIN_INFO[asset.chain].backend!,
});

export const summarizeQuote = (q: any): RwaQuoteSummary | null => {
  if (!q || !q.presets || !q.recommended_preset || !q.presets[q.recommended_preset]) return null;
  const p = q.presets[q.recommended_preset];
  return {
    fromAmount: q.fromTokenAmount != null ? String(q.fromTokenAmount) : null,
    toAmount: q.toTokenAmount != null ? String(q.toTokenAmount) : null,
    minReceived: p.auctionEndAmount != null ? String(p.auctionEndAmount) : null,
    tokenFee: p.tokenFee != null ? String(p.tokenFee) : '0',
    fromUsd: q.prices && q.prices.usd ? Number(q.prices.usd.fromToken) : null,
    toUsd: q.prices && q.prices.usd ? Number(q.prices.usd.toToken) : null,
    auctionSeconds: p.auctionDuration != null ? Number(p.auctionDuration) : null,
    quoteId: q.quoteId || null,
  };
};

export type RwaQuoteResult =
  | { ok: true; quote: any; summary: RwaQuoteSummary }
  | { ok: false; error: MappedQuoteError; status: number };

export const getRwaQuote = async (params: {
  side: 'buy' | 'sell';
  asset: RwaAsset;
  payToken: PayToken;
  amountUnits: string;
  wallet: string;
}): Promise<RwaQuoteResult> => {
  const body = buildQuoteRequest(params);
  try {
    const res = await fetchApiResponseFromProxy<any>('/swap/1inch/getSwapQuote', 'POST', body);
    const data = res.data?.data || res.data;
    if (
      res.error ||
      data?.code === 'PROVIDER_BAD_RESPONSE' ||
      data?.success === false ||
      (data?.statusCode && Number(data.statusCode) >= 400)
    ) {
      const status = Number(data?.statusCode || 400);
      const serverMsg =
        (typeof data?.message === 'string' && data.message) ||
        (typeof res.error === 'string' && res.error) ||
        (typeof data?.error === 'string' && data.error) ||
        'Quote request failed.';
      return {
        ok: false,
        error: { code: status === 401 ? 'auth' : 'other', text: serverMsg },
        status,
      };
    }
    const summary = summarizeQuote(data);
    if (!summary) {
      return {
        ok: false,
        error: {
          code: 'unsupported',
          text:
            (typeof data?.message === 'string' && data.message) ||
            'No quote available for this pair.',
        },
        status: 200,
      };
    }
    return { ok: true, quote: data, summary };
  } catch (e: any) {
    const rawMsg = String(e?.message || '');
    let parsed: any = e?.response?.data || null;
    if (!parsed && rawMsg.includes('{')) {
      try {
        parsed = JSON.parse(rawMsg.slice(rawMsg.indexOf('{')));
      } catch {
        // ignore JSON parse failure
      }
    }
    const status = Number(
      e?.status ||
        e?.response?.status ||
        parsed?.statusCode ||
        (rawMsg.includes('API error') ? 400 : 0)
    );
    const serverMsg =
      (typeof parsed?.message === 'string' && parsed.message) ||
      extractFusionErrorMessage(parsed) ||
      '';
    if (serverMsg) {
      return {
        ok: false,
        error: { code: status === 401 ? 'auth' : 'other', text: serverMsg },
        status,
      };
    }
    const mapped = mapQuoteError({ status, message: rawMsg });
    return {
      ok: false,
      error: mapped || {
        code: status === 0 ? 'network' : 'other',
        text: parseSwapError(e) || 'Quote request failed.',
      },
      status,
    };
  }
};
