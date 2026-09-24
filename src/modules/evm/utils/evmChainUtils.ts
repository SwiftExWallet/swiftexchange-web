import { getChainById, isEvmChain } from './Chainregistry';

/**
 * Parses a chain ID from the raw value returned by `eth_chainId`.
 *
 * The EIP-1193 spec mandates a hex string (e.g. "0x89" for Polygon 137),
 * but some wallets — especially WalletConnect-based ones — return a plain
 * decimal string ("137"). Blindly calling `parseInt(value, 16)` on "137"
 * gives 311 (treating it as hexadecimal), which causes spurious chain-switch
 * failures. This helper handles both formats safely.
 */
export function parseRawChainId(raw: string | number): number {
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
  const s = String(raw).trim();
  if (s.startsWith('0x') || s.startsWith('0X')) {
    const n = parseInt(s, 16);
    return isNaN(n) ? 0 : n;
  }
  const n = parseInt(s, 10);
  return isNaN(n) ? 0 : n;
}

/**
 * Determines whether an error thrown by wallet_switchEthereumChain indicates
 * that the chain is unrecognized / has not been added to the wallet yet.
 *
 * Different wallets and RPC wrappers report this in different ways:
 * - Standard EIP-1193: error.code === 4902
 * - MetaMask wrapped JSON-RPC: error.code === -32603 with message 'Unrecognized chain ID...'
 * - Wrapped errors: error.data?.code === 4902 or error.data?.originalError?.code === 4902
 * - Fallback: text search for known chain-not-added keywords
 */
export function isChainNotAddedError(error: any): boolean {
  if (!error) return false;
  if (
    error.code === 4902 ||
    error.data?.code === 4902 ||
    error.data?.originalError?.code === 4902
  ) {
    return true;
  }

  const msg = (
    (typeof error.message === 'string' ? error.message : '') +
    ' ' +
    (typeof error.data?.message === 'string' ? error.data.message : '') +
    ' ' +
    (typeof error.data?.originalError?.message === 'string' ? error.data.originalError.message : '')
  ).toLowerCase();

  return (
    msg.includes('4902') ||
    msg.includes('unrecognized chain') ||
    msg.includes('wallet_addethereumchain') ||
    msg.includes('chain not added') ||
    msg.includes('unknown chain') ||
    msg.includes('could not find chain') ||
    msg.includes('has not been added') ||
    msg.includes('try adding the chain')
  );
}

const inFlightSwitchRequests = new Map<string, Promise<void>>();

export async function switchOrAddChain(provider: any, chainId: number | string): Promise<void> {
  if (!provider) {
    throw new Error('No EVM provider found');
  }

  if (!isEvmChain(chainId)) {
    console.warn(`[switchOrAddChain] Skipping chain switch for non-EVM chain: ${chainId}`);
    return;
  }

  const targetChain = getChainById(chainId);
  if (!targetChain) {
    throw new Error(`Chain config not found for chainId: ${chainId}`);
  }

  const numChainId =
    typeof chainId === 'string' && chainId.startsWith('0x')
      ? parseInt(chainId, 16)
      : Number(chainId);
  const hexChainId = `0x${numChainId.toString(16)}`;

  // Deduplicate concurrent in-flight switch requests for the same chain ID
  const flightKey = hexChainId.toLowerCase();
  const existingRequest = inFlightSwitchRequests.get(flightKey);
  if (existingRequest) {
    return existingRequest;
  }

  const switchPromise = (async () => {
    console.info(
      `[EVM:ChainSwitch] [${targetChain.networkType.toUpperCase()}] Switching active chain to Chain ${numChainId} (${targetChain.name})`
    );

    // WalletConnect UniversalProvider exposes setDefaultChain to switch the
    // active chain. We call it but do NOT return early — we also send
    // wallet_switchEthereumChain so the wallet's UI reflects the switch and
    // subsequent RPC calls are routed to the correct chain.
    if (typeof provider.setDefaultChain === 'function') {
      try {
        provider.setDefaultChain(`eip155:${numChainId}`, targetChain.rpcUrl);
      } catch (e) {
        console.warn('[switchOrAddChain] setDefaultChain failed (non-fatal):', e);
      }
    }

    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexChainId }],
      });
    } catch (error: any) {
      if (isChainNotAddedError(error)) {
        console.info(
          `[EVM:ChainSwitch] [${targetChain.networkType.toUpperCase()}] Requesting wallet_addEthereumChain for Chain ${numChainId} (${targetChain.name})`
        );

        // Strictly sanitize EIP-3085 parameters:
        // nativeCurrency must ONLY contain { name, symbol, decimals }.
        // Extra properties (logoURI, coingeckoId, address) trigger schema validation errors in MetaMask.
        const cleanNativeCurrency = {
          name: targetChain.nativeCurrency?.name || targetChain.name || 'POL',
          symbol: targetChain.nativeCurrency?.symbol || targetChain.symbol || 'POL',
          decimals: Number(targetChain.nativeCurrency?.decimals) || 18,
        };

        const cleanRpcUrls = Array.from(
          new Set(
            [
              targetChain.rpcUrl,
              ...(Array.isArray(targetChain.rpcUrls) ? targetChain.rpcUrls : []),
              ...(Array.isArray(targetChain.fallbackRpcUrls) ? targetChain.fallbackRpcUrls : []),
            ].filter(
              (url): url is string => typeof url === 'string' && url.trim().startsWith('http')
            )
          )
        );

        const cleanBlockExplorerUrls = [targetChain.blockExplorerUrl].filter(
          (url): url is string => typeof url === 'string' && url.trim().startsWith('http')
        );

        try {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: hexChainId,
                chainName: targetChain.name,
                nativeCurrency: cleanNativeCurrency,
                rpcUrls: cleanRpcUrls.length > 0 ? cleanRpcUrls : [targetChain.rpcUrl],
                blockExplorerUrls:
                  cleanBlockExplorerUrls.length > 0 ? cleanBlockExplorerUrls : undefined,
              },
            ],
          });

          // Some wallets add the network without automatically switching to it.
          // Try switching now that the chain has been added.
          try {
            await provider.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: hexChainId }],
            });
          } catch {
            // Non-fatal if the wallet already activated the chain upon addition
          }
        } catch (addError: any) {
          throw new Error(`Failed to add network: ${addError.message || addError}`);
        }
      } else if (
        // Genuine method-not-supported on WalletConnect bridges
        error.code === -32601 ||
        /method.*not.*found|not.*supported/i.test(error.message ?? '')
      ) {
        console.warn(
          '[switchOrAddChain] wallet_switchEthereumChain not supported by this provider (likely WalletConnect). ' +
            'Proceeding — setDefaultChain was already called.'
        );
      } else {
        throw error;
      }
    }
  })().finally(() => {
    inFlightSwitchRequests.delete(flightKey);
  });

  inFlightSwitchRequests.set(flightKey, switchPromise);
  return switchPromise;
}
