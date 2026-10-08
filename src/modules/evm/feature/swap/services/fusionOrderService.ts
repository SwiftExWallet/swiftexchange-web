import { fetchApiResponseFromProxy } from '../../../../../service/apiService';
import { getChainById } from '../../../utils/Chainregistry';
import type { BuildFusionOrderRequest } from '../types/swap.types';

/**
 * Resolves the chain symbol used by 1inch APIs.
 * BNB Smart Chain is referenced as 'BSC' in the 1inch API.
 */
const getChainSymbol = (chainId: number | string): string => {
  const chain = getChainById(chainId);
  const symbol = (chain?.symbol || chain?.nativeCurrency.symbol || '').toUpperCase();
  return symbol === 'BNB' ? 'BSC' : symbol;
};

/**
 * Extracts a backend error message from a 1inch Fusion response payload if it represents an error.
 * Handles both HTTP error shapes and error bodies returned under HTTP 200 (e.g. {"code":"PROVIDER_BAD_RESPONSE","message":"Provider rejected the request."}).
 */
export function extractFusionErrorMessage(data: any): string | null {
  if (!data || typeof data !== 'object') return null;

  const isErrorPayload =
    data.code === 'PROVIDER_BAD_RESPONSE' ||
    data.code === 'BAD_REQUEST' ||
    data.success === false ||
    data.status === 'error' ||
    (data.statusCode && Number(data.statusCode) >= 400) ||
    (data.code && data.message && !data.orderHash && !data.txHash) ||
    (data.error && !data.orderHash && !data.txHash);

  if (!isErrorPayload) return null;

  const msg =
    data.message ||
    (typeof data.error === 'string'
      ? data.error
      : data.error?.message || data.error?.description) ||
    data.description ||
    (typeof data.error === 'object' ? JSON.stringify(data.error) : null) ||
    'Provider rejected the request.';

  return typeof msg === 'string' ? msg : String(msg);
}

export async function get1InchFusionQuote(
  chainId: number | string,
  request: {
    tokenIn: string;
    tokenOut: string;
    amount: string;
    walletAddress: string;
    decimals?: number;
  },
  toChainId?: number | string,
  signal?: AbortSignal
): Promise<any> {
  const isCrossChain = toChainId && String(chainId) !== String(toChainId);
  const endpoint = isCrossChain
    ? `/swap/1inch/fusion-plus/getSwapQuote`
    : `/swap/1inch/getSwapQuote`;

  const payload: Record<string, unknown> = isCrossChain
    ? {
        srcChain: getChainSymbol(chainId),
        dstChain: getChainSymbol(toChainId!),
        srcTokenAddress: request.tokenIn,
        dstTokenAddress: request.tokenOut,
        walletAddress: request.walletAddress,
        amount: request.amount,
      }
    : {
        chain: getChainSymbol(chainId),
        tokenIn: request.tokenIn,
        tokenOut: request.tokenOut,
        amount: request.amount,
        walletAddress: request.walletAddress,
      };

  const res = await fetchApiResponseFromProxy<any>(
    endpoint,
    'POST',
    payload,
    undefined,
    false,
    signal
  );
  const data = res.data?.data || res.data;

  const errMsg = extractFusionErrorMessage(data) || extractFusionErrorMessage(res.data);
  if (errMsg) throw new Error(errMsg);

  if (!data) throw new Error('No 1inch quote data received');
  return data;
}

export async function build1InchFusionOrder(
  request: BuildFusionOrderRequest & { isNative?: boolean }
): Promise<any> {
  const isCrossChain = !!request.toChain;

  let endpoint: string;
  if (request.isNative) {
    endpoint = `/swap/1inch/buildFusionPlusNativeOrder`;
  } else if (isCrossChain) {
    endpoint = `/swap/1inch/buildFusionPlusOrder`;
  } else {
    endpoint = `/swap/1inch/buildFusionOrder`;
  }

  const quoteId: string | undefined =
    request.quote?.quoteId ?? (request.quote as any)?.data?.quoteId ?? (request as any).quoteId;

  if (isCrossChain && !quoteId) {
    throw new Error('quoteId missing for Fusion+ cross-chain order. Cannot build order.');
  }

  let payload: Record<string, unknown>;

  if (request.isNative) {
    payload = {
      srcChain: request.chain,
      dstChain: request.toChain ?? request.chain,
      amount: request.amount,
      srcTokenAddress: request.tokenIn,
      dstTokenAddress: request.tokenOut,
      walletAddress: request.walletAddress,
    };
  } else if (isCrossChain) {
    payload = {
      quoteId,
      walletAddress: request.walletAddress,
      secretCount: request.secretCount ?? 1,
    };
  } else {
    payload = {
      quote: request.quote,
      tokenIn: request.tokenIn,
      tokenOut: request.tokenOut,
      amount: request.amount,
      walletAddress: request.walletAddress,
      chain: request.chain,
    };
  }

  const res = await fetchApiResponseFromProxy<any>(endpoint, 'POST', payload);
  const data = res.data?.data || res.data;

  const errMsg = extractFusionErrorMessage(data) || extractFusionErrorMessage(res.data);
  if (errMsg) throw new Error(errMsg);

  if (!data) throw new Error('Failed to build 1inch Fusion order');
  return data;
}

export async function submit1InchFusionOrder(
  request: any,
  isCrossChain?: boolean,
  isNative?: boolean
): Promise<any> {
  const isNativeOrder = Boolean(isNative || request?.txHash);

  let endpoint: string;
  let payload: any;

  if (isNativeOrder) {
    endpoint = `/swap/1inch/submitFusionPlusNativeOrder`;
    payload = {
      orderHash: request.orderHash,
      txHash: request.txHash,
      srcChain: request.srcChain || request.chain,
    };
  } else if (isCrossChain) {
    endpoint = `/swap/1inch/submitFusionPlusOrder`;
    payload = {
      chain: request.chain,
      toChain: request.toChain,
      order: request.order,
      signature: request.signature,
      extension: request.extension,
      quoteId: request.quoteId,
      orderHash: request.orderHash,
    };
  } else {
    endpoint = `/swap/1inch/submitOrder`;
    const orderPayload = { ...request };
    delete orderPayload.permit;
    payload = orderPayload;
  }

  const res = await fetchApiResponseFromProxy<any>(endpoint, 'POST', payload);
  const data = res.data?.data || res.data;

  const errMsg = extractFusionErrorMessage(data) || extractFusionErrorMessage(res.data);
  if (errMsg) throw new Error(errMsg);

  if (!data) throw new Error('Failed to submit 1inch Fusion order');
  return data;
}
