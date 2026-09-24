import { getCurrentNetwork } from './apiConfig';
import { fetchApiResponseFromProxy } from './apiService';

export interface CctpBridgeQuoteRequest {
  evmAddress: string;
  stellarAddress: string;
  amount: string;
  fast?: boolean;
}

export interface CctpBridgeQuote {
  amount: string;
  protocolFee: string;
  maxFee: string;
  minimumReceived: string;
  estimatedTime?: string | number;
  [key: string]: any;
}

export interface CctpSigningRequest {
  type: 'EVM' | 'STELLAR' | string;
  purpose?: 'APPROVAL' | 'BRIDGE' | string;
  rawTx?: any;
  xdr?: string;
  [key: string]: any;
}

export type CctpTransferStatus =
  | 'APPROVAL_SIGNATURE_REQUIRED'
  | 'APPROVAL_PENDING'
  | 'BRIDGE_SIGNATURE_REQUIRED'
  | 'SOURCE_PENDING'
  | 'ATTESTATION_PENDING'
  | 'STELLAR_SIGNATURE_REQUIRED'
  | 'DESTINATION_PENDING'
  | 'COMPLETED'
  | 'FAILED'
  | string;

export interface CctpBridgeTransfer {
  id: string;
  status: CctpTransferStatus;
  signingRequest?: CctpSigningRequest | null;
  sourceTxHash?: string | null;
  approvalTxHash?: string | null;
  destinationTxHash?: string | null;
  error?: string | null;
  amount?: string;
  fast?: boolean;
  evmAddress?: string;
  stellarAddress?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface CctpCreateBridgeRequest {
  evmAddress: string;
  stellarAddress: string;
  amount: string;
  fast?: boolean;
}

export function getCctpChainConfig(network?: 'mainnet' | 'testnet') {
  const current = network || getCurrentNetwork();
  return {
    nativeChainKey: 'ETH',
    chainId: current === 'testnet' ? 11155111 : 1,
    network: current,
  };
}

export async function getCctpBridgeQuote(
  params: CctpBridgeQuoteRequest,
  signal?: AbortSignal
): Promise<CctpBridgeQuote> {
  const res = await fetchApiResponseFromProxy<CctpBridgeQuote>(
    '/bridge/quote',
    'POST',
    {
      evmAddress: params.evmAddress,
      stellarAddress: params.stellarAddress,
      amount: params.amount.trim(),
      fast: !!params.fast,
    },
    1,
    false,
    signal
  );
  return res.data;
}

export async function createCctpBridge(
  params: CctpCreateBridgeRequest
): Promise<CctpBridgeTransfer> {
  const res = await fetchApiResponseFromProxy<CctpBridgeTransfer>('/bridge', 'POST', {
    evmAddress: params.evmAddress,
    stellarAddress: params.stellarAddress,
    amount: params.amount.trim(),
    fast: !!params.fast,
  });
  return res.data;
}

export async function submitCctpEvmSignature(
  transferId: string,
  signedTxOrHash: string
): Promise<CctpBridgeTransfer> {
  const normalizedTx = '0x' + signedTxOrHash.replace(/^(0x)+/i, '');
  const res = await fetchApiResponseFromProxy<CctpBridgeTransfer>(
    `/bridge/${transferId}/evm-signature`,
    'POST',
    {
      signedTx: normalizedTx,
    }
  );
  return res.data;
}

export async function submitCctpStellarSignature(
  transferId: string,
  signedXdr: string
): Promise<CctpBridgeTransfer> {
  const res = await fetchApiResponseFromProxy<CctpBridgeTransfer>(
    `/bridge/${transferId}/stellar-signature`,
    'POST',
    {
      signedXdr,
    }
  );
  return res.data;
}

export async function getCctpBridgeTransfer(transferId: string): Promise<CctpBridgeTransfer> {
  const res = await fetchApiResponseFromProxy<CctpBridgeTransfer>(`/bridge/${transferId}`, 'GET');
  return res.data;
}
