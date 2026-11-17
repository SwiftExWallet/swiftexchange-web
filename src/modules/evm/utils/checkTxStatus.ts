import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { type NetworkType, findChain } from './Chainregistry';
import { CHAINS } from './assetmanagement/chains';
import { RPC_URLS } from './assetmanagement/constants';
import { rpcManager } from './rpcProvider';

export interface TxStatusResult {
  status: boolean;
  isConfirmed: boolean;
  message?: string;
  chain?: string;
  reqStatus?: string;
}

/**
 * Checks transaction confirmation on-chain directly via decentralized RPC providers.
 * Completely eliminates any third-party Blockscout or external explorer HTTP dependencies.
 */
export const checkTxStatus = async (
  txHash: string,
  chainIdentifier: string | number,
  network?: string
): Promise<TxStatusResult | null> => {
  if (!txHash || !chainIdentifier) return null;

  try {
    const currentNetwork: NetworkType =
      (network as NetworkType) || (useWalletStore.getState().network as NetworkType) || 'mainnet';

    let chainId: number | string | undefined;
    let rpcUrls: string[] = [];

    // 1. Try finding in Chainregistry
    const chainConfig = findChain(String(chainIdentifier), currentNetwork);
    if (chainConfig) {
      chainId = chainConfig.chainId;
      if (chainConfig.rpcUrls && chainConfig.rpcUrls.length > 0) {
        rpcUrls = chainConfig.rpcUrls;
      }
    }

    // 2. Fallback to CHAINS / RPC_URLS lookup
    if (!rpcUrls || rpcUrls.length === 0) {
      const upperIdentifier = String(chainIdentifier).toUpperCase();
      const normalizedKey = upperIdentifier === 'BNB' ? 'BSC' : upperIdentifier;
      const chainDef =
        (CHAINS as Record<string, any>)[normalizedKey] ||
        Object.values(CHAINS).find(
          (c: any) =>
            String(c.chainId) === String(chainIdentifier) ||
            c.symbol?.toUpperCase() === upperIdentifier ||
            c.name?.toUpperCase() === upperIdentifier
        );

      if (chainDef) {
        chainId = chainDef.chainId;
        const mappedRpcList = (RPC_URLS as Record<string, string[]>)[normalizedKey];
        if (mappedRpcList && mappedRpcList.length > 0) {
          rpcUrls = mappedRpcList;
        } else if (chainDef.RPC) {
          rpcUrls = [chainDef.RPC];
        }
      }
    }

    if (!chainId || rpcUrls.length === 0) {
      return null;
    }

    // Direct JSON-RPC getTransactionReceipt check
    const receipt = await rpcManager.fetchWithFallback(
      chainId,
      rpcUrls,
      async provider => await provider.getTransactionReceipt(txHash)
    );

    if (receipt) {
      const isSuccess = receipt.status === 1;
      return {
        status: isSuccess,
        isConfirmed: true,
        message: isSuccess ? 'success' : 'failed',
        chain: String(chainIdentifier),
        reqStatus: isSuccess ? 'ok' : 'failed',
      };
    }

    return {
      status: false,
      isConfirmed: false,
      message: 'pending',
      chain: String(chainIdentifier),
      reqStatus: 'pending',
    };
  } catch (err) {
    console.error(`Failed to check tx status for ${txHash} on ${chainIdentifier}:`, err);
    return null;
  }
};
