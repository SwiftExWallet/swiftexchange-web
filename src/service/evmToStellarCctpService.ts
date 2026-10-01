import { StrKey } from '@stellar/stellar-sdk';
import { getAddress, isAddress } from 'ethers';

import { getCurrentNetwork } from './apiConfig';
import { fetchApiResponseFromProxy } from './apiService';

export type CctpBridgeDirection = 'EVM_TO_STELLAR' | 'STELLAR_TO_EVM';

export interface CctpEvmChainConfig {
  id: string;
  name: string;
  symbol: string;
  logo: string;
  mainnet: {
    chainId: number;
    displayName: string;
    sourceChainKey: string;
    explorerUrl: string;
    rpcUrl: string;
  };
  testnet: {
    chainId: number;
    displayName: string;
    sourceChainKey: string;
    explorerUrl: string;
    rpcUrl: string;
  };
}

/**
 * Circle CCTP Supported EVM Chains
 * Note: BNB Chain (BSC) is deliberately excluded as Circle CCTP does not support BNB.
 */
export const CCTP_SUPPORTED_EVM_CHAINS: CctpEvmChainConfig[] = [
  {
    id: 'ethereum',
    name: 'Ethereum',
    symbol: 'ETH',
    logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
    mainnet: {
      chainId: 1,
      displayName: 'Ethereum',
      sourceChainKey: 'ethereum',
      explorerUrl: 'https://etherscan.io',
      rpcUrl: 'https://eth.llamarpc.com',
    },
    testnet: {
      chainId: 11155111,
      displayName: 'Sepolia',
      sourceChainKey: 'sepolia',
      explorerUrl: 'https://sepolia.etherscan.io',
      rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    },
  },
  {
    id: 'arbitrum',
    name: 'Arbitrum',
    symbol: 'ARB',
    logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',
    mainnet: {
      chainId: 42161,
      displayName: 'Arbitrum',
      sourceChainKey: 'arbitrum',
      explorerUrl: 'https://arbiscan.io',
      rpcUrl: 'https://arb1.arbitrum.io/rpc',
    },
    testnet: {
      chainId: 421614,
      displayName: 'Arb Sepolia',
      sourceChainKey: 'arbitrum_sepolia',
      explorerUrl: 'https://sepolia.arbiscan.io',
      rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    },
  },
  {
    id: 'base',
    name: 'Base',
    symbol: 'BASE',
    logo: 'https://raw.githubusercontent.com/base/brand-kit/main/logo/in-product/Base_Network_Logo.svg',
    mainnet: {
      chainId: 8453,
      displayName: 'Base',
      sourceChainKey: 'base',
      explorerUrl: 'https://basescan.org',
      rpcUrl: 'https://mainnet.base.org',
    },
    testnet: {
      chainId: 84532,
      displayName: 'Base Sepolia',
      sourceChainKey: 'base_sepolia',
      explorerUrl: 'https://sepolia.basescan.org',
      rpcUrl: 'https://sepolia.base.org',
    },
  },
  {
    id: 'optimism',
    name: 'Optimism',
    symbol: 'OP',
    logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png',
    mainnet: {
      chainId: 10,
      displayName: 'Optimism',
      sourceChainKey: 'optimism',
      explorerUrl: 'https://optimistic.etherscan.io',
      rpcUrl: 'https://mainnet.optimism.io',
    },
    testnet: {
      chainId: 11155420,
      displayName: 'OP Sepolia',
      sourceChainKey: 'optimism_sepolia',
      explorerUrl: 'https://sepolia-optimism.etherscan.io',
      rpcUrl: 'https://sepolia.optimism.io',
    },
  },
  {
    id: 'avalanche',
    name: 'Avalanche',
    symbol: 'AVAX',
    logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png',
    mainnet: {
      chainId: 43114,
      displayName: 'Avalanche',
      sourceChainKey: 'avalanche',
      explorerUrl: 'https://snowtrace.io',
      rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    },
    testnet: {
      chainId: 43113,
      displayName: 'Avax Fuji',
      sourceChainKey: 'avalanche_fuji',
      explorerUrl: 'https://testnet.snowtrace.io',
      rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
    },
  },
];

export interface CctpBridgeQuoteRequest {
  direction?: CctpBridgeDirection;
  evmAddress: string;
  stellarAddress: string;
  amount: string;
  sourceChain?: string;
  destinationChain?: string;
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
  | 'BURN_SIGNATURE_REQUIRED'
  | 'SOURCE_PENDING'
  | 'ATTESTATION_PENDING'
  | 'STELLAR_SIGNATURE_REQUIRED'
  | 'MINT_SIGNATURE_REQUIRED'
  | 'DESTINATION_PENDING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED'
  | string;

export interface CctpBridgeTransfer {
  id: string;
  status: CctpTransferStatus;
  signingRequest?: CctpSigningRequest | null;
  sourceTxHash?: string | null;
  approvalTxHash?: string | null;
  destinationTxHash?: string | null;
  direction?: CctpBridgeDirection;
  error?: string | null;
  amount?: string;
  fast?: boolean;
  evmAddress?: string;
  stellarAddress?: string;
  sourceChain?: string;
  destinationChain?: string;
  idempotencyKey?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface CctpCreateBridgeRequest {
  direction?: CctpBridgeDirection;
  evmAddress: string;
  stellarAddress: string;
  amount: string;
  sourceChain?: string;
  destinationChain?: string;
  fast?: boolean;
  idempotencyKey?: string;
}

export type CctpBridgePayload = CctpCreateBridgeRequest;

export interface StandardBridgeError {
  error: {
    code: string;
    message: string;
  };
}

export function validateEvmAddress(address?: string): {
  valid: boolean;
  normalized?: string;
  error?: string;
} {
  if (!address || typeof address !== 'string' || !address.trim()) {
    return { valid: false, error: 'EVM address is required' };
  }
  const trimmed = address.trim();
  if (!isAddress(trimmed)) {
    return { valid: false, error: 'Invalid EVM address format' };
  }
  try {
    const checksummed = getAddress(trimmed);
    return { valid: true, normalized: checksummed };
  } catch {
    return { valid: false, error: 'Invalid EVM checksum address' };
  }
}

export function validateStellarAddress(address?: string): { valid: boolean; error?: string } {
  if (!address || typeof address !== 'string' || !address.trim()) {
    return { valid: false, error: 'Stellar address is required' };
  }
  const trimmed = address.trim();
  if (
    !trimmed.startsWith('G') ||
    trimmed.length !== 56 ||
    !StrKey.isValidEd25519PublicKey(trimmed)
  ) {
    return { valid: false, error: 'Invalid Stellar public key (must be G... 56 characters)' };
  }
  return { valid: true };
}

export function validateUsdcAmount(amount?: string): { valid: boolean; error?: string } {
  if (!amount || typeof amount !== 'string' || !amount.trim()) {
    return { valid: false, error: 'Amount is required' };
  }
  const trimmed = amount.trim();
  // Strictly string/BigNumber format, positive, max 6 decimal places, no floats / scientific notation
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) {
    return { valid: false, error: 'amount must be a positive USDC amount with at most 6 decimals' };
  }
  const num = parseFloat(trimmed);
  if (isNaN(num) || num <= 0) {
    return { valid: false, error: 'amount must be a positive USDC amount with at most 6 decimals' };
  }
  return { valid: true };
}

export function formatBridgeError(err: any): StandardBridgeError {
  if (
    err &&
    typeof err === 'object' &&
    err.error &&
    typeof err.error === 'object' &&
    err.error.code &&
    err.error.message
  ) {
    return { error: { code: String(err.error.code), message: String(err.error.message) } };
  }
  const message =
    err?.response?.data?.message ||
    err?.data?.message ||
    err?.message ||
    (typeof err === 'string' ? err : 'Bridge operation failed');

  const lowerMsg = String(message).toLowerCase();
  let code = 'BRIDGE_ERROR';

  if (
    lowerMsg.includes('reject') ||
    lowerMsg.includes('cancel') ||
    lowerMsg.includes('declined') ||
    lowerMsg.includes('denied')
  ) {
    code = 'USER_REJECTED';
  } else if (lowerMsg.includes('amount') || lowerMsg.includes('decimals')) {
    code = 'INVALID_AMOUNT';
  } else if (
    lowerMsg.includes('evm') ||
    lowerMsg.includes('stellar') ||
    lowerMsg.includes('address')
  ) {
    code = 'INVALID_ADDRESS';
  } else if (lowerMsg.includes('revert') || lowerMsg.includes('failed')) {
    code = 'TX_FAILED';
  } else if (err?.statusCode || err?.status) {
    code = `HTTP_${err?.statusCode || err?.status}`;
  }

  return { error: { code, message: String(message) } };
}

export function generateCctpIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getCctpChainConfig(
  network?: 'mainnet' | 'testnet',
  selectedChainId?: number | string
) {
  const current = network || getCurrentNetwork();
  const matched = CCTP_SUPPORTED_EVM_CHAINS.find(c => {
    const netConfig = c[current];
    return Number(netConfig.chainId) === Number(selectedChainId);
  });

  if (matched) {
    return {
      nativeChainKey: matched.symbol,
      chainId: matched[current].chainId,
      sourceChainKey: matched[current].sourceChainKey,
      network: current,
      name: matched.name,
      explorerUrl: matched[current].explorerUrl,
      rpcUrl: matched[current].rpcUrl,
    };
  }

  // Default to Ethereum / Sepolia
  return {
    nativeChainKey: 'ETH',
    chainId: current === 'testnet' ? 11155111 : 1,
    sourceChainKey: current === 'testnet' ? 'sepolia' : 'ethereum',
    network: current,
    name: current === 'testnet' ? 'Sepolia' : 'Ethereum',
    explorerUrl: current === 'testnet' ? 'https://sepolia.etherscan.io' : 'https://etherscan.io',
    rpcUrl:
      current === 'testnet'
        ? 'https://ethereum-sepolia-rpc.publicnode.com'
        : 'https://eth.llamarpc.com',
  };
}

export async function getCctpBridgeQuote(
  params: CctpBridgeQuoteRequest,
  signal?: AbortSignal
): Promise<CctpBridgeQuote> {
  const evmVal = validateEvmAddress(params.evmAddress);
  if (!evmVal.valid) throw new Error(evmVal.error);

  const stellarVal = validateStellarAddress(params.stellarAddress);
  if (!stellarVal.valid) throw new Error(stellarVal.error);

  const amountVal = validateUsdcAmount(params.amount);
  if (!amountVal.valid) throw new Error(amountVal.error);

  const isStellarSource = params.direction === 'STELLAR_TO_EVM';
  const defaultEvmChain = getCurrentNetwork() === 'testnet' ? 'sepolia' : 'ethereum';

  const payload: Record<string, any> = {
    direction: params.direction || 'EVM_TO_STELLAR',
    evmAddress: evmVal.normalized || params.evmAddress.trim(),
    stellarAddress: params.stellarAddress.trim(),
    amount: params.amount.trim(),
    sourceChain: params.sourceChain || params.destinationChain || defaultEvmChain,
    fast: isStellarSource ? false : params.fast !== undefined ? params.fast : false,
  };

  const res = await fetchApiResponseFromProxy<CctpBridgeQuote>(
    '/bridge/quote',
    'POST',
    payload,
    1,
    false,
    signal
  );
  return res.data;
}

export async function createCctpBridge(
  params: CctpCreateBridgeRequest
): Promise<CctpBridgeTransfer> {
  const evmVal = validateEvmAddress(params.evmAddress);
  if (!evmVal.valid) throw new Error(evmVal.error);

  const stellarVal = validateStellarAddress(params.stellarAddress);
  if (!stellarVal.valid) throw new Error(stellarVal.error);

  const amountVal = validateUsdcAmount(params.amount);
  if (!amountVal.valid) throw new Error(amountVal.error);

  const isStellarSource = params.direction === 'STELLAR_TO_EVM';
  const defaultEvmChain = getCurrentNetwork() === 'testnet' ? 'sepolia' : 'ethereum';

  const payload: Record<string, any> = {
    direction: params.direction || 'EVM_TO_STELLAR',
    evmAddress: evmVal.normalized || params.evmAddress.trim(),
    stellarAddress: params.stellarAddress.trim(),
    amount: params.amount.trim(),
    sourceChain: params.sourceChain || params.destinationChain || defaultEvmChain,
    fast: isStellarSource ? false : params.fast !== undefined ? params.fast : false,
  };

  if (isStellarSource) {
    payload.idempotencyKey = params.idempotencyKey || generateCctpIdempotencyKey();
  } else if (params.idempotencyKey) {
    payload.idempotencyKey = params.idempotencyKey;
  }

  const res = await fetchApiResponseFromProxy<CctpBridgeTransfer>('/bridge', 'POST', payload);
  return res.data;
}

/**
 * Resume From Already Broadcast Source Tx
 * Informs backend that the source chain transaction (EVM or Stellar) has been broadcasted by the client wallet.
 */
export async function submitCctpSourceTx(
  transferId: string,
  txHash: string
): Promise<CctpBridgeTransfer> {
  const res = await fetchApiResponseFromProxy<CctpBridgeTransfer>(
    `/bridge/${transferId}/source-tx`,
    'POST',
    {
      txHash,
    }
  );
  return res.data;
}

export async function submitCctpApprovalTx(
  transferId: string,
  txHash: string
): Promise<CctpBridgeTransfer> {
  const res = await fetchApiResponseFromProxy<CctpBridgeTransfer>(
    `/bridge/${transferId}/approval-tx`,
    'POST',
    {
      txHash,
    }
  );
  return res.data;
}

/**
 * Informs backend that the destination chain transaction (e.g. Stellar mint) has been broadcasted by the client wallet.
 */
export async function submitCctpDestinationTx(
  transferId: string,
  txHash: string
): Promise<CctpBridgeTransfer> {
  const res = await fetchApiResponseFromProxy<CctpBridgeTransfer>(
    `/bridge/${transferId}/destination-tx`,
    'POST',
    {
      txHash,
    }
  );
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
