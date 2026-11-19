import { getChainById, isEvmChain } from '../../../utils/Chainregistry';
import { isStellar } from './swapAssetUtils';

export type SwapProvider = 'uniswap' | 'fusion' | 'fusion_plus' | 'near_intent' | 'unsupported';

export interface SelectProviderParams {
  fromChain?: number | string | null;
  toChain?: number | string | null;
  fromAsset?: any;
  toAsset?: any;
  gaslessEnabled?: boolean;
}

/**
 * Checks whether a chainId represents a valid EVM chain (numeric chainId > 0 or in chain registry).
 */
export function isValidEvmChain(chainId: number | string | null | undefined): boolean {
  if (!chainId) return false;
  if (typeof chainId === 'number') {
    return chainId > 0;
  }
  const num = Number(chainId);
  if (!isNaN(num) && num > 0) {
    return true;
  }
  // If string, check if chain exists in registry and passes isEvmChain
  const chain = getChainById(chainId);
  return Boolean(chain && isEvmChain(chainId));
}

/**
 * Pure function to select swap provider based solely on routing configuration:
 * 1. EVM -> EVM same chain, gasless OFF -> 'uniswap'
 * 2. EVM -> EVM same chain, gasless ON  -> 'fusion'
 * 3. EVM -> EVM cross-chain             -> 'fusion_plus'
 * 4. EVM <-> Stellar (both directions)  -> 'near_intent'
 * 5. Everything else                    -> 'unsupported' (Never fallback)
 *
 * Auth tokens, wallet connection, balances, or user addresses must NOT influence provider selection.
 */
export function selectProvider(params: SelectProviderParams): SwapProvider {
  const { fromChain, toChain, gaslessEnabled = false } = params;

  if (!fromChain || !toChain) {
    return 'unsupported';
  }

  const isFromEvm = isValidEvmChain(fromChain);
  const isToEvm = isValidEvmChain(toChain);
  const isFromStellar = isStellar(fromChain);
  const isToStellar = isStellar(toChain);

  // 1 & 2. EVM -> EVM same chain
  if (isFromEvm && isToEvm && String(fromChain) === String(toChain)) {
    return gaslessEnabled ? 'fusion' : 'uniswap';
  }

  // 3. EVM -> EVM cross-chain
  if (isFromEvm && isToEvm && String(fromChain) !== String(toChain)) {
    return 'fusion_plus';
  }

  // 4. EVM <-> Stellar (both directions)
  if ((isFromEvm && isToStellar) || (isFromStellar && isToEvm)) {
    return 'near_intent';
  }

  // 5. Default: unsupported
  return 'unsupported';
}

/**
 * Checks whether the chosen provider requires proxy authorization.
 */
export function isProxyProvider(provider: SwapProvider): boolean {
  return provider === 'fusion' || provider === 'fusion_plus';
}
